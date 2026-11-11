import { AlertCircle, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export const EmptyState = ({
  title,
  description,
  className,
  variant = 'empty',
}: {
  title: string;
  description?: string;
  className?: string;
  variant?: 'empty' | 'error';
}) => {
  const Icon = variant === 'error' ? AlertCircle : Inbox;
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}>
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center rounded-full',
          variant === 'error' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500',
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-md text-xs text-muted-foreground">{description}</p> : null}
    </div>
  );
};
