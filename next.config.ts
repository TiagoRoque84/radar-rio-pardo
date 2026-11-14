import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PDF parser runs only in server-side Node, with native canvas optional dependency.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  images: {
    unoptimized: true,
  },
  // Reduz paralelismo e uso de processos filhos no build para compatibilidade com Hostinger Cloud Startup (CloudLinux NPROC)
  experimental: {
    cpus: 1,
    // No Next.js 15.5.29, workerThreads: true causa DataCloneError ao clonar nextConfig (headers/generateBuildId) via postMessage
    workerThreads: false,
    webpackBuildWorker: false,
    parallelServerCompiles: false,
    parallelServerBuildTraces: false,
    staticGenerationMaxConcurrency: 1,
    staticGenerationMinPagesPerWorker: 25,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/admin/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
