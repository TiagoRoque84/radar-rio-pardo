import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canManageAdminSettings } from "@/lib/auth/session";
import { officialSourceSchema } from "@/lib/validators";
import { recordAuditLog } from "@/lib/auth/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const [sources, adapters, runs, agencies] = await Promise.all([
    prisma.officialSource.findMany({
      include: { agency: true },
      orderBy: { name: "asc" },
    }),
    prisma.integrationAdapter.findMany({
      include: { source: true },
      orderBy: { name: "asc" },
    }),
    prisma.collectionRun.findMany({
      include: { adapter: true },
      orderBy: { startedAt: "desc" },
      take: 25,
    }),
    prisma.publicAgency.findMany({ orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({ sources, adapters, runs, agencies });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageAdminSettings(user.role)) {
    return NextResponse.json(
      { error: "Apenas Administradores podem cadastrar fontes oficiais." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = officialSourceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos." },
        { status: 400 }
      );
    }

    const source = await prisma.officialSource.create({
      data: parsed.data,
    });

    await recordAuditLog({
      userId: user.id,
      action: "OFFICIAL_SOURCE_CREATE",
      entityType: "OfficialSource",
      entityId: source.id,
    });

    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    console.error("Erro ao cadastrar fonte oficial:", error);
    return NextResponse.json(
      { error: "Erro ao salvar fonte oficial." },
      { status: 500 }
    );
  }
}
