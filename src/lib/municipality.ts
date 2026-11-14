/**
 * Constantes e validadores oficiais do município alvo:
 * São José do Rio Pardo - SP (Código IBGE 3549706).
 */

export const SJRP_IBGE_CODE =
  process.env.MUNICIPALITY_IBGE_CODE || "3549706";
export const SJRP_NAME = "São José do Rio Pardo";
export const SJRP_UF = "SP";

export function normalizeMunicipalityText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export interface MunicipalityValidationInput {
  ibgeCode?: string | number | null;
  municipalityName?: string | null;
  uf?: string | null;
}

/**
 * Garante que um registro retornado por API externa pertence estritamente a
 * São José do Rio Pardo (SP) - IBGE 3549706.
 * Rejeita explicitamente registros de outros municípios (incluindo o código 3550803).
 */
export function isSaoJoseDoRioPardo(
  input: MunicipalityValidationInput
): { valid: boolean; reason?: string } {
  const code =
    input.ibgeCode !== undefined && input.ibgeCode !== null
      ? String(input.ibgeCode).trim()
      : "";
  const name = input.municipalityName
    ? normalizeMunicipalityText(input.municipalityName)
    : "";
  const uf = input.uf ? input.uf.trim().toUpperCase() : "";

  if (!code && !name) {
    return {
      valid: false,
      reason: "Registro sem código IBGE nem nome de município identificável.",
    };
  }

  if (code && code !== SJRP_IBGE_CODE) {
    return {
      valid: false,
      reason: `Código IBGE divergente: esperado ${SJRP_IBGE_CODE}, recebido ${code}.`,
    };
  }

  if (name && name !== "sao jose do rio pardo") {
    return {
      valid: false,
      reason: `Município divergente: esperado São José do Rio Pardo, recebido "${input.municipalityName}".`,
    };
  }

  if (uf && uf !== SJRP_UF) {
    return {
      valid: false,
      reason: `UF divergente: esperado ${SJRP_UF}, recebido ${uf}.`,
    };
  }

  return { valid: true };
}
