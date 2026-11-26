import { describe, expect, it } from "vitest";
import { extractOfficialHeadnotes, parseEditionFeed, summarizeContents } from "@/lib/collectors/official-editions";

const url = "https://dosp.com.br/diario/sp/sao-jose-do-rio-pardo/2026-11-25/ed-1937-911880-f992e1c59e0f.pdf";
const row = { edicao_do: "1937", iddo: 911880, data: "2026-11-25", link: url };
const header = "Município de São José do Rio Pardo\nEdição nº 1937 Página ";

describe("publicação automática do Diário Oficial", () => {
  it("confere o município, a data e o identificador da edição no link", () => {
    const rows = [row, { ...row, data: "2026-11-24" }, { ...row, link: url.replace("sao-jose-do-rio-pardo", "outra-cidade") }];
    expect(parseEditionFeed("dioe(" + JSON.stringify({ data: rows }) + ");")).toHaveLength(1);
  });
  it("aceita as duas ordens de extração e exclui páginas fora da edição", () => {
    expect(summarizeContents(header + "1 de 4\nSUMÁRIO\nDecretos 2 ......\nPortarias .... 3\nAvisos ..... 8", "1937", 4))
      .toBe("Decretos (p. 2) • Portarias (p. 3)");
  });
  it("somente transcreve ementa completa com cabeçalho e página confirmados", () => {
    const page = header + "2 de 4\nDECRETO Nº 8.149, DE 25 DE NOVEMBRO DE\n2026.\nInstitui o calendário de eventos.\nO Prefeito do Município";
    expect(extractOfficialHeadnotes(page, "1937", 2)).toEqual(["DECRETO nº 8.149 (p. 2) — Institui o calendário de eventos."]);
    expect(extractOfficialHeadnotes(page, "1938", 2)).toEqual([]);
    expect(extractOfficialHeadnotes(page, "1937", 3)).toEqual([]);
    expect(extractOfficialHeadnotes(page.replace("Institui o calendário de eventos.", "Dispõe sobre a readaptação da servidora."), "1937", 2)).toEqual([]);
  });
});
