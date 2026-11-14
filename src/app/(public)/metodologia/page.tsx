import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatDateBR } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Metodologia e Fontes Oficiais",
  description:
    "Fontes oficiais monitoradas, fórmulas de cálculo e limitações técnicas dos indicadores do Radar Rio Pardo.",
};

export default async function MetodologiaPage() {
  const sources = await prisma.officialSource.findMany({
    include: { agency: true, adapters: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">
          Metodologia dos Indicadores e Fontes Oficiais
        </h1>
        <p className="text-sm sm:text-base text-radar-muted dark:text-slate-300">
          Todo indicador exibido no Radar Rio Pardo informa período, fonte, data
          da coleta, fórmula de cálculo e limitações.
        </p>
      </header>

      <section className="radar-card p-6 space-y-3 text-sm leading-relaxed">
        <h2 className="text-xl font-bold">Regras de Cálculo e Integridade</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Valores financeiros (Contas Públicas):</strong>{" "}
            Armazenados em tipo decimal exato (sem arredondamento flutuante).
            Nunca somamos valores estimados de licitações com valores empenhados,
            liquidados ou pagos.
          </li>
          <li>
            <strong>Câmara Municipal:</strong> Diferenciamos voto favorável,
            contrário, abstenção, ausência, impedimento, não votante regimental e
            informação não disponível. Ausência de dado no portal oficial nunca
            é convertida em falta do parlamentar.
          </li>
          <li>
            <strong>Diário Oficial:</strong> Cada ato recebe resumo em linguagem
            simples somente após extração legível e revisão humana. Documentos
            ilegíveis permanecem marcados como pendentes de revisão.
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">Fontes Oficiais Cadastradas</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {sources.map((src) => {
            const adapter = src.adapters[0];
            return (
              <div key={src.id} className="radar-card p-5 space-y-2 text-sm">
                <span className="text-xs font-bold uppercase text-radar-blue">
                  {src.sourceType} • {src.agency.acronym || src.agency.name}
                </span>
                <h3 className="font-bold text-base">{src.name}</h3>
                {src.termsNotes && (
                  <p className="text-xs text-radar-muted dark:text-slate-300">
                    {src.termsNotes}
                  </p>
                )}
                {adapter && (
                  <p className="text-xs text-radar-muted">
                    Status técnico: <strong>{adapter.status}</strong> • Última
                    verificação:{" "}
                    {formatDateBR(adapter.lastRunAt, {
                      includeTime: true,
                      fallback: "Aguardando primeira execução",
                    })}
                  </p>
                )}
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-radar-blue hover:underline pt-1"
                >
                  Acessar portal oficial <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
