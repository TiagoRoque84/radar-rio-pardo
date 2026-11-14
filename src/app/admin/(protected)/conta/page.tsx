import { redirect } from "next/navigation";
import { ShieldCheck, KeyRound, Terminal } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/session";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export default async function AdminAccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/admin/login");
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Minha Conta & Segurança
        </h1>
        <p className="text-sm text-radar-muted mt-1">
          Gerencie suas credenciais de acesso ao painel editorial do Radar Rio Pardo.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-radar-border bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center gap-2 text-radar-navy dark:text-slate-100 font-semibold">
            <ShieldCheck className="h-5 w-5 text-radar-blue" />
            <span>Sessão Autenticada</span>
          </div>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-radar-muted">Nome</dt>
              <dd className="font-medium">{user.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-radar-muted">E-mail institucional</dt>
              <dd className="font-medium break-all">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-radar-muted">Perfil de acesso (RBAC)</dt>
              <dd className="inline-flex mt-0.5 rounded bg-radar-surface px-2 py-0.5 text-xs font-semibold text-radar-navy dark:bg-slate-800 dark:text-slate-200">
                {user.role}
              </dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-radar-border bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex items-center gap-2 text-radar-navy dark:text-slate-100 font-semibold">
            <Terminal className="h-5 w-5 text-radar-blue" />
            <span>Recuperação e Contingência</span>
          </div>
          <p className="text-xs text-radar-muted leading-relaxed">
            Por segurança, senhas antigas nunca são exibidas e eventuais senhas de
            exemplo são bloqueadas. Ao alterar sua senha, todas as outras sessões
            abertas serão encerradas imediatamente.
          </p>
          <p className="text-xs text-radar-muted leading-relaxed">
            Em caso de perda de acesso administrativo no servidor da Hostinger,
            utilize o procedimento oficial via terminal SSH:
          </p>
          <pre className="rounded-lg bg-slate-900 text-slate-100 p-2.5 text-[11px] overflow-x-auto">
            npm run auth:reset-password -- --email={user.email}
          </pre>
        </div>
      </div>

      <div className="rounded-xl border border-radar-border bg-white dark:bg-slate-900 p-6">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-5 w-5 text-radar-blue" />
          <h2 className="text-base font-bold">Alterar senha de acesso</h2>
        </div>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
