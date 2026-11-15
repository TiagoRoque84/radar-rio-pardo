import {
  listingUrl,
  parseOfficialActListing,
  type ListedOfficialAct,
  type OfficialActKind,
  type OfficialActText,
  parseOfficialActText,
  safeOfficialUrl,
} from "./dioe-parser";
import { RADAR_USER_AGENT } from "./types";

/**
 * Reads the first valid rows and cancels the HTTP body. The "Listar Atos"
 * source can contain years of historical rows in a single HTML document.
 * Reading response.text() allocates the entire document on the Hostinger.
 */
export interface ListingReadResult {
  items: ListedOfficialAct[];
  bytesRead: number;
  hitByteLimit: boolean;
  stoppedAfterTarget: boolean;
}

export interface ListingReadOptions {
  maxItems?: number;
  maxBytes?: number;
}

export async function readOfficialListingPrefix(
  response: Response,
  kind: OfficialActKind,
  options: ListingReadOptions = {}
): Promise<ListingReadResult> {
  if (!response.body) throw new Error("HTML_STREAM_UNAVAILABLE");

  const maxItems = Math.max(1, Math.min(options.maxItems ?? 12, 30));
  const maxBytes = Math.max(4096, Math.min(options.maxBytes ?? 1_500_000, 2_000_000));
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let html = "";
  let bytesRead = 0;
  let eof = false;
  let hitByteLimit = false;
  let stoppedAfterTarget = false;
  let lastTail = "";
  let items: ListedOfficialAct[] = [];

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        eof = true;
        break;
      }
      if (!value || value.byteLength === 0) continue;

      const remaining = maxBytes - bytesRead;
      const length = Math.min(remaining, value.byteLength);
      if (length > 0) {
        const fragment = decoder.decode(value.subarray(0, length), { stream: true });
        html += fragment;
        bytesRead += length;
        if (/cf-turnstile|g-recaptcha|recaptcha/i.test(html.slice(0, 120_000))) {
          throw new Error("OFFICIAL_SOURCE_ANTI_BOT");
        }

        // Parse only when a new row ends; incomplete UTF-8 or an unfinished
        // <tr> is never treated as a verified item.
        const scan = lastTail + fragment;
        lastTail = scan.slice(-4);
        if (/<\/tr\s*>/i.test(scan)) {
          try {
            items = parseOfficialActListing(html, kind, maxItems);
          } catch {
            // The first chunk may contain incomplete header markup.
            // Final validation below is mandatory.
          }
          if (items.length >= maxItems) {
            stoppedAfterTarget = true;
            break;
          }
        }
      }
      if (length < value.byteLength || bytesRead >= maxBytes) {
        hitByteLimit = true;
        break;
      }
    }

    // A final attempt also verifies municipality, source header and URLs,
    // and detects invalid HTML rather than reporting a false success.
    html += decoder.decode();
    items = parseOfficialActListing(html, kind, maxItems);
    if (!items.length && hitByteLimit) {
      throw new Error("LISTING_BYTE_LIMIT_NO_VALID_ROWS");
    }
    return { items, bytesRead, hitByteLimit, stoppedAfterTarget };
  } finally {
    if (!eof) {
      try { await reader.cancel(); } catch { /* connection already closed */ }
    }
    reader.releaseLock();
  }
}

export async function fetchOfficialActListing(
  kind: OfficialActKind,
  options: ListingReadOptions & {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<ListingReadResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 9000);
  try {
    const response = await (options.fetchImpl ?? fetch)(listingUrl(kind), {
      method: "GET",
      redirect: "manual", // Prevent source-controlled redirects.
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": RADAR_USER_AGENT,
        "Accept": "text/html",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });

    if (!response.ok) throw new Error("OFFICIAL_SOURCE_HTTP_" + response.status);
    const contentType = response.headers.get("content-type");
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error("OFFICIAL_SOURCE_UNEXPECTED_CONTENT_TYPE");
    }

    return await readOfficialListingPrefix(response, kind, options);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * One bounded, verified read of an official on-screen act. Missing or altered
 * source text is never treated as a complete or verified extract.
 */
export async function fetchVerifiedOfficialActText(
  item: ListedOfficialAct,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<OfficialActText | null> {
  if (!item.textUrl || !safeOfficialUrl(item.textUrl, "text")) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5500);
  const maxBytes = 240_000;
  try {
    const response = await (options.fetchImpl ?? fetch)(item.textUrl, {
      method: "GET",
      redirect: "manual", // Never follow redirects to arbitrary origins.
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": RADAR_USER_AGENT, Accept: "text/html" },
    });
    if (!response.ok || !response.body) return null;
    if (response.url && !safeOfficialUrl(response.url, "text")) return null;
    const mime = response.headers.get("content-type");
    if (mime && !/text\/html|application\/xhtml\+xml/i.test(mime)) return null;
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let html = "";
    let bytes = 0;
    let ended = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { ended = true; break; }
        if (!value) continue;
        bytes += value.byteLength;
        if (bytes > maxBytes) return null;
        html += decoder.decode(value, { stream: true });
      }
      html += decoder.decode();
    } finally {
      if (!ended) { try { await reader.cancel(); } catch { /* cancelled */ } }
      reader.releaseLock();
    }
    if (/cf-turnstile|g-recaptcha|recaptcha/i.test(html)) return null;
    return parseOfficialActText(html, item.editionNumber, {
      kind: item.kind,
      listingTitle: item.title,
    });
  } finally {
    clearTimeout(timeout);
  }
}
