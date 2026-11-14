import { describe, it, expect } from "vitest";
import {
  newsArticleSchema,
  gazetteActSchema,
  correctionRequestSchema,
} from "@/lib/validators";

describe("Validação de entradas com Zod", () => {
  it("rejeita matéria com URL de fonte documental inválida", () => {
    const parsed = newsArticleSchema.safeParse({
      title: "Título válido para teste editorial",
      summary: "Resumo suficientemente longo para validação do campo.",
      content:
        "Conteúdo completo suficientemente detalhado com mais de trinta caracteres.",
      categoryId: "cat-1",
      references: [
        {
          sourceName: "Fonte Inválida",
          officialUrl: "javascript:alert(1)",
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejeita valor financeiro em formato incorreto no Diário Oficial", () => {
    const parsed = gazetteActSchema.safeParse({
      editionId: "ed-1",
      categoryId: "cat-1",
      titleSimple: "Pregão para compra de materiais",
      objectiveSummary:
        "Resumo claro e objetivo com mais de quinze caracteres.",
      financialValue: "R$ 1.200,50",
      officialUrl: "https://www.imprensaoficialmunicipal.com.br/sjriopardo",
    });
    expect(parsed.success).toBe(false);
  });

  it("valida solicitação cidadã de correção", () => {
    const parsed = correctionRequestSchema.safeParse({
      requesterName: "Maria da Silva",
      requesterEmail: "maria@exemplo.com.br",
      requestType: "CORRECTION",
      description:
        "O número do processo citado no segundo parágrafo refere-se ao ano de 2025 e não 2026.",
    });
    expect(parsed.success).toBe(true);
  });
});
