import { AlertTriangle } from "lucide-react";

export const metadata = {
  title: "Política de Privacidade (Minuta)",
};

export default function PrivacidadePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
      <h1 className="text-3xl font-bold">Política de Privacidade (LGPD)</h1>

      <aside className="rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm flex items-start gap-2.5">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <p>
          <strong>Aviso de Minuta Jurídica:</strong> Este texto constitui
          minuta técnica preparatória em conformidade com a LGPD (Lei nº
          13.709/2018), pendente de revisão por profissional jurídico
          habilitado antes do lançamento comercial definitivo.
        </p>
      </aside>

      <div className="radar-card p-6 space-y-4 text-sm leading-relaxed">
        <p>
          1. <strong>Coleta mínima na navegação pública:</strong> O acesso do
          cidadão às páginas informativas do Radar Rio Pardo não exige cadastro,
          login ou fornecimento de dados pessoais.
        </p>
        <p>
          2. <strong>Dados fornecidos voluntariamente:</strong> Quando o usuário
          envia uma solicitação de correção ou contato, nome e e-mail são
          armazenados exclusivamente para análise editorial e resposta ao pedido.
        </p>
        <p>
          3. <strong>Tratamento de dados em documentos oficiais:</strong> O
          portal aplica filtros automatizados e revisão humana para ocultar CPF,
          RG, telefone particular, dados bancários e informações sensíveis não
          indispensáveis ao interesse público.
        </p>
        <p>
          4. <strong>Direitos do titular:</strong> Qualquer pessoa pode
          solicitar esclarecimentos ou remoção de dados pessoais expostos
          indevidamente por meio da página{" "}
          <a href="/correcao" className="text-radar-blue underline">
            Solicitação de Correção e LGPD
          </a>
          .
        </p>
      </div>
    </div>
  );
}
