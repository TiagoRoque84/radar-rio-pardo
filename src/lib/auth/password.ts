import crypto from "node:crypto";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

/**
 * Senhas antigas de exemplo/desenvolvimento que devem ser explicitamente rejeitadas.
 */
const FORBIDDEN_LEGACY_PASSWORDS = new Set([
  "RadarAdmin@2026!",
  "EditorRadar@2026!",
  "ColaboradorRadar@2026!",
  "TroqueEstaSenhaNoPrimeiroAcesso!2026",
  "Admin@12345678",
  "Password@1234",
]);

export function validatePasswordStrength(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!password || password.length < 12) {
    errors.push("A senha deve ter no mínimo 12 caracteres.");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("A senha deve conter pelo menos uma letra maiúscula.");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("A senha deve conter pelo menos uma letra minúscula.");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("A senha deve conter pelo menos um número.");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("A senha deve conter pelo menos um caractere especial.");
  }
  if (FORBIDDEN_LEGACY_PASSWORDS.has(password)) {
    errors.push(
      "Esta senha pertence a uma lista de senhas padrão proibidas. Escolha uma senha exclusiva."
    );
  }

  return { valid: errors.length === 0, errors };
}

export function generateStrongRandomPassword(length = 20): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*-_=+";
  const all = upper + lower + digits + symbols;

  const chars: string[] = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ];

  while (chars.length < length) {
    chars.push(all[crypto.randomInt(all.length)]);
  }

  // Embaralhar usando randomInt criptográfico
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
