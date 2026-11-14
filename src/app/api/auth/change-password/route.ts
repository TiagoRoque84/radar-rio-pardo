import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/auth/password";
import { recordAuditLog } from "@/lib/auth/audit";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual."),
  newPassword: z.string().min(12, "A nova senha deve ter no mínimo 12 caracteres."),
});

export async function POST(request: NextRequest) {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const body = await request.json();
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos." },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parsed.data;
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";

    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, passwordHash: true, active: true },
    });

    if (!user || !user.active) {
      return NextResponse.json({ error: "Usuário inválido ou inativo." }, { status: 401 });
    }

    const currentValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!currentValid) {
      await recordAuditLog({
        userId: user.id,
        action: "USER_PASSWORD_CHANGE_FAILED",
        entityType: "User",
        entityId: user.id,
        details: { reason: "WRONG_CURRENT_PASSWORD" },
        ipAddress,
      });
      return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: "A nova senha deve ser diferente da senha atual." },
        { status: 400 }
      );
    }

    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return NextResponse.json(
        { error: strength.errors.join(" ") },
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
      prisma.session.deleteMany({
        where: {
          userId: user.id,
          id: { not: sessionUser.sessionId },
        },
      }),
    ]);

    await recordAuditLog({
      userId: user.id,
      action: "USER_PASSWORD_CHANGED",
      entityType: "User",
      entityId: user.id,
      ipAddress,
    });

    return NextResponse.json({
      ok: true,
      message:
        "Senha atualizada com sucesso. Demais sessões ativas deste usuário foram encerradas.",
    });
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    return NextResponse.json(
      { error: "Erro interno ao atualizar a senha." },
      { status: 500 }
    );
  }
}
