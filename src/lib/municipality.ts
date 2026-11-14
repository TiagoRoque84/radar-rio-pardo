/**
 * Constantes, validação territorial e classificação de órgãos públicos oficiais:
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

export function normalizeCnpj(value?: string | null): string {
  if (!value) return "";
  return String(value).replace(/\D/g, "");
}

/**
 * Valida CNPJ (14 dígitos + dígitos verificadores módulo 11 da Receita Federal).
 */
export function isValidCnpj(value?: string | null): boolean {
  const cnpj = normalizeCnpj(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcDigit = (base: string, weights: number[]): number => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += Number(base[i]) * weights[i];
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const d1 = calcDigit(
    cnpj.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );
  const d2 = calcDigit(
    cnpj.slice(0, 13),
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
  );

  return Number(cnpj[12]) === d1 && Number(cnpj[13]) === d2;
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

export interface MunicipalAgencyRegistryEntry {
  acronym: "PMSJRP" | "CMSJRP" | "SAERP" | "FEUC" | "DEC";
  defaultId: string;
  name: string;
  cnpjs: readonly string[];
  officialPatterns: readonly string[];
  officialUrl: string;
}

/**
 * Cadastro verificável dos órgãos públicos municipais de São José do Rio Pardo.
 * CNPJs confirmados em bases oficiais públicas; pode ser estendido via configJson.
 */
export const MUNICIPAL_AGENCIES_REGISTRY: readonly MunicipalAgencyRegistryEntry[] = [
  {
    acronym: "CMSJRP",
    defaultId: "agency-camara-sjrp",
    name: "Câmara Municipal de São José do Rio Pardo",
    cnpjs: ["54138268000113"],
    officialPatterns: [
      "camara municipal de sao jose do rio pardo",
      "camara municipal de s j do rio pardo",
      "camara municipal",
    ],
    officialUrl: "https://camarasjriopardo.sp.gov.br/",
  },
  {
    acronym: "SAERP",
    defaultId: "agency-saerp",
    name: "Serviço Autônomo de Água e Esgoto de São José do Rio Pardo",
    cnpjs: ["19659196000159"],
    officialPatterns: [
      "superintendencia autonoma de agua e esgoto de sao jose do rio pardo",
      "servico autonomo de agua e esgoto de sao jose do rio pardo",
      "servico autonomo de agua e esgoto",
      "saerp",
    ],
    officialUrl: "https://saerp.sp.gov.br/",
  },
  {
    acronym: "FEUC",
    defaultId: "agency-feuc",
    name: "Fundação Educacional e Cultural / Ensino Superior",
    cnpjs: ["59900704000163", "54136866000153"],
    officialPatterns: [
      "faculdade de filosofia ciencias e letras de sao jose do rio pardo",
      "faculdade de filosofia ciencias e letras de s j do rio pardo",
      "fundacao educacional de sao jose do rio pardo",
      "fundacao educacional e cultural",
      "feuc",
    ],
    officialUrl: "https://saojosedoriopardo.sp.gov.br/",
  },
  {
    acronym: "DEC",
    defaultId: "agency-dec",
    name: "Departamento de Esportes e Cultura",
    cnpjs: [],
    officialPatterns: [
      "departamento de esportes e cultura de sao jose do rio pardo",
      "departamento de esportes e cultura",
    ],
    officialUrl: "https://saojosedoriopardo.sp.gov.br/",
  },
  {
    acronym: "PMSJRP",
    defaultId: "agency-prefeitura-sjrp",
    name: "Prefeitura Municipal de São José do Rio Pardo",
    cnpjs: ["45741659000137"],
    officialPatterns: [
      "prefeitura municipal de sao jose do rio pardo",
      "prefeitura do municipio de sao jose do rio pardo",
      "municipio de sao jose do rio pardo",
      "prefeitura de sao jose do rio pardo",
    ],
    officialUrl: "https://saojosedoriopardo.sp.gov.br/",
  },
];

export interface AgencyRecordRef {
  id: string;
  acronym: string | null;
  name: string;
}

export interface AgencyClassificationInput {
  organName?: string | null;
  unitName?: string | null;
  cnpj?: string | null;
  esferaId?: string | null;
  poderId?: string | null;
  ibgeCode?: string | number | null;
  municipalityName?: string | null;
  uf?: string | null;
}

export type AgencyClassificationResult =
  | {
      status: "MATCHED";
      matched: true;
      agencyId: string;
      acronym: string;
      matchedBy: "CNPJ" | "OFFICIAL_NAME";
    }
  | {
      status: "REJECTED_MUNICIPALITY" | "PENDING_CLASSIFICATION";
      matched: false;
      agencyId: null;
      reason: string;
    };

const NON_MUNICIPAL_TEXT_HINTS = [
  "governo do estado",
  "estado de sao paulo",
  "secretaria de estado",
  "secretaria da educacao do estado",
  "policia militar",
  "policia civil",
  "tribunal de justica",
  "ministerio publico",
  "defensoria publica",
  "instituto federal",
  "universidade estadual",
  "universidade federal",
  "governo federal",
  "uniao",
];

function findAgencyInDb(
  agencies: AgencyRecordRef[],
  acronym: string,
  defaultId?: string
): AgencyRecordRef | undefined {
  return (
    agencies.find((a) => a.acronym?.toUpperCase() === acronym.toUpperCase()) ||
    (defaultId ? agencies.find((a) => a.id === defaultId) : undefined)
  );
}

/**
 * Classifica um órgão retornado pelo PNCP sem jamais presumir a Prefeitura
 * por fallback genérico. Registros incertos permanecem em PENDING_CLASSIFICATION.
 */
export function classifyMunicipalAgency(
  input: AgencyClassificationInput,
  agencies: AgencyRecordRef[],
  cnpjOverrides?: Record<string, string>
): AgencyClassificationResult {
  if (
    input.ibgeCode !== undefined ||
    input.municipalityName !== undefined ||
    input.uf !== undefined
  ) {
    const munCheck = isSaoJoseDoRioPardo({
      ibgeCode: input.ibgeCode,
      municipalityName: input.municipalityName,
      uf: input.uf,
    });
    if (!munCheck.valid) {
      return {
        status: "REJECTED_MUNICIPALITY",
        matched: false,
        agencyId: null,
        reason: munCheck.reason || "Município divergente.",
      };
    }
  }

  const rawLabel = (input.organName || input.unitName || "").trim();
  const normalizedOrgan = input.organName
    ? normalizeMunicipalityText(input.organName).replace(/[.,;:\-/()]/g, " ").replace(/\s+/g, " ").trim()
    : "";
  const normalizedUnit = input.unitName
    ? normalizeMunicipalityText(input.unitName).replace(/[.,;:\-/()]/g, " ").replace(/\s+/g, " ").trim()
    : "";
  const combinedNorm = `${normalizedOrgan} ${normalizedUnit}`.trim();

  const esfera = input.esferaId?.trim().toUpperCase();
  if (esfera === "E" || esfera === "F") {
    return {
      status: "PENDING_CLASSIFICATION",
      matched: false,
      agencyId: null,
      reason: `Órgão de esfera externa (${esfera}) requer confirmação manual antes de ser vinculado ao município.`,
    };
  }

  if (
    NON_MUNICIPAL_TEXT_HINTS.some(
      (hint) =>
        normalizedOrgan.includes(hint) ||
        normalizedUnit.includes(hint)
    )
  ) {
    return {
      status: "PENDING_CLASSIFICATION",
      matched: false,
      agencyId: null,
      reason: `Órgão "${rawLabel}" indica esfera estadual/federal ou externa e exige revisão manual.`,
    };
  }

  // Mapa completo CNPJ -> sigla
  const cnpjToAcronym = new Map<string, string>();
  for (const entry of MUNICIPAL_AGENCIES_REGISTRY) {
    for (const c of entry.cnpjs) {
      cnpjToAcronym.set(normalizeCnpj(c), entry.acronym);
    }
  }
  if (cnpjOverrides) {
    for (const [rawCnpj, acronym] of Object.entries(cnpjOverrides)) {
      const clean = normalizeCnpj(rawCnpj);
      if (isValidCnpj(clean) && acronym.trim()) {
        cnpjToAcronym.set(clean, acronym.trim().toUpperCase());
      }
    }
  }

  const cleanCnpj = normalizeCnpj(input.cnpj);
  if (input.cnpj && !cleanCnpj) {
    return {
      status: "PENDING_CLASSIFICATION",
      matched: false,
      agencyId: null,
      reason: "CNPJ informado no registro está vazio ou sem dígitos válidos.",
    };
  }

  if (cleanCnpj) {
    if (!isValidCnpj(cleanCnpj)) {
      return {
        status: "PENDING_CLASSIFICATION",
        matched: false,
        agencyId: null,
        reason: `CNPJ "${input.cnpj}" inválido ou malformado — retido para conferência humana.`,
      };
    }

    const matchedAcronym = cnpjToAcronym.get(cleanCnpj);
    if (matchedAcronym) {
      const registryEntry = MUNICIPAL_AGENCIES_REGISTRY.find(
        (e) => e.acronym === matchedAcronym
      );
      const dbAgency = findAgencyInDb(
        agencies,
        matchedAcronym,
        registryEntry?.defaultId
      );
      if (dbAgency) {
        return {
          status: "MATCHED",
          matched: true,
          agencyId: dbAgency.id,
          acronym: matchedAcronym,
          matchedBy: "CNPJ",
        };
      }
      return {
        status: "PENDING_CLASSIFICATION",
        matched: false,
        agencyId: null,
        reason: `CNPJ corresponde a ${matchedAcronym}, mas o órgão não está cadastrado na tabela local.`,
      };
    }

    // Há um CNPJ válido, porém desconhecido no cadastro municipal verificável:
    // não atribuir por nome a outro CNPJ conhecido para evitar erro de titularidade.
    return {
      status: "PENDING_CLASSIFICATION",
      matched: false,
      agencyId: null,
      reason: `CNPJ ${cleanCnpj} ("${rawLabel || "sem nome"}") não consta no cadastro verificável de órgãos municipais — pendente de classificação manual.`,
    };
  }

  if (!combinedNorm) {
    return {
      status: "PENDING_CLASSIFICATION",
      matched: false,
      agencyId: null,
      reason: "Registro sem CNPJ nem nome de órgão identificável.",
    };
  }

  // Identificação complementar estrita por nome oficial normalizado (apenas quando CNPJ não veio informado)
  for (const entry of MUNICIPAL_AGENCIES_REGISTRY) {
    if (entry.acronym === "PMSJRP" && input.poderId?.trim().toUpperCase() === "L") {
      continue;
    }

    const hit = entry.officialPatterns.some((pattern) =>
      normalizedOrgan === pattern ||
      normalizedOrgan.includes(pattern) ||
      normalizedUnit.includes(pattern)
    );

    if (hit) {
      const dbAgency = findAgencyInDb(agencies, entry.acronym, entry.defaultId);
      if (dbAgency) {
        return {
          status: "MATCHED",
          matched: true,
          agencyId: dbAgency.id,
          acronym: entry.acronym,
          matchedBy: "OFFICIAL_NAME",
        };
      }
    }
  }

  return {
    status: "PENDING_CLASSIFICATION",
    matched: false,
    agencyId: null,
    reason: `Órgão não reconhecido automaticamente ("${rawLabel}") — retido para classificação humana.`,
  };
}
