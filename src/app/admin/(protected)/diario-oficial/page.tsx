"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Upload } from "lucide-react";
import { csrfJsonHeaders } from "@/lib/security/csrf-client";

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
  actNumber: string | null;
  actDate: string | null;
  pageNumber: number | null;
  agencyId: string | null;
  deadlinesText: string | null;
  objectiveSummary: string;
  rawExcerpt: string | null;
  officialUrl: string;
  titleSimple: string;
  status: string;
  hasPersonalDataAlert: boolean;
  updatedAt?: string;
  extractionStatus?: string | null;
  mimeType?: string | null;
  category: { name: string };
  agency?: { id: string; name: string } | null;
  edition: {
    editionNumber: string;
    publicationDate: string;
    officialUrl: string;
  };
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

function formatIsoDateLabel(iso: string | null | undefined): string {
  if (!iso) return "Não informada";
  const datePart = iso.slice(0, 10);
  const parts = datePart.split("-");
  if (parts.length !== 3) return datePart;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getExtractionBadge(status: string | null | undefined): {
  label: string;
  className: string;
} | null {
  if (!status) return null;
  switch (status) {
    case "EXTRACTED_PDF_FOR_REVIEW":
      return {
        label: "Texto extraído do PDF oficial",
        className: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200",
      };
    case "EXTRACTED_PDF_ANNEX_CHECK":
      return {
        label: "Texto PDF + Anexos/Tabelas (conferir PDF)",
        className: "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
      };
    case "EXTRACTED_HTML_FOR_REVIEW":
    case "EXTRACTED_FOR_REVIEW":
      return {
        label: "Texto extraído da leitura oficial",
        className: "border-sky-300 bg-sky-50 text-sky-900 dark:bg-sky-950/50 dark:text-sky-200",
      };
    case "METADATA_ONLY_NO_TEXT_LAYER":
      return {
        label: "Apenas metadados (PDF sem camada de texto)",
        className: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
      };
    case "METADATA_ONLY_INCOMPLETE_MARKERS":
      return {
        label: "Apenas metadados (marcadores de página incompletos)",
        className: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
      };
    case "METADATA_ONLY_MIXED_TEXT":
      return {
        label: "Apenas metadados (outro ato detectado no recorte)",
        className: "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200",
      };
    case "METADATA_ONLY_PDF_TOO_LARGE":
      return {
        label: "Apenas metadados (PDF acima do limite operacional)",
        className: "border-slate-300 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
      };
    case "METADATA_ONLY_HTTP_ERROR":
    case "METADATA_ONLY_PARSE_ERROR":
      return {
        label: "Apenas metadados (falha ao ler PDF oficial)",
        className: "border-slate-300 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
      };
    case "METADATA_ONLY_ACT_NOT_FOUND":
      return {
        label: "Apenas metadados (ato não localizado no recorte do PDF)",
        className: "border-slate-300 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
      };
    default:
      return {
        label: "Apenas metadados (aguardando conferência)",
        className: "border-slate-300 bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
      };
  }
}

function isAutoDraftSummary(summary: string): boolean {
  return (
    /^Ementa oficial \(revisão obrigatória\):/i.test(summary) ||
    /^Ato identificado na listagem oficial/i.test(summary) ||
    /^Texto extraído do PDF oficial \(revisão obrigatória\):/i.test(summary)
  );
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

  // Importação JSON e revisão editorial de atos
  const [batchJson, setBatchJson] = useState("");
  const [editingActId, setEditingActId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftActNumber, setDraftActNumber] = useState("");
  const [draftActDate, setDraftActDate] = useState("");
  const [draftPageNumber, setDraftPageNumber] = useState("");
  const [draftAgencyId, setDraftAgencyId] = useState("");
  const [draftDeadlinesText, setDraftDeadlinesText] = useState("");
  const [draftExpectedUpdatedAt, setDraftExpectedUpdatedAt] = useState<string | null>(null);
  const [draftConflict, setDraftConflict] = useState(false);

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
      headers: csrfJsonHeaders(),
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
      headers: csrfJsonHeaders(),
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

  async function handlePublishAct(actId: string, expectedUpdatedAt?: string) {
    setError("");
    setFeedback("");
    const versionToken = expectedUpdatedAt?.trim();
    if (!versionToken) {
      setError(
        "Versão do registro indisponível para publicação. Recarregue a página e tente novamente."
      );
      return;
    }
    const res = await fetch("/api/admin/gazette", {
      method: "POST",
      headers: csrfJsonHeaders(),
      body: JSON.stringify({
        action: "PUBLISH_ACT",
        actId,
        expectedUpdatedAt: versionToken,
      }),
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
        headers: csrfJsonHeaders(),
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

  function startEditingAct(act: Act) {
    const versionToken = act.updatedAt?.trim();
    if (!versionToken) {
      setError(
        "Versão do registro indisponível. Recarregue a fila antes de editar este ato."
      );
      return;
    }
    setError("");
    setFeedback("");
    setDraftConflict(false);
    setEditingActId(act.id);
    setDraftTitle(act.titleSimple);
    setDraftSummary(isAutoDraftSummary(act.objectiveSummary) ? "" : act.objectiveSummary);
    setDraftActNumber(act.actNumber || "");
    setDraftActDate(act.actDate ? act.actDate.slice(0, 10) : "");
    setDraftPageNumber(act.pageNumber ? String(act.pageNumber) : "");
    setDraftAgencyId(act.agencyId || "");
    setDraftDeadlinesText(act.deadlinesText || "");
    setDraftExpectedUpdatedAt(versionToken);
  }

  async function handleReloadVersionKeepingDraft(actId: string) {
    setError("");
    setFeedback("");
    try {
      const res = await fetch("/api/admin/gazette");
      if (!res.ok) {
        setError(
          "Não foi possível recarregar a versão do ato. Seu texto digitado foi preservado."
        );
        return;
      }
      const data = await res.json();
      setEditions(data.editions || []);
      setActs(data.acts || []);
      setCategories(data.categories || []);
      setAgencies(data.agencies || []);

      const refreshedAct = (data.acts as Act[] | undefined)?.find((a) => a.id === actId);
      if (!refreshedAct || !refreshedAct.updatedAt?.trim()) {
        setDraftExpectedUpdatedAt(null);
        setError(
          "O registro atualizado não foi localizado na fila. Seu texto digitado foi mantido no formulário para cópia."
        );
        return;
      }
      if (refreshedAct.status !== "DRAFT_IMPORTED" && refreshedAct.status !== "IN_REVIEW") {
        setDraftExpectedUpdatedAt(refreshedAct.updatedAt);
        setError(
          `Este ato já avançou para ${refreshedAct.status} e não aceita nova edição por este formulário. Seu texto digitado foi preservado abaixo para consulta/cópia.`
        );
        return;
      }

      setDraftExpectedUpdatedAt(refreshedAct.updatedAt);
      setDraftConflict(false);
      setFeedback(
        "Versão atualizada recarregada na lista sem apagar o texto digitado no formulário. Confira as alterações atuais do ato acima antes de salvar novamente."
      );
    } catch {
      setError(
        "Falha ao recarregar os dados do ato. Seu texto digitado foi preservado."
      );
    }
  }

  async function handleRewriteImportedAct(
    actId: string,
    saveMode: "SAVE_DRAFT" | "SEND_TO_REVIEW" = "SEND_TO_REVIEW"
  ) {
    setError("");
    setFeedback("");
    const versionToken = draftExpectedUpdatedAt?.trim();
    if (!versionToken) {
      setError(
        "Versão do registro indisponível. Recarregue a versão do ato antes de salvar (seu texto digitado foi preservado)."
      );
      return;
    }
    try {
      const res = await fetch("/api/admin/gazette", {
        method: "POST",
        headers: csrfJsonHeaders(),
        body: JSON.stringify({
          action: "REWRITE_IMPORTED_ACT",
          actId,
          titleSimple: draftTitle,
          objectiveSummary: draftSummary,
          actNumber: draftActNumber || null,
          actDate: draftActDate || null,
          pageNumber: draftPageNumber ? Number(draftPageNumber) : null,
          agencyId: draftAgencyId || null,
          deadlinesText: draftDeadlinesText || null,
          saveMode,
          expectedUpdatedAt: versionToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setDraftConflict(true);
          setError(
            (data.error || "Conflito de edição detectado.") +
              " Seu texto digitado foi preservado no formulário para recuperação."
          );
        } else {
          setError(data.error || "Não foi possível salvar a revisão.");
        }
        return;
      }
      setEditingActId(null);
      setDraftExpectedUpdatedAt(null);
      setDraftConflict(false);
      setFeedback(
        saveMode === "SEND_TO_REVIEW"
          ? "Revisão editorial salva e ato enviado para IN_REVIEW. Confira antes de publicar."
          : "Rascunho e metadados conferidos salvos (permanece em revisão inicial)."
      );
      await loadData();
    } catch {
      setError("Falha na comunicação ao salvar o resumo. Seu texto digitado foi preservado.");
    }
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <FileText className="h-6 w-6 text-radar-blue" />
        Gestão do Diário Oficial Municipal
      </h1>

      <section className="radar-card p-5 space-y-3">
        <h2 className="font-bold text-base">Edições registradas para conferência</h2>
        <p className="text-sm text-radar-muted">
          A coleta automática atual cobre apenas leis, decretos e portarias presentes na
          lista estruturada da Imprensa Oficial. Não significa que o PDF inteiro foi lido.
          Todos os atos importados exigem revisão editorial antes da publicação.
        </p>
        {editions.length === 0 ? (
          <p className="text-sm text-radar-muted">Ainda não há edições cadastradas.</p>
        ) : (
          <div className="space-y-2">
            {editions.slice(0, 12).map(ed => (
              <div key={ed.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-radar-border p-2 text-sm">
                <span>
                  <strong>Edição {ed.editionNumber}</strong>{" "}
                  ({ed.publicationDate.slice(0, 10)}) — {ed.totalActs} ato(s)
                  <span className="ml-2 text-xs text-radar-muted">{ed.status}</span>
                </span>
                <a href={ed.officialUrl} target="_blank" rel="noopener noreferrer" className="text-radar-blue underline">
                  Fonte oficial
                </a>
              </div>
            ))}
          </div>
        )}
      </section>

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
      <section className="radar-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-base">Fila Editorial de Atos do Diário Oficial</h2>
          <span className="text-xs text-radar-muted">
            {acts.length} ato(s) listado(s)
          </span>
        </div>
        <div className="space-y-4">
          {acts.length === 0 ? (
            <p className="text-sm text-radar-muted">Nenhum ato cadastrado.</p>
          ) : (
            acts.map((act) => {
              const extractionBadge = getExtractionBadge(act.extractionStatus);
              const isEditable =
                act.status === "DRAFT_IMPORTED" || act.status === "IN_REVIEW";
              const isAnnexCheck =
                act.extractionStatus === "EXTRACTED_PDF_ANNEX_CHECK";
              const hasDifferentPdfUrl =
                act.edition.officialUrl && act.edition.officialUrl !== act.officialUrl;

              return (
                <div
                  key={act.id}
                  className="rounded-lg border border-radar-border p-4 text-sm space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-[260px]">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-semibold text-radar-blue">
                          {act.category.name} {act.actNumber ? `nº ${act.actNumber}` : "S/N"}
                        </span>
                        <span className="text-radar-muted">•</span>
                        <span>Edição nº {act.edition.editionNumber}</span>
                        <span className="text-radar-muted">•</span>
                        <span>
                          {act.pageNumber ? `Pág. ${act.pageNumber}` : "Pág. não informada"}
                        </span>
                        <span className="rounded border border-radar-border px-2 py-0.5 font-semibold">
                          {act.status}
                        </span>
                        {extractionBadge && (
                          <span
                            className={`rounded border px-2 py-0.5 font-medium ${extractionBadge.className}`}
                          >
                            {extractionBadge.label}
                          </span>
                        )}
                      </div>

                      <p className="font-semibold text-base">{act.titleSimple}</p>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-radar-muted">
                        <span>
                          <strong>Data do ato:</strong> {formatIsoDateLabel(act.actDate)}
                        </span>
                        <span>
                          <strong>Data da edição:</strong>{" "}
                          {formatIsoDateLabel(act.edition.publicationDate)}
                        </span>
                        <span>
                          <strong>Órgão emissor:</strong>{" "}
                          {act.agency?.name || "Pendente de confirmação humana"}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <a
                        href={act.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded border border-radar-border px-2.5 py-1.5 text-xs font-medium text-radar-blue hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Fonte do ato
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      {hasDifferentPdfUrl && (
                        <a
                          href={act.edition.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-radar-border px-2.5 py-1.5 text-xs font-medium text-radar-blue hover:bg-slate-50 dark:hover:bg-slate-800"
                        >
                          PDF da edição
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {isEditable && editingActId !== act.id && (
                        <button
                          type="button"
                          onClick={() => startEditingAct(act)}
                          className="rounded bg-radar-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-radar-blue-hover"
                        >
                          {act.status === "DRAFT_IMPORTED"
                            ? "Conferir e redigir resumo"
                            : "Editar revisão"}
                        </button>
                      )}
                      {act.status !== "DRAFT_IMPORTED" &&
                        act.status !== "PUBLISHED" && (
                          <button
                            type="button"
                            onClick={() => handlePublishAct(act.id, act.updatedAt)}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Aprovar e Publicar
                          </button>
                        )}
                    </div>
                  </div>

                  {act.status === "DRAFT_IMPORTED" && (
                    <div className="rounded border border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 p-2.5 text-xs text-amber-900 dark:text-amber-200">
                      <strong>Rascunho automático ({act.objectiveSummary}):</strong>{" "}
                      este ato não foi aprovado nem publicado. Confira o documento oficial
                      e redija um resumo em linguagem cidadã.
                    </div>
                  )}

                  {act.status !== "DRAFT_IMPORTED" && (
                    <p className="text-xs text-radar-muted">
                      <strong>Resumo editorial atual:</strong> {act.objectiveSummary}
                    </p>
                  )}

                  {(act.hasPersonalDataAlert || isAnnexCheck) && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {act.hasPersonalDataAlert && (
                        <span className="inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-50 px-2 py-1 font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Alerta LGPD: dados pessoais mascarados — verifique antes de publicar
                        </span>
                      )}
                      {isAnnexCheck && (
                        <span className="inline-flex items-center gap-1 rounded border border-amber-400 bg-amber-50 px-2 py-1 font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Atenção: menção a anexos/tabelas no PDF linear — confira valores e quadros no PDF oficial
                        </span>
                      )}
                    </div>
                  )}

                  {act.rawExcerpt && (
                    <details className="rounded border border-radar-border bg-slate-50/60 dark:bg-slate-900/50 p-2.5">
                      <summary className="cursor-pointer text-xs font-semibold text-radar-blue select-none">
                        Visualizar texto oficial extraído para conferência editorial (sanitizado pela LGPD)
                      </summary>
                      <p className="mt-2 text-[11px] text-radar-muted">
                        Atenção: texto linear extraído para apoiar a conferência humana. Não
                        publique como resumo editorial e confira tabelas, anexos e assinaturas
                        diretamente no PDF oficial.
                      </p>
                      <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded border border-radar-border bg-white dark:bg-slate-950 p-3 font-mono text-xs leading-relaxed">
                        {act.rawExcerpt}
                      </pre>
                    </details>
                  )}

                  {editingActId === act.id && (
                    <div className="mt-3 rounded-lg border border-radar-blue/40 bg-slate-50/80 dark:bg-slate-900/60 p-4 space-y-3">
                      <h3 className="text-xs font-bold uppercase tracking-wide text-radar-blue">
                        Conferência Editorial e Metadados do Ato
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Nº do ato
                          </label>
                          <input
                            value={draftActNumber}
                            onChange={(e) => setDraftActNumber(e.target.value)}
                            placeholder="Ex.: 8140"
                            aria-label="Número conferido do ato"
                            className="w-full rounded border border-radar-border bg-white dark:bg-slate-950 p-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Data do ato
                          </label>
                          <input
                            type="date"
                            value={draftActDate}
                            onChange={(e) => setDraftActDate(e.target.value)}
                            aria-label="Data conferida do ato"
                            className="w-full rounded border border-radar-border bg-white dark:bg-slate-950 p-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Página inicial no PDF
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={draftPageNumber}
                            onChange={(e) => setDraftPageNumber(e.target.value)}
                            placeholder="Ex.: 2"
                            aria-label="Página inicial no PDF"
                            className="w-full rounded border border-radar-border bg-white dark:bg-slate-950 p-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">
                            Órgão emissor
                          </label>
                          <select
                            value={draftAgencyId}
                            onChange={(e) => setDraftAgencyId(e.target.value)}
                            aria-label="Órgão emissor do ato"
                            className="w-full rounded border border-radar-border bg-white dark:bg-slate-950 p-2 text-sm"
                          >
                            <option value="">Pendente / Não classificado</option>
                            {agencies.map((ag) => (
                              <option key={ag.id} value={ag.id}>
                                {ag.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">
                          Título em linguagem simples *
                        </label>
                        <input
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          aria-label="Título conferido do ato"
                          className="w-full rounded border border-radar-border bg-white dark:bg-slate-950 p-2 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">
                          Resumo objetivo revisado para o cidadão * (mín. 25 caracteres para IN_REVIEW)
                        </label>
                        <textarea
                          value={draftSummary}
                          onChange={(e) => setDraftSummary(e.target.value)}
                          aria-label="Resumo editorial conferido na fonte oficial"
                          placeholder="Leia o documento original e escreva um resumo fiel em linguagem clara, sem copiar texto bruto nem inferir consequências não comprovadas."
                          rows={4}
                          className="w-full rounded border border-radar-border bg-white dark:bg-slate-950 p-2 text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium mb-1">
                          Prazos ou vigência relevante (opcional)
                        </label>
                        <input
                          value={draftDeadlinesText}
                          onChange={(e) => setDraftDeadlinesText(e.target.value)}
                          placeholder="Somente se explicitamente previsto no ato oficial"
                          aria-label="Prazos ou vigência do ato"
                          className="w-full rounded border border-radar-border bg-white dark:bg-slate-950 p-2 text-sm"
                        />
                      </div>

                      {error && (
                        <div className="rounded border border-red-400 bg-red-50 p-2.5 text-xs text-red-900 space-y-2">
                          <p>{error}</p>
                          {(draftConflict || !draftExpectedUpdatedAt) && (
                            <button
                              type="button"
                              onClick={() => handleReloadVersionKeepingDraft(act.id)}
                              className="rounded border border-red-400 bg-white px-2.5 py-1 text-xs font-semibold text-red-900 hover:bg-red-100"
                            >
                              Recarregar versão do ato mantendo texto digitado
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleRewriteImportedAct(act.id, "SAVE_DRAFT")}
                          className="rounded border border-radar-border bg-white dark:bg-slate-800 px-3 py-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          Salvar rascunho
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRewriteImportedAct(act.id, "SEND_TO_REVIEW")}
                          className="rounded bg-radar-navy px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
                        >
                          Concluir revisão e enviar para IN_REVIEW
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingActId(null);
                            setDraftExpectedUpdatedAt(null);
                            setDraftConflict(false);
                          }}
                          className="rounded px-3 py-2 text-xs text-radar-muted hover:underline"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
