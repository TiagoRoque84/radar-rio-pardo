import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validators";
import { verifyPassword } from "@/lib/auth/password";
import {
  createUserSession,
  setSessionCookie,
  UserRole,
} from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/auth/audit";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos." },
        { status: 400 }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "local";
    const userAgent = request.headers.get("user-agent") || null;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.active) {
      await recordAuditLog({
        action: "LOGIN_FAILED_UNKNOWN_OR_INACTIVE",
        entityType: "User",
        details: { email },
        ipAddress: ip,
      });
      return NextResponse.json(
        { error: "Credenciais inválidas ou usuário inativo." },
        { status: 401 }
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return NextResponse.json(
        {
          error:
            "Muitas tentativas inválidas. Acesso temporariamente bloqueado por 15 minutos.",
        },
        { status: 429 }
      );
    }

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);

    if (!valid) {
      const attempts = user.failedLoginAttempts + 1;
      const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: attempts,
          lockedUntil: shouldLock
            ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000)
            : null,
        },
      });

      await recordAuditLog({
        userId: user.id,
        action: shouldLock ? "LOGIN_LOCKED" : "LOGIN_FAILED",
        entityType: "User",
        entityId: user.id,
        details: { attempts },
        ipAddress: ip,
      });

      return NextResponse.json(
        { error: "E-mail ou senha incorretos." },
        { status: 401 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    const jwt = await createUserSession({
      userId: user.id,
      role: user.role as UserRole,
      ipAddress: ip,
      userAgent,
    });
    await setSessionCookie(jwt);

    await recordAuditLog({
      userId: user.id,
      action: "LOGIN_SUCCESS",
      entityType: "User",
      entityId: user.id,
      ipAddress: ip,
    });

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Erro no login:", error);
    return NextResponse.json(
      { error: "Erro interno ao autenticar." },
      { status: 500 }
    );
  }
}
