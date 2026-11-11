'use client';

import { usePathname } from 'next/navigation';
import { CircleDot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': { title: 'Executive dashboard', subtitle: 'Customer base, revenue and action performance from live data' },
  '/customers': { title: 'Customers', subtitle: 'Search, filter and inspect every customer profile' },
  '/segments': { title: 'Segmentation', subtitle: 'Deterministic RFM rules with explainable membership' },
  '/recommendations': { title: 'Action recommendations', subtitle: 'Next-best-action decisions with consent enforcement' },
  '/consent': { title: 'Consent & contact preferences', subtitle: 'Append-only consent history and suppression state' },
  '/exceptions': { title: 'Exception centre', subtitle: 'Detected anomalies with expected vs actual evidence' },
  '/outcomes': { title: 'Action outcomes', subtitle: 'Execution funnel and attributed revenue by segment' },
  '/data-quality': { title: 'Data quality', subtitle: 'Validation results, reconciliation and reproducibility' },
};

export function Topbar() {
  const pathname = usePathname();
  const base = `/${pathname.split('/')[1] ?? 'dashboard'}`;
  const meta = TITLES[base] ?? TITLES['/dashboard'];

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/90 px-6 backdrop-blur">
      <div>
        <h1 className="text-base font-semibold tracking-tight text-foreground">{meta.title}</h1>
        <p className="text-xs text-muted-foreground">{meta.subtitle}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="success" className="gap-1">
          <CircleDot className="h-2.5 w-2.5" />
          API connected
        </Badge>
        <Badge variant="muted">seed 20261022</Badge>
      </div>
    </header>
  );
}
