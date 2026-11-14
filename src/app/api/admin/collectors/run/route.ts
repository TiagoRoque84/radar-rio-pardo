import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, canManageAdminSettings } from "@/lib/auth/session";
import { executeAdapterCollection } from "@/lib/collectors/runner";
import { recordAuditLog } from "@/lib/auth/audit";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageAdminSettings(user.role)) {
    return NextResponse.json(
      { error: "Apenas Administradores podem disparar coletores manualmente." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const adapterKey = String(body.adapterKey || "").trim();
    if (!adapterKey) {
      return NextResponse.json(
        { error: "Informe o adapterKey para execução." },
        { status: 400 }
      );
    }

    const result = await executeAdapterCollection(adapterKey, "MANUAL");

    await recordAuditLog({
      userId: user.id,
      action: "COLLECTOR_MANUAL_RUN",
      entityType: "IntegrationAdapter",
      entityId: adapterKey,
      details: {
        status: result.status,
        itemsFound: result.itemsFound,
        itemsProcessed: result.itemsProcessed,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao executar coletor.",
      },
      { status: 500 }
    );
  }
}
