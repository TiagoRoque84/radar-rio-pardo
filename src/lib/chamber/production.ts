import { unstable_cache } from "next/cache";
import snapshot from "./production.json";

export const productionUrl = "https://camarasjriopardo.sp.gov.br/producao_legislativa/";
type Author = typeof snapshot.authors[number];

async function officialPage(query: string) {
  const response = await fetch(productionUrl + query, { cache: "no-store", signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error("Fonte legislativa indisponível");
  return response.text();
}

const refreshedList = unstable_cache(async () => {
  const html = await officialPage("?l=38");
  const authors = Array.from(html.matchAll(/<a class="circulado" href="\?l=38(?:&amp;|&)id=(\d+)">([^<]+)<\/a>\s*<p class="small">\(([\d.]+) proposituras?\)/gi),
    ([, id, name, count]) => ({ id, name: name.trim(), total: Number(count.replaceAll(".", "")) }));
  if (!authors.length) throw new Error("Lista legislativa indisponível");
  return authors;
}, ["camara-autores-38"], { revalidate: 14400 });

export async function chamberAuthors() {
  return refreshedList().catch(() => snapshot.authors);
}

const refreshedTypes = unstable_cache(async (id: string) => {
  const html = await officialPage("?l=38&id=" + id);
  const types = Array.from(html.matchAll(/<td><a href="\?l=38(?:&amp;|&)id=(\d+)(?:&amp;|&)t=(\d+)">([^<]+)<\/a><\/td>\s*<td class="text-right">([\d.]+)<\/td>/gi))
    .filter(match => match[1] === id)
    .map(([, , type, name, count]) => ({ type, name, count: Number(count.replaceAll(".", "")) }));
  if (!types.length) throw new Error("Detalhes indisponíveis");
  return types;
}, ["camara-tipos-38"], { revalidate: 14400 });

export async function productionTypes(id: string): Promise<Author["types"]> {
  return refreshedTypes(id).catch(() => snapshot.authors.find(author => author.id === id)?.types ?? []);
}
