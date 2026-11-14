"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, AlertTriangle } from "lucide-react";

interface ReferenceInput {
  sourceName: string;
  officialUrl: string;
  referenceCode: string;
  pageOrSection: string;
}

interface NewsEditorProps {
  categories: Array<{ id: string; name: string }>;
  userRole: string;
  initialArticle?: {
    id: string;
    title: string;
    subtitle: string | null;
    summary: string;
    content: string;
    categoryId: string;
    tagsJson: string;
    coverImageUrl: string | null;
    status: string;
    featured: boolean;
    isPublicUtilityAlert: boolean;
    aiUsed: boolean;
    aiDisclosure: string | null;
    correctionNotice: string | null;
    references: Array<{
      sourceName: string;
      officialUrl: string;
      referenceCode: string | null;
      pageOrSection: string | null;
    }>;
  };
}

export function NewsEditorForm({
  categories,
  userRole,
  initialArticle,
}: NewsEditorProps) {
  const router = useRouter();
  const canPublish = userRole === "ADMIN" || userRole === "EDITOR";

  const [title, setTitle] = useState(initialArticle?.title || "");
  const [subtitle, setSubtitle] = useState(initialArticle?.subtitle || "");
  const [summary, setSummary] = useState(initialArticle?.summary || "");
  const [content, setContent] = useState(initialArticle?.content || "");
  const [categoryId, setCategoryId] = useState(
    initialArticle?.categoryId || categories[0]?.id || ""
  );
  const [tagsText, setTagsText] = useState(() => {
    if (!initialArticle) return "";
    try {
      return (JSON.parse(initialArticle.tagsJson) as string[]).join(", ");
    } catch {
      return "";
    }
  });
  const [coverImageUrl, setCoverImageUrl] = useState(
    initialArticle?.coverImageUrl || ""
  );
  const [status, setStatus] = useState(initialArticle?.status || "DRAFT");
  const [featured, setFeatured] = useState(initialArticle?.featured || false);
  const [isPublicUtilityAlert, setIsPublicUtilityAlert] = useState(
    initialArticle?.isPublicUtilityAlert || false
  );
  const [aiUsed, setAiUsed] = useState(initialArticle?.aiUsed || false);
  const [aiDisclosure, setAiDisclosure] = useState(
    initialArticle?.aiDisclosure || ""
  );
  const [correctionNotice, setCorrectionNotice] = useState(
    initialArticle?.correctionNotice || ""
  );
  const [references, setReferences] = useState<ReferenceInput[]>(
    initialArticle?.references?.length
      ? initialArticle.references.map((r) => ({
          sourceName: r.sourceName,
          officialUrl: r.officialUrl,
          referenceCode: r.referenceCode || "",
          pageOrSection: r.pageOrSection || "",
        }))
      : [
          {
            sourceName: "Diário Oficial Eletrônico de São José do Rio Pardo",
            officialUrl:
              "https://www.imprensaoficialmunicipal.com.br/sjriopardo",
            referenceCode: "",
            pageOrSection: "",
          },
        ]
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lgpdWarning, setLgpdWarning] = useState("");

  function addReference() {
    setReferences((prev) => [
      ...prev,
      {
        sourceName: "",
        officialUrl: "",
        referenceCode: "",
        pageOrSection: "",
      },
    ]);
  }

  function removeReference(idx: number) {
    setReferences((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setLgpdWarning("");

    const payload = {
      title,
      subtitle: subtitle || null,
      summary,
      content,
      categoryId,
      tags: tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      coverImageUrl: coverImageUrl || null,
      status,
      featured,
      isPublicUtilityAlert,
      aiUsed,
      aiDisclosure: aiUsed ? aiDisclosure || null : null,
      correctionNotice: correctionNotice || null,
      references: references.filter(
        (r) => r.sourceName.trim() && r.officialUrl.trim()
      ),
    };

    try {
      const endpoint = initialArticle
        ? `/api/admin/news/${initialArticle.id}`
        : "/api/admin/news";
      const method = initialArticle ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao salvar matéria.");
      } else {
        if (data.lgpdWarning) {
          setLgpdWarning(data.lgpdWarning);
        }
        router.push("/admin/noticias");
        router.refresh();
      }
    } catch {
      setError("Falha de comunicação com o servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-4xl">
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-400 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </div>
      )}
      {lgpdWarning && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{lgpdWarning}</span>
        </div>
      )}

      <div className="radar-card p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="title" className="block text-xs font-semibold mb-1">
              Título da matéria *
            </label>
            <input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label
              htmlFor="subtitle"
              className="block text-xs font-semibold mb-1"
            >
              Subtítulo (opcional)
            </label>
            <input
              id="subtitle"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="categoryId"
              className="block text-xs font-semibold mb-1"
            >
              Categoria *
            </label>
            <select
              id="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="status" className="block text-xs font-semibold mb-1">
              Status editorial *
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="DRAFT">Rascunho (DRAFT)</option>
              <option value="IN_REVIEW">Enviar para Revisão (IN_REVIEW)</option>
              {canPublish && (
                <>
                  <option value="APPROVED">Aprovada (APPROVED)</option>
                  <option value="PUBLISHED">Publicada (PUBLISHED)</option>
                  <option value="ARCHIVED">Arquivada (ARCHIVED)</option>
                </>
              )}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="summary" className="block text-xs font-semibold mb-1">
            Resumo objetivo *
          </label>
          <textarea
            id="summary"
            required
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="content" className="block text-xs font-semibold mb-1">
            Texto completo da matéria *
          </label>
          <textarea
            id="content"
            required
            rows={10}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm font-sans"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="tags" className="block text-xs font-semibold mb-1">
              Etiquetas (separadas por vírgula)
            </label>
            <input
              id="tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="educação, licitação, transparência"
              className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="coverImageUrl"
              className="block text-xs font-semibold mb-1"
            >
              URL de imagem de capa licenciada (opcional)
            </label>
            <input
              id="coverImageUrl"
              type="url"
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-6 pt-2 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
            />
            Destaque na homepage
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={isPublicUtilityAlert}
              onChange={(e) => setIsPublicUtilityAlert(e.target.checked)}
            />
            Aviso de utilidade pública
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={aiUsed}
              onChange={(e) => setAiUsed(e.target.checked)}
            />
            Apoio de IA utilizado (exibir selo de transparência)
          </label>
        </div>

        {aiUsed && (
          <div>
            <label
              htmlFor="aiDisclosure"
              className="block text-xs font-semibold mb-1"
            >
              Nota de transparência de IA
            </label>
            <input
              id="aiDisclosure"
              value={aiDisclosure}
              onChange={(e) => setAiDisclosure(e.target.value)}
              placeholder="Ex.: Resumo estruturado com apoio de IA sobre documento oficial e revisado pela redação."
              className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
        )}

        {initialArticle && (
          <div>
            <label
              htmlFor="correctionNotice"
              className="block text-xs font-semibold mb-1"
            >
              Nota pública de correção (quando aplicável)
            </label>
            <textarea
              id="correctionNotice"
              rows={2}
              value={correctionNotice}
              onChange={(e) => setCorrectionNotice(e.target.value)}
              className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
        )}
      </div>

      {/* Fontes Documentais Obrigatórias */}
      <div className="radar-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">
              Fontes Documentais Oficiais (obrigatório para publicação)
            </h2>
            <p className="text-xs text-radar-muted">
              Toda matéria publicada precisa apontar ao menos uma fonte pública
              verificável.
            </p>
          </div>
          <button
            type="button"
            onClick={addReference}
            className="inline-flex items-center gap-1 rounded-lg border border-radar-border px-3 py-1.5 text-xs font-semibold hover:bg-radar-light"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar fonte
          </button>
        </div>

        {references.map((ref, idx) => (
          <div
            key={idx}
            className="grid gap-3 sm:grid-cols-2 rounded-lg border border-radar-border p-4 relative"
          >
            <div>
              <label className="block text-xs font-semibold mb-1">
                Nome da fonte oficial *
              </label>
              <input
                value={ref.sourceName}
                onChange={(e) => {
                  const next = [...references];
                  next[idx].sourceName = e.target.value;
                  setReferences(next);
                }}
                className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                URL oficial *
              </label>
              <input
                type="url"
                value={ref.officialUrl}
                onChange={(e) => {
                  const next = [...references];
                  next[idx].officialUrl = e.target.value;
                  setReferences(next);
                }}
                className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">
                Código / Edição / Número
              </label>
              <input
                value={ref.referenceCode}
                onChange={(e) => {
                  const next = [...references];
                  next[idx].referenceCode = e.target.value;
                  setReferences(next);
                }}
                className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs font-semibold mb-1">
                  Página / Seção
                </label>
                <input
                  value={ref.pageOrSection}
                  onChange={(e) => {
                    const next = [...references];
                    next[idx].pageOrSection = e.target.value;
                    setReferences(next);
                  }}
                  className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-1.5 text-sm"
                />
              </div>
              {references.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeReference(idx)}
                  aria-label="Remover fonte"
                  className="rounded-lg border border-red-300 p-2 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={saving}
        className="rounded-lg bg-radar-blue px-6 py-2.5 text-sm font-semibold text-white hover:bg-radar-blue-hover disabled:opacity-60"
      >
        {saving ? "Salvando..." : "Salvar Matéria"}
      </button>
    </form>
  );
}
