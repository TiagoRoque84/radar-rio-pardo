import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canPublishContent } from "@/lib/auth/session";
import { podcastEpisodeSchema } from "@/lib/validators";
import { slugify } from "@/lib/formatters";
import { recordAuditLog } from "@/lib/auth/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const [programs, episodes] = await Promise.all([
    prisma.podcastProgram.findMany({ orderBy: { title: "asc" } }),
    prisma.podcastEpisode.findMany({
      include: { program: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({ programs, episodes });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = podcastEpisodeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos." },
        { status: 400 }
      );
    }

    const d = parsed.data;
    if (
      (d.status === "APPROVED" || d.status === "PUBLISHED") &&
      !canPublishContent(user.role)
    ) {
      return NextResponse.json(
        { error: "Apenas Editores ou Administradores podem publicar episódios." },
        { status: 403 }
      );
    }

    const baseSlug = slugify(`${d.episodeNumber}-${d.title}`);
    const episode = await prisma.podcastEpisode.create({
      data: {
        programId: d.programId,
        episodeNumber: d.episodeNumber,
        title: d.title,
        slug: `${baseSlug}-${Date.now().toString(36).slice(-4)}`,
        description: d.description,
        audioUrl: d.audioUrl || null,
        durationSeconds: d.durationSeconds ?? null,
        status: d.status,
        publishedAt: d.status === "PUBLISHED" ? new Date() : null,
        syntheticVoiceNotice: d.syntheticVoiceNotice,
        scriptMarkdown: d.scriptMarkdown || null,
        notebookLmPrompt: d.notebookLmPrompt || null,
        sourcesJson: JSON.stringify(d.sources),
        allowDownload: d.allowDownload,
      },
    });

    await recordAuditLog({
      userId: user.id,
      action: `PODCAST_CREATE_${d.status}`,
      entityType: "PodcastEpisode",
      entityId: episode.id,
    });

    return NextResponse.json({ episode }, { status: 201 });
  } catch (error) {
    console.error("Erro ao criar episódio:", error);
    return NextResponse.json(
      { error: "Erro ao salvar episódio de podcast." },
      { status: 500 }
    );
  }
}
