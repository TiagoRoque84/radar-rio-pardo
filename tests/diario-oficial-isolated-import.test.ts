import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runImprensaOficialCollector } from "@/lib/collectors/imprensa-oficial-collector";

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
  if (
    process.env.DATABASE_URL?.startsWith("mysql://") ||
    process.env.DATABASE_URL?.startsWith("mysqls://")
  ) {
    throw new Error("Teste isolado não pode executar em MySQL.");
  }
  if (!process.env.DATABASE_URL?.startsWith("file:")) {
    throw new Error("DATABASE_URL de testes deve ser SQLite local.");
  }
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

  async function runWithMockedCollector() {
    const adapter = await prisma.integrationAdapter.findUnique({
      where: { adapterKey: "imprensa-oficial-sjrp" },
      include: { source: true },
    });
    expect(adapter).not.toBeNull();
    const run = await prisma.collectionRun.create({
      data: { adapterId: adapter!.id, status: "RUNNING", triggerType: "MANUAL" },
    });
    runIds.push(run.id);
    return runImprensaOficialCollector({
      adapterId: adapter!.id,
      adapterKey: adapter!.adapterKey,
      sourceId: adapter!.sourceId,
      sourceUrl: adapter!.source.url,
      agencyId: adapter!.source.agencyId,
      runId: run.id,
    });
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

    // 2. Bloqueia publicação direta de DRAFT_IMPORTED
    const blockedPublish = await makePost({ action: "PUBLISH_ACT", actId: targetAct!.id });
    expect(blockedPublish.status).toBe(409);

    // 3. Bloqueia envio para IN_REVIEW mantendo resumo automático do PDF
    const blockedPlaceholder = await makePost({
      action: "REWRITE_IMPORTED_ACT",
      actId: targetAct!.id,
      titleSimple: "Decreto 8.145 atualizado",
      objectiveSummary:
        "Texto extraído do PDF oficial (revisão obrigatória): Página 1 da Edição nº 999011.",
      saveMode: "SEND_TO_REVIEW",
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
    const publishRes = await makePost({ action: "PUBLISH_ACT", actId: targetAct!.id });
    expect(publishRes.status).toBe(200);
    expect(
      await prisma.gazetteAct.count({ where: { id: targetAct!.id, status: "PUBLISHED" } })
    ).toBe(1);
  }, 15_000);
});
