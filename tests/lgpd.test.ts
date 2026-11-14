import { describe, it, expect } from "vitest";
import {
  detectAndMaskPersonalData,
  maskDocumentNumber,
} from "@/lib/privacy/lgpd-sanitizer";

describe("Proteção de dados pessoais (LGPD)", () => {
  it("detecta e oculta CPF, RG, telefone particular e conta bancária", () => {
    const raw =
      "O servidor portador do CPF 123.456.789-01, RG 12.345.678-9, telefone (19) 99988-7766 e Agência: 1234-5 recebeu notificação.";
    const result = detectAndMaskPersonalData(raw);

    expect(result.hasPersonalData).toBe(true);
    expect(result.sanitizedText).not.toContain("123.456.789-01");
    expect(result.sanitizedText).toContain("***.456.***-01");
    expect(result.sanitizedText).toContain("[RG OCULTADO - LGPD]");
    expect(result.sanitizedText).toContain("[TELEFONE OCULTADO - LGPD]");
    expect(result.sanitizedText).toContain("[DADO BANCÁRIO OCULTADO - LGPD]");
  });

  it("preserva CNPJ de pessoa jurídica contratada e mascara CPF", () => {
    expect(maskDocumentNumber("12345678000195")).toBe("12.345.678/0001-95");
    expect(maskDocumentNumber("12345678901")).toBe("***.456.***-01");
  });
});
