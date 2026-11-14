import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-radar-border bg-radar-navy text-slate-200">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        {/* Aviso obrigatório de independência */}
        <div className="mb-8 rounded-xl border border-radar-gold/40 bg-[#0b1c2e] p-4 sm:p-5 flex items-start gap-3">
          <ShieldCheck
            className="h-5 w-5 text-radar-gold shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p className="text-xs sm:text-sm leading-relaxed text-slate-200">
            <strong className="text-white">Independência Institucional:</strong>{" "}
            O <strong>Radar Rio Pardo</strong> é um projeto independente de
            jornalismo de dados e transparência cívica voltado a São José do Rio
            Pardo (SP). Não é um órgão público, não possui vínculo institucional
            com a Prefeitura ou com a Câmara Municipal e não substitui as
            publicações legais oficiais.
          </p>
        </div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h2 className="text-base font-bold text-white">Radar Rio Pardo</h2>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Informação pública sem complicação. Acompanhamento documental do
              Diário Oficial, Legislativo, licitações e despesas municipais.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-radar-gold">
              Editorial & Metodologia
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/sobre" className="hover:text-white hover:underline">
                  Sobre o Radar e Financiamento
                </Link>
              </li>
              <li>
                <Link
                  href="/politica-editorial"
                  className="hover:text-white hover:underline"
                >
                  Política Editorial
                </Link>
              </li>
              <li>
                <Link
                  href="/metodologia"
                  className="hover:text-white hover:underline"
                >
                  Metodologia e Fontes Oficiais
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-radar-gold">
              Transparência & Direitos
            </h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link
                  href="/correcao"
                  className="hover:text-white hover:underline"
                >
                  Solicitar Correção / Direito de Resposta
                </Link>
              </li>
              <li>
                <Link
                  href="/privacidade"
                  className="hover:text-white hover:underline"
                >
                  Política de Privacidade (LGPD)
                </Link>
              </li>
              <li>
                <Link href="/termos" className="hover:text-white hover:underline">
                  Termos de Uso
                </Link>
              </li>
              <li>
                <Link href="/contato" className="hover:text-white hover:underline">
                  Canal de Contato
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-radar-gold">
              Créditos Técnicos
            </h3>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Desenvolvimento técnico e infraestrutura:{" "}
              <strong className="text-white">Roque Consultoria Digital</strong>.
            </p>
            <p className="mt-2 text-xs text-slate-400">
              São José do Rio Pardo — São Paulo — Brasil
            </p>
            <div className="mt-3">
              <Link
                href="/admin"
                className="text-xs text-slate-400 hover:text-white underline"
              >
                Acesso editorial (/admin)
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Radar Rio Pardo • Portal gratuito para a
          população.
        </div>
      </div>
    </footer>
  );
}
