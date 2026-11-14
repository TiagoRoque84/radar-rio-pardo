"use client";

import { useEffect, useState } from "react";
import { Share2, Copy } from "lucide-react";

interface Article {
  id: string;
  title: string;
  slug: string;
  summary: string;
}

interface Draft {
  id: string;
  shortText: string;
  headlineCardText: string;
  shareUrl: string;
  status: string;
  article: { title: string };
}

export default function AdminRedesSociaisPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [articleId, setArticleId] = useState("");
  const [headlineCardText, setHeadlineCardText] = useState("");
  const [shortText, setShortText] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/admin/social");
    if (!res.ok) return;
    const d = await res.json();
    setArticles(d.publishedArticles || []);
    setDrafts(d.drafts || []);
  }

  useEffect(() => {
    load();
  }, []);

  function selectArticle(id: string) {
    setArticleId(id);
    const found = articles.find((a) => a.id === id);
    if (!found) return;
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/noticias/${found.slug}`;
    setHeadlineCardText(found.title);
    setShareUrl(url);
    setShortText(
      `RADAR RIO PARDO | ${found.title}\n\n${found.summary}\n\nLeia a matéria completa e confira as fontes oficiais: ${url}`
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const res = await fetch("/api/admin/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        articleId,
        headlineCardText,
        shortText,
        shareUrl,
      }),
    });
    if (res.ok) {
      setMsg("Postagem preparada e registrada no histórico para publicação manual no Facebook.");
      load();
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Share2 className="h-6 w-6 text-radar-blue" />
          Preparação para Facebook e Redes Sociais
        </h1>
        <p className="text-sm text-radar-muted mt-1">
          Gere chamadas objetivas sem sensacionalismo e copie o texto pronto
          para publicação manual na página do Facebook.
        </p>
      </div>

      {msg && (
        <div className="rounded-lg border border-emerald-400 bg-emerald-50 p-3 text-sm text-emerald-900">
          {msg}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleSave} className="radar-card p-6 space-y-4">
          <h2 className="font-bold">Preparar Postagem</h2>
          <select
            required
            value={articleId}
            onChange={(e) => selectArticle(e.target.value)}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="">Selecione uma matéria publicada...</option>
            {articles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>

          <input
            required
            placeholder="Chamada do Card Social"
            value={headlineCardText}
            onChange={(e) => setHeadlineCardText(e.target.value)}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />

          <textarea
            required
            rows={6}
            placeholder="Texto da legenda para o Facebook"
            value={shortText}
            onChange={(e) => setShortText(e.target.value)}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="rounded-lg bg-radar-blue px-4 py-2 text-sm font-semibold text-white"
            >
              Salvar Preparação
            </button>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(shortText)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-radar-border px-4 py-2 text-sm font-semibold"
            >
              <Copy className="h-4 w-4" /> Copiar texto
            </button>
          </div>
        </form>

        {/* Prévia visual do Card Social */}
        <div className="radar-card p-6 space-y-4">
          <h2 className="font-bold">Prévia do Card Social (Identidade Visual)</h2>
          <div className="rounded-xl bg-radar-navy text-white p-6 space-y-3 border-b-4 border-radar-gold">
            <span className="text-xs font-bold uppercase tracking-wider text-radar-gold">
              RADAR RIO PARDO • SÃO JOSÉ DO RIO PARDO - SP
            </span>
            <p className="text-xl font-bold font-serif leading-snug">
              {headlineCardText || "Selecione uma matéria para visualizar a chamada"}
            </p>
            <p className="text-xs text-slate-300">
              Informação pública sem complicação • Confira as fontes oficiais
            </p>
          </div>
        </div>
      </div>

      <section className="radar-card p-5 space-y-3">
        <h2 className="font-bold">Histórico de Preparações</h2>
        {drafts.length === 0 ? (
          <p className="text-sm text-radar-muted">Nenhuma postagem preparada.</p>
        ) : (
          drafts.map((d) => (
            <div
              key={d.id}
              className="border-b border-radar-border py-2 text-sm flex justify-between"
            >
              <span>{d.headlineCardText}</span>
              <span className="text-xs font-semibold text-radar-blue">
                {d.status}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
