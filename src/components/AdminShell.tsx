"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Newspaper,
  FileText,
  RefreshCw,
  Landmark,
  Wallet,
  Headphones,
  Share2,
  MessageSquareWarning,
  BadgeDollarSign,
  KeyRound,
  LogOut,
  ExternalLink,
} from "lucide-react";

const ADMIN_LINKS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/noticias", label: "Notícias", icon: Newspaper },
  { href: "/admin/diario-oficial", label: "Diário Oficial", icon: FileText },
  { href: "/admin/integracoes", label: "Integrações & Coletores", icon: RefreshCw },
  { href: "/admin/camara", label: "Câmara Municipal", icon: Landmark },
  { href: "/admin/contas-publicas", label: "Contas Públicas", icon: Wallet },
  { href: "/admin/podcasts", label: "Podcasts & NotebookLM", icon: Headphones },
  { href: "/admin/redes-sociais", label: "Facebook & Social", icon: Share2 },
  {
    href: "/admin/correcoes",
    label: "Correções & LGPD",
    icon: MessageSquareWarning,
  },
  {
    href: "/admin/publicidade",
    label: "Publicidade & Patrocínio",
    icon: BadgeDollarSign,
  },
  {
    href: "/admin/conta",
    label: "Minha Conta & Senha",
    icon: KeyRound,
  },
];

export function AdminShell({
  user,
  children,
}: {
  user: { name: string; email: string; role: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-radar-light dark:bg-slate-950">
      <aside className="w-full lg:w-64 bg-radar-navy text-white flex flex-col shrink-0">
        <div className="p-5 border-b border-white/10">
          <Link href="/admin" className="font-bold text-lg tracking-tight block">
            RADAR ADMIN
          </Link>
          <span className="text-xs text-radar-gold block mt-0.5">
            {user.name} ({user.role})
          </span>
        </div>

        <nav
          aria-label="Menu administrativo"
          className="flex-1 p-3 space-y-1 overflow-y-auto"
        >
          {ADMIN_LINKS.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-radar-blue text-white"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2 text-xs">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-slate-300 hover:text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Visualizar portal público
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-left font-semibold text-white hover:bg-red-600/80 transition"
          >
            <LogOut className="h-4 w-4" />
            Sair do painel
          </button>
        </div>
      </aside>

      <main id="conteudo-principal" className="flex-1 p-4 sm:p-8 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
