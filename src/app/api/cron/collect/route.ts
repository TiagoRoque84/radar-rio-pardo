import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { executeAdapterCollection } from "@/lib/collectors/runner";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();

  if (!configuredSecret || !token || token !== configuredSecret) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
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
