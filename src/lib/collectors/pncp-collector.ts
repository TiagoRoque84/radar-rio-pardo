import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  CollectorContext,
  CollectorResult,
  computeContentHash,
  fetchWithTimeout,
} from "./types";

const pncpItemSchema = z.object({
  numeroControlePNCP: z.string().optional(),
  numeroCompra: z.string().optional(),
  anoCompra: z.number().optional(),
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
    })
    .optional(),
});

const pncpResponseSchema = z.object({
  data: z.array(pncpItemSchema).optional().default([]),
  totalRegistros: z.number().optional(),
});

function formatYmdCompact(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * Coletor oficial para a API Pública de Consultas do PNCP (Portal Nacional de Contratações Públicas).
 * Endpoint documentado: https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao
 * Município: São José do Rio Pardo - SP (Código IBGE 3550803).
 */
export async function runPncpCollector(
  ctx: CollectorContext
): Promise<CollectorResult> {
  const logs: string[] = [];
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  const endpoint = new URL(
    "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao"
  );
  endpoint.searchParams.set("dataInicial", formatYmdCompact(startDate));
  endpoint.searchParams.set("dataFinal", formatYmdCompact(endDate));
  endpoint.searchParams.set("codigoMunicipioIbge", "3550803");
  endpoint.searchParams.set("pagina", "1");
  endpoint.searchParams.set("tamanhoPagina", "20");

  logs.push(`[${new Date().toISOString()}] Consultando API oficial do PNCP: ${endpoint.toString()}`);

  try {
    const response = await fetchWithTimeout(endpoint.toString(), {
      timeoutMs: 15000,
      accept: "application/json",
    });

    logs.push(`Status HTTP PNCP: ${response.status}`);

    if (!response.ok) {
      return {
        status: "ERROR",
        itemsFound: 0,
        itemsProcessed: 0,
        itemsDuplicated: 0,
        errorCount: 1,
        logText: `${logs.join("\n")}\nErro ao consultar API do PNCP (HTTP ${response.status}).`,
      };
    }

    const rawJson = await response.json();
    const parsed = pncpResponseSchema.safeParse(rawJson);

    if (!parsed.success) {
      logs.push("Resposta JSON do PNCP em formato inesperado.");
      return {
        status: "PARTIAL",
        itemsFound: 0,
        itemsProcessed: 0,
        itemsDuplicated: 0,
        errorCount: 1,
        logText: logs.join("\n"),
      };
    }

    const items = parsed.data.data;
    logs.push(`Registros retornados pelo PNCP nos últimos 30 dias: ${items.length}`);

    let processed = 0;
    let duplicated = 0;

    for (const item of items) {
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
            { agencyId: ctx.agencyId, processNumber },
          ],
        },
      });

      if (existing) {
        duplicated += 1;
        continue;
      }

      const officialUrl =
        item.linkSistemaOrigem && item.linkSistemaOrigem.startsWith("http")
          ? item.linkSistemaOrigem
          : `https://pncp.gov.br/app/editais?q=${encodeURIComponent(pncpId)}`;

      await prisma.biddingProcess.create({
        data: {
          agencyId: ctx.agencyId,
          processNumber,
          modality: item.modalidadeNome || "Não especificada pelo PNCP",
          objectDescription:
            item.objetoCompra || "Objeto não detalhado na resposta da API.",
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
      processed += 1;
    }

    logs.push(
      `PNCP concluído: ${processed} novas licitações inseridas, ${duplicated} deduplicadas.`
    );

    return {
      status: "SUCCESS",
      itemsFound: items.length,
      itemsProcessed: processed,
      itemsDuplicated: duplicated,
      errorCount: 0,
      logText: logs.join("\n"),
      checkpoint: { lastConsultedAt: new Date().toISOString() },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logs.push(`Erro de rede/timeout ao acessar PNCP: ${message}`);
    return {
      status: "ERROR",
      itemsFound: 0,
      itemsProcessed: 0,
      itemsDuplicated: 0,
      errorCount: 1,
      logText: logs.join("\n"),
    };
  }
}
