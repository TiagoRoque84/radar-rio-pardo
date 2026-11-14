import { NextRequest, NextResponse } from "next/server";
import { type OfficialActKind } from "@/lib/collectors/dioe-parser";
import { fetchOfficialActListing } from "@/lib/collectors/dioe-reader";

/**
 * Preview-only operational diagnostic; never reads/writes the database.
 * No arbitrary URLs and no raw HTML or personal data are returned.
 * IMPORTANT: remove this temporary endpoint before merging into main.
 */
export const dynamic = "force-dynamic";

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

    return NextResponse.json({
      ...base,
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
