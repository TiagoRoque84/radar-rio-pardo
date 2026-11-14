import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canPublishContent } from "@/lib/auth/session";
import { gazetteEditionSchema, gazetteActSchema } from "@/lib/validators";
import {
  gazetteBatchImportSchema,
  importGazetteBatch,
} from "@/lib/collectors/manual-importer";
import { computeContentHash } from "@/lib/collectors/types";
import { detectAndMaskPersonalData } from "@/lib/privacy/lgpd-sanitizer";
import { recordAuditLog } from "@/lib/auth/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const [editions, acts, categories, agencies] = await Promise.all([
    prisma.gazetteEdition.findMany({
      orderBy: { publicationDate: "desc" },
      take: 30,
    }),
    prisma.gazetteAct.findMany({
      include: { category: true, edition: true, agency: true },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    prisma.gazetteActCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.publicAgency.findMany({ orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({ editions, acts, categories, agencies });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const body = await request.json();

    if (body.action === "CREATE_EDITION") {
      const parsed = gazetteEditionSchema.safeParse(body.payload);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Dados inválidos." },
          { status: 400 }
        );
      }

      const pubDate = new Date(parsed.data.publicationDate);
      const edition = await prisma.gazetteEdition.create({
        data: {
          editionNumber: parsed.data.editionNumber,
          publicationDate: pubDate,
          year: pubDate.getUTCFullYear(),
          month: pubDate.getUTCMonth() + 1,
          officialUrl: parsed.data.officialUrl,
          agencyId: parsed.data.agencyId || null,
          summaryText: parsed.data.summaryText || null,
          status: "PENDING_REVIEW",
        },
      });

      await recordAuditLog({
        userId: user.id,
        action: "GAZETTE_EDITION_CREATE",
        entityType: "GazetteEdition",
        entityId: edition.id,
      });

      return NextResponse.json({ edition }, { status: 201 });
    }

    if (body.action === "CREATE_ACT") {
      const parsed = gazetteActSchema.safeParse(body.payload);
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
          { error: "Sem permissão para aprovar ou publicar atos." },
          { status: 403 }
        );
      }

      const lgpdSummary = detectAndMaskPersonalData(d.objectiveSummary);
      const lgpdExcerpt = d.rawExcerpt
        ? detectAndMaskPersonalData(d.rawExcerpt)
        : null;

      const contentHash = computeContentHash(
        `${d.editionId}:${d.actNumber || ""}:${d.titleSimple}:${d.objectiveSummary}`
      );

      const act = await prisma.gazetteAct.create({
        data: {
          editionId: d.editionId,
          categoryId: d.categoryId,
          agencyId: d.agencyId || null,
          actNumber: d.actNumber || null,
          actDate: d.actDate ? new Date(d.actDate) : null,
          pageNumber: d.pageNumber ?? null,
          titleSimple: d.titleSimple,
          objectiveSummary: lgpdSummary.sanitizedText,
          rawExcerpt: lgpdExcerpt ? lgpdExcerpt.sanitizedText : null,
          financialValue: d.financialValue || null,
          financialType: d.financialType || "NONE",
          deadlinesText: d.deadlinesText || null,
          practicalImpact: d.practicalImpact || null,
          officialUrl: d.officialUrl,
          contentHash,
          status: d.status,
          hasPersonalDataAlert:
            lgpdSummary.hasPersonalData || Boolean(lgpdExcerpt?.hasPersonalData),
          aiGenerated: d.aiGenerated,
          aiModel: d.aiModel || null,
          reviewedById:
            d.status === "APPROVED" || d.status === "PUBLISHED"
              ? user.id
              : null,
          reviewedAt:
            d.status === "APPROVED" || d.status === "PUBLISHED"
              ? new Date()
              : null,
        },
      });

      const count = await prisma.gazetteAct.count({
        where: { editionId: d.editionId },
      });
      await prisma.gazetteEdition.update({
        where: { id: d.editionId },
        data: {
          totalActs: count,
          status: d.status === "PUBLISHED" ? "PUBLISHED" : undefined,
        },
      });

      await recordAuditLog({
        userId: user.id,
        action: `GAZETTE_ACT_CREATE_${d.status}`,
        entityType: "GazetteAct",
        entityId: act.id,
      });

      return NextResponse.json({ act }, { status: 201 });
    }

    if (body.action === "BATCH_IMPORT") {
      const parsed = gazetteBatchImportSchema.safeParse(body.payload);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Lote JSON inválido." },
          { status: 400 }
        );
      }

      const result = await importGazetteBatch(parsed.data);
      await recordAuditLog({
        userId: user.id,
        action: "GAZETTE_BATCH_IMPORT",
        entityType: "GazetteEdition",
        entityId: result.editionId,
        details: result,
      });

      return NextResponse.json(result, { status: 201 });
    }

    if (body.action === "PUBLISH_ACT" || body.action === "REVIEW_ACT") {
      if (!canPublishContent(user.role)) {
        return NextResponse.json(
          { error: "Apenas Editores ou Administradores podem publicar." },
          { status: 403 }
        );
      }

      const actId = String(body.actId || "");
      const targetStatus =
        body.action === "PUBLISH_ACT" ? "PUBLISHED" : "IN_REVIEW";

      const updatedAct = await prisma.gazetteAct.update({
        where: { id: actId },
        data: {
          status: targetStatus,
          reviewedById: user.id,
          reviewedAt: new Date(),
        },
      });

      if (targetStatus === "PUBLISHED") {
        await prisma.gazetteEdition.update({
          where: { id: updatedAct.editionId },
          data: { status: "PUBLISHED" },
        });
      }

      await recordAuditLog({
        userId: user.id,
        action: `GAZETTE_ACT_${targetStatus}`,
        entityType: "GazetteAct",
        entityId: actId,
      });

      return NextResponse.json({ act: updatedAct });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("Erro na API do Diário Oficial:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno no módulo do Diário Oficial.",
      },
      { status: 500 }
    );
  }
}
