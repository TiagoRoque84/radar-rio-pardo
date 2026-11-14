import { describe, it, expect } from "vitest";
import {
  formatCurrencyBRL,
  formatDateBR,
  slugify,
  formatDuration,
} from "@/lib/formatters";

describe("Formatadores monetários e de data (pt-BR / America/Sao_Paulo)", () => {
  it("formata valores monetários corretamente em BRL sem perder precisão", () => {
    expect(formatCurrencyBRL("123456.78")).toBe("R$\u00a0123.456,78");
    expect(formatCurrencyBRL(0)).toBe("R$\u00a00,00");
    expect(formatCurrencyBRL(null)).toBe("Não informado");
    expect(formatCurrencyBRL("")).toBe("Não informado");
  });

  it("formata datas UTC para o fuso America/Sao_Paulo", () => {
    // 2026-11-15T01:30:00Z corresponde a 14/11/2026 às 22:30 em São Paulo (UTC-3)
    const formatted = formatDateBR("2026-11-15T01:30:00.000Z");
    expect(formatted).toBe("14/11/2026");
  });

  it("gera slugs amigáveis removendo acentos e caracteres especiais", () => {
    expect(
      slugify("Licitação nº 14: Manutenção de Escolas em São José!")
    ).toBe("licitacao-no-14-manutencao-de-escolas-em-sao-jose");
  });

  it("formata duração de episódios de podcast", () => {
    expect(formatDuration(425)).toBe("7 min 05 s");
    expect(formatDuration(null)).toBe("Duração não informada");
  });
});
