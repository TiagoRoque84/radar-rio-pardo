import { chamberAuthors } from "@/lib/chamber/production";
import Link from "next/link";
import {
  FileText,
  Newspaper,
  Landmark,
  Wallet,
  Headphones,
  Megaphone,
  ArrowRight,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrencyBRL, formatDateBR } from "@/lib/formatters";
import { EmptyStateCard } from "@/components/EmptyStateCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [
    featuredArticle,
    recentArticles,
    utilityAlerts,
    latestEdition,
    legislature,
    councilorsCount,
    propositionsCount,
    sessionsCount,
    recentBiddings,
    recentContracts,
    latestSemanaEpisode,
    latestDebateEpisode,
    activeSponsors,
  ] = await Promise.all([
    prisma.newsArticle.findFirst({
      where: { status: "PUBLISHED", deletedAt: null, featured: true },
      include: { category: true, references: true },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.newsArticle.findMany({
      where: { status: "PUBLISHED", deletedAt: null },
      include: { category: true, references: true },
      orderBy: { publishedAt: "desc" },
      take: 6,
    }),
    prisma.newsArticle.findMany({
      where: {
        status: "PUBLISHED",
        deletedAt: null,
        isPublicUtilityAlert: true,
      },
      include: { category: true },
      orderBy: { publishedAt: "desc" },
      take: 4,
    }),
    prisma.gazetteEdition.findFirst({
      where: { status: { in: ["PUBLISHED", "AUTO_PUBLISHED"] } },
      include: {
        acts: {
          where: { status: "PUBLISHED" },
          include: { category: true },
          take: 4,
        },
      },
      orderBy: { publicationDate: "desc" },
    }),
    prisma.legislature.findFirst({ where: { isCurrent: true } }),
    chamberAuthors().then(authors => authors.length),
    prisma.legislativeProposition.count(),
    prisma.chamberSession.count(),
    prisma.biddingProcess.findMany({
      include: { agency: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.publicContract.findMany({
      include: { agency: true, supplier: true },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
    prisma.podcastEpisode.findFirst({
      where: {
        status: "PUBLISHED",
        program: { slug: "radar-da-semana" },
      },
      include: { program: true },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.podcastEpisode.findFirst({
      where: {
        status: "PUBLISHED",
        program: { slug: "radar-em-debate" },
      },
      include: { program: true },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.sponsorAdvertiser.findMany({
      where: {
        active: true,
        placement: "HOMEPAGE",
        startDate: { lte: new Date() },
        endDate: { gte: new Date() },
      },
      take: 2,
    }),
  ]);

  const highlight = featuredArticle ?? recentArticles[0] ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-12">
      {/* Faixa de Apresentação Cívica */}
      <section className="rounded-2xl bg-gradient-to-r from-radar-navy to-[#174675] p-6 sm:p-8 text-white shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="max-w-2xl space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-radar-gold/20 px-3 py-1 text-xs font-semibold text-radar-gold ring-1 ring-radar-gold/40">
              Observatório Independente • São José do Rio Pardo (SP)
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Informação pública sem complicação.
            </h1>
            <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
              Acompanhe em linguagem clara o Diário Oficial, proposições da
              Câmara Municipal, licitações, contratos e notícias verificadas de
              interesse público — sempre com vínculo direto às fontes oficiais.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/diario-oficial"
              className="inline-flex items-center gap-2 rounded-lg bg-radar-gold px-4 py-2.5 text-sm font-bold text-radar-navy hover:bg-[#e0b264] transition"
            >
              <FileText className="h-4 w-4" aria-hidden="true" />
              Consultar Diário Oficial
            </Link>
            <Link
              href="/contas-publicas"
              className="inline-flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/20 transition"
            >
              <Wallet className="h-4 w-4" aria-hidden="true" />
              Licitações e Contratos
            </Link>
          </div>
        </div>
      </section>

      {/* Destaque Principal + Diário Oficial de Hoje */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Destaque principal (2 colunas) */}
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Newspaper className="h-5 w-5 text-radar-blue" aria-hidden="true" />
              Destaque Principal
            </h2>
            <Link
              href="/noticias"
              className="text-sm font-medium text-radar-blue hover:underline inline-flex items-center gap-1"
            >
              Todas as notícias <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {highlight ? (
            <article className="radar-card overflow-hidden p-6 space-y-4">
              {highlight.coverImageUrl && (
                <img
                  src={highlight.coverImageUrl}
                  alt={highlight.title}
                  className="w-full h-60 object-cover rounded-lg"
                />
              )}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-md bg-radar-blue/10 px-2.5 py-1 font-semibold text-radar-blue">
                  {highlight.category.name}
                </span>
                <span className="text-radar-muted dark:text-slate-300">
                  Publicado em {formatDateBR(highlight.publishedAt)}
                </span>
                {highlight.references[0] && (
                  <span className="text-radar-muted dark:text-slate-300">
                    • Fonte: {highlight.references[0].sourceName}
                  </span>
                )}
              </div>
              <h3 className="text-2xl font-bold font-serif leading-snug">
                <Link
                  href={`/noticias/${highlight.slug}`}
                  className="hover:text-radar-blue transition"
                >
                  {highlight.title}
                </Link>
              </h3>
              <p className="text-base text-radar-muted dark:text-slate-300 leading-relaxed">
                {highlight.summary}
              </p>
              <Link
                href={`/noticias/${highlight.slug}`}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-radar-blue hover:underline"
              >
                Ler matéria completa e fontes <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ) : (
            <EmptyStateCard
              title="Nenhuma matéria editorial publicada ainda"
              description="O Radar Rio Pardo publica apenas matérias revisadas por humanos e respaldadas por documentos oficiais. Assim que as primeiras publicações forem aprovadas no painel editorial, elas aparecerão aqui."
              actionHref="/admin"
              actionLabel="Acessar painel editorial"
            />
          )}
        </section>

        {/* Diário Oficial de Hoje (1 coluna) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-radar-blue" aria-hidden="true" />
              Diário Oficial
            </h2>
            <Link
              href="/diario-oficial"
              className="text-sm font-medium text-radar-blue hover:underline"
            >
              Ver edições
            </Link>
          </div>

          {latestEdition ? (
            <div className="radar-card p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-radar-border pb-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-radar-blue">
                    Última edição
                  </span>
                  <p className="text-lg font-bold">
                    Edição nº {latestEdition.editionNumber}
                  </p>
                </div>
                <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-semibold">
                  {formatDateBR(latestEdition.publicationDate)}
                </span>
              </div>

              <p className="text-sm text-radar-muted dark:text-slate-300">
                {latestEdition.status === "AUTO_PUBLISHED" ? (latestEdition.summaryText?.split("\n")[0] || "PDF disponível para consulta.") : latestEdition.acts.length + " ato(s) com resumo editorial."}
              </p>

              <ul className="space-y-2.5">
                {latestEdition.acts.map((act) => (
                  <li
                    key={act.id}
                    className="rounded-lg bg-radar-light dark:bg-slate-800/60 p-3 text-sm"
                  >
                    <span className="block text-xs font-semibold text-radar-blue">
                      {act.category.name}
                    </span>
                    <span className="font-medium block mt-0.5">
                      {act.titleSimple}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-col gap-2 pt-2">
                <Link
                  href={`/diario-oficial/${latestEdition.id}`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-radar-blue px-4 py-2 text-sm font-semibold text-white hover:bg-radar-blue-hover transition"
                >
                  Consultar edição
                </Link>
                <a
                  href={latestEdition.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 text-xs font-medium text-radar-blue hover:underline"
                >
                  Abrir documento oficial original{" "}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          ) : (
            <EmptyStateCard
              title="Aguardando publicação de edição verificada"
              description="Ainda não há edição do Diário Oficial Municipal processada e aprovada pela revisão editorial. O Radar nunca exibe edições fictícias."
              sourceLabel="Imprensa Oficial SJRP"
              sourceUrl="https://www.imprensaoficialmunicipal.com.br/sjriopardo"
              actionHref="/diario-oficial"
              actionLabel="Ir para Diário Oficial"
            />
          )}
        </section>
      </div>

      {/* Aconteceu em Rio Pardo */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">Aconteceu em Rio Pardo</h2>
          <Link
            href="/noticias"
            className="text-sm font-medium text-radar-blue hover:underline"
          >
            Ver arquivo completo →
          </Link>
        </div>

        {recentArticles.length > 0 ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recentArticles.map((article) => (
              <article
                key={article.id}
                className="radar-card p-5 flex flex-col justify-between gap-3 hover:border-radar-blue transition"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-radar-blue">
                      {article.category.name}
                    </span>
                    <span className="text-radar-muted dark:text-slate-400">
                      {formatDateBR(article.publishedAt)}
                    </span>
                  </div>
                  <h3 className="text-base font-bold leading-snug">
                    <Link
                      href={`/noticias/${article.slug}`}
                      className="hover:text-radar-blue"
                    >
                      {article.title}
                    </Link>
                  </h3>
                  <p className="text-sm text-radar-muted dark:text-slate-300 line-clamp-3">
                    {article.summary}
                  </p>
                </div>
                <div className="pt-2 border-t border-radar-border flex items-center justify-between text-xs">
                  <span className="text-radar-muted dark:text-slate-400 truncate max-w-[70%]">
                    {article.references[0]?.sourceName || "Fonte documental vinculada"}
                  </span>
                  <Link
                    href={`/noticias/${article.slug}`}
                    className="font-semibold text-radar-blue hover:underline shrink-0"
                  >
                    Ler mais
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyStateCard
            title="Arquivo de notícias em preparação"
            description="Nenhuma matéria publicada no momento. Todas as notícias passam por verificação documental e revisão editorial antes de irem ao ar."
          />
        )}
      </section>

      {/* Câmara em Números & Transparência e Gastos */}
      <div className="grid gap-8 lg:grid-cols-2">
        {/* Câmara em Números */}
        <section className="radar-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Landmark className="h-5 w-5 text-radar-blue" aria-hidden="true" />
              Câmara em Números
            </h2>
            <Link
              href="/camara"
              className="text-sm font-medium text-radar-blue hover:underline"
            >
              Painel da Câmara →
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-radar-light dark:bg-slate-800/60 p-4">
              <span className="text-xs text-radar-muted dark:text-slate-300">
                Cadeiras na legislatura
              </span>
              <p className="mt-1 text-2xl font-bold">
                {legislature?.totalSeats ?? 13}
              </p>
              <span className="text-[11px] text-radar-muted dark:text-slate-400">
                {legislature?.title || "Legislatura atual"}
              </span>
            </div>
            <div className="rounded-lg bg-radar-light dark:bg-slate-800/60 p-4">
              <span className="text-xs text-radar-muted dark:text-slate-300">
                Autores na Câmara
              </span>
              <p className="mt-1 text-2xl font-bold">{councilorsCount}</p>
              <span className="text-[11px] text-radar-muted dark:text-slate-400">
                Base documental verificada
              </span>
            </div>
            <div className="rounded-lg bg-radar-light dark:bg-slate-800/60 p-4">
              <span className="text-xs text-radar-muted dark:text-slate-300">
                Proposições registradas
              </span>
              <p className="mt-1 text-2xl font-bold">{propositionsCount}</p>
              <span className="text-[11px] text-radar-muted dark:text-slate-400">
                PLs, requerimentos e indicações
              </span>
            </div>
            <div className="rounded-lg bg-radar-light dark:bg-slate-800/60 p-4">
              <span className="text-xs text-radar-muted dark:text-slate-300">
                Sessões acompanhadas
              </span>
              <p className="mt-1 text-2xl font-bold">{sessionsCount}</p>
              <span className="text-[11px] text-radar-muted dark:text-slate-400">
                Ordinárias e extraordinárias
              </span>
            </div>
          </div>

          <p className="text-xs text-radar-muted dark:text-slate-300 border-t border-radar-border pt-3">
            <strong>Metodologia:</strong> Contagem direta de registros
            importados das fontes oficiais da Câmara Municipal. O Radar Rio
            Pardo não elabora rankings de &ldquo;melhores&rdquo; ou &ldquo;piores&rdquo; vereadores.{" "}
            <Link href="/metodologia" className="text-radar-blue underline">
              Ver metodologia completa
            </Link>
            .
          </p>
        </section>

        {/* Transparência e Gastos */}
        <section className="radar-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Wallet className="h-5 w-5 text-radar-blue" aria-hidden="true" />
              Transparência e Gastos
            </h2>
            <Link
              href="/contas-publicas"
              className="text-sm font-medium text-radar-blue hover:underline"
            >
              Ver contas públicas →
            </Link>
          </div>

          {recentBiddings.length > 0 || recentContracts.length > 0 ? (
            <div className="space-y-3">
              {recentBiddings.map((b) => (
                <div
                  key={b.id}
                  className="rounded-lg border border-radar-border p-3 text-sm"
                >
                  <div className="flex items-center justify-between text-xs text-radar-blue font-semibold">
                    <span>Licitação • {b.modality}</span>
                    <span>{b.status}</span>
                  </div>
                  <p className="font-medium mt-1 line-clamp-2">
                    {b.objectDescription}
                  </p>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-radar-muted dark:text-slate-300">
                    <span>
                      Valor estimado:{" "}
                      <strong>{formatCurrencyBRL(b.estimatedValue)}</strong>
                    </span>
                    <a
                      href={b.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-radar-blue hover:underline"
                    >
                      Fonte ↗
                    </a>
                  </div>
                </div>
              ))}
              {recentContracts.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-radar-border p-3 text-sm"
                >
                  <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                    <span>Contrato nº {c.contractNumber}</span>
                    <span>{c.status}</span>
                  </div>
                  <p className="font-medium mt-1 line-clamp-2">
                    {c.objectDescription}
                  </p>
                  <p className="mt-1 text-xs text-radar-muted dark:text-slate-300">
                    Valor contratado:{" "}
                    <strong>{formatCurrencyBRL(c.contractedValue)}</strong> •
                    Pago: <strong>{formatCurrencyBRL(c.paidValue)}</strong>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyStateCard
              title="Aguardando primeira sincronização de licitações e contratos"
              description="As contratações oficiais serão listadas aqui após sincronização com o PNCP (IBGE 3549706) ou importação validada dos portais municipais, diferenciando sempre valor estimado, contratado, empenhado e pago."
              sourceLabel="PNCP"
              sourceUrl="https://pncp.gov.br/"
            />
          )}
        </section>
      </div>

      {/* Podcasts & Avisos de Utilidade Pública */}
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="radar-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Headphones className="h-5 w-5 text-radar-blue" aria-hidden="true" />
              Podcasts do Radar
            </h2>
            <Link
              href="/podcasts"
              className="text-sm font-medium text-radar-blue hover:underline"
            >
              Catálogo de episódios →
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              {
                label: "Radar da Semana (5–10 min)",
                ep: latestSemanaEpisode,
                desc: "Resumo semanal objetivo dos principais atos públicos.",
              },
              {
                label: "Radar em Debate (10–20 min)",
                ep: latestDebateEpisode,
                desc: "Análise documental com múltiplas perspectivas.",
              },
            ].map((prog) => (
              <div
                key={prog.label}
                className="rounded-lg bg-radar-light dark:bg-slate-800/60 p-4 space-y-2"
              >
                <span className="text-xs font-bold text-radar-blue">
                  {prog.label}
                </span>
                {prog.ep ? (
                  <>
                    <h3 className="text-sm font-bold">{prog.ep.title}</h3>
                    {prog.ep.audioUrl ? (
                      <audio
                        controls
                        preload="none"
                        className="w-full h-9 mt-2"
                        src={prog.ep.audioUrl}
                      >
                        Seu navegador não suporta áudio HTML5.
                      </audio>
                    ) : (
                      <p className="text-xs text-radar-muted">
                        Áudio em processamento.
                      </p>
                    )}
                    <p className="text-[11px] text-radar-muted dark:text-slate-400">
                      {prog.ep.syntheticVoiceNotice}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-radar-muted dark:text-slate-300">
                    {prog.desc} Primeiro episódio em preparação editorial.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="radar-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Megaphone className="h-5 w-5 text-radar-gold-dark" aria-hidden="true" />
              Avisos de Utilidade Pública
            </h2>
            <Link
              href="/noticias?categoria=avisos-a-populacao"
              className="text-sm font-medium text-radar-blue hover:underline"
            >
              Ver avisos →
            </Link>
          </div>

          {utilityAlerts.length > 0 ? (
            <ul className="space-y-3">
              {utilityAlerts.map((alert) => (
                <li
                  key={alert.id}
                  className="rounded-lg border-l-4 border-radar-gold bg-amber-50/60 dark:bg-slate-800/70 p-3"
                >
                  <Link
                    href={`/noticias/${alert.slug}`}
                    className="font-semibold text-sm hover:text-radar-blue block"
                  >
                    {alert.title}
                  </Link>
                  <span className="text-xs text-radar-muted dark:text-slate-300">
                    {alert.category.name} • {formatDateBR(alert.publishedAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyStateCard
              title="Sem avisos urgentes publicados no momento"
              description="Concursos públicos, processos seletivos, audiências públicas e prazos relevantes aparecerão aqui após conferência nos canais oficiais do município."
            />
          )}
        </section>
      </div>

      {/* Espaço publicitário discreto e identificado (quando houver anunciante ativo) */}
      {activeSponsors.length > 0 && (
        <section className="radar-card p-4 bg-radar-light dark:bg-slate-800/40">
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-radar-muted">
              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
              Publicidade Identificada (Não interfere na independência editorial)
            </span>
            <Link href="/sobre" className="text-xs text-radar-blue underline">
              Transparência de patrocinadores
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {activeSponsors.map((sp) => (
              <a
                key={sp.id}
                href={sp.destinationUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="block rounded-lg border border-radar-border bg-white dark:bg-slate-900 p-4 hover:border-radar-blue transition"
              >
                <p className="text-sm font-bold">{sp.companyName}</p>
                {sp.publicTransparencyNote && (
                  <p className="text-xs text-radar-muted mt-1">
                    {sp.publicTransparencyNote}
                  </p>
                )}
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
