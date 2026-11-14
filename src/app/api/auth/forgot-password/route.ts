import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashSessionToken } from "@/lib/auth/session";
import { recordAuditLog } from "@/lib/auth/audit";

const forgotPasswordSchema = z.object({
  email: z.string().email("Informe um e-mail institucional válido."),
});

const TOKEN_TTL_MINUTES = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "E-mail inválido." },
        { status: 400 }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, active: true },
    });

    if (user && user.active) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = hashSessionToken(rawToken);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + TOKEN_TTL_MINUTES * 60 * 1000);

      await prisma.$transaction([
        prisma.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: now },
        }),
        prisma.passwordResetToken.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt,
          },
        }),
      ]);

      await recordAuditLog({
        userId: user.id,
        action: "PASSWORD_RESET_REQUESTED",
        entityType: "User",
        entityId: user.id,
        details: { expiresAt: expiresAt.toISOString() },
        ipAddress,
      });

      if (process.env.NODE_ENV !== "production") {
        console.info(`[DEV PASSWORD RESET] Token para ${email}: ${rawToken}`);
      }
    } else {
      await recordAuditLog({
        action: "PASSWORD_RESET_REQUESTED_UNKNOWN",
        entityType: "User",
        details: { email },
        ipAddress,
      });
    }

    return NextResponse.json({
      ok: true,
      message:
        "Solicitação registrada. Se o e-mail pertencer a uma conta ativa, um token temporário válido por 30 minutos foi emitido. Caso não haja envio transacional de e-mail configurado neste ambiente, solicite ao administrador a emissão ou redefinição via CLI (`npm run auth:reset-password`).",
    });
  } catch (error) {
    console.error("Erro na solicitação de recuperação de senha:", error);
    return NextResponse.json(
      { error: "Erro ao processar solicitação de recuperação." },
      { status: 500 }
    );
  }
}
