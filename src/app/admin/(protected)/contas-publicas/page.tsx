"use client";

import { useEffect, useState } from "react";
import { Wallet, AlertTriangle, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { csrfJsonHeaders } from "@/lib/security/csrf-client";

interface Agency {
  id: string;
  name: string;
  acronym: string | null;
}

interface PendingDoc {
  id: string;
  title: string;
  externalId: string | null;
  originalUrl: string;
  rawText: string | null;
  createdAt: string;
}

interface ParsedPendingMeta {
  processNumber?: string;
  modality?: string;
  organName?: string;
  unitName?: string | null;
  organCnpj?: string | null;
  classificationReason?: string;
  objectDescription?: string;
}

function parseMeta(rawText: string | null): ParsedPendingMeta {
  if (!rawText) return {};
  try {
    return JSON.parse(rawText) as ParsedPendingMeta;
  } catch {
    return {};
  }
}

export default function AdminContasPublicasPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [pendingDocs, setPendingDocs] = useState<PendingDoc[]>([]);
  const [selectedAgencyByDoc, setSelectedAgencyByDoc] = useState<
    Record<string, string>
  >({});
  const [processingDocId, setProcessingDocId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Licitação manual
  const [agencyId, setAgencyId] = useState("");
  const [processNumber, setProcessNumber] = useState("");
  const [modality, setModality] = useState("Pregão Eletrônico");
  const [objectDescription, setObjectDescription] = useState("");
  const [status, setStatus] = useState("Aberta");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [officialUrl, setOfficialUrl] = useState("https://pncp.gov.br/");

  async function loadData() {
    try {
      const res = await fetch("/api/admin/public-accounts");
      if (!res.ok) return;
      const d = await res.json();
      setAgencies(d.agencies || []);
      setPendingDocs(d.pendingClassifications || []);
      if (d.agencies?.[0] && !agencyId) {
        setAgencyId(d.agencies[0].id);
      }
    } catch {
      // Silencioso no carregamento inicial
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateBidding(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    const res = await fetch("/api/admin/public-accounts", {
      method: "POST",
      headers: csrfJsonHeaders(),
      body: JSON.stringify({
        action: "CREATE_BIDDING",
        payload: {
          agencyId,
          processNumber,
          modality,
          objectDescription,
          status,
          estimatedValue: estimatedValue || null,
          officialUrl,
        },
      }),
    });
    const d = await res.json();
    if (!res.ok) setErr(d.error);
    else {
      setMsg("Licitação registrada com sucesso.");
      setProcessNumber("");
      setObjectDescription("");
      await loadData();
    }
  }

  async function handleClassifyDoc(docId: string) {
    const chosenAgencyId = selectedAgencyByDoc[docId];
    if (!chosenAgencyId) {
      setErr("Selecione manualmente o órgão público confirmado antes de importar.");
      return;
    }

    setProcessingDocId(docId);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/admin/public-accounts", {
        method: "POST",
        headers: csrfJsonHeaders(),
        body: JSON.stringify({
          action: "CLASSIFY_PNCP_DOCUMENT",
          payload: { documentId: docId, agencyId: chosenAgencyId },
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error || "Erro ao classificar registro pendente.");
      } else {
        setMsg("Órgão confirmado e licitação publicada na tabela verificada.");
        await loadData();
      }
    } catch {
      setErr("Falha de comunicação ao classificar registro.");
    } finally {
      setProcessingDocId(null);
    }
  }

  async function handleRejectDoc(docId: string) {
    setProcessingDocId(docId);
    setMsg("");
    setErr("");
    try {
      const res = await fetch("/api/admin/public-accounts", {
        method: "POST",
        headers: csrfJsonHeaders(),
        body: JSON.stringify({
          action: "REJECT_PNCP_DOCUMENT",
          payload: {
            documentId: docId,
            reason: "Descartado após revisão documental no painel.",
          },
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error || "Erro ao descartar registro.");
      } else {
        setMsg("Registro pendente marcado como rejeitado na fila de revisão.");
        await loadData();
      }
    } catch {
      setErr("Falha de comunicação ao rejeitar registro.");
    } finally {
      setProcessingDocId(null);
    }
  }

  return (
    <div className="space-y-8 max-w-4xl">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Wallet className="h-6 w-6 text-radar-blue" />
        Administração — Contas Públicas e Licitações
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

      {/* Fila de revisão de órgãos PNCP não identificados automaticamente */}
      <section className="radar-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <h2 className="font-bold text-base">
            Registros PNCP Pendentes de Classificação de Órgão (
            {pendingDocs.length})
          </h2>
        </div>
        <p className="text-xs text-radar-muted">
          Por princípio de transparência, contratações cujo CNPJ ou razão social
          no PNCP não correspondam inequivocamente ao cadastro municipal não são
          atribuídas automaticamente à Prefeitura. Confirme o órgão correto com
          base no documento original ou descarte o item.
        </p>

        {pendingDocs.length === 0 ? (
          <p className="text-xs text-radar-muted rounded-lg border border-dashed border-radar-border p-4">
            Nenhum registro pendente de classificação manual no momento.
          </p>
        ) : (
          <div className="space-y-4">
            {pendingDocs.map((doc) => {
              const meta = parseMeta(doc.rawText);
              return (
                <div
                  key={doc.id}
                  className="rounded-lg border border-amber-300 bg-amber-50/40 dark:bg-amber-950/10 p-4 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="font-bold text-sm">{doc.title}</p>
                      <p className="text-radar-muted">
                        Processo: <strong>{meta.processNumber || doc.externalId}</strong>{" "}
                        • Modalidade: {meta.modality || "Não informada"} • CNPJ
                        PNCP:{" "}
                        <code>{meta.organCnpj || "Não informado"}</code>
                      </p>
                      {meta.unitName && (
                        <p className="text-radar-muted">
                          Unidade informada: {meta.unitName}
                        </p>
                      )}
                    </div>
                    <a
                      href={doc.originalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-radar-blue hover:underline font-medium shrink-0"
                    >
                      Documento original no PNCP{" "}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  {meta.objectDescription && (
                    <p className="leading-relaxed text-slate-700 dark:text-slate-300">
                      {meta.objectDescription}
                    </p>
                  )}

                  {meta.classificationReason && (
                    <p className="rounded bg-amber-100/70 dark:bg-amber-900/30 px-2.5 py-1.5 text-amber-900 dark:text-amber-200">
                      <strong>Motivo da retenção:</strong>{" "}
                      {meta.classificationReason}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <select
                      aria-label={`Selecionar órgão para ${doc.title}`}
                      value={selectedAgencyByDoc[doc.id] || ""}
                      onChange={(e) =>
                        setSelectedAgencyByDoc((prev) => ({
                          ...prev,
                          [doc.id]: e.target.value,
                        }))
                      }
                      className="flex-1 min-w-[240px] rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-1.5 text-xs"
                    >
                      <option value="">
                        — Selecione o órgão público confirmado —
                      </option>
                      {agencies.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.acronym ? `${a.acronym} — ${a.name}` : a.name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={processingDocId === doc.id}
                      onClick={() => handleClassifyDoc(doc.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-radar-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-radar-blue-hover disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Confirmar Órgão e Importar
                    </button>

                    <button
                      type="button"
                      disabled={processingDocId === doc.id}
                      onClick={() => handleRejectDoc(doc.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Descartar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <form onSubmit={handleCreateBidding} className="radar-card p-6 space-y-4">
        <h2 className="font-bold">Cadastrar Licitação Verificada</h2>
        <select
          value={agencyId}
          onChange={(e) => setAgencyId(e.target.value)}
          className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        >
          {agencies.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            required
            placeholder="Nº do processo (ex.: PE 12/2026)"
            value={processNumber}
            onChange={(e) => setProcessNumber(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Modalidade"
            value={modality}
            onChange={(e) => setModality(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>

        <textarea
          required
          rows={3}
          placeholder="Objeto oficial da licitação *"
          value={objectDescription}
          onChange={(e) => setObjectDescription(e.target.value)}
          className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            required
            placeholder="Situação (ex.: Divulgada / Homologada)"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <input
            placeholder="Valor estimado (ex: 125000.00)"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>

        <input
          required
          type="url"
          value={officialUrl}
          onChange={(e) => setOfficialUrl(e.target.value)}
          className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />

        <button
          type="submit"
          className="rounded-lg bg-radar-blue px-5 py-2 text-sm font-semibold text-white"
        >
          Registrar Licitação
        </button>
      </form>
    </div>
  );
}
