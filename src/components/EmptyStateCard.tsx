import Link from "next/link";
import { Info } from "lucide-react";

interface EmptyStateCardProps {
  title: string;
  description: string;
  sourceLabel?: string;
  sourceUrl?: string;
  actionHref?: string;
  actionLabel?: string;
}

export function EmptyStateCard({
  title,
  description,
  sourceLabel,
  sourceUrl,
  actionHref,
  actionLabel,
}: EmptyStateCardProps) {
  return (
    <div className="radar-card p-6 border-dashed border-2 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-radar-blue/10 p-2 text-radar-blue shrink-0">
          <Info className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-radar-muted dark:text-slate-300 leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      {(sourceUrl || actionHref) && (
        <div className="mt-1 flex flex-wrap items-center gap-3 pl-11 text-xs">
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-radar-blue hover:underline"
            >
              Consultar fonte oficial: {sourceLabel || sourceUrl} ↗
            </a>
          )}
          {actionHref && actionLabel && (
            <Link
              href={actionHref}
              className="font-medium text-radar-navy dark:text-radar-gold hover:underline"
            >
              {actionLabel} →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
