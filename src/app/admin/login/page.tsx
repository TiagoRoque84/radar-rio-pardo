"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Radio, AlertCircle } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Falha ao entrar.");
      } else {
        router.push("/admin");
        router.refresh();
      }
    } catch {
      setError("Erro de conexão ao tentar autenticar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-radar-navy px-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 p-8 shadow-xl space-y-6">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-radar-blue text-white">
            <Radio className="h-6 w-6 text-radar-gold" />
          </div>
          <h1 className="text-2xl font-bold text-radar-navy dark:text-white">
            Painel Editorial — Radar Rio Pardo
          </h1>
          <p className="text-xs text-radar-muted dark:text-slate-300">
            Acesso restrito à equipe editorial e técnica autorizada.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 flex items-start gap-2"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-semibold mb-1">
              E-mail institucional
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@radarriopardo.com.br"
              className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold mb-1"
            >
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-radar-border bg-white dark:bg-slate-800 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-radar-blue px-4 py-2.5 text-sm font-semibold text-white hover:bg-radar-blue-hover disabled:opacity-60 transition"
          >
            <Lock className="h-4 w-4" />
            {loading ? "Verificando..." : "Entrar no painel"}
          </button>
        </form>

        <div className="border-t border-radar-border pt-4 text-center text-xs text-radar-muted">
          <Link href="/" className="text-radar-blue hover:underline">
            ← Voltar para o portal público
          </Link>
        </div>
      </div>
    </div>
  );
}
