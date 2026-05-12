'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { feeStructureAPI } from '@/lib/api';
import type { FeeStructure } from '@/types';

/**
 * Build the batch dropdown values: 3 past + current year + 3 future years.
 * Returned newest-first so the current year sits visually below the future years.
 */
const buildBatchOptions = (currentYear: number): number[] => {
  const items: number[] = [];
  for (let offset = 3; offset >= -3; offset -= 1) {
    items.push(currentYear + offset);
  }
  return items;
};

/** Coerce any incoming batch prop (string/number) into a clean 4-digit year string. */
const coerceBatch = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 1900 && numeric < 3000) {
    return String(Math.trunc(numeric));
  }
  return raw;
};

const formatCurrency = (amount?: number | null) => {
  if (amount === undefined || amount === null || Number.isNaN(amount)) {
    return '—';
  }
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return String(amount);
  }
};

const QUOTA_TO_CATEGORY_LABEL: Record<string, string> = {
  CONV: 'Convenor (CONV)',
  MANG: 'Management (MANG)',
  SPOT: 'Spot Admission (SPOT)',
};

const buildCategoryLabel = (category?: string | null) => {
  if (!category) return '—';
  return QUOTA_TO_CATEGORY_LABEL[category] || category;
};

const mapQuotaToCategory = (quota?: string | null): string | null => {
  if (!quota) return null;
  const key = quota.trim().toLowerCase();
  if (!key) return null;
  if (key.includes('conv')) return 'CONV';
  if (key.includes('mang') || key.includes('management')) return 'MANG';
  if (key.includes('spot')) return 'SPOT';
  return quota.toUpperCase();
};

type ApiListPayload = {
  success?: boolean;
  data?: {
    data?: FeeStructure[];
    filters?: Record<string, unknown>;
    total?: number;
  } | FeeStructure[];
};

/**
 * Selection emitted when the user clicks one of the per-row payment buttons in the fee
 * structure. Mirrors the choices in the joining workspace's "Payments & Transactions"
 * section so parents can reuse their existing cash / Cashfree handlers.
 */
export type FeeHeadPaymentMode = 'cash' | 'online';

export type FeeHeadSelection = {
  feeHeadId: string;
  feeHeadName: string;
  feeHeadCode: string;
  amount: number;
  batch: string;
  studentYear: number | null;
  category: string | null;
  /** Convenient single-line label used in modal headers and history badges. */
  label: string;
  /** Which payment lane the user picked on the row — drives which modal the parent opens. */
  mode: FeeHeadPaymentMode;
};

export type FeeStructureSectionProps = {
  course?: string | null;
  branch?: string | null;
  quota?: string | null;
  category?: string | null;
  batch?: string | number | null;
  college?: string | null;
  studentYear?: number | null;
  title?: string;
  description?: string;
  className?: string;
  /**
   * When provided, each row renders Cash + Cashfree action buttons (mirroring the
   * Payments & Transactions section). Clicking either fires `onSelectFeeHead` with the
   * selected row's identity, amount, and chosen `mode` so the parent can open its existing
   * payment modal pre-filled and tag the resulting transaction with the fee head.
   */
  onSelectFeeHead?: (selection: FeeHeadSelection) => void;
  /** When set, the row whose `_id` matches is highlighted as the currently-selected head. */
  activeFeeHeadId?: string | null;
  /**
   * Mirrors `paymentsActive && cashfreeConfig.isActive` from the parent. When false the
   * Cashfree button on each row is disabled (with a tooltip) just like the main Payments &
   * Transactions buttons behave.
   */
  canUseCashfree?: boolean;
};

/**
 * Read-only fee structure section. Reads the fee-management Mongo `feestructures` view
 * via `/api/fee-structures` and renders a grouped breakdown for the student's course +
 * branch + category (quota) + batch.
 */
export function FeeStructureSection({
  course,
  branch,
  quota,
  category,
  batch,
  college,
  studentYear,
  title = 'Fee Structure',
  description = 'Pulled live from the Fee Management database. Amounts are per academic year unless terms are configured.',
  className = '',
  onSelectFeeHead,
  activeFeeHeadId,
  canUseCashfree = true,
}: FeeStructureSectionProps) {
  const resolvedCategory = useMemo(() => {
    return (category && category.trim()) || mapQuotaToCategory(quota);
  }, [category, quota]);

  const cleanCourse = (course || '').trim();
  const cleanBranch = (branch || '').trim();

  /**
   * Batch dropdown.
   *
   * Default: the current calendar year. Options: current year ± 3 (3 past + current + 3 future).
   * If the parent provided a `batch` prop (e.g. lead.academicYear) that falls inside the window,
   * we use that as the initial value so the relevant year is preselected. Out-of-window values
   * are appended to the option list rather than silently dropped, so the user can always see
   * what was originally captured on the lead.
   */
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const baseBatchOptions = useMemo(() => buildBatchOptions(currentYear), [currentYear]);

  const propBatch = useMemo(() => coerceBatch(batch), [batch]);

  const batchOptions = useMemo(() => {
    if (!propBatch) return baseBatchOptions;
    const propNumeric = Number(propBatch);
    if (!Number.isFinite(propNumeric)) return baseBatchOptions;
    if (baseBatchOptions.includes(propNumeric)) return baseBatchOptions;
    // Out-of-window: append the lead's original year so it stays selectable.
    return [...baseBatchOptions, propNumeric].sort((a, b) => b - a);
  }, [baseBatchOptions, propBatch]);

  const initialBatch = useMemo(() => {
    if (propBatch) return propBatch;
    return String(currentYear);
  }, [propBatch, currentYear]);

  const [selectedBatch, setSelectedBatch] = useState<string>(initialBatch);

  // Keep the dropdown in sync if the parent ever changes the `batch` prop after first render.
  useEffect(() => {
    if (propBatch) {
      setSelectedBatch(propBatch);
    }
  }, [propBatch]);

  const queryEnabled = Boolean(cleanCourse || cleanBranch || resolvedCategory || selectedBatch);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'fee-structures',
      cleanCourse || null,
      cleanBranch || null,
      resolvedCategory || null,
      selectedBatch || null,
      college || null,
      studentYear ?? null,
    ],
    enabled: queryEnabled,
    staleTime: 60_000,
    queryFn: async () => {
      const response: ApiListPayload = await feeStructureAPI.list({
        course: cleanCourse || undefined,
        branch: cleanBranch || undefined,
        category: resolvedCategory || undefined,
        batch: selectedBatch || undefined,
        college: college || undefined,
        studentYear: studentYear ?? undefined,
      });
      return response;
    },
  });

  const items: FeeStructure[] = useMemo(() => {
    const payload = data?.data;
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    return [];
  }, [data]);

  const grouped = useMemo(() => {
    const map = new Map<number | string, FeeStructure[]>();
    for (const item of items) {
      const key = item.studentYear ?? 'all';
      const existing = map.get(key) || [];
      existing.push(item);
      map.set(key, existing);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const av = typeof a[0] === 'number' ? a[0] : Number.MAX_SAFE_INTEGER;
      const bv = typeof b[0] === 'number' ? b[0] : Number.MAX_SAFE_INTEGER;
      return av - bv;
    });
  }, [items]);

  const grandTotal = useMemo(
    () => items.reduce((sum, row) => sum + (row.amount || 0), 0),
    [items]
  );

  return (
    <div
      className={`rounded-2xl border border-emerald-200 bg-white p-6 shadow-lg dark:border-emerald-900/40 dark:bg-slate-900/70 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-emerald-700 dark:text-emerald-200">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h18M7 14h2m4 0h4M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z"
              />
            </svg>
            {title}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
          {cleanCourse && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
              Course: {cleanCourse}
            </span>
          )}
          {cleanBranch && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
              Branch: {cleanBranch}
            </span>
          )}
          {resolvedCategory && (
            <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
              {buildCategoryLabel(resolvedCategory)}
            </span>
          )}
          <label className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 font-medium text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-slate-900/70 dark:text-emerald-200">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
              Batch
            </span>
            <select
              value={selectedBatch}
              onChange={(event) => setSelectedBatch(event.target.value)}
              className="rounded-md border-0 bg-transparent text-sm font-semibold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 dark:text-emerald-100"
              aria-label="Select admission batch (academic year)"
            >
              {batchOptions.map((year) => (
                <option key={year} value={String(year)}>
                  {year}
                  {year === currentYear ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-5">
        {!queryEnabled ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            Course / branch / quota are not yet captured for this record. Once the program details
            are set, the configured fee structure will appear here.
          </p>
        ) : isLoading ? (
          <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            Loading fee structure…
          </div>
        ) : isError ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
            Failed to load fee structure
            {error instanceof Error ? `: ${error.message}` : '.'}
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            No fee structure is configured in the Fee Management database for this combination yet.
            Ask the finance team to add a row to <span className="font-mono">feestructures</span>{' '}
            with the matching course, branch, category and batch.
          </p>
        ) : (
          <div className="space-y-6">
            {grouped.map(([year, rows]) => {
              const yearLabel =
                typeof year === 'number' ? `Year ${year}` : 'All Years';
              const yearTotal = rows.reduce((sum, row) => sum + (row.amount || 0), 0);
              const hasAnyTerms = rows.some((row) => row.terms && row.terms.length > 0);
              return (
                <div
                  key={String(year)}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900/60"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {yearLabel}
                    </h3>
                    <span className="text-sm font-bold text-emerald-700 dark:text-emerald-200">
                      {formatCurrency(yearTotal)}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50/60 dark:bg-slate-800/40">
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          <th className="px-4 py-2">Fee Head</th>
                          <th className="px-4 py-2">Code</th>
                          <th className="px-4 py-2 text-right">Amount</th>
                          {hasAnyTerms && <th className="px-4 py-2">Terms</th>}
                          <th className="px-4 py-2 text-center">Scholarship?</th>
                          {onSelectFeeHead && (
                            <th className="px-4 py-2 text-right">Action</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const isActive =
                            !!activeFeeHeadId && String(activeFeeHeadId) === String(row._id);
                          return (
                            <tr
                              key={row._id}
                              className={`border-t border-slate-100 align-top text-slate-700 transition dark:border-slate-800 dark:text-slate-200 ${
                                isActive
                                  ? 'bg-emerald-50/70 dark:bg-emerald-900/20'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                              }`}
                            >
                              <td className="px-4 py-3 font-medium">
                                <div className="flex items-center gap-2">
                                  <span>{row.feeHeadName || '—'}</span>
                                  {isActive && (
                                    <span className="inline-flex rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                      Selected
                                    </span>
                                  )}
                                </div>
                                {row.feeHeadDescription && (
                                  <p className="text-xs font-normal text-slate-500 dark:text-slate-400">
                                    {row.feeHeadDescription}
                                  </p>
                                )}
                              </td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                                {row.feeHeadCode || '—'}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                                {formatCurrency(row.amount)}
                              </td>
                              {hasAnyTerms && (
                                <td className="px-4 py-3">
                                  {row.terms && row.terms.length > 0 ? (
                                    <div className="space-y-1 text-xs">
                                      {row.terms.map((term, idx) => (
                                        <div
                                          key={`${row._id}-term-${idx}`}
                                          className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-800/60"
                                        >
                                          <span className="text-slate-600 dark:text-slate-300">
                                            T{term.termNumber ?? idx + 1}
                                            {term.percentage !== null
                                              ? ` · ${term.percentage}%`
                                              : ''}
                                          </span>
                                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                                            {formatCurrency(term.amount)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-400">—</span>
                                  )}
                                </td>
                              )}
                              <td className="px-4 py-3 text-center">
                                {row.isScholarshipApplicable ? (
                                  <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                                    Eligible
                                  </span>
                                ) : (
                                  <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    No
                                  </span>
                                )}
                              </td>
                              {onSelectFeeHead && (
                                <td className="px-4 py-3 text-right">
                                  {(() => {
                                    /**
                                     * Build the selection payload once per row so both buttons
                                     * (Cash + Cashfree) emit identical fee-head identity.
                                     * Only `mode` differs between the two.
                                     */
                                    const buildSelection = (
                                      mode: FeeHeadPaymentMode
                                    ): FeeHeadSelection => ({
                                      feeHeadId: String(row._id),
                                      feeHeadName: row.feeHeadName || '',
                                      feeHeadCode: row.feeHeadCode || '',
                                      amount: Number(row.amount) || 0,
                                      batch: selectedBatch,
                                      studentYear:
                                        typeof row.studentYear === 'number'
                                          ? row.studentYear
                                          : null,
                                      category: resolvedCategory || null,
                                      label: [
                                        row.feeHeadName || row.feeHeadCode || 'Fee head',
                                        typeof row.studentYear === 'number'
                                          ? `Year ${row.studentYear}`
                                          : null,
                                        selectedBatch ? `Batch ${selectedBatch}` : null,
                                      ]
                                        .filter(Boolean)
                                        .join(' · '),
                                      mode,
                                    });
                                    const cashfreeTitle = canUseCashfree
                                      ? 'Collect this fee head via Cashfree UPI / QR'
                                      : 'Cashfree is not configured. Update Payment Settings to enable.';
                                    return (
                                      <div className="flex flex-wrap items-center justify-end gap-2">
                                        <button
                                          type="button"
                                          onClick={() => onSelectFeeHead(buildSelection('cash'))}
                                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
                                          aria-label={`Record cash payment for ${
                                            row.feeHeadName || 'this fee head'
                                          }`}
                                          title="Record cash payment"
                                        >
                                          <svg
                                            className="h-3.5 w-3.5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            aria-hidden="true"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8v8m0 0v2m0-10V4m-7 8a7 7 0 1014 0 7 7 0 00-14 0z"
                                            />
                                          </svg>
                                          Cash
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => onSelectFeeHead(buildSelection('online'))}
                                          disabled={!canUseCashfree}
                                          className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-400/60 ${
                                            canUseCashfree
                                              ? 'border-blue-300 bg-white text-blue-700 hover:border-blue-400 hover:bg-blue-50 dark:border-blue-900/60 dark:bg-slate-900/70 dark:text-blue-200 dark:hover:bg-blue-950/40'
                                              : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500'
                                          }`}
                                          aria-label={`Collect ${
                                            row.feeHeadName || 'this fee head'
                                          } via Cashfree`}
                                          title={cashfreeTitle}
                                        >
                                          <svg
                                            className="h-3.5 w-3.5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            aria-hidden="true"
                                          >
                                            <path
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                              strokeWidth={2}
                                              d="M3 10h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z"
                                            />
                                          </svg>
                                          Cashfree
                                        </button>
                                      </div>
                                    );
                                  })()}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}

            <div className="flex items-center justify-end gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-900/50 dark:bg-emerald-950/30">
              <span className="font-semibold text-emerald-800 dark:text-emerald-100">
                Total course fee (all configured years)
              </span>
              <span className="text-lg font-bold text-emerald-900 dark:text-emerald-50">
                {formatCurrency(grandTotal)}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default FeeStructureSection;
