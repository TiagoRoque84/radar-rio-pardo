/**
 * Utilitários de formatação para Português do Brasil, fuso America/Sao_Paulo e moeda BRL.
 * Valores financeiros utilizam string/Decimal no banco para evitar imprecisões de ponto flutuante.
 */

export const TIMEZONE_BR = "America/Sao_Paulo";

export function formatCurrencyBRL(
  value: unknown,
  fallback = "Não informado"
): string {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  let numeric: number;
  if (typeof value === "number") {
    numeric = value;
  } else if (typeof value === "string") {
    const normalized = value.trim().replace(/\s/g, "");
    numeric = Number(normalized);
  } else if (
    typeof value === "object" &&
    value !== null &&
    "toString" in value &&
    typeof (value as { toString: () => string }).toString === "function"
  ) {
    numeric = Number((value as { toString: () => string }).toString());
  } else {
    return fallback;
  }

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

export function formatDateBR(
  dateInput: Date | string | null | undefined,
  options?: { includeTime?: boolean; fallback?: string }
): string {
  const fallback = options?.fallback ?? "Data não informada";
  if (!dateInput) return fallback;

  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return fallback;

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE_BR,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(options?.includeTime
      ? { hour: "2-digit", minute: "2-digit" }
      : {}),
  }).format(date);
}

export function formatLongDateBR(dateInput: Date | string = new Date()): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIMEZONE_BR,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function slugify(text: string): string {
  return text
    .replace(/[º°]/g, "o")
    .replace(/ª/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "Duração não informada";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins} min ${secs.toString().padStart(2, "0")} s`;
}
