import Link from "next/link";
import { Mail, FileEdit } from "lucide-react";

export const metadata = {
  title: "Contato",
};

export default function ContatoPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 space-y-6">
      <h1 className="text-3xl font-bold">Canal de Contato</h1>
      <div className="radar-card p-6 space-y-4 text-sm leading-relaxed">
        <p>
          O Radar Rio Pardo recebe dúvidas sobre metodologia, sugestões de
          pautas baseadas em documentos públicos, solicitações de correção e
          demandas relacionadas à LGPD.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 pt-2">
          <div className="rounded-lg bg-radar-light dark:bg-slate-800/60 p-4 space-y-2">
            <Mail className="h-5 w-5 text-radar-blue" />
            <h2 className="font-bold">Responsabilidade Técnica</h2>
            <p className="text-xs text-radar-muted dark:text-slate-300">
              Roque Consultoria Digital — São José do Rio Pardo, SP.
            </p>
            <p className="text-xs font-semibold">
              contato@roqueconsultoriadigital.com.br
            </p>
          </div>
          <div className="rounded-lg bg-radar-light dark:bg-slate-800/60 p-4 space-y-2">
            <FileEdit className="h-5 w-5 text-radar-blue" />
            <h2 className="font-bold">Correções e Direito de Resposta</h2>
            <p className="text-xs text-radar-muted dark:text-slate-300">
              Para protocolo rastreável no painel editorial, utilize o formulário
              dedicado:
            </p>
            <Link
              href="/correcao"
              className="inline-block text-xs font-bold text-radar-blue hover:underline"
            >
              Abrir formulário de solicitação →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
