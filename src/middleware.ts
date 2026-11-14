import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getRequiredAuthSecret } from "@/lib/env";
import { CSRF_COOKIE_NAME, validateCsrfRequest } from "@/lib/security/csrf";

const SESSION_COOKIE_NAME = "radar_rp_session";
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/recuperar-senha"];
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isPublicAdminPath(pathname: string): boolean {
  return PUBLIC_ADMIN_PATHS.some(
    (publicPath) =>
      pathname === publicPath || pathname.startsWith(`${publicPath}/`)
  );
}

async function hasValidJwtCookie(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, getRequiredAuthSecret());
    return (
      typeof payload.sub === "string" &&
      typeof payload.sid === "string" &&
      typeof payload.jti === "string"
    );
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    MUTATING_METHODS.has(request.method) &&
    (pathname.startsWith("/api/admin") || pathname.startsWith("/api/auth"))
  ) {
    const csrf = validateCsrfRequest(request);
    if (!csrf.valid) {
      return NextResponse.json(
        { error: csrf.reason || "Origem da requisição não autorizada (CSRF)." },
        { status: 403 }
      );
    }
  }

  const isAdminApi = pathname.startsWith("/api/admin");
  const isProtectedAdminPage =
    pathname.startsWith("/admin") && !isPublicAdminPath(pathname);

  if (isAdminApi || isProtectedAdminPage) {
    const valid = await hasValidJwtCookie(request);
    if (!valid) {
      if (isAdminApi) {
        return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
      }
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  const response = NextResponse.next();

  if (
    request.method === "GET" &&
    pathname.startsWith("/admin") &&
    !request.cookies.get(CSRF_COOKIE_NAME)?.value
  ) {
    response.cookies.set({
      name: CSRF_COOKIE_NAME,
      value: crypto.randomUUID(),
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/auth/:path*"],
};
