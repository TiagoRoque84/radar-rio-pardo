import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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

const AUTO_DRAFT_SUMMARY_PATTERNS = [
  /^Ementa oficial \(revisão obrigatória\):/i,
  /^Ato identificado na listagem oficial/i,
  /^Texto extraído do PDF oficial \(revisão obrigatória\):/i,
];

const rewriteImportedActSchema = z.object({
  actId: z.string().min(1, "Ato inválido."),
  titleSimple: z
    .string()
    .trim()
    .min(5, "O título deve ter pelo menos 5 caracteres.")
    .max(350, "O título deve ter no máximo 350 caracteres."),
  objectiveSummary: z
    .string()
    .trim()
    .min(10, "O resumo editorial deve ter pelo menos 10 caracteres.")
    .max(5000, "O resumo editorial deve ter no máximo 5000 caracteres."),
  actNumber: z.string().trim().max(40).optional().nullable(),
  actDate: z
    .string()
    .trim()
    .regex(/^(?:\d{4}-\d{2}-\d{2})?$/, "Data do ato inválida (use AAAA-MM-DD).")
    .optional()
    .nullable(),
  pageNumber: z.preprocess(
    (v) => (v === undefined ? undefined : v === "" || v === null ? null : v),
    z.coerce.number().int().min(1).max(500).optional().nullable()
  ),
  agencyId: z.string().trim().optional().nullable(),
  deadlinesText: z.string().trim().max(500).optional().nullable(),
  saveMode: z.enum(["SAVE_DRAFT", "SEND_TO_REVIEW"]).optional().default("SEND_TO_REVIEW"),
});

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
    prisma.publicAgency.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const contentHashes = acts
    .map((a) => a.contentHash)
    .filter((h): h is string => Boolean(h));
  const importedDocs =
    contentHashes.length > 0
      ? await prisma.importedDocument.findMany({
          where: { contentHash: { in: contentHashes } },
          select: { contentHash: true, extractionStatus: true, mimeType: true },
        })
      : [];
  const docByHash = new Map(importedDocs.map((d) => [d.contentHash, d]));

  const enrichedActs = acts.map((act) => {
    const doc = act.contentHash ? docByHash.get(act.contentHash) : undefined;
    return {
      ...act,
      extractionStatus: doc?.extractionStatus ?? null,
      mimeType: doc?.mimeType ?? null,
    };
  });

  return NextResponse.json({
    editions,
    acts: enrichedActs,
    categories,
    agencies,
  });
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

    // Um documento coletado automaticamente não é resumo editorial pronto.
    // O editor precisa reescrever/conferir o texto antes de liberar publicação.
    if (body.action === "REWRITE_IMPORTED_ACT") {
      if (!canPublishContent(user.role)) {
        return NextResponse.json({ error: "Sem permissão editorial." }, { status: 403 });
      }
      const parsed = rewriteImportedActSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Dados de revisão inválidos." },
          { status: 400 }
        );
      }
      const d = parsed.data;
      if (d.saveMode === "SEND_TO_REVIEW") {
        if (d.objectiveSummary.length < 25) {
          return NextResponse.json(
            {
              error:
                "Para enviar para IN_REVIEW, o resumo editorial deve ter pelo menos 25 caracteres.",
            },
            { status: 400 }
          );
        }
        if (AUTO_DRAFT_SUMMARY_PATTERNS.some((re) => re.test(d.objectiveSummary))) {
          return NextResponse.json(
            {
              error:
                "Reescreva e confira o resumo na fonte oficial antes de enviar para revisão final.",
            },
            { status: 400 }
          );
        }
      }

      const previous = await prisma.gazetteAct.findUnique({ where: { id: d.actId } });
      if (
        !previous ||
        (previous.status !== "DRAFT_IMPORTED" && previous.status !== "IN_REVIEW")
      ) {
        return NextResponse.json(
          { error: "Ato em rascunho/revisão não encontrado ou já finalizado." },
          { status: 409 }
        );
      }

      let nextAgencyId = previous.agencyId;
      if (d.agencyId !== undefined) {
        const cleanAgencyId = d.agencyId ? d.agencyId.trim() : null;
        if (cleanAgencyId) {
          const agencyExists = await prisma.publicAgency.findUnique({
            where: { id: cleanAgencyId },
            select: { id: true },
          });
          if (!agencyExists) {
            return NextResponse.json(
              { error: "Órgão público selecionado não existe." },
              { status: 400 }
            );
          }
          nextAgencyId = cleanAgencyId;
        } else {
          nextAgencyId = null;
        }
      }

      let nextActDate = previous.actDate;
      if (d.actDate !== undefined) {
        if (!d.actDate) {
          nextActDate = null;
        } else {
          const candidateDate = new Date(`${d.actDate}T12:00:00.000Z`);
          if (
            Number.isNaN(candidateDate.getTime()) ||
            candidateDate.toISOString().slice(0, 10) !== d.actDate
          ) {
            return NextResponse.json(
              { error: "Data do ato inválida." },
              { status: 400 }
            );
          }
          nextActDate = candidateDate;
        }
      }

      const nextActNumber =
        d.actNumber !== undefined
          ? d.actNumber
            ? d.actNumber.slice(0, 40)
            : null
          : previous.actNumber;
      const nextPageNumber =
        d.pageNumber !== undefined ? d.pageNumber : previous.pageNumber;

      const maskedTitle = detectAndMaskPersonalData(d.titleSimple);
      const maskedSummary = detectAndMaskPersonalData(d.objectiveSummary);
      const maskedDeadlines =
        d.deadlinesText !== undefined
          ? d.deadlinesText
            ? detectAndMaskPersonalData(d.deadlinesText)
            : null
          : undefined;

      const targetStatus =
        d.saveMode === "SEND_TO_REVIEW" ? "IN_REVIEW" : previous.status;

      const updated = await prisma.$transaction(async (tx) => {
        const act = await tx.gazetteAct.update({
          where: { id: d.actId },
          data: {
            actNumber: nextActNumber,
            actDate: nextActDate,
            pageNumber: nextPageNumber,
            agencyId: nextAgencyId,
            ...(maskedDeadlines !== undefined
              ? { deadlinesText: maskedDeadlines?.sanitizedText ?? null }
              : {}),
            titleSimple: maskedTitle.sanitizedText,
            objectiveSummary: maskedSummary.sanitizedText,
            status: targetStatus,
            hasPersonalDataAlert:
              previous.hasPersonalDataAlert ||
              maskedTitle.hasPersonalData ||
              maskedSummary.hasPersonalData ||
              Boolean(maskedDeadlines?.hasPersonalData),
            reviewedById: user.id,
            reviewedAt: new Date(),
          },
          include: { category: true, edition: true, agency: true },
        });

        const revCount = await tx.editorialRevision.count({
          where: { entityType: "GAZETTE_ACT", entityId: d.actId },
        });
        await tx.editorialRevision.create({
          data: {
            entityType: "GAZETTE_ACT",
            entityId: d.actId,
            versionNumber: revCount + 1,
            snapshotJson: JSON.stringify(act),
            notes:
              d.saveMode === "SEND_TO_REVIEW"
                ? "Revisão editorial concluída; enviado para IN_REVIEW."
                : "Rascunho editorial salvo mantendo status atual.",
            status: targetStatus,
            createdById: user.id,
          },
        });

        return act;
      });

      await recordAuditLog({
        userId: user.id,
        action:
          d.saveMode === "SEND_TO_REVIEW"
            ? "GAZETTE_IMPORTED_ACT_REWRITTEN"
            : "GAZETTE_IMPORTED_ACT_DRAFT_SAVED",
        entityType: "GazetteAct",
        entityId: d.actId,
        details: {
          status: targetStatus,
          actNumber: nextActNumber,
          pageNumber: nextPageNumber,
          agencyId: nextAgencyId,
        },
      });
      return NextResponse.json({ act: updated });
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

      const candidate = await prisma.gazetteAct.findUnique({
        where: { id: actId },
        select: { status: true },
      });
      if (!candidate) {
        return NextResponse.json({ error: "Ato não encontrado." }, { status: 404 });
      }
      if (candidate.status === "DRAFT_IMPORTED") {
        return NextResponse.json(
          { error: "Este ato importado requer revisão e resumo editorial antes de publicar." },
          { status: 409 }
        );
      }

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
