import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateBR } from "@/lib/formatters";

export const dynamic = "force-dynamic";

const STATUS_BADGES: Record<string, string> = {
  DRAFT: "bg-slate-200 text-slate-800",
  IN_REVIEW: "bg-amber-200 text-amber-900",
  APPROVED: "bg-sky-200 text-sky-900",
  PUBLISHED: "bg-emerald-200 text-emerald-900",
  ARCHIVED: "bg-rose-200 text-rose-900",
};

export default async function AdminNoticiasPage() {
  const articles = await prisma.newsArticle.findMany({
    where: { deletedAt: null },
    include: {
      category: true,
      author: { select: { name: true } },
      reviewer: { select: { name: true } },
      references: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Gerenciamento de Notícias</h1>
          <p className="text-sm text-radar-muted">
            Fluxo editorial: Rascunho → Em Revisão → Aprovada → Publicada.
          </p>
        </div>
        <Link
          href="/admin/noticias/nova"
          className="rounded-lg bg-radar-blue px-4 py-2 text-sm font-semibold text-white hover:bg-radar-blue-hover"
        >
          + Criar Matéria
        </Link>
      </div>

      <div className="radar-card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-radar-light dark:bg-slate-800 text-xs uppercase">
            <tr>
              <th className="p-3">Título</th>
              <th className="p-3">Categoria</th>
              <th className="p-3">Status</th>
              <th className="p-3">Fontes</th>
              <th className="p-3">Autor / Revisor</th>
              <th className="p-3">Atualização</th>
              <th className="p-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-radar-border">
            {articles.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-radar-muted">
                  Nenhuma matéria cadastrada ainda. Clique em &ldquo;Criar
                  Matéria&rdquo; para iniciar.
                </td>
              </tr>
            ) : (
              articles.map((a) => (
                <tr key={a.id}>
                  <td className="p-3 font-medium max-w-xs">{a.title}</td>
                  <td className="p-3 text-xs">{a.category.name}</td>
                  <td className="p-3 text-xs">
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-semibold ${STATUS_BADGES[a.status] || "bg-slate-100"}`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs">{a.references.length}</td>
                  <td className="p-3 text-xs">
                    <div>{a.author.name}</div>
                    {a.reviewer && (
                      <div className="text-emerald-700 dark:text-emerald-400">
                        Rev.: {a.reviewer.name}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-xs whitespace-nowrap">
                    {formatDateBR(a.updatedAt, { includeTime: true })}
                  </td>
                  <td className="p-3 text-xs space-x-2 whitespace-nowrap">
                    <Link
                      href={`/admin/noticias/${a.id}`}
                      className="font-semibold text-radar-blue hover:underline"
                    >
                      Editar / Revisar
                    </Link>
                    {a.status === "PUBLISHED" && (
                      <Link
                        href={`/noticias/${a.slug}`}
                        className="text-radar-muted hover:underline"
                        target="_blank"
                      >
                        Ver ↗
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
