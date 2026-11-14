import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeAdapterCollection } from "@/lib/collectors/runner";
import { validateCronSecretHeader } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authCheck = validateCronSecretHeader(request.headers.get("authorization"));

  if (!authCheck.authorized) {
    return NextResponse.json(
      { error: authCheck.reason || "Não autorizado." },
      { status: 401 }
    );
  }

  try {
    const adapters = await prisma.integrationAdapter.findMany({
      where: { source: { active: true } },
      select: { adapterKey: true },
    });

    const results = [];
    for (const adapter of adapters) {
      try {
        const result = await executeAdapterCollection(adapter.adapterKey, "CRON");
        results.push(result);
      } catch (err) {
        results.push({
          adapterKey: adapter.adapterKey,
          status: "ERROR",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      executedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    console.error("Erro no endpoint cron:", error);
    return NextResponse.json(
      { error: "Erro ao executar rotina de coleta." },
      { status: 500 }
    );
  }
}
