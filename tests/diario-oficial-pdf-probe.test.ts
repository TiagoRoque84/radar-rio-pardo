import { describe, expect, it } from "vitest";
import type { ListedOfficialAct } from "../src/lib/collectors/dioe-parser";
import {
  isMatchingEditionPdf,
  probeOfficialEditionPdf,
} from "../src/lib/collectors/dioe-pdf-probe";

const item: ListedOfficialAct = {
  kind: "Decretos",
  title: "8140.2026 - Decreto - atualização UFM",
  editionNumber: "1929",
  publicationDate: new Date("2026-11-12T12:00:00Z"),
  editionUrl:
    "https://dosp.com.br/diario/sp/sao-jose-do-rio-pardo/2026-11-12/ed-1929-906375-89dfaa74026f.pdf",
  textUrl: null,
};

function fixtureResponse(body = "%PDF-1.7\nrestante do PDF simulado", init?: ResponseInit) {
  return new Response(body, {
    headers: { "content-type": "application/pdf" },
    ...init,
  });
}

describe("Diagnóstico de PDF do Diário Oficial, somente leitura", () => {
  it("reconhece a URL de PDF de edição e município corretos", () => {
    expect(isMatchingEditionPdf(item)).toBe(true);
    expect(isMatchingEditionPdf({
      ...item, editionNumber: "1930",
    })).toBe(false);
    expect(isMatchingEditionPdf({
      ...item, publicationDate: new Date("2026-11-13T12:00:00Z"),
    })).toBe(false);
    expect(isMatchingEditionPdf({
      ...item, editionUrl: "https://example.com/falso.pdf",
    })).toBe(false);
  });

  it("valida apenas cabeçalho, sem transferir o PDF inteiro", async () => {
    const bigPdf = "%PDF-1.7\n" + "x".repeat(100_000);
    const report = await probeOfficialEditionPdf(item, {
      fetchImpl: (async () => fixtureResponse(bigPdf)) as typeof fetch,
    });
    expect(report.status).toBe("PDF_HEADER_VERIFIED");
    expect(report.bytesRead).toBe(8);
    expect(report.checkedEdition).toBe("1929");
  });

  it("recusa HTML disfarçado de PDF e redirecionamentos externos", async () => {
    const wrong = await probeOfficialEditionPdf(item, {
      fetchImpl: (async () => fixtureResponse("<!doctype html><h1>acesso negado</h1>")) as typeof fetch,
    });
    expect(wrong.status).toBe("PDF_NOT_PDF");

    const redirected = await probeOfficialEditionPdf(item, {
      fetchImpl: (async () => {
        const response = fixtureResponse();
        Object.defineProperty(response, "url", {
          value: "https://example.com/malicioso.pdf", configurable: true,
        });
        return response;
      }) as typeof fetch,
    });
    expect(redirected.status).toBe("PDF_REDIRECT_UNTRUSTED");
  });

  it("não prossegue quando o tamanho declarado excede o orçamento", async () => {
    const report = await probeOfficialEditionPdf(item, {
      fetchImpl: (async () => fixtureResponse("%PDF-1.7", {
        headers: {
          "content-type": "application/pdf",
          "content-length": "15000001",
        },
      })) as typeof fetch,
    });
    expect(report.status).toBe("PDF_TOO_LARGE");
    expect(report.contentLength).toBe(15000001);
  });

  it("distingue erros HTTP de documentos inválidos", async () => {
    const report = await probeOfficialEditionPdf(item, {
      fetchImpl: (async () => new Response("bloqueado", { status: 403 })) as typeof fetch,
    });
    expect(report.status).toBe("PDF_HTTP_ERROR");
    expect(report.httpStatus).toBe(403);
  });
});
