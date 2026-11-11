import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/10 text-primary',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        success: 'border-transparent bg-emerald-50 text-emerald-700',
        warning: 'border-transparent bg-amber-50 text-amber-700',
        destructive: 'border-transparent bg-red-50 text-red-700',
        info: 'border-transparent bg-sky-50 text-sky-700',
        muted: 'border-transparent bg-slate-100 text-slate-600',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = ({ className, variant, ...props }: BadgeProps) => (
  <span className={cn(badgeVariants({ variant }), className)} {...props} />
);

export const statusVariant = (status: string): VariantProps<typeof badgeVariants>['variant'] => {
  const value = status.toUpperCase();
  if (['ELIGIBLE', 'SUCCESS', 'GRANTED', 'COMPLETED', 'RESOLVED', 'CLOSED', 'ACTIVE'].includes(value)) return 'success';
  if (['SUPPRESSED', 'FAILURE', 'WITHDRAWN', 'CRITICAL', 'ESCALATED', 'OPEN'].includes(value)) return 'destructive';
  if (['NO_ACTION', 'PENDING', 'IN_PROGRESS', 'INVESTIGATING', 'MEDIUM', 'DORMANT', 'WARNING'].includes(value)) return 'warning';
  if (['ACCEPTED', 'PARTIALLY_RETURNED', 'HIGH', 'INFO'].includes(value)) return 'info';
  return 'muted';
};
