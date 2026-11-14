import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { formatLongDateBR } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentDateLabel = formatLongDateBR(new Date());

  return (
    <>
      <SiteHeader currentDateLabel={currentDateLabel} />
      <main id="conteudo-principal" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
