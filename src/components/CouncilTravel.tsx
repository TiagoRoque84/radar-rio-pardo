import { travelYears } from "@/lib/chamber/travel";
import { archiveUrl } from "@/lib/chamber/travel-source";
import council from "@/lib/chamber/production.json";

const currency = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const monthName = (month: number) => new Date(2025, month - 1, 15).toLocaleString("pt-BR", { month: "long" });

export async function CouncilTravel({ id }: { id: string }) {
  const years = await travelYears();
  return <section className="radar-card p-5 space-y-5">
    <h2 className="text-xl font-bold">Viagens vinculadas ao mandato</h2>
    <p>Pagamentos da Câmara cujo histórico identifica o participante da viagem. O saldo inclui devoluções registradas com sinal negativo. O credor pode ser um servidor ou fornecedor.</p>
    {years.map(({ year, month, payments }) => {
      const records = payments.filter(p => p.authors.includes(id));
      const individual = records.filter(p => p.authors.length === 1);
      const shared = records.filter(p => p.authors.length > 1);
      return <div key={year} className="space-y-2 border-t pt-3">
        <h3 className="font-bold">{year}{month > 0 && " · dados até " + monthName(month)}</h3>
        {!month ? <p>Arquivo anual indisponível.</p> : <>
          <p>{individual.length ? "Saldo dos pagamentos com um participante identificado: " + currency(individual.reduce((sum,p) => sum+p.cents,0)) : "Nenhum pagamento individual identificado pelos critérios de vinculação neste período."}</p>
          {shared.length > 0 && <p>{shared.length} lançamentos de viagens compartilhadas com valor integral na fonte, excluídos do saldo individual.</p>}
          {records.length > 0 && <details><summary className="cursor-pointer font-semibold">Consultar {records.length} lançamentos</summary>
            <ul className="divide-y">{records.map(p => <li className="py-2" key={p.id}>
              <strong>{currency(p.cents)}</strong> · {p.date} · {p.category.toLocaleLowerCase("pt-BR")}
              {p.authors.length > 1 && <span className="block">Viagem compartilhada com {p.authors.filter(a => a !== id).map(a => council.authors.find(c => c.id === a)?.name.trim()).join(", ")}</span>}
              <a className="block text-radar-blue underline" href={`https://transparencia.tce.sp.gov.br/municipio/sao-jose-do-rio-pardo/${year}/despesas/detalhe/${p.id}`}>Histórico e finalidade · empenho {p.commitment}</a>
            </li>)}</ul></details>}
          <a className="underline" href={archiveUrl(year)}>Base anual do TCE-SP (ZIP)</a>
        </>}
      </div>;
    })}
    <p className="text-sm">A cobertura depende da identificação nominal no histórico. Grafias ambíguas e empenhos com atribuições divergentes ficam fora da apuração.</p>
    <a className="text-radar-blue underline" href="https://camarasaojosedoriopardo.atende.net/transparencia/item/relacao-funcionario-x-salario">Consultar remuneração e subsídios</a>
  </section>;
}
