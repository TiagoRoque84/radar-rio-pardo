import { describe, expect, it } from "vitest";
import { identifyOfficialActPageSpan, type OfficialPdfPage } from "../src/lib/collectors/dioe-pdf-boundaries";

const pages: OfficialPdfPage[] = [
  { pageNumber: 1, text: "Sumário do Diário Oficial - Executivo, Decretos ........... 2" },
  { pageNumber: 2, text: [
    "Prefeitura Municipal de São José do Rio Pardo",
    "Decreto nº 8.140/2026 - Página 1 de 3",
    "DECRETO Nº 8.140, DE 12 DE NOVEMBRO DE 2026",
    "Art. 1º Valor atualizado da UFM",
  ].join("\n") },
  { pageNumber: 3, text: [
    "Decreto nº 8.140/2026 - Página 2 de 3",
    "Art. 5º Datas de pagamento de IPTU",
  ].join("\n") },
  { pageNumber: 4, text: [
    "Decreto nº 8.140/2026 - Página 3 de 3",
    "ANEXO AO DECRETO Nº 8.140/2026",
  ].join("\n") },
  { pageNumber: 5, text: [
    "Portarias",
    "PORTARIA Nº 20.323, DE 12 DE NOVEMBRO DE 2026",
  ].join("\n") },
];

describe("Marcadores explícitos de páginas de atos oficiais", () => {
  it("identifica páginas 2–4 do decreto pela numeração impressa em cada página", () => {
    const result = identifyOfficialActPageSpan(pages, "Decretos", "8140", 2026);
    expect(result).toEqual({
      status: "PAGE_MARKERS_COMPLETE",
      startPage: 2,
      endPage: 4,
      declaredActPages: 3,
      verifiedPageMarkers: 3,
      scope: "PAGE_LEVEL_ONLY",
    });
  });

  it("recusa atribuir páginas por simples menção ao número sem rodapé/cabeçalho específico", () => {
    const result = identifyOfficialActPageSpan([
      { pageNumber: 7, text: "Referência ao Decreto nº 8.140/2026, artigo 1º" },
    ], "Decretos", "8140", 2026);
    expect(result.status).toBe("PAGE_MARKERS_NOT_FOUND");
    expect(result.startPage).toBeNull();
  });

  it("não confirma intervalo se uma das páginas ou sequência declarada estiver faltando", () => {
    const result = identifyOfficialActPageSpan([pages[1], pages[3]], "Decretos", "8140", 2026);
    expect(result.status).toBe("PAGE_MARKERS_PARTIAL");
    expect(result.startPage).toBeNull();
    expect(result.endPage).toBeNull();
    expect(result.verifiedPageMarkers).toBe(2);
  });

  it("não confunde outro número de decreto, portaria ou ano", () => {
    expect(identifyOfficialActPageSpan(pages, "Decretos", "8141", 2026).status)
      .toBe("PAGE_MARKERS_NOT_FOUND");
    expect(identifyOfficialActPageSpan(pages, "Decretos", "8140", 2025).status)
      .toBe("PAGE_MARKERS_NOT_FOUND");
    expect(identifyOfficialActPageSpan(pages, "Portarias", "8140", 2026).status)
      .toBe("PAGE_MARKERS_NOT_FOUND");
  });

  it("não confirma duplicatas de marcadores ou sequência em páginas descontínuas", () => {
    const duplicated = identifyOfficialActPageSpan(
      [...pages, { pageNumber: 6, text: pages[1].text }], "Decretos", "8140", 2026
    );
    expect(duplicated.status).toBe("PAGE_MARKERS_PARTIAL");
    const reordered = identifyOfficialActPageSpan(
      [pages[1], { ...pages[2], pageNumber: 9 }, { ...pages[3], pageNumber: 10 }],
      "Decretos", "8140", 2026
    );
    expect(reordered.status).toBe("PAGE_MARKERS_PARTIAL");
  });
});
