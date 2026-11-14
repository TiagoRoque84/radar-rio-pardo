import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { NewsEditorForm } from "@/components/NewsEditorForm";

export const dynamic = "force-dynamic";

export default async function EditarNoticiaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [user, categories, article] = await Promise.all([
    getCurrentUser(),
    prisma.newsCategory.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    prisma.newsArticle.findUnique({
      where: { id },
      include: { references: true },
    }),
  ]);

  if (!article || article.deletedAt) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Editar / Revisar Matéria</h1>
      <NewsEditorForm
        categories={categories}
        userRole={user?.role || "COLLABORATOR"}
        initialArticle={article}
      />
    </div>
  );
}
