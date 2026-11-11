'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  Database,
  LayoutDashboard,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/segments', label: 'Segmentation', icon: Target },
  { href: '/recommendations', label: 'Recommendations', icon: Sparkles },
  { href: '/consent', label: 'Consent & Contact', icon: ShieldCheck },
  { href: '/exceptions', label: 'Exceptions', icon: TriangleAlert },
  { href: '/outcomes', label: 'Outcomes', icon: Megaphone },
  { href: '/data-quality', label: 'Data Quality', icon: Database },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-card lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <BarChart3 className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight">YottaFlex CI</p>
          <p className="text-2xs text-muted-foreground">Customer Intelligence</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        <p className="px-2 pb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Workspace</p>
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-slate-600 hover:bg-secondary hover:text-foreground',
              )}
            >
              <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-slate-400')} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="rounded-md bg-secondary/60 p-3">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Evaluation build</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Deterministic rules, consent-first. Ground truth is isolated from every engine.
          </p>
        </div>
      </div>
    </aside>
  );
}
