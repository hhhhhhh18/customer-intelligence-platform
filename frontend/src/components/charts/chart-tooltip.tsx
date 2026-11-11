'use client';

import { formatCurrency, formatNumber } from '@/lib/utils';

interface TooltipPayload {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  valueType = 'number',
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  valueType?: 'number' | 'currency' | 'percent';
}) {
  if (!active || !payload?.length) return null;
  const format = (value: number | string | undefined) => {
    if (value === undefined) return '—';
    if (valueType === 'currency') return formatCurrency(value);
    if (valueType === 'percent') return `${Number(value).toFixed(1)}%`;
    return formatNumber(value);
  };

  return (
    <div className="rounded-md border border-border bg-card px-3 py-2 shadow-lg">
      {label !== undefined ? <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p> : null}
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={`${entry.name}-${index}`} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-medium text-foreground">{format(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
