import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export function PageSection({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className={bodyClassName}>{children}</div>
    </Card>
  );
}
