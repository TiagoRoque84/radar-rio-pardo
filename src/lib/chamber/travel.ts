import { unstable_cache } from "next/cache";
import { archiveUrl, readArchive } from "./travel-source";
import snapshot from "./travel.json";

const refreshYear = unstable_cache(async (year: number) => {
  const response = await fetch(archiveUrl(year), { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("Arquivo anual indisponível.");
  return readArchive(Buffer.from(await response.arrayBuffer()), year);
}, ["camara-viagens-38-v1"], { revalidate: 86400 });

export async function travelYears() {
  const years = [];
  for (let year = 2025; year <= Math.min(new Date().getFullYear(), 2028); year++) {
    try {
      years.push(await refreshYear(year));
    } catch {
      const saved = snapshot.find(item => item.year === year);
      if (saved) years.push(saved);
      else years.push({ year, month: 0, payments: [] });
    }
  }
  return years.reverse();
}
