import { describe, expect, it } from "vitest";
import { participants } from "../src/lib/chamber/travel-source";

describe("Vínculo documental de viagens", () => {
  it("preserva todos os participantes de uma viagem conjunta", () => {
    expect(participants("Viagem pelos vereadores Dante Lemes e Adriano Junior para reunião")).toEqual(["136", "144"]);
    expect(participants("Viagem pelos vereadores Dante Lemes e pessoa desconhecida para reunião")).toEqual([]);
  });
  it("usa somente o histórico retificado e exige menção à viagem", () => {
    const original = "Viagem pelo vereador Marcelo Clementino para reunião.";
    expect(participants(original + " [digo,] Viagem pelo vereador Alexandre Tosini para reunião")).toEqual(["145"]);
    expect(participants("Documento assinado pelo vereador Marcelo Clementino para compra")).toEqual([]);
  });
});
