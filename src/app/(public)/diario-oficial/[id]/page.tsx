import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrencyBRL, formatDateBR } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export default async function DiarioEdicaoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const edition = await prisma.gazetteEdition.findUnique({
    where: { id },
    include: {
      agency: true,
      acts: {
        where: { status: "PUBLISHED" },
        include: { category: true, agency: true },
        orderBy: { pageNumber: "asc" },
      },
    },
  });

  if (!edition || !["PUBLISHED", "AUTO_PUBLISHED"].includes(edition.status)) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-8">
      <Link
        href="/diario-oficial"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-radar-blue hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para o Diário Oficial
      </Link>

      <header className="radar-card p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-radar-blue">
              Diário Oficial Eletrônico — São José do Rio Pardo
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold mt-1 flex items-center gap-2">
              <FileText className="h-6 w-6 text-radar-blue" />
              Edição nº {edition.editionNumber}
            </h1>
          </div>
          <a
            href={edition.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-radar-blue px-4 py-2 text-sm font-semibold text-white hover:bg-radar-blue-hover"
          >
            Abrir original oficial <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        <p className="text-sm text-radar-muted dark:text-slate-300">
          Data da edição: <strong>{formatDateBR(edition.publicationDate)}</strong>{" "}
          • {edition.status === "AUTO_PUBLISHED" ? "Edição coletada automaticamente" : edition.acts.length + " ato(s) aprovado(s) para publicação."}
        </p>
        {edition.summaryText && (
          <p className="whitespace-pre-line text-sm leading-relaxed border-t border-radar-border pt-3">
            {edition.status === "AUTO_PUBLISHED" && <strong className="block">Resumo automático da edição</strong>}
            {edition.summaryText}
          </p>
        )}
      </header>

      {edition.acts.length > 0 && <section className="space-y-4">
        <h2 className="text-xl font-bold">Atos desta edição</h2>
        {edition.acts.map((act) => (
          <article key={act.id} className="radar-card p-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded bg-radar-blue/10 px-2 py-0.5 font-semibold text-radar-blue">
                {act.category.name}
              </span>
              {act.actNumber && <span>Ato nº {act.actNumber}</span>}
              {act.pageNumber && <span>• Página {act.pageNumber}</span>}
              {act.agency && <span>• {act.agency.name}</span>}
            </div>
            <h3 className="text-lg font-bold">{act.titleSimple}</h3>
            <p className="text-sm text-radar-muted dark:text-slate-300 leading-relaxed">
              {act.objectiveSummary}
            </p>
            {act.practicalImpact && (
              <p className="text-sm bg-radar-light dark:bg-slate-800/60 p-3 rounded-lg">
                <strong>Impacto prático:</strong> {act.practicalImpact}
              </p>
            )}
            <div className="flex flex-wrap gap-4 text-xs text-radar-muted dark:text-slate-300 pt-2 border-t border-radar-border">
              {act.financialValue && (
                <span>
                  Valor:{" "}
                  <strong>{formatCurrencyBRL(act.financialValue)}</strong>
                </span>
              )}
              {act.deadlinesText && <span>Prazos: {act.deadlinesText}</span>}
              <a
                href={act.officialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-radar-blue hover:underline ml-auto"
              >
                Fonte oficial ↗
              </a>
            </div>
          </article>
        ))}
      </section>}
    </div>
  );
}
