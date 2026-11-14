import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canPublishContent } from "@/lib/auth/session";
import { newsArticleSchema } from "@/lib/validators";
import { recordAuditLog } from "@/lib/auth/audit";
import { detectAndMaskPersonalData } from "@/lib/privacy/lgpd-sanitizer";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await context.params;
  const article = await prisma.newsArticle.findUnique({
    where: { id },
    include: {
      category: true,
      author: { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true } },
      references: true,
    },
  });

  if (!article || article.deletedAt) {
    return NextResponse.json(
      { error: "Matéria não encontrada." },
      { status: 404 }
    );
  }

  return NextResponse.json({ article });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const existing = await prisma.newsArticle.findUnique({
      where: { id },
      include: { references: true },
    });

    if (!existing || existing.deletedAt) {
      return NextResponse.json(
        { error: "Matéria não encontrada." },
        { status: 404 }
      );
    }

    const body = await request.json();
    const parsed = newsArticleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos." },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (
      (data.status === "APPROVED" ||
        data.status === "PUBLISHED" ||
        data.status === "ARCHIVED") &&
      !canPublishContent(user.role)
    ) {
      return NextResponse.json(
        {
          error:
            "Apenas Editores ou Administradores podem aprovar, publicar ou arquivar matérias.",
        },
        { status: 403 }
      );
    }

    if (data.status === "PUBLISHED" && data.references.length === 0) {
      return NextResponse.json(
        {
          error:
            "É obrigatório vincular ao menos uma fonte documental oficial para publicar.",
        },
        { status: 400 }
      );
    }

    const lgpdCheck = detectAndMaskPersonalData(
      `${data.title}\n${data.summary}\n${data.content}`
    );

    const updated = await prisma.$transaction(async (tx) => {
      await tx.documentReference.deleteMany({ where: { articleId: id } });

      return tx.newsArticle.update({
        where: { id },
        data: {
          title: data.title,
          subtitle: data.subtitle || null,
          summary: data.summary,
          content: data.content,
          categoryId: data.categoryId,
          tagsJson: JSON.stringify(data.tags),
          coverImageUrl: data.coverImageUrl || null,
          status: data.status,
          featured: data.featured,
          isPublicUtilityAlert: data.isPublicUtilityAlert,
          aiUsed: data.aiUsed,
          aiDisclosure: data.aiUsed
            ? data.aiDisclosure ||
              "Conteúdo elaborado com apoio de IA e revisão editorial humana."
            : null,
          correctionNotice: data.correctionNotice || null,
          reviewerId:
            data.status === "APPROVED" || data.status === "PUBLISHED"
              ? user.id
              : existing.reviewerId,
          publishedAt:
            data.status === "PUBLISHED"
              ? existing.publishedAt ?? new Date()
              : data.status === "DRAFT"
                ? null
                : existing.publishedAt,
          scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
          references: {
            create: data.references.map((ref) => ({
              sourceName: ref.sourceName,
              officialUrl: ref.officialUrl,
              documentDate: ref.documentDate
                ? new Date(ref.documentDate)
                : null,
              referenceCode: ref.referenceCode || null,
              pageOrSection: ref.pageOrSection || null,
            })),
          },
        },
        include: { references: true, category: true },
      });
    });

    const revCount = await prisma.editorialRevision.count({
      where: { entityType: "NEWS_ARTICLE", entityId: id },
    });

    await prisma.editorialRevision.create({
      data: {
        entityType: "NEWS_ARTICLE",
        entityId: id,
        versionNumber: revCount + 1,
        snapshotJson: JSON.stringify(updated),
        notes: `Atualização de status para ${updated.status}`,
        status: updated.status,
        createdById: user.id,
      },
    });

    await recordAuditLog({
      userId: user.id,
      action: `NEWS_UPDATE_${updated.status}`,
      entityType: "NewsArticle",
      entityId: id,
      details: { title: updated.title },
    });

    return NextResponse.json({
      article: updated,
      lgpdWarning: lgpdCheck.hasPersonalData
        ? `Alerta LGPD: possíveis dados pessoais encontrados (${lgpdCheck.findings.map((f) => f.type).join(", ")}).`
        : null,
    });
  } catch (error) {
    console.error("Erro ao atualizar notícia:", error);
    return NextResponse.json(
      { error: "Erro interno ao atualizar notícia." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !canPublishContent(user.role)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const { id } = await context.params;
  await prisma.newsArticle.update({
    where: { id },
    data: { deletedAt: new Date(), status: "ARCHIVED" },
  });

  await recordAuditLog({
    userId: user.id,
    action: "NEWS_SOFT_DELETE",
    entityType: "NewsArticle",
    entityId: id,
  });

  return NextResponse.json({ ok: true });
}
