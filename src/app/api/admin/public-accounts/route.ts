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

const classifyPendingSchema = z.object({
  documentId: z.string().min(1),
  agencyId: z.string().min(1),
});

const rejectPendingSchema = z.object({
  documentId: z.string().min(1),
  reason: z.string().max(400).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const [biddings, contracts, agencies, pendingClassifications] =
    await Promise.all([
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
      prisma.publicAgency.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      }),
      prisma.importedDocument.findMany({
        where: { extractionStatus: "PENDING_CLASSIFICATION" },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

  return NextResponse.json({
    biddings,
    contracts,
    agencies,
    pendingClassifications,
  });
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

    if (body.action === "CLASSIFY_PNCP_DOCUMENT") {
      const parsed = classifyPendingSchema.safeParse(body.payload);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Informe o documento e o órgão público oficial." },
          { status: 400 }
        );
      }

      const [doc, agency] = await Promise.all([
        prisma.importedDocument.findUnique({
          where: { id: parsed.data.documentId },
        }),
        prisma.publicAgency.findUnique({
          where: { id: parsed.data.agencyId },
        }),
      ]);

      if (!doc || doc.extractionStatus !== "PENDING_CLASSIFICATION") {
        return NextResponse.json(
          { error: "Registro pendente não encontrado ou já classificado." },
          { status: 404 }
        );
      }

      if (!agency || !agency.active) {
        return NextResponse.json(
          { error: "Órgão público selecionado é inválido ou está inativo." },
          { status: 400 }
        );
      }

      let meta: Record<string, unknown> = {};
      try {
        meta = doc.rawText ? JSON.parse(doc.rawText) : {};
      } catch {
        return NextResponse.json(
          { error: "Metadados originais do PNCP corrompidos neste registro." },
          { status: 400 }
        );
      }

      const pncpId =
        typeof meta.pncpId === "string" && meta.pncpId
          ? meta.pncpId
          : doc.externalId || doc.id;
      const processNumber =
        typeof meta.processNumber === "string" && meta.processNumber
          ? meta.processNumber
          : pncpId;
      const modality =
        typeof meta.modality === "string" && meta.modality
          ? meta.modality
          : "Licitação PNCP";
      const baseObject =
        typeof meta.objectDescription === "string" && meta.objectDescription
          ? meta.objectDescription
          : "Objeto informado no documento oficial do PNCP.";
      const organLabel =
        typeof meta.organName === "string" && meta.organName
          ? meta.organName
          : doc.title;
      const unitLabel =
        typeof meta.unitName === "string" && meta.unitName
          ? ` (Unidade: ${meta.unitName} — ${organLabel})`
          : ` (Órgão PNCP: ${organLabel})`;
      const statusLabel =
        typeof meta.status === "string" && meta.status
          ? meta.status
          : "Publicada";
      const pubDate =
        typeof meta.publicationDate === "string" && meta.publicationDate
          ? new Date(meta.publicationDate)
          : null;
      const openDate =
        typeof meta.openingDate === "string" && meta.openingDate
          ? new Date(meta.openingDate)
          : null;
      const estimatedValue =
        typeof meta.estimatedValue === "string" &&
        decimalRegex.test(meta.estimatedValue)
          ? meta.estimatedValue
          : null;
      const officialUrl =
        typeof meta.officialUrl === "string" && meta.officialUrl.startsWith("http")
          ? meta.officialUrl
          : doc.originalUrl;

      const existingBidding = await prisma.biddingProcess.findFirst({
        where: {
          OR: [{ pncpId }, { agencyId: agency.id, processNumber }],
        },
      });

      const bidding = existingBidding
        ? existingBidding
        : await prisma.biddingProcess.create({
            data: {
              agencyId: agency.id,
              processNumber: processNumber.slice(0, 78),
              modality: modality.slice(0, 118),
              objectDescription: `${baseObject}${unitLabel}`,
              status: statusLabel.slice(0, 78),
              publicationDate:
                pubDate && !Number.isNaN(pubDate.getTime()) ? pubDate : null,
              openingDate:
                openDate && !Number.isNaN(openDate.getTime()) ? openDate : null,
              estimatedValue,
              officialUrl: officialUrl.slice(0, 690),
              pncpId,
            },
          });

      await prisma.importedDocument.update({
        where: { id: doc.id },
        data: { extractionStatus: "CLASSIFIED" },
      });

      await recordAuditLog({
        userId: user.id,
        action: "PNCP_BIDDING_CLASSIFIED",
        entityType: "ImportedDocument",
        entityId: doc.id,
        details: {
          biddingId: bidding.id,
          agencyId: agency.id,
          agencyName: agency.name,
          pncpId,
        },
      });

      return NextResponse.json({ ok: true, bidding });
    }

    if (body.action === "REJECT_PNCP_DOCUMENT") {
      const parsed = rejectPendingSchema.safeParse(body.payload);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "Informe o identificador do documento." },
          { status: 400 }
        );
      }

      const doc = await prisma.importedDocument.findUnique({
        where: { id: parsed.data.documentId },
      });

      if (!doc || doc.extractionStatus !== "PENDING_CLASSIFICATION") {
        return NextResponse.json(
          { error: "Registro pendente não encontrado." },
          { status: 404 }
        );
      }

      await prisma.importedDocument.update({
        where: { id: doc.id },
        data: { extractionStatus: "REJECTED" },
      });

      await recordAuditLog({
        userId: user.id,
        action: "PNCP_BIDDING_REJECTED",
        entityType: "ImportedDocument",
        entityId: doc.id,
        details: { reason: parsed.data.reason || "Descartado na revisão editorial." },
      });

      return NextResponse.json({ ok: true });
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
