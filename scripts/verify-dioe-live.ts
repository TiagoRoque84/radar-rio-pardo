import { listingUrl, parseOfficialActListing } from "../src/lib/collectors/dioe-parser";

/** Teste pontual somente leitura da listagem oficial. Não usa Prisma/MySQL. */
async function main() {
  const url = listingUrl("Decretos");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "RadarRioPardoBot/1.0 (+https://radar.roqueconsultoriadigital.com.br; transparencia-publica)",
        Accept: "text/html",
      },
    });
    if (!response.ok) throw new Error("Listagem retornou HTTP " + response.status);
    const html = await response.text();
    if (html.length > 2_000_000) throw new Error("HTML acima do limite seguro");
    const acts = parseOfficialActListing(html, "Decretos", 3);
    if (acts.length === 0) throw new Error("Nenhuma linha de decreto válida identificada");
    for (const act of acts) {
      console.log("Fonte validada: edição " + act.editionNumber +
        " / " + act.publicationDate.toISOString().slice(0, 10) + " / " + act.title.slice(0, 90));
    }
  } finally { clearTimeout(timeout); }
}

main().catch((error) => {
  console.error("Falha no teste externo da Imprensa Oficial:",
    error instanceof Error ? error.message : "erro desconhecido");
  process.exitCode = 1;
});
