import Link from "next/link";
import { Headphones, Download, Bot } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateBR, formatDuration } from "@/lib/formatters";
import { EmptyStateCard } from "@/components/EmptyStateCard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Podcasts",
  description:
    "Programas semanais Radar da Semana e Radar em Debate com resumos e análises documentais.",
};

export default async function PodcastsPage({
  searchParams,
}: {
  searchParams: Promise<{ programa?: string }>;
}) {
  const params = await searchParams;
  const programSlug = params.programa || "";

  const [programs, episodes] = await Promise.all([
    prisma.podcastProgram.findMany({ where: { active: true } }),
    prisma.podcastEpisode.findMany({
      where: {
        status: "PUBLISHED",
        ...(programSlug ? { program: { slug: programSlug } } : {}),
      },
      include: { program: true },
      orderBy: { publishedAt: "desc" },
    }),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-2.5">
          <Headphones className="h-7 w-7 text-radar-blue" aria-hidden="true" />
          Podcasts do Radar Rio Pardo
        </h1>
        <p className="text-sm sm:text-base text-radar-muted dark:text-slate-300 max-w-3xl">
          Programas semanais baseados exclusivamente em fatos e documentos
          oficiais verificados. Sempre informamos de forma transparente quando há
          uso de vozes sintéticas.
        </p>
      </div>

      {/* Filtro por programa */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/podcasts"
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            !programSlug
              ? "bg-radar-blue text-white"
              : "radar-card hover:border-radar-blue"
          }`}
        >
          Todos os programas
        </Link>
        {programs.map((p) => (
          <Link
            key={p.id}
            href={`/podcasts?programa=${p.slug}`}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              programSlug === p.slug
                ? "bg-radar-blue text-white"
                : "radar-card hover:border-radar-blue"
            }`}
          >
            {p.title} ({p.durationRange})
          </Link>
        ))}
      </div>

      {/* Descrição dos programas */}
      <div className="grid gap-4 md:grid-cols-2">
        {programs.map((p) => (
          <div key={p.id} className="radar-card p-5 space-y-1.5">
            <h2 className="text-lg font-bold">{p.title}</h2>
            <p className="text-xs font-semibold text-radar-blue">
              Duração média: {p.durationRange}
            </p>
            <p className="text-sm text-radar-muted dark:text-slate-300">
              {p.formatDescription}
            </p>
          </div>
        ))}
      </div>

      {/* Lista de episódios */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold">Episódios Publicados</h2>
        {episodes.length > 0 ? (
          <div className="space-y-4">
            {episodes.map((ep) => {
              const sources: Array<{ title: string; url: string }> = (() => {
                try {
                  return JSON.parse(ep.sourcesJson);
                } catch {
                  return [];
                }
              })();

              return (
                <article key={ep.id} className="radar-card p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="rounded bg-radar-blue/10 px-2.5 py-0.5 font-bold text-radar-blue">
                      {ep.program.title} • Episódio #{ep.episodeNumber}
                    </span>
                    <span className="text-radar-muted">
                      {formatDateBR(ep.publishedAt)} •{" "}
                      {formatDuration(ep.durationSeconds)}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold">{ep.title}</h3>
                  <p className="text-sm text-radar-muted dark:text-slate-300 leading-relaxed">
                    {ep.description}
                  </p>

                  {ep.audioUrl && (
                    <div className="space-y-2">
                      <audio
                        controls
                        preload="none"
                        src={ep.audioUrl}
                        className="w-full"
                      >
                        Seu navegador não suporta o player de áudio HTML5.
                      </audio>
                      {ep.allowDownload && (
                        <a
                          href={ep.audioUrl}
                          download
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-radar-blue hover:underline"
                        >
                          <Download className="h-3.5 w-3.5" /> Baixar áudio
                        </a>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-radar-muted dark:text-slate-300 flex items-center gap-1.5 bg-radar-light dark:bg-slate-800/60 p-2.5 rounded-lg">
                    <Bot className="h-4 w-4 text-radar-blue shrink-0" />
                    <span>{ep.syntheticVoiceNotice}</span>
                  </p>

                  {sources.length > 0 && (
                    <div className="border-t border-radar-border pt-3 text-xs space-y-1">
                      <p className="font-semibold">Referências documentais:</p>
                      <ul className="list-disc pl-5 space-y-1">
                        {sources.map((src, i) => (
                          <li key={i}>
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-radar-blue hover:underline"
                            >
                              {src.title || src.url} ↗
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyStateCard
            title="Nenhum episódio publicado ainda"
            description="Os primeiros episódios do Radar da Semana e do Radar em Debate estão em fase de curadoria editorial baseada em documentos verificados."
          />
        )}
      </section>
    </div>
  );
}
