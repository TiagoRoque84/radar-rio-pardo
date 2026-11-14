import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canPublishContent } from "@/lib/auth/session";
import { slugify } from "@/lib/formatters";
import { PROPOSITION_TYPES } from "@/lib/validators";
import { recordAuditLog } from "@/lib/auth/audit";

const councilorSchema = z.object({
  legislatureId: z.string().min(1),
  fullName: z.string().min(3).max(200),
  parliamentaryName: z.string().min(2).max(160),
  partyAcronym: z.string().max(40).optional().nullable(),
  roleInBoard: z.string().max(120).optional().nullable(),
  officialProfileUrl: z.string().url().optional().or(z.literal("")).nullable(),
});

const propositionSchema = z.object({
  number: z.string().min(1).max(60),
  year: z.coerce.number().int().min(1990).max(2100),
  type: z.enum(PROPOSITION_TYPES),
  summary: z.string().min(10).max(4000),
  authorId: z.string().optional().nullable(),
  presentationDate: z.string().optional().nullable(),
  status: z.string().min(2).max(80).default("EM_TRAMITACAO"),
  tramitationText: z.string().max(3000).optional().nullable(),
  officialUrl: z.string().url(),
});

const sessionSchema = z.object({
  sessionNumber: z.string().min(1).max(60),
  sessionDate: z.string().min(4),
  sessionType: z
    .enum(["ORDINARIA", "EXTRAORDINARIA", "SOLENE"])
    .default("ORDINARIA"),
  officialUrl: z.string().url().optional().or(z.literal("")).nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const [legislatures, councilors, propositions, sessions] = await Promise.all([
    prisma.legislature.findMany({ orderBy: { startYear: "desc" } }),
    prisma.councilor.findMany({
      include: { legislature: true },
      orderBy: { parliamentaryName: "asc" },
    }),
    prisma.legislativeProposition.findMany({
      include: { author: true },
      orderBy: [{ year: "desc" }, { lastUpdated: "desc" }],
      take: 40,
    }),
    prisma.chamberSession.findMany({
      orderBy: { sessionDate: "desc" },
      take: 25,
    }),
  ]);

  return NextResponse.json({ legislatures, councilors, propositions, sessions });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canPublishContent(user.role)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  try {
    const body = await request.json();

    if (body.action === "CREATE_COUNCILOR") {
      const parsed = councilorSchema.safeParse(body.payload);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Dados inválidos." },
          { status: 400 }
        );
      }

      const baseSlug = slugify(parsed.data.parliamentaryName);
      const councilor = await prisma.councilor.create({
        data: {
          ...parsed.data,
          slug: `${baseSlug}-${Date.now().toString(36).slice(-4)}`,
          officialProfileUrl: parsed.data.officialProfileUrl || null,
        },
      });

      await recordAuditLog({
        userId: user.id,
        action: "CHAMBER_COUNCILOR_CREATE",
        entityType: "Councilor",
        entityId: councilor.id,
      });

      return NextResponse.json({ councilor }, { status: 201 });
    }

    if (body.action === "CREATE_PROPOSITION") {
      const parsed = propositionSchema.safeParse(body.payload);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Dados inválidos." },
          { status: 400 }
        );
      }

      const proposition = await prisma.legislativeProposition.create({
        data: {
          number: parsed.data.number,
          year: parsed.data.year,
          type: parsed.data.type,
          summary: parsed.data.summary,
          authorId: parsed.data.authorId || null,
          presentationDate: parsed.data.presentationDate
            ? new Date(parsed.data.presentationDate)
            : null,
          status: parsed.data.status,
          tramitationText: parsed.data.tramitationText || null,
          officialUrl: parsed.data.officialUrl,
        },
      });

      await recordAuditLog({
        userId: user.id,
        action: "CHAMBER_PROPOSITION_CREATE",
        entityType: "LegislativeProposition",
        entityId: proposition.id,
      });

      return NextResponse.json({ proposition }, { status: 201 });
    }

    if (body.action === "CREATE_SESSION") {
      const parsed = sessionSchema.safeParse(body.payload);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Dados inválidos." },
          { status: 400 }
        );
      }

      const session = await prisma.chamberSession.create({
        data: {
          sessionNumber: parsed.data.sessionNumber,
          sessionDate: new Date(parsed.data.sessionDate),
          sessionType: parsed.data.sessionType,
          officialUrl: parsed.data.officialUrl || null,
          notes: parsed.data.notes || null,
        },
      });

      await recordAuditLog({
        userId: user.id,
        action: "CHAMBER_SESSION_CREATE",
        entityType: "ChamberSession",
        entityId: session.id,
      });

      return NextResponse.json({ session }, { status: 201 });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("Erro na API da Câmara:", error);
    return NextResponse.json(
      { error: "Erro ao salvar registro legislativo." },
      { status: 500 }
    );
  }
}
