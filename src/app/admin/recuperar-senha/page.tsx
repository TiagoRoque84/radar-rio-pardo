"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, Radio, AlertCircle, CheckCircle2, Mail } from "lucide-react";

export default function AdminRecoverPasswordPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleRequestToken(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setRequestLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível registrar a solicitação.");
        return;
      }
      setMessage(data.message);
    } catch {
      setError("Erro de conexão ao solicitar recuperação.");
    } finally {
      setRequestLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (newPassword !== confirmPassword) {
      setError("A confirmação de senha não confere com a nova senha.");
      return;
    }

    setResetLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Não foi possível redefinir a senha.");
        return;
      }
      setMessage(data.message);
      setToken("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Erro de conexão ao redefinir a senha.");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-radar-surface dark:bg-slate-950 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-radar-border bg-white dark:bg-slate-900 p-8 shadow-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-radar-navy text-white">
            <Radio className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">Recuperação de Senha Editorial</h1>
          <p className="text-xs text-radar-muted">
            Radar Rio Pardo — Redefinição segura mediante token temporário
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{message}</span>
          </div>
        )}

        <form onSubmit={handleRequestToken} className="space-y-3 border-b border-radar-border pb-6">
          <h2 className="text-sm font-bold">1. Solicitar token temporário</h2>
          <p className="text-xs text-radar-muted">
            Informe seu e-mail institucional. O token tem validade de 30 minutos. Se o
            servidor não possuir serviço SMTP ativo, solicite ao administrador a emissão
            do token via terminal (`npm run auth:reset-password -- --email=... --generate-token`).
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@radarriopardo.com.br"
              className="flex-1 rounded-lg border border-radar-border bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={requestLoading}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-radar-blue px-4 py-2 text-xs font-semibold text-radar-blue hover:bg-radar-blue/5 disabled:opacity-60 transition"
            >
              <Mail className="h-4 w-4" />
              {requestLoading ? "Emitindo..." : "Solicitar token"}
            </button>
          </div>
        </form>

        <form onSubmit={handleResetPassword} className="space-y-3">
          <h2 className="text-sm font-bold">2. Confirmar token e definir nova senha</h2>

          <div>
            <label htmlFor="reset-email" className="block text-xs font-semibold mb-1">
              E-mail institucional
            </label>
            <input
              id="reset-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="reset-token" className="block text-xs font-semibold mb-1">
              Token de recuperação (64 caracteres hexadecimais)
            </label>
            <input
              id="reset-token"
              type="text"
              required
              minLength={16}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Cole o token emitido"
              className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-800 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div>
            <label htmlFor="reset-password" className="block text-xs font-semibold mb-1">
              Nova senha forte
            </label>
            <input
              id="reset-password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-[11px] text-radar-muted">
              Mínimo 12 caracteres, com maiúscula, minúscula, número e símbolo.
            </p>
          </div>

          <div>
            <label htmlFor="reset-confirm" className="block text-xs font-semibold mb-1">
              Confirmar nova senha
            </label>
            <input
              id="reset-confirm"
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
            disabled={resetLoading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-radar-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-radar-blue-hover disabled:opacity-60 transition"
          >
            <KeyRound className="h-4 w-4" />
            {resetLoading ? "Redefinindo..." : "Redefinir senha"}
          </button>
        </form>

        <div className="border-t border-radar-border pt-4 flex items-center justify-between text-xs text-radar-muted">
          <Link href="/admin/login" className="text-radar-blue hover:underline">
            ← Voltar ao login
          </Link>
          <Link href="/" className="text-radar-blue hover:underline">
            Portal público
          </Link>
        </div>
      </div>
    </div>
  );
}
