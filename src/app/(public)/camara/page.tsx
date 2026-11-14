import { Landmark, ExternalLink, Info } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateBR } from "@/lib/formatters";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import { SimpleBarChart } from "@/components/SimpleBarChart";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Câmara Municipal",
  description:
    "Acompanhamento documental de vereadores, proposições, sessões e votações da Câmara Municipal de São José do Rio Pardo.",
};

const PROPOSITION_LABELS: Record<string, string> = {
  PROJETO_LEI: "Projeto de Lei",
  PROJETO_DECRETO: "Projeto de Decreto Legislativo",
  PROJETO_RESOLUCAO: "Projeto de Resolução",
  REQUERIMENTO: "Requerimento",
  INDICACAO: "Indicação (não é lei)",
  MOCAO: "Moção",
  EMENDA: "Emenda",
};

export default async function CamaraPage() {
  const [legislature, councilors, propositions, sessions] = await Promise.all([
    prisma.legislature.findFirst({ where: { isCurrent: true } }),
    prisma.councilor.findMany({
      where: { active: true },
      orderBy: { parliamentaryName: "asc" },
    }),
    prisma.legislativeProposition.findMany({
      include: { author: true },
      orderBy: [{ year: "desc" }, { lastUpdated: "desc" }],
      take: 25,
    }),
    prisma.chamberSession.findMany({
      include: {
        attendances: true,
        votes: true,
      },
      orderBy: { sessionDate: "desc" },
      take: 12,
    }),
  ]);

  const byTypeMap = new Map<string, number>();
  for (const prop of propositions) {
    const label = PROPOSITION_LABELS[prop.type] || prop.type;
    byTypeMap.set(label, (byTypeMap.get(label) || 0) + 1);
  }
  const chartData = Array.from(byTypeMap.entries()).map(([label, value]) => ({
    label,
    value,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-2.5">
          <Landmark className="h-7 w-7 text-radar-blue" aria-hidden="true" />
          Câmara Municipal de São José do Rio Pardo
        </h1>
        <p className="text-sm sm:text-base text-radar-muted dark:text-slate-300 max-w-3xl">
          Acompanhamento legislativo objetivo e documental. Diferenciamos
          claramente indicações e requerimentos de projetos de lei, e nunca
          publicamos rankings depreciativos de parlamentares.
        </p>
      </div>

      {/* Resumo institucional */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="radar-card p-5">
          <span className="text-xs font-semibold text-radar-muted">
            Legislatura Consultada
          </span>
          <p className="mt-1 text-xl font-bold">
            {legislature?.title || "2025–2028"}
          </p>
          <span className="text-xs text-radar-muted">
            {legislature?.totalSeats ?? 13} cadeiras previstas
          </span>
        </div>
        <div className="radar-card p-5">
          <span className="text-xs font-semibold text-radar-muted">
            Vereadores Catalogados
          </span>
          <p className="mt-1 text-xl font-bold">{councilors.length}</p>
          <span className="text-xs text-radar-muted">
            Com histórico preservado
          </span>
        </div>
        <div className="radar-card p-5">
          <span className="text-xs font-semibold text-radar-muted">
            Proposições Registradas
          </span>
          <p className="mt-1 text-xl font-bold">{propositions.length}</p>
          <span className="text-xs text-radar-muted">
            Projetos, indicações e requerimentos
          </span>
        </div>
        <div className="radar-card p-5">
          <span className="text-xs font-semibold text-radar-muted">
            Sessões Documentadas
          </span>
          <p className="mt-1 text-xl font-bold">{sessions.length}</p>
          <span className="text-xs text-radar-muted">
            Base oficial da Câmara
          </span>
        </div>
      </div>

      {/* Alerta metodológico */}
      <div className="rounded-xl border border-radar-blue/30 bg-radar-blue/5 p-4 text-xs sm:text-sm flex items-start gap-3">
        <Info className="h-5 w-5 text-radar-blue shrink-0 mt-0.5" />
        <p>
          <strong>Compromisso de imparcialidade:</strong> O Radar Rio Pardo não
          classifica vereadores como &ldquo;melhores&rdquo; ou
          &ldquo;piores&rdquo; pela quantidade de projetos, indicações ou
          presenças, pois cada tipo de proposição possui alcance jurídico
          distinto. Os dados abaixo servem para consulta cidadã direta.
        </p>
      </div>

      {/* Vereadores */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold">Vereadores da Legislatura</h2>
        {councilors.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {councilors.map((c) => (
              <div key={c.id} className="radar-card p-5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold">
                      {c.parliamentaryName}
                    </h3>
                    <p className="text-xs text-radar-muted">{c.fullName}</p>
                  </div>
                  {c.partyAcronym && (
                    <span className="rounded bg-radar-navy px-2 py-0.5 text-xs font-bold text-white">
                      {c.partyAcronym}
                    </span>
                  )}
                </div>
                {c.roleInBoard && (
                  <p className="text-xs font-semibold text-radar-blue">
                    Mesa Diretora: {c.roleInBoard}
                  </p>
                )}
                {c.officialProfileUrl && (
                  <a
                    href={c.officialProfileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-radar-blue hover:underline pt-1"
                  >
                    Perfil oficial na Câmara <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyStateCard
            title="Cadastro de vereadores aguardando importação oficial"
            description="Os perfis parlamentares serão exibidos após importação verificada no portal oficial da Câmara Municipal de São José do Rio Pardo, preservando histórico de legislaturas e filiações."
            sourceLabel="Câmara Municipal SJRP"
            sourceUrl="https://camarasjriopardo.sp.gov.br/"
          />
        )}
      </section>

      {/* Proposições e Gráfico */}
      <div className="grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-bold">Proposições Legislativas</h2>
          {propositions.length > 0 ? (
            <div className="space-y-3">
              {propositions.map((prop) => (
                <article key={prop.id} className="radar-card p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="rounded bg-radar-blue/10 px-2.5 py-0.5 font-semibold text-radar-blue">
                      {PROPOSITION_LABELS[prop.type] || prop.type} nº{" "}
                      {prop.number}/{prop.year}
                    </span>
                    <span className="font-medium text-radar-muted">
                      Situação: {prop.status}
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed">
                    {prop.summary}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-radar-muted pt-1">
                    <span>
                      Autoria:{" "}
                      {prop.author?.parliamentaryName || "Não informado / Coletivo"}
                    </span>
                    <a
                      href={prop.officialUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-radar-blue hover:underline inline-flex items-center gap-1"
                    >
                      Texto oficial <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyStateCard
              title="Nenhuma proposição legislativa cadastrada ainda"
              description="Projetos de lei, decretos legislativos, requerimentos e indicações serão listados aqui com identificação clara de sua natureza jurídica."
              sourceLabel="Portal da Câmara SJRP"
              sourceUrl="https://camarasjriopardo.sp.gov.br/"
            />
          )}
        </section>

        <div>
          <SimpleBarChart
            title="Proposições por Tipo"
            data={chartData}
            period="Registros importados até a data atual"
            source="Câmara Municipal de São José do Rio Pardo"
            collectedAt={formatDateBR(new Date())}
            formula="Contagem absoluta de proposições registradas no banco por categoria."
            limitations="Reflete apenas os registros importados e conferidos na base do Radar."
          />
        </div>
      </div>

      {/* Sessões */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold">Sessões Plenárias</h2>
        {sessions.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sessions.map((s) => (
              <div key={s.id} className="radar-card p-4 space-y-2">
                <div className="flex justify-between text-xs font-semibold text-radar-blue">
                  <span>
                    {s.sessionType} nº {s.sessionNumber}
                  </span>
                  <span>{formatDateBR(s.sessionDate)}</span>
                </div>
                <p className="text-xs text-radar-muted">
                  Presenças registradas: {s.attendances.length} • Votações:{" "}
                  {s.votes.length}
                </p>
                {s.officialUrl && (
                  <a
                    href={s.officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-radar-blue hover:underline inline-flex items-center gap-1"
                  >
                    Ata / Pauta oficial <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyStateCard
            title="Sem sessões plenárias registradas ainda"
            description="Quando as atas e listas de presença oficiais forem cadastradas, o registro detalhará presenças, ausências justificadas e votações sem confundir ausência de informação com falta."
          />
        )}
      </section>
    </div>
  );
}
