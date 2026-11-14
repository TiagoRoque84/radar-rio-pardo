import { z } from "zod";

export const ARTICLE_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "ARCHIVED",
] as const;

export const REQUEST_TYPES = [
  "CORRECTION",
  "CONTESTATION",
  "RIGHT_OF_REPLY",
  "PROBLEM_REPORT",
  "LGPD_REMOVAL",
] as const;

export const PROPOSITION_TYPES = [
  "PROJETO_LEI",
  "PROJETO_DECRETO",
  "PROJETO_RESOLUCAO",
  "REQUERIMENTO",
  "INDICACAO",
  "MOCAO",
  "EMENDA",
] as const;

export const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido.").max(190),
  password: z.string().min(6, "Senha inválida.").max(200),
});

export const documentReferenceSchema = z.object({
  sourceName: z.string().min(2, "Nome da fonte é obrigatório.").max(250),
  officialUrl: z
    .string()
    .url("Informe uma URL oficial válida (http:// ou https://).")
    .refine(
      (url) => url.startsWith("http://") || url.startsWith("https://"),
      "A URL da fonte deve usar protocolo HTTP ou HTTPS."
    ),
  documentDate: z.string().optional().nullable(),
  referenceCode: z.string().max(120).optional().nullable(),
  pageOrSection: z.string().max(120).optional().nullable(),
});

export const newsArticleSchema = z.object({
  title: z
    .string()
    .min(5, "O título deve ter pelo menos 5 caracteres.")
    .max(300),
  subtitle: z.string().max(400).optional().nullable(),
  summary: z
    .string()
    .min(15, "O resumo deve ter pelo menos 15 caracteres.")
    .max(2000),
  content: z
    .string()
    .min(30, "O conteúdo deve ter pelo menos 30 caracteres."),
  categoryId: z.string().min(1, "Selecione uma categoria."),
  tags: z.array(z.string().max(60)).optional().default([]),
  coverImageUrl: z
    .string()
    .url("URL de imagem inválida.")
    .optional()
    .or(z.literal(""))
    .nullable(),
  status: z.enum(ARTICLE_STATUSES).default("DRAFT"),
  featured: z.boolean().default(false),
  isPublicUtilityAlert: z.boolean().default(false),
  aiUsed: z.boolean().default(false),
  aiDisclosure: z.string().max(1000).optional().nullable(),
  correctionNotice: z.string().max(2000).optional().nullable(),
  scheduledFor: z.string().optional().nullable(),
  references: z.array(documentReferenceSchema).optional().default([]),
});

export const gazetteEditionSchema = z.object({
  editionNumber: z.string().min(1, "Número da edição é obrigatório.").max(60),
  publicationDate: z.string().min(4, "Data da publicação é obrigatória."),
  officialUrl: z.string().url("Informe a URL oficial da edição."),
  agencyId: z.string().optional().nullable(),
  summaryText: z.string().max(5000).optional().nullable(),
});

export const gazetteActSchema = z.object({
  editionId: z.string().min(1, "Selecione a edição do Diário Oficial."),
  categoryId: z.string().min(1, "Selecione a categoria do ato."),
  agencyId: z.string().optional().nullable(),
  actNumber: z.string().max(80).optional().nullable(),
  actDate: z.string().optional().nullable(),
  pageNumber: z.coerce.number().int().positive().optional().nullable(),
  titleSimple: z
    .string()
    .min(5, "O título em linguagem simples é obrigatório.")
    .max(350),
  objectiveSummary: z
    .string()
    .min(15, "A explicação objetiva é obrigatória.")
    .max(5000),
  rawExcerpt: z.string().optional().nullable(),
  financialValue: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Valor financeiro inválido (use ponto, ex: 1500.00).")
    .optional()
    .or(z.literal(""))
    .nullable(),
  financialType: z
    .enum(["ESTIMATED", "CONTRACTED", "PAID", "NONE"])
    .optional()
    .nullable(),
  deadlinesText: z.string().max(1000).optional().nullable(),
  practicalImpact: z.string().max(2000).optional().nullable(),
  officialUrl: z.string().url("Informe a URL oficial do documento."),
  status: z.enum(ARTICLE_STATUSES).default("IN_REVIEW"),
  aiGenerated: z.boolean().default(false),
  aiModel: z.string().max(100).optional().nullable(),
});

export const correctionRequestSchema = z.object({
  requesterName: z
    .string()
    .min(3, "Informe seu nome completo.")
    .max(180),
  requesterEmail: z.string().email("Informe um e-mail válido.").max(190),
  requestType: z.enum(REQUEST_TYPES),
  targetUrl: z.string().max(700).optional().nullable(),
  articleId: z.string().optional().nullable(),
  actId: z.string().optional().nullable(),
  description: z
    .string()
    .min(20, "Descreva detalhadamente a solicitação (mínimo 20 caracteres).")
    .max(5000),
});

export const officialSourceSchema = z.object({
  agencyId: z.string().min(1, "Selecione o órgão público."),
  name: z.string().min(3).max(220),
  slug: z.string().min(3).max(120),
  url: z.string().url("Informe uma URL oficial válida."),
  sourceType: z.enum([
    "DIARIO_OFICIAL",
    "API_PUBLICA",
    "PORTAL_CAMARA",
    "TRANSPARENCIA",
    "OUTRO",
  ]),
  termsNotes: z.string().max(2000).optional().nullable(),
  validationMethod: z.string().max(2000).optional().nullable(),
  active: z.boolean().default(true),
});

export const podcastEpisodeSchema = z.object({
  programId: z.string().min(1, "Selecione o programa."),
  episodeNumber: z.coerce.number().int().positive(),
  title: z.string().min(5).max(250),
  description: z.string().min(15).max(4000),
  audioUrl: z.string().url().optional().or(z.literal("")).nullable(),
  durationSeconds: z.coerce.number().int().nonnegative().optional().nullable(),
  status: z.enum(["DRAFT", "APPROVED", "PUBLISHED"]).default("DRAFT"),
  syntheticVoiceNotice: z
    .string()
    .min(10)
    .max(1000)
    .default("Episódio gerado com vozes sintéticas e revisão editorial humana."),
  scriptMarkdown: z.string().optional().nullable(),
  notebookLmPrompt: z.string().optional().nullable(),
  sources: z
    .array(z.object({ title: z.string(), url: z.string() }))
    .optional()
    .default([]),
  allowDownload: z.boolean().default(false),
});

export const sponsorSchema = z.object({
  companyName: z.string().min(2).max(220),
  cnpj: z.string().max(20).optional().nullable(),
  contactEmail: z.string().email().optional().or(z.literal("")).nullable(),
  startDate: z.string().min(4),
  endDate: z.string().min(4),
  destinationUrl: z.string().url(),
  bannerImageUrl: z.string().url().optional().or(z.literal("")).nullable(),
  placement: z.enum(["HOMEPAGE", "NEWS", "GAZETTE", "PODCAST"]).default("HOMEPAGE"),
  active: z.boolean().default(false),
  publicTransparencyNote: z.string().max(1000).optional().nullable(),
});
