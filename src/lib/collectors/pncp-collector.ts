import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  CollectionOutcome,
  CollectorContext,
  CollectorResult,
  computeContentHash,
  fetchWithTimeout,
} from "./types";
import {
  AgencyRecordRef,
  SJRP_IBGE_CODE,
  classifyMunicipalAgency,
  isSaoJoseDoRioPardo,
} from "@/lib/municipality";

/**
 * Modalidades oficiais de contratação conforme documentação do PNCP / Lei 14.133/2021.
 * O parâmetro `codigoModalidadeContratacao` é obrigatório no endpoint /v1/contratacoes/publicacao.
 */
export const DEFAULT_PNCP_MODALITIES: ReadonlyArray<{
  code: number;
  label: string;
}> = [
  { code: 6, label: "Pregão - Eletrônico" },
  { code: 8, label: "Dispensa de Licitação" },
  { code: 9, label: "Inexigibilidade" },
  { code: 4, label: "Concorrência - Eletrônica" },
  { code: 7, label: "Pregão - Presencial" },
  { code: 5, label: "Concorrência - Presencial" },
];

export const PNCP_PAGE_SIZE = 50;
export const PNCP_DEFAULT_MAX_REQUESTS_PER_RUN = 30;
export const PNCP_DEFAULT_MAX_DURATION_MS = 45000;
export const PNCP_HARD_SAFETY_PAGE_LIMIT = 200;

export const pncpItemSchema = z.object({
  numeroControlePNCP: z.string().optional(),
  numeroCompra: z.string().optional(),
  anoCompra: z.number().optional(),
  modalidadeId: z.number().optional(),
  modalidadeNome: z.string().optional(),
  objetoCompra: z.string().optional(),
  situacaoCompraNome: z.string().optional(),
  dataPublicacaoPncp: z.string().optional(),
  dataAberturaProposta: z.string().optional().nullable(),
  valorTotalEstimado: z.number().optional().nullable(),
  linkSistemaOrigem: z.string().optional().nullable(),
  orgaoEntidade: z
    .object({
      razaoSocial: z.string().optional(),
      cnpj: z.string().optional(),
      esferaId: z.string().optional(),
      poderId: z.string().optional(),
    })
    .optional(),
  unidadeOrgao: z
    .object({
      codigoIbge: z.union([z.string(), z.number()]).optional().nullable(),
      municipioNome: z.string().optional().nullable(),
      ufSigla: z.string().optional().nullable(),
      nomeUnidade: z.string().optional().nullable(),
      codigoUnidade: z.string().optional().nullable(),
    })
    .optional(),
});

export type PncpItem = z.infer<typeof pncpItemSchema>;

export const pncpResponseSchema = z.object({
  data: z.array(pncpItemSchema).optional().default([]),
  totalRegistros: z.number().optional(),
  totalPaginas: z.number().optional(),
  numeroPagina: z.number().optional(),
  paginasRestantes: z.number().optional(),
  empty: z.boolean().optional(),
});

export type PncpResponsePayload = z.infer<typeof pncpResponseSchema>;

export interface PncpCollectorConfig {
  modalities: number[];
  maxRequestsPerRun: number;
  maxDurationMs: number;
  pageSize: number;
  agencyCnpjs?: Record<string, string>;
}

export interface PncpRunOptions
  extends CollectorContext {
  configJson?: string | null;
  maxRequestsPerRun?: number;
  maxDurationMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  timeoutMs?: number;
  pageSize?: number;
  fetchImpl?: typeof fetch;
  startDate?: Date;
  endDate?: Date;
}

export function formatYmdCompact(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function buildPncpSearchUrl(params: {
  startDate: Date;
  endDate: Date;
  modalityCode: number;
  page?: number;
  pageSize?: number;
  ibgeCode?: string;
}): URL {
  const endpoint = new URL(
    "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao"
  );
  // API oficial do PNCP aceita tamanhoPagina entre 10 e 50
  const safePageSize = Math.min(50, Math.max(10, params.pageSize ?? PNCP_PAGE_SIZE));
  endpoint.searchParams.set("dataInicial", formatYmdCompact(params.startDate));
  endpoint.searchParams.set("dataFinal", formatYmdCompact(params.endDate));
  endpoint.searchParams.set(
    "codigoModalidadeContratacao",
    String(params.modalityCode)
  );
  endpoint.searchParams.set(
    "codigoMunicipioIbge",
    params.ibgeCode || SJRP_IBGE_CODE
  );
  endpoint.searchParams.set("pagina", String(params.page ?? 1));
  endpoint.searchParams.set("tamanhoPagina", String(safePageSize));
  return endpoint;
}

export function validatePncpItem(item: PncpItem): {
  valid: boolean;
  reason?: string;
  organName?: string;
} {
  const organName =
    item.orgaoEntidade?.razaoSocial?.trim() ||
    item.unidadeOrgao?.nomeUnidade?.trim() ||
    "";

  if (!organName) {
    return {
      valid: false,
      reason:
        "Item rejeitado: órgão/entidade não identificado no retorno do PNCP.",
    };
  }

  const municipalityCheck = isSaoJoseDoRioPardo({
    ibgeCode: item.unidadeOrgao?.codigoIbge ?? null,
    municipalityName: item.unidadeOrgao?.municipioNome ?? null,
    uf: item.unidadeOrgao?.ufSigla ?? null,
  });

  if (!municipalityCheck.valid) {
    return {
      valid: false,
      reason: municipalityCheck.reason,
    };
  }

  return { valid: true, organName };
}

/**
 * Classifica o órgão municipal por CNPJ oficial e nome normalizado,
 * retornando `null` quando não houver correspondência inequívoca (nunca presume Prefeitura).
 */
export function matchAgencyByOrganName(
  organName: string,
  agencies: AgencyRecordRef[],
  options?: {
    cnpj?: string | null;
    unitName?: string | null;
    esferaId?: string | null;
    poderId?: string | null;
    cnpjOverrides?: Record<string, string>;
  }
): string | null {
  const result = classifyMunicipalAgency(
    {
      organName,
      unitName: options?.unitName,
      cnpj: options?.cnpj,
      esferaId: options?.esferaId,
      poderId: options?.poderId,
    },
    agencies,
    options?.cnpjOverrides
  );

  return result.matched ? result.agencyId : null;
}

export function parsePncpModalitiesConfig(configJson?: string | null): number[] {
  if (!configJson) {
    return DEFAULT_PNCP_MODALITIES.map((m) => m.code);
  }
  try {
    const parsed = JSON.parse(configJson);
    if (
      Array.isArray(parsed?.modalidades) &&
      parsed.modalidades.length > 0 &&
      parsed.modalidades.every((n: unknown) => typeof n === "number" && n > 0)
    ) {
      return parsed.modalidades;
    }
  } catch {
    // Mantém modalidades padrão caso o JSON seja inválido
  }
  return DEFAULT_PNCP_MODALITIES.map((m) => m.code);
}

export function parsePncpConfig(configJson?: string | null): PncpCollectorConfig {
  const defaults: PncpCollectorConfig = {
    modalities: parsePncpModalitiesConfig(configJson),
    maxRequestsPerRun: PNCP_DEFAULT_MAX_REQUESTS_PER_RUN,
    maxDurationMs: PNCP_DEFAULT_MAX_DURATION_MS,
    pageSize: PNCP_PAGE_SIZE,
  };

  if (!configJson) return defaults;

  try {
    const parsed = JSON.parse(configJson);
    if (
      typeof parsed?.maxRequestsPerRun === "number" &&
      parsed.maxRequestsPerRun > 0
    ) {
      defaults.maxRequestsPerRun = Math.floor(parsed.maxRequestsPerRun);
    }
    if (typeof parsed?.maxDurationMs === "number" && parsed.maxDurationMs > 0) {
      defaults.maxDurationMs = Math.floor(parsed.maxDurationMs);
    }
    if (typeof parsed?.pageSize === "number" && parsed.pageSize >= 10) {
      defaults.pageSize = Math.min(50, Math.floor(parsed.pageSize));
    }
    if (parsed?.agencyCnpjs && typeof parsed.agencyCnpjs === "object") {
      defaults.agencyCnpjs = parsed.agencyCnpjs as Record<string, string>;
    }
  } catch {
    // Mantém valores padrão em caso de config inválida
  }

  return defaults;
}

function safeParseDate(raw?: string | null): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbortOrTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    error.name === "AbortError" ||
    msg.includes("abort") ||
    msg.includes("timeout") ||
    msg.includes("timed out")
  );
}

type PageFetchResult =
  | { kind: "OK"; payload: PncpResponsePayload }
  | { kind: "EMPTY_204" }
  | { kind: "TRANSIENT_FAILURE"; statusCode?: number; reason: string }
  | { kind: "INVALID_PAYLOAD"; reason: string }
  | { kind: "HTTP_ERROR"; statusCode: number; reason: string };

async function fetchPncpPageWithRetry(
  url: string,
  options: {
    timeoutMs: number;
    maxRetries: number;
    baseDelayMs: number;
    fetchImpl?: typeof fetch;
  },
  logs: string[],
  label: string
): Promise<PageFetchResult> {
  let attempt = 0;

  while (true) {
    try {
      const response = await fetchWithTimeout(url, {
        timeoutMs: options.timeoutMs,
        accept: "application/json",
        fetchImpl: options.fetchImpl,
      });

      if (response.status === 204) {
        return { kind: "EMPTY_204" };
      }

      if (response.status === 429 || response.status >= 500) {
        const reason = `HTTP ${response.status} ${response.statusText || ""}`.trim();
        if (attempt < options.maxRetries) {
          const retryAfterHeader = response.headers.get("retry-after");
          const parsedRetryAfter = retryAfterHeader
            ? Number(retryAfterHeader) * 1000
            : NaN;
          const delayMs =
            Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0
              ? Math.min(parsedRetryAfter, 5000)
              : options.baseDelayMs * Math.pow(2, attempt);
          logs.push(
            `${label}: ${reason} (tentativa ${attempt + 1}/${options.maxRetries + 1}) — aguardando ${delayMs}ms para nova tentativa.`
          );
          attempt += 1;
          await sleep(delayMs);
          continue;
        }
        return {
          kind: "TRANSIENT_FAILURE",
          statusCode: response.status,
          reason: `${reason} após ${attempt + 1} tentativa(s).`,
        };
      }

      if (!response.ok) {
        return {
          kind: "HTTP_ERROR",
          statusCode: response.status,
          reason: `erro HTTP ${response.status} ${response.statusText || ""}`.trim(),
        };
      }

      const rawText = await response.text();
      if (!rawText.trim()) {
        return { kind: "EMPTY_204" };
      }

      let rawJson: unknown;
      try {
        rawJson = JSON.parse(rawText);
      } catch {
        return {
          kind: "INVALID_PAYLOAD",
          reason: "resposta não é JSON válido.",
        };
      }

      const parsed = pncpResponseSchema.safeParse(rawJson);
      if (!parsed.success) {
        return {
          kind: "INVALID_PAYLOAD",
          reason: "payload fora do schema esperado do PNCP.",
        };
      }

      return { kind: "OK", payload: parsed.data };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const kindDesc = isAbortOrTimeoutError(error)
        ? "timeout na requisição"
        : `falha de rede (${msg})`;

      if (attempt < options.maxRetries) {
        const delayMs = options.baseDelayMs * Math.pow(2, attempt);
        logs.push(
          `${label}: ${kindDesc} (tentativa ${attempt + 1}/${options.maxRetries + 1}) — aguardando ${delayMs}ms para retry.`
        );
        attempt += 1;
        await sleep(delayMs);
        continue;
      }

      return {
        kind: "TRANSIENT_FAILURE",
        reason: `${kindDesc} após ${attempt + 1} tentativa(s).`,
      };
    }
  }
}

export function determineCollectorStatusAndOutcome(params: {
  itemsFound: number;
  itemsProcessed: number;
  itemsDuplicated: number;
  itemsRejected: number;
  itemsPendingClassification: number;
  errorCount: number;
  hasPendingPages: boolean;
}): { status: "SUCCESS" | "PARTIAL" | "ERROR"; outcome: CollectionOutcome } {
  const {
    itemsFound,
    itemsProcessed,
    itemsDuplicated,
    itemsRejected,
    itemsPendingClassification,
    errorCount,
    hasPendingPages,
  } = params;

  if (
    errorCount > 0 &&
    itemsFound === 0 &&
    itemsProcessed === 0 &&
    itemsDuplicated === 0 &&
    itemsPendingClassification === 0
  ) {
    return { status: "ERROR", outcome: "FAILED" };
  }

  if (hasPendingPages) {
    return { status: "PARTIAL", outcome: "PARTIAL_COMPLETION" };
  }

  if (itemsFound > 0 && itemsRejected === itemsFound) {
    return { status: "PARTIAL", outcome: "ALL_REJECTED" };
  }

  if (errorCount > 0 || itemsRejected > 0) {
    return { status: "PARTIAL", outcome: "PARTIAL_COMPLETION" };
  }

  if (itemsPendingClassification > 0 && itemsProcessed === 0 && itemsDuplicated === 0) {
    return { status: "PARTIAL", outcome: "PENDING_CLASSIFICATION" };
  }

  if (itemsPendingClassification > 0) {
    return { status: "PARTIAL", outcome: "PARTIAL_COMPLETION" };
  }

  if (itemsFound === 0) {
    return { status: "SUCCESS", outcome: "NO_RECORDS" };
  }

  if (itemsProcessed === 0 && itemsDuplicated > 0) {
    return { status: "SUCCESS", outcome: "DUPLICATES_ONLY" };
  }

  return { status: "SUCCESS", outcome: "IMPORTED" };
}

/**
 * Coletor oficial para a API Pública de Consultas do PNCP (Portal Nacional de Contratações Públicas).
 * Endpoint: https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao
 * Município: São José do Rio Pardo - SP (Código IBGE 3549706).
 */
export async function runPncpCollector(
  ctx: PncpRunOptions
): Promise<CollectorResult> {
  const startedAtMs = Date.now();
  const logs: string[] = [];
  const config = parsePncpConfig(ctx.configJson);

  const maxRequestsPerRun =
    ctx.maxRequestsPerRun ?? config.maxRequestsPerRun;
  const maxDurationMs = ctx.maxDurationMs ?? config.maxDurationMs;
  const maxRetries = ctx.maxRetries ?? 2;
  const retryBaseDelayMs = ctx.retryBaseDelayMs ?? 500;
  const timeoutMs = ctx.timeoutMs ?? 15000;
  const pageSize = Math.min(50, Math.max(10, ctx.pageSize ?? config.pageSize));
  const modalities = config.modalities;

  // Tenta retomar checkpoint pendente se pertencer ao mesmo município e janela válida
  const prev = ctx.previousCheckpoint;
  const canResume =
    Boolean(prev) &&
    prev?.incomplete === true &&
    prev?.hasPendingPages === true &&
    prev?.ibgeCode === SJRP_IBGE_CODE &&
    Array.isArray(prev?.pendingModalities) &&
    (prev.pendingModalities as unknown[]).length > 0;

  let endDate = ctx.endDate ?? new Date();
  let startDate =
    ctx.startDate ?? new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  let pendingQueue: number[] = [...modalities];
  let completedModalities: number[] = [];
  const nextPageByModality: Record<string, number> = {};

  if (canResume && prev) {
    const prevStart = safeParseDate(
      typeof prev.windowStartDate === "string" ? prev.windowStartDate : null
    );
    const prevEnd = safeParseDate(
      typeof prev.windowEndDate === "string" ? prev.windowEndDate : null
    );
    if (prevStart && prevEnd) {
      startDate = prevStart;
      endDate = prevEnd;
    }

    const validPending = (prev.pendingModalities as unknown[]).filter(
      (n): n is number => typeof n === "number" && n > 0
    );
    if (validPending.length > 0) {
      pendingQueue = validPending;
    }

    if (Array.isArray(prev.completedModalities)) {
      completedModalities = (prev.completedModalities as unknown[]).filter(
        (n): n is number => typeof n === "number" && n > 0
      );
    }

    if (prev.nextPageByModality && typeof prev.nextPageByModality === "object") {
      for (const [k, v] of Object.entries(
        prev.nextPageByModality as Record<string, unknown>
      )) {
        if (typeof v === "number" && v >= 1) {
          nextPageByModality[k] = Math.floor(v);
        }
      }
    }

    logs.push(
      `[${new Date().toISOString()}] Retomando coleta PNCP via checkpoint (IBGE ${SJRP_IBGE_CODE}). Modalidades pendentes: ${pendingQueue.join(", ")}.`
    );
  } else {
    logs.push(
      `[${new Date().toISOString()}] Iniciando coleta PNCP para São José do Rio Pardo (IBGE ${SJRP_IBGE_CODE}). Modalidades: ${modalities.join(", ")}.`
    );
  }

  const agencies = await prisma.publicAgency.findMany({
    select: { id: true, acronym: true, name: true },
  });

  let totalFound = 0;
  let totalProcessed = 0;
  let totalDuplicated = 0;
  let totalRejected = 0;
  let totalPendingClassification = 0;
  let errorCount = 0;
  let requestsExecuted = 0;
  let budgetExhausted = false;
  let hasPendingPages = false;
  const remainingModalities: number[] = [];
  const rejectionBreakdown: Record<string, number> = {};

  const addReasonCount = (reason: string) => {
    const key = reason.slice(0, 140);
    rejectionBreakdown[key] = (rejectionBreakdown[key] || 0) + 1;
  };

  for (let idx = 0; idx < pendingQueue.length; idx++) {
    const modalityCode = pendingQueue[idx];

    if (budgetExhausted) {
      remainingModalities.push(modalityCode);
      continue;
    }

    let currentPage = nextPageByModality[String(modalityCode)] ?? 1;
    let modalityFinished = false;
    const seenPageHashes = new Set<string>();

    while (!modalityFinished) {
      if (currentPage > PNCP_HARD_SAFETY_PAGE_LIMIT) {
        errorCount += 1;
        hasPendingPages = true;
        nextPageByModality[String(modalityCode)] = currentPage;
        remainingModalities.push(modalityCode);
        logs.push(
          `Modalidade ${modalityCode}: limite de segurança de páginas (${PNCP_HARD_SAFETY_PAGE_LIMIT}) atingido — checkpoint salvo na pág. ${currentPage}.`
        );
        break;
      }

      if (
        requestsExecuted >= maxRequestsPerRun ||
        Date.now() - startedAtMs >= maxDurationMs
      ) {
        budgetExhausted = true;
        hasPendingPages = true;
        nextPageByModality[String(modalityCode)] = currentPage;
        remainingModalities.push(modalityCode);
        logs.push(
          `Limite operacional de execução atingido (requisições=${requestsExecuted}/${maxRequestsPerRun}). Checkpoint salvo na modalidade ${modalityCode}, página ${currentPage}.`
        );
        break;
      }

      const endpoint = buildPncpSearchUrl({
        startDate,
        endDate,
        modalityCode,
        page: currentPage,
        pageSize,
        ibgeCode: SJRP_IBGE_CODE,
      });

      const label = `Modalidade ${modalityCode} (pág. ${currentPage})`;
      const fetchResult = await fetchPncpPageWithRetry(
        endpoint.toString(),
        {
          timeoutMs,
          maxRetries,
          baseDelayMs: retryBaseDelayMs,
          fetchImpl: ctx.fetchImpl,
        },
        logs,
        label
      );
      requestsExecuted += 1;

      if (fetchResult.kind === "EMPTY_204") {
        logs.push(`${label}: HTTP 204 (sem registros no período).`);
        delete nextPageByModality[String(modalityCode)];
        completedModalities.push(modalityCode);
        modalityFinished = true;
        continue;
      }

      if (fetchResult.kind === "TRANSIENT_FAILURE") {
        errorCount += 1;
        hasPendingPages = true;
        nextPageByModality[String(modalityCode)] = currentPage;
        remainingModalities.push(modalityCode);
        logs.push(
          `${label}: falha transitória persistente (${fetchResult.reason}). Checkpoint preservado na pág. ${currentPage}.`
        );
        break;
      }

      if (
        fetchResult.kind === "INVALID_PAYLOAD" ||
        fetchResult.kind === "HTTP_ERROR"
      ) {
        errorCount += 1;
        hasPendingPages = true;
        nextPageByModality[String(modalityCode)] = currentPage;
        remainingModalities.push(modalityCode);
        logs.push(`${label}: ${fetchResult.reason}`);
        break;
      }

      const payload = fetchResult.payload;
      const items = payload.data;

      if (
        typeof payload.numeroPagina === "number" &&
        payload.numeroPagina !== currentPage
      ) {
        logs.push(
          `${label}: aviso de paginação — API informou numeroPagina=${payload.numeroPagina}.`
        );
      }

      if (items.length === 0 || payload.empty === true) {
        logs.push(`${label}: lista vazia recebida — modalidade concluída.`);
        delete nextPageByModality[String(modalityCode)];
        completedModalities.push(modalityCode);
        modalityFinished = true;
        continue;
      }

      const pageSig = computeContentHash(
        JSON.stringify(items.map((it) => it.numeroControlePNCP ?? it))
      );
      if (seenPageHashes.has(pageSig)) {
        errorCount += 1;
        hasPendingPages = true;
        nextPageByModality[String(modalityCode)] = currentPage;
        remainingModalities.push(modalityCode);
        logs.push(
          `${label}: página repetida detectada (mesmo hash da página anterior) — loop interrompido.`
        );
        break;
      }
      seenPageHashes.add(pageSig);

      totalFound += items.length;
      logs.push(
        `${label}: ${items.length} registro(s) retornado(s)${
          typeof payload.totalPaginas === "number"
            ? ` (totalPaginas=${payload.totalPaginas}, paginasRestantes=${payload.paginasRestantes ?? "?"})`
            : ""
        }.`
      );

      for (const item of items) {
        const validation = validatePncpItem(item);
        if (!validation.valid) {
          totalRejected += 1;
          const reason = validation.reason || "Item rejeitado na validação territorial.";
          addReasonCount(reason);
          logs.push(`  [Rejeitado] ${reason}`);
          continue;
        }

        const classification = classifyMunicipalAgency(
          {
            organName: validation.organName,
            unitName: item.unidadeOrgao?.nomeUnidade ?? null,
            cnpj: item.orgaoEntidade?.cnpj ?? null,
            esferaId: item.orgaoEntidade?.esferaId ?? null,
            poderId: item.orgaoEntidade?.poderId ?? null,
            ibgeCode: item.unidadeOrgao?.codigoIbge ?? null,
            municipalityName: item.unidadeOrgao?.municipioNome ?? null,
            uf: item.unidadeOrgao?.ufSigla ?? null,
          },
          agencies,
          config.agencyCnpjs
        );

        const pncpId =
          item.numeroControlePNCP ||
          computeContentHash(JSON.stringify(item)).slice(0, 24);
        const processNumber = item.numeroCompra
          ? `${item.numeroCompra}/${item.anoCompra ?? new Date().getUTCFullYear()}`
          : pncpId;
        const officialUrl =
          item.linkSistemaOrigem && item.linkSistemaOrigem.startsWith("http")
            ? item.linkSistemaOrigem
            : `https://pncp.gov.br/app/editais?q=${encodeURIComponent(pncpId)}`;

        if (!classification.matched) {
          if (classification.status === "REJECTED_MUNICIPALITY") {
            totalRejected += 1;
            addReasonCount(classification.reason);
            logs.push(`  [Rejeitado] ${classification.reason}`);
            continue;
          }

          // Órgão não reconhecido com segurança: jamais presumir Prefeitura!
          const alreadyBidding = await prisma.biddingProcess.findUnique({
            where: { pncpId },
            select: { id: true },
          });
          if (alreadyBidding) {
            totalDuplicated += 1;
            continue;
          }

          const pendingHash = computeContentHash(`pncp-pending:${pncpId}`);
          const existingDoc = await prisma.importedDocument.findUnique({
            where: { contentHash: pendingHash },
            select: { id: true },
          });
          if (existingDoc) {
            totalDuplicated += 1;
            continue;
          }

          await prisma.importedDocument.create({
            data: {
              sourceId: ctx.sourceId,
              runId: ctx.runId,
              externalId: pncpId.slice(0, 175),
              title: `[PENDENTE DE ÓRGÃO] ${processNumber} — ${validation.organName}`.slice(
                0,
                340
              ),
              originalUrl: officialUrl.slice(0, 690),
              contentHash: pendingHash,
              mimeType: "application/json",
              extractionStatus: "PENDING_CLASSIFICATION",
              publishedAt: safeParseDate(item.dataPublicacaoPncp) ?? new Date(),
              rawText: JSON.stringify({
                pncpId,
                processNumber,
                modality: item.modalidadeNome || `Modalidade ${modalityCode}`,
                objectDescription:
                  item.objetoCompra ||
                  "Objeto não detalhado na resposta da API.",
                status: item.situacaoCompraNome || "Publicada",
                publicationDate: item.dataPublicacaoPncp || null,
                openingDate: item.dataAberturaProposta || null,
                estimatedValue:
                  typeof item.valorTotalEstimado === "number"
                    ? item.valorTotalEstimado.toFixed(2)
                    : null,
                officialUrl,
                organName: validation.organName,
                unitName: item.unidadeOrgao?.nomeUnidade || null,
                organCnpj: item.orgaoEntidade?.cnpj || null,
                classificationReason: classification.reason,
                rawItem: item,
              }),
            },
          });

          totalPendingClassification += 1;
          addReasonCount(classification.reason);
          logs.push(`  [Pendente Órgão] ${pncpId}: ${classification.reason}`);
          continue;
        }

        const targetAgencyId = classification.agencyId;
        const existing = await prisma.biddingProcess.findFirst({
          where: {
            OR: [{ pncpId }, { agencyId: targetAgencyId, processNumber }],
          },
          select: { id: true },
        });

        if (existing) {
          totalDuplicated += 1;
          continue;
        }

        const unitSuffix = item.unidadeOrgao?.nomeUnidade
          ? ` (Unidade: ${item.unidadeOrgao.nomeUnidade} — ${validation.organName})`
          : ` (Órgão: ${validation.organName})`;

        await prisma.biddingProcess.create({
          data: {
            agencyId: targetAgencyId,
            processNumber: processNumber.slice(0, 78),
            modality: (item.modalidadeNome || `Modalidade ${modalityCode}`).slice(
              0,
              118
            ),
            objectDescription: `${
              item.objetoCompra || "Objeto não detalhado na resposta da API."
            }${unitSuffix}`,
            status: (item.situacaoCompraNome || "Publicada").slice(0, 78),
            publicationDate: safeParseDate(item.dataPublicacaoPncp),
            openingDate: safeParseDate(item.dataAberturaProposta),
            estimatedValue:
              typeof item.valorTotalEstimado === "number"
                ? item.valorTotalEstimado.toFixed(2)
                : null,
            officialUrl: officialUrl.slice(0, 690),
            pncpId,
          },
        });
        totalProcessed += 1;
      }

      const hasMore =
        typeof payload.paginasRestantes === "number" &&
        payload.paginasRestantes > 0
          ? true
          : typeof payload.totalPaginas === "number"
            ? currentPage < payload.totalPaginas
            : payload.paginasRestantes === undefined &&
                payload.totalPaginas === undefined
              ? items.length >= pageSize
              : false;

      if (hasMore) {
        currentPage += 1;
        nextPageByModality[String(modalityCode)] = currentPage;
      } else {
        delete nextPageByModality[String(modalityCode)];
        completedModalities.push(modalityCode);
        modalityFinished = true;
      }
    }
  }

  const { status, outcome } = determineCollectorStatusAndOutcome({
    itemsFound: totalFound,
    itemsProcessed: totalProcessed,
    itemsDuplicated: totalDuplicated,
    itemsRejected: totalRejected,
    itemsPendingClassification: totalPendingClassification,
    errorCount,
    hasPendingPages,
  });

  const uniqueCompleted = Array.from(new Set(completedModalities));

  logs.push(
    `Resumo PNCP (IBGE ${SJRP_IBGE_CODE}) [${status}/${outcome}]: encontrados=${totalFound}, novos=${totalProcessed}, duplicados=${totalDuplicated}, rejeitados=${totalRejected}, pendentes_orgao=${totalPendingClassification}, erros=${errorCount}, paginas_pendentes=${hasPendingPages}, requisicoes=${requestsExecuted}.`
  );

  return {
    status,
    outcome,
    itemsFound: totalFound,
    itemsProcessed: totalProcessed,
    itemsDuplicated: totalDuplicated,
    itemsRejected: totalRejected,
    itemsPendingClassification: totalPendingClassification,
    rejectionBreakdown,
    hasPendingPages,
    errorCount,
    logText: logs.join("\n"),
    checkpoint: {
      ibgeCode: SJRP_IBGE_CODE,
      incomplete: hasPendingPages,
      hasPendingPages,
      outcome,
      windowStartDate: startDate.toISOString(),
      windowEndDate: endDate.toISOString(),
      modalitiesChecked: modalities,
      completedModalities: uniqueCompleted,
      pendingModalities: remainingModalities,
      nextPageByModality,
      requestsExecuted,
      rejectedItems: totalRejected,
      pendingClassificationItems: totalPendingClassification,
      rejectionBreakdown,
      lastConsultedAt: new Date().toISOString(),
    },
  };
}
