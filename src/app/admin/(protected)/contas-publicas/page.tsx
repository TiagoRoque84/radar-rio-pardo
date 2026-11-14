"use client";

import { useEffect, useState } from "react";
import { Wallet } from "lucide-react";

interface Agency {
  id: string;
  name: string;
}

export default function AdminContasPublicasPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Licitação
  const [agencyId, setAgencyId] = useState("");
  const [processNumber, setProcessNumber] = useState("");
  const [modality, setModality] = useState("Pregão Eletrônico");
  const [objectDescription, setObjectDescription] = useState("");
  const [status, setStatus] = useState("Aberta");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [officialUrl, setOfficialUrl] = useState("https://pncp.gov.br/");

  useEffect(() => {
    fetch("/api/admin/public-accounts")
      .then((r) => r.json())
      .then((d) => {
        setAgencies(d.agencies || []);
        if (d.agencies?.[0]) setAgencyId(d.agencies[0].id);
      })
      .catch(() => null);
  }, []);

  async function handleCreateBidding(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    const res = await fetch("/api/admin/public-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
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
