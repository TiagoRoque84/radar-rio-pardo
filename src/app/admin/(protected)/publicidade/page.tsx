"use client";

import { useEffect, useState } from "react";
import { BadgeDollarSign } from "lucide-react";

interface Sponsor {
  id: string;
  companyName: string;
  cnpj: string | null;
  placement: string;
  active: boolean;
}

export default function AdminPublicidadePage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [placement, setPlacement] = useState("HOMEPAGE");
  const [active, setActive] = useState(false);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    const res = await fetch("/api/admin/sponsors");
    if (!res.ok) return;
    const d = await res.json();
    setSponsors(d.sponsors || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    const res = await fetch("/api/admin/sponsors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName,
        cnpj: cnpj || null,
        startDate,
        endDate,
        destinationUrl,
        placement,
        active,
        publicTransparencyNote: note || null,
      }),
    });
    const d = await res.json();
    if (!res.ok) setErr(d.error);
    else {
      setMsg("Anunciante cadastrado.");
      setCompanyName("");
      load();
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BadgeDollarSign className="h-6 w-6 text-radar-blue" />
          Publicidade Local e Transparência de Patrocinadores
        </h1>
        <p className="text-sm text-radar-muted mt-1">
          Anunciantes nunca possuem permissão para aprovar, vetar ou modificar
          notícias e indicadores.
        </p>
      </div>

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

      <form onSubmit={handleSubmit} className="radar-card p-6 space-y-4">
        <h2 className="font-bold">Cadastrar Anunciante / Patrocinador</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            required
            placeholder="Razão social / Nome da empresa *"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <input
            placeholder="CNPJ (quando pertinente)"
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <input
            required
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <input
            required
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            required
            type="url"
            placeholder="URL de destino *"
            value={destinationUrl}
            onChange={(e) => setDestinationUrl(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <select
            value={placement}
            onChange={(e) => setPlacement(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="HOMEPAGE">Homepage</option>
            <option value="NEWS">Notícias</option>
            <option value="GAZETTE">Diário Oficial</option>
            <option value="PODCAST">Podcasts</option>
          </select>
        </div>
        <input
          placeholder="Nota pública de transparência"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Ativar exibição pública (sempre identificada como publicidade)
        </label>
        <div>
          <button
            type="submit"
            className="rounded-lg bg-radar-blue px-5 py-2 text-sm font-semibold text-white"
          >
            Salvar Anunciante
          </button>
        </div>
      </form>

      <section className="radar-card p-5 space-y-2">
        <h2 className="font-bold">Anunciantes Registrados</h2>
        {sponsors.length === 0 ? (
          <p className="text-sm text-radar-muted">Nenhum anunciante cadastrado.</p>
        ) : (
          sponsors.map((sp) => (
            <div
              key={sp.id}
              className="flex justify-between border-b border-radar-border py-2 text-sm"
            >
              <span>
                <strong>{sp.companyName}</strong> ({sp.placement})
              </span>
              <span className="text-xs font-semibold">
                {sp.active ? "Ativo" : "Inativo"}
              </span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
