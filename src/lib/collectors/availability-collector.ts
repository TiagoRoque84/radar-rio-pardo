import {
  CollectorContext,
  CollectorResult,
  fetchWithTimeout,
} from "./types";

/**
 * Monitor ético de disponibilidade para portais que ainda dependem de análise documental
 * ou importação assistida (Câmara Municipal, Transparência da Prefeitura e Atende.net).
 */
export async function runAvailabilityCollector(
  ctx: CollectorContext
): Promise<CollectorResult> {
  const logs: string[] = [];
  logs.push(`[${new Date().toISOString()}] Verificando disponibilidade pública de ${ctx.sourceUrl}`);

  try {
    const response = await fetchWithTimeout(ctx.sourceUrl, { timeoutMs: 12000 });
    logs.push(`Resposta HTTP: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      return {
        status: "PARTIAL",
        itemsFound: 0,
        itemsProcessed: 0,
        itemsDuplicated: 0,
        errorCount: 1,
        logText: `${logs.join("\n")}\nPortal retornou código ${response.status}. Recomenda-se importação manual assistida.`,
      };
    }

    logs.push(
      "Portal acessível publicamente. Coleta automatizada detalhada pendente de validação estrutural; utilize o módulo de Importação Assistida (CSV/JSON) para carga validada."
    );

    return {
      status: "SUCCESS",
      itemsFound: 1,
      itemsProcessed: 0,
      itemsDuplicated: 0,
      errorCount: 0,
      logText: logs.join("\n"),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logs.push(`Erro ao verificar disponibilidade: ${message}`);
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
