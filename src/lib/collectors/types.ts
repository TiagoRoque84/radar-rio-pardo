import crypto from "node:crypto";

export interface CollectorResult {
  status: "SUCCESS" | "PARTIAL" | "ERROR";
  itemsFound: number;
  itemsProcessed: number;
  itemsDuplicated: number;
  errorCount: number;
  logText: string;
  checkpoint?: Record<string, unknown>;
}

export interface CollectorContext {
  adapterId: string;
  adapterKey: string;
  sourceId: string;
  sourceUrl: string;
  agencyId: string;
  runId: string;
}

export function computeContentHash(input: string): string {
  return crypto.createHash("sha256").update(input.trim()).digest("hex");
}

export const RADAR_USER_AGENT =
  "RadarRioPardoBot/1.0 (+https://radar.roqueconsultoriadigital.com.br; transparencia-publica)";

export async function fetchWithTimeout(
  url: string,
  options: { timeoutMs?: number; accept?: string } = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 15000
  );

  try {
    return await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": RADAR_USER_AGENT,
        Accept: options.accept ?? "text/html,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
}
