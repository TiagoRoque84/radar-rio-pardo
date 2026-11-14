import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { NewsEditorForm } from "@/components/NewsEditorForm";

export const dynamic = "force-dynamic";

export default async function NovaNoticiaPage() {
  const [user, categories] = await Promise.all([
    getCurrentUser(),
    prisma.newsCategory.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Nova Matéria Editorial</h1>
      <NewsEditorForm
        categories={categories}
        userRole={user?.role || "COLLABORATOR"}
      />
    </div>
  );
}
