import { prisma } from "@/lib/prisma";
import { runImprensaOficialCollector } from "./imprensa-oficial-collector";
import { runPncpCollector } from "./pncp-collector";
import { runAvailabilityCollector } from "./availability-collector";
import { collectOfficialEditions } from "./official-editions";
import { CollectorResult } from "./types";

function parseCheckpointJson(raw?: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function buildAdapterErrorSummary(result: CollectorResult): string | null {
  if (result.status === "SUCCESS") return null;

  if (result.status === "PARTIAL") {
    const parts: string[] = [];
    if (result.outcome) parts.push(`resultado=${result.outcome}`);
    if ((result.itemsRejected ?? 0) > 0) {
      parts.push(`rejeitados=${result.itemsRejected}`);
    }
    if ((result.itemsPendingClassification ?? 0) > 0) {
      parts.push(`pendentes_orgao=${result.itemsPendingClassification}`);
    }
    if (result.hasPendingPages) {
      parts.push("há páginas pendentes salvas em checkpoint");
    }
    if (result.errorCount > 0) {
      parts.push(`erros=${result.errorCount}`);
    }
    return `Execução parcial (${parts.join(", ") || "verificar log"}). ${result.logText.slice(-600)}`.slice(
      0,
      1000
    );
  }

  return result.logText.slice(-1000);
}

export async function executeAdapterCollection(
  adapterKey: string,
  triggerType: "MANUAL" | "CRON" = "MANUAL",
  scheduledFor?: Date
) {
  const adapter = await prisma.integrationAdapter.findUnique({
    where: { adapterKey },
    include: { source: true },
  });

  if (!adapter) {
    throw new Error(`Adaptador "${adapterKey}" não encontrado.`);
  }

  const lastRunWithCheckpoint = await prisma.collectionRun.findFirst({
    where: {
      adapterId: adapter.id,
      checkpointJson: { not: null },
    },
    orderBy: { startedAt: "desc" },
    select: { checkpointJson: true },
  });

  const previousCheckpoint = parseCheckpointJson(
    lastRunWithCheckpoint?.checkpointJson
  );

  const startedAt = new Date();
  const staleBefore = new Date(startedAt.getTime() - 60 * 60_000);
  const run = await prisma.$transaction(async (tx) => {
    const claim = await tx.integrationAdapter.updateMany({
      where: {
        id: adapter.id,
        AND: [
          { OR: [{ status: { not: "RUNNING" } }, { lastRunAt: { lt: staleBefore } }, { lastRunAt: null }] },
          ...(scheduledFor ? [{ source: { active: true }, OR: [{ lastRunAt: null }, { lastRunAt: { lt: scheduledFor } }] }] : []),
        ],
      },
      data: { status: "RUNNING", lastRunAt: startedAt },
    });
    if (!claim.count) throw new Error("Coleta já iniciada para este adaptador.");
    await tx.collectionRun.updateMany({
      where: { adapterId: adapter.id, status: "RUNNING" },
      data: { status: "ERROR", finishedAt: startedAt, errorCount: 1, logText: "Execução anterior interrompida." },
    });
    return tx.collectionRun.create({ data: { adapterId: adapter.id, status: "RUNNING", triggerType, startedAt } });
  });

  const ctx = {
    adapterId: adapter.id,
    adapterKey: adapter.adapterKey,
    sourceId: adapter.source.id,
    sourceUrl: adapter.source.url,
    agencyId: adapter.source.agencyId,
    runId: run.id,
    previousCheckpoint,
  };

  let result: CollectorResult;

  try {
    switch (adapter.adapterKey) {
      case "imprensa-oficial-sjrp":
        const editions = await collectOfficialEditions();
        result = await runImprensaOficialCollector(ctx);
        result.itemsFound += editions.itemsFound;
        result.itemsProcessed += editions.itemsProcessed;
        result.itemsDuplicated += editions.itemsDuplicated;
        result.logText += "\n" + editions.logText;
        result.errorCount += editions.errorCount;
        if (editions.errorCount && result.status === "SUCCESS") result.status = "PARTIAL";
        break;
      case "pncp-api-sjrp":
        result = await runPncpCollector({
          ...ctx,
          configJson: adapter.configJson,
        });
        break;
      default:
        result = await runAvailabilityCollector(ctx);
        break;
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    result = {
      status: "ERROR",
      outcome: "FAILED",
      itemsFound: 0,
      itemsProcessed: 0,
      itemsDuplicated: 0,
      itemsRejected: 0,
      itemsPendingClassification: 0,
      hasPendingPages: false,
      errorCount: 1,
      logText: `Erro inesperado na execução do coletor: ${msg}`,
    };
  }

  const finishedAt = new Date();
  const inferredOutcome =
    result.outcome ||
    (result.status === "ERROR"
      ? "FAILED"
      : result.status === "PARTIAL"
        ? "PARTIAL_COMPLETION"
        : result.itemsFound === 0
          ? "NO_RECORDS"
          : result.itemsProcessed === 0 && result.itemsDuplicated > 0
            ? "DUPLICATES_ONLY"
            : "IMPORTED");

  const mergedCheckpoint: Record<string, unknown> = {
    ...(result.checkpoint || {}),
    outcome: inferredOutcome,
    itemsRejected: result.itemsRejected ?? 0,
    itemsPendingClassification: result.itemsPendingClassification ?? 0,
    rejectionBreakdown: result.rejectionBreakdown ?? {},
    hasPendingPages: Boolean(result.hasPendingPages),
  };

  await prisma.$transaction([
    prisma.collectionRun.updateMany({
      where: { id: run.id, status: "RUNNING" },
      data: {
        status: result.status,
        finishedAt,
        itemsFound: result.itemsFound,
        itemsProcessed: result.itemsProcessed,
        itemsDuplicated: result.itemsDuplicated,
        errorCount: result.errorCount,
        logText: result.logText,
        checkpointJson: JSON.stringify(mergedCheckpoint),
      },
    }),

    prisma.integrationAdapter.updateMany({
      where: { id: adapter.id, lastRunAt: startedAt, status: "RUNNING" },
      data: {
        status: result.status,
        lastSuccessAt: result.status === "SUCCESS" ? finishedAt : undefined,
        recordsCount: { increment: result.itemsProcessed },
        lastError: buildAdapterErrorSummary(result),
      },
    })
  ]);

  return { runId: run.id, adapterKey, ...result };
}
