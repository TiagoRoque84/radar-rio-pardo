/**
 * Validação rigorosa de variáveis de ambiente críticas para autenticação,
 * proteção de Cron Jobs e conexão com o banco de dados em produção.
 */

const FORBIDDEN_PLACEHOLDERS = [
  "substitua-por-uma-chave-secreta",
  "substitua-por-um-token-aleatorio",
  "TroqueEstaSenha",
  "RadarAdmin@2026!",
  "radar-rio-pardo-dev-secret-local",
  "radar-rio-pardo-cron-dev-token-local",
];

export function isPlaceholderOrWeak(value: string | undefined, minLength: number): boolean {
  if (!value || value.trim().length < minLength) return true;
  const trimmed = value.trim();
  return FORBIDDEN_PLACEHOLDERS.some((p) => trimmed.includes(p));
}

export function getRequiredAuthSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && isPlaceholderOrWeak(secret, 32)) {
    throw new Error(
      "AUTH_SECRET inválido ou ausente em produção. Defina uma chave aleatória forte com no mínimo 32 caracteres."
    );
  }

  if (!secret || secret.trim().length < 32) {
    return new TextEncoder().encode(
      "radar-rio-pardo-dev-only-ephemeral-secret-not-for-production"
    );
  }

  return new TextEncoder().encode(secret.trim());
}

export function validateCronSecretHeader(authHeader: string | null): {
  authorized: boolean;
  reason?: string;
} {
  const configured = process.env.CRON_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && isPlaceholderOrWeak(configured, 24)) {
    return {
      authorized: false,
      reason: "CRON_SECRET não configurado com segredo forte em produção.",
    };
  }

  if (!configured || configured.trim().length < 16) {
    return { authorized: false, reason: "CRON_SECRET ausente." };
  }

  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== configured.trim()) {
    return { authorized: false, reason: "Token de autorização inválido." };
  }

  return { authorized: true };
}
