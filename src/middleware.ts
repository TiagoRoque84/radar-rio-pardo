import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getRequiredAuthSecret } from "@/lib/env";

const SESSION_COOKIE_NAME = "radar_rp_session";
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/recuperar-senha"];
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isPublicAdminPath(pathname: string): boolean {
  return PUBLIC_ADMIN_PATHS.some(
    (publicPath) =>
      pathname === publicPath || pathname.startsWith(`${publicPath}/`)
  );
}

function isSameOriginMutation(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const expectedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host");

  if (!origin || !expectedHost) {
    return true;
  }

  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.host.toLowerCase() === expectedHost.toLowerCase();
  } catch {
    return false;
  }
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
    if (!isSameOriginMutation(request)) {
      return NextResponse.json(
        { error: "Origem da requisição não autorizada (CSRF)." },
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

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/api/auth/:path*"],
};
