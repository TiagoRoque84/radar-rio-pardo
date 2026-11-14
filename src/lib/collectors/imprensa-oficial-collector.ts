import { prisma } from "@/lib/prisma";
import {
  CollectorContext,
  CollectorResult,
  computeContentHash,
  fetchWithTimeout,
} from "./types";
import { detectAndMaskPersonalData } from "@/lib/privacy/lgpd-sanitizer";
import {
  OfficialActKind,
  ListedOfficialAct,
  listingUrl,
  parseOfficialActListing,
  parseOfficialActText,
} from "./dioe-parser";

/**
 * Coletor estruturado da seção "Listar Atos" do Diário Oficial de São José do Rio Pardo.
 * Fonte: imprensaoficialmunicipal.com.br/listaatos.php
 *
 * Leis/Decretos/Portarias são cadastrados como rascunhos para revisão.
 * Não representa cobertura integral do PDF ou de todas as seções da edição.
 * Não gera afirmações por IA e nunca publica automaticamente.
 */
const KINDS: OfficialActKind[] = ["Leis", "Decretos", "Portarias"];
const MAX_LIST_BYTES = 2_000_000;
const MAX_ITEMS_PER_KIND = 12;
const MAX_DETAIL_REQUESTS = 6;
const MAX_RUN_MS = 40_000;

function summaryForReview(title: string, ementa: string | null): string {
  if (ementa) {
    return "Ementa oficial (revisão obrigatória): " + ementa.slice(0, 360);
  }
  return (
    "Ato identificado na listagem oficial como \"" +
    title.slice(0, 210) +
    "\". Ainda é necessário conferir o texto integral e redigir o resumo antes da publicação."
  );
}

function actNumberFromTitle(title: string): string | null {
  const match = title.match(/^(?:lei|decreto|portaria)\s*(?:n[º°o.]*)?\s*(\d[\d.,/-]*)/i)
    ?? title.match(/^(\d{3,6}(?:[.,]\d+)?)(?=\s*[-–—])/);
  return match?.[1]?.slice(0, 80) ?? null;
}

async function collectOne(
  item: ListedOfficialAct,
  ctx: CollectorContext,
  categoryId: string,
  agencyId: string | null,
  fetchDetail: boolean,
  logs: string[]
): Promise<"IMPORTED" | "DUPLICATE"> {
  const year = item.publicationDate.getUTCFullYear();
  const contentHash = computeContentHash(
    ["dioe-ato", item.kind, year, item.editionNumber, item.textUrl ?? "", item.title]
      .join("|")
  );

  const previous = await prisma.importedDocument.findUnique({ where: { contentHash } });
  if (previous) return "DUPLICATE";

  let extracted: ReturnType<typeof parseOfficialActText> = null;
  if (fetchDetail && item.textUrl) {
    try {
      const response = await fetchWithTimeout(item.textUrl, {
        timeoutMs: 5500,
        accept: "text/html",
      });
      if (response.ok) {
        const html = await response.text();
        if (html.length <= 500_000 && !/cf-turnstile|recaptcha/i.test(html)) {
          extracted = parseOfficialActText(html, item.editionNumber);
        }
      } else {
        logs.push("Detalhe oficial indisponível (HTTP " + response.status + ") para edição " + item.editionNumber + ".");
      }
    } catch {
      logs.push("Leitura do detalhe oficial não concluída para edição " + item.editionNumber + ".");
    }
  }

  const summary = detectAndMaskPersonalData(summaryForReview(item.title, extracted?.ementa ?? null));
  const excerpt = extracted
    ? detectAndMaskPersonalData(extracted.excerpt.slice(0, 1700))
    : null;
  const sanitizedTitle = detectAndMaskPersonalData(item.title).sanitizedText;

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
        agencyId,
        status: "PENDING_REVIEW",
      },
    });

    await tx.importedDocument.create({
      data: {
        sourceId: ctx.sourceId,
        runId: ctx.runId,
        externalId: (item.kind + ":" + year + ":" + item.editionNumber + ":" + sanitizedTitle).slice(0, 180),
        title: (item.kind + ": " + sanitizedTitle).slice(0, 350),
        originalUrl: (item.textUrl || item.editionUrl).slice(0, 700),
        contentHash,
        mimeType: "text/html",
        rawText: excerpt?.sanitizedText ?? null,
        extractionStatus: extracted ? "EXTRACTED_FOR_REVIEW" : "METADATA_ONLY",
        publishedAt: item.publicationDate,
      },
    });

    await tx.gazetteAct.create({
      data: {
        editionId: edition.id,
        categoryId,
        agencyId,
        actNumber: actNumberFromTitle(item.title),
        actDate: item.publicationDate,
        titleSimple: sanitizedTitle.slice(0, 350),
        objectiveSummary: summary.sanitizedText,
        rawExcerpt: excerpt?.sanitizedText ?? null,
        financialValue: null,
        financialType: "NONE",
        officialUrl: (item.textUrl || item.editionUrl).slice(0, 700),
        contentHash,
        status: "DRAFT_IMPORTED",
        aiGenerated: false,
        hasPersonalDataAlert:
          summary.hasPersonalData || Boolean(excerpt?.hasPersonalData) ||
          sanitizedTitle !== item.title,
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
  ctx: CollectorContext
): Promise<CollectorResult> {
  const logs: string[] = [];
  const start = Date.now();
  let found = 0;
  let imported = 0;
  let duplicates = 0;
  let errors = 0;
  let detailRequests = 0;
  let kindSuccess = 0;
  let incomplete = false;

  const [categories, agency] = await Promise.all([
    prisma.gazetteActCategory.findMany({
      where: { slug: { in: ["leis", "decretos", "portarias"] } },
    }),
    prisma.publicAgency.findFirst({ where: { acronym: "PMSJRP" } }),
  ]);
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
      const url = listingUrl(kind);
      const response = await fetchWithTimeout(url, {
        timeoutMs: 9000,
        accept: "text/html",
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const html = await response.text();
      if (html.length > MAX_LIST_BYTES) throw new Error("Listagem excedeu tamanho de segurança.");
      if (/cf-turnstile|recaptcha|g-recaptcha/i.test(html)) {
        throw new Error("Desafio anti-bot detectado; não foi contornado.");
      }

      const items = parseOfficialActListing(html, kind, MAX_ITEMS_PER_KIND);
      if (items.length === 0) {
        errors++;
        logs.push(kind + ": nenhuma linha estruturada válida; possível alteração no HTML.");
        continue;
      }
      kindSuccess++;
      found += items.length;

      for (const item of items) {
        if (Date.now() - start > MAX_RUN_MS) {
          incomplete = true;
          logs.push(kind + ": execução interrompida pelo limite de tempo.");
          break;
        }

        const shouldFetchDetail =
          item.textUrl !== null && detailRequests < MAX_DETAIL_REQUESTS;
        if (shouldFetchDetail) detailRequests++;
        try {
          const result = await collectOne(
            item, ctx, categoryId, agency?.id ?? null, shouldFetchDetail, logs
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
    "A cobertura é PARCIAL: somente atos indexados nas listas Leis, Decretos e Portarias. " +
    "Os PDFs completos, licitações e demais seções ainda não são extraídos."
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
      scope: "LISTA_ATOS_ONLY",
      kindsProcessed: kindSuccess,
      hasPendingPages: incomplete,
      incomplete,
      pendingNote: incomplete ? "Executar novamente após o limite de tempo." : null,
      reviewedBeforePublishing: true,
    },
  };
}
