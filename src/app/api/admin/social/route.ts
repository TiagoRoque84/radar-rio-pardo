import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canPublishContent, getCurrentUser } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/auth/audit";

const socialDraftSchema = z.object({
  articleId: z.string().min(1),
  shortText: z.string().min(10).max(2000),
  headlineCardText: z.string().min(5).max(300),
  shareUrl: z.string().url(),
  scheduledAt: z.string().optional().nullable(),
  publishedUrl: z.string().url().optional().or(z.literal("")).nullable(),
  status: z
    .enum(["DRAFT", "SCHEDULED", "PUBLISHED_MANUALLY"])
    .default("DRAFT"),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const [drafts, publishedArticles] = await Promise.all([
    prisma.socialPostDraft.findMany({
      include: { article: { select: { id: true, title: true, slug: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.newsArticle.findMany({
      where: { status: "PUBLISHED", deletedAt: null },
      select: { id: true, title: true, slug: true, summary: true },
      orderBy: { publishedAt: "desc" },
      take: 30,
    }),
  ]);

  return NextResponse.json({ drafts, publishedArticles });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = socialDraftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos." },
        { status: 400 }
      );
    }

    const d = parsed.data;
    if (d.status !== "DRAFT" && !canPublishContent(user.role)) {
      return NextResponse.json(
        {
          error:
            "Apenas Editores ou Administradores podem agendar ou registrar publicações sociais.",
        },
        { status: 403 }
      );
    }

    const draft = await prisma.socialPostDraft.create({
      data: {
        articleId: d.articleId,
        platform: "FACEBOOK",
        shortText: d.shortText,
        headlineCardText: d.headlineCardText,
        shareUrl: d.shareUrl,
        scheduledAt: d.scheduledAt ? new Date(d.scheduledAt) : null,
        publishedUrl: d.publishedUrl || null,
        status: d.status,
      },
    });

    await recordAuditLog({
      userId: user.id,
      action: "SOCIAL_DRAFT_CREATE",
      entityType: "SocialPostDraft",
      entityId: draft.id,
    });

    return NextResponse.json({ draft }, { status: 201 });
  } catch (error) {
    console.error("Erro ao salvar rascunho social:", error);
    return NextResponse.json(
      { error: "Erro ao salvar publicação social." },
      { status: 500 }
    );
  }
}
