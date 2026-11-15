import type { ListedOfficialAct, OfficialActKind } from "./dioe-parser";
import { extractListingActNumber } from "./dioe-parser";
import { isMatchingEditionPdf } from "./dioe-pdf-probe";
import { RADAR_USER_AGENT } from "./types";
import { identifyOfficialActPageSpan, type OfficialPdfPage, type OfficialActPageSpan } from "./dioe-pdf-boundaries";
import {
  prepareOfficialActTextSegment,
  type PreparedActSegment,
  type SegmentDiagnostic,
} from "./dioe-pdf-segment";

// Maximum download for one explicitly requested preview diagnostic.
// Keep a strict cap; PDF parsing also allocates memory beyond file size.
const MAX_PDF_BYTES = 12_000_000;
const MAX_PAGE_COUNT = 30;
const MAX_SCAN_PAGES = 8;
const MAX_PAGE_TEXT_CHARS = 40_000;

export type PdfTextScanStatus =
  | "ACT_MATCHED"
  | "ACT_NOT_FOUND_IN_SCAN"
  | "NO_TEXT_LAYER"
  | "NUMBER_NOT_FOUND"
  | "PDF_URL_MISMATCH"
  | "PDF_HTTP_ERROR"
  | "PDF_TOO_LARGE"
  | "PDF_TOO_MANY_PAGES"
  | "PDF_NOT_PDF"
  | "PDF_PARSE_ERROR";

export interface PdfTextScan {
  status: PdfTextScanStatus;
  editionNumber: string;
  expectedActNumber: string | null;
  pageCount?: number;
  pagesScanned?: number;
  matchingPages?: number[];
  bytesDownloaded?: number;
  declaredBytes?: number;
  limitBytes?: number;
  httpStatus?: number;
  pageSpanCheck?: OfficialActPageSpan;
  segmentCheck?: SegmentDiagnostic;
  /** Stable diagnostic stage; never exposes raw exception messages or server paths. */
  failureStage?: "DOWNLOAD" | "WORKER_INIT" | "PARSER_IMPORT" | "PDF_INIT" | "GET_INFO" | "GET_TEXT" | "CLEANUP";
  /** Never send actual original PDF text to diagnostics. */
  textContentReturned: false;
  databaseAccess: false;
  collected: false;
}

export interface CachedEditionPdfPages {
  status: PdfTextScanStatus;
  pageCount?: number;
  pagesScanned?: number;
  pages?: OfficialPdfPage[];
  bytesDownloaded?: number;
  declaredBytes?: number;
  limitBytes?: number;
  httpStatus?: number;
  failureStage?: PdfTextScan["failureStage"];
}

export interface ScanPdfTextOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  inspectPageSpan?: boolean;
  inspectTextSegment?: boolean;
  pdfPageCache?: Map<string, CachedEditionPdfPages>;
}

export interface ExtractedPdfActForReview {
  scan: PdfTextScan;
  textForReview: string | null;
  verifiedActNumber: string | null;
  verifiedActDate: Date | null;
}

function normalise(input: string) {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").toUpperCase();
}

export function pageMentionsOfficialAct(
  text: string,
  kind: OfficialActKind,
  actNumber: string
): boolean {
  if (!/^\d{1,6}$/.test(actNumber)) return false;
  const label = kind === "Decretos" ? "DECRETO" : kind === "Portarias" ? "PORTARIA" : "LEI";
  const digits = actNumber.split("").join("[.\\s]*");
  const normalized = normalise(text);
  // A text mention alone is NOT proof that the page contains the act's
  // complete text: this is a candidate page for editorial checking.
  const pattern = new RegExp(
    "\\b" + label + "\\s*(?:N\\s*[º°O.]?\\s*)?" + digits + "(?!\\d)", "i"
  );
  return pattern.test(normalized);
}

async function fetchAndCacheEditionPdfPages(
  item: ListedOfficialAct,
  options: ScanPdfTextOptions
): Promise<CachedEditionPdfPages> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 9000);
  let bytes = 0;
  let failureStage: NonNullable<PdfTextScan["failureStage"]> = "DOWNLOAD";
  try {
    const response = await (options.fetchImpl ?? fetch)(item.editionUrl, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": RADAR_USER_AGENT,
        Accept: "application/pdf",
      },
    });
    if (!response.ok) {
      return { status: "PDF_HTTP_ERROR", httpStatus: response.status };
    }
    if (response.url && new URL(response.url).toString() !== new URL(item.editionUrl).toString()) {
      return { status: "PDF_URL_MISMATCH" };
    }
    const declared = response.headers.get("content-length");
    if (declared && /^\d+$/.test(declared) && Number(declared) > MAX_PDF_BYTES) {
      return {
        status: "PDF_TOO_LARGE",
        declaredBytes: Number(declared),
        limitBytes: MAX_PDF_BYTES,
        bytesDownloaded: 0,
      };
    }
    const mime = response.headers.get("content-type");
    if (mime && !/^(?:application\/pdf|application\/octet-stream)(?:\s*;|$)/i.test(mime)) {
      return { status: "PDF_NOT_PDF" };
    }
    if (!response.body) return { status: "PDF_PARSE_ERROR" };

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let finished = false;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) { finished = true; break; }
        if (!value) continue;
        bytes += value.byteLength;
        if (bytes > MAX_PDF_BYTES) {
          return {
            status: "PDF_TOO_LARGE",
            bytesDownloaded: bytes,
            limitBytes: MAX_PDF_BYTES,
          };
        }
        chunks.push(value);
      }
    } finally {
      if (!finished) {
        try { await reader.cancel(); } catch { /* closed */ }
      }
      reader.releaseLock();
    }

    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const part of chunks) { buffer.set(part, offset); offset += part.byteLength; }
    if (!/^%PDF-[12]\.\d/.test(new TextDecoder("ascii").decode(buffer.slice(0, 8)))) {
      return { status: "PDF_NOT_PDF" };
    }

    // Next.js may need the worker registered before loading pdf-parse.
    // This is the package maintainer's recommended server-side initialization.
    failureStage = "WORKER_INIT";
    await import("pdf-parse/worker");
    failureStage = "PARSER_IMPORT";
    const { PDFParse } = await import("pdf-parse");
    failureStage = "PDF_INIT";
    const parser = new PDFParse({ data: buffer });
    try {
      failureStage = "GET_INFO";
      const info = await parser.getInfo();
      const pageCount = info.total;
      if (!Number.isInteger(pageCount) || pageCount < 1) {
        return { status: "PDF_PARSE_ERROR" };
      }
      if (pageCount > MAX_PAGE_COUNT) {
        return { status: "PDF_TOO_MANY_PAGES", pageCount };
      }

      const pagesScanned = Math.min(pageCount, MAX_SCAN_PAGES);
      let hasText = false;
      const pages: OfficialPdfPage[] = [];
      for (let page = 1; page <= pagesScanned; page++) {
        failureStage = "GET_TEXT";
        const result = await parser.getText({ partial: [page] });
        const text = result.text.slice(0, MAX_PAGE_TEXT_CHARS);
        pages.push({ pageNumber: page, text });
        if (text.trim().length > 20) hasText = true;
      }
      return {
        status: hasText ? "ACT_MATCHED" : "NO_TEXT_LAYER",
        pageCount,
        pagesScanned,
        pages: hasText ? pages : [],
        bytesDownloaded: bytes,
      };
    } finally {
      // Cleanup should not override the meaningful result or failure above.
      try { await parser.destroy(); } catch { /* already released */ }
    }
  } catch {
    return {
      status: "PDF_PARSE_ERROR",
      bytesDownloaded: bytes,
      failureStage,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runPdfActInspection(
  item: ListedOfficialAct,
  options: ScanPdfTextOptions = {}
): Promise<{ scan: PdfTextScan; prepared: PreparedActSegment | null }> {
  const base = {
    editionNumber: item.editionNumber,
    expectedActNumber: extractListingActNumber(item.title),
    textContentReturned: false as const,
    databaseAccess: false as const,
    collected: false as const,
  };
  if (!isMatchingEditionPdf(item)) {
    return { scan: { ...base, status: "PDF_URL_MISMATCH" }, prepared: null };
  }
  if (!base.expectedActNumber) {
    return { scan: { ...base, status: "NUMBER_NOT_FOUND" }, prepared: null };
  }

  const cacheKey = new URL(item.editionUrl).toString();
  let cached = options.pdfPageCache?.get(cacheKey);
  if (!cached) {
    cached = await fetchAndCacheEditionPdfPages(item, options);
    options.pdfPageCache?.set(cacheKey, cached);
  }

  if (cached.status !== "ACT_MATCHED" || !cached.pages) {
    return {
      scan: {
        ...base,
        status: cached.status,
        ...(cached.pageCount !== undefined ? { pageCount: cached.pageCount } : {}),
        ...(cached.pagesScanned !== undefined ? { pagesScanned: cached.pagesScanned } : {}),
        ...(cached.status === "NO_TEXT_LAYER" ? { matchingPages: [] } : {}),
        ...(cached.bytesDownloaded !== undefined ? { bytesDownloaded: cached.bytesDownloaded } : {}),
        ...(cached.declaredBytes !== undefined ? { declaredBytes: cached.declaredBytes } : {}),
        ...(cached.limitBytes !== undefined ? { limitBytes: cached.limitBytes } : {}),
        ...(cached.httpStatus !== undefined ? { httpStatus: cached.httpStatus } : {}),
        ...(cached.failureStage !== undefined ? { failureStage: cached.failureStage } : {}),
      },
      prepared: null,
    };
  }

  const pages = cached.pages;
  const matchingPages: number[] = [];
  for (const page of pages) {
    if (pageMentionsOfficialAct(page.text, item.kind, base.expectedActNumber)) {
      matchingPages.push(page.pageNumber);
    }
  }

  const year = item.publicationDate.getUTCFullYear();
  const pageSpanCheck =
    options.inspectPageSpan || options.inspectTextSegment
      ? identifyOfficialActPageSpan(pages, item.kind, base.expectedActNumber, year)
      : undefined;
  const prepared = options.inspectTextSegment
    ? prepareOfficialActTextSegment(pages, item.kind, base.expectedActNumber, year)
    : null;

  return {
    scan: {
      ...base,
      status: matchingPages.length ? "ACT_MATCHED" : "ACT_NOT_FOUND_IN_SCAN",
      pageCount: cached.pageCount,
      pagesScanned: cached.pagesScanned,
      matchingPages,
      ...(pageSpanCheck ? { pageSpanCheck } : {}),
      ...(prepared ? { segmentCheck: prepared.diagnostic } : {}),
      bytesDownloaded: cached.bytesDownloaded,
    },
    prepared,
  };
}

export async function scanOfficialPdfForAct(
  item: ListedOfficialAct,
  options: ScanPdfTextOptions = {}
): Promise<PdfTextScan> {
  const { scan } = await runPdfActInspection(item, options);
  return scan;
}

/**
 * Server-only helper used by the collector/admin workflow to isolate bounded
 * PDF act text for editorial review. Never invoke from public diagnostics.
 */
export async function extractOfficialPdfActForReview(
  item: ListedOfficialAct,
  options: ScanPdfTextOptions = {}
): Promise<ExtractedPdfActForReview> {
  const { scan, prepared } = await runPdfActInspection(item, {
    ...options,
    inspectPageSpan: true,
    inspectTextSegment: true,
  });

  if (
    prepared?.diagnostic.status === "SEGMENT_PREPARED_FOR_REVIEW" &&
    prepared.textForReview
  ) {
    return {
      scan,
      textForReview: prepared.textForReview,
      verifiedActNumber: prepared.verifiedActNumber,
      verifiedActDate: prepared.verifiedActDate,
    };
  }

  return {
    scan,
    textForReview: null,
    verifiedActNumber: null,
    verifiedActDate: null,
  };
}
