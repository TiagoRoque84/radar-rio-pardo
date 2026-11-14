import { prisma } from "@/lib/prisma";
import {
  CollectorContext,
  CollectorResult,
  computeContentHash,
  fetchWithTimeout,
} from "./types";
import { detectAndMaskPersonalData } from "@/lib/privacy/lgpd-sanitizer";

/**
 * Coletor ético para o Diário Oficial Eletrônico de São José do Rio Pardo:
 * https://www.imprensaoficialmunicipal.com.br/sjriopardo
 *
 * Regras seguidas:
 * - Timeout curto compatível com Cron Jobs da Hostinger.
 * - Identificação clara por User-Agent.
 * - Jamais contorna CAPTCHA ou autenticação.
 * - Salva documentos e rascunhos de edição apenas com status PENDING_REVIEW (nunca publica automaticamente).
 */
export async function runImprensaOficialCollector(
  ctx: CollectorContext
): Promise<CollectorResult> {
  const logs: string[] = [];
  logs.push(`[${new Date().toISOString()}] Iniciando verificação em ${ctx.sourceUrl}`);

  try {
    const response = await fetchWithTimeout(ctx.sourceUrl, { timeoutMs: 15000 });
    logs.push(`Status HTTP recebido: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      return {
        status: "ERROR",
        itemsFound: 0,
        itemsProcessed: 0,
        itemsDuplicated: 0,
        errorCount: 1,
        logText: `${logs.join("\n")}\nErro: Portal retornou HTTP ${response.status}. Nenhuma simulação foi feita.`,
      };
    }

    const html = await response.text();
    const lowerHtml = html.toLowerCase();

    if (
      lowerHtml.includes("captcha") ||
      lowerHtml.includes("cf-turnstile") ||
      lowerHtml.includes("recaptcha")
    ) {
      logs.push(
        "Aviso: Desafio anti-bot/CAPTCHA detectado na resposta. Execução interrompida conforme política ética."
      );
      return {
        status: "PARTIAL",
        itemsFound: 0,
        itemsProcessed: 0,
        itemsDuplicated: 0,
        errorCount: 1,
        logText: logs.join("\n"),
      };
    }

    // Extrai links públicos de edições / PDFs encontrados no HTML oficial
    const pdfMatches = Array.from(
      html.matchAll(
        /href=["']([^"']*(?:edicao|diario|imprensa|pdf|visualizar)[^"']*)["']/gi
      )
    )
      .map((m) => m[1])
      .filter((href) => !href.startsWith("javascript:") && href.length > 4);

    const uniqueLinks = Array.from(new Set(pdfMatches)).slice(0, 10);
    logs.push(`Links candidatos encontrados no HTML público: ${uniqueLinks.length}`);

    let processed = 0;
    let duplicated = 0;

    for (const rawHref of uniqueLinks) {
      let resolvedUrl: string;
      try {
        resolvedUrl = new URL(rawHref, ctx.sourceUrl).toString();
      } catch {
        continue;
      }

      const contentHash = computeContentHash(`imprensa-oficial:${resolvedUrl}`);
      const existing = await prisma.importedDocument.findUnique({
        where: { contentHash },
      });

      if (existing) {
        duplicated += 1;
        continue;
      }

      const titleMatch = rawHref.split("/").pop() || "Edição/Documento do Diário Oficial";
      const sanitizedTitle = detectAndMaskPersonalData(titleMatch).sanitizedText;

      await prisma.importedDocument.create({
        data: {
          sourceId: ctx.sourceId,
          runId: ctx.runId,
          externalId: rawHref.slice(0, 170),
          title: `Referência oficial coletada: ${sanitizedTitle}`.slice(0, 340),
          originalUrl: resolvedUrl.slice(0, 690),
          contentHash,
          mimeType: resolvedUrl.toLowerCase().endsWith(".pdf")
            ? "application/pdf"
            : "text/html",
          extractionStatus: "PENDING",
          publishedAt: new Date(),
        },
      });
      processed += 1;
    }

    logs.push(
      `Finalizado: ${processed} novos documentos registrados para revisão humana, ${duplicated} já existentes (deduplicados).`
    );

    return {
      status: "SUCCESS",
      itemsFound: uniqueLinks.length,
      itemsProcessed: processed,
      itemsDuplicated: duplicated,
      errorCount: 0,
      logText: logs.join("\n"),
      checkpoint: { checkedAt: new Date().toISOString(), linksInspected: uniqueLinks.length },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logs.push(`Falha de conexão ou timeout: ${message}`);
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
