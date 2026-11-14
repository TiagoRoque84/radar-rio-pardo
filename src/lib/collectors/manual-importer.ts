import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { computeContentHash } from "./types";
import { detectAndMaskPersonalData } from "@/lib/privacy/lgpd-sanitizer";

const gazetteImportItemSchema = z.object({
  actNumber: z.string().optional().nullable(),
  categorySlug: z.string().default("outros-atos"),
  titleSimple: z.string().min(5).max(350),
  objectiveSummary: z.string().min(15),
  rawExcerpt: z.string().optional().nullable(),
  pageNumber: z.coerce.number().int().positive().optional().nullable(),
  financialValue: z.string().optional().nullable(),
  financialType: z
    .enum(["ESTIMATED", "CONTRACTED", "PAID", "NONE"])
    .optional()
    .nullable(),
  deadlinesText: z.string().optional().nullable(),
  practicalImpact: z.string().optional().nullable(),
  officialUrl: z.string().url().optional(),
});

export const gazetteBatchImportSchema = z.object({
  editionNumber: z.string().min(1),
  publicationDate: z.string().min(4),
  officialUrl: z.string().url(),
  summaryText: z.string().optional().nullable(),
  acts: z.array(gazetteImportItemSchema).min(1),
});

export async function importGazetteBatch(
  input: z.infer<typeof gazetteBatchImportSchema>
) {
  const pubDate = new Date(input.publicationDate);
  if (Number.isNaN(pubDate.getTime())) {
    throw new Error("Data da publicação inválida.");
  }

  const year = pubDate.getUTCFullYear();
  const month = pubDate.getUTCMonth() + 1;

  const agency = await prisma.publicAgency.findFirst({
    where: { acronym: "PMSJRP" },
  });

  const edition = await prisma.gazetteEdition.upsert({
    where: {
      editionNumber_year: {
        editionNumber: input.editionNumber,
        year,
      },
    },
    update: {
      officialUrl: input.officialUrl,
      summaryText: input.summaryText ?? undefined,
    },
    create: {
      editionNumber: input.editionNumber,
      publicationDate: pubDate,
      year,
      month,
      officialUrl: input.officialUrl,
      summaryText: input.summaryText ?? null,
      agencyId: agency?.id ?? null,
      status: "PENDING_REVIEW",
    },
  });

  let createdCount = 0;
  let duplicatedCount = 0;
  let lgpdAlertsCount = 0;

  const fallbackCategory = await prisma.gazetteActCategory.findFirst({
    where: { slug: "outros-atos" },
  });

  for (const act of input.acts) {
    const hash = computeContentHash(
      `${edition.id}:${act.actNumber || ""}:${act.titleSimple}:${act.objectiveSummary}`
    );

    const exists = await prisma.gazetteAct.findUnique({
      where: { contentHash: hash },
    });

    if (exists) {
      duplicatedCount += 1;
      continue;
    }

    const cat =
      (await prisma.gazetteActCategory.findUnique({
        where: { slug: act.categorySlug },
      })) ?? fallbackCategory;

    if (!cat) {
      throw new Error("Categorias do Diário Oficial não inicializadas no banco.");
    }

    const lgpdSummary = detectAndMaskPersonalData(act.objectiveSummary);
    const lgpdExcerpt = act.rawExcerpt
      ? detectAndMaskPersonalData(act.rawExcerpt)
      : null;

    const hasPersonalData =
      lgpdSummary.hasPersonalData || Boolean(lgpdExcerpt?.hasPersonalData);
    if (hasPersonalData) lgpdAlertsCount += 1;

    await prisma.gazetteAct.create({
      data: {
        editionId: edition.id,
        categoryId: cat.id,
        agencyId: agency?.id ?? null,
        actNumber: act.actNumber ?? null,
        actDate: pubDate,
        pageNumber: act.pageNumber ?? null,
        titleSimple: act.titleSimple,
        objectiveSummary: lgpdSummary.sanitizedText,
        rawExcerpt: lgpdExcerpt ? lgpdExcerpt.sanitizedText : null,
        financialValue:
          act.financialValue && /^\d+(\.\d{1,2})?$/.test(act.financialValue)
            ? act.financialValue
            : null,
        financialType: act.financialType ?? "NONE",
        deadlinesText: act.deadlinesText ?? null,
        practicalImpact: act.practicalImpact ?? null,
        officialUrl: act.officialUrl || input.officialUrl,
        contentHash: hash,
        status: "IN_REVIEW",
        hasPersonalDataAlert: hasPersonalData,
      },
    });
    createdCount += 1;
  }

  const totalActs = await prisma.gazetteAct.count({
    where: { editionId: edition.id },
  });
  await prisma.gazetteEdition.update({
    where: { id: edition.id },
    data: { totalActs },
  });

  return {
    editionId: edition.id,
    createdCount,
    duplicatedCount,
    lgpdAlertsCount,
  };
}
