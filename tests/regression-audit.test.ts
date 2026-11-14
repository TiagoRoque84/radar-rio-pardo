import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
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
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/auth/password";
import { hashSessionToken } from "@/lib/auth/session";
import {
  isPlaceholderOrWeak,
  validateCronSecretHeader,
} from "@/lib/env";
import { runInstitutionalSeed } from "../prisma/seed";
import {
  extractSqlStatements,
  initializeDatabaseIfNeeded,
  sanitizeLogError,
} from "../scripts/init-db-if-needed";

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

describe("Inicialização Automática e Segura do Banco no Build", () => {
  const root = process.cwd();
  const devDbPath = path.join(root, "prisma", "dev.db");
  const testDbPath = path.join(root, "prisma", "test-auto-init.db");
  const testDbUrl = `file:${testDbPath.replace(/\\/g, "/")}`;
  let isolatedPrisma: PrismaClient;

  function createSpyLogger() {
    const logs: string[] = [];
    return {
      logs,
      logger: {
        log: (msg: string) => logs.push(msg),
        warn: (msg: string) => logs.push(msg),
        error: (msg: string) => logs.push(msg),
      },
    };
  }

  beforeAll(async () => {
    fs.copyFileSync(devDbPath, testDbPath);
    isolatedPrisma = new PrismaClient({
      datasources: { db: { url: testDbUrl } },
    });

    const tables = await isolatedPrisma.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'"
    );
    await isolatedPrisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
    for (const { name } of tables) {
      await isolatedPrisma.$executeRawUnsafe(`DELETE FROM "${name}"`);
    }
    await isolatedPrisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }, 20000);

  afterAll(async () => {
    if (isolatedPrisma) {
      await isolatedPrisma.$disconnect();
    }
    for (const suffix of ["", "-journal", "-wal", "-shm"]) {
      const candidate = `${testDbPath}${suffix}`;
      if (fs.existsSync(candidate)) {
        fs.unlinkSync(candidate);
      }
    }
  });

  it("falha com mensagem segura quando o banco está vazio e credenciais iniciais faltam ou são fracas", async () => {
    const { logger, logs } = createSpyLogger();

    await expect(
      initializeDatabaseIfNeeded({
        prismaClient: isolatedPrisma,
        schemaProvider: "sqlite",
        env: {
          NODE_ENV: "production",
          DATABASE_URL: testDbUrl,
          SEED_ADMIN_EMAIL: "admin@radarriopardo.com.br",
        },
        logger,
      })
    ).rejects.toThrow("SEED_ADMIN_PASSWORD");

    const weakSecret = "SenhaFraca123";
    await expect(
      initializeDatabaseIfNeeded({
        prismaClient: isolatedPrisma,
        schemaProvider: "sqlite",
        env: {
          NODE_ENV: "production",
          DATABASE_URL: testDbUrl,
          SEED_ADMIN_EMAIL: "admin@radarriopardo.com.br",
          SEED_ADMIN_PASSWORD: weakSecret,
        },
        logger,
      })
    ).rejects.toThrow("requisitos mínimos de segurança");

    expect(logs.join("\n")).not.toContain(weakSecret);

    const sanitized = sanitizeLogError(
      new Error("Erro ao conectar em mysql://u123:SegredoDb@localhost/db com SegredoAdmin!2026"),
      {
        DATABASE_URL: "mysql://u123:SegredoDb@localhost/db",
        SEED_ADMIN_PASSWORD: "SegredoAdmin!2026",
      }
    );
    expect(sanitized).not.toContain("SegredoDb");
    expect(sanitized).not.toContain("SegredoAdmin!2026");
    expect(sanitized).toContain("[REDACTED]");
  });

  it("inicializa banco vazio via prisma/seed.ts sem imprimir senhas nos logs", async () => {
    const { logger, logs } = createSpyLogger();
    const initialPassword = "RioPardoSeguro!2026#Admin";

    const result = await initializeDatabaseIfNeeded({
      prismaClient: isolatedPrisma,
      schemaProvider: "sqlite",
      env: {
        NODE_ENV: "production",
        DATABASE_URL: testDbUrl,
        SEED_ADMIN_EMAIL: "AdminInicial@RadarRioPardo.com.br",
        SEED_ADMIN_PASSWORD: initialPassword,
      },
      logger,
    });

    expect(result).toEqual({
      initialized: true,
      skipped: false,
      reason: "INITIALIZED",
    });

    const combinedLogs = logs.join("\n");
    expect(combinedLogs).not.toContain(initialPassword);
    expect(combinedLogs).not.toContain(testDbUrl);

    const admin = await isolatedPrisma.user.findUnique({
      where: { email: "admininicial@radarriopardo.com.br" },
    });
    expect(admin).not.toBeNull();
    expect(admin!.role).toBe("ADMIN");
    expect(admin!.active).toBe(true);
    expect(await verifyPassword(initialPassword, admin!.passwordHash)).toBe(true);

    expect(await isolatedPrisma.newsCategory.count()).toBe(12);
    expect(await isolatedPrisma.gazetteActCategory.count()).toBe(13);
    expect(await isolatedPrisma.publicAgency.count()).toBe(5);
    expect(await isolatedPrisma.officialSource.count()).toBe(5);
    expect(await isolatedPrisma.integrationAdapter.count()).toBe(5);
    expect(await isolatedPrisma.legislature.count()).toBe(1);
    expect(await isolatedPrisma.podcastProgram.count()).toBe(2);
  }, 20000);

  it("preserva integralmente senha, permissões e dados do admin em novas execuções ou deploys", async () => {
    const rotatedPassword = "SenhaRotacionadaPeloAdmin!2026#";
    const rotatedHash = await hashPassword(rotatedPassword);

    await isolatedPrisma.user.update({
      where: { email: "admininicial@radarriopardo.com.br" },
      data: {
        name: "Administrador Produção Preservado",
        passwordHash: rotatedHash,
      },
    });

    const { logger: initLogger } = createSpyLogger();
    const rerunResult = await initializeDatabaseIfNeeded({
      prismaClient: isolatedPrisma,
      schemaProvider: "sqlite",
      env: {
        NODE_ENV: "production",
        DATABASE_URL: testDbUrl,
        SEED_ADMIN_EMAIL: "outro-email@radarriopardo.com.br",
        SEED_ADMIN_PASSWORD: "NovaSenhaTentandoSobrescrever!2026#",
      },
      logger: initLogger,
    });

    expect(rerunResult).toEqual({
      initialized: false,
      skipped: true,
      reason: "ADMIN_ALREADY_EXISTS",
    });

    const { logger: seedLogger } = createSpyLogger();
    const directSeedResult = await runInstitutionalSeed({
      prismaClient: isolatedPrisma,
      env: {
        NODE_ENV: "production",
        SEED_ADMIN_EMAIL: "admininicial@radarriopardo.com.br",
        SEED_ADMIN_PASSWORD: "NovaSenhaTentandoSobrescrever!2026#",
      },
      logger: seedLogger,
    });
    expect(directSeedResult.adminResult).toEqual({
      created: false,
      skipped: true,
    });

    const adminAfterDeploys = await isolatedPrisma.user.findUnique({
      where: { email: "admininicial@radarriopardo.com.br" },
    });
    expect(adminAfterDeploys).not.toBeNull();
    expect(adminAfterDeploys!.name).toBe("Administrador Produção Preservado");
    expect(adminAfterDeploys!.passwordHash).toBe(rotatedHash);
    expect(adminAfterDeploys!.role).toBe("ADMIN");
    expect(adminAfterDeploys!.active).toBe(true);
    expect(await isolatedPrisma.user.count({ where: { role: "ADMIN" } })).toBe(1);
  }, 20000);

  it("mantém build da Hostinger automático, extrai migration MySQL e protege ambientes incompatíveis", async () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8")
    ) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.build).toBe(
      "prisma generate && tsx scripts/init-db-if-needed.ts && next build"
    );

    const migrationSql = fs.readFileSync(
      path.join(root, "prisma", "migrations", "0001_initial_mysql", "migration.sql"),
      "utf8"
    );
    const statements = extractSqlStatements(migrationSql);
    expect(statements.length).toBeGreaterThanOrEqual(30);
    expect(statements.every((s) => s.startsWith("CREATE TABLE IF NOT EXISTS"))).toBe(true);

    const { logger } = createSpyLogger();
    const devLocalSkip = await initializeDatabaseIfNeeded({
      prismaClient: isolatedPrisma,
      schemaProvider: "mysql",
      env: {
        NODE_ENV: "development",
        DATABASE_URL: "file:./dev.db",
      },
      logger,
    });
    expect(devLocalSkip).toEqual({
      initialized: false,
      skipped: true,
      reason: "LOCAL_SQLITE_WITH_MYSQL_SCHEMA",
    });

    await expect(
      initializeDatabaseIfNeeded({
        prismaClient: isolatedPrisma,
        schemaProvider: "mysql",
        env: {
          NODE_ENV: "production",
          DATABASE_URL: "file:./dev.db",
        },
        logger,
      })
    ).rejects.toThrow("Configuração inválida em produção");
  });
});
