import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { SJRP_IBGE_CODE, isSaoJoseDoRioPardo } from "@/lib/municipality";
import {
  buildPncpSearchUrl,
  matchAgencyByOrganName,
  parsePncpModalitiesConfig,
  validatePncpItem,
} from "@/lib/collectors/pncp-collector";
import {
  generateStrongRandomPassword,
  validatePasswordStrength,
} from "@/lib/auth/password";
import { hashSessionToken } from "@/lib/auth/session";
import {
  isPlaceholderOrWeak,
  validateCronSecretHeader,
} from "@/lib/env";

describe("Regressão Técnica — IBGE, PNCP, Segurança e Schema MySQL", () => {
  const createdTokenIds: string[] = [];

  afterAll(async () => {
    if (createdTokenIds.length > 0) {
      await prisma.passwordResetToken.deleteMany({
        where: { id: { in: createdTokenIds } },
      });
    }
    await prisma.$disconnect();
  });

  it("define o código IBGE oficial 3549706 para São José do Rio Pardo e rejeita 3550803", () => {
    expect(SJRP_IBGE_CODE).toBe("3549706");

    expect(
      isSaoJoseDoRioPardo({
        ibgeCode: "3549706",
        municipalityName: "São José do Rio Pardo",
        uf: "SP",
      }).valid
    ).toBe(true);

    expect(
      isSaoJoseDoRioPardo({
        ibgeCode: 3549706,
        municipalityName: "Sao Jose do Rio Pardo",
        uf: "sp",
      }).valid
    ).toBe(true);

    const wrongIbge = isSaoJoseDoRioPardo({
      ibgeCode: "3550803",
      municipalityName: "São José do Rio Pardo",
      uf: "SP",
    });
    expect(wrongIbge.valid).toBe(false);

    const wrongCity = isSaoJoseDoRioPardo({
      ibgeCode: "3549706",
      municipalityName: "Mococa",
      uf: "SP",
    });
    expect(wrongCity.valid).toBe(false);

    const wrongUf = isSaoJoseDoRioPardo({
      ibgeCode: "3549706",
      municipalityName: "São José do Rio Pardo",
      uf: "MG",
    });
    expect(wrongUf.valid).toBe(false);
  });

  it("constrói URL do PNCP com codigoModalidadeContratacao, IBGE 3549706 e paginação", () => {
    const url = buildPncpSearchUrl({
      startDate: new Date("2026-10-01T00:00:00Z"),
      endDate: new Date("2026-10-31T00:00:00Z"),
      modalityCode: 6,
      page: 2,
      pageSize: 50,
    });

    expect(url.pathname).toBe("/api/consulta/v1/contratacoes/publicacao");
    expect(url.searchParams.get("codigoModalidadeContratacao")).toBe("6");
    expect(url.searchParams.get("codigoMunicipioIbge")).toBe("3549706");
    expect(url.searchParams.get("dataInicial")).toBe("20261001");
    expect(url.searchParams.get("dataFinal")).toBe("20261031");
    expect(url.searchParams.get("pagina")).toBe("2");
    expect(url.searchParams.get("tamanhoPagina")).toBe("50");

    expect(parsePncpModalitiesConfig(JSON.stringify({ modalidades: [6, 8] }))).toEqual([
      6, 8,
    ]);
    expect(parsePncpModalitiesConfig("json-invalido")).toEqual([6, 8, 9, 4, 7, 5]);
  });

  it("valida item PNCP por município e órgão e mapeia órgãos locais corretamente", () => {
    const validItem = validatePncpItem({
      orgaoEntidade: { razaoSocial: "PREFEITURA MUNICIPAL DE SAO JOSE DO RIO PARDO" },
      unidadeOrgao: {
        codigoIbge: 3549706,
        municipioNome: "São José do Rio Pardo",
        ufSigla: "SP",
      },
    });
    expect(validItem.valid).toBe(true);

    const wrongMunicipalityItem = validatePncpItem({
      orgaoEntidade: { razaoSocial: "PREFEITURA DE OUTRO MUNICIPIO" },
      unidadeOrgao: {
        codigoIbge: 3550803,
        municipioNome: "São Sebastião da Grama",
        ufSigla: "SP",
      },
    });
    expect(wrongMunicipalityItem.valid).toBe(false);

    const missingOrganItem = validatePncpItem({
      unidadeOrgao: {
        codigoIbge: 3549706,
        municipioNome: "São José do Rio Pardo",
        ufSigla: "SP",
      },
    });
    expect(missingOrganItem.valid).toBe(false);

    const agencies = [
      { id: "pmsjrp", acronym: "PMSJRP", name: "Prefeitura" },
      { id: "cmsjrp", acronym: "CMSJRP", name: "Câmara" },
      { id: "saerp", acronym: "SAERP", name: "SAERP" },
      { id: "feuc", acronym: "FEUC", name: "FEUC" },
    ];
    expect(
      matchAgencyByOrganName("Câmara Municipal de São José do Rio Pardo", agencies)
    ).toBe("cmsjrp");
    expect(
      matchAgencyByOrganName("Serviço Autônomo de Água e Esgoto - SAERP", agencies)
    ).toBe("saerp");
    expect(
      matchAgencyByOrganName("Fundação Educacional e Cultural", agencies)
    ).toBe("feuc");
    expect(
      matchAgencyByOrganName("Consórcio Público Não Cadastrado", agencies)
    ).toBeNull();
  });

  it("rejeita senhas padrão antigas ou fracas e valida segredos de ambiente", () => {
    const legacyPasswords = [
      "RadarAdmin@2026!",
      "EditorRadar@2026!",
      "ColaboradorRadar@2026!",
      "TroqueEstaSenhaNoPrimeiroAcesso!2026",
      "Curta@1",
      "semmaiuscula@2026",
      "SEMNUMERO@SENHAFORTE",
    ];

    for (const pwd of legacyPasswords) {
      expect(validatePasswordStrength(pwd).valid).toBe(false);
    }

    const strong = generateStrongRandomPassword(20);
    expect(strong.length).toBeGreaterThanOrEqual(20);
    expect(validatePasswordStrength(strong).valid).toBe(true);

    expect(isPlaceholderOrWeak("substitua-por-uma-chave-secreta", 32)).toBe(true);
    expect(isPlaceholderOrWeak("curto", 32)).toBe(true);

    const prevCron = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "segredo-cron-forte-de-teste-com-mais-de-24-chars";
    expect(validateCronSecretHeader(null).authorized).toBe(false);
    expect(validateCronSecretHeader("Bearer errado").authorized).toBe(false);
    expect(
      validateCronSecretHeader(
        "Bearer segredo-cron-forte-de-teste-com-mais-de-24-chars"
      ).authorized
    ).toBe(true);
    process.env.CRON_SECRET = prevCron;
  });

  it("persiste e invalida PasswordResetToken no banco de dados", async () => {
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    expect(admin).not.toBeNull();

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashSessionToken(rawToken);
    const created = await prisma.passwordResetToken.create({
      data: {
        userId: admin!.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    createdTokenIds.push(created.id);

    const found = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    expect(found).not.toBeNull();
    expect(found!.usedAt).toBeNull();
    expect(found!.userId).toBe(admin!.id);

    const used = await prisma.passwordResetToken.update({
      where: { id: created.id },
      data: { usedAt: new Date() },
    });
    expect(used.usedAt).not.toBeNull();
  });

  it("mantém schema MySQL e migração SQL atualizados para deploy na Hostinger", () => {
    const root = process.cwd();
    const mysqlSchema = fs.readFileSync(
      path.join(root, "prisma", "schema.mysql.prisma"),
      "utf8"
    );
    const migrationSql = fs.readFileSync(
      path.join(root, "prisma", "migrations", "0001_initial_mysql", "migration.sql"),
      "utf8"
    );

    expect(mysqlSchema).toContain('provider = "mysql"');
    expect(mysqlSchema).toContain("model PasswordResetToken");
    expect(migrationSql).toContain("CREATE TABLE IF NOT EXISTS `PasswordResetToken`");
  });

  it("configura next.config.ts com paralelismo reduzido para evitar EAGAIN na Hostinger", () => {
    const root = process.cwd();
    const nextConfigContent = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");

    expect(nextConfigContent).toContain("cpus: 1");
    expect(nextConfigContent).toContain("workerThreads: false");
    expect(nextConfigContent).toContain("webpackBuildWorker: false");
    expect(nextConfigContent).toContain("staticGenerationMaxConcurrency: 1");
    expect(nextConfigContent).toContain("staticGenerationMinPagesPerWorker: 25");
  });
});
