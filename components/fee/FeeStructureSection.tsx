'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { feeStructureAPI } from '@/lib/api';
import {
  classifyPrintFeeColumn,
  type PrintFeeColumn,
} from '@/lib/printApplicationFeeStructure';
import {
  normalizeOverallConcessionType,
  resolveOverallConcessionLine,
  type OverallConcessionLine,
} from '@/lib/overallConcessions';
import type { FeeStructure, JoiningStudentFeeDetails, JoiningStudentFeeLineOverride } from '@/types';

const SUMMARY_PIVOT_COLUMNS: ReadonlyArray<{ key: PrintFeeColumn; label: string }> = [
  { key: 'tuition', label: 'Tuition Fee' },
  { key: 'other', label: 'Others Fee' },
  { key: 'transport', label: 'Transport Fee' },
];

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

/** Solid black/white header row — high contrast, no accent colors. */
const FEE_TABLE_HEAD_ROW =
  'border-b border-slate-800 bg-slate-900 text-left text-xs font-semibold uppercase tracking-wide text-white dark:border-slate-200 dark:bg-slate-100 dark:text-slate-900';
const FEE_TABLE_HEAD_CELL = 'px-4 py-3 whitespace-nowrap text-white dark:text-slate-900';
const FEE_TABLE_HEAD_CELL_RIGHT = `${FEE_TABLE_HEAD_CELL} text-right`;
const FEE_TABLE_HEAD_CELL_CENTER = `${FEE_TABLE_HEAD_CELL} text-center`;
const FEE_TABLE_HEAD_SUBTEXT = 'text-[10px] font-normal normal-case tracking-normal text-slate-300 dark:text-slate-600';

const mapQuotaToCategory = (quota?: string | null): string | null => {
  if (!quota) return null;
  const key = quota.trim().toLowerCase();
  if (!key) return null;
  if (key.includes('lateral') && key.includes('entry')) return 'LATER';
  if (key === 'lateral spot' || (key.includes('lateral') && key.includes('spot'))) return 'LSPOT';
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
  studentStatus?: string | null;
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
  /**
   * When true, renders a single pivoted summary table instead of per-year grouped sub-tables.
   * Format matches the print application page 3 fee structure:
   *   Year | Fee Head 1 | Fee Head 2 | … | Total
   * Dual-fee mode (actual vs revised) is supported — each fee head column shows both amounts.
   */
  pivotView?: boolean;
  /**
   * When `pivotView` is true, `summary` collapses fee heads into Tuition / Others / Transport
   * columns (matches the printable application fee table). Default `all` keeps one column per head.
   */
  pivotFeeColumns?: 'all' | 'summary' | 'tuition-special-transport';
  /**
   * Student-specific concession/revised lines from the fee portal (`overall_concessions`).
   * When provided, per-row amounts resolve exactly like the joining workspace payment builder:
   * local override (by structureId or head+year) first, then the overall concession line, then catalog.
   */
  overallConcessionLines?: OverallConcessionLine[];
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
  studentStatus,
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
  pivotView = false,
  pivotFeeColumns = 'all',
  overallConcessionLines,
}: FeeStructureSectionProps) {
  const explicitCategory = String(category || '').trim();
  const resolvedCategory = useMemo(() => {
    if (category && category.trim()) return category.trim();

    const q = String(quota || '').trim().toUpperCase();
    const cleanBatch = String(batch || '').trim();
    const isLateral = String(studentStatus || '').trim().toLowerCase() === 'lateral';

    if (isLateral && cleanBatch === '2025') {
      if (q === 'CQ' || q.includes('CONV') || q.includes('LATER')) {
        return 'LATER';
      }
      if (q === 'SPOT' || q.includes('LSPOT')) {
        return 'LSPOT';
      }
    }

    return mapQuotaToCategory(quota);
  }, [category, quota, studentStatus, batch]);

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

  const queryEnabled = Boolean(
    cleanCourse || cleanBranch || explicitCategory || quota || selectedBatch
  );

  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'fee-structures',
      cleanCourse || null,
      cleanBranch || null,
      explicitCategory || null,
      !explicitCategory ? quota || null : null,
      selectedBatch || null,
      college || null,
      studentYear ?? null,
      studentStatus || null,
    ],
    enabled: queryEnabled,
    staleTime: 60_000,
    queryFn: async () => {
      const response: ApiListPayload = await feeStructureAPI.list({
        course: cleanCourse || undefined,
        branch: cleanBranch || undefined,
        // Match the joining workspace query exactly. When the caller supplied a quota,
        // let the backend apply its canonical quota → fee category mapping (including
        // CQ/lateral rules) rather than sending the UI's display-oriented category.
        category: explicitCategory || undefined,
        quota: !explicitCategory ? quota || undefined : undefined,
        batch: selectedBatch || undefined,
        college: college || undefined,
        studentYear: studentYear ?? undefined,
        studentStatus: studentStatus || undefined,
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
    let merged = base;
    if (injected.length > 0) {
      const injectedIds = new Set(injected.map((row) => String(row._id)));
      merged = [...base.filter((row) => !injectedIds.has(String(row._id))), ...injected];
    }

    // Builder-added heads (e.g. an "Others fee" revised fee added in the concession builder)
    // persist as override lines with a custom structureId and no catalog row. Synthesize rows
    // for them so they appear here (classified into Tuition / Others / Transport in pivot view).
    const knownIds = new Set(merged.map((row) => String(row._id)));
    // Head+year identities already covered by catalog rows — a saved line matching one of
    // these applies as an override on that row instead of becoming a duplicate custom row.
    const knownHeadYears = new Set<string>();
    for (const row of merged) {
      const year = Number(row.studentYear) || 1;
      const headId = String(row.feeHead ?? '').trim();
      const headCode = String(row.feeHeadCode ?? '').trim().toUpperCase();
      if (headId) knownHeadYears.add(`${headId}::${year}`);
      if (headCode) knownHeadYears.add(`code:${headCode}::${year}`);
    }
    const customRows: FeeStructure[] = [];
    for (const line of studentFeeDetails?.lines || []) {
      const sid = String(line.structureId || '').trim();
      if (!sid || knownIds.has(sid)) continue;
      if (!line.feeHeadId && !line.feeHeadCode && !line.feeHeadName) continue;
      const lineYear = Number(line.studentYear) > 0 ? Number(line.studentYear) : 1;
      const lineHeadId = String(line.feeHeadId || '').trim();
      const lineHeadCode = String(line.feeHeadCode || '').trim().toUpperCase();
      if (
        (lineHeadId && knownHeadYears.has(`${lineHeadId}::${lineYear}`)) ||
        (lineHeadCode && knownHeadYears.has(`code:${lineHeadCode}::${lineYear}`))
      ) {
        continue;
      }
      // A concession without a catalog base has nothing payable to display.
      if (line.concessionType === 'CONCESSION') continue;
      const amount = Number(line.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      customRows.push({
        _id: sid,
        id: sid,
        category: '',
        course: '',
        branch: '',
        college: '',
        studentYear: Number(line.studentYear) > 0 ? Number(line.studentYear) : 1,
        semester: null,
        batch: '',
        amount: 0,
        isScholarshipApplicable: false,
        feeHead: line.feeHeadId || null,
        feeHeadName: line.feeHeadName || line.feeHeadCode || 'Fee head',
        feeHeadCode: line.feeHeadCode || '',
        feeHeadDescription: '',
        terms: [],
        createdAt: null,
        updatedAt: null,
      });
    }
    return customRows.length > 0 ? [...merged, ...customRows] : merged;
  }, [data, injectedFeeRows, studentFeeDetails?.lines]);

  const hasEditableFees = Boolean(feeDetailsEditable && onStudentFeeDetailsChange);
  const showDualFeeColumns = showActualAndRevisedFees || hasEditableFees;
  const hideNotesAndScholarship = showActualAndRevisedFees;
  /** Step 4: pencil opens revised-fee panel; inline inputs only when not using dual columns. */
  const useInlineRevisedFeeEdit = false;
  /** Pencil first: open an edit panel, then Cash/Cashfree (joining workspace). */
  const paymentViaEditPanel = Boolean(hasEditableFees && onSelectFeeHead && !useInlineRevisedFeeEdit);

  /**
   * Admission view mode: show TUI01, Special Fee (OTH1), and transport only when
   * a transport row actually exists. Keeping the individual rows (rather than
   * summary buckets) preserves their exact head-wise amounts and codes.
   */
  const displayItems = useMemo(() => {
    if (pivotFeeColumns !== 'tuition-special-transport') return items;
    return items.filter((row) => {
      const code = String(row.feeHeadCode || '').trim().toUpperCase();
      const name = String(row.feeHeadName || '').trim().toUpperCase();
      if (code === 'TUI01') return true;
      if (code === 'OTH1' || name === 'SPECIAL FEE') return true;
      return classifyPrintFeeColumn(row) === 'transport';
    });
  }, [items, pivotFeeColumns]);

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

  /**
   * Saved builder lines keyed by fee head + year, so they still apply when the catalog row
   * ids differ (e.g. the view loads a different batch's structure documents than the batch
   * the concession was saved against). Only typed builder lines are indexed this way —
   * legacy direct-amount overrides remain structureId-only.
   */
  const lineOverrideByHeadYear = useMemo(() => {
    const m = new Map<string, JoiningStudentFeeLineOverride>();
    for (const line of studentFeeDetails?.lines || []) {
      if (!normalizeOverallConcessionType(line.concessionType)) continue;
      const year = Number(line.studentYear) > 0 ? Number(line.studentYear) : 1;
      const headId = String(line.feeHeadId || '').trim();
      const headCode = String(line.feeHeadCode || '').trim().toUpperCase();
      if (headId) m.set(`${headId}::${year}`, line);
      if (headCode) m.set(`code:${headCode}::${year}`, line);
    }
    return m;
  }, [studentFeeDetails?.lines]);

  /** Approved (and pending) concession/revised lines from the fee portal, keyed by head + year. */
  const overallConcessionByHeadYear = useMemo(() => {
    const m = new Map<string, OverallConcessionLine>();
    for (const line of overallConcessionLines || []) {
      if (!line || typeof line !== 'object') continue;
      const year = Number(line.studentYear) || 1;
      if (line.feeHeadId) m.set(`${String(line.feeHeadId)}::${year}`, line);
      if (line.feeHeadCode) m.set(`code:${String(line.feeHeadCode).toUpperCase()}::${year}`, line);
    }
    return m;
  }, [overallConcessionLines]);

  /**
   * Effective (payable) amount for a row — mirrors the joining workspace payment builder:
   * 1. a saved builder line with a concessionType (matched by structureId, then head+year)
   *    resolved against the catalog actual (CONCESSION = deduction, REVISED_FEE = new amount);
   * 2. a legacy direct-amount override matched by structureId;
   * 3. the overall_concessions line for that head+year from the fee portal;
   * 4. the catalog amount.
   */
  const effectiveRowAmount = useCallback(
    (row: FeeStructure) => {
      const catalog = Number(row.amount) || 0;
      const year = Number(row.studentYear) || 1;
      const headId = String(row.feeHead ?? '').trim();
      const headCode = String(row.feeHeadCode ?? '').trim().toUpperCase();

      const local =
        lineOverrideByStructureId.get(String(row._id)) ||
        (headId ? lineOverrideByHeadYear.get(`${headId}::${year}`) : undefined) ||
        (headCode ? lineOverrideByHeadYear.get(`code:${headCode}::${year}`) : undefined);

      if (local) {
        const amount =
          local.amount !== undefined && local.amount !== null ? Number(local.amount) : NaN;
        const type = normalizeOverallConcessionType(local.concessionType);
        if (type && Number.isFinite(amount) && amount > 0) {
          const resolved = resolveOverallConcessionLine(
            { concessionType: type, amount },
            catalog
          );
          if (resolved) return resolved.payableAmount;
        }
        if (!type && Number.isFinite(amount)) {
          return amount;
        }
      }

      const overall =
        (headId ? overallConcessionByHeadYear.get(`${headId}::${year}`) : undefined) ||
        (headCode ? overallConcessionByHeadYear.get(`code:${headCode}::${year}`) : undefined);
      if (overall) {
        const resolved = resolveOverallConcessionLine(overall, catalog);
        if (resolved) return resolved.payableAmount;
      }

      return catalog;
    },
    [lineOverrideByStructureId, lineOverrideByHeadYear, overallConcessionByHeadYear]
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
    for (const item of displayItems) {
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
  }, [displayItems]);

  const grandTotal = useMemo(
    () => displayItems.reduce((sum, row) => sum + effectiveRowAmount(row), 0),
    [displayItems, effectiveRowAmount]
  );

  // ---------------------------------------------------------------------------
  // Pivot table data (used when pivotView = true)
  // ---------------------------------------------------------------------------
  /**
   * Build pivot data: rows keyed by year, columns keyed by fee head identity.
   *
   * IMPORTANT: The column key must be the fee head's own identity (feeHead ObjectId
   * or feeHeadCode), NOT the structure row's _id — because each year has its own
   * separate structure document even though the fee head is the same. Keying by
   * row._id would create duplicate columns (one per year) for the same fee head.
   *
   * Key priority: row.feeHead (the linked feeheads._id) → row.feeHeadCode → row.feeHeadName
   */
  const pivotData = useMemo(() => {
    if (!pivotView) return null;

    const useSummaryColumns = pivotFeeColumns === 'summary';

    // Derive a stable column key that is shared across all years for the same fee head.
    const getFeeHeadKey = (row: FeeStructure): string => {
      if (useSummaryColumns) return classifyPrintFeeColumn(row);
      const byRef = String(row.feeHead ?? '').trim();
      if (byRef) return byRef;
      const byCode = String(row.feeHeadCode ?? '').trim();
      if (byCode) return byCode;
      const byName = String(row.feeHeadName ?? '').trim();
      if (byName) return byName;
      // Last resort — fall back to structure _id (means the head has no identity metadata)
      return String(row._id);
    };

    /**
     * Summary mode shows exactly three head groups: Tuition (TUI01), Others (OTH-coded
     * heads), and Transport (TRN/bus). Any other catalog head (e.g. APPL01 application
     * fee, ADM01 admission fee, HST01 hostel) is excluded from this table.
     */
    const isSummaryHeadIncluded = (row: FeeStructure): boolean => {
      const col = classifyPrintFeeColumn(row);
      if (col === 'tuition' || col === 'transport') return true;
      const code = String(row.feeHeadCode || '').trim().toUpperCase();
      const name = String(row.feeHeadName || '').trim().toLowerCase();
      return code.startsWith('OTH') || /\bothers?\b/.test(name);
    };

    // Collect distinct fee heads in first-seen insertion order
    const headOrder: string[] = useSummaryColumns
      ? SUMMARY_PIVOT_COLUMNS.map((col) => col.key)
      : [];
    const headMeta = new Map<string, { name: string; code: string; key: string }>();
    if (useSummaryColumns) {
      for (const col of SUMMARY_PIVOT_COLUMNS) {
        headMeta.set(col.key, { key: col.key, name: col.label, code: '' });
      }
    }
    // year → feeHeadKey → { catalog, revised }
    const yearHeadMap = new Map<number | string, Map<string, { catalog: number; revised: number }>>();
    // year → individual FeeStructure rows (for the edit panel)
    const yearRowsMap = new Map<number | string, FeeStructure[]>();

    for (const row of displayItems) {
      if (useSummaryColumns && !isSummaryHeadIncluded(row)) continue;
      const year = row.studentYear ?? 'all';
      const hkey = getFeeHeadKey(row);

      if (!headMeta.has(hkey)) {
        if (!useSummaryColumns) headOrder.push(hkey);
        headMeta.set(hkey, {
          key: hkey,
          name: row.feeHeadName || row.feeHeadCode || hkey,
          code: row.feeHeadCode || '',
        });
      } else if (useSummaryColumns) {
        const meta = headMeta.get(hkey)!;
        if (!meta.code && row.feeHeadCode) meta.code = row.feeHeadCode;
      }

      if (!yearHeadMap.has(year)) {
        yearHeadMap.set(year, new Map());
      }
      const yearMap = yearHeadMap.get(year)!;
      const existing = yearMap.get(hkey) || { catalog: 0, revised: 0 };
      existing.catalog += Number(row.amount) || 0;
      existing.revised += effectiveRowAmount(row);
      yearMap.set(hkey, existing);

      if (!yearRowsMap.has(year)) yearRowsMap.set(year, []);
      yearRowsMap.get(year)!.push(row);
    }

    // Sort years: numeric ascending, then 'all'
    const sortedYears = Array.from(yearHeadMap.keys()).sort((a, b) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      if (typeof a === 'number') return -1;
      if (typeof b === 'number') return 1;
      return 0;
    });

    return { headOrder, headMeta, yearHeadMap, yearRowsMap, sortedYears };
  }, [pivotView, pivotFeeColumns, displayItems, effectiveRowAmount]);

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
        ) : pivotView && pivotData ? (
          /* ------------------------------------------------------------------ */
          /* PIVOT TABLE — matches print application page 3 fee structure layout */
          /* Row per year × column per fee head, with a Total column + row.      */
          /* Pencil on each year row expands an inline edit panel for that year. */
          /* ------------------------------------------------------------------ */
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className={FEE_TABLE_HEAD_ROW}>
                  <th className={FEE_TABLE_HEAD_CELL}>Year</th>
                  {pivotData.headOrder.map((hid) => {
                    const meta = pivotData.headMeta.get(hid)!;
                    return (
                      <th key={hid} className={FEE_TABLE_HEAD_CELL_RIGHT}>
                        <div>{meta.name}</div>
                        {meta.code && (
                          <div className={FEE_TABLE_HEAD_SUBTEXT}>
                            {meta.code}
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th className={FEE_TABLE_HEAD_CELL_RIGHT}>Total</th>
                  {hasEditableFees && (
                    <th className={`${FEE_TABLE_HEAD_CELL_CENTER} w-12`} aria-label="Edit" />
                  )}
                </tr>
              </thead>
              <tbody>
                {pivotData.sortedYears.map((year, rowIdx) => {
                  const yearMap = pivotData.yearHeadMap.get(year)!;
                  const yearRows = pivotData.yearRowsMap.get(year) ?? [];
                  const yearLabel = typeof year === 'number' ? `Year ${year}` : 'All Years';
                  const rowYearTotal = Array.from(yearMap.values()).reduce(
                    (s, cell) => s + (showDualFeeColumns ? cell.revised : cell.catalog),
                    0
                  );
                  const isEven = rowIdx % 2 === 0;
                  const yearKey = String(year);
                  const isEditingYear = editingRowId === `pivot-year-${yearKey}`;
                  // Total columns = Year + fee head columns + Total + optional pencil
                  const pivotColSpan =
                    1 + pivotData.headOrder.length + 1 + (hasEditableFees ? 1 : 0);
                  // Check if any row in this year has been revised
                  const yearHasRevised = yearRows.some((r) => isRowRevised(r));

                  return (
                    <Fragment key={yearKey}>
                      <tr
                        className={`border-t border-slate-100 dark:border-slate-800 ${
                          isEditingYear
                            ? 'bg-slate-50/90 dark:bg-slate-800/50'
                            : isEven
                            ? 'bg-white dark:bg-slate-900/60'
                            : 'bg-slate-50/60 dark:bg-slate-800/40'
                        }`}
                      >
                        <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {yearLabel}
                            {yearHasRevised && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                Revised
                              </span>
                            )}
                          </div>
                        </td>
                        {pivotData.headOrder.map((hid) => {
                          const cell = yearMap.get(hid);
                          const catalogAmt = cell?.catalog ?? null;
                          const revisedAmt = cell?.revised ?? null;
                          const displayAmt = showDualFeeColumns ? revisedAmt : catalogAmt;
                          const isChanged =
                            showDualFeeColumns &&
                            catalogAmt !== null &&
                            revisedAmt !== null &&
                            revisedAmt !== catalogAmt;
                          return (
                            <td key={hid} className="px-4 py-3 text-right text-slate-700 dark:text-slate-200 whitespace-nowrap">
                              {displayAmt !== null && displayAmt > 0 ? (
                                <div className="inline-flex flex-col items-end gap-0.5">
                                  <span className="font-semibold">{formatCurrency(displayAmt)}</span>
                                  {isChanged && catalogAmt !== null && catalogAmt > 0 && (
                                    <span className="text-[10px] text-slate-400 line-through">
                                      {formatCurrency(catalogAmt)}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right font-bold text-emerald-800 dark:text-emerald-200 whitespace-nowrap">
                          {formatCurrency(rowYearTotal)}
                        </td>
                        {hasEditableFees && (
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                const panelKey = `pivot-year-${yearKey}`;
                                if (editingRowId === panelKey) {
                                  setEditingRowId(null);
                                } else {
                                  setEditingRowId(panelKey);
                                }
                              }}
                              className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-400/60 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-200"
                              aria-label={`Edit fees for ${yearLabel}`}
                              title={`Edit revised fees for ${yearLabel}`}
                            >
                              <Pencil className="h-4 w-4" aria-hidden />
                            </button>
                          </td>
                        )}
                      </tr>

                      {/* Inline edit panel — expands below the year row */}
                      {hasEditableFees && isEditingYear && yearRows.length > 0 && (
                        <tr className="border-t border-emerald-100 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                          <td colSpan={pivotColSpan} className="px-4 py-4">
                            <div className="rounded-xl border border-emerald-200 bg-white p-4 shadow-inner dark:border-emerald-900/50 dark:bg-slate-900/80">
                              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                                Edit revised fees — {yearLabel}
                              </p>
                              <div className="space-y-3">
                                {yearRows.map((row) => {
                                  const sid = String(row._id);
                                  const catalogAmt = catalogRowAmount(row);
                                  const o = lineOverrideByStructureId.get(sid);
                                  const currentRevised = effectiveRowAmount(row);
                                  const hasOverride = isRowRevised(row);
                                  return (
                                    <div
                                      key={sid}
                                      className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60"
                                    >
                                      <div className="min-w-[10rem] flex-1">
                                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                          {row.feeHeadName || row.feeHeadCode || '—'}
                                          {row.feeHeadCode && (
                                            <span className="ml-1.5 font-mono text-[10px] text-slate-400">
                                              {row.feeHeadCode}
                                            </span>
                                          )}
                                        </p>
                                        <p className="text-[11px] text-slate-400">
                                          Catalog: {formatCurrency(catalogAmt)}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <label
                                          htmlFor={`pivot-fee-amt-${sid}`}
                                          className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                                        >
                                          Revised (₹)
                                        </label>
                                        <input
                                          id={`pivot-fee-amt-${sid}`}
                                          type="number"
                                          min={0}
                                          step="0.01"
                                          className="w-32 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-right text-sm font-semibold text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:border-emerald-900/50 dark:bg-slate-900/80 dark:text-slate-100"
                                          defaultValue={currentRevised}
                                          key={`${sid}-${currentRevised}`}
                                          onBlur={(e) => {
                                            const v = e.target.value.trim();
                                            const n = v === '' ? catalogAmt : Number(v);
                                            if (Number.isFinite(n) && n >= 0) {
                                              patchStudentFeeLine(row, {
                                                amount: n,
                                                remarks: o?.remarks ?? '',
                                              });
                                            }
                                          }}
                                          aria-label={`Revised fee for ${row.feeHeadName || 'fee head'}`}
                                        />
                                        {hasOverride && (
                                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold uppercase text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                                            Changed
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex min-w-[10rem] flex-1 items-center gap-2">
                                        <label
                                          htmlFor={`pivot-fee-notes-${sid}`}
                                          className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                                        >
                                          Notes
                                        </label>
                                        <input
                                          id={`pivot-fee-notes-${sid}`}
                                          type="text"
                                          className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400 dark:border-slate-600 dark:bg-slate-900/80 dark:text-slate-100"
                                          defaultValue={o?.remarks ?? ''}
                                          key={`${sid}-notes-${o?.remarks ?? ''}`}
                                          onBlur={(e) => {
                                            patchStudentFeeLine(row, {
                                              amount: currentRevised,
                                              remarks: e.target.value,
                                            });
                                          }}
                                          placeholder="Concession / note"
                                          aria-label={`Notes for ${row.feeHeadName || 'fee head'}`}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="mt-3 flex justify-end border-t border-slate-100 pt-3 dark:border-slate-700">
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
              <tfoot>
                <tr className="border-t-2 border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <td className="px-4 py-3 font-bold text-emerald-900 dark:text-emerald-100 whitespace-nowrap">
                    Total
                  </td>
                  {pivotData.headOrder.map((hid) => {
                    const colTotal = Array.from(pivotData.yearHeadMap.values()).reduce(
                      (s, yearMap) => {
                        const cell = yearMap.get(hid);
                        return s + (cell ? (showDualFeeColumns ? cell.revised : cell.catalog) : 0);
                      },
                      0
                    );
                    return (
                      <td key={hid} className="px-4 py-3 text-right font-bold text-emerald-900 dark:text-emerald-100 whitespace-nowrap">
                        {colTotal > 0 ? formatCurrency(colTotal) : <span className="text-slate-400">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right text-lg font-bold text-emerald-900 dark:text-emerald-100 whitespace-nowrap">
                    {formatCurrency(grandTotal)}
                  </td>
                  {hasEditableFees && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
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
                      <thead>
                        <tr className={FEE_TABLE_HEAD_ROW}>
                          <th className={FEE_TABLE_HEAD_CELL}>Fee Head</th>
                          <th className={FEE_TABLE_HEAD_CELL}>Code</th>
                          <th className={FEE_TABLE_HEAD_CELL_RIGHT}>
                            {showDualFeeColumns ? 'Actual Fee' : hasEditableFees ? 'Catalog' : 'Amount'}
                          </th>
                          {showDualFeeColumns && (
                            <th className={FEE_TABLE_HEAD_CELL_RIGHT}>Revised Fee</th>
                          )}
                          {showDualFeeColumns && hasEditableFees && !hideNotesAndScholarship ? (
                            <th className={`${FEE_TABLE_HEAD_CELL} min-w-[140px]`}>Notes</th>
                          ) : null}
                          {hasAnyTerms && <th className={FEE_TABLE_HEAD_CELL}>Terms</th>}
                          {!hideNotesAndScholarship && (
                            <th className={FEE_TABLE_HEAD_CELL_CENTER}>Scholarship?</th>
                          )}
                          {(onSelectFeeHead || hasEditableFees) && !useInlineRevisedFeeEdit && (
                            <th className={FEE_TABLE_HEAD_CELL_RIGHT}>
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
