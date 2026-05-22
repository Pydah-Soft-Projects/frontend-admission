import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ApplicationSectionCardProps = {
  step?: number;
  title: string;
  description?: string;
  eyebrow?: string;
  className?: string;
  children: ReactNode;
};

/** Consistent Step 1 application section shell (edit form + read-only views). */
export function ApplicationSectionCard({
  step,
  title,
  description,
  eyebrow,
  className,
  children,
}: ApplicationSectionCardProps) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none',
        className
      )}
    >
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={cn(
          'text-lg font-semibold text-gray-900 dark:text-slate-100',
          eyebrow ? 'mt-1' : undefined
        )}
      >
        {step != null ? `${step}. ` : ''}
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{description}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}
