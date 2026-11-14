/**
 * Leitura conservadora das páginas públicas "Listar Atos" do Diário Oficial.
 * Não é uma API. Se o HTML mudar, falhamos sem fabricar registros.
 */
export type OfficialActKind = "Leis" | "Decretos" | "Portarias";

export interface ListedOfficialAct {
  kind: OfficialActKind;
  title: string;
  editionNumber: string;
  publicationDate: Date;
  editionUrl: string;
  textUrl: string | null;
}

const SITE = "https://www.imprensaoficialmunicipal.com.br";
const ALLOWED_HOSTS = new Set([
  "www.imprensaoficialmunicipal.com.br",
  "imprensaoficialmunicipal.com.br",
  "dosp.com.br",
  "www.dosp.com.br",
]);

const NAMED: Record<string, string> = {
  amp: "&", quot: '"', apos: "'", nbsp: " ", lt: "<", gt: ">",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  agrave: "à", acirc: "â", ecirc: "ê", ocirc: "ô",
  atilde: "ã", otilde: "õ", ccedil: "ç",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  Agrave: "À", Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô",
  Atilde: "Ã", Otilde: "Õ", Ccedil: "Ç",
};

export function decodeOfficialEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-zA-Z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith("#")) {
      const hex = /^#x/i.test(entity);
      const value = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(value) && value > 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : whole;
    }
    return NAMED[entity] ?? NAMED[entity.toLowerCase()] ?? whole;
  });
}

export function htmlToOfficialText(html: string): string {
  return decodeOfficialEntities(
    html
      .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(?:p|div|tr|li|h[1-6]|blockquote)>/gi, " ")
      .replace(/<[^>]*>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function plain(input: string): string {
  return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function isRioPardoOfficialHtml(html: string): boolean {
  return plain(htmlToOfficialText(html).slice(0, 12000)).includes("sao jose do rio pardo");
}

export function safeOfficialUrl(href: string | undefined | null, type: "edition" | "text"): string | null {
  if (!href || href.length > 1000) return null;
  try {
    const url = new URL(decodeOfficialEntities(href.trim()), SITE);
    if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) return null;
    if (url.username || url.password) return null;
    if (type === "text") {
      if (!/^\/leituratexto\/?$/.test(url.pathname) || !url.searchParams.has("p")) return null;
    } else if (
      !/^\/impressao\.php$/.test(url.pathname) &&
      !/^\/diario\/sp\/sao-jose-do-rio-pardo\/\d{4}-\d{2}-\d{2}\/ed-[^/]+\.pdf$/i.test(url.pathname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function linkIn(cell: string, type: "edition" | "text"): string | null {
  for (const match of cell.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const link = safeOfficialUrl(match[1], type);
    if (link) return link;
  }
  return null;
}

export function listingUrl(kind: OfficialActKind): string {
  const query = new URLSearchParams({ c: "São José do Rio Pardo", s: kind });
  return SITE + "/listaatos.php?" + query.toString();
}

function parseDateBR(text: string): Date | null {
  const m = text.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
  if (year < 2018 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) return null;
  return date;
}

export function parseOfficialActListing(
  html: string,
  kind: OfficialActKind,
  maxItems = 15
): ListedOfficialAct[] {
  if (!isRioPardoOfficialHtml(html) || !/listar\s+atos/i.test(htmlToOfficialText(html).slice(0, 2000))) {
    throw new Error("Listagem não identificada como Diário Oficial de São José do Rio Pardo.");
  }
  const items: ListedOfficialAct[] = [];
  const seen = new Set<string>();
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = Array.from(row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi), m => m[1]);
    if (cells.length < 5) continue;
    const title = htmlToOfficialText(cells[0]).slice(0, 300);
    const date = parseDateBR(htmlToOfficialText(cells[1]));
    const editionNumber = htmlToOfficialText(cells[2]);
    const editionUrl = linkIn(cells[4], "edition");
    const textUrl = cells[5] ? linkIn(cells[5], "text") : null;
    if (!date || !/^\d{1,6}$/.test(editionNumber) || !editionUrl || title.length < 4) continue;
    const key = kind + ":" + editionNumber + ":" + date.getUTCFullYear() + ":" + plain(title);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ kind, title, editionNumber, publicationDate: date, editionUrl, textUrl });
    if (items.length >= Math.max(1, Math.min(maxItems, 30))) break;
  }
  return items;
}

export interface OfficialActText {
  excerpt: string;
  ementa: string | null;
}

export function parseOfficialActText(
  html: string, expectedEdition: string
): OfficialActText | null {
  if (!isRioPardoOfficialHtml(html)) return null;
  const text = htmlToOfficialText(html);
  if (!new RegExp("Edi[cç][aã]o\\s*n[ºo°.]?\\s*" + expectedEdition + "\\b", "i").test(text)) {
    return null;
  }

  const quote = html.match(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/i);
  const ementa = quote ? htmlToOfficialText(quote[1]).slice(0, 400) : "";
  // Somente trecho curto para revisão; não gera análise ou inferências.
  const excerpt = text.slice(0, 1700);
  return { excerpt, ementa: ementa.length >= 12 ? ementa : null };
}
