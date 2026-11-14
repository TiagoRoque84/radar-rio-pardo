import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  generateStrongRandomPassword,
  hashPassword,
  validatePasswordStrength,
} from "../src/lib/auth/password";

const prisma = new PrismaClient();

function parseArgs(argv: string[]) {
  let email = "";
  let password = "";
  let generateToken = false;

  for (const arg of argv) {
    if (arg.startsWith("--email=")) {
      email = arg.slice("--email=".length).trim().toLowerCase();
    } else if (arg.startsWith("--password=")) {
      password = arg.slice("--password=".length);
    } else if (arg === "--generate-token") {
      generateToken = true;
    } else if (!arg.startsWith("-") && !email && arg.includes("@")) {
      email = arg.trim().toLowerCase();
    }
  }

  return { email, password, generateToken };
}

async function main() {
  const { email, password, generateToken } = parseArgs(process.argv.slice(2));

  if (!email) {
    console.error(
      "Uso:\n" +
        "  npm run auth:reset-password -- --email=admin@radarriopardo.com.br\n" +
        "  npm run auth:reset-password -- --email=admin@radarriopardo.com.br --generate-token\n" +
        '  npm run auth:reset-password -- --email=admin@radarriopardo.com.br --password="SuaSenhaForte@2026"'
    );
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  if (!user) {
    console.error(`[ERRO] Usuário não encontrado para o e-mail: ${email}`);
    process.exit(1);
  }

  if (!user.active) {
    console.error(`[ERRO] Usuário ${email} está inativo no banco.`);
    process.exit(1);
  }

  if (generateToken) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

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
      prisma.auditLog.create({
        data: {
          userId: user.id,
          action: "CLI_PASSWORD_RESET_TOKEN_ISSUED",
          entityType: "User",
          entityId: user.id,
          detailsJson: JSON.stringify({ expiresAt: expiresAt.toISOString() }),
        },
      }),
    ]);

    console.log("=========================================================");
    console.log(`Token temporário de recuperação emitido para: ${user.email}`);
    console.log(`Válido até: ${expiresAt.toISOString()} (30 minutos)`);
    console.log(`TOKEN: ${rawToken}`);
    console.log("Acesse /admin/recuperar-senha para concluir a redefinição.");
    console.log("=========================================================");
    return;
  }

  const nextPassword = password || generateStrongRandomPassword();
  const check = validatePasswordStrength(nextPassword);
  if (!check.valid) {
    console.error(
      `[ERRO] A senha informada não atende à política de segurança:\n - ${check.errors.join("\n - ")}`
    );
    process.exit(1);
  }

  const passwordHash = await hashPassword(nextPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CLI_PASSWORD_RESET",
        entityType: "User",
        entityId: user.id,
        detailsJson: JSON.stringify({ mode: password ? "explicit" : "generated" }),
      },
    }),
  ]);

  console.log("=========================================================");
  console.log(`Senha redefinida com sucesso para ${user.email} (${user.role}).`);
  console.log("Todas as sessões ativas e bloqueios anteriores foram removidos.");
  if (!password) {
    console.log(`NOVA SENHA GERADA: ${nextPassword}`);
    console.log("Guarde-a em cofre de senhas e troque-a se necessário em /admin/conta.");
  }
  console.log("=========================================================");
}

main()
  .catch((error) => {
    console.error("Erro ao redefinir senha via CLI:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
