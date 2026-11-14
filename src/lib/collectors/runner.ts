import { prisma } from "@/lib/prisma";
import { runImprensaOficialCollector } from "./imprensa-oficial-collector";
import { runPncpCollector } from "./pncp-collector";
import { runAvailabilityCollector } from "./availability-collector";
import { CollectorResult } from "./types";

export async function executeAdapterCollection(
  adapterKey: string,
  triggerType: "MANUAL" | "CRON" = "MANUAL"
) {
  const adapter = await prisma.integrationAdapter.findUnique({
    where: { adapterKey },
    include: { source: true },
  });

  if (!adapter) {
    throw new Error(`Adaptador "${adapterKey}" não encontrado.`);
  }

  if (adapter.status === "RUNNING") {
    throw new Error(
      `O adaptador "${adapter.name}" já está em execução. Aguarde a conclusão para evitar conflitos.`
    );
  }

  await prisma.integrationAdapter.update({
    where: { id: adapter.id },
    data: { status: "RUNNING", lastRunAt: new Date() },
  });

  const run = await prisma.collectionRun.create({
    data: {
      adapterId: adapter.id,
      status: "RUNNING",
      triggerType,
    },
  });

  const ctx = {
    adapterId: adapter.id,
    adapterKey: adapter.adapterKey,
    sourceId: adapter.source.id,
    sourceUrl: adapter.source.url,
    agencyId: adapter.source.agencyId,
    runId: run.id,
  };

  let result: CollectorResult;

  try {
    switch (adapter.adapterKey) {
      case "imprensa-oficial-sjrp":
        result = await runImprensaOficialCollector(ctx);
        break;
      case "pncp-api-sjrp":
        result = await runPncpCollector(ctx);
        break;
      default:
        result = await runAvailabilityCollector(ctx);
        break;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result = {
      status: "ERROR",
      itemsFound: 0,
      itemsProcessed: 0,
      itemsDuplicated: 0,
      errorCount: 1,
      logText: `Erro inesperado na execução do coletor: ${msg}`,
    };
  }

  const finishedAt = new Date();

  await prisma.collectionRun.update({
    where: { id: run.id },
    data: {
      status: result.status,
      finishedAt,
      itemsFound: result.itemsFound,
      itemsProcessed: result.itemsProcessed,
      itemsDuplicated: result.itemsDuplicated,
      errorCount: result.errorCount,
      logText: result.logText,
      checkpointJson: result.checkpoint
        ? JSON.stringify(result.checkpoint)
        : null,
    },
  });

  await prisma.integrationAdapter.update({
    where: { id: adapter.id },
    data: {
      status: result.status === "ERROR" ? "ERROR" : "SUCCESS",
      lastSuccessAt: result.status === "ERROR" ? undefined : finishedAt,
      recordsCount: { increment: result.itemsProcessed },
      lastError: result.status === "ERROR" ? result.logText.slice(-1000) : null,
    },
  });

  return { runId: run.id, adapterKey, ...result };
}
