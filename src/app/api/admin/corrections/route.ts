import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canPublishContent } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/auth/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const requests = await prisma.correctionRequest.findMany({
    include: {
      article: { select: { id: true, title: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ requests });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canPublishContent(user.role)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const id = String(body.id || "");
    const status = String(body.status || "IN_ANALYSIS");
    const adminNotes = body.adminNotes ? String(body.adminNotes) : null;
    const publicCorrectionNote = body.publicCorrectionNote
      ? String(body.publicCorrectionNote)
      : null;

    if (!["OPEN", "IN_ANALYSIS", "RESOLVED", "REJECTED"].includes(status)) {
      return NextResponse.json({ error: "Status inválido." }, { status: 400 });
    }

    const updated = await prisma.correctionRequest.update({
      where: { id },
      data: {
        status,
        adminNotes,
        publicCorrectionNote,
        resolvedAt: status === "RESOLVED" || status === "REJECTED" ? new Date() : null,
      },
    });

    if (status === "RESOLVED" && updated.articleId && publicCorrectionNote) {
      await prisma.newsArticle.update({
        where: { id: updated.articleId },
        data: { correctionNotice: publicCorrectionNote },
      });
    }

    await recordAuditLog({
      userId: user.id,
      action: `CORRECTION_${status}`,
      entityType: "CorrectionRequest",
      entityId: id,
    });

    return NextResponse.json({ request: updated });
  } catch (error) {
    console.error("Erro ao atualizar solicitação de correção:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar solicitação." },
      { status: 500 }
    );
  }
}
