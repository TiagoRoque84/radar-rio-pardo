import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
const root = process.cwd();
const schemaPath = path.join(root, "prisma", "schema.prisma");
const mysqlSchemaPath = path.join(root, "prisma", "schema.mysql.prisma");
const sqliteBackupPath = path.join(root, "prisma", "schema.sqlite.prisma");

if (!["mysql", "sqlite"].includes(target)) {
  console.error("Uso: node scripts/switch-db-provider.mjs <mysql|sqlite>");
  process.exit(1);
}

if (target === "mysql") {
  const current = fs.readFileSync(schemaPath, "utf8");
  if (current.includes('provider = "sqlite"')) {
    fs.writeFileSync(sqliteBackupPath, current, "utf8");
  }
  const mysqlContent = fs.readFileSync(mysqlSchemaPath, "utf8");
  fs.writeFileSync(schemaPath, mysqlContent, "utf8");
  console.log("[Radar Rio Pardo] prisma/schema.prisma atualizado para MySQL (Hostinger).");
} else {
  if (fs.existsSync(sqliteBackupPath)) {
    fs.copyFileSync(sqliteBackupPath, schemaPath);
  } else {
    const content = fs.readFileSync(schemaPath, "utf8");
    fs.writeFileSync(
      schemaPath,
      content.replace('provider = "mysql"', 'provider = "sqlite"'),
      "utf8"
    );
  }
  console.log("[Radar Rio Pardo] prisma/schema.prisma atualizado para SQLite (local).");
}
