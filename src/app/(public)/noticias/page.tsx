import Link from "next/link";
import { Newspaper, Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateBR } from "@/lib/formatters";
import { EmptyStateCard } from "@/components/EmptyStateCard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notícias",
  description:
    "Matérias verificadas e notas de interesse público sobre São José do Rio Pardo - SP.",
};

export default async function NoticiasPage({
  searchParams,
}: {
  searchParams: Promise<{ categoria?: string; q?: string; pagina?: string }>;
}) {
  const params = await searchParams;
  const categoria = params.categoria || "";
  const query = params.q?.trim() || "";
  const page = Math.max(1, Number(params.pagina || "1") || 1);
  const pageSize = 12;

  const where = {
    status: "PUBLISHED",
    deletedAt: null,
    ...(categoria ? { category: { slug: categoria } } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query } },
            { summary: { contains: query } },
            { content: { contains: query } },
          ],
        }
      : {}),
  };

  const [categories, articles, total] = await Promise.all([
    prisma.newsCategory.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    prisma.newsArticle.findMany({
      where,
      include: { category: true, references: true },
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.newsArticle.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-2.5">
          <Newspaper className="h-7 w-7 text-radar-blue" aria-hidden="true" />
          Notícias e Comunicados
        </h1>
        <p className="text-sm sm:text-base text-radar-muted dark:text-slate-300 max-w-3xl">
          Todas as publicações passam por verificação documental e revisão
          humana, com citação explícita das fontes oficiais consultadas.
        </p>
      </div>

      {/* Filtros */}
      <form
        method="GET"
        className="radar-card p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end"
      >
        <div className="flex-1">
          <label htmlFor="q" className="block text-xs font-semibold mb-1">
            Palavra-chave
          </label>
          <div className="relative">
            <input
              id="q"
              name="q"
              defaultValue={query}
              placeholder="Buscar por assunto, bairro ou órgão..."
              className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
            <Search
              className="h-4 w-4 text-slate-400 absolute right-3 top-2.5"
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="sm:w-64">
          <label
            htmlFor="categoria"
            className="block text-xs font-semibold mb-1"
          >
            Categoria
          </label>
          <select
            id="categoria"
            name="categoria"
            defaultValue={categoria}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="">Todas as categorias</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.slug}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="rounded-lg bg-radar-blue px-5 py-2 text-sm font-semibold text-white hover:bg-radar-blue-hover transition"
        >
          Filtrar
        </button>
      </form>

      {/* Resultados */}
      {articles.length > 0 ? (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <article
                key={article.id}
                className="radar-card p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="rounded bg-radar-blue/10 px-2 py-0.5 font-semibold text-radar-blue">
                      {article.category.name}
                    </span>
                    <span className="text-radar-muted dark:text-slate-400">
                      {formatDateBR(article.publishedAt)}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold font-serif leading-snug">
                    <Link
                      href={`/noticias/${article.slug}`}
                      className="hover:text-radar-blue"
                    >
                      {article.title}
                    </Link>
                  </h2>
                  <p className="text-sm text-radar-muted dark:text-slate-300 line-clamp-3">
                    {article.summary}
                  </p>
                </div>

                <div className="border-t border-radar-border pt-3 flex items-center justify-between text-xs">
                  <span className="text-radar-muted dark:text-slate-400 truncate max-w-[65%]">
                    {article.references.length} fonte(s) documental(is)
                  </span>
                  <Link
                    href={`/noticias/${article.slug}`}
                    className="font-semibold text-radar-blue hover:underline"
                  >
                    Ler matéria →
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <nav
              aria-label="Paginação"
              className="flex items-center justify-center gap-2 pt-4"
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={`/noticias?pagina=${p}${categoria ? `&categoria=${categoria}` : ""}${query ? `&q=${encodeURIComponent(query)}` : ""}`}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                    p === page
                      ? "bg-radar-blue text-white"
                      : "radar-card hover:border-radar-blue"
                  }`}
                >
                  {p}
                </Link>
              ))}
            </nav>
          )}
        </>
      ) : (
        <EmptyStateCard
          title="Nenhuma notícia encontrada com os filtros selecionados"
          description="Ainda não existem matérias publicadas correspondentes a esta pesquisa. Matérias em rascunho ou revisão aguardam aprovação editorial."
          actionHref="/diario-oficial"
          actionLabel="Consultar Diário Oficial"
        />
      )}
    </div>
  );
}
