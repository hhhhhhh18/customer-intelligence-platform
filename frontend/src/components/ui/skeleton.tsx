import { cn } from '@/lib/utils';

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />
);

export const TableSkeleton = ({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) => (
  <div className="space-y-2 p-4">
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <div key={rowIndex} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: columns }).map((__, colIndex) => (
          <Skeleton key={colIndex} className="h-5 w-full" />
        ))}
      </div>
    ))}
  </div>
);
