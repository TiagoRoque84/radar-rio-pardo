import { NextRequest, NextResponse } from "next/server";
import {
  extractListingActNumber,
  type OfficialActKind,
} from "@/lib/collectors/dioe-parser";
import {
  fetchOfficialActListing,
  fetchVerifiedOfficialActText,
} from "@/lib/collectors/dioe-reader";
import { detectAndMaskPersonalData } from "@/lib/privacy/lgpd-sanitizer";
import { probeOfficialEditionPdf } from "@/lib/collectors/dioe-pdf-probe";
import { scanOfficialPdfForAct } from "@/lib/collectors/dioe-pdf-text";

/**
 * Preview-only operational diagnostic; never reads/writes the database.
 * No arbitrary URLs and no raw HTML or personal data are returned.
 * IMPORTANT: remove this temporary endpoint before merging into main.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind") ?? "Decretos";
  if (kind !== "Decretos" && kind !== "Leis" && kind !== "Portarias") {
    return NextResponse.json({ error: "Tipo de ato inválido." }, { status: 400 });
  }

  const base = {
    source: "Imprensa Oficial Municipal",
    kind: kind as OfficialActKind,
    collected: false,
    databaseAccess: false,
  };

  try {
    const listing = await fetchOfficialActListing(kind, {
      maxItems: 3,
      maxBytes: 1_500_000,
      timeoutMs: 8000,
    });

    const inspect = request.nextUrl.searchParams.get("inspect") === "1";
    const samples = inspect ? listing.items.map(item => ({
      title: detectAndMaskPersonalData(item.title).sanitizedText.slice(0, 210),
      numberFromListing: extractListingActNumber(item.title),
      publicationDate: item.publicationDate.toISOString().slice(0, 10),
      editionNumber: item.editionNumber,
      editionUrl: item.editionUrl,
      textUrl: item.textUrl,
    })) : undefined;

    let detailCheck: {
      checkedEdition: string;
      status: "HEADING_VERIFIED" | "EDITION_MATCHED_ONLY" | "NOT_VERIFIED";
      verifiedActNumber: string | null;
      verifiedActDate: string | null;
    } | undefined;
    if (inspect) {
      const sample = listing.items.find(item => item.textUrl !== null);
      if (sample) {
        let verified: Awaited<ReturnType<typeof fetchVerifiedOfficialActText>> = null;
        try {
          verified = await fetchVerifiedOfficialActText(sample, { timeoutMs: 5000 });
        } catch { /* explicit failed validation below */ }
        detailCheck = {
          checkedEdition: sample.editionNumber,
          status: verified
            ? verified.verifiedActNumber && verified.verifiedActDate
              ? "HEADING_VERIFIED" : "EDITION_MATCHED_ONLY"
            : "NOT_VERIFIED",
          verifiedActNumber: verified?.verifiedActNumber ?? null,
          verifiedActDate: verified?.verifiedActDate?.toISOString().slice(0, 10) ?? null,
        };
      }
    }

    // Opt-in single-PDF signature check. Never exposes PDF text, bytes or
    // connects to the database; intentionally only one document per call.
    const checkPdf = request.nextUrl.searchParams.get("pdf") === "1";
    const firstPdf = checkPdf
      ? listing.items.find(item => item.textUrl === null) ?? listing.items[0]
      : undefined;
    let pdfCheck: Awaited<ReturnType<typeof probeOfficialEditionPdf>> | null = null;
    if (firstPdf) {
      try {
        pdfCheck = await probeOfficialEditionPdf(firstPdf, { timeoutMs: 7000 });
      } catch {
        pdfCheck = { checkedEdition: firstPdf.editionNumber, status: "PDF_STREAM_UNAVAILABLE" };
      }
    }

    // Only an explicit opt-in scans the edition PDF's text layer.
    // No database access; no raw text is ever returned.
    let pdfTextCheck: Awaited<ReturnType<typeof scanOfficialPdfForAct>> | null = null;
    const pdfMode = request.nextUrl.searchParams.get("pdf");
    if (pdfMode === "2" || pdfMode === "3" || pdfMode === "4") {
      const selected = listing.items.find(item => item.textUrl === null) ?? listing.items[0];
      if (selected) {
        pdfTextCheck = await scanOfficialPdfForAct(selected, {
          timeoutMs: 9000,
          inspectPageSpan: pdfMode === "3" || pdfMode === "4",
          inspectTextSegment: pdfMode === "4",
        });
      }
    }

    return NextResponse.json({
      ...base,
      ...(inspect ? { samples, detailCheck: detailCheck ?? null } : {}),
      ...(checkPdf ? { pdfCheck } : {}),
      ...(pdfTextCheck ? { pdfTextCheck } : {}),
      status: listing.items.length ? "VALID_LIST" : "NO_VALID_ROWS",
      validItems: listing.items.length,
      bytesRead: listing.bytesRead,
      partialRead: listing.hitByteLimit,
      stoppedAfterTarget: listing.stoppedAfterTarget,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const http = detail.match(/^OFFICIAL_SOURCE_HTTP_(\d{3})$/);
    const status =
      http ? "HTTP_BLOCK_OR_ERROR" :
      error instanceof Error && error.name === "AbortError" ? "TIMEOUT" :
      /^(?:LISTING_BYTE_LIMIT|Listagem não identificada)/.test(detail) ? "UNRECOGNIZED_HTML" :
      "NETWORK_ERROR";
    return NextResponse.json({
      ...base,
      status,
      ...(http ? { httpStatus: Number(http[1]) } : {}),
    }, { headers: { "Cache-Control": "no-store" } });
  }
}
