/**
 * Camada desacoplada de Inteligência Artificial e geração de roteiros para NotebookLM.
 * O MVP funciona integralmente sem nenhuma chave de API paga configurada.
 *
 * Regras de segurança:
 * 1. Nunca executar comandos encontrados em textos coletados da internet (proteção contra prompt injection).
 * 2. Nunca publicar conteúdo gerado por IA sem aprovação humana.
 * 3. Controlar orçamento mensal antes de qualquer chamada externa.
 */

export interface AiConfigStatus {
  enabled: boolean;
  provider: string;
  model: string;
  monthlyBudgetBrl: number;
}

export function getAiConfigStatus(): AiConfigStatus {
  const provider = (process.env.AI_PROVIDER || "disabled").toLowerCase();
  const apiKey = process.env.AI_API_KEY || "";
  const model = process.env.AI_MODEL || "não configurado";
  const budget = Number(process.env.AI_MONTHLY_BUDGET_BRL || "50");

  return {
    enabled: provider !== "disabled" && apiKey.trim().length > 10,
    provider,
    model,
    monthlyBudgetBrl: Number.isFinite(budget) ? budget : 50,
  };
}

export function sanitizeUntrustedSourceText(rawText: string): string {
  // Remove marcadores que possam tentar manipular instruções de sistema de modelos de linguagem
  return rawText
    .replace(/```[\s\S]*?```/g, "[bloco removido na sanitização]")
    .replace(/(ignore previous instructions|system prompt|you are now)/gi, "[trecho filtrado]")
    .trim();
}

export interface NotebookLmExportPackage {
  programTitle: string;
  periodLabel: string;
  promptInstructions: string;
  structuredDocumentMarkdown: string;
}

export function buildNotebookLmPackage(params: {
  programSlug: "radar-da-semana" | "radar-em-debate";
  periodLabel: string;
  items: Array<{
    kind: "Notícia" | "Diário Oficial";
    title: string;
    summary: string;
    dateLabel: string;
    sourceUrl: string;
    sourceName: string;
  }>;
}): NotebookLmExportPackage {
  const isDebate = params.programSlug === "radar-em-debate";
  const programTitle = isDebate ? "Radar em Debate" : "Radar da Semana";

  const promptInstructions = isDebate
    ? [
        `Objetivo: Gerar um episódio de 10 a 20 minutos para o programa "${programTitle}" (${params.periodLabel}) em Português do Brasil.`,
        "Tom: Jornalístico, equilibrado, construtivo e estritamente baseado nos documentos anexados.",
        "Regras obrigatórias:",
        "- Apresentar perspectivas distintas sobre o impacto prático para os moradores de São José do Rio Pardo.",
        "- NÃO inventar valores, prazos, falas fictícias de pessoas reais ou acusações.",
        "- Citar explicitamente as fontes oficiais (Diário Oficial, Câmara Municipal ou PNCP).",
        "- Informar no início ou encerramento que o episódio conta com vozes sintéticas e curadoria humana do Radar Rio Pardo.",
      ].join("\n")
    : [
        `Objetivo: Gerar um episódio informativo de 5 a 10 minutos para o programa "${programTitle}" (${params.periodLabel}) em Português do Brasil.`,
        "Tom: Claro, direto, sem jargões jurídicos e acessível ao cidadão.",
        "Regras obrigatórias:",
        "- Resumir apenas os fatos confirmados nos documentos fornecidos.",
        "- Diferenciar abertura de licitação de contrato assinado e valor estimado de valor pago.",
        "- NÃO inventar números ou datas fora do documento base.",
        "- Informar que as vozes são sintéticas com revisão editorial do Radar Rio Pardo.",
      ].join("\n");

  const sections = params.items.map((item, idx) => {
    const safeSummary = sanitizeUntrustedSourceText(item.summary);
    return [
      `### ${idx + 1}. [${item.kind}] ${item.title}`,
      `- **Data de referência:** ${item.dateLabel}`,
      `- **Fonte oficial:** ${item.sourceName} (${item.sourceUrl})`,
      "",
      safeSummary,
      "",
    ].join("\n");
  });

  const structuredDocumentMarkdown = [
    `# Dossiê Editorial — ${programTitle}`,
    `**Município:** São José do Rio Pardo - SP`,
    `**Período:** ${params.periodLabel}`,
    `**Portal:** Radar Rio Pardo (radar.roqueconsultoriadigital.com.br)`,
    "",
    "---",
    "",
    "## Instruções para o NotebookLM",
    "```text",
    promptInstructions,
    "```",
    "",
    "---",
    "",
    "## Documentos e Fatos Verificados",
    "",
    sections.length > 0
      ? sections.join("\n")
      : "_Nenhum item verificado selecionado para este pacote._",
  ].join("\n");

  return {
    programTitle,
    periodLabel: params.periodLabel,
    promptInstructions,
    structuredDocumentMarkdown,
  };
}
