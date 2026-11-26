import { parse } from "csv-parse";
import { fromBufferPromise } from "yauzl";
import { pipeline } from "node:stream/promises";
import council from "./production.json";

export const archiveUrl = (year: number) =>
  `https://transparencia.tce.sp.gov.br/sites/default/files/csv/despesas-sao-jose-do-rio-pardo-${year}.zip`;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

const names = new Map(council.authors.map(author => [normalize(author.name), author.id]));
for (const [name, id] of Object.entries({
  "MARCELO CLEMENTINO": "146", "MARCELO H CLEMENTINO": "146", "ALEXANDRE TOSINI": "145",
  "RAFAEL CASTRO KOCIAN": "89", "RAFAEL KOCIAN": "89", "RUBENS LOBATO PINHEIRO": "90",
  "PRISCILA KELLEN DA COSTA ABREU": "147", "FERNANDO DOS SANTOS GOMES": "115",
  "DANTE LEMES": "136", "ADRIANO JUNIOR": "144", "SIDNEI MORGAN": "91",
})) names.set(name, id);

export function participants(history: string) {
  const corrected = normalize(history).split(/\[DIGO,?\]/).pop()!;
  if (!/\bVIAGE(?:M|NS)\b/.test(corrected)) return [];
  const match = corrected.match(/\bPEL[OA]S? VEREADOR(?:AS|ES|A)? (?:PRESIDENTE )?([A-Z .]+?) PARA\b/);
  if (!match) return [];
  const participants = match[1].split(/ E /).map(name => names.get(name.trim()));
  if (participants.some(id => !id)) return [];
  return [...new Set(participants as string[])].sort();
}

export interface TravelPayment {
  id: string;
  commitment: string;
  date: string;
  cents: number;
  category: string;
  authors: string[];
}

export async function readArchive(buffer: Buffer, year: number) {
  const zip = await fromBufferPromise(buffer);
  const payments: TravelPayment[] = [];
  const associations = new Map<string, Set<string>>();
  let month = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName !== `despesas-sao-jose-do-rio-pardo-${year}.csv`) continue;
      if (entry.uncompressedSize > 250_000_000) throw new Error("Arquivo fora do limite.");
      const stream = await zip.openReadStreamPromise(entry);
      stream.setEncoding("latin1");
      await pipeline(stream, parse({ delimiter: ";", columns: true, relax_quotes: true }), async function (rows) {
        const seen = new Set<string>();
        for await (const row of rows) {
          if (row.ds_orgao !== "CÂMARA MUNICIPAL DE SÃO JOSÉ DO RIO PARDO" || Number(row.ano_exercicio) !== year) continue;
          month = Math.max(month, Number(row.mes_referencia));
          if (row.tp_despesa !== "Valor Pago") continue;
          const id = row.id_despesa_detalhe.trim();
          if (seen.has(id)) continue;
          seen.add(id);
          const commitment = row.nr_empenho.trim();
          const authors = participants(row.historico_despesa);
          const keys = associations.get(commitment) ?? new Set<string>();
          keys.add(authors.join(","));
          associations.set(commitment, keys);
          if (!authors.length) continue;
          if (!/^\d+$/.test(id) || !/^-?\d+(,\d{2})$/.test(row.vl_despesa.trim())) throw new Error("Lançamento inválido.");
          payments.push({ id, commitment, authors, date: row.dt_emissao_despesa.trim(),
            cents: Number(row.vl_despesa.trim().replace(",", "")), category: row.ds_elemento.trim().replace(/^\d+ - /, "") });
        }
      });
    }
  } finally { zip.close(); }
  if (!(month >= 1 && month <= 12)) throw new Error("Competência da Câmara indisponível.");
  return { year, month, payments: payments.filter(row => associations.get(row.commitment)?.size === 1) };
}
