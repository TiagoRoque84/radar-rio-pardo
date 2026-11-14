import { prisma } from "../src/lib/prisma";
import { executeAdapterCollection } from "../src/lib/collectors/runner";

async function main() {
  const targetKey = process.argv[2];
  console.log("[Radar Rio Pardo] Iniciando rotina de coleta programada (Cron)...");

  const adapters = await prisma.integrationAdapter.findMany({
    where: targetKey
      ? { adapterKey: targetKey }
      : { source: { active: true } },
  });

  for (const adapter of adapters) {
    try {
      console.log(`Executando adaptador: ${adapter.adapterKey}`);
      const res = await executeAdapterCollection(adapter.adapterKey, "CRON");
      console.log(
        ` -> Status: ${res.status} | Encontrados: ${res.itemsFound} | Novos: ${res.itemsProcessed} | Duplicados: ${res.itemsDuplicated}`
      );
    } catch (error) {
      console.error(` -> Erro em ${adapter.adapterKey}:`, error);
    }
  }
}

main()
  .catch((err) => {
    console.error("Falha na execução do script de coleta:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
