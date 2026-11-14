import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canManageAdminSettings } from "@/lib/auth/session";
import { sponsorSchema } from "@/lib/validators";
import { recordAuditLog } from "@/lib/auth/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const sponsors = await prisma.sponsorAdvertiser.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ sponsors });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canManageAdminSettings(user.role)) {
    return NextResponse.json(
      { error: "Apenas Administradores podem gerenciar publicidade." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const parsed = sponsorSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Dados inválidos." },
        { status: 400 }
      );
    }

    const d = parsed.data;
    const sponsor = await prisma.sponsorAdvertiser.create({
      data: {
        companyName: d.companyName,
        cnpj: d.cnpj || null,
        contactEmail: d.contactEmail || null,
        startDate: new Date(d.startDate),
        endDate: new Date(d.endDate),
        destinationUrl: d.destinationUrl,
        bannerImageUrl: d.bannerImageUrl || null,
        placement: d.placement,
        active: d.active,
        publicTransparencyNote: d.publicTransparencyNote || null,
      },
    });

    await recordAuditLog({
      userId: user.id,
      action: "SPONSOR_CREATE",
      entityType: "SponsorAdvertiser",
      entityId: sponsor.id,
    });

    return NextResponse.json({ sponsor }, { status: 201 });
  } catch (error) {
    console.error("Erro ao cadastrar anunciante:", error);
    return NextResponse.json(
      { error: "Erro ao salvar anunciante." },
      { status: 500 }
    );
  }
}
