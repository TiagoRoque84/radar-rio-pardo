import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  CollectorContext,
  CollectorResult,
  computeContentHash,
  fetchWithTimeout,
} from "./types";
import {
  SJRP_IBGE_CODE,
  isSaoJoseDoRioPardo,
  normalizeMunicipalityText,
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
export const PNCP_MAX_PAGES_PER_MODALITY = 3;

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
  endpoint.searchParams.set("tamanhoPagina", String(params.pageSize ?? PNCP_PAGE_SIZE));
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
      reason: "Item rejeitado: órgão/entidade não identificado no retorno do PNCP.",
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

export function matchAgencyByOrganName(
  organName: string,
  agencies: Array<{ id: string; acronym: string | null; name: string }>,
  fallbackAgencyId: string
): string {
  const norm = normalizeMunicipalityText(organName);

  if (norm.includes("camara")) {
    return (
      agencies.find((a) => a.acronym === "CMSJRP")?.id || fallbackAgencyId
    );
  }
  if (norm.includes("saerp") || norm.includes("agua e esgoto")) {
    return (
      agencies.find((a) => a.acronym === "SAERP")?.id || fallbackAgencyId
    );
  }
  if (
    norm.includes("feuc") ||
    norm.includes("fundacao educacional") ||
    norm.includes("faculdade")
  ) {
    return agencies.find((a) => a.acronym === "FEUC")?.id || fallbackAgencyId;
  }

  return agencies.find((a) => a.acronym === "PMSJRP")?.id || fallbackAgencyId;
}

export function parsePncpModalitiesConfig(configJson?: string | null): number[] {
  if (!configJson) {
    return DEFAULT_PNCP_MODALITIES.map((m) => m.code);
  }
  try {
    const parsed = JSON.parse(configJson);
    if (
      Array.isArray(parsed?.modalidades) &&
      parsed.modalidades.every((n: unknown) => typeof n === "number" && n > 0)
    ) {
      return parsed.modalidades;
    }
  } catch {
    // Mantém modalidades padrão caso o JSON seja inválido
  }
  return DEFAULT_PNCP_MODALITIES.map((m) => m.code);
}

/**
 * Coletor oficial para a API Pública de Consultas do PNCP (Portal Nacional de Contratações Públicas).
 * Endpoint: https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao
 * Município: São José do Rio Pardo - SP (Código IBGE 3549706).
 */
export async function runPncpCollector(
  ctx: CollectorContext & { configJson?: string | null }
): Promise<CollectorResult> {
  const logs: string[] = [];
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const modalities = parsePncpModalitiesConfig(ctx.configJson);

  const agencies = await prisma.publicAgency.findMany({
    select: { id: true, acronym: true, name: true },
  });

  logs.push(
    `[${new Date().toISOString()}] Iniciando coleta PNCP para São José do Rio Pardo (IBGE ${SJRP_IBGE_CODE}). Modalidades: ${modalities.join(", ")}.`
  );

  let totalFound = 0;
  let totalProcessed = 0;
  let totalDuplicated = 0;
  let totalRejected = 0;
  let errorCount = 0;

  for (const modalityCode of modalities) {
    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages && currentPage <= PNCP_MAX_PAGES_PER_MODALITY) {
      const endpoint = buildPncpSearchUrl({
        startDate,
        endDate,
        modalityCode,
        page: currentPage,
        pageSize: PNCP_PAGE_SIZE,
        ibgeCode: SJRP_IBGE_CODE,
      });

      try {
        const response = await fetchWithTimeout(endpoint.toString(), {
          timeoutMs: 15000,
          accept: "application/json",
        });

        if (response.status === 204) {
          logs.push(
            `Modalidade ${modalityCode} (pág. ${currentPage}): HTTP 204 (sem registros no período).`
          );
          hasMorePages = false;
          continue;
        }

        if (!response.ok) {
          errorCount += 1;
          logs.push(
            `Modalidade ${modalityCode} (pág. ${currentPage}): erro HTTP ${response.status} ${response.statusText}.`
          );
          hasMorePages = false;
          continue;
        }

        const rawText = await response.text();
        if (!rawText.trim()) {
          hasMorePages = false;
          continue;
        }

        let rawJson: unknown;
        try {
          rawJson = JSON.parse(rawText);
        } catch {
          errorCount += 1;
          logs.push(
            `Modalidade ${modalityCode} (pág. ${currentPage}): resposta não é JSON válido.`
          );
          hasMorePages = false;
          continue;
        }

        const parsed = pncpResponseSchema.safeParse(rawJson);
        if (!parsed.success) {
          errorCount += 1;
          logs.push(
            `Modalidade ${modalityCode} (pág. ${currentPage}): payload fora do schema esperado.`
          );
          hasMorePages = false;
          continue;
        }

        const items = parsed.data.data;
        totalFound += items.length;
        logs.push(
          `Modalidade ${modalityCode} (pág. ${currentPage}): ${items.length} registro(s) retornado(s).`
        );

        for (const item of items) {
          const validation = validatePncpItem(item);
          if (!validation.valid) {
            totalRejected += 1;
            logs.push(`  [Rejeitado] ${validation.reason}`);
            continue;
          }

          const targetAgencyId = matchAgencyByOrganName(
            validation.organName || "",
            agencies,
            ctx.agencyId
          );

          const pncpId =
            item.numeroControlePNCP ||
            computeContentHash(JSON.stringify(item)).slice(0, 24);
          const processNumber = item.numeroCompra
            ? `${item.numeroCompra}/${item.anoCompra ?? new Date().getFullYear()}`
            : pncpId;

          const existing = await prisma.biddingProcess.findFirst({
            where: {
              OR: [
                { pncpId },
                { agencyId: targetAgencyId, processNumber },
              ],
            },
          });

          if (existing) {
            totalDuplicated += 1;
            continue;
          }

          const officialUrl =
            item.linkSistemaOrigem && item.linkSistemaOrigem.startsWith("http")
              ? item.linkSistemaOrigem
              : `https://pncp.gov.br/app/editais?q=${encodeURIComponent(pncpId)}`;

          const unitSuffix = item.unidadeOrgao?.nomeUnidade
            ? ` (Unidade: ${item.unidadeOrgao.nomeUnidade} — ${validation.organName})`
            : ` (Órgão: ${validation.organName})`;

          await prisma.biddingProcess.create({
            data: {
              agencyId: targetAgencyId,
              processNumber,
              modality: item.modalidadeNome || `Modalidade ${modalityCode}`,
              objectDescription: `${item.objetoCompra || "Objeto não detalhado na resposta da API."}${unitSuffix}`,
              status: item.situacaoCompraNome || "Publicada",
              publicationDate: item.dataPublicacaoPncp
                ? new Date(item.dataPublicacaoPncp)
                : null,
              openingDate: item.dataAberturaProposta
                ? new Date(item.dataAberturaProposta)
                : null,
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

        const remaining = parsed.data.paginasRestantes ?? 0;
        const totalPages = parsed.data.totalPaginas ?? currentPage;
        hasMorePages =
          items.length > 0 && (remaining > 0 || currentPage < totalPages);
        currentPage += 1;
      } catch (error) {
        errorCount += 1;
        const message = error instanceof Error ? error.message : String(error);
        logs.push(
          `Modalidade ${modalityCode} (pág. ${currentPage}): falha de rede/timeout (${message}).`
        );
        hasMorePages = false;
      }
    }
  }

  logs.push(
    `Resumo PNCP (IBGE ${SJRP_IBGE_CODE}): encontrados=${totalFound}, novos=${totalProcessed}, duplicados=${totalDuplicated}, rejeitados_validacao=${totalRejected}, erros_http=${errorCount}.`
  );

  const status =
    errorCount > 0 && totalProcessed === 0 && totalFound === 0
      ? "ERROR"
      : errorCount > 0
        ? "PARTIAL"
        : "SUCCESS";

  return {
    status,
    itemsFound: totalFound,
    itemsProcessed: totalProcessed,
    itemsDuplicated: totalDuplicated,
    errorCount,
    logText: logs.join("\n"),
    checkpoint: {
      ibgeCode: SJRP_IBGE_CODE,
      modalitiesChecked: modalities,
      rejectedItems: totalRejected,
      lastConsultedAt: new Date().toISOString(),
    },
  };
}
