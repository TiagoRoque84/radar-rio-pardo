import type { ListedOfficialAct } from "./dioe-parser";
import { safeOfficialUrl } from "./dioe-parser";
import { RADAR_USER_AGENT } from "./types";

/**
 * Read-only PDF handshake for a single edition already validated by the
 * municipal listing. This does NOT extract or authenticate the PDF content.
 * There is no database access and no arbitrary URL parameter.
 */
export interface PdfProbe {
  status:
    | "PDF_HEADER_VERIFIED"
    | "PDF_LINK_UNAVAILABLE"
    | "PDF_URL_MISMATCH"
    | "PDF_TOO_LARGE"
    | "PDF_HTTP_ERROR"
    | "PDF_REDIRECT_UNTRUSTED"
    | "PDF_NOT_PDF"
    | "PDF_STREAM_UNAVAILABLE";
  checkedEdition: string;
  httpStatus?: number;
  contentLength?: number;
  bytesRead?: number;
}

const MAX_DECLARED_PDF_BYTES = 15_000_000;
const MAX_SIGNATURE_BYTES = 4096;
const PDF_HEADER = /^%PDF-[12]\.\d/;

export function isMatchingEditionPdf(item: ListedOfficialAct): boolean {
  const url = safeOfficialUrl(item.editionUrl, "edition");
  if (!url) return false;
  const parsed = new URL(url);
  // impressão.php links are not guaranteed to be raw PDF bytes.
  if (!/\.pdf$/i.test(parsed.pathname)) return false;
  const date = item.publicationDate.toISOString().slice(0, 10);
  const number = item.editionNumber.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  return new RegExp(
    "^/diario/sp/sao-jose-do-rio-pardo/" + date +
    "/ed-" + number + "-[^/]+\\.pdf$", "i"
  ).test(parsed.pathname);
}

export async function probeOfficialEditionPdf(
  item: ListedOfficialAct,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}
): Promise<PdfProbe> {
  const base = { checkedEdition: item.editionNumber };
  if (!safeOfficialUrl(item.editionUrl, "edition")) {
    return { ...base, status: "PDF_LINK_UNAVAILABLE" };
  }
  if (!isMatchingEditionPdf(item)) {
    return { ...base, status: "PDF_URL_MISMATCH" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 7000);
  try {
    const response = await (options.fetchImpl ?? fetch)(item.editionUrl, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "User-Agent": RADAR_USER_AGENT,
        Accept: "application/pdf",
      },
    });
    if (!response.ok) {
      return { ...base, status: "PDF_HTTP_ERROR", httpStatus: response.status };
    }
    if (response.url) {
      if (!safeOfficialUrl(response.url, "edition") ||
          new URL(response.url).pathname !== new URL(item.editionUrl).pathname) {
        return { ...base, status: "PDF_REDIRECT_UNTRUSTED" };
      }
    }

    const lengthHeader = response.headers.get("content-length");
    const contentLength = lengthHeader && /^\d+$/.test(lengthHeader)
      ? Number(lengthHeader) : undefined;
    if (contentLength !== undefined && contentLength > MAX_DECLARED_PDF_BYTES) {
      return { ...base, status: "PDF_TOO_LARGE", contentLength };
    }
    const type = response.headers.get("content-type");
    if (type && !/^(?:application\/pdf|application\/octet-stream)(?:\s*;|$)/i.test(type)) {
      return { ...base, status: "PDF_NOT_PDF", contentLength };
    }
    if (!response.body) {
      return { ...base, status: "PDF_STREAM_UNAVAILABLE", contentLength };
    }

    const reader = response.body.getReader();
    let stopped = false;
    let accumulated = new Uint8Array(0);
    try {
      while (accumulated.byteLength < 8 && accumulated.byteLength < MAX_SIGNATURE_BYTES) {
        const next = await reader.read();
        if (next.done) { stopped = true; break; }
        const chunk = next.value;
        if (!chunk) continue;
        const take = Math.min(chunk.byteLength, MAX_SIGNATURE_BYTES - accumulated.byteLength);
        const merged = new Uint8Array(accumulated.byteLength + take);
        merged.set(accumulated, 0);
        merged.set(chunk.subarray(0, take), accumulated.byteLength);
        accumulated = merged;
      }
    } finally {
      if (!stopped) {
        try { await reader.cancel(); } catch { /* already aborted */ }
      }
      reader.releaseLock();
    }

    const firstBytes = new TextDecoder("ascii").decode(accumulated.slice(0, 8));
    if (!PDF_HEADER.test(firstBytes)) {
      return { ...base, status: "PDF_NOT_PDF", contentLength, bytesRead: accumulated.byteLength };
    }
    return {
      ...base, status: "PDF_HEADER_VERIFIED", contentLength,
      bytesRead: accumulated.byteLength,
    };
  } finally {
    clearTimeout(timeout);
  }
}
