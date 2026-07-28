'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { admissionAPI } from '@/lib/api';
import { cn } from '@/lib/utils';

export type AdmissionApplicationHistoryEvent = {
  id: string;
  kind: string;
  title: string;
  description?: string;
  performedById?: string | null;
  performedByName?: string;
  at: string;
  statusFrom?: string | null;
  statusTo?: string | null;
  source?: string;
};

type AdmissionApplicationHistoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admissionId: string;
  admissionNumber?: string;
};

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const kindStyles = (kind: string) => {
  const key = String(kind || '').toLowerCase();
  if (key === 'initial') {
    return 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200';
  }
  if (key === 'approved' || key === 'submitted') {
    return 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200';
  }
  if (key === 'cancelled') {
    return 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200';
  }
  return 'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800/60 dark:text-slate-200';
};

const kindDot = (kind: string) => {
  const key = String(kind || '').toLowerCase();
  if (key === 'initial') return 'bg-emerald-500';
  if (key === 'approved' || key === 'submitted') return 'bg-blue-500';
  if (key === 'cancelled') return 'bg-rose-500';
  return 'bg-slate-400';
};

export function AdmissionApplicationHistoryDialog({
  open,
  onOpenChange,
  admissionId,
  admissionNumber,
}: AdmissionApplicationHistoryDialogProps) {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admission', admissionId, 'application-history'],
    enabled: open && Boolean(admissionId),
    queryFn: async () => {
      const response = await admissionAPI.getApplicationHistory(admissionId);
      return response?.data ?? response;
    },
    staleTime: 30_000,
  });

  const events = useMemo(() => {
    const list = (data?.events || []) as AdmissionApplicationHistoryEvent[];
    return Array.isArray(list) ? list : [];
  }, [data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <DialogTitle>Application edit history</DialogTitle>
          <DialogDescription>
            Timeline of changes from the initial entry to the latest update
            {admissionNumber ? ` for admission #${admissionNumber}` : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(85vh-7rem)] overflow-y-auto px-5 py-4">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading application history…
            </p>
          ) : isError ? (
            <div className="space-y-3 py-6 text-center">
              <p className="text-sm text-rose-700 dark:text-rose-300">
                {(error as { response?: { data?: { message?: string } } })?.response?.data
                  ?.message ||
                  (error as Error)?.message ||
                  'Failed to load application history.'}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : events.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No edit history is available for this application yet.
            </p>
          ) : (
            <ol className="relative space-y-0 border-l border-slate-200 pl-5 dark:border-slate-700">
              {events.map((event, index) => (
                <li key={event.id || `${event.at}-${index}`} className="relative pb-6 last:pb-0">
                  <span
                    className={cn(
                      'absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white dark:ring-slate-900',
                      kindDot(event.kind)
                    )}
                  />
                  <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900/60">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {event.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {formatDateTime(event.at)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          kindStyles(event.kind)
                        )}
                      >
                        {event.kind || 'update'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">
                      <span className="font-medium">By:</span>{' '}
                      {event.performedByName?.trim() || '—'}
                    </p>
                    {event.description ? (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">
                        {event.description}
                      </p>
                    ) : null}
                    {event.statusFrom || event.statusTo ? (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Status: {event.statusFrom || '—'} → {event.statusTo || '—'}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isFetching && !isLoading ? 'Refreshing…' : `${events.length} event${events.length === 1 ? '' : 's'}`}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
