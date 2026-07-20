'use client';

import { useEffect, useState } from 'react';
import type { DocumentChecklistTabItem } from '@/lib/joiningDocumentsDisplay';
import { cn } from '@/lib/utils';

type DocumentTabKey = 'important' | 'other';

type Props = {
  importantDocuments: DocumentChecklistTabItem[];
  otherDocuments: DocumentChecklistTabItem[];
  className?: string;
  emptyMessage?: string;
  showBothStacked?: boolean;
};

function isReceivedStatus(status: string): boolean {
  return status === 'received' || status === 'Received';
}

function isPendingStatus(status: string): boolean {
  return status === 'pending' || status === 'Pending';
}

function formatStatusLabel(status: string): string {
  if (isReceivedStatus(status)) return 'Received';
  if (isPendingStatus(status)) return 'Pending';
  return status;
}

function DocumentStatusPill({ status }: { status: string }) {
  const received = isReceivedStatus(status);
  const pending = isPendingStatus(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
        received
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'
          : pending
            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300'
            : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          received ? 'bg-emerald-500' : pending ? 'bg-amber-500' : 'bg-slate-300'
        )}
      />
      {formatStatusLabel(status)}
    </span>
  );
}

export function DocumentsChecklistTabs({
  importantDocuments,
  otherDocuments,
  className,
  emptyMessage = 'No documents recorded.',
  showBothStacked = false,
}: Props) {
  const hasImportant = importantDocuments.length > 0;
  const hasOther = otherDocuments.length > 0;
  const defaultTab: DocumentTabKey = hasImportant ? 'important' : 'other';
  const [activeTab, setActiveTab] = useState<DocumentTabKey>(defaultTab);

  useEffect(() => {
    if (activeTab === 'important' && !hasImportant && hasOther) {
      setActiveTab('other');
    } else if (activeTab === 'other' && !hasOther && hasImportant) {
      setActiveTab('important');
    }
  }, [activeTab, hasImportant, hasOther]);

  if (!hasImportant && !hasOther) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>
    );
  }

  const activeItems = activeTab === 'important' ? importantDocuments : otherDocuments;

  const renderItems = (
    items: DocumentChecklistTabItem[],
    emptyText: string
  ) => {
    if (!items.length) {
      return (
        <p className="text-sm text-slate-500 dark:text-slate-400 sm:col-span-2">{emptyText}</p>
      );
    }
    return items.map((item) => (
      <div
        key={item.key}
        className="flex min-w-0 items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-800/40"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.label}</p>
          {item.subtitle ? (
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{item.subtitle}</p>
          ) : null}
        </div>
        <DocumentStatusPill status={String(item.status)} />
      </div>
    ));
  };

  if (showBothStacked) {
    return (
      <div className={cn('space-y-5', className)}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Important Documents
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {renderItems(importantDocuments, 'No important documents recorded.')}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Other Documents
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {renderItems(otherDocuments, 'No other documents recorded.')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        className="inline-flex w-full rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900/80 sm:w-auto"
        role="tablist"
        aria-label="Document categories"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'important'}
          disabled={!hasImportant}
          onClick={() => setActiveTab('important')}
          className={cn(
            'flex-1 rounded-lg px-4 py-2 text-xs font-semibold transition sm:flex-initial sm:text-sm',
            activeTab === 'important'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800',
            !hasImportant && 'cursor-not-allowed opacity-50'
          )}
        >
          Important Documents
          {hasImportant ? ` (${importantDocuments.length})` : ''}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'other'}
          disabled={!hasOther}
          onClick={() => setActiveTab('other')}
          className={cn(
            'flex-1 rounded-lg px-4 py-2 text-xs font-semibold transition sm:flex-initial sm:text-sm',
            activeTab === 'other'
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800',
            !hasOther && 'cursor-not-allowed opacity-50'
          )}
        >
          Other Documents
          {hasOther ? ` (${otherDocuments.length})` : ''}
        </button>
      </div>

      <div
        role="tabpanel"
        className="mt-3 grid gap-2 sm:grid-cols-2"
      >
        {renderItems(
          activeItems,
          activeTab === 'important'
            ? 'No important documents recorded.'
            : 'No other documents recorded.'
        )}
      </div>
    </div>
  );
}
