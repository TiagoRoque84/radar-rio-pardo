import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { buildNotebookLmPackage } from "@/lib/ai/ai-service";
import { formatDateBR } from "@/lib/formatters";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const programSlug =
      body.programSlug === "radar-em-debate"
        ? "radar-em-debate"
        : "radar-da-semana";
    const periodLabel = String(body.periodLabel || "Semana atual");

    const [articles, acts] = await Promise.all([
      prisma.newsArticle.findMany({
        where: { status: "PUBLISHED", deletedAt: null },
        include: { references: true },
        orderBy: { publishedAt: "desc" },
        take: 10,
      }),
      prisma.gazetteAct.findMany({
        where: { status: "PUBLISHED" },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);

    const items = [
      ...articles.map((a) => ({
        kind: "Notícia" as const,
        title: a.title,
        summary: a.summary,
        dateLabel: formatDateBR(a.publishedAt),
        sourceName: a.references[0]?.sourceName || "Fonte oficial vinculada",
        sourceUrl: a.references[0]?.officialUrl || "",
      })),
      ...acts.map((act) => ({
        kind: "Diário Oficial" as const,
        title: act.titleSimple,
        summary: act.objectiveSummary,
        dateLabel: formatDateBR(act.actDate || act.createdAt),
        sourceName: "Diário Oficial Eletrônico de São José do Rio Pardo",
        sourceUrl: act.officialUrl,
      })),
    ];

    const pkg = buildNotebookLmPackage({
      programSlug,
      periodLabel,
      items,
    });

    return NextResponse.json({
      ...pkg,
      itemsCount: items.length,
    });
  } catch (error) {
    console.error("Erro ao gerar pacote NotebookLM:", error);
    return NextResponse.json(
      { error: "Erro ao gerar material estruturado." },
      { status: 500 }
    );
  }
}
