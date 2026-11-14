import { describe, expect, it } from "vitest";
import type { ListedOfficialAct } from "../src/lib/collectors/dioe-parser";
import {
  pageMentionsOfficialAct,
  scanOfficialPdfForAct,
} from "../src/lib/collectors/dioe-pdf-text";

const item: ListedOfficialAct = {
  kind: "Decretos",
  title: "8140.2026 - Decreto - atualização UFM",
  editionNumber: "1929",
  publicationDate: new Date("2026-11-12T12:00:00.000Z"),
  editionUrl: "https://dosp.com.br/diario/sp/sao-jose-do-rio-pardo/2026-11-12/ed-1929-906375-89dfaa74026f.pdf",
  textUrl: null,
};

/** Generate a minimal PDF fixture entirely inside CI; no real documents. */
function onePagePdf(line: string): Uint8Array {
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const commands = line.split("\n").map((part, i) =>
    (i === 0 ? "" : "0 -22 Td ") + "(" + escape(part) + ") Tj"
  ).join(" ");
  const stream = "BT /F1 16 Tf 50 740 Td " + commands + " ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    "<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += (i + 1) + " 0 obj\n" + obj + "\nendobj\n";
  });
  const xref = pdf.length;
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  offsets.slice(1).forEach(offset => {
    pdf += String(offset).padStart(10, "0") + " 00000 n \n";
  });
  pdf += "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF";
  return new TextEncoder().encode(pdf);
}

describe("Camada de texto de PDF oficial - somente leitura", () => {
  it("encontra cabeçalhos do ato, sem confundir tipo ou número", () => {
    expect(pageMentionsOfficialAct("DECRETO N° 8.140, DE 12 DE NOVEMBRO", "Decretos", "8140")).toBe(true);
    expect(pageMentionsOfficialAct("DECRETO Nº 8.141", "Decretos", "8140")).toBe(false);
    expect(pageMentionsOfficialAct("PORTARIA Nº 8.140", "Decretos", "8140")).toBe(false);
    expect(pageMentionsOfficialAct("DECRETO Nº 8.140", "Decretos", "81402026")).toBe(false);
  });

  it("recusa PDF de edição/município diferente", async () => {
    const r = await scanOfficialPdfForAct({
      ...item, editionNumber: "1930",
    });
    expect(r.status).toBe("PDF_URL_MISMATCH");
    expect(r.databaseAccess).toBe(false);
  });

  it("bloqueia arquivo maior que limite antes da leitura completa", async () => {
    const r = await scanOfficialPdfForAct(item, {
      fetchImpl: (async () => new Response("%PDF-1.7", {
        headers: {
          "content-type": "application/pdf",
          "content-length": "16000000",
        },
      })) as typeof fetch,
    });
    expect(r.status).toBe("PDF_TOO_LARGE");
    expect(r.declaredBytes).toBe(16_000_000);
    expect(r.limitBytes).toBe(12_000_000);
    expect(r.bytesDownloaded).toBe(0);
  });

  it("interrompe transferência que ultrapassa 12 MB sem cabeçalho Content-Length", async () => {
    const raw = new Uint8Array(12_000_001);
    raw.set(new TextEncoder().encode("%PDF-1.7"), 0);
    const r = await scanOfficialPdfForAct(item, {
      fetchImpl: (async () => new Response(raw, {
        headers: { "content-type": "application/pdf" },
      })) as typeof fetch,
    });
    expect(r.status).toBe("PDF_TOO_LARGE");
    expect(r.limitBytes).toBe(12_000_000);
    expect(r.bytesDownloaded).toBeGreaterThan(12_000_000);
    expect(r.databaseAccess).toBe(false);
  });

  it("classifica a etapa da falha de um PDF inválido sem expor o erro interno", async () => {
    const r = await scanOfficialPdfForAct(item, {
      fetchImpl: (async () => new Response("%PDF-1.7\\nconteúdo inválido", {
        headers: { "content-type": "application/pdf" },
      })) as typeof fetch,
    });
    expect(r.status).toBe("PDF_PARSE_ERROR");
    expect(["WORKER_INIT", "PARSER_IMPORT", "PDF_INIT", "GET_INFO", "GET_TEXT"]).toContain(r.failureStage);
    expect(JSON.stringify(r)).not.toContain("Error:");
    expect(r.databaseAccess).toBe(false);
  });

  it("confirma a extensão por marcador explícito em PDF sintético, sem devolver texto", async () => {
    const pdf = onePagePdf("DECRETO N. 8.140/2026 - PAGINA 1 DE 1");
    const result = await scanOfficialPdfForAct(item, {
      inspectPageSpan: true,
      fetchImpl: (async () => new Response(pdf, {
        headers: { "content-type": "application/pdf" },
      })) as typeof fetch,
    });
    expect(result.status).toBe("ACT_MATCHED");
    expect(result.pageSpanCheck).toEqual({
      status: "PAGE_MARKERS_COMPLETE",
      startPage: 1,
      endPage: 1,
      declaredActPages: 1,
      verifiedPageMarkers: 1,
      scope: "PAGE_LEVEL_ONLY",
    });
    expect(result.textContentReturned).toBe(false);
    expect(result.databaseAccess).toBe(false);
  });

  it("prepara apenas metadados do texto segmentado sem expor trecho do ato", async () => {
    const pdf = onePagePdf([
      "DECRETO N. 8.140/2026 - PAGINA 1 DE 1",
      "DECRETO N. 8.140, DE 12 DE NOVEMBRO DE 2026.",
      "Art. 1 A UFM fica fixada em R$ 195,62.",
    ].join("\n"));
    const result = await scanOfficialPdfForAct(item, {
      inspectPageSpan: true,
      inspectTextSegment: true,
      fetchImpl: (async () => new Response(pdf, {
        headers: { "content-type": "application/pdf" },
      })) as typeof fetch,
    });
    expect(result.status).toBe("ACT_MATCHED");
    expect(result.pageSpanCheck?.status).toBe("PAGE_MARKERS_COMPLETE");
    expect(result.segmentCheck?.status).toBe("SEGMENT_PREPARED_FOR_REVIEW");
    expect(result.segmentCheck?.firstPage).toBe(1);
    expect(result.segmentCheck?.isolatedCharacters).toBeGreaterThan(40);
    expect(JSON.stringify(result)).not.toContain("R$ 195,62");
    expect(result.textContentReturned).toBe(false);
    expect(result.databaseAccess).toBe(false);
  });

  it("identifica número e página no PDF sintético com texto pesquisável", async () => {
    const pdf = onePagePdf("DECRETO N. 8.140, DE 12 DE NOVEMBRO DE 2026.");
    const r = await scanOfficialPdfForAct(item, {
      fetchImpl: (async () => new Response(pdf, {
        headers: { "content-type": "application/pdf" },
      })) as typeof fetch,
    });
    expect(r.status).toBe("ACT_MATCHED");
    expect(r.pageCount).toBe(1);
    expect(r.matchingPages).toEqual([1]);
    expect(r.textContentReturned).toBe(false);
    expect(r.collected).toBe(false);
  });
});
