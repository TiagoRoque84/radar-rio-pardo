import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { importGazetteBatch } from "@/lib/collectors/manual-importer";

describe("Integração com Banco de Dados (Editorial, Diário Oficial e Deduplicação)", () => {
  const createdIds: {
    articleIds: string[];
    editionIds: string[];
    correctionIds: string[];
  } = {
    articleIds: [],
    editionIds: [],
    correctionIds: [],
  };

  afterAll(async () => {
    if (createdIds.correctionIds.length > 0) {
      await prisma.correctionRequest.deleteMany({
        where: { id: { in: createdIds.correctionIds } },
      });
    }
    if (createdIds.articleIds.length > 0) {
      await prisma.newsArticle.deleteMany({
        where: { id: { in: createdIds.articleIds } },
      });
    }
    if (createdIds.editionIds.length > 0) {
      await prisma.gazetteEdition.deleteMany({
        where: { id: { in: createdIds.editionIds } },
      });
    }
    await prisma.$disconnect();
  });

  it("cria rascunho de notícia com fonte oficial e distingue rascunho de publicação", async () => {
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    const category = await prisma.newsCategory.findFirst();

    expect(admin).not.toBeNull();
    expect(category).not.toBeNull();

    const slug = `teste-integracao-${Date.now()}`;
    const draft = await prisma.newsArticle.create({
      data: {
        title: "Teste automatizado de fluxo editorial",
        slug,
        summary: "Resumo de teste isolado para validação de rascunho.",
        content: "Texto de teste para verificar separação entre rascunho e publicação.",
        categoryId: category!.id,
        authorId: admin!.id,
        status: "DRAFT",
        references: {
          create: [
            {
              sourceName: "Diário Oficial SJRP",
              officialUrl: "https://www.imprensaoficialmunicipal.com.br/sjriopardo",
            },
          ],
        },
      },
      include: { references: true },
    });
    createdIds.articleIds.push(draft.id);

    expect(draft.references.length).toBe(1);

    // Consulta pública não deve retornar rascunhos
    const publicCheck = await prisma.newsArticle.findFirst({
      where: { id: draft.id, status: "PUBLISHED" },
    });
    expect(publicCheck).toBeNull();
  });

  it("importa lote do Diário Oficial, aplica deduplicação na reexecução e exige revisão humana", async () => {
    const editionNumber = `TEST-${Date.now()}`;
    const batch = {
      editionNumber,
      publicationDate: "2026-11-14",
      officialUrl: "https://www.imprensaoficialmunicipal.com.br/sjriopardo",
      acts: [
        {
          categorySlug: "licitacoes",
          actNumber: "PE 999/2026",
          titleSimple: "Teste de importação de licitação",
          objectiveSummary:
            "Resumo objetivo de teste com CPF 123.456.789-01 para validar LGPD.",
          financialValue: "50000.00",
          financialType: "ESTIMATED" as const,
        },
      ],
    };

    const first = await importGazetteBatch(batch);
    createdIds.editionIds.push(first.editionId);
    expect(first.createdCount).toBe(1);
    expect(first.duplicatedCount).toBe(0);
    expect(first.lgpdAlertsCount).toBe(1);

    // Reimportar o mesmo lote deve deduplicar 100%
    const second = await importGazetteBatch(batch);
    expect(second.createdCount).toBe(0);
    expect(second.duplicatedCount).toBe(1);

    // Verificar que o ato criado NÃO foi publicado automaticamente
    const acts = await prisma.gazetteAct.findMany({
      where: { editionId: first.editionId },
    });
    expect(acts[0]?.status).toBe("IN_REVIEW");
    expect(acts[0]?.objectiveSummary).toContain("***.456.***-01");
  });

  it("registra solicitação de correção pública no banco", async () => {
    const req = await prisma.correctionRequest.create({
      data: {
        requesterName: "Cidadão Teste",
        requesterEmail: "cidadao@teste.com.br",
        requestType: "CORRECTION",
        description: "Solicitação de teste automatizado para validar persistência.",
      },
    });
    createdIds.correctionIds.push(req.id);
    expect(req.status).toBe("OPEN");
  });
});
