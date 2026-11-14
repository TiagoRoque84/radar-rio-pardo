import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canPublishContent } from "@/lib/auth/session";
import { maskDocumentNumber } from "@/lib/privacy/lgpd-sanitizer";
import { recordAuditLog } from "@/lib/auth/audit";

const decimalRegex = /^\d+(\.\d{1,2})?$/;

const biddingSchema = z.object({
  agencyId: z.string().min(1),
  processNumber: z.string().min(2).max(80),
  modality: z.string().min(2).max(120),
  objectDescription: z.string().min(10).max(4000),
  status: z.string().min(2).max(80),
  publicationDate: z.string().optional().nullable(),
  estimatedValue: z
    .string()
    .regex(decimalRegex)
    .optional()
    .or(z.literal(""))
    .nullable(),
  officialUrl: z.string().url(),
});

const contractSchema = z.object({
  agencyId: z.string().min(1),
  contractNumber: z.string().min(2).max(80),
  supplierName: z.string().min(2).max(250),
  supplierDocument: z.string().min(11).max(20),
  objectDescription: z.string().min(10).max(4000),
  signatureDate: z.string().optional().nullable(),
  contractedValue: z
    .string()
    .regex(decimalRegex)
    .optional()
    .or(z.literal(""))
    .nullable(),
  committedValue: z
    .string()
    .regex(decimalRegex)
    .optional()
    .or(z.literal(""))
    .nullable(),
  liquidatedValue: z
    .string()
    .regex(decimalRegex)
    .optional()
    .or(z.literal(""))
    .nullable(),
  paidValue: z
    .string()
    .regex(decimalRegex)
    .optional()
    .or(z.literal(""))
    .nullable(),
  status: z.string().min(2).max(80),
  officialUrl: z.string().url(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const [biddings, contracts, agencies] = await Promise.all([
    prisma.biddingProcess.findMany({
      include: { agency: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.publicContract.findMany({
      include: { agency: true, supplier: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.publicAgency.findMany({ orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({ biddings, contracts, agencies });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !canPublishContent(user.role)) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  try {
    const body = await request.json();

    if (body.action === "CREATE_BIDDING") {
      const parsed = biddingSchema.safeParse(body.payload);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Dados inválidos." },
          { status: 400 }
        );
      }

      const bidding = await prisma.biddingProcess.create({
        data: {
          agencyId: parsed.data.agencyId,
          processNumber: parsed.data.processNumber,
          modality: parsed.data.modality,
          objectDescription: parsed.data.objectDescription,
          status: parsed.data.status,
          publicationDate: parsed.data.publicationDate
            ? new Date(parsed.data.publicationDate)
            : null,
          estimatedValue: parsed.data.estimatedValue || null,
          officialUrl: parsed.data.officialUrl,
        },
      });

      await recordAuditLog({
        userId: user.id,
        action: "BIDDING_CREATE",
        entityType: "BiddingProcess",
        entityId: bidding.id,
      });

      return NextResponse.json({ bidding }, { status: 201 });
    }

    if (body.action === "CREATE_CONTRACT") {
      const parsed = contractSchema.safeParse(body.payload);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Dados inválidos." },
          { status: 400 }
        );
      }

      const d = parsed.data;
      const digits = d.supplierDocument.replace(/\D/g, "");
      const docType = digits.length === 14 ? "CNPJ" : "CPF_MASKED";
      const docMasked = maskDocumentNumber(d.supplierDocument);

      const supplier = await prisma.supplier.upsert({
        where: { documentMasked: docMasked },
        update: { name: d.supplierName },
        create: {
          name: d.supplierName,
          documentType: docType,
          documentMasked: docMasked,
        },
      });

      const contract = await prisma.publicContract.create({
        data: {
          agencyId: d.agencyId,
          supplierId: supplier.id,
          contractNumber: d.contractNumber,
          objectDescription: d.objectDescription,
          signatureDate: d.signatureDate ? new Date(d.signatureDate) : null,
          contractedValue: d.contractedValue || null,
          committedValue: d.committedValue || null,
          liquidatedValue: d.liquidatedValue || null,
          paidValue: d.paidValue || null,
          status: d.status,
          officialUrl: d.officialUrl,
        },
      });

      await recordAuditLog({
        userId: user.id,
        action: "CONTRACT_CREATE",
        entityType: "PublicContract",
        entityId: contract.id,
      });

      return NextResponse.json({ contract }, { status: 201 });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("Erro em Contas Públicas:", error);
    return NextResponse.json(
      { error: "Erro ao salvar registro financeiro." },
      { status: 500 }
    );
  }
}
