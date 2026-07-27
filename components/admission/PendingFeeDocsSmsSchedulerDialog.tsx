'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { admissionAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { showToast } from '@/lib/toast';

type PendingFeeDocsSmsSchedulerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const selectClassName =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900';

function normalizeTimeInput(value: string, fallback = '09:00') {
  const s = String(value || '').trim();
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    const [h, m] = s.split(':');
    const hour = Number(h);
    const minute = Number(m);
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23 && Number.isFinite(minute) && minute >= 0 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }
  return fallback;
}

/** AM = 00:00–11:59, PM = 12:00–23:59 (from the single time field). */
function periodFromTime(time: string): 'am' | 'pm' {
  const [hs] = normalizeTimeInput(time).split(':');
  const hour = Number(hs);
  return Number.isFinite(hour) && hour >= 12 ? 'pm' : 'am';
}

function formatTimeLabel(time: string) {
  const normalized = normalizeTimeInput(time);
  const [hs, ms] = normalized.split(':');
  let hour = Number(hs);
  const minute = Number(ms);
  const period = hour >= 12 ? 'PM' : 'AM';
  if (hour === 0) hour = 12;
  else if (hour > 12) hour = hour - 12;
  return `${hour}:${String(minute).padStart(2, '0')} ${period}`;
}

export function PendingFeeDocsSmsSchedulerDialog({
  open,
  onOpenChange,
}: PendingFeeDocsSmsSchedulerDialogProps) {
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState('09:00');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admissions', 'pending-fees-docs-sms-scheduler'],
    queryFn: () => admissionAPI.getPendingFeeDocsSmsSchedulerConfig(),
    enabled: open,
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!open || !data) return;
    setEnabled(Boolean(data.enabled));
    setTime(normalizeTimeInput(data.time || '', '09:00'));
  }, [open, data]);

  const period = periodFromTime(time);

  const scheduleSummary = useMemo(() => {
    return `${enabled ? 'Enabled' : 'Disabled'} · once daily · ${formatTimeLabel(time)} IST`;
  }, [enabled, time]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const nextTime = normalizeTimeInput(time);
      return admissionAPI.upsertPendingFeeDocsSmsSchedulerConfig({
        enabled,
        period: periodFromTime(nextTime),
        time: nextTime,
      });
    },
    onSuccess: async () => {
      showToast.success('SMS scheduler saved. Once-daily job updated.');
      await refetch();
      onOpenChange(false);
    },
    onError: (e: Error) => {
      showToast.error(e?.message || 'Failed to save SMS scheduler');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>SMS Scheduler</DialogTitle>
          <DialogDescription>
            Send Pending Fee & Documents SMS once per day. Set the time and switch AM/PM in the
            time field (Asia/Kolkata).
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-slate-500">Loading scheduler config…</p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
              <p>
                Last run:{' '}
                <span className="font-semibold">{data?.lastRunDate || '—'}</span>
              </p>
              <p className="mt-1">{scheduleSummary}</p>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <span className="text-sm text-slate-700 dark:text-slate-200">
                Enable daily SMS job
              </span>
            </label>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Send time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(normalizeTimeInput(e.target.value))}
                className={selectClassName}
              />
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Use the time picker to set the hour/minute and AM/PM. SMS goes out once daily at{' '}
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {formatTimeLabel(time)}
                </span>{' '}
                ({period.toUpperCase()}) for all pending fee & documents students.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            isLoading={saveMutation.isPending}
            disabled={isLoading}
            onClick={() => saveMutation.mutate()}
          >
            Save scheduler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
