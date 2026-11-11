import { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: 'default' | 'positive' | 'warning' | 'critical';
}) {
  const toneClasses = {
    default: 'text-primary bg-primary/8',
    positive: 'text-emerald-600 bg-emerald-50',
    warning: 'text-amber-600 bg-amber-50',
    critical: 'text-red-600 bg-red-50',
  }[tone];

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">{value}</p>
          {hint ? <p className="mt-1 truncate text-2xs text-muted-foreground">{hint}</p> : null}
        </div>
        {Icon ? (
          <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-md', toneClasses)}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
    </Card>
  );
}
