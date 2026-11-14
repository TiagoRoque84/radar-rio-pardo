"use client";

import { useEffect, useState } from "react";
import { Play, RefreshCw, ExternalLink } from "lucide-react";
import { csrfJsonHeaders } from "@/lib/security/csrf-client";

interface Adapter {
  id: string;
  adapterKey: string;
  name: string;
  frequencyCron: string;
  status: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  recordsCount: number;
  lastError: string | null;
  source: { name: string; url: string; sourceType: string };
}

interface RunLog {
  id: string;
  status: string;
  triggerType: string;
  startedAt: string;
  itemsFound: number;
  itemsProcessed: number;
  itemsDuplicated: number;
  errorCount: number;
  logText: string | null;
  checkpointJson: string | null;
  adapter: { name: string };
}

interface CheckpointMeta {
  outcome?: string;
  itemsRejected?: number;
  rejectedItems?: number;
  itemsPendingClassification?: number;
  pendingClassificationItems?: number;
  hasPendingPages?: boolean;
  incomplete?: boolean;
  pendingModalities?: number[];
  rejectionBreakdown?: Record<string, number>;
}

const OUTCOME_LABELS: Record<string, string> = {
  NO_RECORDS: "Nenhum registro novo no período",
  IMPORTED: "Registros validados e importados",
  DUPLICATES_ONLY: "Apenas registros já existentes (duplicados)",
  PENDING_CLASSIFICATION: "Registros retidos para classificação de órgão",
  ALL_REJECTED: "Todos os registros encontrados foram rejeitados",
  PARTIAL_COMPLETION: "Execução parcial / páginas ou rejeições pendentes",
  FAILED: "Falha de integração",
};

function parseRunCheckpoint(raw: string | null): CheckpointMeta {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as CheckpointMeta;
  } catch {
    return {};
  }
}

export default function AdminIntegracoesPage() {
  const [adapters, setAdapters] = useState<Adapter[]>([]);
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [runningKey, setRunningKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/admin/sources");
    if (!res.ok) return;
    const data = await res.json();
    setAdapters(data.adapters || []);
    setRuns(data.runs || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRun(adapterKey: string) {
    setRunningKey(adapterKey);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/collectors/run", {
        method: "POST",
        headers: csrfJsonHeaders(),
        body: JSON.stringify({ adapterKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao executar sincronização.");
      } else {
        const outcomeLabel = data.outcome
          ? ` [${OUTCOME_LABELS[data.outcome] || data.outcome}]`
          : "";
        setMessage(
          `Execução (${adapterKey}): ${data.status}${outcomeLabel} — Encontrados: ${data.itemsFound}, Novos: ${data.itemsProcessed}, Duplicados: ${data.itemsDuplicated}, Rejeitados: ${data.itemsRejected ?? 0}, Pendentes de órgão: ${data.itemsPendingClassification ?? 0}`
        );
      }
      await load();
    } catch {
      setError("Falha de comunicação ao acionar coletor.");
    } finally {
      setRunningKey(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <RefreshCw className="h-6 w-6 text-radar-blue" />
          Integrações e Coletores Oficiais
        </h1>
        <p className="text-sm text-radar-muted mt-1">
          Camada independente de coleta compatível com Cron Jobs da Hostinger.
          Coletas nunca publicam conteúdo automaticamente sem revisão editorial.
        </p>
      </div>

      {message && (
        <div className="rounded-lg border border-emerald-400 bg-emerald-50 p-3 text-sm text-emerald-900">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-400 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {/* Adaptadores */}
      <div className="grid gap-4 md:grid-cols-2">
        {adapters.map((ad) => (
          <div key={ad.id} className="radar-card p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-xs font-bold text-radar-blue uppercase">
                  {ad.source.sourceType} • Status: {ad.status}
                </span>
                <h2 className="font-bold text-base">{ad.name}</h2>
              </div>
              <button
                type="button"
                disabled={runningKey === ad.adapterKey}
                onClick={() => handleRun(ad.adapterKey)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-radar-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-radar-blue-hover disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                {runningKey === ad.adapterKey ? "Executando..." : "Sincronizar"}
              </button>
            </div>

            <div className="text-xs text-radar-muted space-y-1">
              <p>
                Chave: <code>{ad.adapterKey}</code> • Cron sugerido:{" "}
                <code>{ad.frequencyCron}</code>
              </p>
              <p>
                Registros importados: <strong>{ad.recordsCount}</strong> • Última
                execução:{" "}
                {ad.lastRunAt
                  ? new Date(ad.lastRunAt).toLocaleString("pt-BR")
                  : "Nunca executada"}
              </p>
              <a
                href={ad.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-radar-blue hover:underline"
              >
                {ad.source.url} <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            {ad.lastError && (
              <pre className="rounded bg-red-50 dark:bg-red-950/30 p-2 text-[11px] text-red-800 dark:text-red-300 overflow-x-auto whitespace-pre-wrap">
                {ad.lastError}
              </pre>
            )}
          </div>
        ))}
      </div>

      {/* Histórico de execuções */}
      <section className="radar-card p-5 space-y-4">
        <h2 className="text-lg font-bold">Logs Técnicos de Execução</h2>
        <div className="space-y-3">
          {runs.length === 0 ? (
            <p className="text-sm text-radar-muted">
              Nenhuma execução registrada ainda. Clique em
              &ldquo;Sincronizar&rdquo; para testar a coleta real em uma fonte.
            </p>
          ) : (
            runs.map((run) => {
              const cp = parseRunCheckpoint(run.checkpointJson);
              const rejected = cp.itemsRejected ?? cp.rejectedItems ?? 0;
              const pendingOrg =
                cp.itemsPendingClassification ??
                cp.pendingClassificationItems ??
                0;
              const outcomeText = cp.outcome
                ? OUTCOME_LABELS[cp.outcome] || cp.outcome
                : null;
              const breakdownEntries = cp.rejectionBreakdown
                ? Object.entries(cp.rejectionBreakdown)
                : [];

              return (
                <details
                  key={run.id}
                  className="rounded-lg border border-radar-border p-3 text-xs"
                >
                  <summary className="cursor-pointer font-semibold flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {run.adapter.name} — {run.status} ({run.triggerType})
                      {outcomeText ? ` • ${outcomeText}` : ""}
                    </span>
                    <span className="text-radar-muted">
                      {new Date(run.startedAt).toLocaleString("pt-BR")} |
                      Encontrados: {run.itemsFound} | Novos:{" "}
                      {run.itemsProcessed} | Duplicados: {run.itemsDuplicated} |
                      Rejeitados: {rejected} | Pendentes Órgão: {pendingOrg} |
                      Erros: {run.errorCount}
                    </span>
                  </summary>

                  {(cp.hasPendingPages || cp.incomplete) && (
                    <div className="mt-2 rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-1.5 text-amber-900 dark:text-amber-200">
                      Checkpoint ativo: há páginas/modalidades pendentes (
                      {cp.pendingModalities?.join(", ") || "ver log"}) que serão
                      retomadas na próxima execução.
                    </div>
                  )}

                  {breakdownEntries.length > 0 && (
                    <div className="mt-2 rounded border border-radar-border bg-radar-surface dark:bg-slate-800/60 p-2.5 space-y-1">
                      <p className="font-semibold">
                        Motivos de rejeição ou retenção:
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                        {breakdownEntries.map(([reason, qty]) => (
                          <li key={reason}>
                            <strong>{qty}x</strong> — {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {run.logText && (
                    <pre className="mt-2 rounded bg-slate-900 text-slate-100 p-3 overflow-x-auto whitespace-pre-wrap">
                      {run.logText}
                    </pre>
                  )}
                </details>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
