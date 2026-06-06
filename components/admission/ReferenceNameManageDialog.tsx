'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { admissionAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { showToast } from '@/lib/toast';

export type ReferenceNameManageMode = 'rename' | 'remove';

type Props = {
  open: boolean;
  mode: ReferenceNameManageMode;
  referenceName: string;
  /** Pending name not yet on server — skip usage fetch and API mutations. */
  localOnly?: boolean;
  onClose: () => void;
  onRenamed?: (oldName: string, newName: string) => void;
  onRemoved?: (name: string, clearedRecords: boolean) => void;
};

export function ReferenceNameManageDialog({
  open,
  mode,
  referenceName,
  localOnly = false,
  onClose,
  onRenamed,
  onRemoved,
}: Props) {
  const trimmedName = referenceName.trim();
  const [newName, setNewName] = useState(trimmedName);
  const [clearRecords, setClearRecords] = useState(false);

  useEffect(() => {
    if (open) {
      setNewName(trimmedName);
      setClearRecords(false);
    }
  }, [open, trimmedName]);

  const { data: usage, isLoading: usageLoading, isError: usageError } = useQuery({
    queryKey: ['reference-name-usage', trimmedName],
    queryFn: () => admissionAPI.getReferenceNameUsage(trimmedName),
    enabled: open && Boolean(trimmedName) && !localOnly,
    staleTime: 30_000,
  });

  const renameMutation = useMutation({
    mutationFn: ({ oldName, nextName }: { oldName: string; nextName: string }) =>
      admissionAPI.renameReferenceName(oldName, nextName),
    onSuccess: (_data, variables) => {
      const updated = usage?.admissionsCount ?? 0;
      showToast.success(
        updated > 0
          ? `Reference renamed on ${updated} admission${updated === 1 ? '' : 's'}`
          : 'Reference renamed'
      );
      onRenamed?.(variables.oldName, variables.nextName);
      onClose();
    },
    onError: (error: unknown) => {
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error as Error)?.message ||
        'Failed to rename reference';
      showToast.error(msg);
    },
  });

  const hideMutation = useMutation({
    mutationFn: ({ name, clear }: { name: string; clear: boolean }) =>
      admissionAPI.hideReferenceName(name, clear),
    onSuccess: (_data, variables) => {
      if (variables.clear) {
        const updated = usage?.admissionsCount ?? 0;
        showToast.success(
          updated > 0
            ? `Reference removed and cleared on ${updated} admission${updated === 1 ? '' : 's'}`
            : 'Reference removed and cleared on matching records'
        );
      } else {
        showToast.success('Reference removed from list');
      }
      onRemoved?.(variables.name, variables.clear);
      onClose();
    },
    onError: (error: unknown) => {
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error as Error)?.message ||
        'Failed to remove reference';
      showToast.error(msg);
    },
  });

  const isPending = renameMutation.isPending || hideMutation.isPending;
  const admissionsCount = usage?.admissionsCount ?? 0;
  const hasLinkedRecords = admissionsCount > 0 || (usage?.joiningsCount ?? 0) > 0 || (usage?.leadsCount ?? 0) > 0;

  const handleRenameSubmit = () => {
    const next = newName.trim();
    if (!next) {
      showToast.error('New reference name is required');
      return;
    }
    if (next.toLowerCase() === trimmedName.toLowerCase()) {
      showToast.error('Enter a different name to rename');
      return;
    }
    if (localOnly) {
      onRenamed?.(trimmedName, next);
      showToast.success('Reference renamed');
      onClose();
      return;
    }
    renameMutation.mutate({ oldName: trimmedName, nextName: next });
  };

  const handleRemoveSubmit = () => {
    if (localOnly) {
      onRemoved?.(trimmedName, false);
      showToast.success('Reference removed from list');
      onClose();
      return;
    }
    hideMutation.mutate({ name: trimmedName, clear: clearRecords });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !isPending && onClose()}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'rename' ? 'Edit reference' : 'Remove reference'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'rename'
              ? 'Rename this reference on all admissions, joinings, and CRM leads that use it.'
              : 'Remove this name from the saved references list.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Reference</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{trimmedName}</p>
          </div>

          {localOnly ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              This name was added in this session and is not saved on any admission yet.
            </p>
          ) : usageLoading ? (
            <p className="text-sm text-slate-500">Checking linked admissions…</p>
          ) : usageError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Could not load linked admissions.</p>
          ) : hasLinkedRecords ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 text-sm text-amber-950 dark:text-amber-100">
                  <p className="font-semibold">Linked records found</p>
                  <ul className="mt-1 list-inside list-disc text-xs text-amber-900/90 dark:text-amber-200/90">
                    {admissionsCount > 0 ? (
                      <li>
                        {admissionsCount} admission{admissionsCount === 1 ? '' : 's'}
                      </li>
                    ) : null}
                    {(usage?.joiningsCount ?? 0) > 0 ? (
                      <li>
                        {usage?.joiningsCount} joining form{(usage?.joiningsCount ?? 0) === 1 ? '' : 's'}
                      </li>
                    ) : null}
                    {(usage?.leadsCount ?? 0) > 0 ? (
                      <li>
                        {usage?.leadsCount} CRM lead{(usage?.leadsCount ?? 0) === 1 ? '' : 's'}
                      </li>
                    ) : null}
                  </ul>
                  {mode === 'rename' ? (
                    <p className="mt-2 text-xs">
                      Saving will update reference on all of these records.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No admissions are currently linked to this reference name.
            </p>
          )}

          {!localOnly && admissionsCount > 0 && usage?.admissions?.length ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Admissions using this reference
                {usage.admissionsTruncated ? ` (showing ${usage.admissions.length} of ${admissionsCount})` : ''}
              </p>
              <ul className="max-h-44 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                {usage.admissions.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-lg bg-white px-3 py-2 text-sm dark:bg-slate-900/60"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{row.studentName}</p>
                        <p className="text-xs text-slate-500">
                          {row.admissionNumber} · {row.course} · {row.branch}
                        </p>
                      </div>
                      {row.id ? (
                        <Link
                          href={`/superadmin/admission/${row.id}/detail`}
                          className="shrink-0 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                          onClick={onClose}
                        >
                          View
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {mode === 'rename' ? (
            <Input
              label="New reference name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter corrected reference name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleRenameSubmit();
                }
              }}
            />
          ) : !localOnly ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={clearRecords}
                onChange={(e) => setClearRecords(e.target.checked)}
              />
              <span className="text-sm text-slate-700 dark:text-slate-200">
                Also clear this reference on all linked admissions, joinings, and CRM leads
                {admissionsCount > 0 ? ` (${admissionsCount} admission${admissionsCount === 1 ? '' : 's'})` : ''}
              </span>
            </label>
          ) : null}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
            Cancel
          </Button>
          {mode === 'rename' ? (
            <Button
              type="button"
              variant="primary"
              disabled={isPending || usageLoading}
              isLoading={renameMutation.isPending}
              onClick={handleRenameSubmit}
            >
              {admissionsCount > 0
                ? `Rename & update ${admissionsCount} admission${admissionsCount === 1 ? '' : 's'}`
                : 'Save reference name'}
            </Button>
          ) : (
            <Button
              type="button"
              variant="danger"
              disabled={isPending || usageLoading}
              isLoading={hideMutation.isPending}
              onClick={handleRemoveSubmit}
            >
              {clearRecords && admissionsCount > 0
                ? `Remove & clear ${admissionsCount} admission${admissionsCount === 1 ? '' : 's'}`
                : 'Remove from list'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
