import { describe, expect, it } from "vitest";
import { prepareOfficialActTextSegment } from "../src/lib/collectors/dioe-pdf-segment";
import type { OfficialPdfPage } from "../src/lib/collectors/dioe-pdf-boundaries";

const sample: OfficialPdfPage[] = [
  {
    pageNumber: 2,
    text: [
      "DIÁRIO OFICIAL - MUNICÍPIO DE SÃO JOSÉ DO RIO PARDO",
      "Prefeitura Municipal de São José do Rio Pardo",
      "Decreto nº 8.140/2026 - Página 1 de 3",
      "DECRETO Nº 8.140, DE 12 DE NOVEMBRO DE 2026.",
      "Dispõe sobre atualização de UFM para o exercício de 2027.",
      "Art. 1º A UFM fica fixada em R$ 195,62.",
    ].join("\n"),
  },
  {
    pageNumber: 3,
    text: [
      "DIÁRIO OFICIAL - MUNICÍPIO DE SÃO JOSÉ DO RIO PARDO",
      "Decreto nº 8.140/2026 - Página 2 de 3",
      "Art. 5º O IPTU pode ser pago em cota única.",
      "São José do Rio Pardo, 12 de novembro de 2026.",
    ].join("\n"),
  },
  {
    pageNumber: 4,
    text: [
      "DIÁRIO OFICIAL - MUNICÍPIO DE SÃO JOSÉ DO RIO PARDO",
      "Decreto nº 8.140/2026 - Página 3 de 3",
      "ANEXO AO DECRETO Nº 8.140/2026",
      "PLANTA GENÉRICA DE VALORES",
    ].join("\n"),
  },
  {
    pageNumber: 5,
    text: [
      "PORTARIA Nº 20.323, DE 12 DE NOVEMBRO DE 2026.",
      "Nomeação de servidora municipal.",
    ].join("\n"),
  },
];

describe("Pré-isolamento conservador de texto do Diário Oficial", () => {
  it("recorta apenas a partir dos marcadores confirmados nas páginas 2–4", () => {
    const result = prepareOfficialActTextSegment(sample, "Decretos", "8140", 2026);
    expect(result.diagnostic).toMatchObject({
      status: "SEGMENT_PREPARED_FOR_REVIEW",
      reason: "NONE",
      firstPage: 2,
      lastPage: 4,
      pagesConsidered: 3,
      annexMentioned: true,
      textContentReturned: false,
      databaseAccess: false,
      collected: false,
    });
    expect(result.diagnostic.isolatedCharacters).toBeGreaterThan(100);
    expect(result.textForReview).toContain("R$ 195,62");
    expect(result.textForReview).toContain("PLANTA GENÉRICA DE VALORES");
    expect(result.textForReview).not.toContain("PORTARIA Nº 20.323");
    expect(result.textForReview).not.toContain("DIÁRIO OFICIAL - MUNICÍPIO");
    // Never return the text in the public diagnostic object.
    expect(JSON.stringify(result.diagnostic)).not.toContain("R$ 195,62");
  });

  it("não isola texto sem numeração explícita e completa de páginas", () => {
    const result = prepareOfficialActTextSegment([sample[0], sample[2]], "Decretos", "8140", 2026);
    expect(result.diagnostic.status).toBe("SEGMENT_NOT_ISOLATED");
    expect(result.diagnostic.reason).toBe("COMPLETE_PAGE_MARKERS_NOT_FOUND");
    expect(result.textForReview).toBeNull();
  });

  it("não adivinha o início do texto quando o PDF não preserva o marcador em linha separada", () => {
    const broken = sample.map(page =>
      page.pageNumber === 2
        ? { ...page, text: page.text.replace("Decreto nº 8.140/2026 - Página 1 de 3\n", "").
          replace("Prefeitura Municipal de São José do Rio Pardo\n", "Decreto nº 8.140/2026 - Página 1 de 3 ") }
        : page
    );
    const result = prepareOfficialActTextSegment(broken, "Decretos", "8140", 2026);
    expect(result.diagnostic.status).toBe("SEGMENT_NOT_ISOLATED");
    expect(result.textForReview).toBeNull();
  });

  it("rejeita segmento que contém o cabeçalho de outro decreto", () => {
    const mixed = sample.map(page =>
      page.pageNumber === 3
        ? { ...page, text: page.text + "\nDECRETO Nº 8.141, DE 12 DE NOVEMBRO DE 2026." }
        : page
    );
    const result = prepareOfficialActTextSegment(mixed, "Decretos", "8140", 2026);
    expect(result.diagnostic.reason).toBe("OTHER_ACT_DETECTED");
    expect(result.textForReview).toBeNull();
  });

  it("rejeita ausência de cabeçalho inequívoco no texto da primeira página", () => {
    const missing = sample.map(page =>
      page.pageNumber === 2
        ? { ...page, text: page.text.replace("DECRETO Nº 8.140, DE 12 DE NOVEMBRO DE 2026.", "") }
        : page
    );
    const result = prepareOfficialActTextSegment(missing, "Decretos", "8140", 2026);
    expect(result.diagnostic.reason).toBe("HEADING_NOT_VERIFIED");
    expect(result.textForReview).toBeNull();
  });

  it("não considera uma referência a outro decreto como outro ato", () => {
    const references = sample.map(page =>
      page.pageNumber === 3
        ? { ...page, text: page.text + "\nConsiderando o Decreto nº 8.139/2026." }
        : page
    );
    const result = prepareOfficialActTextSegment(references, "Decretos", "8140", 2026);
    expect(result.diagnostic.status).toBe("SEGMENT_PREPARED_FOR_REVIEW");
  });
});
