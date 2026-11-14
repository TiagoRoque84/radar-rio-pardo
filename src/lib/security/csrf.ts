import type { NextRequest } from "next/server";

export const CSRF_COOKIE_NAME = "radar_rp_csrf";
export const CSRF_HEADER_NAME = "x-csrf-token";

export interface CsrfValidationOptions {
  configuredAppUrl?: string;
  trustedOriginsExtra?: string;
  nodeEnv?: string;
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function tryParseOrigin(raw?: string | null): URL | null {
  if (!raw || raw === "null") return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

export function getTrustedOrigins(
  requestUrl?: string,
  options?: CsrfValidationOptions
): Set<string> {
  const origins = new Set<string>();
  const env = options?.nodeEnv ?? process.env.NODE_ENV ?? "development";
  const configured =
    options?.configuredAppUrl ?? process.env.NEXT_PUBLIC_APP_URL;

  const parsedConfigured = tryParseOrigin(configured);
  if (parsedConfigured) {
    origins.add(parsedConfigured.origin.toLowerCase());
  }

  const extraRaw =
    options?.trustedOriginsExtra ?? process.env.TRUSTED_ORIGINS ?? "";
  for (const part of extraRaw.split(",")) {
    const trimmed = part.trim();
    const parsedExtra = tryParseOrigin(trimmed);
    if (parsedExtra) {
      origins.add(parsedExtra.origin.toLowerCase());
    }
  }

  if (env !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
    const parsedReq = tryParseOrigin(requestUrl);
    if (
      parsedReq &&
      (parsedReq.hostname === "localhost" || parsedReq.hostname === "127.0.0.1")
    ) {
      origins.add(parsedReq.origin.toLowerCase());
    }
  }

  return origins;
}

export function validateCsrfRequest(
  request: NextRequest,
  options?: CsrfValidationOptions
): { valid: boolean; reason?: string } {
  const env = options?.nodeEnv ?? process.env.NODE_ENV ?? "development";

  const secFetchSite = request.headers
    .get("sec-fetch-site")
    ?.trim()
    .toLowerCase();
  if (secFetchSite === "cross-site") {
    return {
      valid: false,
      reason: "Requisição cross-site bloqueada (Sec-Fetch-Site).",
    };
  }

  const originHeader = request.headers.get("origin")?.trim();
  const refererHeader = request.headers.get("referer")?.trim();

  if (originHeader === "null") {
    return {
      valid: false,
      reason: "Cabeçalho Origin nulo não autorizado.",
    };
  }

  let candidateUrl: URL | null = null;
  if (originHeader) {
    candidateUrl = tryParseOrigin(originHeader);
    if (!candidateUrl) {
      return {
        valid: false,
        reason: "Cabeçalho Origin inválido.",
      };
    }
  } else if (refererHeader) {
    candidateUrl = tryParseOrigin(refererHeader);
    if (!candidateUrl) {
      return {
        valid: false,
        reason: "Cabeçalho Referer inválido.",
      };
    }
  } else {
    return {
      valid: false,
      reason:
        "Cabeçalhos Origin e Referer ausentes em requisição mutável (CSRF).",
    };
  }

  const trustedOrigins = getTrustedOrigins(request.url, options);
  const candidateOrigin = candidateUrl.origin.toLowerCase();

  if (
    env === "production" &&
    candidateUrl.protocol !== "https:" &&
    candidateUrl.hostname !== "localhost" &&
    candidateUrl.hostname !== "127.0.0.1"
  ) {
    return {
      valid: false,
      reason: `Protocolo inseguro (${candidateUrl.protocol}) rejeitado em produção.`,
    };
  }

  if (!trustedOrigins.has(candidateOrigin)) {
    return {
      valid: false,
      reason: `Origem "${candidateOrigin}" não autorizada para este servidor.`,
    };
  }

  const headerToken = request.headers.get(CSRF_HEADER_NAME)?.trim() || "";
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value?.trim() || "";

  if (headerToken) {
    if (!cookieToken || !constantTimeEqual(cookieToken, headerToken)) {
      return {
        valid: false,
        reason: "Token CSRF inválido ou divergente.",
      };
    }
  }

  return { valid: true };
}
