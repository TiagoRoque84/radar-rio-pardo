import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { validatePasswordStrength } from "../src/lib/auth/password";
import {
  runInstitutionalSeed,
  sanitizeSensitiveValues,
  type SeedLogger,
} from "../prisma/seed";

export interface InitDatabaseResult {
  initialized: boolean;
  skipped: boolean;
  reason:
    | "ADMIN_ALREADY_EXISTS"
    | "INITIALIZED"
    | "LOCAL_SQLITE_WITH_MYSQL_SCHEMA";
}

export interface InitDatabaseOptions {
  prismaClient?: PrismaClient;
  env?: Record<string, string | undefined>;
  logger?: SeedLogger;
  schemaProvider?: "mysql" | "sqlite";
  applyMysqlMigrationIfMissing?: boolean;
}

export function loadDotEnvIfNeeded(
  rootDir = process.cwd(),
  targetEnv: Record<string, string | undefined> = process.env
) {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = line.slice(0, eqIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (targetEnv[key] !== undefined) continue;

    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    targetEnv[key] = value;
  }
}

export function detectActivePrismaProvider(
  rootDir = process.cwd()
): "mysql" | "sqlite" {
  const schemaPath = path.join(rootDir, "prisma", "schema.prisma");
  if (!fs.existsSync(schemaPath)) {
    return "mysql";
  }

  const schemaContent = fs.readFileSync(schemaPath, "utf8");
  const match = schemaContent.match(
    /datasource\s+db\s*\{[\s\S]*?provider\s*=\s*"([^"]+)"/
  );
  return match?.[1] === "sqlite" ? "sqlite" : "mysql";
}

export function sanitizeLogError(
  error: unknown,
  env: Record<string, string | undefined> = process.env
): string {
  const raw = error instanceof Error ? error.message : String(error);
  return sanitizeSensitiveValues(raw, env);
}

export function extractSqlStatements(sql: string): string[] {
  const withoutComments = sql
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  return withoutComments
    .split(/;\s*(?:\r?\n|$)/)
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0);
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const errRecord = error as { code?: unknown; message?: unknown };
  if (errRecord.code === "P2021") return true;

  const message =
    typeof errRecord.message === "string" ? errRecord.message.toLowerCase() : "";
  return (
    message.includes("doesn't exist") ||
    message.includes("does not exist") ||
    message.includes("no such table") ||
    message.includes("errno: 1146") ||
    message.includes("error 1146")
  );
}

async function applyInitialMysqlMigration(
  db: PrismaClient,
  logger: SeedLogger,
  rootDir = process.cwd()
) {
  const migrationPath = path.join(
    rootDir,
    "prisma",
    "migrations",
    "0001_initial_mysql",
    "migration.sql"
  );
  if (!fs.existsSync(migrationPath)) {
    throw new Error(
      "[DB-INIT] Tabela User ausente no MySQL e arquivo prisma/migrations/0001_initial_mysql/migration.sql não encontrado."
    );
  }

  const sql = fs.readFileSync(migrationPath, "utf8");
  const statements = extractSqlStatements(sql);
  for (const statement of statements) {
    await db.$executeRawUnsafe(statement);
  }

  logger.log(
    `[DB-INIT] Estrutura inicial MySQL verificada/aplicada (${statements.length} instruções).`
  );
}

async function findInitialAdmin(db: PrismaClient, adminEmail?: string) {
  const normalized = adminEmail?.trim().toLowerCase();
  return db.user.findFirst({
    where: normalized
      ? { OR: [{ role: "ADMIN" }, { email: normalized }] }
      : { role: "ADMIN" },
    select: { id: true, role: true },
  });
}

export async function initializeDatabaseIfNeeded(
  options: InitDatabaseOptions = {}
): Promise<InitDatabaseResult> {
  const env = options.env ?? process.env;
  const logger = options.logger ?? console;
  const rootDir = process.cwd();
  const provider = options.schemaProvider ?? detectActivePrismaProvider(rootDir);
  const databaseUrl = env.DATABASE_URL?.trim() || "";
  const isProduction = env.NODE_ENV === "production";

  if (!databaseUrl) {
    throw new Error(
      "[DB-INIT] Variável DATABASE_URL não definida. Configure a conexão com o banco antes de executar o build."
    );
  }

  if (provider === "mysql") {
    if (databaseUrl.startsWith("file:")) {
      if (!isProduction) {
        logger.log(
          "[DB-INIT] Build local com schema MySQL e DATABASE_URL SQLite (file:). Inicialização automática ignorada localmente."
        );
        return {
          initialized: false,
          skipped: true,
          reason: "LOCAL_SQLITE_WITH_MYSQL_SCHEMA",
        };
      }

      throw new Error(
        "[DB-INIT] Configuração inválida em produção: prisma/schema.prisma usa MySQL, mas DATABASE_URL aponta para SQLite (file:)."
      );
    }

    if (
      !databaseUrl.startsWith("mysql://") &&
      !databaseUrl.startsWith("mysqls://")
    ) {
      throw new Error(
        "[DB-INIT] Configuração inválida: prisma/schema.prisma usa MySQL, mas DATABASE_URL não utiliza protocolo mysql://."
      );
    }
  }

  const ownsClient = !options.prismaClient;
  const db =
    options.prismaClient ??
    new PrismaClient({
      datasources: {
        db: { url: databaseUrl },
      },
    });

  try {
    const rawAdminEmail = env.SEED_ADMIN_EMAIL?.trim() || "";
    let existingAdmin: { id: string; role: string } | null = null;

    try {
      existingAdmin = await findInitialAdmin(db, rawAdminEmail);
    } catch (queryError) {
      if (
        provider === "mysql" &&
        options.applyMysqlMigrationIfMissing !== false &&
        isMissingTableError(queryError)
      ) {
        await applyInitialMysqlMigration(db, logger, rootDir);
        existingAdmin = await findInitialAdmin(db, rawAdminEmail);
      } else {
        throw queryError;
      }
    }

    if (existingAdmin) {
      logger.log(
        "[DB-INIT] Administrador inicial já cadastrado no banco. Seed ignorado para preservar senha, permissões e dados existentes."
      );
      return {
        initialized: false,
        skipped: true,
        reason: "ADMIN_ALREADY_EXISTS",
      };
    }

    if (!rawAdminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawAdminEmail)) {
      throw new Error(
        "[DB-INIT] Administrador inicial não encontrado e SEED_ADMIN_EMAIL está ausente ou inválido. Defina SEED_ADMIN_EMAIL e SEED_ADMIN_PASSWORD nas variáveis de ambiente."
      );
    }

    const rawAdminPassword = env.SEED_ADMIN_PASSWORD?.trim() || "";
    if (!rawAdminPassword) {
      throw new Error(
        "[DB-INIT] Administrador inicial não encontrado e SEED_ADMIN_PASSWORD não foi definida nas variáveis de ambiente."
      );
    }

    const passwordCheck = validatePasswordStrength(rawAdminPassword);
    if (!passwordCheck.valid) {
      throw new Error(
        `[DB-INIT] SEED_ADMIN_PASSWORD não atende aos requisitos mínimos de segurança: ${passwordCheck.errors.join(" ")}`
      );
    }

    logger.log(
      "[DB-INIT] Administrador inicial não encontrado. Executando prisma/seed.ts..."
    );
    await runInstitutionalSeed({
      prismaClient: db,
      env,
      logger,
    });

    const createdAdmin = await findInitialAdmin(db, rawAdminEmail);
    if (!createdAdmin) {
      throw new Error(
        "[DB-INIT] O seed foi executado, mas o usuário administrador inicial não foi localizado após a operação."
      );
    }

    logger.log(
      "[DB-INIT] Inicialização automática concluída com sucesso (administrador, categorias e fontes oficiais criados)."
    );
    return {
      initialized: true,
      skipped: false,
      reason: "INITIALIZED",
    };
  } finally {
    if (ownsClient) {
      await db.$disconnect();
    }
  }
}

function isDirectCliExecution(relativeTsPath: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const normalizedEntry = path.resolve(entry);
  const targetSuffix = path.normalize(relativeTsPath);
  const targetNoExt = targetSuffix.replace(/\.ts$/, "");
  return (
    normalizedEntry.endsWith(`${path.sep}${targetSuffix}`) ||
    normalizedEntry.endsWith(`${path.sep}${targetNoExt}`)
  );
}

if (isDirectCliExecution("scripts/init-db-if-needed.ts")) {
  loadDotEnvIfNeeded();
  initializeDatabaseIfNeeded().catch((error) => {
    console.error(
      `[DB-INIT ERRO] Falha na inicialização automática do banco: ${sanitizeLogError(error)}`
    );
    process.exit(1);
  });
}
