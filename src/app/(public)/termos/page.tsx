import { AlertTriangle } from "lucide-react";

export const metadata = {
  title: "Termos de Uso (Minuta)",
};

export default function TermosPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-6">
      <h1 className="text-3xl font-bold">Termos de Uso</h1>

      <aside className="rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm flex items-start gap-2.5">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <p>
          <strong>Aviso de Minuta Jurídica:</strong> Minuta inicial preparada
          para o projeto, pendente de revisão por profissional habilitado antes
          do lançamento definitivo.
        </p>
      </aside>

      <div className="radar-card p-6 space-y-4 text-sm leading-relaxed">
        <p>
          1. O <strong>Radar Rio Pardo</strong> tem finalidade estritamente
          informativa, jornalística e educativa sobre atos e dados públicos de
          São José do Rio Pardo (SP).
        </p>
        <p>
          2. As informações resumidas não substituem certidões, intimações ou
          publicações legais nos veículos oficiais dos órgãos públicos. Sempre
          consulte o link do documento oficial citado em cada publicação antes
          de tomar decisões jurídicas ou comerciais.
        </p>
        <p>
          3. O portal é desenvolvido pela Roque Consultoria Digital e mantém
          independência editorial de entidades públicas e anunciantes.
        </p>
      </div>
    </div>
  );
}
