import { CronExpressionParser } from "cron-parser";
import { prisma } from "@/lib/prisma";
import { executeAdapterCollection } from "./runner";

export function startCollectionScheduler() {
  const state = globalThis as typeof globalThis & { radarSchedulerStarted?: boolean };
  if (state.radarSchedulerStarted) return;
  state.radarSchedulerStarted = true;

  async function tick() {
    try {
      const adapters = await prisma.integrationAdapter.findMany({
        where: { source: { active: true } },
        select: { adapterKey: true, frequencyCron: true, lastRunAt: true },
      });
      for (const adapter of adapters) {
        try {
          const due = CronExpressionParser.parse(adapter.frequencyCron, {
            tz: "America/Sao_Paulo", currentDate: new Date(Date.now() + 1),
          }).prev().toDate();
          if (!adapter.lastRunAt || adapter.lastRunAt < due) {
            await executeAdapterCollection(adapter.adapterKey, "CRON", due);
          }
        } catch (error) {
          console.error("Falha ao agendar coleta", adapter.adapterKey, error instanceof Error ? error.message : error);
        }
      }
    } catch (error) {
      console.error("Falha ao consultar agenda de coletas", error);
    } finally {
      setTimeout(tick, 60_000).unref();
    }
  }
  setTimeout(tick, 1000).unref();
}
