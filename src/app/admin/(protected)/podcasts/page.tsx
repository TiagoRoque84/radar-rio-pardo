"use client";

import { useEffect, useState } from "react";
import { Headphones, Sparkles, Download } from "lucide-react";

interface Program {
  id: string;
  title: string;
  slug: string;
}

interface Episode {
  id: string;
  episodeNumber: number;
  title: string;
  status: string;
  program: { title: string };
}

export default function AdminPodcastsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Export NotebookLM
  const [nlmProgram, setNlmProgram] = useState("radar-da-semana");
  const [nlmPeriod, setNlmPeriod] = useState("Semana atual");
  const [nlmOutput, setNlmOutput] = useState("");

  // Cadastro episódio
  const [programId, setProgramId] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState("1");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [durationSeconds, setDurationSeconds] = useState("420");
  const [status, setStatus] = useState("DRAFT");

  async function load() {
    const res = await fetch("/api/admin/podcasts");
    if (!res.ok) return;
    const d = await res.json();
    setPrograms(d.programs || []);
    setEpisodes(d.episodes || []);
    if (d.programs?.[0] && !programId) setProgramId(d.programs[0].id);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function generateNotebookLm() {
    setErr("");
    const res = await fetch("/api/admin/podcasts/notebooklm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programSlug: nlmProgram,
        periodLabel: nlmPeriod,
      }),
    });
    const d = await res.json();
    if (!res.ok) setErr(d.error);
    else setNlmOutput(d.structuredDocumentMarkdown);
  }

  function downloadMarkdown() {
    const blob = new Blob([nlmOutput], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dossie-notebooklm-${nlmProgram}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleCreateEpisode(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    const res = await fetch("/api/admin/podcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programId,
        episodeNumber: Number(episodeNumber),
        title,
        description,
        audioUrl: audioUrl || null,
        durationSeconds: Number(durationSeconds) || null,
        status,
      }),
    });
    const d = await res.json();
    if (!res.ok) setErr(d.error);
    else {
      setMsg("Episódio salvo com sucesso.");
      setTitle("");
      setDescription("");
      load();
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Headphones className="h-6 w-6 text-radar-blue" />
        Podcasts Semanais e Exportação NotebookLM
      </h1>

      {msg && (
        <div className="rounded-lg border border-emerald-400 bg-emerald-50 p-3 text-sm text-emerald-900">
          {msg}
        </div>
      )}
      {err && (
        <div className="rounded-lg border border-red-400 bg-red-50 p-3 text-sm text-red-900">
          {err}
        </div>
      )}

      {/* Gerador NotebookLM */}
      <section className="radar-card p-6 space-y-4">
        <h2 className="font-bold text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-radar-gold-dark" />
          1. Gerar Dossiê Verificado para NotebookLM
        </h2>
        <p className="text-xs text-radar-muted">
          Reúne notícias e atos do Diário Oficial já publicados e gera as
          instruções seguras para produção manual do áudio no NotebookLM.
        </p>
        <div className="flex flex-wrap gap-3">
          <select
            value={nlmProgram}
            onChange={(e) => setNlmProgram(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="radar-da-semana">
              Radar da Semana (5 a 10 min)
            </option>
            <option value="radar-em-debate">
              Radar em Debate (10 a 20 min)
            </option>
          </select>
          <input
            value={nlmPeriod}
            onChange={(e) => setNlmPeriod(e.target.value)}
            placeholder="Período (ex.: 10 a 14/11/2026)"
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={generateNotebookLm}
            className="rounded-lg bg-radar-navy px-4 py-2 text-sm font-semibold text-white"
          >
            Gerar Dossiê Markdown
          </button>
          {nlmOutput && (
            <button
              type="button"
              onClick={downloadMarkdown}
              className="inline-flex items-center gap-1.5 rounded-lg border border-radar-blue px-4 py-2 text-sm font-semibold text-radar-blue"
            >
              <Download className="h-4 w-4" /> Baixar .md
            </button>
          )}
        </div>
        {nlmOutput && (
          <textarea
            readOnly
            rows={10}
            value={nlmOutput}
            className="w-full rounded-lg border border-radar-border bg-slate-50 dark:bg-slate-900 p-3 text-xs font-mono"
          />
        )}
      </section>

      {/* Cadastrar episódio */}
      <form
        onSubmit={handleCreateEpisode}
        className="radar-card p-6 space-y-4 max-w-3xl"
      >
        <h2 className="font-bold text-base">2. Cadastrar Episódio</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <select
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <input
            required
            type="number"
            min={1}
            placeholder="Nº do episódio"
            value={episodeNumber}
            onChange={(e) => setEpisodeNumber(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="DRAFT">Rascunho</option>
            <option value="APPROVED">Aprovado</option>
            <option value="PUBLISHED">Publicado</option>
          </select>
        </div>

        <input
          required
          placeholder="Título do episódio *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <textarea
          required
          rows={3}
          placeholder="Descrição objetiva e fontes abordadas *"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="url"
            placeholder="URL do arquivo de áudio (.mp3/.wav)"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Duração em segundos"
            value={durationSeconds}
            onChange={(e) => setDurationSeconds(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-radar-blue px-5 py-2 text-sm font-semibold text-white"
        >
          Salvar Episódio
        </button>
      </form>

      {/* Episódios cadastrados */}
      <section className="radar-card p-5 space-y-2">
        <h2 className="font-bold">Episódios Cadastrados</h2>
        {episodes.length === 0 ? (
          <p className="text-sm text-radar-muted">Nenhum episódio cadastrado.</p>
        ) : (
          episodes.map((ep) => (
            <div
              key={ep.id}
              className="flex justify-between border-b border-radar-border py-2 text-sm"
            >
              <span>
                <strong>{ep.program.title}</strong> #{ep.episodeNumber} —{" "}
                {ep.title}
              </span>
              <span className="text-xs font-bold">{ep.status}</span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
