"use client";

import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";

interface Legislature {
  id: string;
  title: string;
}

interface Councilor {
  id: string;
  parliamentaryName: string;
  partyAcronym: string | null;
}

export default function AdminCamaraPage() {
  const [legislatures, setLegislatures] = useState<Legislature[]>([]);
  const [councilors, setCouncilors] = useState<Councilor[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Form vereador
  const [legislatureId, setLegislatureId] = useState("");
  const [fullName, setFullName] = useState("");
  const [parliamentaryName, setParliamentaryName] = useState("");
  const [partyAcronym, setPartyAcronym] = useState("");
  const [roleInBoard, setRoleInBoard] = useState("");

  // Form proposição
  const [propNumber, setPropNumber] = useState("");
  const [propYear, setPropYear] = useState("2026");
  const [propType, setPropType] = useState("PROJETO_LEI");
  const [propSummary, setPropSummary] = useState("");
  const [propAuthorId, setPropAuthorId] = useState("");
  const [propUrl, setPropUrl] = useState("https://camarasjriopardo.sp.gov.br/");

  async function load() {
    const res = await fetch("/api/admin/chamber");
    if (!res.ok) return;
    const data = await res.json();
    setLegislatures(data.legislatures || []);
    setCouncilors(data.councilors || []);
    if (data.legislatures?.[0] && !legislatureId) {
      setLegislatureId(data.legislatures[0].id);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitCouncilor(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    const res = await fetch("/api/admin/chamber", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CREATE_COUNCILOR",
        payload: {
          legislatureId,
          fullName,
          parliamentaryName,
          partyAcronym: partyAcronym || null,
          roleInBoard: roleInBoard || null,
        },
      }),
    });
    const d = await res.json();
    if (!res.ok) setErr(d.error);
    else {
      setMsg("Vereador cadastrado com sucesso.");
      setFullName("");
      setParliamentaryName("");
      load();
    }
  }

  async function submitProposition(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    const res = await fetch("/api/admin/chamber", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CREATE_PROPOSITION",
        payload: {
          number: propNumber,
          year: Number(propYear),
          type: propType,
          summary: propSummary,
          authorId: propAuthorId || null,
          officialUrl: propUrl,
        },
      }),
    });
    const d = await res.json();
    if (!res.ok) setErr(d.error);
    else {
      setMsg("Proposição cadastrada.");
      setPropNumber("");
      setPropSummary("");
      load();
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Landmark className="h-6 w-6 text-radar-blue" />
        Administração — Câmara Municipal
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

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={submitCouncilor} className="radar-card p-5 space-y-3">
          <h2 className="font-bold">Cadastrar Vereador</h2>
          <select
            value={legislatureId}
            onChange={(e) => setLegislatureId(e.target.value)}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            {legislatures.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
          <input
            required
            placeholder="Nome completo oficial *"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <input
            required
            placeholder="Nome parlamentar *"
            value={parliamentaryName}
            onChange={(e) => setParliamentaryName(e.target.value)}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <div className="grid gap-3 grid-cols-2">
            <input
              placeholder="Partido (sigla)"
              value={partyAcronym}
              onChange={(e) => setPartyAcronym(e.target.value)}
              className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
            <input
              placeholder="Cargo na Mesa Diretora"
              value={roleInBoard}
              onChange={(e) => setRoleInBoard(e.target.value)}
              className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-radar-blue px-4 py-2 text-sm font-semibold text-white"
          >
            Salvar Vereador
          </button>
        </form>

        <form onSubmit={submitProposition} className="radar-card p-5 space-y-3">
          <h2 className="font-bold">Cadastrar Proposição</h2>
          <div className="grid gap-3 grid-cols-3">
            <select
              value={propType}
              onChange={(e) => setPropType(e.target.value)}
              className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            >
              <option value="PROJETO_LEI">Projeto de Lei</option>
              <option value="PROJETO_DECRETO">Decreto Legislativo</option>
              <option value="PROJETO_RESOLUCAO">Resolução</option>
              <option value="REQUERIMENTO">Requerimento</option>
              <option value="INDICACAO">Indicação</option>
              <option value="MOCAO">Moção</option>
            </select>
            <input
              required
              placeholder="Número"
              value={propNumber}
              onChange={(e) => setPropNumber(e.target.value)}
              className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
            <input
              required
              type="number"
              value={propYear}
              onChange={(e) => setPropYear(e.target.value)}
              className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
          <select
            value={propAuthorId}
            onChange={(e) => setPropAuthorId(e.target.value)}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="">Autoria coletiva / Executivo / Outro</option>
            {councilors.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parliamentaryName} ({c.partyAcronym || "S/P"})
              </option>
            ))}
          </select>
          <textarea
            required
            rows={3}
            placeholder="Ementa oficial *"
            value={propSummary}
            onChange={(e) => setPropSummary(e.target.value)}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <input
            required
            type="url"
            value={propUrl}
            onChange={(e) => setPropUrl(e.target.value)}
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-radar-blue px-4 py-2 text-sm font-semibold text-white"
          >
            Salvar Proposição
          </button>
        </form>
      </div>
    </div>
  );
}
