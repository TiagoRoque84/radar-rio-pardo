import crypto from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { getRequiredAuthSecret } from "@/lib/env";

export type UserRole = "ADMIN" | "EDITOR" | "COLLABORATOR";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  sessionId: string;
}

export const SESSION_COOKIE_NAME = "radar_rp_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 horas

function getAuthSecret(): Uint8Array {
  return getRequiredAuthSecret();
}

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createUserSession(params: {
  userId: string;
  role: UserRole;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  const session = await prisma.session.create({
    data: {
      userId: params.userId,
      tokenHash,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent?.slice(0, 490) ?? null,
      expiresAt,
    },
  });

  const jwt = await new SignJWT({
    sub: params.userId,
    role: params.role,
    sid: session.id,
    jti: rawToken,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getAuthSecret());

  return jwt;
}

export async function setSessionCookie(jwt: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function verifySessionToken(
  token: string
): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    const userId = payload.sub;
    const sid = typeof payload.sid === "string" ? payload.sid : null;
    const jti = typeof payload.jti === "string" ? payload.jti : null;

    if (!userId || !sid || !jti) return null;

    const sessionRecord = await prisma.session.findUnique({
      where: { id: sid },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            active: true,
          },
        },
      },
    });

    if (
      !sessionRecord ||
      !sessionRecord.user ||
      !sessionRecord.user.active ||
      sessionRecord.expiresAt < new Date() ||
      sessionRecord.tokenHash !== hashSessionToken(jti)
    ) {
      return null;
    }

    return {
      id: sessionRecord.user.id,
      name: sessionRecord.user.name,
      email: sessionRecord.user.email,
      role: sessionRecord.user.role as UserRole,
      sessionId: sessionRecord.id,
    };
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function revokeCurrentSession(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await prisma.session
      .delete({ where: { id: user.sessionId } })
      .catch(() => null);
  }
  await clearSessionCookie();
}

export function hasRole(user: SessionUser | null, allowed: UserRole[]): boolean {
  if (!user) return false;
  return allowed.includes(user.role);
}

export function canPublishContent(role: UserRole): boolean {
  return role === "ADMIN" || role === "EDITOR";
}

export function canManageAdminSettings(role: UserRole): boolean {
  return role === "ADMIN";
}
