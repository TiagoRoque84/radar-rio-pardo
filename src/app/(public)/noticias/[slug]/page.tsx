import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  Bot,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateBR } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await prisma.newsArticle.findUnique({
    where: { slug },
  });

  if (!article || article.status !== "PUBLISHED" || article.deletedAt) {
    return { title: "Matéria não encontrada" };
  }

  return {
    title: article.title,
    description: article.summary,
    openGraph: {
      title: article.title,
      description: article.summary,
      type: "article",
      publishedTime: article.publishedAt?.toISOString(),
    },
  };
}

export default async function NoticiaDetalhePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await prisma.newsArticle.findUnique({
    where: { slug },
    include: {
      category: true,
      author: { select: { name: true } },
      reviewer: { select: { name: true } },
      references: true,
    },
  });

  if (!article || article.status !== "PUBLISHED" || article.deletedAt) {
    notFound();
  }

  const tags: string[] = (() => {
    try {
      return JSON.parse(article.tagsJson);
    } catch {
      return [];
    }
  })();

  return (
    <article className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-8">
      <Link
        href="/noticias"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-radar-blue hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para Notícias
      </Link>

      <header className="space-y-4 border-b border-radar-border pb-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md bg-radar-blue/10 px-2.5 py-1 font-bold text-radar-blue">
            {article.category.name}
          </span>
          <span className="inline-flex items-center gap-1 text-radar-muted dark:text-slate-300">
            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
            Publicado em {formatDateBR(article.publishedAt, { includeTime: true })}
          </span>
          <span className="text-radar-muted dark:text-slate-400">
            • Atualizado em {formatDateBR(article.updatedAt, { includeTime: true })}
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold font-serif leading-tight">
          {article.title}
        </h1>

        {article.subtitle && (
          <p className="text-lg text-radar-muted dark:text-slate-300 leading-relaxed">
            {article.subtitle}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-4 text-xs text-radar-muted dark:text-slate-300">
          <span>Redação: {article.author.name}</span>
          {article.reviewer && (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Revisão editorial: {article.reviewer.name}
            </span>
          )}
        </div>
      </header>

      {article.coverImageUrl && (
        <img
          src={article.coverImageUrl}
          alt={article.title}
          className="w-full max-h-96 object-cover rounded-xl"
        />
      )}

      {/* Aviso de Correção Pública se houver */}
      {article.correctionNotice && (
        <aside
          role="note"
          className="rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm"
        >
          <p className="font-bold flex items-center gap-1.5 text-amber-900 dark:text-amber-300">
            <FileWarning className="h-4 w-4" aria-hidden="true" />
            Nota de Correção / Atualização Editorial
          </p>
          <p className="mt-1 text-amber-900 dark:text-amber-200">
            {article.correctionNotice}
          </p>
        </aside>
      )}

      {/* Transparência de IA se utilizada */}
      {article.aiUsed && (
        <aside className="rounded-xl border border-radar-border bg-radar-light dark:bg-slate-800/60 p-4 text-xs flex items-start gap-2.5">
          <Bot className="h-4 w-4 text-radar-blue shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <strong>Transparência sobre uso de Inteligência Artificial:</strong>{" "}
            {article.aiDisclosure ||
              "Conteúdo elaborado com apoio de ferramentas de IA sobre documentos oficiais e revisado integralmente por editor humano."}
          </div>
        </aside>
      )}

      {/* Resumo e Corpo */}
      <div className="radar-card p-6 sm:p-8 space-y-5 leading-relaxed text-base">
        <p className="font-semibold text-lg border-l-4 border-radar-blue pl-4">
          {article.summary}
        </p>
        <div className="space-y-4 whitespace-pre-line">{article.content}</div>
      </div>

      {/* Etiquetas */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-radar-border px-3 py-1 text-xs font-medium"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Fontes Documentais Obrigatórias */}
      <section className="radar-card p-6 space-y-3 bg-radar-light dark:bg-slate-800/40">
        <h2 className="text-lg font-bold">Fontes Documentais Oficiais</h2>
        {article.references.length > 0 ? (
          <ul className="space-y-2.5 text-sm">
            {article.references.map((ref) => (
              <li
                key={ref.id}
                className="rounded-lg bg-white dark:bg-slate-900 p-3 border border-radar-border"
              >
                <p className="font-semibold">{ref.sourceName}</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-radar-muted dark:text-slate-300">
                  {ref.referenceCode && <span>Documento: {ref.referenceCode}</span>}
                  {ref.pageOrSection && <span>Seção/Pág.: {ref.pageOrSection}</span>}
                  {ref.documentDate && (
                    <span>Data do documento: {formatDateBR(ref.documentDate)}</span>
                  )}
                  <span>Consultado em: {formatDateBR(ref.consultedAt)}</span>
                </div>
                <a
                  href={ref.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-radar-blue hover:underline"
                >
                  Acessar documento oficial <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-radar-muted">
            Referência documental em conferência.
          </p>
        )}
      </section>

      {/* Compartilhamento e Direito de Resposta */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-radar-border pt-6">
        <Link
          href={`/correcao?url=${encodeURIComponent(`/noticias/${article.slug}`)}&articleId=${article.id}`}
          className="text-sm font-medium text-radar-blue hover:underline"
        >
          Encontrou erro ou deseja solicitar correção / direito de resposta?
        </Link>
        <span className="text-xs text-radar-muted">
          Comentários públicos desativados conforme política editorial vigente.
        </span>
      </div>
    </article>
  );
}
