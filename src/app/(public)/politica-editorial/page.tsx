import Link from "next/link";

export const metadata = {
  title: "Política Editorial",
  description:
    "Princípios editoriais, verificação documental, proteção de dados (LGPD) e transparência do Radar Rio Pardo.",
};

const PRINCIPLES = [
  "Veracidade e verificabilidade: nenhum fato, valor ou prazo é publicado sem base documental conferida.",
  "Fontes identificadas: toda publicação relevante cita o órgão oficial, URL, número do documento e data de consulta.",
  "Contextualização: números brutos são acompanhados de período, metodologia e limitações.",
  "Separação rigorosa entre fato, análise técnica e opinião.",
  "Presunção de inocência: alertas técnicos ou divergências documentais não são transformados em acusações criminais.",
  "Proteção de dados pessoais (LGPD): não republicamos CPF, RG, endereço residencial, telefone particular ou dados sensíveis sem estrita necessidade de interesse público.",
  "Tratamento respeitoso das pessoas mencionadas em documentos oficiais.",
  "Correções transparentes: erros identificados são corrigidos com nota pública visível e registro de histórico.",
  "Transparência sobre uso de Inteligência Artificial: todo apoio de IA é explicitado e jamais publicado sem revisão humana.",
  "Independência editorial absoluta frente a governos, partidos e patrocinadores.",
];

export default function PoliticaEditorialPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-8">
      <h1 className="text-3xl font-bold">Política Editorial</h1>

      <section className="radar-card p-6 space-y-4">
        <h2 className="text-xl font-bold">Os 10 Princípios Obrigatórios</h2>
        <ol className="list-decimal pl-5 space-y-2.5 text-sm sm:text-base leading-relaxed">
          {PRINCIPLES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </section>

      <section className="radar-card p-6 space-y-3 text-sm leading-relaxed">
        <h2 className="text-xl font-bold">O que o Radar Rio Pardo não faz</h2>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Não acusa pessoas ou empresas de crimes por inferência algorítmica.</li>
          <li>Não confunde abertura de licitação com contrato assinado ou valor estimado com valor efetivamente pago.</li>
          <li>Não trata indicações ou requerimentos da Câmara como leis aprovadas.</li>
          <li>Não produz rankings depreciativos de vereadores.</li>
          <li>Não mantém comentários anônimos abertos sem moderação estruturada.</li>
        </ul>
      </section>

      <p className="text-sm">
        Precisa apontar uma incorreção ou solicitar remoção de dado pessoal?{" "}
        <Link href="/correcao" className="font-semibold text-radar-blue underline">
          Acesse o formulário de Solicitação de Correção
        </Link>
        .
      </p>
    </div>
  );
}
