'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type JoiningStepOneShellProps = {
  children: ReactNode;
  className?: string;
  headerActions?: ReactNode;
};

/** Step 1 layout wrapper — full-width scrollable form. */
export function JoiningStepOneShell({ children, className, headerActions }: JoiningStepOneShellProps) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-lg shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-3 py-2.5 dark:border-slate-700/80 sm:px-4">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Step 1 — Online application
          </p>
          <h2 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Student application form
          </h2>
        </div>
        {headerActions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{headerActions}</div>
        ) : null}
      </div>

      <div className="space-y-3 p-2 sm:p-3">{children}</div>
    </div>
  );
}
