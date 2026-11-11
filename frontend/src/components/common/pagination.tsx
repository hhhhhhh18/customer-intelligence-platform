'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PageMeta } from '@/types';
import { formatNumber } from '@/lib/utils';

export function Pagination({
  meta,
  onPageChange,
  disabled,
}: {
  meta: PageMeta | undefined;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  if (!meta) return null;
  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">
        Showing <span className="font-medium text-foreground">{formatNumber((meta.page - 1) * meta.pageSize + 1)}</span>–
        <span className="font-medium text-foreground">{formatNumber(Math.min(meta.page * meta.pageSize, meta.total))}</span> of{' '}
        <span className="font-medium text-foreground">{formatNumber(meta.total)}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(meta.page - 1)}
          disabled={disabled || meta.page <= 1}
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {meta.page} of {meta.totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(meta.page + 1)}
          disabled={disabled || !meta.hasNext}
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
