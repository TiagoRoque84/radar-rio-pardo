import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashSessionToken } from "@/lib/auth/session";
import { hashPassword, validatePasswordStrength } from "@/lib/auth/password";
import { recordAuditLog } from "@/lib/auth/audit";

const resetPasswordSchema = z.object({
  email: z.string().email("Informe o e-mail institucional."),
  token: z.string().min(16, "Informe o token de recuperação válido."),
  newPassword: z.string().min(12, "A nova senha deve ter no mínimo 12 caracteres."),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos." },
        { status: 400 }
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const rawToken = parsed.data.token.trim();
    const { newPassword } = parsed.data;
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return NextResponse.json(
        { error: strength.errors.join(" ") },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, active: true },
    });

    const tokenHash = hashSessionToken(rawToken);
    const tokenRecord = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    const now = new Date();
    if (
      !user ||
      !user.active ||
      !tokenRecord ||
      tokenRecord.userId !== user.id ||
      tokenRecord.usedAt !== null ||
      tokenRecord.expiresAt <= now
    ) {
      await recordAuditLog({
        userId: user?.id,
        action: "USER_PASSWORD_RESET_FAILED",
        entityType: "User",
        entityId: user?.id,
        details: { email },
        ipAddress,
      });

      return NextResponse.json(
        { error: "Token de recuperação inválido, já utilizado ou expirado." },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      prisma.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: now },
      }),
      prisma.session.deleteMany({
        where: { userId: user.id },
      }),
    ]);

    await recordAuditLog({
      userId: user.id,
      action: "USER_PASSWORD_RESET_COMPLETED",
      entityType: "User",
      entityId: user.id,
      ipAddress,
    });

    return NextResponse.json({
      ok: true,
      message:
        "Senha redefinida com sucesso. Todas as sessões anteriores foram revogadas; acesse novamente com a nova senha.",
    });
  } catch (error) {
    console.error("Erro ao redefinir senha:", error);
    return NextResponse.json(
      { error: "Erro interno ao redefinir senha." },
      { status: 500 }
    );
  }
}
