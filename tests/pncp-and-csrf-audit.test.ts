import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import {
  classifyMunicipalAgency,
  isValidCnpj,
  SJRP_IBGE_CODE,
} from "@/lib/municipality";
import {
  determineCollectorStatusAndOutcome,
  runPncpCollector,
} from "@/lib/collectors/pncp-collector";
import { validateCsrfRequest } from "@/lib/security/csrf";
import { middleware, config as middlewareConfig } from "@/middleware";
import {
  canManageAdminSettings,
  canPublishContent,
} from "@/lib/auth/session";
import { getRequiredAuthSecret, validateCronSecretHeader } from "@/lib/env";

const TEST_PREFIX = "TEST-PNCP-AUDIT-";

function makePncpItem(overrides: {
  id: string;
  organName?: string;
  cnpj?: string;
  esferaId?: string;
  ibge?: string | number;
  city?: string;
  uf?: string;
}) {
  return {
    numeroControlePNCP: overrides.id,
    numeroCompra: overrides.id.slice(-8),
    anoCompra: 2026,
    modalidadeId: 6,
    modalidadeNome: "Pregão - Eletrônico",
    objetoCompra: `Objeto de teste automatizado ${overrides.id}`,
    situacaoCompraNome: "Divulgada no PNCP",
    dataPublicacaoPncp: "2026-11-10T10:00:00Z",
    valorTotalEstimado: 15000,
    linkSistemaOrigem: `https://pncp.gov.br/app/editais/${overrides.id}`,
    orgaoEntidade: {
      razaoSocial:
        overrides.organName ?? "PREFEITURA MUNICIPAL DE SAO JOSE DO RIO PARDO",
      cnpj: overrides.cnpj ?? "45741659000137",
      esferaId: overrides.esferaId ?? "M",
      poderId: "E",
    },
    unidadeOrgao: {
      codigoIbge: overrides.ibge ?? 3549706,
      municipioNome: overrides.city ?? "São José do Rio Pardo",
      ufSigla: overrides.uf ?? "SP",
      nomeUnidade: "Setor de Compras",
    },
  };
}

describe("Auditoria PNCP (Paginação, Checkpoint, Órgãos, Status) e Proteção CSRF", () => {
  let sourceId = "";
  let adapterId = "";
  let agencyId = "";
  let runId = "";

  beforeAll(async () => {
    const adapter = await prisma.integrationAdapter.findUnique({
      where: { adapterKey: "pncp-api-sjrp" },
      include: { source: true },
    });
    expect(adapter).not.toBeNull();
    sourceId = adapter!.sourceId;
    adapterId = adapter!.id;
    agencyId = adapter!.source.agencyId;

    const run = await prisma.collectionRun.create({
      data: {
        adapterId,
        status: "RUNNING",
        triggerType: "MANUAL",
      },
    });
    runId = run.id;
  });

  afterAll(async () => {
    await prisma.biddingProcess.deleteMany({
      where: { pncpId: { startsWith: TEST_PREFIX } },
    });
    await prisma.importedDocument.deleteMany({
      where: { externalId: { startsWith: TEST_PREFIX } },
    });
    if (runId) {
      await prisma.collectionRun
        .delete({ where: { id: runId } })
        .catch(() => null);
    }
    await prisma.$disconnect();
  });

  it("percorre mais de 3 páginas (paginação completa até a última página) e impede loop repetido", async () => {
    const requestedPages: number[] = [];
    const fetchMock: typeof fetch = async (input) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get("pagina"));
      requestedPages.push(page);

      const item = makePncpItem({
        id: `${TEST_PREFIX}P5-${page}`,
      });
      return new Response(
        JSON.stringify({
          data: [item],
          totalRegistros: 5,
          totalPaginas: 5,
          numeroPagina: page,
          paginasRestantes: 5 - page,
          empty: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    const result = await runPncpCollector({
      adapterId,
      adapterKey: "pncp-api-sjrp",
      sourceId,
      sourceUrl: "https://pncp.gov.br/",
      agencyId,
      runId,
      configJson: JSON.stringify({ modalidades: [6] }),
      retryBaseDelayMs: 1,
      fetchImpl: fetchMock,
    });

    expect(requestedPages).toEqual([1, 2, 3, 4, 5]);
    expect(result.status).toBe("SUCCESS");
    expect(result.outcome).toBe("IMPORTED");
    expect(result.itemsFound).toBe(5);
    expect(result.itemsProcessed).toBe(5);
    expect(result.hasPendingPages).toBe(false);
    expect(result.checkpoint?.incomplete).toBe(false);

    // Loop infinito de página repetida interrompe na segunda página
    let repeatCalls = 0;
    const repeatedPageFetch: typeof fetch = async () => {
      repeatCalls += 1;
      return new Response(
        JSON.stringify({
          data: [makePncpItem({ id: `${TEST_PREFIX}REPEAT-SAME` })],
          totalPaginas: 10,
          paginasRestantes: 9,
          empty: false,
        }),
        { status: 200 }
      );
    };

    const loopResult = await runPncpCollector({
      adapterId,
      adapterKey: "pncp-api-sjrp",
      sourceId,
      sourceUrl: "https://pncp.gov.br/",
      agencyId,
      runId,
      configJson: JSON.stringify({ modalidades: [6] }),
      retryBaseDelayMs: 1,
      fetchImpl: repeatedPageFetch,
    });

    expect(repeatCalls).toBe(2);
    expect(loopResult.errorCount).toBe(1);
    expect(loopResult.status).toBe("PARTIAL");
  });

  it("salva checkpoint ao atingir limite de requisições e retoma da página pendente até concluir", async () => {
    const pagesRun1: number[] = [];
    const pagesRun2: number[] = [];

    const makePagedFetch = (tracker: number[]): typeof fetch => {
      return async (input) => {
        const page = Number(new URL(String(input)).searchParams.get("pagina"));
        tracker.push(page);
        return new Response(
          JSON.stringify({
            data: [makePncpItem({ id: `${TEST_PREFIX}CP-${page}` })],
            totalRegistros: 4,
            totalPaginas: 4,
            numeroPagina: page,
            paginasRestantes: 4 - page,
            empty: false,
          }),
          { status: 200 }
        );
      };
    };

    const run1 = await runPncpCollector({
      adapterId,
      adapterKey: "pncp-api-sjrp",
      sourceId,
      sourceUrl: "https://pncp.gov.br/",
      agencyId,
      runId,
      configJson: JSON.stringify({ modalidades: [6] }),
      maxRequestsPerRun: 2,
      retryBaseDelayMs: 1,
      fetchImpl: makePagedFetch(pagesRun1),
    });

    expect(pagesRun1).toEqual([1, 2]);
    expect(run1.status).toBe("PARTIAL");
    expect(run1.outcome).toBe("PARTIAL_COMPLETION");
    expect(run1.hasPendingPages).toBe(true);
    expect(run1.checkpoint?.incomplete).toBe(true);
    expect(
      (run1.checkpoint?.nextPageByModality as Record<string, number>)["6"]
    ).toBe(3);

    const run2 = await runPncpCollector({
      adapterId,
      adapterKey: "pncp-api-sjrp",
      sourceId,
      sourceUrl: "https://pncp.gov.br/",
      agencyId,
      runId,
      configJson: JSON.stringify({ modalidades: [6] }),
      previousCheckpoint: run1.checkpoint,
      retryBaseDelayMs: 1,
      fetchImpl: makePagedFetch(pagesRun2),
    });

    expect(pagesRun2).toEqual([3, 4]);
    expect(run2.status).toBe("SUCCESS");
    expect(run2.outcome).toBe("IMPORTED");
    expect(run2.hasPendingPages).toBe(false);
    expect(run2.checkpoint?.incomplete).toBe(false);
  });

  it("trata HTTP 204 e coleta sem registros como NO_RECORDS", async () => {
    const fetch204: typeof fetch = async () =>
      new Response(null, { status: 204 });

    const res = await runPncpCollector({
      adapterId,
      adapterKey: "pncp-api-sjrp",
      sourceId,
      sourceUrl: "https://pncp.gov.br/",
      agencyId,
      runId,
      configJson: JSON.stringify({ modalidades: [6, 8] }),
      retryBaseDelayMs: 1,
      fetchImpl: fetch204,
    });

    expect(res.status).toBe("SUCCESS");
    expect(res.outcome).toBe("NO_RECORDS");
    expect(res.itemsFound).toBe(0);
    expect(res.errorCount).toBe(0);
  });

  it("trata HTTP 429 com retry e salva checkpoint quando erro 429 persiste", async () => {
    let callsRecover = 0;
    const fetch429Recover: typeof fetch = async () => {
      callsRecover += 1;
      if (callsRecover === 1) {
        return new Response("Too Many Requests", {
          status: 429,
          headers: { "Retry-After": "0" },
        });
      }
      return new Response(
        JSON.stringify({
          data: [makePncpItem({ id: `${TEST_PREFIX}429-OK` })],
          totalPaginas: 1,
          paginasRestantes: 0,
        }),
        { status: 200 }
      );
    };

    const recovered = await runPncpCollector({
      adapterId,
      adapterKey: "pncp-api-sjrp",
      sourceId,
      sourceUrl: "https://pncp.gov.br/",
      agencyId,
      runId,
      configJson: JSON.stringify({ modalidades: [6] }),
      maxRetries: 2,
      retryBaseDelayMs: 1,
      fetchImpl: fetch429Recover,
    });

    expect(callsRecover).toBe(2);
    expect(recovered.status).toBe("SUCCESS");
    expect(recovered.itemsProcessed).toBe(1);

    let callsPersistent = 0;
    const fetch429Always: typeof fetch = async () => {
      callsPersistent += 1;
      return new Response("Rate limit", { status: 429 });
    };

    const failed = await runPncpCollector({
      adapterId,
      adapterKey: "pncp-api-sjrp",
      sourceId,
      sourceUrl: "https://pncp.gov.br/",
      agencyId,
      runId,
      configJson: JSON.stringify({ modalidades: [6] }),
      maxRetries: 1,
      retryBaseDelayMs: 1,
      fetchImpl: fetch429Always,
    });

    expect(callsPersistent).toBe(2);
    expect(failed.status).toBe("ERROR");
    expect(failed.outcome).toBe("FAILED");
    expect(failed.errorCount).toBe(1);
    expect(failed.checkpoint?.incomplete).toBe(true);
  });

  it("trata timeout (AbortError), falha parcial entre modalidades e JSON inválido preservando registros válidos", async () => {
    // Modalidade 6 dá timeout na pág 1; modalidade 8 devolve 1 item válido; modalidade 9 devolve JSON inválido
    const mixedFetch: typeof fetch = async (input) => {
      const mod = new URL(String(input)).searchParams.get(
        "codigoModalidadeContratacao"
      );
      if (mod === "6") {
        const err = new Error("Request aborted due to timeout");
        err.name = "AbortError";
        throw err;
      }
      if (mod === "8") {
        return new Response(
          JSON.stringify({
            data: [makePncpItem({ id: `${TEST_PREFIX}PARTIAL-M8` })],
            totalPaginas: 1,
            paginasRestantes: 0,
          }),
          { status: 200 }
        );
      }
      return new Response("{json-invalido", { status: 200 });
    };

    const res = await runPncpCollector({
      adapterId,
      adapterKey: "pncp-api-sjrp",
      sourceId,
      sourceUrl: "https://pncp.gov.br/",
      agencyId,
      runId,
      configJson: JSON.stringify({ modalidades: [6, 8, 9] }),
      maxRetries: 1,
      retryBaseDelayMs: 1,
      fetchImpl: mixedFetch,
    });

    expect(res.status).toBe("PARTIAL");
    expect(res.outcome).toBe("PARTIAL_COMPLETION");
    expect(res.itemsProcessed).toBe(1);
    expect(res.errorCount).toBe(2);

    const saved = await prisma.biddingProcess.findUnique({
      where: { pncpId: `${TEST_PREFIX}PARTIAL-M8` },
    });
    expect(saved).not.toBeNull();
  });

  it("contabiliza registros duplicados na reexecução sem duplicar no banco", async () => {
    const dupFetch: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          data: [makePncpItem({ id: `${TEST_PREFIX}DUP-ITEM` })],
          totalPaginas: 1,
          paginasRestantes: 0,
        }),
        { status: 200 }
      );

    const first = await runPncpCollector({
      adapterId,
      adapterKey: "pncp-api-sjrp",
      sourceId,
      sourceUrl: "https://pncp.gov.br/",
      agencyId,
      runId,
      configJson: JSON.stringify({ modalidades: [6] }),
      retryBaseDelayMs: 1,
      fetchImpl: dupFetch,
    });
    expect(first.status).toBe("SUCCESS");
    expect(first.itemsProcessed).toBe(1);

    const second = await runPncpCollector({
      adapterId,
      adapterKey: "pncp-api-sjrp",
      sourceId,
      sourceUrl: "https://pncp.gov.br/",
      agencyId,
      runId,
      configJson: JSON.stringify({ modalidades: [6] }),
      retryBaseDelayMs: 1,
      fetchImpl: dupFetch,
    });

    expect(second.status).toBe("SUCCESS");
    expect(second.outcome).toBe("DUPLICATES_ONLY");
    expect(second.itemsProcessed).toBe(0);
    expect(second.itemsDuplicated).toBe(1);
  });

  it("classifica órgãos por CNPJ oficial e retém órgãos desconhecidos em PENDING_CLASSIFICATION sem atribuir à Prefeitura", async () => {
    expect(isValidCnpj("45.741.659/0001-37")).toBe(true);
    expect(isValidCnpj("54.138.268/0001-13")).toBe(true);
    expect(isValidCnpj("19.659.196/0001-59")).toBe(true);
    expect(isValidCnpj("45.741.659/0001-38")).toBe(false);
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);

    const dbAgencies = await prisma.publicAgency.findMany({
      select: { id: true, acronym: true, name: true },
    });

    const camaraMatch = classifyMunicipalAgency(
      {
        organName: "CÂMARA MUNICIPAL DE SÃO JOSÉ DO RIO PARDO",
        cnpj: "54138268000113",
        ibgeCode: SJRP_IBGE_CODE,
        municipalityName: "São José do Rio Pardo",
        uf: "SP",
      },
      dbAgencies
    );
    expect(camaraMatch.matched).toBe(true);
    if (camaraMatch.matched) {
      expect(camaraMatch.acronym).toBe("CMSJRP");
      expect(camaraMatch.matchedBy).toBe("CNPJ");
    }

    const unknownMatch = classifyMunicipalAgency(
      {
        organName: "CONSORCIO INTERMUNICIPAL DE SERVICOS",
        cnpj: "11222333000181",
        ibgeCode: SJRP_IBGE_CODE,
        municipalityName: "São José do Rio Pardo",
        uf: "SP",
      },
      dbAgencies
    );
    expect(unknownMatch.matched).toBe(false);
    expect(unknownMatch.agencyId).toBeNull();
    expect(unknownMatch.status).toBe("PENDING_CLASSIFICATION");

    const fetchUnknownOrgan: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            makePncpItem({
              id: `${TEST_PREFIX}UNKNOWN-ORG`,
              organName: "ENTIDADE MUNICIPAL NAO CADASTRADA",
              cnpj: "11222333000181",
            }),
          ],
          totalPaginas: 1,
          paginasRestantes: 0,
        }),
        { status: 200 }
      );

    const pendingRes = await runPncpCollector({
      adapterId,
      adapterKey: "pncp-api-sjrp",
      sourceId,
      sourceUrl: "https://pncp.gov.br/",
      agencyId,
      runId,
      configJson: JSON.stringify({ modalidades: [6] }),
      retryBaseDelayMs: 1,
      fetchImpl: fetchUnknownOrgan,
    });

    expect(pendingRes.status).toBe("PARTIAL");
    expect(pendingRes.outcome).toBe("PENDING_CLASSIFICATION");
    expect(pendingRes.itemsProcessed).toBe(0);
    expect(pendingRes.itemsPendingClassification).toBe(1);

    const notImported = await prisma.biddingProcess.findUnique({
      where: { pncpId: `${TEST_PREFIX}UNKNOWN-ORG` },
    });
    expect(notImported).toBeNull();

    const pendingDoc = await prisma.importedDocument.findFirst({
      where: { externalId: `${TEST_PREFIX}UNKNOWN-ORG` },
    });
    expect(pendingDoc).not.toBeNull();
    expect(pendingDoc!.extractionStatus).toBe("PENDING_CLASSIFICATION");
    expect(pendingDoc!.originalUrl).toContain("TEST-PNCP-AUDIT-UNKNOWN-ORG");
  });

  it("rejeita municípios incorretos e nunca marca ALL_REJECTED como SUCCESS", async () => {
    const fetchAllWrongCity: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          data: [
            makePncpItem({
              id: `${TEST_PREFIX}CITY-3550803`,
              ibge: 3550803,
              city: "São Sebastião da Grama",
            }),
            makePncpItem({
              id: `${TEST_PREFIX}CITY-MOCOCA`,
              ibge: 3530508,
              city: "Mococa",
            }),
          ],
          totalPaginas: 1,
          paginasRestantes: 0,
        }),
        { status: 200 }
      );

    const res = await runPncpCollector({
      adapterId,
      adapterKey: "pncp-api-sjrp",
      sourceId,
      sourceUrl: "https://pncp.gov.br/",
      agencyId,
      runId,
      configJson: JSON.stringify({ modalidades: [6] }),
      retryBaseDelayMs: 1,
      fetchImpl: fetchAllWrongCity,
    });

    expect(res.status).toBe("PARTIAL");
    expect(res.outcome).toBe("ALL_REJECTED");
    expect(res.itemsFound).toBe(2);
    expect(res.itemsRejected).toBe(2);
    expect(res.itemsProcessed).toBe(0);
    expect(res.status).not.toBe("SUCCESS");

    const directCheck = determineCollectorStatusAndOutcome({
      itemsFound: 3,
      itemsProcessed: 0,
      itemsDuplicated: 0,
      itemsRejected: 3,
      itemsPendingClassification: 0,
      errorCount: 0,
      hasPendingPages: false,
    });
    expect(directCheck).toEqual({
      status: "PARTIAL",
      outcome: "ALL_REJECTED",
    });
  });

  it("bloqueia CSRF com Origin ausente, Origin nulo, domínio/porta/protocolo inválidos, Sec-Fetch-Site cross-site e token divergente", async () => {
    const prodOpts = {
      configuredAppUrl: "https://radar.roqueconsultoriadigital.com.br",
      nodeEnv: "production",
    };

    const reqMissingOrigin = new NextRequest(
      "https://radar.roqueconsultoriadigital.com.br/api/auth/login",
      { method: "POST" }
    );
    expect(validateCsrfRequest(reqMissingOrigin, prodOpts).valid).toBe(false);

    const reqNullOrigin = new NextRequest(
      "https://radar.roqueconsultoriadigital.com.br/api/auth/login",
      { method: "POST", headers: { origin: "null" } }
    );
    expect(validateCsrfRequest(reqNullOrigin, prodOpts).valid).toBe(false);

    const reqEvilOrigin = new NextRequest(
      "https://radar.roqueconsultoriadigital.com.br/api/admin/news",
      {
        method: "POST",
        headers: { origin: "https://atacante.exemplo.com" },
      }
    );
    expect(validateCsrfRequest(reqEvilOrigin, prodOpts).valid).toBe(false);

    const reqWrongProto = new NextRequest(
      "https://radar.roqueconsultoriadigital.com.br/api/admin/news",
      {
        method: "POST",
        headers: { origin: "http://radar.roqueconsultoriadigital.com.br" },
      }
    );
    expect(validateCsrfRequest(reqWrongProto, prodOpts).valid).toBe(false);

    const reqWrongPort = new NextRequest(
      "https://radar.roqueconsultoriadigital.com.br/api/admin/news",
      {
        method: "POST",
        headers: {
          origin: "https://radar.roqueconsultoriadigital.com.br:8443",
        },
      }
    );
    expect(validateCsrfRequest(reqWrongPort, prodOpts).valid).toBe(false);

    const reqCrossSite = new NextRequest(
      "https://radar.roqueconsultoriadigital.com.br/api/admin/news",
      {
        method: "POST",
        headers: {
          origin: "https://radar.roqueconsultoriadigital.com.br",
          "sec-fetch-site": "cross-site",
        },
      }
    );
    expect(validateCsrfRequest(reqCrossSite, prodOpts).valid).toBe(false);

    const reqBadToken = new NextRequest(
      "https://radar.roqueconsultoriadigital.com.br/api/admin/news",
      {
        method: "POST",
        headers: {
          origin: "https://radar.roqueconsultoriadigital.com.br",
          cookie: "radar_rp_csrf=token-valido",
          "x-csrf-token": "token-adulterado",
        },
      }
    );
    expect(validateCsrfRequest(reqBadToken, prodOpts).valid).toBe(false);

    // Middleware deve retornar 403 ao receber POST sem Origin em /api/auth/login
    const mwBlocked = await middleware(reqMissingOrigin);
    expect(mwBlocked.status).toBe(403);
  });

  it("permite requisições legítimas autenticadas, preserva RBAC e não bloqueia Cron Job com Bearer token", async () => {
    const jwt = await new SignJWT({ sid: "sess-123", role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user-123")
      .setJti("jti-123")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(getRequiredAuthSecret());

    // Em dev/local NEXT_PUBLIC_APP_URL no .env é http://localhost:3000
    const prevAppUrl = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

    const legitimateReq = new NextRequest(
      "http://localhost:3000/api/admin/sources",
      {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "sec-fetch-site": "same-origin",
          cookie: "radar_rp_session=" + jwt + "; radar_rp_csrf=csrf-ok-123",
          "x-csrf-token": "csrf-ok-123",
        },
      }
    );
    const mwAllowed = await middleware(legitimateReq);
    expect(mwAllowed.status).toBe(200);

    // Sem sessão em /api/admin retorna 401 mesmo com origem válida
    const unauthAdminReq = new NextRequest(
      "http://localhost:3000/api/admin/sources",
      {
        method: "POST",
        headers: { origin: "http://localhost:3000" },
      }
    );
    const mwUnauth = await middleware(unauthAdminReq);
    expect(mwUnauth.status).toBe(401);

    process.env.NEXT_PUBLIC_APP_URL = prevAppUrl;

    // RBAC preservado
    expect(canPublishContent("ADMIN")).toBe(true);
    expect(canPublishContent("EDITOR")).toBe(true);
    expect(canPublishContent("COLLABORATOR")).toBe(false);
    expect(canManageAdminSettings("ADMIN")).toBe(true);
    expect(canManageAdminSettings("EDITOR")).toBe(false);

    // Rota de Cron Job não pertence ao matcher de sessão de navegador e valida Bearer
    expect(
      middlewareConfig.matcher.some((m) => m.includes("/api/cron"))
    ).toBe(false);
    const prevCron = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "cron-secret-seguro-para-hostinger-2026";
    expect(
      validateCronSecretHeader("Bearer cron-secret-seguro-para-hostinger-2026")
        .authorized
    ).toBe(true);
    expect(validateCronSecretHeader(null).authorized).toBe(false);
    process.env.CRON_SECRET = prevCron;
  });
});
