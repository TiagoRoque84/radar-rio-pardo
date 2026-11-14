"use client";

import { useEffect, useState } from "react";
import { MessageSquareWarning } from "lucide-react";

interface Correction {
  id: string;
  requesterName: string;
  requesterEmail: string;
  requestType: string;
  description: string;
  targetUrl: string | null;
  status: string;
  createdAt: string;
}

export default function AdminCorrecoesPage() {
  const [requests, setRequests] = useState<Correction[]>([]);
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/admin/corrections");
    if (!res.ok) return;
    const d = await res.json();
    setRequests(d.requests || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function resolveRequest(id: string, status: string) {
    const publicNote =
      status === "RESOLVED"
        ? prompt(
            "Informe a nota pública de correção (opcional, será exibida na matéria vinculada):"
          )
        : null;

    const res = await fetch("/api/admin/corrections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        status,
        publicCorrectionNote: publicNote,
      }),
    });

    if (res.ok) {
      setMsg("Solicitação atualizada.");
      load();
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <MessageSquareWarning className="h-6 w-6 text-radar-blue" />
        Solicitações de Correção, Direito de Resposta e LGPD
      </h1>

      {msg && (
        <div className="rounded-lg border border-emerald-400 bg-emerald-50 p-3 text-sm text-emerald-900">
          {msg}
        </div>
      )}

      <div className="space-y-4">
        {requests.length === 0 ? (
          <div className="radar-card p-6 text-sm text-radar-muted">
            Nenhuma solicitação registrada no momento.
          </div>
        ) : (
          requests.map((r) => (
            <div key={r.id} className="radar-card p-5 space-y-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-radar-blue">
                  {r.requestType} • Status: {r.status}
                </span>
                <span className="text-radar-muted">
                  {new Date(r.createdAt).toLocaleString("pt-BR")}
                </span>
              </div>
              <p className="font-semibold">
                Solicitante: {r.requesterName} ({r.requesterEmail})
              </p>
              {r.targetUrl && (
                <p className="text-xs text-radar-muted">Alvo: {r.targetUrl}</p>
              )}
              <p className="text-sm leading-relaxed bg-radar-light dark:bg-slate-800/60 p-3 rounded-lg">
                {r.description}
              </p>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => resolveRequest(r.id, "IN_ANALYSIS")}
                  className="rounded-md border border-radar-border px-3 py-1 text-xs font-semibold"
                >
                  Em análise
                </button>
                <button
                  type="button"
                  onClick={() => resolveRequest(r.id, "RESOLVED")}
                  className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white"
                >
                  Marcar como Resolvida
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
