import Link from "next/link";
import { Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateBR } from "@/lib/formatters";
import { EmptyStateCard } from "@/components/EmptyStateCard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Busca no Portal",
};

export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() || "";

  const [articles, acts, propositions, biddings] = q
    ? await Promise.all([
        prisma.newsArticle.findMany({
          where: {
            status: "PUBLISHED",
            deletedAt: null,
            OR: [
              { title: { contains: q } },
              { summary: { contains: q } },
            ],
          },
          take: 10,
        }),
        prisma.gazetteAct.findMany({
          where: {
            status: "PUBLISHED",
            OR: [
              { titleSimple: { contains: q } },
              { objectiveSummary: { contains: q } },
            ],
          },
          include: { edition: true },
          take: 10,
        }),
        prisma.legislativeProposition.findMany({
          where: { summary: { contains: q } },
          take: 10,
        }),
        prisma.biddingProcess.findMany({
          where: { objectDescription: { contains: q } },
          take: 10,
        }),
      ])
    : [[], [], [], []];

  const total =
    articles.length + acts.length + propositions.length + biddings.length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-8">
      <h1 className="text-3xl font-bold flex items-center gap-2">
        <Search className="h-7 w-7 text-radar-blue" />
        Busca Global
      </h1>

      <form method="GET" className="flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Digite um termo para pesquisar em todo o portal..."
          className="flex-1 rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-4 py-2.5 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-radar-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-radar-blue-hover"
        >
          Buscar
        </button>
      </form>

      {!q ? (
        <EmptyStateCard
          title="Digite uma palavra-chave para pesquisar"
          description="Você pode pesquisar por matérias publicadas, atos do Diário Oficial, proposições da Câmara ou licitações."
        />
      ) : total === 0 ? (
        <EmptyStateCard
          title={`Nenhum resultado encontrado para "${q}"`}
          description="Tente usar palavras mais curtas ou consulte diretamente as páginas de Notícias, Diário Oficial, Câmara ou Contas Públicas."
        />
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-radar-muted">
            {total} resultado(s) encontrado(s) para <strong>{q}</strong>.
          </p>

          {articles.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-bold">Notícias</h2>
              {articles.map((a) => (
                <div key={a.id} className="radar-card p-4">
                  <Link
                    href={`/noticias/${a.slug}`}
                    className="font-bold text-radar-blue hover:underline"
                  >
                    {a.title}
                  </Link>
                  <p className="text-xs text-radar-muted mt-1">
                    {formatDateBR(a.publishedAt)} — {a.summary}
                  </p>
                </div>
              ))}
            </section>
          )}

          {acts.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-bold">Diário Oficial</h2>
              {acts.map((act) => (
                <div key={act.id} className="radar-card p-4">
                  <Link
                    href={`/diario-oficial/${act.editionId}`}
                    className="font-bold text-radar-blue hover:underline"
                  >
                    {act.titleSimple}
                  </Link>
                  <p className="text-xs text-radar-muted mt-1">
                    Edição {act.edition.editionNumber} — {act.objectiveSummary}
                  </p>
                </div>
              ))}
            </section>
          )}

          {propositions.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-bold">Câmara Municipal</h2>
              {propositions.map((p) => (
                <div key={p.id} className="radar-card p-4">
                  <p className="font-bold">
                    {p.type} nº {p.number}/{p.year}
                  </p>
                  <p className="text-xs text-radar-muted mt-1">{p.summary}</p>
                </div>
              ))}
            </section>
          )}

          {biddings.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-bold">Licitações</h2>
              {biddings.map((b) => (
                <div key={b.id} className="radar-card p-4">
                  <p className="font-bold">
                    {b.modality} — {b.processNumber}
                  </p>
                  <p className="text-xs text-radar-muted mt-1">
                    {b.objectDescription}
                  </p>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
