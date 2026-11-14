import { describe, expect, it, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { runImprensaOficialCollector } from "@/lib/collectors/imprensa-oficial-collector";

/**
 * CI runs against a local seeded SQLite DB (DATABASE_URL=file:./dev.db).
 * These are synthetic fixture rows, never real articles or production inserts.
 */
const fixtureEditions = ["999001", "999002", "999003"];
const pdfUrl = (edition: string) =>
  "https://dosp.com.br/diario/sp/sao-jose-do-rio-pardo/2026-11-12/ed-" +
  edition + "-automated-test.pdf";
const detailUrl = "https://www.dosp.com.br/leituratexto?p=TESTE999002";

function listing(title: string, edition: string, withText: boolean): string {
  const textLink = withText ? '<a href="' + detailUrl + '">Visualizar</a>' : "-";
  return "<html><body><h1>Diário Oficial - São José do Rio Pardo</h1>" +
    "<h2>Listar Atos</h2><table><tr><td>" + title +
    "</td><td>12/11/2026</td><td>" + edition +
    '</td><td>9</td><td><a href="' + pdfUrl(edition) +
    '">Abrir Edição</a></td><td>' + textLink + "</td></tr></table></body></html>";
}

const fixture: Record<string, string> = {
  Leis: listing("Lei nº 6.999, de 12 de novembro de 2026", fixtureEditions[0], false),
  Decretos: listing("8140.2026 - Decreto - atualização UFM", fixtureEditions[1], true),
  Portarias: listing("Portaria Nº 20.323 - ato administrativo", fixtureEditions[2], false),
};

const officialText =
  "<html><body><h1>IMPRENSA OFICIAL - SÃO JOSÉ DO RIO PARDO</h1>" +
  "<p>Publicado em 12 de novembro de 2026 | Edição nº 999002 | Ano IX</p>" +
  "<h2>DECRETO Nº 8.140, DE 12 DE NOVEMBRO DE 2026.</h2>" +
  "<blockquote>Dispõe sobre a atualização da UFM para o exercício de 2027.</blockquote>" +
  "</body></html>";

describe("Importação simulada de atos oficiais em banco local", () => {
  const runIds: string[] = [];

  afterAll(async () => {
    vi.unstubAllGlobals();
    if (runIds.length) {
      await prisma.importedDocument.deleteMany({
        where: { runId: { in: runIds } },
      });
    }
    await prisma.gazetteEdition.deleteMany({
      where: { year: 2026, editionNumber: { in: fixtureEditions } },
    });
    if (runIds.length) {
      await prisma.collectionRun.deleteMany({
        where: { id: { in: runIds } },
      });
    }
    await prisma.$disconnect();
  });

  it("cria rascunhos com data/órgão verificados, sem publicar, e deduplica na reexecução", async () => {
    if (process.env.DATABASE_URL?.startsWith("mysql://") ||
        process.env.DATABASE_URL?.startsWith("mysqls://")) {
      throw new Error("Teste isolado não pode executar em MySQL.");
    }
    if (!process.env.DATABASE_URL?.startsWith("file:")) {
      throw new Error("DATABASE_URL de testes deve ser SQLite local.");
    }

    const adapter = await prisma.integrationAdapter.findUnique({
      where: { adapterKey: "imprensa-oficial-sjrp" },
      include: { source: true },
    });
    expect(adapter).not.toBeNull();

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

    async function collect() {
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

    const first = await collect();
    expect(first.status).toBe("SUCCESS");
    expect(first.itemsProcessed).toBe(3);
    expect(first.itemsDuplicated).toBe(0);

    const acts = await prisma.gazetteAct.findMany({
      where: { edition: { editionNumber: { in: fixtureEditions }, year: 2026 } },
      include: { edition: true },
    });
    expect(acts).toHaveLength(3);
    expect(acts.every(x => x.status === "DRAFT_IMPORTED")).toBe(true);
    expect(acts.every(x => x.agencyId === null)).toBe(true);

    const decree = acts.find(x => x.edition.editionNumber === fixtureEditions[1]);
    const law = acts.find(x => x.edition.editionNumber === fixtureEditions[0]);
    expect(decree?.actNumber).toBe("8140");
    expect(decree?.actDate?.toISOString().slice(0, 10)).toBe("2026-11-12");
    expect(law?.actDate).toBeNull();
    expect(decree?.edition.publicationDate.toISOString().slice(0, 10)).toBe("2026-11-12");

    const second = await collect();
    expect(second.itemsProcessed).toBe(0);
    expect(second.itemsDuplicated).toBe(3);
    expect(await prisma.gazetteAct.count({
      where: { edition: { editionNumber: { in: fixtureEditions }, year: 2026 } },
    })).toBe(3);
  });
});
