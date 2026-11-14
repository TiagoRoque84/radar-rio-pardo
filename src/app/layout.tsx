import type { Metadata } from "next";
import { Inter, Merriweather } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const merriweather = Merriweather({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-merriweather",
  display: "swap",
});

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://radar.roqueconsultoriadigital.com.br";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Radar Rio Pardo — Informação pública sem complicação",
    template: "%s | Radar Rio Pardo",
  },
  description:
    "Portal independente de transparência municipal, jornalismo de dados, resumos do Diário Oficial, Câmara Municipal e contas públicas de São José do Rio Pardo - SP.",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Radar Rio Pardo",
    title: "Radar Rio Pardo — Informação pública sem complicação",
    description:
      "Acompanhamento independente do Diário Oficial, Câmara Municipal, licitações e contas públicas de São José do Rio Pardo - SP.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('radar-theme');
                  if (theme === 'dark') {
                    document.documentElement.classList.add('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${inter.variable} ${merriweather.variable} font-sans min-h-screen flex flex-col antialiased`}
      >
        <a href="#conteudo-principal" className="skip-link">
          Ir para o conteúdo principal
        </a>
        {children}
      </body>
    </html>
  );
}
