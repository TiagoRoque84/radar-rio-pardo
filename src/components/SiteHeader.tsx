"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Search, X, Radio, MapPin, Calendar } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/", label: "Início" },
  { href: "/noticias", label: "Notícias" },
  { href: "/diario-oficial", label: "Diário Oficial" },
  { href: "/camara", label: "Câmara Municipal" },
  { href: "/contas-publicas", label: "Contas Públicas" },
  { href: "/podcasts", label: "Podcasts" },
  { href: "/sobre", label: "Sobre o Radar" },
];

export function SiteHeader({ currentDateLabel }: { currentDateLabel: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setMobileOpen(false);
    router.push(`/busca?q=${encodeURIComponent(q)}`);
  }

  return (
    <header className="bg-radar-navy text-white shadow-sm border-b border-white/10">
      {/* Faixa superior institucional e de localidade */}
      <div className="border-b border-white/10 bg-[#0b1c2e] text-xs text-slate-200">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-1.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5 font-medium text-radar-gold">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
              São José do Rio Pardo — SP
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-300 capitalize">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              {currentDateLabel}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-slate-300">
              Portal independente • Sem vínculo com Prefeitura ou Câmara
            </span>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Cabeçalho principal */}
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex items-center gap-3 group focus-visible:outline-radar-gold"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-radar-blue text-white shadow-inner ring-1 ring-white/20 group-hover:bg-radar-blue-hover transition">
              <Radio className="h-6 w-6 text-radar-gold" aria-hidden="true" />
            </div>
            <div>
              <span className="block text-xl font-bold tracking-tight text-white">
                RADAR RIO PARDO
              </span>
              <span className="block text-xs text-slate-300">
                Informação pública sem complicação.
              </span>
            </div>
          </Link>

          {/* Busca desktop */}
          <form
            onSubmit={handleSearch}
            role="search"
            aria-label="Busca global no portal"
            className="hidden md:flex items-center w-full max-w-sm"
          >
            <label htmlFor="global-search-desktop" className="sr-only">
              Pesquisar no Radar Rio Pardo
            </label>
            <div className="relative w-full">
              <input
                id="global-search-desktop"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar notícias, atos, leis ou contratos..."
                className="w-full rounded-lg border border-white/20 bg-white/10 py-2 pl-3.5 pr-10 text-sm text-white placeholder:text-slate-300 focus:bg-white focus:text-radar-navy focus:placeholder:text-slate-500 transition"
              />
              <button
                type="submit"
                aria-label="Executar pesquisa"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-300 hover:text-radar-gold"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
          </form>

          {/* Botão menu mobile */}
          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
            className="inline-flex items-center justify-center rounded-lg border border-white/20 p-2 text-white hover:bg-white/10 lg:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {/* Navegação principal desktop */}
        <nav
          aria-label="Navegação principal"
          className="mt-4 hidden lg:flex items-center justify-between border-t border-white/10 pt-3"
        >
          <ul className="flex flex-wrap items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? "bg-radar-blue text-white shadow-sm"
                        : "text-slate-200 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href="/correcao"
            className="text-xs font-medium text-radar-gold hover:underline"
          >
            Solicitar correção / Contato
          </Link>
        </nav>

        {/* Navegação mobile */}
        {mobileOpen && (
          <div
            id="mobile-nav"
            className="mt-4 space-y-3 border-t border-white/10 pt-4 lg:hidden"
          >
            <form onSubmit={handleSearch} role="search" className="flex gap-2">
              <label htmlFor="global-search-mobile" className="sr-only">
                Pesquisar
              </label>
              <input
                id="global-search-mobile"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar no portal..."
                className="flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-slate-300"
              />
              <button
                type="submit"
                className="rounded-lg bg-radar-blue px-3 py-2 text-sm font-medium text-white"
              >
                Buscar
              </button>
            </form>
            <ul className="grid gap-1">
              {NAV_ITEMS.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`block rounded-md px-3 py-2 text-sm font-medium ${
                        active
                          ? "bg-radar-blue text-white"
                          : "text-slate-200 hover:bg-white/10"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
              <li>
                <Link
                  href="/correcao"
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm font-medium text-radar-gold hover:bg-white/10"
                >
                  Solicitar correção / Direito de resposta
                </Link>
              </li>
            </ul>
          </div>
        )}
      </div>
    </header>
  );
}
