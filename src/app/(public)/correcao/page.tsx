"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, AlertCircle } from "lucide-react";

function CorrecaoFormInner() {
  const searchParams = useSearchParams();
  const initialUrl = searchParams.get("url") || "";
  const articleId = searchParams.get("articleId") || "";

  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [requestType, setRequestType] = useState("CORRECTION");
  const [targetUrl, setTargetUrl] = useState(initialUrl);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      const res = await fetch("/api/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterName,
          requesterEmail,
          requestType,
          targetUrl: targetUrl || null,
          articleId: articleId || null,
          description,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Falha ao enviar solicitação.");
      } else {
        setSuccessMsg(data.message);
        setDescription("");
      }
    } catch {
      setErrorMsg("Erro de rede ao enviar sua solicitação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="radar-card p-6 space-y-4">
      {successMsg && (
        <div
          role="status"
          className="rounded-lg border border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 p-4 text-sm text-emerald-900 dark:text-emerald-200 flex items-start gap-2"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="rounded-lg border border-red-400 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-900 dark:text-red-200 flex items-start gap-2"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="req-name" className="block text-xs font-semibold mb-1">
            Nome completo *
          </label>
          <input
            id="req-name"
            required
            value={requesterName}
            onChange={(e) => setRequesterName(e.target.value)}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="req-email" className="block text-xs font-semibold mb-1">
            E-mail para retorno *
          </label>
          <input
            id="req-email"
            type="email"
            required
            value={requesterEmail}
            onChange={(e) => setRequesterEmail(e.target.value)}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="req-type" className="block text-xs font-semibold mb-1">
            Tipo de solicitação *
          </label>
          <select
            id="req-type"
            value={requestType}
            onChange={(e) => setRequestType(e.target.value)}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="CORRECTION">Solicitar correção factual</option>
            <option value="CONTESTATION">Contestar informação</option>
            <option value="RIGHT_OF_REPLY">
              Solicitar manifestação / Direito de resposta
            </option>
            <option value="LGPD_REMOVAL">
              Comunicar exposição de dados pessoais (LGPD)
            </option>
            <option value="PROBLEM_REPORT">Reportar problema técnico</option>
          </select>
        </div>
        <div>
          <label htmlFor="req-url" className="block text-xs font-semibold mb-1">
            Link ou página de referência (opcional)
          </label>
          <input
            id="req-url"
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="Ex.: /noticias/titulo-da-materia"
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label htmlFor="req-desc" className="block text-xs font-semibold mb-1">
          Detalhamento e documentos comprobatórios *
        </label>
        <textarea
          id="req-desc"
          required
          rows={5}
          minLength={20}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descreva objetivamente o que precisa ser corrigido, atualizado ou protegido, indicando se possível o documento oficial de referência."
          className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-radar-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-radar-blue-hover disabled:opacity-60 transition"
      >
        {loading ? "Enviando..." : "Enviar solicitação"}
      </button>
    </form>
  );
}

export default function CorrecaoPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">
          Solicitação de Correção, Direito de Resposta e LGPD
        </h1>
        <p className="text-sm sm:text-base text-radar-muted dark:text-slate-300">
          O Radar Rio Pardo mantém canal aberto e auditável para pedidos de
          retificação, manifestação (Lei nº 13.188/2015) e proteção de dados
          pessoais (LGPD — Lei nº 13.709/2018).
        </p>
      </div>

      <Suspense fallback={<div className="radar-card p-6">Carregando formulário...</div>}>
        <CorrecaoFormInner />
      </Suspense>
    </div>
  );
}
