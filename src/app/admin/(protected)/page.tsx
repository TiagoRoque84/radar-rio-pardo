import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateBR } from "@/lib/formatters";
import {
  Newspaper,
  Clock,
  AlertTriangle,
  FileText,
  Headphones,
  MessageSquareWarning,
  ShieldCheck,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [
    publishedNews,
    draftNews,
    inReviewNews,
    pendingActs,
    editionsCount,
    errorAdapters,
    processedDocs,
    episodesCount,
    openCorrections,
    recentLogs,
  ] = await Promise.all([
    prisma.newsArticle.count({ where: { status: "PUBLISHED", deletedAt: null } }),
    prisma.newsArticle.count({ where: { status: "DRAFT", deletedAt: null } }),
    prisma.newsArticle.count({ where: { status: "IN_REVIEW", deletedAt: null } }),
    prisma.gazetteAct.count({ where: { status: "IN_REVIEW" } }),
    prisma.gazetteEdition.count(),
    prisma.integrationAdapter.findMany({ where: { status: "ERROR" } }),
    prisma.importedDocument.count(),
    prisma.podcastEpisode.count(),
    prisma.correctionRequest.count({ where: { status: "OPEN" } }),
    prisma.auditLog.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const cards = [
    {
      label: "Notícias Publicadas",
      value: publishedNews,
      icon: Newspaper,
      href: "/admin/noticias",
    },
    {
      label: "Rascunhos",
      value: draftNews,
      icon: Newspaper,
      href: "/admin/noticias",
    },
    {
      label: "Aguardando Revisão",
      value: inReviewNews + pendingActs,
      icon: Clock,
      href: "/admin/noticias",
    },
    {
      label: "Edições do Diário",
      value: editionsCount,
      icon: FileText,
      href: "/admin/diario-oficial",
    },
    {
      label: "Integrações com Erro",
      value: errorAdapters.length,
      icon: AlertTriangle,
      href: "/admin/integracoes",
    },
    {
      label: "Documentos Coletados",
      value: processedDocs,
      icon: FileText,
      href: "/admin/integracoes",
    },
    {
      label: "Episódios de Podcast",
      value: episodesCount,
      icon: Headphones,
      href: "/admin/podcasts",
    },
    {
      label: "Correções em Aberto",
      value: openCorrections,
      icon: MessageSquareWarning,
      href: "/admin/correcoes",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">
            Painel Administrativo e Editorial
          </h1>
          <p className="text-sm text-radar-muted dark:text-slate-300">
            Monitoramento de publicações, revisão humana, integrações e auditoria.
          </p>
        </div>
        <Link
          href="/admin/noticias/nova"
          className="rounded-lg bg-radar-blue px-4 py-2 text-sm font-semibold text-white hover:bg-radar-blue-hover transition"
        >
          + Nova Notícia
        </Link>
      </div>

      {/* Alertas técnicos e editoriais */}
      {(errorAdapters.length > 0 || openCorrections > 0 || pendingActs > 0) && (
        <div className="rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm space-y-1">
          <p className="font-bold text-amber-900 dark:text-amber-300">
            Alertas operacionais ativos:
          </p>
          {errorAdapters.length > 0 && (
            <p>
              • {errorAdapters.length} adaptador(es) de coleta com erro. Verifique
              em{" "}
              <Link href="/admin/integracoes" className="underline font-semibold">
                Integrações
              </Link>
              .
            </p>
          )}
          {pendingActs > 0 && (
            <p>
              • {pendingActs} ato(s) do Diário Oficial aguardando revisão humana
              em{" "}
              <Link href="/admin/diario-oficial" className="underline font-semibold">
                Diário Oficial
              </Link>
              .
            </p>
          )}
          {openCorrections > 0 && (
            <p>
              • {openCorrections} solicitação(ões) cidadã(s) de correção/LGPD
              em aberto.
            </p>
          )}
        </div>
      )}

      {/* Métricas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.label}
              href={card.href}
              className="radar-card p-5 hover:border-radar-blue transition flex items-start justify-between"
            >
              <div>
                <span className="text-xs font-medium text-radar-muted">
                  {card.label}
                </span>
                <p className="mt-1 text-3xl font-bold">{card.value}</p>
              </div>
              <Icon className="h-5 w-5 text-radar-blue" aria-hidden="true" />
            </Link>
          );
        })}
      </div>

      {/* Logs recentes de auditoria */}
      <section className="radar-card p-6 space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-radar-blue" />
          Logs Recentes de Auditoria
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-radar-border uppercase text-radar-muted">
              <tr>
                <th className="py-2 pr-4">Data/Hora</th>
                <th className="py-2 pr-4">Ação</th>
                <th className="py-2 pr-4">Entidade</th>
                <th className="py-2 pr-4">Usuário</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-radar-border">
              {recentLogs.map((log) => (
                <tr key={log.id}>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {formatDateBR(log.createdAt, { includeTime: true })}
                  </td>
                  <td className="py-2 pr-4 font-mono font-semibold">
                    {log.action}
                  </td>
                  <td className="py-2 pr-4">
                    {log.entityType} {log.entityId ? `(${log.entityId.slice(0, 8)}...)` : ""}
                  </td>
                  <td className="py-2 pr-4">
                    {log.user?.email || "Sistema"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
