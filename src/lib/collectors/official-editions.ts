import { prisma } from "@/lib/prisma";
import { detectAndMaskPersonalData } from "@/lib/privacy/lgpd-sanitizer";
import { RADAR_USER_AGENT, type CollectorResult } from "./types";

const FEED = "https://dosp.com.br/api/index.php/dioe.js/5206?callback=dioe";
const AUTO = "AUTO_PUBLISHED";

async function download(url: string, maxBytes: number) {
  const res = await fetch(url, {
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": RADAR_USER_AGENT },
  });
  if (!res.ok || !res.body) throw new Error(`Fonte oficial respondeu HTTP ${res.status}`);
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Arquivo oficial excede o limite de leitura.");
      parts.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(parts);
}

export function parseEditionFeed(text: string) {
  const payload = /^\s*dioe\(([\s\S]*)\);?\s*$/.exec(text);
  if (!payload) throw new Error("Formato desconhecido da lista oficial.");
  const rows: unknown = JSON.parse(payload[1]).data;
  if (!Array.isArray(rows)) throw new Error("Lista oficial de edições ausente.");
  const editions = [];
  for (const row of rows) {
    if (!row || typeof row.link !== "string") continue;
    const match = /^https:\/\/dosp\.com\.br\/diario\/sp\/sao-jose-do-rio-pardo\/(\d{4}-\d{2}-\d{2})\/ed-(\d+[a-z]?)-(\d+)-[a-f\d]+\.pdf$/i.exec(row.link);
    if (!match || match[1] !== row.data || match[2] !== String(row.edicao_do) || match[3] !== String(row.iddo)) continue;
    const date = new Date(match[1] + "T12:00:00Z");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]) continue;
    editions.push({ editionNumber: match[2], publicationDate: date, year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1, officialUrl: row.link as string });
    if (editions.length === 24) break;
  }
  if (rows.length && !editions.length) throw new Error("Nenhuma edição reconhecida na lista municipal.");
  return editions;
}

export function summarizeContents(text: string, editionNumber: string, pages: number) {
  const clean = text.normalize("NFKC");
  if (!/município de são josé do rio pardo/i.test(clean) ||
      clean.match(/Edição\s+n[ºo°.]?\s*(\d+[A-Z]?)\b/i)?.[1]?.toLowerCase() !== editionNumber.toLowerCase()) return null;
  const contents = clean.split(/\bSUMÁRIO\b/i)[1];
  if (!contents) return null;
  const entries: string[] = [];
  for (const line of contents.split("\n")) {
    // pdf.js can place the leader dots before or after the page number.
    const row = /^\s*([\p{L}][\p{L} ,/()–—&-]{2,85}?)\s*(?:\.{3,}\s*(\d{1,4})|(\d{1,4})\s*\.{3,})\s*$/u.exec(line);
    if (!row) continue;
    const page = Number(row[2] || row[3]);
    if (page < 1 || page > pages || detectAndMaskPersonalData(row[1]).hasPersonalData) continue;
    entries.push(`${row[1].trim()} (p. ${page})`);
  }
  return entries.length ? [...new Set(entries)].slice(0, 35).join(" • ") : null;
}

export function extractOfficialHeadnotes(text: string, editionNumber: string, page: number) {
  const clean = text.normalize("NFKC");
  if (!/município de são josé do rio pardo/i.test(clean) ||
      clean.match(/Edição\s+n[ºo°.]?\s*(\d+[a-z]?)\s+Página/i)?.[1] !== editionNumber ||
      Number(clean.match(/Página (\d+) de \d+/i)?.[1]) !== page) return [];
  const notes: string[] = [];
  // Only a dated heading immediately followed by a complete official headnote.
  const headings = /^(DECRETO|LEI(?: COMPLEMENTAR)?|PORTARIA|RESOLUÇÃO)\s+N[ºo°.]?\s*([\d.]+),?\s+DE\s+\d{1,2}(?:º|o)?\s+DE\s+[A-ZÇ]+\s+DE\s+\d{4}\.?[ \t]*\n/gim;
  for (const heading of clean.matchAll(headings)) {
    const body = clean.slice(heading.index! + heading[0].length, heading.index! + heading[0].length + 750);
    const end = body.search(/\n(?:O Prefeito|A Prefeita|O Presidente|A Presidente|A Câmara|CONSIDERANDO|Art\. 1)/i);
    if (end < 0) continue;
    const excerpt = body.slice(0, end).replace(/\s+/g, " ").trim();
    if (!/^(Dispõe|Autoriza|Institui|Estabelece|Regulamenta|Altera|Denomina|Aprova|Revoga|Fixa)\b/i.test(excerpt) ||
        !/[.!]$/.test(excerpt) || excerpt.length > 620 || detectAndMaskPersonalData(excerpt).hasPersonalData ||
        /\b(servidor[ae]?s?|saúde individual|readaptação|afastamento|aposentadoria|deficiência|diagnóstico|menor de idade)\b/i.test(excerpt)) continue;
    notes.push(heading[1] + " nº " + heading[2] + " (p. " + page + ") — " + excerpt);
  }
  return notes;
}

async function readSummary(edition: ReturnType<typeof parseEditionFeed>[number]) {
  const bytes = await download(edition.officialUrl, 12_000_000);
  if (!bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("PDF oficial inválido.");
  await import("pdf-parse/worker");
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(bytes), isEvalSupported: false });
  try {
    const result = await parser.getText({ partial: [1] });
    const topics = summarizeContents(result.pages[0]?.text || "", edition.editionNumber, result.total);
    if (!topics) return "Consulte o documento original para os assuntos desta edição.";
    const pages = Array.from({ length: Math.min(7, result.total - 1) }, (_, i) => i + 2);
    const details = pages.length ? await parser.getText({ partial: pages }) : null;
    const notes = details?.pages.flatMap(page => extractOfficialHeadnotes(page.text, edition.editionNumber, page.num)) || [];
    return [topics, ...notes.slice(0, 8)].join("\n\n");
  } finally {
    await parser.destroy();
  }
}

export async function collectOfficialEditions(): Promise<CollectorResult> {
  const result: CollectorResult = { status: "SUCCESS", itemsFound: 0, itemsProcessed: 0,
    itemsDuplicated: 0, errorCount: 0, logText: "" };
  let summaries = 0;
  try {
    const editions = parseEditionFeed((await download(FEED, 3_000_000)).toString("utf8"));
    result.itemsFound = editions.length;
    const pending = [];
    for (const edition of editions) {
      const { editionNumber, year } = edition;
      const where = { editionNumber_year: { editionNumber, year } };
      const previous = await prisma.gazetteEdition.findUnique({ where });
      const existing = previous || await prisma.gazetteEdition.upsert({
        where, update: {}, create: { ...edition, status: AUTO },
      });
      if (!previous) result.itemsProcessed++;
      else result.itemsDuplicated++;
      if (existing.status !== AUTO) continue;
      const changed = existing.officialUrl !== edition.officialUrl;
      if (changed) {
        await prisma.gazetteEdition.updateMany({
          where: { id: existing.id, status: AUTO, officialUrl: existing.officialUrl },
          data: { ...edition, summaryText: null },
        });
      }
      if (!existing.summaryText || changed) pending.push({ edition, existing });
    }
    // Retry failures after unattempted editions; preserve recency for a fresh batch.
    pending.sort((a, b) => {
      const triedA = a.existing.updatedAt > a.existing.createdAt;
      const triedB = b.existing.updatedAt > b.existing.createdAt;
      return Number(triedA) - Number(triedB) || (triedA ? a.existing.updatedAt.getTime() - b.existing.updatedAt.getTime() : 0);
    });
    for (const { edition, existing } of pending.slice(0, 6)) {
      const where = { id: existing.id, status: AUTO, officialUrl: edition.officialUrl, summaryText: null };
      try {
        const summaryText = await readSummary(edition);
        await prisma.gazetteEdition.updateMany({ where, data: { summaryText } });
        summaries++;
      } catch {
        await prisma.gazetteEdition.updateMany({ where, data: { updatedAt: new Date() } });
        result.errorCount++;
      }
    }
  } catch (error) {
    result.errorCount++;
    result.logText = error instanceof Error ? error.message : "Falha na coleta de edições.";
  }
  result.status = result.errorCount ? "PARTIAL" : "SUCCESS";
  result.logText += ` Edições oficiais encontradas: ${result.itemsFound}. Resumos gerados: ${summaries}. Erros: ${result.errorCount}.`;
  return result;
}
