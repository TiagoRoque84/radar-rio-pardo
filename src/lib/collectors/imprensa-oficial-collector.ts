import { prisma } from "@/lib/prisma";
import {
  CollectorContext,
  CollectorResult,
  computeContentHash,
} from "./types";
import { detectAndMaskPersonalData } from "@/lib/privacy/lgpd-sanitizer";
import {
  OfficialActKind,
  ListedOfficialAct,
  extractListingActNumber,
} from "./dioe-parser";
import { fetchOfficialActListing, fetchVerifiedOfficialActText } from "./dioe-reader";
import { isMatchingEditionPdf } from "./dioe-pdf-probe";
import {
  extractOfficialPdfActForReview,
  type CachedEditionPdfPages,
  type ExtractedPdfActForReview,
  type PdfTextScan,
} from "./dioe-pdf-text";

/**
 * Coletor estruturado da seção "Listar Atos" do Diário Oficial de São José do Rio Pardo.
 * Fonte: imprensaoficialmunicipal.com.br/listaatos.php
 *
 * Leis/Decretos/Portarias são cadastrados como rascunhos para revisão.
 * Realiza tentativa limitada de extração via leitura de texto HTML (/leituratexto)
 * ou segmentação conservadora de PDF por edição (máx. 2 PDFs distintos por execução).
 * Nunca inventa dados e nunca publica automaticamente.
 */
const KINDS: OfficialActKind[] = ["Leis", "Decretos", "Portarias"];
const MAX_ITEMS_PER_KIND = 12;
const MAX_DETAIL_REQUESTS = 6;
const MAX_PDF_EDITIONS_PER_RUN = 2;
const MAX_RAW_EXCERPT_CHARS = 12_000;
const MAX_RUN_MS = 40_000;

function summaryForHtmlReview(title: string, ementa: string | null): string {
  if (ementa) {
    return "Ementa oficial (revisão obrigatória): " + ementa.slice(0, 360);
  }
  return (
    "Ato identificado na listagem oficial como \"" +
    title.slice(0, 210) +
    "\". Ainda é necessário conferir o texto integral e redigir o resumo antes da publicação."
  );
}

function summaryForPdfReview(
  item: ListedOfficialAct,
  scan: PdfTextScan
): string {
  const seg = scan.segmentCheck;
  const spanLabel =
    seg?.firstPage && seg?.lastPage
      ? seg.firstPage === seg.lastPage
        ? `Página ${seg.firstPage}`
        : `Páginas ${seg.firstPage} a ${seg.lastPage}`
      : "Páginas verificadas";
  const annexWarning =
    seg?.annexMentioned || seg?.tableLikely
      ? " ATENÇÃO: menciona anexos e/ou tabelas financeiras — conferir os quadros diretamente no PDF oficial antes de resumir."
      : "";
  return (
    `Texto extraído do PDF oficial (revisão obrigatória): ${spanLabel} da Edição nº ${item.editionNumber}.${annexWarning}`
  ).slice(0, 480);
}

function buildBoundedRawExcerpt(sanitizedText: string): string {
  if (sanitizedText.length <= MAX_RAW_EXCERPT_CHARS) {
    return sanitizedText;
  }
  const suffix =
    "\n\n[... trecho limitado para pré-visualização; consulte o PDF oficial para conferir o conteúdo integral ...]";
  return (
    sanitizedText.slice(0, MAX_RAW_EXCERPT_CHARS - suffix.length).trimEnd() + suffix
  );
}

// Todos os valores têm <= 40 caracteres para compatibilidade com @db.VarChar(40) no MySQL.
function classifyMetadataOnlyStatus(scan: PdfTextScan | null): string {
  if (!scan) return "METADATA_ONLY";
  if (scan.status === "NO_TEXT_LAYER") return "METADATA_ONLY_NO_TEXT_LAYER";
  if (scan.status === "PDF_TOO_LARGE" || scan.status === "PDF_TOO_MANY_PAGES") {
    return "METADATA_ONLY_PDF_TOO_LARGE";
  }
  if (scan.status === "PDF_HTTP_ERROR" || scan.status === "PDF_URL_MISMATCH") {
    return "METADATA_ONLY_HTTP_ERROR";
  }
  if (scan.status === "PDF_NOT_PDF" || scan.status === "PDF_PARSE_ERROR") {
    return "METADATA_ONLY_PARSE_ERROR";
  }
  if (scan.segmentCheck?.reason === "OTHER_ACT_DETECTED") {
    return "METADATA_ONLY_MIXED_TEXT";
  }
  if (scan.segmentCheck?.reason === "TEXT_LIMIT_EXCEEDED") {
    return "METADATA_ONLY_PDF_TOO_LARGE";
  }
  if (
    scan.status === "ACT_NOT_FOUND_IN_SCAN" ||
    scan.status === "NUMBER_NOT_FOUND" ||
    scan.segmentCheck?.reason === "HEADING_NOT_VERIFIED"
  ) {
    return "METADATA_ONLY_ACT_NOT_FOUND";
  }
  if (
    scan.segmentCheck?.reason === "COMPLETE_PAGE_MARKERS_NOT_FOUND" ||
    scan.segmentCheck?.reason === "IMPRINT_LINE_MISSING" ||
    scan.segmentCheck?.reason === "PAGE_NOT_AVAILABLE" ||
    scan.segmentCheck?.reason === "CONTENT_EMPTY" ||
    scan.pageSpanCheck?.status === "PAGE_MARKERS_PARTIAL" ||
    scan.pageSpanCheck?.status === "PAGE_MARKERS_NOT_FOUND"
  ) {
    return "METADATA_ONLY_INCOMPLETE_MARKERS";
  }
  return "METADATA_ONLY";
}

export interface ImprensaOficialCollectorOptions {
  onAfterExtractBeforeSave?: (info: {
    item: ListedOfficialAct;
    contentHash: string;
  }) => Promise<void>;
}

function isPrismaWriteConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2034"
  );
}

async function collectOne(
  item: ListedOfficialAct,
  ctx: CollectorContext,
  categoryId: string,
  detailBudget: { remaining: number },
  pdfState: {
    remainingEditions: number;
    attemptedUrls: Set<string>;
    pageCache: Map<string, CachedEditionPdfPages>;
  },
  logs: string[],
  options?: ImprensaOficialCollectorOptions
): Promise<"IMPORTED" | "DUPLICATE"> {
  const year = item.publicationDate.getUTCFullYear();
  const contentHash = computeContentHash(
    ["dioe-ato", item.kind, year, item.editionNumber, item.textUrl ?? "", item.title]
      .join("|")
  );

  const previous = await prisma.importedDocument.findUnique({ where: { contentHash } });
  const existingAct = previous
    ? await prisma.gazetteAct.findUnique({
        where: { contentHash },
        select: {
          id: true,
          status: true,
          reviewedById: true,
          reviewedAt: true,
          updatedAt: true,
          rawExcerpt: true,
          hasPersonalDataAlert: true,
        },
      })
    : null;

  if (previous) {
    const hasExtractedText =
      previous.rawText !== null && !previous.extractionStatus.startsWith("METADATA_ONLY");
    if (hasExtractedText) return "DUPLICATE";
    // Nunca sobrescrever atos já enviados para revisão humana ou publicados.
    if (!existingAct || existingAct.status !== "DRAFT_IMPORTED") {
      return "DUPLICATE";
    }
  }

  let extracted: Awaited<ReturnType<typeof fetchVerifiedOfficialActText>> = null;
  if (detailBudget.remaining > 0 && item.textUrl) {
    detailBudget.remaining--;
    try {
      extracted = await fetchVerifiedOfficialActText(item, { timeoutMs: 5500 });
      if (!extracted) {
        logs.push(
          item.kind + ", edição " + item.editionNumber +
          ": texto HTML não verificado; tentando validação alternativa."
        );
      }
    } catch {
      logs.push(
        item.kind + ", edição " + item.editionNumber +
        ": leitura do texto HTML indisponível."
      );
    }
  }

  let pdfExtracted: ExtractedPdfActForReview | null = null;
  if (!extracted && isMatchingEditionPdf(item)) {
    const editionKey = new URL(item.editionUrl).toString();
    const alreadyCachedOrAttempted = pdfState.attemptedUrls.has(editionKey);
    if (alreadyCachedOrAttempted || pdfState.remainingEditions > 0) {
      if (!alreadyCachedOrAttempted) {
        pdfState.remainingEditions--;
        pdfState.attemptedUrls.add(editionKey);
      }
      try {
        pdfExtracted = await extractOfficialPdfActForReview(item, {
          timeoutMs: 9000,
          pdfPageCache: pdfState.pageCache,
        });
        const seg = pdfExtracted.scan.segmentCheck;
        if (pdfExtracted.textForReview && seg?.firstPage && seg?.lastPage) {
          logs.push(
            `${item.kind}, edição ${item.editionNumber}: texto segmentado do PDF ` +
            `(págs. ${seg.firstPage}-${seg.lastPage}) preparado para revisão.`
          );
        } else {
          const detailReason = seg?.reason && seg.reason !== "NONE"
            ? `${pdfExtracted.scan.status}/${seg.reason}`
            : pdfExtracted.scan.status;
          logs.push(
            `${item.kind}, edição ${item.editionNumber}: sem extração integral do PDF (${detailReason}); manter revisão manual.`
          );
        }
      } catch {
        logs.push(
          `${item.kind}, edição ${item.editionNumber}: falha ao inspecionar PDF oficial; manter metadados.`
        );
      }
    }
  }

  const sanitizedTitleResult = detectAndMaskPersonalData(item.title);
  const sanitizedTitle = sanitizedTitleResult.sanitizedText;

  let rawTextForDb: string | null = null;
  let rawExcerptForAct: string | null = null;
  let extractionStatus = "METADATA_ONLY";
  let mimeType = item.textUrl ? "text/html" : "application/pdf";
  let summaryCandidate: string;
  let hasLgpdInBody = false;

  if (extracted) {
    mimeType = "text/html";
    extractionStatus = "EXTRACTED_HTML_FOR_REVIEW";
    const bodyLgpd = detectAndMaskPersonalData(extracted.excerpt.slice(0, 1700));
    rawTextForDb = bodyLgpd.sanitizedText;
    rawExcerptForAct = bodyLgpd.sanitizedText;
    hasLgpdInBody = bodyLgpd.hasPersonalData;
    summaryCandidate = summaryForHtmlReview(item.title, extracted.ementa);
  } else if (pdfExtracted?.textForReview) {
    mimeType = "application/pdf";
    const seg = pdfExtracted.scan.segmentCheck;
    const needsCheck = Boolean(seg?.annexMentioned || seg?.tableLikely);
    extractionStatus = needsCheck
      ? "EXTRACTED_PDF_ANNEX_CHECK"
      : "EXTRACTED_PDF_FOR_REVIEW";
    const bodyLgpd = detectAndMaskPersonalData(pdfExtracted.textForReview);
    rawTextForDb = bodyLgpd.sanitizedText;
    rawExcerptForAct = buildBoundedRawExcerpt(bodyLgpd.sanitizedText);
    hasLgpdInBody = bodyLgpd.hasPersonalData;
    summaryCandidate = summaryForPdfReview(item, pdfExtracted.scan);
  } else {
    extractionStatus = classifyMetadataOnlyStatus(pdfExtracted?.scan ?? null);
    mimeType = pdfExtracted ? "application/pdf" : "text/html";
    summaryCandidate = summaryForHtmlReview(item.title, null);
  }

  const summary = detectAndMaskPersonalData(summaryCandidate);
  const verifiedActNumber =
    extracted?.verifiedActNumber ??
    pdfExtracted?.verifiedActNumber ??
    extractListingActNumber(item.title);
  const verifiedActDate =
    extracted?.verifiedActDate ?? pdfExtracted?.verifiedActDate ?? null;
  const verifiedPageNumber =
    pdfExtracted?.textForReview ? (pdfExtracted.scan.segmentCheck?.firstPage ?? null) : null;
  const hasPersonalDataAlert =
    Boolean(existingAct?.hasPersonalDataAlert) ||
    summary.hasPersonalData ||
    hasLgpdInBody ||
    sanitizedTitleResult.hasPersonalData;
  const sourceUrl = (item.textUrl || item.editionUrl).slice(0, 700);

  if (options?.onAfterExtractBeforeSave) {
    await options.onAfterExtractBeforeSave({ item, contentHash });
  }

  // Se o registro anterior ainda estava sem texto e continuou sem texto desta vez,
  // atualizamos apenas o diagnóstico (se ainda intacto) e contabilizamos duplicidade.
  if (previous && existingAct && rawTextForDb === null) {
    if (previous.extractionStatus !== extractionStatus) {
      await prisma.importedDocument.updateMany({
        where: {
          id: previous.id,
          rawText: previous.rawText,
          extractionStatus: previous.extractionStatus,
        },
        data: { extractionStatus },
      });
    }
    return "DUPLICATE";
  }

  if (previous && existingAct) {
    const wasHumanEdited =
      existingAct.reviewedById !== null || existingAct.reviewedAt !== null;
    const nextUpdatedAt = new Date(
      Math.max(Date.now(), existingAct.updatedAt.getTime() + 1)
    );

    try {
      await prisma.$transaction(async (tx) => {
        const docUpdate = await tx.importedDocument.updateMany({
          where: {
            id: previous.id,
            rawText: previous.rawText,
            extractionStatus: previous.extractionStatus,
          },
          data: {
            runId: ctx.runId,
            originalUrl: sourceUrl,
            mimeType,
            rawText: rawTextForDb,
            extractionStatus,
          },
        });
        if (docUpdate.count !== 1) {
          throw new Error("COLLECTOR_CONCURRENT_MODIFICATION");
        }

        if (wasHumanEdited) {
          // Preserva todos os campos editoriais salvos por uma pessoa (SAVE_DRAFT);
          // enriquece apenas o trecho de origem (se ausente) e o alerta LGPD.
          const actUpdate = await tx.gazetteAct.updateMany({
            where: {
              id: existingAct.id,
              status: "DRAFT_IMPORTED",
              reviewedById: existingAct.reviewedById,
              reviewedAt: existingAct.reviewedAt,
              updatedAt: existingAct.updatedAt,
            },
            data: {
              ...(existingAct.rawExcerpt === null ? { rawExcerpt: rawExcerptForAct } : {}),
              hasPersonalDataAlert: existingAct.hasPersonalDataAlert || hasLgpdInBody,
              updatedAt: nextUpdatedAt,
            },
          });
          if (actUpdate.count !== 1) {
            throw new Error("COLLECTOR_CONCURRENT_MODIFICATION");
          }
        } else {
          const actUpdate = await tx.gazetteAct.updateMany({
            where: {
              id: existingAct.id,
              status: "DRAFT_IMPORTED",
              reviewedById: null,
              reviewedAt: null,
              updatedAt: existingAct.updatedAt,
            },
            data: {
              actNumber: verifiedActNumber,
              actDate: verifiedActDate,
              pageNumber: verifiedPageNumber,
              titleSimple: sanitizedTitle.slice(0, 350),
              objectiveSummary: summary.sanitizedText,
              rawExcerpt: rawExcerptForAct,
              officialUrl: sourceUrl,
              hasPersonalDataAlert,
              updatedAt: nextUpdatedAt,
            },
          });
          if (actUpdate.count !== 1) {
            throw new Error("COLLECTOR_CONCURRENT_MODIFICATION");
          }
        }
      });
    } catch (error) {
      if (
        (error instanceof Error && error.message === "COLLECTOR_CONCURRENT_MODIFICATION") ||
        isPrismaWriteConflict(error)
      ) {
        logs.push(
          `${item.kind}, edição ${item.editionNumber}: atualização ignorada por alteração editorial concorrente durante a coleta.`
        );
        return "DUPLICATE";
      }
      throw error;
    }

    if (wasHumanEdited) {
      logs.push(
        `${item.kind}, edição ${item.editionNumber}: texto de origem enriquecido preservando rascunho editado manualmente.`
      );
    }
    return "IMPORTED";
  }

  await prisma.$transaction(async (tx) => {
    const edition = await tx.gazetteEdition.upsert({
      where: { editionNumber_year: { editionNumber: item.editionNumber, year } },
      update: {},
      create: {
        editionNumber: item.editionNumber,
        publicationDate: item.publicationDate,
        year,
        month: item.publicationDate.getUTCMonth() + 1,
        officialUrl: item.editionUrl,
        agencyId: null, // Issuing agency is not established by the municipal listing.
        status: "PENDING_REVIEW",
      },
    });

    await tx.importedDocument.create({
      data: {
        sourceId: ctx.sourceId,
        runId: ctx.runId,
        externalId: (item.kind + ":" + year + ":" + item.editionNumber + ":" + sanitizedTitle).slice(0, 180),
        title: (item.kind + ": " + sanitizedTitle).slice(0, 350),
        originalUrl: sourceUrl,
        contentHash,
        mimeType,
        rawText: rawTextForDb,
        extractionStatus,
        publishedAt: item.publicationDate,
      },
    });

    await tx.gazetteAct.create({
      data: {
        editionId: edition.id,
        categoryId,
        agencyId: null, // Legislative acts may appear in the same municipal listing.
        actNumber: verifiedActNumber,
        actDate: verifiedActDate,
        pageNumber: verifiedPageNumber,
        titleSimple: sanitizedTitle.slice(0, 350),
        objectiveSummary: summary.sanitizedText,
        rawExcerpt: rawExcerptForAct,
        financialValue: null,
        financialType: "NONE",
        officialUrl: sourceUrl,
        contentHash,
        status: "DRAFT_IMPORTED",
        aiGenerated: false,
        hasPersonalDataAlert,
      },
    });

    const total = await tx.gazetteAct.count({ where: { editionId: edition.id } });
    await tx.gazetteEdition.update({
      where: { id: edition.id },
      data: { totalActs: total },
    });
  });
  return "IMPORTED";
}

export async function runImprensaOficialCollector(
  ctx: CollectorContext,
  options?: ImprensaOficialCollectorOptions
): Promise<CollectorResult> {
  const logs: string[] = [];
  const start = Date.now();
  let found = 0;
  let imported = 0;
  let duplicates = 0;
  let errors = 0;
  let kindSuccess = 0;
  let incomplete = false;

  const pdfState = {
    remainingEditions: MAX_PDF_EDITIONS_PER_RUN,
    attemptedUrls: new Set<string>(),
    pageCache: new Map<string, CachedEditionPdfPages>(),
  };

  const categories = await prisma.gazetteActCategory.findMany({
    where: { slug: { in: ["leis", "decretos", "portarias"] } },
  });
  const categoryIds = new Map(categories.map(c => [c.slug, c.id]));

  for (const kind of KINDS) {
    if (Date.now() - start > MAX_RUN_MS) {
      incomplete = true;
      logs.push("Limite de execução atingido antes de processar " + kind + ".");
      break;
    }
    const categoryId = categoryIds.get(kind.toLowerCase());
    if (!categoryId) {
      errors++;
      logs.push("Categoria institucional não cadastrada: " + kind + ".");
      continue;
    }

    try {
      const listing = await fetchOfficialActListing(kind, {
        maxItems: MAX_ITEMS_PER_KIND,
        maxBytes: 1_500_000,
        timeoutMs: 9000,
      });
      const { items } = listing;
      if (listing.hitByteLimit) {
        incomplete = true;
        logs.push(kind + ": limite de leitura de HTML atingido; verificação parcial.");
      }
      logs.push(
        kind + ": leitura incremental de " + listing.bytesRead +
        " bytes, encerrada após os registros recentes ou o limite de segurança."
      );
      if (items.length === 0) {
        errors++;
        logs.push(kind + ": nenhuma linha estruturada válida; possível alteração no HTML.");
        continue;
      }
      kindSuccess++;
      found += items.length;

      const detailBudget = { remaining: Math.ceil(MAX_DETAIL_REQUESTS / KINDS.length) };
      for (const item of items) {
        if (Date.now() - start > MAX_RUN_MS) {
          incomplete = true;
          logs.push(kind + ": execução interrompida pelo limite de tempo.");
          break;
        }

        try {
          const result = await collectOne(
            item, ctx, categoryId, detailBudget, pdfState, logs, options
          );
          if (result === "IMPORTED") imported++;
          else duplicates++;
        } catch (error) {
          errors++;
          logs.push(
            kind + ", edição " + item.editionNumber +
            ": falha ao salvar documento (" +
            (error instanceof Error ? error.name : "erro") + ")."
          );
        }
      }
      logs.push(
        kind + ": " + items.length + " registros recentes encontrados para conferência."
      );
    } catch (error) {
      errors++;
      logs.push(
        kind + ": fonte oficial não validada (" +
        (error instanceof Error ? error.message.slice(0, 120) : "erro") + ")."
      );
    }
  }

  const partial = errors > 0 || incomplete || kindSuccess !== KINDS.length;
  logs.push(
    "A cobertura é PARCIAL: atos indexados nas listas Leis, Decretos e Portarias " +
    "(com tentativa limitada de extração via leitura de texto ou PDF por edição). " +
    "Licitações, anexos extensos e demais seções continuam exigindo conferência no PDF completo."
  );

  return {
    status: partial ? "PARTIAL" : "SUCCESS",
    outcome: partial
      ? "PARTIAL_COMPLETION"
      : imported > 0
        ? "IMPORTED"
        : found > 0
          ? "DUPLICATES_ONLY"
          : "NO_RECORDS",
    itemsFound: found,
    itemsProcessed: imported,
    itemsDuplicated: duplicates,
    errorCount: errors,
    logText: logs.join("\n"),
    hasPendingPages: incomplete,
    checkpoint: {
      checkedAt: new Date().toISOString(),
      outcome: partial ? "PARTIAL_COMPLETION" : imported ? "IMPORTED" : "DUPLICATES_ONLY",
      scope: "LISTA_ATOS_AND_BOUNDED_PDF",
      kindsProcessed: kindSuccess,
      pdfEditionsAttempted: pdfState.attemptedUrls.size,
      hasPendingPages: incomplete,
      incomplete,
      pendingNote: incomplete ? "Executar novamente após o limite de tempo." : null,
      reviewedBeforePublishing: true,
    },
  };
}
