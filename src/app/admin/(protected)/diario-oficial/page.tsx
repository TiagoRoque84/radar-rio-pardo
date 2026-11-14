"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileText, Upload } from "lucide-react";

interface Edition {
  id: string;
  editionNumber: string;
  publicationDate: string;
  status: string;
  totalActs: number;
  officialUrl: string;
}

interface Act {
  id: string;
  titleSimple: string;
  status: string;
  hasPersonalDataAlert: boolean;
  category: { name: string };
  edition: { editionNumber: string };
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Agency {
  id: string;
  name: string;
}

export default function AdminDiarioOficialPage() {
  const [editions, setEditions] = useState<Edition[]>([]);
  const [acts, setActs] = useState<Act[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  // Form nova edição
  const [editionNumber, setEditionNumber] = useState("");
  const [publicationDate, setPublicationDate] = useState("");
  const [officialUrl, setOfficialUrl] = useState(
    "https://www.imprensaoficialmunicipal.com.br/sjriopardo"
  );

  // Form novo ato
  const [selectedEditionId, setSelectedEditionId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [actNumber, setActNumber] = useState("");
  const [pageNumber, setPageNumber] = useState("");
  const [titleSimple, setTitleSimple] = useState("");
  const [objectiveSummary, setObjectiveSummary] = useState("");
  const [financialValue, setFinancialValue] = useState("");
  const [financialType, setFinancialType] = useState("NONE");
  const [deadlinesText, setDeadlinesText] = useState("");
  const [actUrl, setActUrl] = useState(
    "https://www.imprensaoficialmunicipal.com.br/sjriopardo"
  );

  // Importação JSON
  const [batchJson, setBatchJson] = useState("");

  async function loadData() {
    const res = await fetch("/api/admin/gazette");
    if (!res.ok) return;
    const data = await res.json();
    setEditions(data.editions || []);
    setActs(data.acts || []);
    setCategories(data.categories || []);
    setAgencies(data.agencies || []);
    if (data.editions?.[0] && !selectedEditionId) {
      setSelectedEditionId(data.editions[0].id);
    }
    if (data.categories?.[0] && !categoryId) {
      setCategoryId(data.categories[0].id);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreateEdition(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFeedback("");
    const res = await fetch("/api/admin/gazette", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CREATE_EDITION",
        payload: { editionNumber, publicationDate, officialUrl },
      }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else {
      setFeedback("Edição cadastrada em revisão.");
      setEditionNumber("");
      loadData();
    }
  }

  async function handleCreateAct(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFeedback("");
    const res = await fetch("/api/admin/gazette", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CREATE_ACT",
        payload: {
          editionId: selectedEditionId,
          categoryId,
          agencyId: agencyId || null,
          actNumber: actNumber || null,
          pageNumber: pageNumber ? Number(pageNumber) : null,
          titleSimple,
          objectiveSummary,
          financialValue: financialValue || null,
          financialType,
          deadlinesText: deadlinesText || null,
          officialUrl: actUrl,
          status: "IN_REVIEW",
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else {
      setFeedback("Ato salvo e enviado para fila de revisão.");
      setTitleSimple("");
      setObjectiveSummary("");
      loadData();
    }
  }

  async function handlePublishAct(actId: string) {
    setError("");
    const res = await fetch("/api/admin/gazette", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "PUBLISH_ACT", actId }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error);
    else {
      setFeedback("Ato e edição aprovados e publicados!");
      loadData();
    }
  }

  async function handleBatchImport(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setFeedback("");
    try {
      const parsed = JSON.parse(batchJson);
      const res = await fetch("/api/admin/gazette", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "BATCH_IMPORT", payload: parsed }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error);
      else {
        setFeedback(
          `Importação concluída: ${data.createdCount} novos atos, ${data.duplicatedCount} deduplicados, ${data.lgpdAlertsCount} alertas LGPD.`
        );
        setBatchJson("");
        loadData();
      }
    } catch {
      setError("JSON inválido. Verifique a estrutura do lote.");
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileText className="h-6 w-6 text-radar-blue" />
        Gestão do Diário Oficial Municipal
      </h1>

      {feedback && (
        <div className="rounded-lg border border-emerald-400 bg-emerald-50 p-3 text-sm text-emerald-900">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-400 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cadastrar edição */}
        <form onSubmit={handleCreateEdition} className="radar-card p-5 space-y-3">
          <h2 className="font-bold text-base">1. Cadastrar Edição</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              required
              placeholder="Nº da edição (ex.: 1420)"
              value={editionNumber}
              onChange={(e) => setEditionNumber(e.target.value)}
              className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
            <input
              required
              type="date"
              value={publicationDate}
              onChange={(e) => setPublicationDate(e.target.value)}
              className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
            />
          </div>
          <input
            required
            type="url"
            value={officialUrl}
            onChange={(e) => setOfficialUrl(e.target.value)}
            placeholder="URL oficial da edição"
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-lg bg-radar-blue px-4 py-2 text-sm font-semibold text-white hover:bg-radar-blue-hover"
          >
            Salvar Edição
          </button>
        </form>

        {/* Importação em lote JSON */}
        <form onSubmit={handleBatchImport} className="radar-card p-5 space-y-3">
          <h2 className="font-bold text-base flex items-center gap-2">
            <Upload className="h-4 w-4 text-radar-blue" />
            Importação Assistida (Lote JSON)
          </h2>
          <textarea
            rows={4}
            value={batchJson}
            onChange={(e) => setBatchJson(e.target.value)}
            placeholder='{"editionNumber":"1420","publicationDate":"2026-11-14","officialUrl":"https://www.imprensaoficialmunicipal.com.br/sjriopardo","acts":[{"categorySlug":"licitacoes","titleSimple":"...","objectiveSummary":"..."}]}'
            className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono"
          />
          <button
            type="submit"
            className="rounded-lg bg-radar-navy px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Importar Lote para Revisão
          </button>
        </form>
      </div>

      {/* Cadastrar ato individual */}
      <form onSubmit={handleCreateAct} className="radar-card p-5 space-y-4">
        <h2 className="font-bold text-base">
          2. Cadastrar Ato em Linguagem Simples (vai para Revisão)
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <select
            required
            value={selectedEditionId}
            onChange={(e) => setSelectedEditionId(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="">Selecione a edição...</option>
            {editions.map((ed) => (
              <option key={ed.id} value={ed.id}>
                Edição {ed.editionNumber} ({ed.publicationDate.slice(0, 10)})
              </option>
            ))}
          </select>
          <select
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={agencyId}
            onChange={(e) => setAgencyId(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="">Órgão (opcional)</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <input
            placeholder="Nº do ato (ex.: Decreto 7001)"
            value={actNumber}
            onChange={(e) => setActNumber(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Página"
            value={pageNumber}
            onChange={(e) => setPageNumber(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <input
            placeholder="Valor (ex: 45000.00)"
            value={financialValue}
            onChange={(e) => setFinancialValue(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <select
            value={financialType}
            onChange={(e) => setFinancialType(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          >
            <option value="NONE">Sem valor financeiro</option>
            <option value="ESTIMATED">Valor estimado</option>
            <option value="CONTRACTED">Valor contratado</option>
            <option value="PAID">Valor pago</option>
          </select>
        </div>

        <input
          required
          placeholder="Título em linguagem simples *"
          value={titleSimple}
          onChange={(e) => setTitleSimple(e.target.value)}
          className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <textarea
          required
          rows={3}
          placeholder="Explicação objetiva para o cidadão *"
          value={objectiveSummary}
          onChange={(e) => setObjectiveSummary(e.target.value)}
          className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            placeholder="Prazos relevantes"
            value={deadlinesText}
            onChange={(e) => setDeadlinesText(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
          <input
            required
            type="url"
            placeholder="URL oficial do ato"
            value={actUrl}
            onChange={(e) => setActUrl(e.target.value)}
            className="rounded-lg border border-radar-border bg-white dark:bg-slate-900 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-radar-blue px-5 py-2 text-sm font-semibold text-white hover:bg-radar-blue-hover"
        >
          Enviar Ato para Revisão
        </button>
      </form>

      {/* Fila de atos */}
      <section className="radar-card p-5 space-y-3">
        <h2 className="font-bold text-base">Atos Cadastrados e Revisão</h2>
        <div className="space-y-2">
          {acts.length === 0 ? (
            <p className="text-sm text-radar-muted">Nenhum ato cadastrado.</p>
          ) : (
            acts.map((act) => (
              <div
                key={act.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-radar-border p-3 text-sm"
              >
                <div>
                  <span className="text-xs font-semibold text-radar-blue">
                    Edição {act.edition.editionNumber} • {act.category.name} •{" "}
                    <strong>{act.status}</strong>
                  </span>
                  <p className="font-medium">{act.titleSimple}</p>
                  {act.hasPersonalDataAlert && (
                    <span className="text-xs text-amber-700 font-semibold">
                      Alerta LGPD aplicado na extração.
                    </span>
                  )}
                </div>
                {act.status !== "PUBLISHED" && (
                  <button
                    type="button"
                    onClick={() => handlePublishAct(act.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Aprovar e Publicar
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
