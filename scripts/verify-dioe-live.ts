import {
  extractListingActNumber,
  listingUrl,
  parseOfficialActListing,
} from "../src/lib/collectors/dioe-parser";
import { fetchVerifiedOfficialActText } from "../src/lib/collectors/dioe-reader";
import { probeOfficialEditionPdf } from "../src/lib/collectors/dioe-pdf-probe";
import { scanOfficialPdfForAct } from "../src/lib/collectors/dioe-pdf-text";
import { detectAndMaskPersonalData } from "../src/lib/privacy/lgpd-sanitizer";

/**
 * Verificação controlada somente leitura da Imprensa Oficial Municipal via CLI.
 * Não acessa banco de dados, não grava arquivos e jamais imprime o texto integral do ato.
 * Uso opcional: npx tsx scripts/verify-dioe-live.ts [--pdf]
 */
async function main() {
  const inspectPdf = process.argv.includes("--pdf");
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
      const safeTitle = detectAndMaskPersonalData(act.title).sanitizedText.slice(0, 90);
      console.log(
        "Fonte validada: edição " +
          act.editionNumber +
          " / " +
          act.publicationDate.toISOString().slice(0, 10) +
          " / nº " +
          (extractListingActNumber(act.title) ?? "S/N") +
          " / " +
          safeTitle
      );
    }

    const htmlSample = acts.find((act) => act.textUrl !== null);
    if (htmlSample) {
      const verified = await fetchVerifiedOfficialActText(htmlSample, { timeoutMs: 5000 }).catch(
        () => null
      );
      console.log(
        "Conferência HTML (edição " +
          htmlSample.editionNumber +
          "): " +
          (verified
            ? `verificado (ato nº ${verified.verifiedActNumber ?? "S/N"}, data ${verified.verifiedActDate?.toISOString().slice(0, 10) ?? "ausente"})`
            : "não verificado")
      );
    }

    if (inspectPdf) {
      const pdfSample = acts.find((act) => act.textUrl === null) ?? acts[0];
      if (pdfSample) {
        const pdfProbe = await probeOfficialEditionPdf(pdfSample, { timeoutMs: 7000 }).catch(() => ({
          checkedEdition: pdfSample.editionNumber,
          status: "PDF_STREAM_UNAVAILABLE",
        }));
        console.log("Sonda PDF (edição " + pdfSample.editionNumber + "): " + pdfProbe.status);

        const pdfScan = await scanOfficialPdfForAct(pdfSample, {
          timeoutMs: 9000,
          inspectPageSpan: true,
          inspectTextSegment: true,
        });
        console.log(
          "Segmento PDF (edição " +
            pdfSample.editionNumber +
            "): status=" +
            pdfScan.status +
            ", segmentStatus=" +
            (pdfScan.segmentCheck?.status ?? "N/A") +
            ", reason=" +
            (pdfScan.segmentCheck?.reason ?? "NONE")
        );
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

main().catch((error) => {
  console.error(
    "Falha no teste externo da Imprensa Oficial:",
    error instanceof Error ? error.message : "erro desconhecido"
  );
  process.exitCode = 1;
});
