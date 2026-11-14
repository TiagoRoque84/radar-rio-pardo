/**
 * Módulo de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018).
 * Detecta e mascara dados pessoais sensíveis que não devem ser republicados
 * desnecessariamente em matérias ou resumos do Diário Oficial.
 */

export interface PersonalDataFinding {
  type: "CPF" | "RG" | "TELEFONE" | "CONTA_BANCARIA" | "EMAIL";
  count: number;
}

export interface SanitizeResult {
  sanitizedText: string;
  hasPersonalData: boolean;
  findings: PersonalDataFinding[];
}

const CPF_REGEX = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b|\b\d{11}\b/g;
const RG_REGEX = /\b(?:RG|R\.G\.)\s*[:nº°]*\s*\d{1,2}\.?\d{3}\.?\d{3}-?[\dXx]\b/gi;
const PHONE_REGEX = /\b(?:\+55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\d{4}|\d{4})-\d{4}\b/g;
const EMAIL_REGEX = /\b[a-zA-Z0-9._%+-]+@(?!radarriopardo\.com\.br|roqueconsultoriadigital\.com\.br|camarasjriopardo\.sp\.gov\.br|saojosedoriopardo\.sp\.gov\.br)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/gi;
const BANK_REGEX = /\b(?:ag[êe]ncia|ag\.?|conta\s+corrente|c\/c|pix)\s*[:nº°]*\s*[\d.-]{4,16}\b/gi;

function isLikelyCpf(digitsOnly: string): boolean {
  if (digitsOnly.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digitsOnly)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digitsOnly[i]) * (10 - i);
  let check1 = (sum * 10) % 11;
  if (check1 === 10) check1 = 0;
  if (check1 !== Number(digitsOnly[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(digitsOnly[i]) * (11 - i);
  let check2 = (sum * 10) % 11;
  if (check2 === 10) check2 = 0;
  return check2 === Number(digitsOnly[10]);
}

export function detectAndMaskPersonalData(text: string): SanitizeResult {
  if (!text) {
    return { sanitizedText: "", hasPersonalData: false, findings: [] };
  }

  const findings: PersonalDataFinding[] = [];
  let sanitized = text;

  let cpfCount = 0;
  sanitized = sanitized.replace(CPF_REGEX, (match) => {
    const digits = match.replace(/\D/g, "");
    // Para 11 dígitos sem pontuação, só mascarar se passar nos dígitos verificadores do CPF
    if (match.includes(".") || isLikelyCpf(digits)) {
      cpfCount += 1;
      return `***.${digits.slice(3, 6)}.***-${digits.slice(9, 11)}`;
    }
    return match;
  });
  if (cpfCount > 0) findings.push({ type: "CPF", count: cpfCount });

  let rgCount = 0;
  sanitized = sanitized.replace(RG_REGEX, () => {
    rgCount += 1;
    return "[RG OCULTADO - LGPD]";
  });
  if (rgCount > 0) findings.push({ type: "RG", count: rgCount });

  let phoneCount = 0;
  sanitized = sanitized.replace(PHONE_REGEX, () => {
    phoneCount += 1;
    return "[TELEFONE OCULTADO - LGPD]";
  });
  if (phoneCount > 0) findings.push({ type: "TELEFONE", count: phoneCount });

  let bankCount = 0;
  sanitized = sanitized.replace(BANK_REGEX, () => {
    bankCount += 1;
    return "[DADO BANCÁRIO OCULTADO - LGPD]";
  });
  if (bankCount > 0) findings.push({ type: "CONTA_BANCARIA", count: bankCount });

  let emailCount = 0;
  sanitized = sanitized.replace(EMAIL_REGEX, () => {
    emailCount += 1;
    return "[E-MAIL PESSOAL OCULTADO - LGPD]";
  });
  if (emailCount > 0) findings.push({ type: "EMAIL", count: emailCount });

  return {
    sanitizedText: sanitized,
    hasPersonalData: findings.length > 0,
    findings,
  };
}

export function maskDocumentNumber(doc: string): string {
  const digits = doc.replace(/\D/g, "");
  if (digits.length === 14) {
    // CNPJ público de pessoa jurídica permanece identificável
    return digits.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5"
    );
  }
  if (digits.length === 11) {
    return `***.${digits.slice(3, 6)}.***-${digits.slice(9, 11)}`;
  }
  return doc;
}
