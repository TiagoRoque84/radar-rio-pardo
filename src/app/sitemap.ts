import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://radar.roqueconsultoriadigital.com.br";

  const staticRoutes = [
    "",
    "/noticias",
    "/diario-oficial",
    "/camara",
    "/contas-publicas",
    "/podcasts",
    "/sobre",
    "/politica-editorial",
    "/metodologia",
    "/correcao",
    "/privacidade",
    "/termos",
    "/contato",
  ].map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
  }));

  try {
    const articles = await prisma.newsArticle.findMany({
      where: { status: "PUBLISHED", deletedAt: null },
      select: { slug: true, updatedAt: true },
      take: 200,
    });

    const articleRoutes = articles.map((article) => ({
      url: `${baseUrl}/noticias/${article.slug}`,
      lastModified: article.updatedAt,
    }));

    return [...staticRoutes, ...articleRoutes];
  } catch {
    return staticRoutes;
  }
}
