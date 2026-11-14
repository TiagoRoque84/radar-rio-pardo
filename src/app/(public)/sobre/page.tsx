import Link from "next/link";
import { ShieldCheck, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sobre o Radar",
  description:
    "Identidade editorial, independência institucional, financiamento e transparência de patrocinadores do Radar Rio Pardo.",
};

export default async function SobrePage() {
  const sponsors = await prisma.sponsorAdvertiser.findMany({
    where: { active: true },
    orderBy: { startDate: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">Sobre o Radar Rio Pardo</h1>
        <p className="text-lg text-radar-muted dark:text-slate-300">
          Informação pública sem complicação para São José do Rio Pardo — SP.
        </p>
      </header>

      <section className="radar-card p-6 space-y-4 leading-relaxed">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-radar-blue" />
          Independência Institucional
        </h2>
        <p>
          O <strong>Radar Rio Pardo</strong> é um portal independente de
          informação pública, transparência municipal, jornalismo de dados e
          acompanhamento da administração pública de São José do Rio Pardo,
          interior do estado de São Paulo.
        </p>
        <p>
          <strong>Princípio fundamental:</strong> o Radar Rio Pardo{" "}
          <strong>não é um órgão público</strong>, não possui vínculo
          institucional com a Prefeitura Municipal ou com a Câmara Municipal e
          não substitui as publicações oficiais legais. O desenvolvimento
          técnico e a infraestrutura são conduzidos pela{" "}
          <strong>Roque Consultoria Digital</strong>, com total autonomia
          editorial do portal.
        </p>
      </section>

      <section className="radar-card p-6 space-y-4 leading-relaxed">
        <h2 className="text-xl font-bold">
          Independência Editorial e Financiamento
        </h2>
        <p>
          O acesso do cidadão às informações públicas, resumos do Diário Oficial
          e indicadores básicos é e continuará sendo <strong>gratuito</strong>.
        </p>
        <p>
          Eventuais receitas futuras oriundas de publicidade local identificada,
          patrocínio de podcasts, apoio voluntário ou serviços corporativos de
          inteligência de dados jamais concedem a patrocinadores ou anunciantes
          o poder de aprovar ou vetar notícias, modificar indicadores ou exigir
          remoção indevida de conteúdos verificados.
        </p>
        <p className="text-sm text-radar-muted dark:text-slate-300">
          A aceitação de patrocínios envolvendo agentes políticos ou entidades
          fiscalizadas depende de aprovação prévia de política específica de
          conflitos de interesse antes do início de qualquer operação comercial.
        </p>
      </section>

      <section className="radar-card p-6 space-y-4">
        <h2 className="text-xl font-bold">Transparência de Patrocinadores</h2>
        {sponsors.length > 0 ? (
          <ul className="space-y-3">
            {sponsors.map((sp) => (
              <li
                key={sp.id}
                className="rounded-lg border border-radar-border p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <strong>{sp.companyName}</strong>
                  {sp.cnpj && (
                    <span className="text-xs text-radar-muted">
                      CNPJ: {sp.cnpj}
                    </span>
                  )}
                </div>
                <p className="text-xs text-radar-muted mt-1">
                  Espaço: {sp.placement} •{" "}
                  {sp.publicTransparencyNote ||
                    "Anunciante comercial sem interferência editorial."}
                </p>
                <a
                  href={sp.destinationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-radar-blue hover:underline inline-flex items-center gap-1 mt-1"
                >
                  Site do anunciante <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-radar-muted dark:text-slate-300">
            Nenhum patrocinador ou anunciante ativo nesta fase inicial de
            operação. Toda receita comercial futura será listada publicamente
            nesta página.
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-4 text-sm font-semibold">
        <Link href="/politica-editorial" className="text-radar-blue hover:underline">
          Ler Política Editorial →
        </Link>
        <Link href="/metodologia" className="text-radar-blue hover:underline">
          Ler Metodologia dos Indicadores →
        </Link>
        <Link href="/correcao" className="text-radar-blue hover:underline">
          Solicitar Correção →
        </Link>
      </div>
    </div>
  );
}
