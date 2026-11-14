import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://radar.roqueconsultoriadigital.com.br";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/api/admin", "/api/auth", "/api/cron"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
