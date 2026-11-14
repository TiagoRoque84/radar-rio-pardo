import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canPublishContent } from "@/lib/auth/session";
import { newsArticleSchema } from "@/lib/validators";
import { slugify } from "@/lib/formatters";
import { recordAuditLog } from "@/lib/auth/audit";
import { detectAndMaskPersonalData } from "@/lib/privacy/lgpd-sanitizer";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status");

  const articles = await prisma.newsArticle.findMany({
    where: {
      deletedAt: null,
      ...(status ? { status } : {}),
    },
    include: {
      category: true,
      author: { select: { id: true, name: true, role: true } },
      reviewer: { select: { id: true, name: true } },
      references: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ articles });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = newsArticleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos." },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Colaborador não pode aprovar ou publicar diretamente
    if (
      (data.status === "APPROVED" || data.status === "PUBLISHED") &&
      !canPublishContent(user.role)
    ) {
      return NextResponse.json(
        {
          error:
            "Seu perfil (Colaborador) permite apenas criar rascunhos ou enviar para revisão editorial.",
        },
        { status: 403 }
      );
    }

    // Regra editorial: notícias publicadas devem possuir ao menos uma fonte documental verificável
    if (data.status === "PUBLISHED" && data.references.length === 0) {
      return NextResponse.json(
        {
          error:
            "É obrigatório informar pelo menos uma fonte documental oficial antes de publicar uma matéria.",
        },
        { status: 400 }
      );
    }

    const lgpdCheck = detectAndMaskPersonalData(
      `${data.title}\n${data.summary}\n${data.content}`
    );

    const baseSlug = slugify(data.title) || "noticia";
    const existingSlug = await prisma.newsArticle.findUnique({
      where: { slug: baseSlug },
    });
    const finalSlug = existingSlug
      ? `${baseSlug}-${Date.now().toString(36)}`
      : baseSlug;

    const article = await prisma.newsArticle.create({
      data: {
        title: data.title,
        slug: finalSlug,
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
            "Texto elaborado com apoio de IA sob supervisão e revisão editorial humana."
          : null,
        correctionNotice: data.correctionNotice || null,
        authorId: user.id,
        reviewerId:
          data.status === "APPROVED" || data.status === "PUBLISHED"
            ? user.id
            : null,
        publishedAt: data.status === "PUBLISHED" ? new Date() : null,
        scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
        references: {
          create: data.references.map((ref) => ({
            sourceName: ref.sourceName,
            officialUrl: ref.officialUrl,
            documentDate: ref.documentDate ? new Date(ref.documentDate) : null,
            referenceCode: ref.referenceCode || null,
            pageOrSection: ref.pageOrSection || null,
          })),
        },
      },
      include: { references: true, category: true },
    });

    await prisma.editorialRevision.create({
      data: {
        entityType: "NEWS_ARTICLE",
        entityId: article.id,
        versionNumber: 1,
        snapshotJson: JSON.stringify(article),
        notes: "Criação inicial da matéria",
        status: article.status,
        createdById: user.id,
      },
    });

    await recordAuditLog({
      userId: user.id,
      action: `NEWS_CREATE_${article.status}`,
      entityType: "NewsArticle",
      entityId: article.id,
      details: { title: article.title, lgpdAlert: lgpdCheck.hasPersonalData },
    });

    return NextResponse.json(
      {
        article,
        lgpdWarning: lgpdCheck.hasPersonalData
          ? `Atenção LGPD: detectamos possíveis dados pessoais (${lgpdCheck.findings.map((f) => f.type).join(", ")}). Revise antes de publicar.`
          : null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erro ao criar notícia:", error);
    return NextResponse.json(
      { error: "Erro interno ao salvar notícia." },
      { status: 500 }
    );
  }
}
