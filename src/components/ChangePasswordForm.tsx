"use client";

import { useState } from "react";
import { CheckCircle2, AlertCircle, KeyRound } from "lucide-react";
import { csrfJsonHeaders } from "@/lib/security/csrf-client";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (newPassword !== confirmPassword) {
      setError("A confirmação de senha não confere com a nova senha.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: csrfJsonHeaders(),
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível alterar a senha.");
        return;
      }

      setSuccess(data.message || "Senha atualizada com sucesso.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Erro de conexão ao tentar alterar a senha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{success}</span>
        </div>
      )}

      <div>
        <label
          htmlFor="currentPassword"
          className="block text-xs font-semibold mb-1"
        >
          Senha atual
        </label>
        <input
          id="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-800 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="newPassword" className="block text-xs font-semibold mb-1">
          Nova senha forte
        </label>
        <input
          id="newPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-800 px-3 py-2 text-sm"
        />
        <p className="mt-1 text-[11px] text-radar-muted">
          Mínimo de 12 caracteres, incluindo letra maiúscula, minúscula, número e
          caractere especial.
        </p>
      </div>

      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-xs font-semibold mb-1"
        >
          Confirmar nova senha
        </label>
        <input
          id="confirmPassword"
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-800 px-3 py-2 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-radar-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-radar-blue-hover disabled:opacity-60 transition"
      >
        <KeyRound className="h-4 w-4" />
        {loading ? "Salvando..." : "Atualizar senha"}
      </button>
    </form>
  );
}
