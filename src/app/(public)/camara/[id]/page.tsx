import { CouncilTravel } from "@/components/CouncilTravel";
import Link from "next/link";
import { notFound } from "next/navigation";
import { chamberAuthors, productionTypes, productionUrl } from "@/lib/chamber/production";

export const dynamic = "force-dynamic";

export default async function CouncilorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const author = (await chamberAuthors()).find(item => item.id === id);
  if (!author) notFound();
  const types = await productionTypes(id);
  const source = productionUrl + "?l=38&id=" + id;
  return <main className="mx-auto max-w-4xl px-4 py-8 space-y-8">
    <Link href="/camara" className="text-radar-blue">← Câmara Municipal</Link>
    <header><h1 className="text-3xl font-bold">{author.name}</h1><p>Produção legislativa · 2025–2028</p></header>
    <section className="radar-card p-5 space-y-3"><h2 className="text-xl font-bold">Propostas por tipo</h2>
      <p>Selecione um tipo para consultar número, data, assunto e documentos no portal da Câmara.</p>
      <ul>{types.map(row => <li key={row.type}><a className="flex justify-between border-b py-2 text-radar-blue hover:underline" href={source + "&t=" + row.type}><span>{row.name}</span><strong>{row.count}</strong></a></li>)}</ul>
      <a className="text-radar-blue underline" href={source}>Ficha de produção na Câmara</a>
    </section>
    <CouncilTravel id={id} />
    {id === "90" && <section className="radar-card p-5 space-y-3"><h2 className="text-xl font-bold">Histórico · novembro de 2024</h2>
      <p>O empenho 0390-2024 identifica Rubens Lobato como participante de uma viagem a São Paulo para reunião com deputado estadual. Para alimentação, a Câmara empenhou R$ 342,58, anulou R$ 277,52 e registrou R$ 65,06 pagos. O credor registrado é outra pessoa.</p>
      <p><a className="underline" href="https://transparencia.tce.sp.gov.br/municipio/sao-jose-do-rio-pardo/2024/despesas/detalhe/630660046">Histórico do empenho</a> · <a className="underline" href="https://transparencia.tce.sp.gov.br/api/json/despesas/sao-jose-do-rio-pardo/2024/11">Pagamentos e anulações do mês</a></p>
    </section>}
  </main>;
}
