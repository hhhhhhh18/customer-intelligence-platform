import * as React from 'react';
import { cn } from '@/lib/utils';

export const Table = ({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) => (
  <div className="w-full overflow-x-auto">
    <table className={cn('w-full border-collapse text-sm', className)} {...props} />
  </div>
);

export const THead = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn('border-b border-border bg-slate-50/70', className)} {...props} />
);

export const TBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn('divide-y divide-border', className)} {...props} />
);

export const TR = ({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('transition-colors hover:bg-slate-50/70', className)} {...props} />
);

export const TH = ({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('table-head', className)} {...props} />
);

export const TD = ({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('table-cell text-foreground', className)} {...props} />
);
