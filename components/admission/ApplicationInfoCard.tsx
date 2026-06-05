import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ApplicationInfoCardProps = {
  title: string;
  icon?: ReactNode;
  description?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
};

/** Compact card shell for Step 1 application sections (edit + read-only). */
export function ApplicationInfoCard({
  title,
  icon,
  description,
  className,
  bodyClassName,
  children,
}: ApplicationInfoCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-slate-200/90 bg-white p-3 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/50',
        className
      )}
    >
      <div className="flex items-start gap-2">
        {icon ? (
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{description}</p>
          ) : null}
        </div>
      </div>
      <div className={cn('mt-2.5', bodyClassName)}>{children}</div>
    </div>
  );
}
