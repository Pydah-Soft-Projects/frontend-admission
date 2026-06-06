'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { feeStructureAPI } from '@/lib/api';
import type { FeeStructure, JoiningStudentFeeDetails, JoiningStudentFeeLineOverride } from '@/types';

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
  /** When true, show catalog vs student amount + remarks; changes persist with joining save (lead_data._joiningStudentFeeDetails). */
  feeDetailsEditable?: boolean;
  /** Current saved / in-progress overrides keyed by fee structure row id (`_id`). */
  studentFeeDetails?: JoiningStudentFeeDetails | null;
  onStudentFeeDetailsChange?: (next: JoiningStudentFeeDetails) => void;
  /** Extra fee rows (e.g. bus fee per year) merged into the Step 4 breakdown. */
  injectedFeeRows?: FeeStructure[];
  /** When true, show separate Actual Fee and Revised Fee columns (Step 4). */
  showActualAndRevisedFees?: boolean;
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
  feeDetailsEditable = false,
  studentFeeDetails,
  onStudentFeeDetailsChange,
  injectedFeeRows,
  showActualAndRevisedFees = false,
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
    let base: FeeStructure[] = [];
    if (payload) {
      if (Array.isArray(payload)) base = payload;
      else if (Array.isArray(payload.data)) base = payload.data;
    }
    const injected = injectedFeeRows || [];
    if (injected.length === 0) return base;
    const injectedIds = new Set(injected.map((row) => String(row._id)));
    return [...base.filter((row) => !injectedIds.has(String(row._id))), ...injected];
  }, [data, injectedFeeRows]);

  const hasEditableFees = Boolean(feeDetailsEditable && onStudentFeeDetailsChange);
  const showDualFeeColumns = showActualAndRevisedFees || hasEditableFees;
  const hideNotesAndScholarship = showActualAndRevisedFees;
  /** Step 4: pencil opens revised-fee panel; inline inputs only when not using dual columns. */
  const useInlineRevisedFeeEdit = false;
  /** Pencil first: open an edit panel, then Cash/Cashfree (joining workspace). */
  const paymentViaEditPanel = Boolean(hasEditableFees && onSelectFeeHead && !useInlineRevisedFeeEdit);

  /** Row id (`_id`) whose fee edit + payment panel is open (panel mode only). */
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  /** Draft values while the panel is open (committed on "Update line" or used when paying). */
  const [editDraft, setEditDraft] = useState<{ amountStr: string; remarks: string }>({
    amountStr: '',
    remarks: '',
  });
  /** Inline revised-fee draft while a Step 4 input is focused. */
  const [inlineEditingRowId, setInlineEditingRowId] = useState<string | null>(null);
  const [inlineRevisedDraft, setInlineRevisedDraft] = useState('');

  const lineOverrideByStructureId = useMemo(() => {
    const m = new Map<string, JoiningStudentFeeLineOverride>();
    for (const line of studentFeeDetails?.lines || []) {
      const id = String(line.structureId || '').trim();
      if (id) m.set(id, line);
    }
    return m;
  }, [studentFeeDetails?.lines]);

  const effectiveRowAmount = useCallback(
    (row: FeeStructure) => {
      const catalog = Number(row.amount) || 0;
      const o = lineOverrideByStructureId.get(String(row._id));
      if (o?.amount !== undefined && o?.amount !== null && Number.isFinite(Number(o.amount))) {
        return Number(o.amount);
      }
      return catalog;
    },
    [lineOverrideByStructureId]
  );

  useEffect(() => {
    if (!hasEditableFees || !onStudentFeeDetailsChange) return;
    if (isLoading) return;
    if (!queryEnabled || items.length === 0) return;
    if ((studentFeeDetails?.batch || '') === selectedBatch) return;
    setEditingRowId(null);
    onStudentFeeDetailsChange({
      batch: selectedBatch,
      lines: (studentFeeDetails?.lines || []).filter((line) =>
        items.some((it) => String(it._id) === String(line.structureId))
      ),
    });
  }, [
    hasEditableFees,
    onStudentFeeDetailsChange,
    isLoading,
    queryEnabled,
    items,
    selectedBatch,
    studentFeeDetails?.batch,
  ]);

  const patchStudentFeeLine = (row: FeeStructure, patch: Partial<Pick<JoiningStudentFeeLineOverride, 'amount' | 'remarks'>>) => {
    if (!onStudentFeeDetailsChange) return;
    const sid = String(row._id);
    const catalog = Number(row.amount) || 0;
    const lines = [...(studentFeeDetails?.lines || [])];
    const idx = lines.findIndex((l) => String(l.structureId) === sid);
    const prevLine: JoiningStudentFeeLineOverride =
      idx >= 0
        ? { ...lines[idx] }
        : { structureId: sid, amount: null, remarks: '' };
    const nextPartial = { ...prevLine, ...patch, structureId: sid };
    const remarksStr = String(nextPartial.remarks ?? '').trim();
    let amountVal: number | null | undefined = nextPartial.amount;
    if (amountVal !== undefined && amountVal !== null && Number.isFinite(Number(amountVal))) {
      amountVal = Number(amountVal);
      if (amountVal === catalog) amountVal = null;
    } else {
      amountVal = null;
    }
    if (amountVal === null && !remarksStr) {
      if (idx >= 0) lines.splice(idx, 1);
    } else {
      const merged: JoiningStudentFeeLineOverride = {
        structureId: sid,
        amount: amountVal ?? null,
        remarks: remarksStr,
      };
      if (idx >= 0) lines[idx] = merged;
      else lines.push(merged);
    }
    onStudentFeeDetailsChange({
      batch: selectedBatch,
      lines,
    });
  };

  const catalogRowAmount = useCallback((row: FeeStructure) => Number(row.amount) || 0, []);

  const isRowRevised = useCallback(
    (row: FeeStructure) => {
      const actual = catalogRowAmount(row);
      const revised = effectiveRowAmount(row);
      return revised !== actual;
    },
    [catalogRowAmount, effectiveRowAmount]
  );

  const buildSelection = useCallback(
    (row: FeeStructure, mode: FeeHeadPaymentMode, amountOverride?: number): FeeHeadSelection => ({
      feeHeadId: String(row._id),
      feeHeadName: row.feeHeadName || '',
      feeHeadCode: row.feeHeadCode || '',
      amount:
        amountOverride !== undefined && Number.isFinite(Number(amountOverride))
          ? Number(amountOverride)
          : effectiveRowAmount(row),
      batch: selectedBatch,
      studentYear: typeof row.studentYear === 'number' ? row.studentYear : null,
      category: resolvedCategory || null,
      label: [
        row.feeHeadName || row.feeHeadCode || 'Fee head',
        typeof row.studentYear === 'number' ? `Year ${row.studentYear}` : null,
        selectedBatch ? `Batch ${selectedBatch}` : null,
      ]
        .filter(Boolean)
        .join(' · '),
      mode,
    }),
    [effectiveRowAmount, selectedBatch, resolvedCategory]
  );

  const commitInlineRevisedFee = (row: FeeStructure) => {
    const fallback = Number(effectiveRowAmount(row)) || Number(row.amount) || 0;
    const trimmed = inlineRevisedDraft.trim();
    const parsed = trimmed === '' ? fallback : Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setInlineEditingRowId(null);
      return;
    }
    patchStudentFeeLine(row, { amount: parsed, remarks: '' });
    setInlineEditingRowId(null);
  };

  const openEditRow = (row: FeeStructure) => {
    const sid = String(row._id);
    if (editingRowId === sid) {
      setEditingRowId(null);
      return;
    }
    setEditingRowId(sid);
    const o = lineOverrideByStructureId.get(sid);
    setEditDraft({
      // Always start with a concrete amount (catalog or override) so the input is never "undefined".
      amountStr: String(effectiveRowAmount(row) || 0),
      remarks: typeof o?.remarks === 'string' ? o.remarks : '',
    });
  };

  const applyEditDraftForRow = (row: FeeStructure) => {
    const v = editDraft.amountStr.trim();
    const remarks = editDraft.remarks;
    const fallback = Number(effectiveRowAmount(row)) || Number(row.amount) || 0;
    const n = v === '' ? fallback : Number(v);
    if (Number.isFinite(n) && n >= 0) patchStudentFeeLine(row, { amount: n, remarks });
  };

  const payFromPanel = (row: FeeStructure, mode: FeeHeadPaymentMode) => {
    if (!onSelectFeeHead) return;
    const catalog = Number(row.amount) || 0;
    const v = editDraft.amountStr.trim();
    let payAmount = catalog;
    if (v !== '') {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) payAmount = n;
    }
    patchStudentFeeLine(row, {
      amount: payAmount,
      remarks: editDraft.remarks,
    });
    onSelectFeeHead(buildSelection(row, mode, payAmount));
    setEditingRowId(null);
  };

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
    () => items.reduce((sum, row) => sum + effectiveRowAmount(row), 0),
    [items, effectiveRowAmount]
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
          {hasEditableFees ? (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
              {useInlineRevisedFeeEdit
                ? 'Actual Fee is from the Fee Management catalog. Edit Revised Fee inline in each row, then Save fee configuration.'
                : hideNotesAndScholarship && hasEditableFees
                  ? 'Click the pencil on a row to set a revised fee. Changed rows must be submitted for approval before syncing to the fee portal.'
                  : paymentViaEditPanel
                  ? 'Click the pencil on a row to set the student amount and notes, then use Cash or Cashfree to collect. Use Update line to save overrides without paying (included when you Save Draft).'
                  : 'Actual Fee is the configured catalog amount. Revised Fee is the student-specific amount saved with this joining.'}
            </p>
          ) : showDualFeeColumns ? (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
              Actual Fee is the catalog / linked amount. Revised Fee matches Actual unless you edit and save a concession.
            </p>
          ) : null}
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
              const yearTotal = rows.reduce((sum, row) => sum + effectiveRowAmount(row), 0);
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
                          <th className="px-4 py-2 text-right">
                            {showDualFeeColumns ? 'Actual Fee' : hasEditableFees ? 'Catalog' : 'Amount'}
                          </th>
                          {showDualFeeColumns && (
                            <th className="px-4 py-2 text-right">Revised Fee</th>
                          )}
                          {showDualFeeColumns && hasEditableFees && !hideNotesAndScholarship ? (
                            <th className="px-4 py-2 min-w-[140px]">Notes</th>
                          ) : null}
                          {hasAnyTerms && <th className="px-4 py-2">Terms</th>}
                          {!hideNotesAndScholarship && (
                            <th className="px-4 py-2 text-center">Scholarship?</th>
                          )}
                          {(onSelectFeeHead || hasEditableFees) && !useInlineRevisedFeeEdit && (
                            <th className="px-4 py-2 text-right">
                              {paymentViaEditPanel
                                ? 'Edit / pay'
                                : hasEditableFees
                                  ? 'Edit'
                                  : 'Action'}
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => {
                          const isActive =
                            !!activeFeeHeadId && String(activeFeeHeadId) === String(row._id);
                          const sid = String(row._id);
                          const isEditingRow = editingRowId === sid;
                          const panelColSpan =
                            3 +
                            (showDualFeeColumns ? 1 : 0) +
                            (showDualFeeColumns && hasEditableFees && !hideNotesAndScholarship ? 1 : 0) +
                            (hasAnyTerms ? 1 : 0) +
                            (!hideNotesAndScholarship ? 1 : 0) +
                            (onSelectFeeHead || (hasEditableFees && !useInlineRevisedFeeEdit) ? 1 : 0);
                          const cashfreeTitle = canUseCashfree
                            ? 'Collect this fee head via Cashfree UPI / QR'
                            : 'Cashfree is not configured. Update Payment Settings to enable.';

                          return (
                            <Fragment key={sid}>
                              <tr
                                className={`border-t border-slate-100 align-top text-slate-700 transition dark:border-slate-800 dark:text-slate-200 ${
                                  isActive
                                    ? 'bg-emerald-50/70 dark:bg-emerald-900/20'
                                    : isEditingRow
                                      ? 'bg-slate-50/90 dark:bg-slate-800/50'
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
                                {formatCurrency(catalogRowAmount(row))}
                              </td>
                              {showDualFeeColumns && (
                                <td className="px-4 py-3 text-right font-semibold text-emerald-800 dark:text-emerald-200">
                                  {useInlineRevisedFeeEdit ? (
                                    <div className="inline-flex min-w-[7rem] flex-col items-end gap-1">
                                      <input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        className="w-full max-w-[9rem] rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-right text-sm font-semibold text-emerald-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:border-emerald-900/50 dark:bg-slate-900/80 dark:text-emerald-100"
                                        value={
                                          inlineEditingRowId === sid
                                            ? inlineRevisedDraft
                                            : String(effectiveRowAmount(row))
                                        }
                                        onFocus={() => {
                                          setInlineEditingRowId(sid);
                                          setInlineRevisedDraft(String(effectiveRowAmount(row)));
                                        }}
                                        onChange={(event) => setInlineRevisedDraft(event.target.value)}
                                        onBlur={() => commitInlineRevisedFee(row)}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter') {
                                            event.currentTarget.blur();
                                          }
                                          if (event.key === 'Escape') {
                                            setInlineEditingRowId(null);
                                            event.currentTarget.blur();
                                          }
                                        }}
                                        aria-label={`Revised fee for ${row.feeHeadName || 'fee head'}`}
                                      />
                                      {isRowRevised(row) ? (
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                          Changed
                                        </span>
                                      ) : hasEditableFees ? (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                          Unchanged
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <div className="inline-flex items-center justify-end gap-2">
                                      <span>{formatCurrency(effectiveRowAmount(row))}</span>
                                      {isRowRevised(row) ? (
                                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                          Changed
                                        </span>
                                      ) : hasEditableFees ? (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                          Unchanged
                                        </span>
                                      ) : null}
                                    </div>
                                  )}
                                </td>
                              )}
                              {showDualFeeColumns && hasEditableFees && !hideNotesAndScholarship ? (
                                <td className="max-w-[11rem] px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                                  <span
                                    className="line-clamp-2 break-words"
                                    title={
                                      lineOverrideByStructureId.get(String(row._id))?.remarks?.trim() ||
                                      undefined
                                    }
                                  >
                                    {lineOverrideByStructureId.get(String(row._id))?.remarks?.trim() ||
                                      '—'}
                                  </span>
                                </td>
                              ) : null}
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
                              {!hideNotesAndScholarship && (
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
                              )}
                              {(onSelectFeeHead || hasEditableFees) && !useInlineRevisedFeeEdit && (
                                <td className="px-4 py-3 text-right">
                                  {hasEditableFees ? (
                                    <button
                                      type="button"
                                      onClick={() => openEditRow(row)}
                                      className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-200"
                                      aria-label={`Edit student amount for ${row.feeHeadName || 'fee head'}`}
                                      title="Edit revised fee"
                                    >
                                      <Pencil className="h-4 w-4" aria-hidden />
                                    </button>
                                  ) : onSelectFeeHead ? (
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => onSelectFeeHead(buildSelection(row, 'cash'))}
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
                                        onClick={() => onSelectFeeHead(buildSelection(row, 'online'))}
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
                                  ) : null}
                                </td>
                              )}
                            </tr>
                            {hasEditableFees && isEditingRow && !useInlineRevisedFeeEdit && (
                              <tr className="border-t border-emerald-100 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/25">
                                <td colSpan={panelColSpan} className="px-4 py-4">
                                  <div className="flex flex-col gap-4 rounded-xl border border-emerald-200 bg-white p-4 shadow-inner dark:border-emerald-900/50 dark:bg-slate-900/80">
                                    <div className="flex flex-wrap items-end gap-4">
                                      <div className="min-w-[10rem] flex-1">
                                        <label
                                          htmlFor={`fee-edit-amt-${sid}`}
                                          className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                                        >
                                          Revised fee (INR)
                                        </label>
                                        <input
                                          id={`fee-edit-amt-${sid}`}
                                          type="number"
                                          min={0}
                                          step="0.01"
                                          className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:border-emerald-900/50 dark:bg-slate-900/80 dark:text-slate-100"
                                          value={editDraft.amountStr}
                                          placeholder={String(Number(row.amount) || 0)}
                                          onChange={(event) =>
                                            setEditDraft((d) => ({
                                              ...d,
                                              amountStr: event.target.value,
                                            }))
                                          }
                                          aria-label={`Revised fee for ${row.feeHeadName || 'fee head'}`}
                                        />
                                      </div>
                                      {!hideNotesAndScholarship ? (
                                        <div className="min-w-[14rem] flex-[2]">
                                          <label
                                            htmlFor={`fee-edit-notes-${sid}`}
                                            className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                                          >
                                            Notes
                                          </label>
                                          <input
                                            id={`fee-edit-notes-${sid}`}
                                            type="text"
                                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100"
                                            value={editDraft.remarks}
                                            onChange={(event) =>
                                              setEditDraft((d) => ({
                                                ...d,
                                                remarks: event.target.value,
                                              }))
                                            }
                                            placeholder="Concession / note"
                                            aria-label={`Notes for ${row.feeHeadName || 'fee head'}`}
                                          />
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-700">
                                      <button
                                        type="button"
                                        onClick={() => applyEditDraftForRow(row)}
                                        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-400/50 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-emerald-700"
                                      >
                                        Update line
                                      </button>
                                      {onSelectFeeHead ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => payFromPanel(row, 'cash')}
                                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400/60"
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
                                            Cash payment
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => payFromPanel(row, 'online')}
                                            disabled={!canUseCashfree}
                                            className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-400/60 ${
                                              canUseCashfree
                                                ? 'border-blue-300 bg-white text-blue-700 hover:border-blue-400 hover:bg-blue-50 dark:border-blue-900/60 dark:bg-slate-900/70 dark:text-blue-200 dark:hover:bg-blue-950/40'
                                                : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500'
                                            }`}
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
                                        </>
                                      ) : null}
                                      <button
                                        type="button"
                                        onClick={() => setEditingRowId(null)}
                                        className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400/50 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                                      >
                                        Close
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
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
                {showDualFeeColumns
                  ? 'Total (revised fees)'
                  : hasEditableFees
                    ? 'Total (student-specific amounts where set)'
                    : 'Total course fee (all configured years)'}
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
