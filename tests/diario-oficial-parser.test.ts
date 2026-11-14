import { describe, expect, it } from "vitest";
import {
  decodeOfficialEntities,
  htmlToOfficialText,
  isRioPardoOfficialHtml,
  listingUrl,
  parseOfficialActListing,
  parseOfficialActText,
  safeOfficialUrl,
} from "../src/lib/collectors/dioe-parser";

const officialPdf =
  "https://dosp.com.br/diario/sp/sao-jose-do-rio-pardo/2026-11-10/ed-1927-905260-6e42dd74d276.pdf";
const actLink = "https://www.dosp.com.br/leituratexto?p=Mjg1OTU2Mw%3D%3D";

function row(date = "10/11/2026", href = officialPdf) {
  return "<tr><td>8139 - Decreto sobre encerramento do ano</td>" +
    "<td>" + date + "</td><td>1927</td><td>9</td>" +
    '<td><a href="' + href + '">Abrir Edição</a></td>' +
    '<td><a href="' + actLink + '">Visualizar</a></td></tr>';
}

function page(...rows: string[]) {
  return "<html><body><h1>Diário Oficial - São José do Rio Pardo</h1>" +
    "<h2>Listar Atos</h2><table>" + rows.join("") + "</table></body></html>";
}

describe("Coletor estruturado do Diário Oficial: parser defensivo", () => {
  it("identifica município, dados reais da edição e links do D.O.S.P.", () => {
    const acts = parseOfficialActListing(page(row()), "Decretos");
    expect(acts).toHaveLength(1);
    expect(acts[0].editionNumber).toBe("1927");
    expect(acts[0].publicationDate.toISOString().slice(0, 10)).toBe("2026-11-10");
    expect(acts[0].editionUrl).toBe(officialPdf);
    expect(acts[0].textUrl).toBe(actLink);
    expect(listingUrl("Decretos")).toContain("s=Decretos");
  });

  it("elimina linhas repetidas e não trata título como data de publicação", () => {
    const acts = parseOfficialActListing(page(row(), row()), "Decretos");
    expect(acts).toHaveLength(1);
  });

  it("recusa outra cidade e datas inválidas", () => {
    expect(() => parseOfficialActListing(
      "<h1>Diário Oficial de Mococa</h1><h2>Listar Atos</h2><table>" + row() + "</table>",
      "Decretos"
    )).toThrow();
    expect(parseOfficialActListing(page(row("31/02/2026")), "Decretos")).toHaveLength(0);
  });

  it("recusa links externos, HTTP e caminhos não oficiais", () => {
    expect(safeOfficialUrl("https://example.com/ed-1927.pdf", "edition")).toBeNull();
    expect(safeOfficialUrl("http://dosp.com.br/impressao.php?i=abc", "edition")).toBeNull();
    expect(safeOfficialUrl("https://dosp.com.br/admin", "text")).toBeNull();
    expect(parseOfficialActListing(
      page(row("10/11/2026", "https://example.com/ed-1927.pdf")), "Decretos"
    )).toHaveLength(0);
  });

  it("preserva acentuação e converte entidades do conteúdo oficial", () => {
    expect(decodeOfficialEntities("S&atilde;o Jos&eacute; &amp; Leis"))
      .toBe("São José & Leis");
    expect(htmlToOfficialText("<b>Decreto</b> &nº; <i>123</i>"))
      .toContain("Decreto");
    expect(isRioPardoOfficialHtml("<p>Município de S&#227;o Jos&#233; do Rio Pardo</p>"))
      .toBe(true);
  });

  it("extrai somente ementa indicada na fonte e confere número da edição", () => {
    const doc = "<h1>IMPRENSA OFICIAL - SÃO JOSÉ DO RIO PARDO</h1>" +
      "<p>Publicado em 10/11/2026 | Edição nº 1927 | Ano IX</p>" +
      "<h2>DECRETO Nº 8.139</h2><blockquote>Dispõe sobre procedimentos administrativos.</blockquote>";
    expect(parseOfficialActText(doc, "1927")?.ementa)
      .toBe("Dispõe sobre procedimentos administrativos.");
    expect(parseOfficialActText(doc, "1929")).toBeNull();
    expect(parseOfficialActText(doc.replace("RIO PARDO", "MOCOCA"), "1927")).toBeNull();
  });
});
