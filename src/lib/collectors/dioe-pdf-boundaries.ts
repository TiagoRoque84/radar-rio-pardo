import type { OfficialActKind } from "./dioe-parser";

/** Only page-level boundaries. This never proves that the text of an act has
 * been isolated from other material on the same page or legally authenticated.
 */
export interface OfficialActPageSpan {
  status: "PAGE_MARKERS_COMPLETE" | "PAGE_MARKERS_PARTIAL" | "PAGE_MARKERS_NOT_FOUND";
  startPage: number | null;
  endPage: number | null;
  declaredActPages: number | null;
  verifiedPageMarkers: number;
  scope: "PAGE_LEVEL_ONLY";
}

export interface OfficialPdfPage {
  pageNumber: number;
  text: string;
}

function normalized(value: string) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toUpperCase();
}

function markerOnPage(
  page: OfficialPdfPage,
  kind: OfficialActKind,
  actNumber: string,
  year: number
): { pageNumber: number; sequence: number; total: number } | null {
  if (!/^\d{1,6}$/.test(actNumber) || year < 2018 || year > 2100) return null;
  const label: Record<OfficialActKind, string> = {
    Decretos: "DECRETO", Leis: "LEI", Portarias: "PORTARIA",
  };
  const digits = actNumber.split("").join("[.\\s]*");
  const text = normalized(page.text);
  // D.O.S.P. explicit imprint, e.g. "Decreto nº 8.140/2026 - Página 2 de 3".
  // A reference in the text to the same decree is deliberately insufficient.
  const re = new RegExp(
    "\\b" + label[kind] + "\\s+N\\s*[º°O.]?\\s*" + digits +
      "\\s*/\\s*" + year + "\\s*[-–—]?\\s*PAGINA\\s*(\\d{1,2})\\s+DE\\s+(\\d{1,2})\\b",
    "i"
  );
  const match = re.exec(text);
  if (!match) return null;
  const sequence = Number(match[1]), total = Number(match[2]);
  if (!Number.isInteger(sequence) || !Number.isInteger(total) ||
      total < 1 || total > 30 || sequence < 1 || sequence > total) return null;
  return { pageNumber: page.pageNumber, sequence, total };
}

export function identifyOfficialActPageSpan(
  pages: OfficialPdfPage[],
  kind: OfficialActKind,
  actNumber: string,
  publicationYear: number
): OfficialActPageSpan {
  const base = {
    startPage: null,
    endPage: null,
    declaredActPages: null,
    verifiedPageMarkers: 0,
    scope: "PAGE_LEVEL_ONLY" as const,
  };
  const markers = pages
    .map(page => markerOnPage(page, kind, actNumber, publicationYear))
    .filter((marker): marker is NonNullable<typeof marker> => marker !== null)
    .sort((a, b) => a.pageNumber - b.pageNumber);
  if (!markers.length) return { ...base, status: "PAGE_MARKERS_NOT_FOUND" };

  const totals = new Set(markers.map(marker => marker.total));
  const validTotal = totals.size === 1 ? markers[0].total : null;
  // A duplicate marker or inconsistent numbering must not be accepted as a span.
  const complete = validTotal !== null &&
    markers.length === validTotal &&
    markers[0].sequence === 1 &&
    markers.every((m, i) => m.sequence === i + 1 &&
      (i === 0 || m.pageNumber === markers[i - 1].pageNumber + 1));

  return {
    status: complete ? "PAGE_MARKERS_COMPLETE" : "PAGE_MARKERS_PARTIAL",
    startPage: complete ? markers[0].pageNumber : null,
    endPage: complete ? markers[markers.length - 1].pageNumber : null,
    declaredActPages: validTotal,
    verifiedPageMarkers: markers.length,
    scope: "PAGE_LEVEL_ONLY",
  };
}
