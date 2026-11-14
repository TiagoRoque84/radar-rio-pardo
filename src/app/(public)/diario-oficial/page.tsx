import Link from "next/link";
import { FileText, ExternalLink, ShieldAlert } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrencyBRL, formatDateBR } from "@/lib/formatters";
import { EmptyStateCard } from "@/components/EmptyStateCard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Diário Oficial Municipal",
  description:
    "Resumos explicativos das edições do Diário Oficial Eletrônico de São José do Rio Pardo.",
};

export default async function DiarioOficialPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; mes?: string; categoria?: string; q?: string }>;
}) {
  const params = await searchParams;
  const yearFilter = params.ano ? Number(params.ano) : undefined;
  const monthFilter = params.mes ? Number(params.mes) : undefined;
  const categorySlug = params.categoria || "";
  const query = params.q?.trim() || "";

  const [categories, editions, acts] = await Promise.all([
    prisma.gazetteActCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.gazetteEdition.findMany({
      where: {
        status: "PUBLISHED",
        ...(yearFilter ? { year: yearFilter } : {}),
        ...(monthFilter ? { month: monthFilter } : {}),
      },
      orderBy: { publicationDate: "desc" },
      take: 24,
    }),
    prisma.gazetteAct.findMany({
      where: {
        status: "PUBLISHED",
        ...(categorySlug ? { category: { slug: categorySlug } } : {}),
        ...(yearFilter || monthFilter
          ? {
              edition: {
                ...(yearFilter ? { year: yearFilter } : {}),
                ...(monthFilter ? { month: monthFilter } : {}),
              },
            }
          : {}),
        ...(query
          ? {
              OR: [
                { titleSimple: { contains: query } },
                { objectiveSummary: { contains: query } },
              ],
            }
          : {}),
      },
      include: { edition: true, category: true, agency: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-2.5">
          <FileText className="h-7 w-7 text-radar-blue" aria-hidden="true" />
          Diário Oficial Municipal — Resumos Verificados
        </h1>
        <p className="text-sm sm:text-base text-radar-muted dark:text-slate-300 max-w-3xl">
          Tradução de atos oficiais da Imprensa Oficial de São José do Rio Pardo
          para linguagem clara, mantendo links diretos aos documentos originais.
          Não prometemos edição diária quando o município não publica edição no dia.
        </p>
      </div>

      {/* Filtros */}
      <form
        method="GET"
        className="radar-card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end"
      >
        <div>
          <label htmlFor="q" className="block text-xs font-semibold mb-1">
            Palavra-chave
          </label>
          <input
            id="q"
            name="q"
            defaultValue={query}
            placeholder="Ex.: licitação, escola, decreto..."
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="categoria" className="block text-xs font-semibold mb-1">
            Assunto / Categoria
          </label>
          <select
            id="categoria"
            name="categoria"
            defaultValue={categorySlug}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="">Todos os assuntos</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mes" className="block text-xs font-semibold mb-1">
            Mês
          </label>
          <select
            id="mes"
            name="mes"
            defaultValue={params.mes || ""}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="">Todos</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                Mês {String(m).padStart(2, "0")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ano" className="block text-xs font-semibold mb-1">
            Ano
          </label>
          <input
            id="ano"
            name="ano"
            type="number"
            defaultValue={params.ano || ""}
            placeholder="2026"
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-radar-blue px-4 py-2 text-sm font-semibold text-white hover:bg-radar-blue-hover transition"
        >
          Pesquisar atos
        </button>
      </form>

      {/* Edições disponíveis */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold">Edições Publicadas</h2>
        {editions.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {editions.map((ed) => (
              <div key={ed.id} className="radar-card p-4 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-radar-blue">
                    Edição nº {ed.editionNumber}
                  </span>
                  <span>{formatDateBR(ed.publicationDate)}</span>
                </div>
                <p className="text-xs text-radar-muted dark:text-slate-300">
                  {ed.totalActs} ato(s) catalogado(s)
                </p>
                <div className="flex items-center justify-between pt-2 text-xs">
                  <Link
                    href={`/diario-oficial/${ed.id}`}
                    className="font-semibold text-radar-blue hover:underline"
                  >
                    Ver resumo →
                  </Link>
                  <a
                    href={ed.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-radar-muted hover:text-radar-blue inline-flex items-center gap-1"
                  >
                    PDF Oficial <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyStateCard
            title="Nenhuma edição do Diário Oficial publicada no portal ainda"
            description="A coleta e revisão editorial do Diário Oficial Eletrônico de São José do Rio Pardo ocorrem mediante validação humana dos documentos oficiais."
            sourceLabel="Imprensa Oficial Municipal SJRP"
            sourceUrl="https://www.imprensaoficialmunicipal.com.br/sjriopardo"
          />
        )}
      </section>

      {/* Lista de atos resumidos */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold">Atos Identificados e Explicados</h2>
        {acts.length > 0 ? (
          <div className="space-y-4">
            {acts.map((act) => (
              <article key={act.id} className="radar-card p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-radar-blue/10 px-2.5 py-0.5 font-semibold text-radar-blue">
                    {act.category.name}
                  </span>
                  <span className="font-medium">
                    Edição {act.edition.editionNumber} (
                    {formatDateBR(act.edition.publicationDate)})
                  </span>
                  {act.pageNumber && <span>• Pág. {act.pageNumber}</span>}
                  {act.actNumber && <span>• Ato nº {act.actNumber}</span>}
                  {act.agency && <span>• {act.agency.name}</span>}
                </div>

                <h3 className="text-lg font-bold">{act.titleSimple}</h3>
                <p className="text-sm text-radar-muted dark:text-slate-300 leading-relaxed">
                  {act.objectiveSummary}
                </p>

                <div className="grid gap-2 sm:grid-cols-3 text-xs pt-2 border-t border-radar-border">
                  <div>
                    <strong>Valor confirmado:</strong>{" "}
                    {act.financialValue
                      ? `${formatCurrencyBRL(act.financialValue)} (${act.financialType === "ESTIMATED" ? "Valor estimado" : act.financialType === "CONTRACTED" ? "Valor contratado" : "Valor pago"})`
                      : "Não envolve valor financeiro confirmado"}
                  </div>
                  <div>
                    <strong>Prazos relevantes:</strong>{" "}
                    {act.deadlinesText || "Não informado no ato"}
                  </div>
                  <div>
                    <a
                      href={act.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-radar-blue hover:underline inline-flex items-center gap-1"
                    >
                      Documento oficial original{" "}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>

                {act.hasPersonalDataAlert && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 flex items-center gap-1">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    Dados pessoais eventualmente presentes no original foram
                    protegidos conforme a LGPD.
                  </p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <EmptyStateCard
            title="Nenhum ato publicado para este filtro"
            description="Quando novos atos forem extraídos do Diário Oficial e aprovados pela revisão editorial, seus resumos estruturados aparecerão aqui."
          />
        )}
      </section>
    </div>
  );
}
