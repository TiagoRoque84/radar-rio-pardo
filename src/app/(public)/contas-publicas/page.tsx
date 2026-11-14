import { Wallet, ExternalLink, Info } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatCurrencyBRL, formatDateBR } from "@/lib/formatters";
import { EmptyStateCard } from "@/components/EmptyStateCard";
import { SimpleBarChart } from "@/components/SimpleBarChart";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Contas Públicas, Licitações e Contratos",
  description:
    "Consulta transparente de licitações, contratos e dados financeiros municipais de São José do Rio Pardo.",
};

export default async function ContasPublicasPage() {
  const [biddings, contracts] = await Promise.all([
    prisma.biddingProcess.findMany({
      include: { agency: true },
      orderBy: { publicationDate: "desc" },
      take: 30,
    }),
    prisma.publicContract.findMany({
      include: { agency: true, supplier: true },
      orderBy: { signatureDate: "desc" },
      take: 30,
    }),
  ]);

  const modalityCounts = new Map<string, number>();
  for (const b of biddings) {
    modalityCounts.set(b.modality, (modalityCounts.get(b.modality) || 0) + 1);
  }
  const chartData = Array.from(modalityCounts.entries()).map(
    ([label, value]) => ({ label, value })
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 space-y-10">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-2.5">
          <Wallet className="h-7 w-7 text-radar-blue" aria-hidden="true" />
          Contas Públicas, Licitações e Contratos
        </h1>
        <p className="text-sm sm:text-base text-radar-muted dark:text-slate-300 max-w-3xl">
          Dados obtidos de fontes oficiais como o Portal Nacional de
          Contratações Públicas (PNCP) e portais municipais de transparência.
        </p>
      </div>

      {/* Regra financeira explicativa */}
      <div className="rounded-xl border border-radar-blue/30 bg-radar-blue/5 p-4 text-xs sm:text-sm flex items-start gap-3">
        <Info className="h-5 w-5 text-radar-blue shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">Como ler os valores financeiros corretamente</p>
          <p>
            O Radar diferencia rigorosamente <strong>Valor Estimado</strong>{" "}
            (previsão inicial de edital), <strong>Valor Contratado</strong>{" "}
            (compromisso firmado), <strong>Valor Empenhado</strong>,{" "}
            <strong>Valor Liquidado</strong> e <strong>Valor Pago</strong>. Nunca
            somamos categorias financeiras distintas nem fazemos acusações
            automáticas.
          </p>
        </div>
      </div>

      {/* Gráfico + Fontes */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SimpleBarChart
            title="Licitações registradas por modalidade"
            data={chartData}
            period="Registros sincronizados disponíveis"
            source="PNCP (IBGE 3549706) e Portais de Transparência"
            collectedAt={formatDateBR(new Date())}
            formula="Contagem simples de processos licitatórios por modalidade."
            limitations="Depende da disponibilidade de publicação na API do PNCP e dos arquivos oficiais importados."
          />
        </div>
        <aside className="radar-card p-5 space-y-3">
          <h2 className="text-base font-bold">Fontes Oficiais Monitoradas</h2>
          <ul className="space-y-2 text-xs">
            <li>
              <a
                href="https://pncp.gov.br/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-radar-blue hover:underline inline-flex items-center gap-1 font-medium"
              >
                Portal Nacional de Contratações Públicas (PNCP){" "}
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              <a
                href="https://saojosedoriopardo.sp.gov.br/portal-da-transparencia-home/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-radar-blue hover:underline inline-flex items-center gap-1 font-medium"
              >
                Portal da Transparência — Prefeitura SJRP{" "}
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>
              <a
                href="https://camarasaojosedoriopardo.atende.net/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-radar-blue hover:underline inline-flex items-center gap-1 font-medium"
              >
                Transparência da Câmara — Atende.net{" "}
                <ExternalLink className="h-3 w-3" />
              </a>
            </li>
          </ul>
        </aside>
      </div>

      {/* Licitações */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold">Licitações e Avisos de Contratação</h2>
        {biddings.length > 0 ? (
          <div className="overflow-x-auto radar-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-radar-light dark:bg-slate-800 text-xs uppercase">
                <tr>
                  <th className="p-3">Processo / Órgão</th>
                  <th className="p-3">Modalidade</th>
                  <th className="p-3">Objeto</th>
                  <th className="p-3">Publicação</th>
                  <th className="p-3">Valor Estimado</th>
                  <th className="p-3">Situação</th>
                  <th className="p-3">Fonte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-radar-border">
                {biddings.map((b) => (
                  <tr key={b.id}>
                    <td className="p-3 font-medium">
                      <span className="block">{b.processNumber}</span>
                      <span className="text-xs text-radar-muted">
                        {b.agency.acronym || b.agency.name}
                      </span>
                    </td>
                    <td className="p-3 text-xs">{b.modality}</td>
                    <td className="p-3 max-w-md text-xs leading-relaxed">
                      {b.objectDescription}
                    </td>
                    <td className="p-3 text-xs whitespace-nowrap">
                      {formatDateBR(b.publicationDate)}
                    </td>
                    <td className="p-3 font-semibold whitespace-nowrap">
                      {formatCurrencyBRL(b.estimatedValue)}
                    </td>
                    <td className="p-3 text-xs">{b.status}</td>
                    <td className="p-3 text-xs">
                      <a
                        href={b.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-radar-blue hover:underline inline-flex items-center gap-1"
                      >
                        Abrir <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyStateCard
            title="Nenhuma licitação sincronizada ainda"
            description="Execute a sincronização oficial do adaptador PNCP no painel administrativo ou importe registros oficiais validados para exibir licitações reais aqui."
            sourceLabel="API Pública PNCP"
            sourceUrl="https://pncp.gov.br/"
          />
        )}
      </section>

      {/* Contratos */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold">Contratos Públicos</h2>
        {contracts.length > 0 ? (
          <div className="overflow-x-auto radar-card">
            <table className="w-full text-left text-sm">
              <thead className="bg-radar-light dark:bg-slate-800 text-xs uppercase">
                <tr>
                  <th className="p-3">Contrato</th>
                  <th className="p-3">Fornecedor</th>
                  <th className="p-3">Objeto</th>
                  <th className="p-3">Contratado</th>
                  <th className="p-3">Empenhado</th>
                  <th className="p-3">Liquidado</th>
                  <th className="p-3">Pago</th>
                  <th className="p-3">Fonte</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-radar-border">
                {contracts.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3 font-medium">
                      <span className="block">{c.contractNumber}</span>
                      <span className="text-xs text-radar-muted">
                        {formatDateBR(c.signatureDate)}
                      </span>
                    </td>
                    <td className="p-3 text-xs">
                      {c.supplier ? (
                        <>
                          <span className="block font-medium">
                            {c.supplier.name}
                          </span>
                          <span className="text-radar-muted">
                            {c.supplier.documentMasked}
                          </span>
                        </>
                      ) : (
                        "Não informado"
                      )}
                    </td>
                    <td className="p-3 max-w-sm text-xs leading-relaxed">
                      {c.objectDescription}
                    </td>
                    <td className="p-3 text-xs font-semibold whitespace-nowrap">
                      {formatCurrencyBRL(c.contractedValue)}
                    </td>
                    <td className="p-3 text-xs whitespace-nowrap">
                      {formatCurrencyBRL(c.committedValue)}
                    </td>
                    <td className="p-3 text-xs whitespace-nowrap">
                      {formatCurrencyBRL(c.liquidatedValue)}
                    </td>
                    <td className="p-3 text-xs whitespace-nowrap">
                      {formatCurrencyBRL(c.paidValue)}
                    </td>
                    <td className="p-3 text-xs">
                      <a
                        href={c.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-radar-blue hover:underline"
                      >
                        Abrir ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyStateCard
            title="Nenhum contrato registrado na base ainda"
            description="Os contratos firmados com fornecedores aparecerão com separação estrita entre valores contratados, empenhados, liquidados e pagos."
          />
        )}
      </section>
    </div>
  );
}
