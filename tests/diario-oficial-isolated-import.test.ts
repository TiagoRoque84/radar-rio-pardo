import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  runImprensaOficialCollector,
  type ImprensaOficialCollectorOptions,
} from "@/lib/collectors/imprensa-oficial-collector";

let mockSessionUser: {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "EDITOR" | "COLLABORATOR";
  sessionId: string;
} | null = null;

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    getCurrentUser: async () => mockSessionUser,
  };
});

/**
 * CI runs against a local seeded SQLite DB (DATABASE_URL=file:./dev.db).
 * These are synthetic fixture rows, never real articles or production inserts.
 */
const legacyEditions = ["999001", "999002", "999003"];
const allFixtureEditions = [
  ...legacyEditions,
  "999010",
  "999011",
  "999012",
  "999013",
  "999014",
  "999015",
  "999016",
  "999017",
  "999018",
  "999019",
  "999020",
  "999021",
  "999022",
];
const pdfUrl = (edition: string, date = "2026-11-12") =>
  `https://dosp.com.br/diario/sp/sao-jose-do-rio-pardo/${date}/ed-${edition}-automated-test.pdf`;
const detailUrl = "https://www.dosp.com.br/leituratexto?p=TESTE999002";

function listing(
  title: string,
  edition: string,
  withText: boolean | string,
  dateBR = "12/11/2026",
  dateIso = "2026-11-12"
): string {
  const textHref = typeof withText === "string" ? withText : detailUrl;
  const textLink = withText ? '<a href="' + textHref + '">Visualizar</a>' : "-";
  return "<html><body><h1>Diário Oficial - São José do Rio Pardo</h1>" +
    "<h2>Listar Atos</h2><table><tr><td>" + title +
    "</td><td>" + dateBR + "</td><td>" + edition +
    '</td><td>9</td><td><a href="' + pdfUrl(edition, dateIso) +
    '">Abrir Edição</a></td><td>' + textLink + "</td></tr></table></body></html>";
}

function minimalTextPdf(pageTextLines: string[]): Uint8Array {
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const commands = pageTextLines
    .map((part, idx) => (idx === 0 ? "" : "0 -18 Td ") + "(" + escape(part) + ") Tj")
    .join(" ");
  const stream = "BT /F1 12 Tf 50 750 Td " + commands + " ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  offsets.slice(1).forEach(offset => {
    pdf += String(offset).padStart(10, "0") + " 00000 n \n";
  });
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

function assertLocalSqliteTestEnv() {
  const url = process.env.DATABASE_URL || "";
  if (url.startsWith("file:")) return;
  if (url.startsWith("mysql://") && process.env.NODE_ENV === "test") {
    const parsed = new URL(url);
    const isLocalHost =
      parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    const isTestDb = parsed.pathname.replace(/^\//, "") === "radar_test";
    if (isLocalHost && isTestDb) return;
  }
  throw new Error(
    "DATABASE_URL de testes deve ser SQLite local (file:) ou MySQL local isolado (127.0.0.1/radar_test)."
  );
}

const fixture: Record<string, string> = {
  Leis: listing("Lei nº 6.999, de 12 de novembro de 2026", legacyEditions[0], false),
  Decretos: listing("8140.2026 - Decreto - atualização UFM", legacyEditions[1], true),
  Portarias: listing("Portaria Nº 20.323 - ato administrativo", legacyEditions[2], false),
};

const officialText =
  "<html><body><h1>IMPRENSA OFICIAL - SÃO JOSÉ DO RIO PARDO</h1>" +
  "<p>Publicado em 12 de novembro de 2026 | Edição nº 999002 | Ano IX</p>" +
  "<h2>DECRETO Nº 8.140, DE 12 DE NOVEMBRO DE 2026.</h2>" +
  "<blockquote>Dispõe sobre a atualização da UFM para o exercício de 2027.</blockquote>" +
  "</body></html>";

describe("Importação simulada de atos oficiais em banco local", () => {
  const runIds: string[] = [];
  const createdUserIds: string[] = [];
  const touchedActIds: string[] = [];

  async function cleanupFixtures() {
    const existingActs = await prisma.gazetteAct.findMany({
      where: { edition: { year: 2026, editionNumber: { in: allFixtureEditions } } },
      select: { id: true, contentHash: true },
    });
    const allActIds = Array.from(new Set([...touchedActIds, ...existingActs.map(a => a.id)]));
    const allHashes = existingActs.map(a => a.contentHash).filter(Boolean);

    if (allActIds.length) {
      await prisma.editorialRevision.deleteMany({
        where: { entityType: "GAZETTE_ACT", entityId: { in: allActIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { entityType: "GazetteAct", entityId: { in: allActIds } },
      });
    }
    if (allHashes.length) {
      await prisma.importedDocument.deleteMany({
        where: { contentHash: { in: allHashes } },
      });
    }
    if (runIds.length) {
      await prisma.importedDocument.deleteMany({
        where: { runId: { in: runIds } },
      });
    }
    for (const edition of allFixtureEditions) {
      await prisma.importedDocument.deleteMany({
        where: { externalId: { contains: `:2026:${edition}:` } },
      });
    }
    await prisma.gazetteEdition.deleteMany({
      where: { year: 2026, editionNumber: { in: allFixtureEditions } },
    });
    if (runIds.length) {
      await prisma.collectionRun.deleteMany({
        where: { id: { in: runIds } },
      });
    }
    if (createdUserIds.length) {
      await prisma.editorialRevision.deleteMany({
        where: { createdById: { in: createdUserIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { userId: { in: createdUserIds } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
  }

  beforeAll(async () => {
    assertLocalSqliteTestEnv();
    await cleanupFixtures();
  });

  afterAll(async () => {
    mockSessionUser = null;
    vi.unstubAllGlobals();
    await cleanupFixtures();
    await prisma.$disconnect();
  });

  async function runWithMockedCollector(options?: ImprensaOficialCollectorOptions) {
    const adapter = await prisma.integrationAdapter.findUnique({
      where: { adapterKey: "imprensa-oficial-sjrp" },
      include: { source: true },
    });
    expect(adapter).not.toBeNull();
    const run = await prisma.collectionRun.create({
      data: { adapterId: adapter!.id, status: "RUNNING", triggerType: "MANUAL" },
    });
    runIds.push(run.id);
    return runImprensaOficialCollector(
      {
        adapterId: adapter!.id,
        adapterKey: adapter!.adapterKey,
        sourceId: adapter!.sourceId,
        sourceUrl: adapter!.source.url,
        agencyId: adapter!.source.agencyId,
        runId: run.id,
      },
      options
    );
  }

  it("cria rascunhos com data/órgão verificados, sem publicar, e deduplica na reexecução", async () => {
    assertLocalSqliteTestEnv();

    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const target = new URL(String(url));
      if (target.pathname === "/listaatos.php") {
        const html = fixture[target.searchParams.get("s") || ""];
        if (!html) return new Response("not found", { status: 404 });
        return new Response(html, { headers: { "content-type": "text/html" } });
      }
      if (target.pathname === "/leituratexto") {
        return new Response(officialText, {
          headers: { "content-type": "text/html" },
        });
      }
      throw new Error("Endereço inesperado no mock; não requisitar rede externa");
    }));

    const first = await runWithMockedCollector();
    expect(first.status).toBe("SUCCESS");
    expect(first.itemsProcessed).toBe(3);
    expect(first.itemsDuplicated).toBe(0);

    const acts = await prisma.gazetteAct.findMany({
      where: { edition: { editionNumber: { in: legacyEditions }, year: 2026 } },
      include: { edition: true },
    });
    expect(acts).toHaveLength(3);
    expect(acts.every(x => x.status === "DRAFT_IMPORTED")).toBe(true);
    expect(acts.every(x => x.agencyId === null)).toBe(true);

    const decree = acts.find(x => x.edition.editionNumber === legacyEditions[1]);
    const law = acts.find(x => x.edition.editionNumber === legacyEditions[0]);
    expect(decree?.actNumber).toBe("8140");
    expect(decree?.actDate?.toISOString().slice(0, 10)).toBe("2026-11-12");
    expect(law?.actDate).toBeNull();
    expect(decree?.edition.publicationDate.toISOString().slice(0, 10)).toBe("2026-11-12");

    const second = await runWithMockedCollector();
    expect(second.itemsProcessed).toBe(0);
    expect(second.itemsDuplicated).toBe(3);
    expect(await prisma.gazetteAct.count({
      where: { edition: { editionNumber: { in: legacyEditions }, year: 2026 } },
    })).toBe(3);
  }, 15_000);

  it("extrai segmento PDF com mascaramento LGPD, flag de anexo/tabela e data do cabeçalho para fila editorial", async () => {
    assertLocalSqliteTestEnv();

    const pdf999010 = minimalTextPdf([
      "DIARIO OFICIAL - MUNICIPIO DE SAO JOSE DO RIO PARDO",
      "Decreto n. 8.142/2026 - Pagina 1 de 1",
      "DECRETO N. 8.142, DE 12 DE NOVEMBRO DE 2026.",
      "Art. 1 Fixa valores e designa responsavel CPF 111.222.333-44, e-mail servidor@gmail.com.",
      "ANEXO AO DECRETO N. 8.142/2026",
      "Tabela de valores: R$ 195,62.",
    ]);

    const edition999010Listing = listing(
      "8142.2026 - Decreto de 20 de novembro - atualizacao UFM",
      "999010",
      false,
      "20/11/2026",
      "2026-11-20"
    );
    const auxHtml999010 =
      "<html><body><h1>IMPRENSA OFICIAL - SÃO JOSÉ DO RIO PARDO</h1>" +
      "<p>Publicado em 20 de novembro de 2026 | Edição nº 999010</p>" +
      "<p>Registro auxiliar sem cabeçalho verificável.</p></body></html>";

    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const target = new URL(String(url));
      if (target.pathname === "/listaatos.php") {
        const s = target.searchParams.get("s");
        if (s === "Decretos") {
          return new Response(edition999010Listing, { headers: { "content-type": "text/html" } });
        }
        if (s === "Leis") {
          return new Response(
            listing("Lei 7001 - auxiliar", "999010", "https://www.dosp.com.br/leituratexto?p=AUX1", "20/11/2026", "2026-11-20"),
            { headers: { "content-type": "text/html" } }
          );
        }
        if (s === "Portarias") {
          return new Response(
            listing("Portaria 20330 - auxiliar", "999010", "https://www.dosp.com.br/leituratexto?p=AUX2", "20/11/2026", "2026-11-20"),
            { headers: { "content-type": "text/html" } }
          );
        }
      }
      if (target.pathname === "/leituratexto") {
        return new Response(auxHtml999010, { headers: { "content-type": "text/html" } });
      }
      if (target.pathname.includes("ed-999010-")) {
        return new Response(pdf999010, { headers: { "content-type": "application/pdf" } });
      }
      throw new Error(`URL inesperada: ${target.toString()}`);
    }));

    const result = await runWithMockedCollector();
    expect(result.status).toBe("SUCCESS");

    const act = await prisma.gazetteAct.findFirst({
      where: { edition: { editionNumber: "999010", year: 2026 }, category: { slug: "decretos" } },
      include: { edition: true },
    });
    expect(act).not.toBeNull();
    touchedActIds.push(act!.id);

    expect(act!.status).toBe("DRAFT_IMPORTED");
    expect(act!.agencyId).toBeNull();
    expect(act!.actNumber).toBe("8142");
    expect(act!.actDate?.toISOString().slice(0, 10)).toBe("2026-11-12");
    expect(act!.edition.publicationDate.toISOString().slice(0, 10)).toBe("2026-11-20");
    expect(act!.pageNumber).toBe(1);
    expect(act!.hasPersonalDataAlert).toBe(true);
    expect(act!.objectiveSummary).toMatch(/^Texto extraído do PDF oficial \(revisão obrigatória\):/);
    expect(act!.rawExcerpt).toContain("***.222.***-44");
    expect(act!.rawExcerpt).toContain("[E-MAIL PESSOAL OCULTADO - LGPD]");
    expect(act!.rawExcerpt).not.toContain("111.222.333-44");
    expect(act!.rawExcerpt).not.toContain("servidor@gmail.com");

    const doc = await prisma.importedDocument.findUnique({
      where: { contentHash: act!.contentHash },
    });
    expect(doc?.mimeType).toBe("application/pdf");
    expect(doc?.extractionStatus).toBe("EXTRACTED_PDF_ANNEX_CHECK");
    expect(doc?.rawText).not.toContain("111.222.333-44");
  }, 15_000);

  it("faz upgrade seguro de METADATA_ONLY em DRAFT_IMPORTED sem duplicar e protege atos já revisados", async () => {
    assertLocalSqliteTestEnv();

    let pdfAvailable = false;
    const pdf999011 = minimalTextPdf([
      "Decreto n. 8.145/2026 - Pagina 1 de 1",
      "DECRETO N. 8.145, DE 12 DE NOVEMBRO DE 2026.",
      "Art. 1 Organiza atendimento municipal sem dados pessoais.",
    ]);
    const pdf999012 = minimalTextPdf([
      "Decreto n. 8.146/2026 - Pagina 1 de 1",
      "DECRETO N. 8.146, DE 12 DE NOVEMBRO DE 2026.",
      "Art. 1 Texto novo que nao deve sobrescrever revisao humana.",
    ]);

    const decreesHtml =
      "<html><body><h1>Diário Oficial - São José do Rio Pardo</h1><h2>Listar Atos</h2><table>" +
      '<tr><td>8145.2026 - Decreto atendimento</td><td>12/11/2026</td><td>999011</td><td>9</td><td><a href="' +
      pdfUrl("999011") + '">Abrir</a></td><td>-</td></tr>' +
      '<tr><td>8146.2026 - Decreto ja revisado</td><td>12/11/2026</td><td>999012</td><td>9</td><td><a href="' +
      pdfUrl("999012") + '">Abrir</a></td><td>-</td></tr>' +
      "</table></body></html>";

    const auxHtml = (edition: string, actTitle: string) =>
      `<html><body><h1>IMPRENSA OFICIAL - SÃO JOSÉ DO RIO PARDO</h1><p>Publicado em 12/11/2026 | Edição nº ${edition}</p><blockquote>${actTitle}</blockquote></body></html>`;

    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const target = new URL(String(url));
      if (target.pathname === "/listaatos.php") {
        const s = target.searchParams.get("s");
        if (s === "Decretos") return new Response(decreesHtml, { headers: { "content-type": "text/html" } });
        if (s === "Leis") {
          return new Response(
            listing("Lei 7002 - auxiliar", "999011", "https://www.dosp.com.br/leituratexto?p=AUX11"),
            { headers: { "content-type": "text/html" } }
          );
        }
        if (s === "Portarias") {
          return new Response(
            listing("Portaria 20331 - auxiliar", "999011", "https://www.dosp.com.br/leituratexto?p=AUX12"),
            { headers: { "content-type": "text/html" } }
          );
        }
      }
      if (target.pathname === "/leituratexto") {
        return new Response(auxHtml("999011", "Registro auxiliar de teste."), {
          headers: { "content-type": "text/html" },
        });
      }
      if (!pdfAvailable) {
        return new Response("Indisponivel", { status: 503 });
      }
      if (target.pathname.includes("ed-999011-")) {
        return new Response(pdf999011, { headers: { "content-type": "application/pdf" } });
      }
      if (target.pathname.includes("ed-999012-")) {
        return new Response(pdf999012, { headers: { "content-type": "application/pdf" } });
      }
      throw new Error(`URL inesperada: ${target.toString()}`);
    }));

    // 1ª execução: ambos falham HTTP 503 e entram como METADATA_ONLY_HTTP_ERROR
    await runWithMockedCollector();
    const act11Before = await prisma.gazetteAct.findFirst({
      where: { edition: { editionNumber: "999011", year: 2026 }, category: { slug: "decretos" } },
    });
    const act12Before = await prisma.gazetteAct.findFirst({
      where: { edition: { editionNumber: "999012", year: 2026 }, category: { slug: "decretos" } },
    });
    expect(act11Before?.rawExcerpt).toBeNull();
    expect(act12Before?.rawExcerpt).toBeNull();
    touchedActIds.push(act11Before!.id, act12Before!.id);

    // Simula que um editor já revisou manualmente o ato 999012 (IN_REVIEW)
    await prisma.gazetteAct.update({
      where: { id: act12Before!.id },
      data: {
        status: "IN_REVIEW",
        titleSimple: "Título revisado pelo editor",
        objectiveSummary: "Resumo já conferido manualmente pelo editor antes da coleta.",
      },
    });

    // 2ª execução: PDFs ficam disponíveis
    pdfAvailable = true;
    const secondRun = await runWithMockedCollector();
    expect(secondRun.itemsProcessed).toBe(1);

    // 999011 recebeu upgrade sem duplicar
    const count11 = await prisma.gazetteAct.count({
      where: { edition: { editionNumber: "999011", year: 2026 }, category: { slug: "decretos" } },
    });
    expect(count11).toBe(1);
    const act11After = await prisma.gazetteAct.findUnique({ where: { id: act11Before!.id } });
    const doc11After = await prisma.importedDocument.findUnique({
      where: { contentHash: act11Before!.contentHash },
    });
    expect(act11After?.status).toBe("DRAFT_IMPORTED");
    expect(act11After?.pageNumber).toBe(1);
    expect(act11After?.actDate?.toISOString().slice(0, 10)).toBe("2026-11-12");
    expect(act11After?.rawExcerpt).toContain("Organiza atendimento municipal");
    expect(doc11After?.extractionStatus).toBe("EXTRACTED_PDF_FOR_REVIEW");

    // 999012 (IN_REVIEW) permaneceu intocado
    const act12After = await prisma.gazetteAct.findUnique({ where: { id: act12Before!.id } });
    expect(act12After?.status).toBe("IN_REVIEW");
    expect(act12After?.titleSimple).toBe("Título revisado pelo editor");
    expect(act12After?.objectiveSummary).toBe(
      "Resumo já conferido manualmente pelo editor antes da coleta."
    );
    expect(act12After?.rawExcerpt).toBeNull();
  }, 15_000);

  it("classifica falhas de PDF sem camada de texto e texto misturado sem inventar resumo", async () => {
    assertLocalSqliteTestEnv();

    const emptyPdf = minimalTextPdf(["   "]);
    const mixedPdf = minimalTextPdf([
      "Decreto n. 8.150/2026 - Pagina 1 de 1",
      "DECRETO N. 8.150, DE 12 DE NOVEMBRO DE 2026.",
      "Art. 1 Conteudo do decreto.",
      "PORTARIA N. 20.400, DE 12 DE NOVEMBRO DE 2026.",
    ]);

    const decreesHtml =
      "<html><body><h1>Diário Oficial - São José do Rio Pardo</h1><h2>Listar Atos</h2><table>" +
      '<tr><td>8149.2026 - Decreto escaneado</td><td>12/11/2026</td><td>999013</td><td>9</td><td><a href="' +
      pdfUrl("999013") + '">Abrir</a></td><td>-</td></tr>' +
      '<tr><td>8150.2026 - Decreto misturado</td><td>12/11/2026</td><td>999014</td><td>9</td><td><a href="' +
      pdfUrl("999014") + '">Abrir</a></td><td>-</td></tr>' +
      "</table></body></html>";

    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const target = new URL(String(url));
      if (target.pathname === "/listaatos.php") {
        const s = target.searchParams.get("s");
        if (s === "Decretos") return new Response(decreesHtml, { headers: { "content-type": "text/html" } });
        if (s === "Leis") {
          return new Response(
            listing("Lei 7003 - auxiliar", "999013", "https://www.dosp.com.br/leituratexto?p=AUX13"),
            { headers: { "content-type": "text/html" } }
          );
        }
        if (s === "Portarias") {
          return new Response(
            listing("Portaria 20332 - auxiliar", "999013", "https://www.dosp.com.br/leituratexto?p=AUX14"),
            { headers: { "content-type": "text/html" } }
          );
        }
      }
      if (target.pathname === "/leituratexto") {
        return new Response(
          "<html><body><h1>IMPRENSA OFICIAL - SÃO JOSÉ DO RIO PARDO</h1><p>Publicado em 12/11/2026 | Edição nº 999013</p></body></html>",
          { headers: { "content-type": "text/html" } }
        );
      }
      if (target.pathname.includes("ed-999013-")) {
        return new Response(emptyPdf, { headers: { "content-type": "application/pdf" } });
      }
      if (target.pathname.includes("ed-999014-")) {
        return new Response(mixedPdf, { headers: { "content-type": "application/pdf" } });
      }
      throw new Error(`URL inesperada: ${target.toString()}`);
    }));

    await runWithMockedCollector();

    const act13 = await prisma.gazetteAct.findFirst({
      where: { edition: { editionNumber: "999013", year: 2026 }, category: { slug: "decretos" } },
    });
    const act14 = await prisma.gazetteAct.findFirst({
      where: { edition: { editionNumber: "999014", year: 2026 }, category: { slug: "decretos" } },
    });
    expect(act13?.status).toBe("DRAFT_IMPORTED");
    expect(act13?.rawExcerpt).toBeNull();
    expect(act14?.status).toBe("DRAFT_IMPORTED");
    expect(act14?.rawExcerpt).toBeNull();

    const doc13 = await prisma.importedDocument.findUnique({ where: { contentHash: act13!.contentHash } });
    const doc14 = await prisma.importedDocument.findUnique({ where: { contentHash: act14!.contentHash } });
    expect(doc13?.extractionStatus).toBe("METADATA_ONLY_NO_TEXT_LAYER");
    expect(doc14?.extractionStatus).toBe("METADATA_ONLY_MIXED_TEXT");
  }, 15_000);

  it("cumpre o fluxo editorial completo na API administrativa (DRAFT_IMPORTED -> IN_REVIEW -> PUBLISHED)", async () => {
    assertLocalSqliteTestEnv();

    let editor = await prisma.user.findFirst({
      where: { role: "EDITOR", active: true },
    });
    if (!editor) {
      editor = await prisma.user.create({
        data: {
          name: "Editor Teste Isolado",
          email: "editor-isolado@radarriopardo.local",
          passwordHash: "hash-nao-usado-em-teste",
          role: "EDITOR",
          active: true,
        },
      });
      createdUserIds.push(editor.id);
    }

    mockSessionUser = {
      id: editor.id,
      name: editor.name,
      email: editor.email,
      role: "EDITOR",
      sessionId: "test-session",
    };

    const targetAct = await prisma.gazetteAct.findFirst({
      where: { edition: { editionNumber: "999011", year: 2026 }, category: { slug: "decretos" } },
    });
    expect(targetAct).not.toBeNull();
    const agency = await prisma.publicAgency.findFirst({ where: { active: true } });

    const { GET, POST } = await import("@/app/api/admin/gazette/route");

    // 1. GET retorna extractionStatus e agencies para o painel
    const getRes = await GET();
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    const listedAct = (getData.acts as Array<{ id: string; extractionStatus: string | null }>).find(
      (a) => a.id === targetAct!.id
    );
    expect(listedAct?.extractionStatus).toBe("EXTRACTED_PDF_FOR_REVIEW");
    expect(Array.isArray(getData.agencies)).toBe(true);

    const makePost = (payload: unknown) =>
      POST(
        new NextRequest("http://localhost:3000/api/admin/gazette", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      );

    // 2. Bloqueia publicação direta de DRAFT_IMPORTED (mesmo com versão válida)
    const blockedPublish = await makePost({
      action: "PUBLISH_ACT",
      actId: targetAct!.id,
      expectedUpdatedAt: targetAct!.updatedAt.toISOString(),
    });
    expect(blockedPublish.status).toBe(409);

    // 3. Bloqueia envio para IN_REVIEW mantendo resumo automático do PDF
    const blockedPlaceholder = await makePost({
      action: "REWRITE_IMPORTED_ACT",
      actId: targetAct!.id,
      titleSimple: "Decreto 8.145 atualizado",
      objectiveSummary:
        "Texto extraído do PDF oficial (revisão obrigatória): Página 1 da Edição nº 999011.",
      saveMode: "SEND_TO_REVIEW",
      expectedUpdatedAt: targetAct!.updatedAt.toISOString(),
    });
    expect(blockedPlaceholder.status).toBe(400);

    // 4. Permite salvar rascunho parcial com conferência de metadados sem publicar
    const draftRes = await makePost({
      action: "REWRITE_IMPORTED_ACT",
      actId: targetAct!.id,
      titleSimple: "Decreto 8.145 sobre atendimento municipal",
      objectiveSummary: "Rascunho em conferência humana.",
      actNumber: "8145",
      actDate: "2026-11-12",
      pageNumber: 2,
      agencyId: agency?.id ?? null,
      saveMode: "SAVE_DRAFT",
      expectedUpdatedAt: targetAct!.updatedAt.toISOString(),
    });
    expect(draftRes.status).toBe(200);
    const draftJson = await draftRes.json();
    expect(draftJson.act.status).toBe("DRAFT_IMPORTED");
    expect(draftJson.act.pageNumber).toBe(2);

    // Continua invisível na query pública
    expect(
      await prisma.gazetteAct.count({ where: { id: targetAct!.id, status: "PUBLISHED" } })
    ).toBe(0);

    // 5. Envia para IN_REVIEW com resumo cidadão redigido pelo editor
    const reviewRes = await makePost({
      action: "REWRITE_IMPORTED_ACT",
      actId: targetAct!.id,
      titleSimple: "Decreto 8.145 organiza atendimento municipal em São José do Rio Pardo",
      objectiveSummary:
        "O decreto define regras de atendimento municipal após conferência integral do documento oficial.",
      actNumber: "8145",
      actDate: "2026-11-12",
      pageNumber: 2,
      agencyId: agency?.id ?? null,
      deadlinesText: "Vigência a partir de 12/11/2026.",
      saveMode: "SEND_TO_REVIEW",
      expectedUpdatedAt: draftJson.act.updatedAt,
    });
    expect(reviewRes.status).toBe(200);
    const reviewJson = await reviewRes.json();
    expect(reviewJson.act.status).toBe("IN_REVIEW");

    // Verifica criação de EditorialRevision
    const revisions = await prisma.editorialRevision.count({
      where: { entityType: "GAZETTE_ACT", entityId: targetAct!.id },
    });
    expect(revisions).toBe(2);

    // Continua invisível na query pública até PUBLISH_ACT
    expect(
      await prisma.gazetteAct.count({ where: { id: targetAct!.id, status: "PUBLISHED" } })
    ).toBe(0);

    // 6. Aprovação e publicação final
    const publishRes = await makePost({
      action: "PUBLISH_ACT",
      actId: targetAct!.id,
      expectedUpdatedAt: reviewJson.act.updatedAt,
    });
    expect(publishRes.status).toBe(200);
    expect(
      await prisma.gazetteAct.count({ where: { id: targetAct!.id, status: "PUBLISHED" } })
    ).toBe(1);
  }, 15_000);

  it("preserva rascunho editado via SAVE_DRAFT quando coleta posterior extrai PDF e continua enriquecendo rascunho intacto", async () => {
    assertLocalSqliteTestEnv();

    let editor = await prisma.user.findFirst({
      where: { role: "EDITOR", active: true },
    });
    if (!editor) {
      editor = await prisma.user.create({
        data: {
          name: "Editor Preservacao Draft",
          email: "editor-preservacao@radarriopardo.local",
          passwordHash: "hash-nao-usado-em-teste",
          role: "EDITOR",
          active: true,
        },
      });
      createdUserIds.push(editor.id);
    }
    mockSessionUser = {
      id: editor.id,
      name: editor.name,
      email: editor.email,
      role: "EDITOR",
      sessionId: "test-session-preservacao",
    };

    const agency = await prisma.publicAgency.findFirst({ where: { active: true } });
    let pdfAvailable = false;

    const pdf999015 = minimalTextPdf([
      "Decreto n. 8.155/2026 - Pagina 1 de 1",
      "DECRETO N. 8.155, DE 12 DE NOVEMBRO DE 2026.",
      "Art. 1 Conteudo oficial extraido com CPF 999.888.777-66 para conferencia.",
    ]);
    const pdf999016 = minimalTextPdf([
      "Decreto n. 8.156/2026 - Pagina 1 de 1",
      "DECRETO N. 8.156, DE 12 DE NOVEMBRO DE 2026.",
      "Art. 1 Conteudo oficial de rascunho automatico sem edicao humana.",
    ]);

    const decreesHtml =
      "<html><body><h1>Diário Oficial - São José do Rio Pardo</h1><h2>Listar Atos</h2><table>" +
      '<tr><td>8155.2026 - Decreto editado em SAVE_DRAFT</td><td>12/11/2026</td><td>999015</td><td>9</td><td><a href="' +
      pdfUrl("999015") + '">Abrir</a></td><td>-</td></tr>' +
      '<tr><td>8156.2026 - Decreto automatico intacto</td><td>12/11/2026</td><td>999016</td><td>9</td><td><a href="' +
      pdfUrl("999016") + '">Abrir</a></td><td>-</td></tr>' +
      "</table></body></html>";

    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const target = new URL(String(url));
      if (target.pathname === "/listaatos.php") {
        const s = target.searchParams.get("s");
        if (s === "Decretos") return new Response(decreesHtml, { headers: { "content-type": "text/html" } });
        if (s === "Leis") {
          return new Response(
            listing("Lei 7015 - auxiliar", "999015", "https://www.dosp.com.br/leituratexto?p=AUX15"),
            { headers: { "content-type": "text/html" } }
          );
        }
        if (s === "Portarias") {
          return new Response(
            listing("Portaria 20345 - auxiliar", "999015", "https://www.dosp.com.br/leituratexto?p=AUX16"),
            { headers: { "content-type": "text/html" } }
          );
        }
      }
      if (target.pathname === "/leituratexto") {
        return new Response(
          "<html><body><h1>IMPRENSA OFICIAL - SÃO JOSÉ DO RIO PARDO</h1><p>Publicado em 12/11/2026</p></body></html>",
          { headers: { "content-type": "text/html" } }
        );
      }
      if (!pdfAvailable) {
        return new Response("Indisponivel", { status: 503 });
      }
      if (target.pathname.includes("ed-999015-")) {
        return new Response(pdf999015, { headers: { "content-type": "application/pdf" } });
      }
      if (target.pathname.includes("ed-999016-")) {
        return new Response(pdf999016, { headers: { "content-type": "application/pdf" } });
      }
      throw new Error(`URL inesperada: ${target.toString()}`);
    }));

    // 1ª coleta: ambos entram como METADATA_ONLY_HTTP_ERROR em DRAFT_IMPORTED
    await runWithMockedCollector();
    const act15 = await prisma.gazetteAct.findFirst({
      where: { edition: { editionNumber: "999015", year: 2026 }, category: { slug: "decretos" } },
    });
    const act16 = await prisma.gazetteAct.findFirst({
      where: { edition: { editionNumber: "999016", year: 2026 }, category: { slug: "decretos" } },
    });
    expect(act15).not.toBeNull();
    expect(act16).not.toBeNull();
    touchedActIds.push(act15!.id, act16!.id);
    expect(act15!.reviewedById).toBeNull();
    expect(act15!.reviewedAt).toBeNull();

    // Edição humana via SAVE_DRAFT apenas em 999015
    const { POST } = await import("@/app/api/admin/gazette/route");
    const saveDraftRes = await POST(
      new NextRequest("http://localhost:3000/api/admin/gazette", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "REWRITE_IMPORTED_ACT",
          actId: act15!.id,
          titleSimple: "Decreto 8.155 editado manualmente pelo editor",
          objectiveSummary: "Rascunho humano confirmado aguardando texto oficial.",
          actNumber: "8155-REV",
          actDate: "2026-11-10",
          pageNumber: 3,
          agencyId: agency?.id ?? null,
          deadlinesText: "Prazo confirmado manualmente: 30 dias.",
          saveMode: "SAVE_DRAFT",
          expectedUpdatedAt: act15!.updatedAt.toISOString(),
        }),
      })
    );
    expect(saveDraftRes.status).toBe(200);
    const saved15 = await prisma.gazetteAct.findUnique({ where: { id: act15!.id } });
    expect(saved15?.status).toBe("DRAFT_IMPORTED");
    expect(saved15?.reviewedById).toBe(editor.id);
    expect(saved15?.reviewedAt).not.toBeNull();

    // 2ª coleta: PDFs passam a estar disponíveis
    pdfAvailable = true;
    const secondRun = await runWithMockedCollector();
    expect(secondRun.errorCount).toBe(0);

    // 999015 preservou todos os campos editoriais salvos em SAVE_DRAFT e enriqueceu apenas o texto de origem
    expect(
      await prisma.gazetteAct.count({
        where: { edition: { editionNumber: "999015", year: 2026 }, category: { slug: "decretos" } },
      })
    ).toBe(1);
    const after15 = await prisma.gazetteAct.findUnique({ where: { id: act15!.id } });
    const doc15 = await prisma.importedDocument.findUnique({
      where: { contentHash: act15!.contentHash },
    });
    expect(after15?.status).toBe("DRAFT_IMPORTED");
    expect(after15?.titleSimple).toBe("Decreto 8.155 editado manualmente pelo editor");
    expect(after15?.objectiveSummary).toBe(
      "Rascunho humano confirmado aguardando texto oficial."
    );
    expect(after15?.actNumber).toBe("8155-REV");
    expect(after15?.actDate?.toISOString().slice(0, 10)).toBe("2026-11-10");
    expect(after15?.pageNumber).toBe(3);
    expect(after15?.agencyId).toBe(agency?.id ?? null);
    expect(after15?.deadlinesText).toBe("Prazo confirmado manualmente: 30 dias.");
    expect(after15?.reviewedById).toBe(editor.id);
    expect(after15?.rawExcerpt).toContain("Conteudo oficial extraido");
    expect(after15?.rawExcerpt).not.toContain("999.888.777-66");
    expect(after15?.hasPersonalDataAlert).toBe(true);
    expect(doc15?.extractionStatus).toBe("EXTRACTED_PDF_FOR_REVIEW");
    expect(doc15?.rawText).toContain("Conteudo oficial extraido");
    expect(doc15?.rawText).not.toContain("999.888.777-66");

    // 999016 (intacto, sem edição humana) foi normalmente enriquecido no mesmo registro
    expect(
      await prisma.gazetteAct.count({
        where: { edition: { editionNumber: "999016", year: 2026 }, category: { slug: "decretos" } },
      })
    ).toBe(1);
    const after16 = await prisma.gazetteAct.findUnique({ where: { id: act16!.id } });
    const doc16 = await prisma.importedDocument.findUnique({
      where: { contentHash: act16!.contentHash },
    });
    expect(after16?.status).toBe("DRAFT_IMPORTED");
    expect(after16?.pageNumber).toBe(1);
    expect(after16?.actNumber).toBe("8156");
    expect(after16?.actDate?.toISOString().slice(0, 10)).toBe("2026-11-12");
    expect(after16?.objectiveSummary).toMatch(/^Texto extraído do PDF oficial \(revisão obrigatória\):/);
    expect(after16?.rawExcerpt).toContain("rascunho automatico sem edicao humana");
    expect(doc16?.extractionStatus).toBe("EXTRACTED_PDF_FOR_REVIEW");
  }, 15_000);

  it("descarta com rollback atômico a atualização da coleta se ocorrer revisão ou publicação concorrente após a extração", async () => {
    assertLocalSqliteTestEnv();

    let editor = await prisma.user.findFirst({
      where: { role: "EDITOR", active: true },
    });
    if (!editor) {
      editor = await prisma.user.create({
        data: {
          name: "Editor Concorrencia Coleta",
          email: "editor-concorrencia-coleta@radarriopardo.local",
          passwordHash: "hash-nao-usado-em-teste",
          role: "EDITOR",
          active: true,
        },
      });
      createdUserIds.push(editor.id);
    }
    mockSessionUser = {
      id: editor.id,
      name: editor.name,
      email: editor.email,
      role: "EDITOR",
      sessionId: "test-session-coleta-race",
    };

    let pdfAvailable = false;
    const pdf999017 = minimalTextPdf([
      "Decreto n. 8.157/2026 - Pagina 1 de 1",
      "DECRETO N. 8.157, DE 12 DE NOVEMBRO DE 2026.",
      "Art. 1 Conteudo extraido que nao pode sobrescrever revisao concorrente.",
    ]);
    const pdf999018 = minimalTextPdf([
      "Decreto n. 8.158/2026 - Pagina 1 de 1",
      "DECRETO N. 8.158, DE 12 DE NOVEMBRO DE 2026.",
      "Art. 1 Conteudo extraido que nao pode alterar ato ja publicado.",
    ]);

    const decreesHtml =
      "<html><body><h1>Diário Oficial - São José do Rio Pardo</h1><h2>Listar Atos</h2><table>" +
      '<tr><td>8157.2026 - Decreto concorrente IN_REVIEW</td><td>12/11/2026</td><td>999017</td><td>9</td><td><a href="' +
      pdfUrl("999017") + '">Abrir</a></td><td>-</td></tr>' +
      '<tr><td>8158.2026 - Decreto concorrente PUBLISHED</td><td>12/11/2026</td><td>999018</td><td>9</td><td><a href="' +
      pdfUrl("999018") + '">Abrir</a></td><td>-</td></tr>' +
      "</table></body></html>";

    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const target = new URL(String(url));
      if (target.pathname === "/listaatos.php") {
        const s = target.searchParams.get("s");
        if (s === "Decretos") return new Response(decreesHtml, { headers: { "content-type": "text/html" } });
        if (s === "Leis") {
          return new Response(
            listing("Lei 7017 - auxiliar", "999017", "https://www.dosp.com.br/leituratexto?p=AUX17"),
            { headers: { "content-type": "text/html" } }
          );
        }
        if (s === "Portarias") {
          return new Response(
            listing("Portaria 20347 - auxiliar", "999017", "https://www.dosp.com.br/leituratexto?p=AUX18"),
            { headers: { "content-type": "text/html" } }
          );
        }
      }
      if (target.pathname === "/leituratexto") {
        return new Response(
          "<html><body><h1>IMPRENSA OFICIAL - SÃO JOSÉ DO RIO PARDO</h1><p>Publicado em 12/11/2026</p></body></html>",
          { headers: { "content-type": "text/html" } }
        );
      }
      if (!pdfAvailable) {
        return new Response("Indisponivel", { status: 503 });
      }
      if (target.pathname.includes("ed-999017-")) {
        return new Response(pdf999017, { headers: { "content-type": "application/pdf" } });
      }
      if (target.pathname.includes("ed-999018-")) {
        return new Response(pdf999018, { headers: { "content-type": "application/pdf" } });
      }
      throw new Error(`URL inesperada: ${target.toString()}`);
    }));

    // 1ª coleta: cria os dois registros em METADATA_ONLY_HTTP_ERROR
    await runWithMockedCollector();
    const act17 = await prisma.gazetteAct.findFirst({
      where: { edition: { editionNumber: "999017", year: 2026 }, category: { slug: "decretos" } },
    });
    const act18 = await prisma.gazetteAct.findFirst({
      where: { edition: { editionNumber: "999018", year: 2026 }, category: { slug: "decretos" } },
    });
    expect(act17).not.toBeNull();
    expect(act18).not.toBeNull();
    touchedActIds.push(act17!.id, act18!.id);

    const { POST } = await import("@/app/api/admin/gazette/route");
    const makePost = (payload: unknown) =>
      POST(
        new NextRequest("http://localhost:3000/api/admin/gazette", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      );

    // 2ª coleta com barreira determinística pós-extração:
    // enquanto a coleta conclui a extração de cada PDF e antes de persistir no banco,
    // um editor envia 999017 para IN_REVIEW e envia/publica 999018.
    pdfAvailable = true;
    const interceptedEditions: string[] = [];
    const concurrentRun = await runWithMockedCollector({
      onAfterExtractBeforeSave: async ({ item }) => {
        if (item.kind === "Decretos" && item.editionNumber === "999017") {
          interceptedEditions.push(item.editionNumber);
          const res = await makePost({
            action: "REWRITE_IMPORTED_ACT",
            actId: act17!.id,
            titleSimple: "Decreto 8.157 revisado concorrentemente",
            objectiveSummary:
              "Revisão humana concluída enquanto a coleta finalizava a extração do PDF oficial.",
            saveMode: "SEND_TO_REVIEW",
            expectedUpdatedAt: act17!.updatedAt.toISOString(),
          });
          expect(res.status).toBe(200);
        }
        if (item.kind === "Decretos" && item.editionNumber === "999018") {
          interceptedEditions.push(item.editionNumber);
          const reviewRes = await makePost({
            action: "REWRITE_IMPORTED_ACT",
            actId: act18!.id,
            titleSimple: "Decreto 8.158 publicado concorrentemente",
            objectiveSummary:
              "Resumo conferido e publicado antes de a coleta tentar gravar o PDF extraído.",
            saveMode: "SEND_TO_REVIEW",
            expectedUpdatedAt: act18!.updatedAt.toISOString(),
          });
          expect(reviewRes.status).toBe(200);
          const reviewJson = await reviewRes.json();
          const publishRes = await makePost({
            action: "PUBLISH_ACT",
            actId: act18!.id,
            expectedUpdatedAt: reviewJson.act.updatedAt,
          });
          expect(publishRes.status).toBe(200);
        }
      },
    });

    expect(interceptedEditions).toEqual(["999017", "999018"]);
    expect(concurrentRun.errorCount).toBe(0);
    expect(concurrentRun.logText).toContain(
      "atualização ignorada por alteração editorial concorrente durante a coleta"
    );

    const act17After = await prisma.gazetteAct.findUnique({ where: { id: act17!.id } });
    const doc17After = await prisma.importedDocument.findUnique({
      where: { contentHash: act17!.contentHash },
    });
    expect(act17After?.status).toBe("IN_REVIEW");
    expect(act17After?.titleSimple).toBe("Decreto 8.157 revisado concorrentemente");
    expect(act17After?.rawExcerpt).toBeNull();
    expect(doc17After?.rawText).toBeNull();
    expect(doc17After?.extractionStatus).toBe("METADATA_ONLY_HTTP_ERROR");

    const act18After = await prisma.gazetteAct.findUnique({ where: { id: act18!.id } });
    const doc18After = await prisma.importedDocument.findUnique({
      where: { contentHash: act18!.contentHash },
    });
    expect(act18After?.status).toBe("PUBLISHED");
    expect(act18After?.titleSimple).toBe("Decreto 8.158 publicado concorrentemente");
    expect(act18After?.rawExcerpt).toBeNull();
    expect(doc18After?.rawText).toBeNull();
    expect(doc18After?.extractionStatus).toBe("METADATA_ONLY_HTTP_ERROR");
  }, 15_000);

  it("detecta conflito (409) entre dois editores salvando a mesma versão e bloqueia salvamento concorrente com publicação", async () => {
    assertLocalSqliteTestEnv();

    const suffix = Date.now();
    const editor1 = await prisma.user.create({
      data: {
        name: "Editor Um Conflito",
        email: `editor-um-${suffix}@radarriopardo.local`,
        passwordHash: "hash-nao-usado-em-teste",
        role: "EDITOR",
        active: true,
      },
    });
    const editor2 = await prisma.user.create({
      data: {
        name: "Editor Dois Conflito",
        email: `editor-dois-${suffix}@radarriopardo.local`,
        passwordHash: "hash-nao-usado-em-teste",
        role: "EDITOR",
        active: true,
      },
    });
    createdUserIds.push(editor1.id, editor2.id);

    const category = await prisma.gazetteActCategory.findFirst({ where: { slug: "decretos" } });
    expect(category).not.toBeNull();

    const ed19 = await prisma.gazetteEdition.create({
      data: {
        editionNumber: "999019",
        publicationDate: new Date("2026-11-12T12:00:00.000Z"),
        year: 2026,
        month: 11,
        officialUrl: pdfUrl("999019"),
        status: "PENDING_REVIEW",
      },
    });
    const act19 = await prisma.gazetteAct.create({
      data: {
        editionId: ed19.id,
        categoryId: category!.id,
        titleSimple: "Decreto 8.159 inicial",
        objectiveSummary: "Rascunho inicial para teste de conflito entre editores.",
        officialUrl: pdfUrl("999019"),
        contentHash: `test-hash-999019-${suffix}`,
        status: "DRAFT_IMPORTED",
      },
    });

    const ed20 = await prisma.gazetteEdition.create({
      data: {
        editionNumber: "999020",
        publicationDate: new Date("2026-11-12T12:00:00.000Z"),
        year: 2026,
        month: 11,
        officialUrl: pdfUrl("999020"),
        status: "PENDING_REVIEW",
      },
    });
    const act20 = await prisma.gazetteAct.create({
      data: {
        editionId: ed20.id,
        categoryId: category!.id,
        titleSimple: "Decreto 8.160 em revisão",
        objectiveSummary: "Resumo revisado e pronto para publicação pelo editor.",
        officialUrl: pdfUrl("999020"),
        contentHash: `test-hash-999020-${suffix}`,
        status: "IN_REVIEW",
        reviewedById: editor1.id,
        reviewedAt: new Date(),
      },
    });

    const ed21 = await prisma.gazetteEdition.create({
      data: {
        editionNumber: "999021",
        publicationDate: new Date("2026-11-12T12:00:00.000Z"),
        year: 2026,
        month: 11,
        officialUrl: pdfUrl("999021"),
        status: "PENDING_REVIEW",
      },
    });
    const act21 = await prisma.gazetteAct.create({
      data: {
        editionId: ed21.id,
        categoryId: category!.id,
        titleSimple: "Decreto 8.161 corrida publicação",
        objectiveSummary: "Resumo pronto para testar corrida simultânea com publicação.",
        officialUrl: pdfUrl("999021"),
        contentHash: `test-hash-999021-${suffix}`,
        status: "IN_REVIEW",
        reviewedById: editor1.id,
        reviewedAt: new Date(),
      },
    });
    touchedActIds.push(act19.id, act20.id, act21.id);

    const { POST } = await import("@/app/api/admin/gazette/route");
    const makePost = (payload: unknown) =>
      POST(
        new NextRequest("http://localhost:3000/api/admin/gazette", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      );

    // 1. Dois editores carregam a mesma versão T0 do ato 999019
    const initialVersion = act19.updatedAt.toISOString();

    mockSessionUser = {
      id: editor1.id,
      name: editor1.name,
      email: editor1.email,
      role: "EDITOR",
      sessionId: "test-session-e1",
    };
    const saveEditor1 = await makePost({
      action: "REWRITE_IMPORTED_ACT",
      actId: act19.id,
      titleSimple: "Decreto 8.159 salvo pelo Editor 1",
      objectiveSummary: "Resumo detalhado salvo pelo Editor 1 na versão inicial.",
      saveMode: "SEND_TO_REVIEW",
      expectedUpdatedAt: initialVersion,
    });
    expect(saveEditor1.status).toBe(200);
    const afterEditor1 = await prisma.gazetteAct.findUnique({ where: { id: act19.id } });
    expect(afterEditor1?.titleSimple).toBe("Decreto 8.159 salvo pelo Editor 1");
    expect(afterEditor1?.reviewedById).toBe(editor1.id);
    const versionT1 = afterEditor1!.updatedAt.toISOString();

    // Editor 2 tenta enviar conteúdo antigo OMITINDO expectedUpdatedAt após Editor 1 gerar T1
    mockSessionUser = {
      id: editor2.id,
      name: editor2.name,
      email: editor2.email,
      role: "EDITOR",
      sessionId: "test-session-e2",
    };
    const omittedVersionEditor2 = await makePost({
      action: "REWRITE_IMPORTED_ACT",
      actId: act19.id,
      titleSimple: "Decreto 8.159 sobrescrita sem versao Editor 2",
      objectiveSummary: "Tentativa omitindo expectedUpdatedAt deve ser rejeitada com HTTP 400.",
      saveMode: "SEND_TO_REVIEW",
    });
    expect(omittedVersionEditor2.status).toBe(400);
    const afterOmitted = await prisma.gazetteAct.findUnique({ where: { id: act19.id } });
    expect(afterOmitted?.titleSimple).toBe("Decreto 8.159 salvo pelo Editor 1");
    expect(afterOmitted?.updatedAt.toISOString()).toBe(versionT1);
    expect(
      await prisma.editorialRevision.count({
        where: { entityType: "GAZETTE_ACT", entityId: act19.id },
      })
    ).toBe(1);

    // Editor 2 tenta salvar com base na mesma versão T0 defasada -> HTTP 409
    const saveEditor2 = await makePost({
      action: "REWRITE_IMPORTED_ACT",
      actId: act19.id,
      titleSimple: "Decreto 8.159 sobrescrita indevida Editor 2",
      objectiveSummary: "Tentativa desatualizada que deve falhar com HTTP 409.",
      saveMode: "SEND_TO_REVIEW",
      expectedUpdatedAt: initialVersion,
    });
    expect(saveEditor2.status).toBe(409);

    // Valores inválidos de expectedUpdatedAt são rejeitados (HTTP 400) em REWRITE_IMPORTED_ACT, REVIEW_ACT e PUBLISH_ACT
    const invalidVersions: unknown[] = [
      undefined,
      null,
      "",
      "   ",
      12345,
      { iso: versionT1 },
      "data-invalida",
      "2026-11-12",
    ];
    for (const invalidVer of invalidVersions) {
      const invalidRewrite = await makePost({
        action: "REWRITE_IMPORTED_ACT",
        actId: act19.id,
        titleSimple: "Decreto 8.159 tentativa versao invalida",
        objectiveSummary: "Não pode salvar com expectedUpdatedAt ausente ou malformado.",
        saveMode: "SEND_TO_REVIEW",
        ...(invalidVer !== undefined ? { expectedUpdatedAt: invalidVer } : {}),
      });
      expect(invalidRewrite.status).toBe(400);

      const invalidReview = await makePost({
        action: "REVIEW_ACT",
        actId: act19.id,
        ...(invalidVer !== undefined ? { expectedUpdatedAt: invalidVer } : {}),
      });
      expect(invalidReview.status).toBe(400);

      const invalidPublish = await makePost({
        action: "PUBLISH_ACT",
        actId: act19.id,
        ...(invalidVer !== undefined ? { expectedUpdatedAt: invalidVer } : {}),
      });
      expect(invalidPublish.status).toBe(400);
    }

    // Nenhuma alteração ou revisão espúria após rejeições de versão inválida/omitida
    const afterInvalids = await prisma.gazetteAct.findUnique({ where: { id: act19.id } });
    expect(afterInvalids?.titleSimple).toBe("Decreto 8.159 salvo pelo Editor 1");
    expect(afterInvalids?.status).toBe("IN_REVIEW");
    expect(
      await prisma.editorialRevision.count({
        where: { entityType: "GAZETTE_ACT", entityId: act19.id },
      })
    ).toBe(1);

    // Também garante conflito em execução paralela simultânea na versão atual T1
    const [raceA, raceB] = await Promise.all([
      makePost({
        action: "REWRITE_IMPORTED_ACT",
        actId: act19.id,
        titleSimple: "Decreto 8.159 corrida A",
        objectiveSummary: "Edição concorrente A após recarregar versão T1.",
        saveMode: "SEND_TO_REVIEW",
        expectedUpdatedAt: versionT1,
      }),
      makePost({
        action: "REWRITE_IMPORTED_ACT",
        actId: act19.id,
        titleSimple: "Decreto 8.159 corrida B",
        objectiveSummary: "Edição concorrente B após recarregar versão T1.",
        saveMode: "SEND_TO_REVIEW",
        expectedUpdatedAt: versionT1,
      }),
    ]);
    const raceStatuses = [raceA.status, raceB.status].sort((a, b) => a - b);
    expect(raceStatuses).toEqual([200, 409]);
    // Apenas 1 nova revisão foi criada para o vencedor da corrida (total 2)
    expect(
      await prisma.editorialRevision.count({
        where: { entityType: "GAZETTE_ACT", entityId: act19.id },
      })
    ).toBe(2);

    // 2. Salvamento concorrente com publicação no ato 999020 (IN_REVIEW)
    const revBeforePublish = act20.updatedAt.toISOString();
    const publishRes = await makePost({
      action: "PUBLISH_ACT",
      actId: act20.id,
      expectedUpdatedAt: revBeforePublish,
    });
    expect(publishRes.status).toBe(200);
    const publishJson = await publishRes.json();

    // Tentativa de REWRITE_IMPORTED_ACT (com SAVE_DRAFT ou SEND_TO_REVIEW) em ato já PUBLISHED
    // é bloqueada com HTTP 409 (mesmo informando a versão atual ou defasada) e nunca altera conteúdo ou status.
    const lateSaveDraft = await makePost({
      action: "REWRITE_IMPORTED_ACT",
      actId: act20.id,
      titleSimple: "Tentativa de alterar ato publicado via SAVE_DRAFT",
      objectiveSummary: "Não pode alterar conteúdo publicado nem regredir status.",
      saveMode: "SAVE_DRAFT",
      expectedUpdatedAt: revBeforePublish,
    });
    expect(lateSaveDraft.status).toBe(409);

    const lateSendReviewCurrentVer = await makePost({
      action: "REWRITE_IMPORTED_ACT",
      actId: act20.id,
      titleSimple: "Tentativa de alterar ato publicado com versao atual",
      objectiveSummary: "Mesmo com expectedUpdatedAt atual, não pode sobrescrever PUBLISHED.",
      saveMode: "SEND_TO_REVIEW",
      expectedUpdatedAt: publishJson.act.updatedAt,
    });
    expect(lateSendReviewCurrentVer.status).toBe(409);

    // Tentativa de REVIEW_ACT para regredir PUBLISHED -> IN_REVIEW com versão atual também retorna 409
    const regressReviewRes = await makePost({
      action: "REVIEW_ACT",
      actId: act20.id,
      expectedUpdatedAt: publishJson.act.updatedAt,
    });
    expect(regressReviewRes.status).toBe(409);

    const act20Final = await prisma.gazetteAct.findUnique({ where: { id: act20.id } });
    expect(act20Final?.status).toBe("PUBLISHED");
    expect(act20Final?.titleSimple).toBe("Decreto 8.160 em revisão");
    expect(act20Final?.objectiveSummary).toBe(
      "Resumo revisado e pronto para publicação pelo editor."
    );
    expect(
      await prisma.editorialRevision.count({
        where: { entityType: "GAZETTE_ACT", entityId: act20.id },
      })
    ).toBe(0);

    // 3. Corrida simultânea real entre PUBLISH_ACT e REWRITE_IMPORTED_ACT no ato 999021
    const act21Version = act21.updatedAt.toISOString();
    const [concurrentPublish, concurrentRewrite] = await Promise.all([
      makePost({
        action: "PUBLISH_ACT",
        actId: act21.id,
        expectedUpdatedAt: act21Version,
      }),
      makePost({
        action: "REWRITE_IMPORTED_ACT",
        actId: act21.id,
        titleSimple: "Decreto 8.161 alterado em paralelo à publicação",
        objectiveSummary: "Nova redação enviada em paralelo com a ação de publicação.",
        saveMode: "SEND_TO_REVIEW",
        expectedUpdatedAt: act21Version,
      }),
    ]);
    expect([concurrentPublish.status, concurrentRewrite.status].sort((a, b) => a - b)).toEqual([
      200,
      409,
    ]);

    const act21Final = await prisma.gazetteAct.findUnique({ where: { id: act21.id } });
    if (concurrentPublish.status === 200) {
      expect(act21Final?.status).toBe("PUBLISHED");
      expect(act21Final?.titleSimple).toBe("Decreto 8.161 corrida publicação");
      expect(
        await prisma.editorialRevision.count({
          where: { entityType: "GAZETTE_ACT", entityId: act21.id },
        })
      ).toBe(0);
    } else {
      expect(act21Final?.status).toBe("IN_REVIEW");
      expect(act21Final?.titleSimple).toBe("Decreto 8.161 alterado em paralelo à publicação");
      expect(
        await prisma.editorialRevision.count({
          where: { entityType: "GAZETTE_ACT", entityId: act21.id },
        })
      ).toBe(1);
    }

    // 4. PUBLISH_ACT e REVIEW_ACT com versão válida porém desatualizada (999022) -> HTTP 409 sem mutação
    const ed22 = await prisma.gazetteEdition.create({
      data: {
        editionNumber: "999022",
        publicationDate: new Date("2026-11-12T12:00:00.000Z"),
        year: 2026,
        month: 11,
        officialUrl: pdfUrl("999022"),
        status: "PENDING_REVIEW",
      },
    });
    const act22 = await prisma.gazetteAct.create({
      data: {
        editionId: ed22.id,
        categoryId: category!.id,
        titleSimple: "Decreto 8.162 versão T0",
        objectiveSummary: "Resumo inicial em revisão para testar publicação com versão defasada.",
        officialUrl: pdfUrl("999022"),
        contentHash: `test-hash-999022-${suffix}`,
        status: "IN_REVIEW",
        reviewedById: editor1.id,
        reviewedAt: new Date(),
      },
    });
    touchedActIds.push(act22.id);

    const t0Act22 = act22.updatedAt.toISOString();
    const editT1Res = await makePost({
      action: "REWRITE_IMPORTED_ACT",
      actId: act22.id,
      titleSimple: "Decreto 8.162 versão T1 atualizada",
      objectiveSummary: "Resumo alterado em IN_REVIEW após a leitura T0 do publicador.",
      saveMode: "SEND_TO_REVIEW",
      expectedUpdatedAt: t0Act22,
    });
    expect(editT1Res.status).toBe(200);
    const editT1Json = await editT1Res.json();
    const t1Act22 = editT1Json.act.updatedAt;

    const stalePublish = await makePost({
      action: "PUBLISH_ACT",
      actId: act22.id,
      expectedUpdatedAt: t0Act22,
    });
    expect(stalePublish.status).toBe(409);

    const staleReview = await makePost({
      action: "REVIEW_ACT",
      actId: act22.id,
      expectedUpdatedAt: t0Act22,
    });
    expect(staleReview.status).toBe(409);

    const act22StillReview = await prisma.gazetteAct.findUnique({ where: { id: act22.id } });
    const ed22StillPending = await prisma.gazetteEdition.findUnique({ where: { id: ed22.id } });
    expect(act22StillReview?.status).toBe("IN_REVIEW");
    expect(act22StillReview?.titleSimple).toBe("Decreto 8.162 versão T1 atualizada");
    expect(ed22StillPending?.status).toBe("PENDING_REVIEW");
    expect(
      await prisma.editorialRevision.count({
        where: { entityType: "GAZETTE_ACT", entityId: act22.id },
      })
    ).toBe(1);

    // Com a versão T1 atualizada, a publicação é concluída com sucesso
    const freshPublish = await makePost({
      action: "PUBLISH_ACT",
      actId: act22.id,
      expectedUpdatedAt: t1Act22,
    });
    expect(freshPublish.status).toBe(200);
    const act22Published = await prisma.gazetteAct.findUnique({ where: { id: act22.id } });
    const ed22Published = await prisma.gazetteEdition.findUnique({ where: { id: ed22.id } });
    expect(act22Published?.status).toBe("PUBLISHED");
    expect(ed22Published?.status).toBe("PUBLISHED");
    expect(
      await prisma.editorialRevision.count({
        where: { entityType: "GAZETTE_ACT", entityId: act22.id },
      })
    ).toBe(1);
  }, 15_000);
});
