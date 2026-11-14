import React from "react";

export interface ChartDatum {
  label: string;
  value: number;
  formattedValue?: string;
}

interface SimpleBarChartProps {
  title: string;
  data: ChartDatum[];
  period: string;
  source: string;
  collectedAt: string;
  formula: string;
  limitations: string;
}

/**
 * Componente de visualização acessível com transparência metodológica obrigatória.
 */
export function SimpleBarChart({
  title,
  data,
  period,
  source,
  collectedAt,
  formula,
  limitations,
}: SimpleBarChartProps) {
  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <section className="radar-card p-5 space-y-4" aria-label={title}>
      <h3 className="text-base font-bold">{title}</h3>

      {data.length === 0 ? (
        <p className="text-sm text-radar-muted dark:text-slate-300">
          Nenhum dado real consolidado disponível para este indicador no período.
        </p>
      ) : (
        <div className="space-y-3">
          {data.map((item) => {
            const widthPct = Math.max((item.value / maxVal) * 100, 2);
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span>{item.label}</span>
                  <span>{item.formattedValue ?? item.value}</span>
                </div>
                <div className="h-3 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-radar-blue transition-all"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <dl className="grid gap-1.5 border-t border-radar-border pt-3 text-xs text-radar-muted dark:text-slate-300">
        <div>
          <dt className="inline font-semibold">Período: </dt>
          <dd className="inline">{period}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Fonte: </dt>
          <dd className="inline">{source}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Data da coleta: </dt>
          <dd className="inline">{collectedAt}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Fórmula: </dt>
          <dd className="inline">{formula}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Limitações: </dt>
          <dd className="inline">{limitations}</dd>
        </div>
      </dl>
    </section>
  );
}
