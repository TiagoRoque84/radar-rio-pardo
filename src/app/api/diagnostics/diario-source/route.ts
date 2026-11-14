import { NextRequest, NextResponse } from "next/server";
import { listingUrl, parseOfficialActListing } from "@/lib/collectors/dioe-parser";

/**
 * Diagnóstico somente leitura da fonte externa, exclusivo para previews Hostinger.
 * Nunca acessa Prisma, banco, credenciais, seeds ou endpoints administrativos.
 * Não aceita URL arbitrária e não devolve HTML/trechos originais.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!request.nextUrl.hostname.endsWith(".hostingersite.com")) {
    return NextResponse.json({ error: "Disponível apenas no preview." }, { status: 404 });
  }

  const kind = request.nextUrl.searchParams.get("kind") ?? "Decretos";
  if (kind !== "Decretos" && kind !== "Leis" && kind !== "Portarias") {
    return NextResponse.json({ error: "Tipo de ato inválido." }, { status: 400 });
  }

  const url = listingUrl(kind);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "RadarRioPardoBot/1.0 (+https://radar.roqueconsultoriadigital.com.br; transparencia-publica)",
        Accept: "text/html",
      },
    });
    if (!response.ok) {
      return NextResponse.json({
        source: "Imprensa Oficial Municipal",
        kind,
        status: "HTTP_BLOCK_OR_ERROR",
        httpStatus: response.status,
        collected: false,
        databaseAccess: false,
      }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    const body = await response.text();
    if (body.length > 1_000_000) {
      return NextResponse.json({
        source: "Imprensa Oficial Municipal", kind,
        status: "HTML_TOO_LARGE", collected: false, databaseAccess: false,
      }, { headers: { "Cache-Control": "no-store" } });
    }
    try {
      const items = parseOfficialActListing(body, kind, 3);
      return NextResponse.json({
        source: "Imprensa Oficial Municipal", kind,
        status: items.length ? "VALID_LIST" : "NO_VALID_ROWS",
        validItems: items.length,
        collected: false, databaseAccess: false,
      }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({
        source: "Imprensa Oficial Municipal", kind,
        status: "UNRECOGNIZED_HTML", collected: false, databaseAccess: false,
      }, { headers: { "Cache-Control": "no-store" } });
    }
  } catch (error) {
    return NextResponse.json({
      source: "Imprensa Oficial Municipal", kind,
      status: error instanceof Error && error.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
      collected: false, databaseAccess: false,
    }, { headers: { "Cache-Control": "no-store" } });
  } finally {
    clearTimeout(timer);
  }
}
