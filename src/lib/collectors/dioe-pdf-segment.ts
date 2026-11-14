import type { OfficialActKind } from "./dioe-parser";
import {
  identifyOfficialActPageSpan,
  type OfficialPdfPage,
} from "./dioe-pdf-boundaries";

/**
 * Server-only, ephemeral preparation of a text excerpt from one official act.
 *
 * The diagnostic endpoint must return ONLY "diagnostic", not "textForReview".
 * The content is kept in memory and is never written to a database by this
 * helper. Full legal accuracy still requires human comparison with the PDF.
 */
export type SegmentStatus =
  | "SEGMENT_PREPARED_FOR_REVIEW"
  | "SEGMENT_NEEDS_MANUAL_REVIEW"
  | "SEGMENT_NOT_ISOLATED";

export type SegmentReason =
  | "COMPLETE_PAGE_MARKERS_NOT_FOUND"
  | "PAGE_NOT_AVAILABLE"
  | "IMPRINT_LINE_MISSING"
  | "OTHER_ACT_DETECTED"
  | "HEADING_NOT_VERIFIED"
  | "CONTENT_EMPTY"
  | "TEXT_LIMIT_EXCEEDED"
  | "NONE";

export interface SegmentDiagnostic {
  status: SegmentStatus;
  reason: SegmentReason;
  firstPage: number | null;
  lastPage: number | null;
  pagesConsidered: number;
  isolatedCharacters: number;
  annexMentioned: boolean;
  /** A copied sequence of PDF page text is not a legal authenticity check. */
  scope: "TEXT_CANDIDATE_FOR_HUMAN_REVIEW";
  textContentReturned: false;
  databaseAccess: false;
  collected: false;
}

const MAX_TEXT_CHARS = 90_000;

function folded(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

function digitsPattern(number: string): string {
  return number.split("").join("[.\\s]*");
}

function actLabel(kind: OfficialActKind): string {
  return kind === "Decretos" ? "DECRETO" :
    kind === "Portarias" ? "PORTARIA" : "LEI";
}

/** Exact printable imprint required on EACH PDF page, not mere mentions. */
function imprintLineIndex(
  lines: string[],
  kind: OfficialActKind,
  number: string,
  year: number,
  sequence: number,
  total: number
): number {
  const re = new RegExp(
    "^\\s*" + actLabel(kind) + "\\s+N\\s*[º°O.]?\\s*" +
    digitsPattern(number) + "\\s*/\\s*" + year +
    "\\s*[-–—]?\\s*PAGINA\\s*" + sequence +
    "\\s+DE\\s+" + total + "\\s*$", "i"
  );
  return lines.findIndex(line => re.test(folded(line)));
}

function containsAnotherActHeading(
  text: string, kind: OfficialActKind, number: string
): boolean {
  const foldedText = folded(text);
  const label = actLabel(kind);
  // Exclude the repeated page-imprint, which is removed before this scan.
  // Only a strong heading is a conflict, not a generic reference to legislation.
  const headings = [...foldedText.matchAll(
    /(?:^|\n)\s*(DECRETO|PORTARIA|LEI)\s+N\s*[º°O.]?\s*(\d[\d.]*)\s*,?\s+DE\s+\d{1,2}\s+DE\s+[A-Z]+\s+DE\s+\d{4}\b/g
  )];
  return headings.some(match =>
    match[1] !== label || match[2].replace(/\D/g, "") !== number
  );
}

function makeDiagnostic(
  status: SegmentStatus,
  reason: SegmentReason,
  firstPage: number | null,
  lastPage: number | null,
  pagesConsidered: number,
  isolatedCharacters: number,
  annexMentioned: boolean
): SegmentDiagnostic {
  return {
    status, reason, firstPage, lastPage, pagesConsidered,
    isolatedCharacters, annexMentioned,
    scope: "TEXT_CANDIDATE_FOR_HUMAN_REVIEW",
    textContentReturned: false,
    databaseAccess: false,
    collected: false,
  };
}

export interface PreparedActSegment {
  diagnostic: SegmentDiagnostic;
  /**
   * Contains potentially personal information from the official PDF.
   * Keep within server-side controlled scope; sanitize before editorial use.
   * DO NOT serialize this value from the public diagnostic route.
   */
  textForReview: string | null;
}

export function prepareOfficialActTextSegment(
  pages: OfficialPdfPage[],
  kind: OfficialActKind,
  actNumber: string,
  year: number
): PreparedActSegment {
  const span = identifyOfficialActPageSpan(pages, kind, actNumber, year);
  const empty = (
    reason: SegmentReason,
    pageCount = 0,
    first: number | null = null,
    last: number | null = null
  ): PreparedActSegment => ({
    diagnostic: makeDiagnostic(
      "SEGMENT_NOT_ISOLATED", reason, first, last, pageCount, 0, false
    ),
    textForReview: null,
  });

  if (span.status !== "PAGE_MARKERS_COMPLETE" ||
      span.startPage === null || span.endPage === null ||
      span.declaredActPages === null) {
    return empty("COMPLETE_PAGE_MARKERS_NOT_FOUND");
  }

  const start = span.startPage;
  const end = span.endPage;
  const byNumber = new Map(pages.map(page => [page.pageNumber, page.text]));
  const bodyParts: string[] = [];
  for (let page = start; page <= end; page++) {
    const text = byNumber.get(page);
    if (!text) return empty("PAGE_NOT_AVAILABLE", page - start, start, end);
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const index = imprintLineIndex(
      lines, kind, actNumber, year, page - start + 1, span.declaredActPages
    );
    // If the parser does not preserve a separate marker line, do NOT
    // accidentally treat the entire edition page as the act's body.
    if (index < 0) return empty("IMPRINT_LINE_MISSING", page - start, start, end);
    const content = lines.slice(index + 1).join("\n").trim();
    if (!content) return empty("CONTENT_EMPTY", page - start, start, end);
    bodyParts.push(content);
  }

  const textForReview = bodyParts.join("\n\n");
  if (textForReview.length > MAX_TEXT_CHARS) {
    return empty("TEXT_LIMIT_EXCEEDED", bodyParts.length, start, end);
  }
  if (containsAnotherActHeading(textForReview, kind, actNumber)) {
    return empty("OTHER_ACT_DETECTED", bodyParts.length, start, end);
  }

  const firstPageText = bodyParts[0] ?? "";
  const firstHeading = new RegExp(
    "\\b" + actLabel(kind) + "\\s+N\\s*[º°O.]?\\s*" +
    digitsPattern(actNumber) + "\\s*,?\\s+DE\\s+\\d{1,2}\\s+DE\\s+" +
    "[A-Z]+\\s+DE\\s+" + year + "\\b", "i"
  );
  if (!firstHeading.test(folded(firstPageText))) {
    return empty("HEADING_NOT_VERIFIED", bodyParts.length, start, end);
  }

  const annexMentioned = new RegExp(
    "\\bANEXO\\s+AO\\s+" + actLabel(kind) + "\\s+N\\s*[º°O.]?\\s*" +
    digitsPattern(actNumber), "i"
  ).test(folded(textForReview));

  return {
    diagnostic: makeDiagnostic(
      "SEGMENT_PREPARED_FOR_REVIEW", "NONE",
      start, end, bodyParts.length, textForReview.length, annexMentioned
    ),
    textForReview,
  };
}
