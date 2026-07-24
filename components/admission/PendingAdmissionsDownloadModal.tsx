'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { admissionAPI, courseAPI } from '@/lib/api';
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
import {
  mergeQuotaSelectOptions,
  parseStudentQuotasResponse,
  quotaLabelsFromCatalog,
} from '@/lib/studentQuotaCatalog';
import { escapePrintHtml, printHtmlDocument } from '@/lib/printHtml';
import { Download, MessageSquare, Printer } from 'lucide-react';
import {
  resolveMinimumFeeAmount,
  type MinimumFeeConfigEntry,
} from '@/components/admission/MinimumFeeConfigDialog';

export type PendingDocumentsDeskFilters = {
  collegeId?: string;
  courseId?: string;
  courseName?: string;
  branchId?: string;
  branchName?: string;
  startDate?: string;
  endDate?: string;
};

type CollegeOption = { id: string; name: string };

type PendingAdmissionsDownloadModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colleges: CollegeOption[];
  initialCollegeId?: string;
  deskFilters?: PendingDocumentsDeskFilters;
  /** From Student Info Config popup — drives unpaid amounts + Print PDF. */
  minimumFeeConfigs?: MinimumFeeConfigEntry[];
};

type PendingFeeRow = {
  id: string;
  admissionNumber: string;
  studentName: string;
  parentMobile: string;
  studentMobile: string;
  quota: string;
  course: string;
  branch: string;
  tuitionPayable?: number;
  tuitionPaid?: number;
  tuitionPending?: number;
  otherPayable?: number;
  otherPaid?: number;
  otherPending?: number;
  totalPayable?: number;
  totalPaid?: number;
  totalPending?: number;
  hasFeeEntry: boolean;
  feeStatus: 'paid' | 'unpaid' | 'no_entry';
  displayLabel: string;
  displayAmount: number;
};

type PendingDocsRow = {
  id: string;
  admissionNumber: string;
  studentName: string;
  parentMobile: string;
  studentMobile: string;
  quota: string;
  course: string;
  branch: string;
  importantDocumentsPending?: string[];
  otherDocumentsPending?: string[];
  importantDocumentsPendingText?: string;
  otherDocumentsPendingText?: string;
  pendingCertificatesText?: string;
};

type CombinedPendingRow = PendingFeeRow & PendingDocsRow;

const PAGE_LIMIT = 20;

const selectClassName =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900';

const tableThClass =
  'px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:px-4';
const tableTdClass = 'px-3 py-2.5 text-sm text-slate-700 sm:px-4 dark:text-slate-300';

const formatInr = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

const FEE_UNPAID_TOLERANCE = 0.5;

/**
 * Unpaid uses Year-1 tuition + other by default.
 * When a matching minimum fee config exists for the row, unpaid is
 * max(minFee − paid, 0) instead of full tuition + other remaining.
 */
function resolvePendingFeeAmounts(
  row: Pick<
    PendingFeeRow,
    | 'totalPayable'
    | 'tuitionPayable'
    | 'otherPayable'
    | 'totalPaid'
    | 'tuitionPaid'
    | 'totalPending'
    | 'quota'
    | 'course'
  >,
  minimumFeeConfigs: MinimumFeeConfigEntry[],
  filterContext?: {
    collegeId?: string;
    courseId?: string;
    courseName?: string;
    quota?: string;
  }
) {
  const totalPaid = Number(row.totalPaid ?? row.tuitionPaid ?? 0) || 0;
  const fullPayable =
    Number(row.totalPayable ?? (row.tuitionPayable || 0) + (row.otherPayable || 0)) || 0;
  const minimumFeeRequired = resolveMinimumFeeAmount(minimumFeeConfigs, {
    collegeId: filterContext?.collegeId,
    courseId: filterContext?.courseId,
    courseName: row.course || filterContext?.courseName,
    quota: row.quota || filterContext?.quota,
  });
  const usingMinFee = minimumFeeRequired > FEE_UNPAID_TOLERANCE;
  const requiredAmount = usingMinFee ? minimumFeeRequired : fullPayable;
  const unpaid = usingMinFee
    ? Math.max(requiredAmount - totalPaid, 0)
    : Number(row.totalPending ?? Math.max(fullPayable - totalPaid, 0)) || 0;

  return {
    fullPayable,
    requiredAmount,
    totalPaid,
    unpaid,
    usingMinFee,
    minimumFeeRequired,
  };
}

/** True when this row should appear on the fee-pending list (vs min fee when configured). */
function isFeeStillPending(
  row: Pick<
    PendingFeeRow,
    | 'totalPayable'
    | 'tuitionPayable'
    | 'otherPayable'
    | 'totalPaid'
    | 'tuitionPaid'
    | 'totalPending'
    | 'quota'
    | 'course'
    | 'feeStatus'
  >,
  minimumFeeConfigs: MinimumFeeConfigEntry[],
  filterContext?: {
    collegeId?: string;
    courseId?: string;
    courseName?: string;
    quota?: string;
  }
) {
  if (!minimumFeeConfigs.length) {
    return row.feeStatus === 'unpaid' || Number(row.totalPending || 0) > FEE_UNPAID_TOLERANCE;
  }
  const { unpaid, usingMinFee } = resolvePendingFeeAmounts(
    row,
    minimumFeeConfigs,
    filterContext
  );
  // Configured quota/course: only below-minimum students are "pending".
  if (usingMinFee) return unpaid > FEE_UNPAID_TOLERANCE;
  // No matching config for this row — keep original tuition+other pending rule.
  return row.feeStatus === 'unpaid' || Number(row.totalPending || 0) > FEE_UNPAID_TOLERANCE;
}

function FeeStatusCell({
  feeStatus,
  displayLabel,
  displayAmount,
  hasFeeEntry,
}: {
  feeStatus: 'paid' | 'unpaid' | 'no_entry';
  displayLabel: string;
  displayAmount: number;
  hasFeeEntry: boolean;
}) {
  if (!hasFeeEntry || feeStatus === 'no_entry') {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          Pending
        </span>
        <span className="text-xs font-semibold text-slate-500">{formatInr(0)}</span>
      </div>
    );
  }

  if (feeStatus === 'paid') {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          Paid
        </span>
        <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
          {formatInr(0)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        {displayLabel || 'Unpaid'}
      </span>
      <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
        {formatInr(displayAmount)}
      </span>
    </div>
  );
}

function StatusBadge({
  label,
  variant,
}: {
  label: string;
  variant: 'primary' | 'success' | 'warning';
}) {
  const className =
    variant === 'success'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
      : variant === 'warning'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

export function PendingAdmissionsDownloadModal({
  open,
  onOpenChange,
  colleges,
  initialCollegeId = '',
  deskFilters,
  minimumFeeConfigs = [],
}: PendingAdmissionsDownloadModalProps) {
  const [view, setView] = useState<'combined' | 'fee' | 'documents'>('combined');
  const [collegeId, setCollegeId] = useState(initialCollegeId);
  const [courseId, setCourseId] = useState('');
  const [quota, setQuota] = useState('');
  const [page, setPage] = useState(1);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [confirmBulkSmsOpen, setConfirmBulkSmsOpen] = useState(false);

  const hasAnyMinimumFeeConfig = minimumFeeConfigs.length > 0;

  useEffect(() => {
    if (!open) return;
    setView('combined');
    setCollegeId(initialCollegeId || '');
    setCourseId('');
    setQuota('');
    setPage(1);
    setHasLoadedOnce(false);
    setSelectedIds(new Set());
    setConfirmBulkSmsOpen(false);
  }, [open, initialCollegeId]);
  
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [view]);

  const { data: coursesData, isLoading: coursesLoading } = useQuery({
    queryKey: ['courses', 'list', 'pending-combined', collegeId],
    queryFn: async () => {
      const response = await courseAPI.list({
        showInactive: false,
        collegeId: collegeId || undefined,
      });
      return response.data || response;
    },
    enabled: open,
    staleTime: 120_000,
  });

  const courses = useMemo(() => {
    const list = Array.isArray(coursesData) ? coursesData : (coursesData as any)?.data || [];
    if (!collegeId) return list as Array<{ id?: string; _id?: string; name?: string; collegeId?: string }>;
    return (list as Array<{ id?: string; _id?: string; name?: string; collegeId?: string }>).filter(
      (c) => c.collegeId != null && String(c.collegeId).trim() === collegeId
    );
  }, [coursesData, collegeId]);

  const selectedCourseName = useMemo(() => {
    const match = courses.find((c) => String(c.id ?? c._id ?? '').trim() === courseId);
    return match?.name ? String(match.name) : '';
  }, [courses, courseId]);

  const minFeeFilterContext = useMemo(
    () => ({
      collegeId: collegeId || deskFilters?.collegeId || undefined,
      courseId: courseId || deskFilters?.courseId || undefined,
      courseName: selectedCourseName || deskFilters?.courseName || undefined,
      quota: quota || undefined,
    }),
    [
      collegeId,
      courseId,
      selectedCourseName,
      quota,
      deskFilters?.collegeId,
      deskFilters?.courseId,
      deskFilters?.courseName,
    ]
  );

  const { data: studentQuotasResponse, isLoading: quotasLoading } = useQuery({
    queryKey: ['courses', 'student-quotas', 'pending-combined'],
    queryFn: async () => courseAPI.listStudentQuotas(),
    enabled: open,
    staleTime: 120_000,
  });

  const quotaOptions = useMemo(
    () =>
      mergeQuotaSelectOptions(
        quotaLabelsFromCatalog(parseStudentQuotasResponse(studentQuotasResponse)),
        quota
      ),
    [studentQuotasResponse, quota]
  );

  const filterParams = useMemo(
    () => ({
      collegeId: collegeId || deskFilters?.collegeId || undefined,
      courseId: courseId || deskFilters?.courseId || undefined,
      courseName: selectedCourseName || deskFilters?.courseName || undefined,
      branchId: deskFilters?.branchId || undefined,
      branchName: deskFilters?.branchName || undefined,
      startDate: deskFilters?.startDate || undefined,
      endDate: deskFilters?.endDate || undefined,
      quota: quota || undefined,
      // When min-fee config is active we filter client-side — need the full fee set.
      ...(view !== 'combined' && !hasAnyMinimumFeeConfig
        ? { page, limit: PAGE_LIMIT }
        : { limit: 1000, ...(hasAnyMinimumFeeConfig ? { all: true } : {}) }),
    }),
    [
      collegeId,
      courseId,
      selectedCourseName,
      quota,
      deskFilters,
      page,
      view,
      hasAnyMinimumFeeConfig,
    ]
  );

  const {
    data: pendingFeesData,
    isLoading: pendingFeesLoading,
    isFetching: pendingFeesFetching,
    refetch: refetchFees,
  } = useQuery({
    queryKey: ['admissions', 'pending-fees', filterParams],
    queryFn: async () => admissionAPI.listPendingFees(filterParams),
    enabled: open && hasLoadedOnce,
    staleTime: 30_000,
  });

  const {
    data: pendingDocsData,
    isLoading: pendingDocsLoading,
    isFetching: pendingDocsFetching,
    refetch: refetchDocs,
  } = useQuery({
    queryKey: ['admissions', 'pending-certificates', filterParams],
    queryFn: async () => admissionAPI.listPendingCertificates(filterParams),
    enabled: open && hasLoadedOnce,
    staleTime: 30_000,
  });

  const combinedRows = useMemo(() => {
    if (!pendingFeesData?.rows?.length && !pendingDocsData?.rows?.length) return [] as CombinedPendingRow[];

    const feeMap = new Map<string, PendingFeeRow>();
    (pendingFeesData?.rows || []).forEach((row: PendingFeeRow) => {
      feeMap.set(row.id, row);
    });

    const combined: CombinedPendingRow[] = [];

    (pendingDocsData?.rows || []).forEach((row: PendingDocsRow) => {
      const matchingFee = feeMap.get(row.id);
      combined.push({
        ...(matchingFee ?? {
          id: row.id,
          admissionNumber: row.admissionNumber,
          studentName: row.studentName,
          parentMobile: row.parentMobile,
          studentMobile: row.studentMobile,
          quota: row.quota,
          course: row.course,
          branch: row.branch,
          hasFeeEntry: false,
          feeStatus: 'no_entry',
          displayLabel: 'Pending',
          displayAmount: 0,
        }),
        ...row,
      });
      if (matchingFee) {
        feeMap.delete(row.id);
      }
    });

    feeMap.forEach((feeRow) => {
      combined.push({
        ...feeRow,
        importantDocumentsPending: [],
        otherDocumentsPending: [],
      });
    });

    return combined;
  }, [pendingFeesData?.rows, pendingDocsData?.rows]);

  /** Fee rows still pending after applying minimum-fee config (when set). */
  const pendingFeeRows = useMemo(() => {
    const rows = (pendingFeesData?.rows || []) as PendingFeeRow[];
    if (!hasAnyMinimumFeeConfig) return rows;
    return rows.filter((row) =>
      isFeeStillPending(row, minimumFeeConfigs, minFeeFilterContext)
    );
  }, [pendingFeesData?.rows, hasAnyMinimumFeeConfig, minimumFeeConfigs, minFeeFilterContext]);

  /**
   * Combined pending list when min fee is active: only students still below minimum.
   * (Docs columns remain as context — fee-settled-vs-min students are excluded.)
   */
  const pendingCombinedRows = useMemo(() => {
    if (!hasAnyMinimumFeeConfig) return combinedRows;

    const docsById = new Map<string, PendingDocsRow>();
    (pendingDocsData?.rows || []).forEach((row: PendingDocsRow) => {
      docsById.set(row.id, row);
    });

    return pendingFeeRows.map((feeRow) => {
      const docs = docsById.get(feeRow.id);
      return {
        ...feeRow,
        importantDocumentsPending: docs?.importantDocumentsPending || [],
        otherDocumentsPending: docs?.otherDocumentsPending || [],
        importantDocumentsPendingText: docs?.importantDocumentsPendingText,
        otherDocumentsPendingText: docs?.otherDocumentsPendingText,
        pendingCertificatesText: docs?.pendingCertificatesText,
      } as CombinedPendingRow;
    });
  }, [
    hasAnyMinimumFeeConfig,
    combinedRows,
    pendingFeeRows,
    pendingDocsData?.rows,
  ]);

  const minFeeListStats = useMemo(() => {
    if (!hasAnyMinimumFeeConfig) return null;
    const allFeeRows = (pendingFeesData?.rows || []) as PendingFeeRow[];
    let metMinimum = 0;
    let belowMinimum = 0;
    let noMatch = 0;
    for (const row of allFeeRows) {
      const { unpaid, usingMinFee } = resolvePendingFeeAmounts(
        row,
        minimumFeeConfigs,
        minFeeFilterContext
      );
      if (!usingMinFee) {
        noMatch += 1;
        continue;
      }
      if (unpaid > FEE_UNPAID_TOLERANCE) belowMinimum += 1;
      else metMinimum += 1;
    }
    return { metMinimum, belowMinimum, noMatch, evaluated: allFeeRows.length };
  }, [
    hasAnyMinimumFeeConfig,
    pendingFeesData?.rows,
    minimumFeeConfigs,
    minFeeFilterContext,
  ]);

  const currentPendingData =
    view === 'fee' ? pendingFeesData : view === 'documents' ? pendingDocsData : undefined;
  const currentRows =
    view === 'combined'
      ? pendingCombinedRows
      : view === 'fee'
      ? pendingFeeRows
      : currentPendingData?.rows ?? [];
  
  const currentPageRows = useMemo(() => {
    if (view === 'combined' || (view === 'fee' && hasAnyMinimumFeeConfig)) {
      const start = (page - 1) * PAGE_LIMIT;
      const end = start + PAGE_LIMIT;
      return currentRows.slice(start, end);
    }
    return currentRows;
  }, [view, currentRows, page, hasAnyMinimumFeeConfig]);
  
  const currentPagination =
    view === 'combined' || (view === 'fee' && hasAnyMinimumFeeConfig)
      ? {
          page: page,
          pages: Math.max(1, Math.ceil(currentRows.length / PAGE_LIMIT)),
          limit: PAGE_LIMIT,
          total: currentRows.length,
        }
      : currentPendingData?.pagination ?? {
          page: 1,
          pages: 1,
          limit: PAGE_LIMIT,
          total: currentPendingData?.total ?? 0,
        };
  const currentTotal =
    view === 'combined' || (view === 'fee' && hasAnyMinimumFeeConfig)
      ? currentRows.length
      : currentPendingData?.total ?? 0;
  const currentLoading =
    view === 'fee'
      ? pendingFeesLoading || pendingFeesFetching
      : view === 'documents'
      ? pendingDocsLoading || pendingDocsFetching
      : pendingFeesLoading || pendingDocsLoading || pendingFeesFetching || pendingDocsFetching;

  const selectableRowIds = useMemo(
    () => currentRows.map((row) => String(row.id)).filter(Boolean),
    [currentRows]
  );

  const selectedCount = selectedIds.size;
  const allSelectableSelected =
    selectableRowIds.length > 0 && selectableRowIds.every((id) => selectedIds.has(id));
  const someSelectableSelected =
    selectableRowIds.some((id) => selectedIds.has(id)) && !allSelectableSelected;

  const pageSelectableIds = useMemo(
    () => currentPageRows.map((row) => String(row.id)).filter(Boolean),
    [currentPageRows]
  );
  const allPageSelected =
    pageSelectableIds.length > 0 && pageSelectableIds.every((id) => selectedIds.has(id));

  const toggleRowSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAllLoaded = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        selectableRowIds.forEach((id) => next.add(id));
      } else {
        selectableRowIds.forEach((id) => next.delete(id));
      }
      return next;
    });
  };

  const toggleSelectAllPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        pageSelectableIds.forEach((id) => next.add(id));
      } else {
        pageSelectableIds.forEach((id) => next.delete(id));
      }
      return next;
    });
  };

  const bulkSmsMutation = useMutation({
    mutationFn: async (admissionIds: string[]) =>
      admissionAPI.sendDocumentNotificationSmsBulk(admissionIds),
    onSuccess: (response) => {
      const data = (response?.data || response) as {
        sent?: number;
        skipped?: number;
        failed?: number;
        message?: string;
      };
      const sent = Number(data?.sent ?? 0);
      const skipped = Number(data?.skipped ?? 0);
      const failed = Number(data?.failed ?? 0);
      if (sent > 0 && failed === 0) {
        showToast.success(
          `Important Documents SMS sent to ${sent} student(s)${
            skipped ? ` (${skipped} skipped — no pending important docs or phone)` : ''
          }.`
        );
      } else if (sent > 0) {
        showToast.success(
          `Sent ${sent}, skipped ${skipped}, failed ${failed}. SMS uses Important Documents only.`
        );
      } else {
        showToast.error(
          `No SMS sent — skipped ${skipped}, failed ${failed}. Students need pending Important Documents and a valid phone.`
        );
      }
      setSelectedIds(new Set());
      setConfirmBulkSmsOpen(false);
    },
    onError: (error: any) => {
      showToast.error(
        error?.response?.data?.message || error?.message || 'Failed to send bulk document SMS'
      );
    },
  });

  const totalStudents = Math.max(
    pendingFeesData?.stats?.totalStudents ?? 0,
    pendingDocsData?.stats?.totalStudents ?? 0
  );
  const feePaidStudents = minFeeListStats
    ? minFeeListStats.metMinimum
    : pendingFeesData?.stats?.tuitionPaidStudents ?? 0;
  const feeUnpaidStudents = minFeeListStats
    ? minFeeListStats.belowMinimum
    : pendingFeesData?.stats?.tuitionUnpaidStudents ?? 0;
  const feeNoEntryStudents = pendingFeesData?.stats?.tuitionNoEntryStudents ?? 0;
  const importantPendingStudents = pendingDocsData?.stats?.importantPendingStudents ?? 0;
  const otherPendingStudents = pendingDocsData?.stats?.otherPendingStudents ??
    pendingDocsData?.stats?.pendingStudents ??
    0;

  const handleLoad = async () => {
    setPage(1);
    if (!hasLoadedOnce) {
      setHasLoadedOnce(true);
      return;
    }
    if (view === 'fee') {
      await refetchFees();
    } else if (view === 'documents') {
      await refetchDocs();
    } else {
      await Promise.all([refetchFees(), refetchDocs()]);
    }
  };

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      if (!hasLoadedOnce) {
        setHasLoadedOnce(true);
      }
      const { page: _page, limit: _limit, ...exportFilters } = filterParams;
      const blob =
        view === 'fee'
          ? await admissionAPI.exportPendingFees(exportFilters)
          : view === 'documents'
          ? await admissionAPI.exportPendingCertificates(exportFilters)
          : await admissionAPI.exportPendingFees(exportFilters);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      const date = new Date().toISOString().split('T')[0];
      link.setAttribute(
        'download',
        view === 'fee'
          ? `pending_fees_${date}.xlsx`
          : view === 'documents'
          ? `pending_documents_${date}.xlsx`
          : `pending_combined_${date}.xlsx`
      );
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast.success(
        view === 'fee'
          ? 'Pending fees export started'
          : view === 'documents'
          ? 'Pending documents export started'
          : 'Pending combined export started'
      );
    } catch (error) {
      console.error('Error exporting pending records:', error);
      showToast.error(
        view === 'fee'
          ? 'Failed to export pending fees. Please try again.'
          : view === 'documents'
          ? 'Failed to export pending documents. Please try again.'
          : 'Failed to export pending combined data. Please try again.'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrintPdf = async () => {
    try {
      setIsPrinting(true);
      if (!hasLoadedOnce) {
        setHasLoadedOnce(true);
      }
      const { page: _page, limit: _limit, ...baseFilters } = filterParams;
      const printData =
        view === 'fee'
          ? await admissionAPI.listPendingFees({ ...baseFilters, all: true })
          : view === 'documents'
          ? await admissionAPI.listPendingCertificates({ ...baseFilters, all: true })
          : null;
      const feePrintData =
        view === 'combined' ? await admissionAPI.listPendingFees({ ...baseFilters, all: true }) : null;
      const docsPrintData =
        view === 'combined' ? await admissionAPI.listPendingCertificates({ ...baseFilters, all: true }) : null;
      const printRows =
        view === 'fee'
          ? printData?.rows ?? []
          : view === 'documents'
          ? printData?.rows ?? []
          : [];
      const combinedPrintRows =
        view === 'combined'
          ? (() => {
              const feeRows = feePrintData?.rows ?? [];
              const docsRows = docsPrintData?.rows ?? [];
              const feeMap = new Map<string, PendingFeeRow>();
              feeRows.forEach((row: PendingFeeRow) => feeMap.set(row.id, row));
              const combined: CombinedPendingRow[] = [];
              docsRows.forEach((row: PendingDocsRow) => {
                const matchingFee = feeMap.get(row.id);
                combined.push({
                  ...(matchingFee ?? {
                    id: row.id,
                    admissionNumber: row.admissionNumber,
                    studentName: row.studentName,
                    parentMobile: row.parentMobile,
                    studentMobile: row.studentMobile,
                    quota: row.quota,
                    course: row.course,
                    branch: row.branch,
                    hasFeeEntry: false,
                    feeStatus: 'no_entry',
                    displayLabel: 'Pending',
                    displayAmount: 0,
                  }),
                  ...row,
                });
                if (matchingFee) feeMap.delete(row.id);
              });
              feeMap.forEach((feeRow) => {
                combined.push({
                  ...feeRow,
                  importantDocumentsPending: [],
                  otherDocumentsPending: [],
                });
              });
              return combined;
            })()
          : [];
          const rawPrintRows = view === 'combined' ? combinedPrintRows : printRows;
      // Pending-only: when min fee is configured, drop anyone who already met it.
      const finalPrintRows =
        view !== 'documents' && hasAnyMinimumFeeConfig
          ? rawPrintRows.filter((row) =>
              isFeeStillPending(row, minimumFeeConfigs, minFeeFilterContext)
            )
          : rawPrintRows;

      if (finalPrintRows.length === 0) {
        showToast.error(
          view === 'fee'
            ? hasAnyMinimumFeeConfig
              ? 'No students below the minimum fee required for the selected filters.'
              : 'No pending fee records to print for the selected filters.'
            : view === 'documents'
            ? 'No pending document records to print for the selected filters.'
            : hasAnyMinimumFeeConfig
            ? 'No students below the minimum fee required for the selected filters.'
            : 'No pending combined records to print for the selected filters.'
        );
        return;
      }

      const usingMinFee = hasAnyMinimumFeeConfig;
      const requiredFeeLabel = usingMinFee ? 'Minimum Fee Required' : 'Tuition + Other Payable';
      const feeSubtitle = usingMinFee
        ? `Unpaid vs configured minimum fee (${minimumFeeConfigs.length} config${minimumFeeConfigs.length === 1 ? '' : 's'})`
        : 'Year 1 Tuition + Other combined — remaining balance';

      const esc = escapePrintHtml;
      const bodyRows = finalPrintRows
        .map((row, index) => {
          if (view === 'fee') {
            const { requiredAmount, totalPaid, unpaid } = resolvePendingFeeAmounts(
              row,
              minimumFeeConfigs,
              minFeeFilterContext
            );
            return `
      <tr>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;">${index + 1}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;font-weight:600;">${esc(row.studentName || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.admissionNumber || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.course || '—')}${row.branch ? `<div style="font-size:10px;color:#64748b;">${esc(row.branch)}</div>` : ''}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.parentMobile || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.studentMobile || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;">${esc(row.quota || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;font-weight:700;">${esc(formatInr(requiredAmount))}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;color:#059669;font-weight:700;">${esc(formatInr(totalPaid))}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;color:#b45309;font-weight:700;">${esc(formatInr(unpaid))}</td>
      </tr>`;
          }

          const importantText = row.importantDocumentsPending?.length
            ? row.importantDocumentsPending.join(', ')
            : row.importantDocumentsPendingText || 'Completed';
          const otherText = row.otherDocumentsPending?.length
            ? row.otherDocumentsPending.join(', ')
            : row.otherDocumentsPendingText || row.pendingCertificatesText || '—';

          if (view === 'documents') {
            return `
      <tr>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;">${index + 1}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;font-weight:600;">${esc(row.studentName || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.admissionNumber || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.course || '—')}${row.branch ? `<div style="font-size:10px;color:#64748b;">${esc(row.branch)}</div>` : ''}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.parentMobile || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.studentMobile || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;">${esc(row.quota || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(importantText)}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(otherText)}</td>
      </tr>`;
          }

          const { requiredAmount, totalPaid, unpaid } = resolvePendingFeeAmounts(
            row,
            minimumFeeConfigs,
            minFeeFilterContext
          );

          return `
      <tr>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;">${index + 1}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;font-weight:600;">${esc(row.studentName || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.admissionNumber || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.course || '—')}${row.branch ? `<div style="font-size:10px;color:#64748b;">${esc(row.branch)}</div>` : ''}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.parentMobile || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.studentMobile || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;">${esc(row.quota || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;font-weight:700;">${esc(formatInr(requiredAmount))}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;color:#059669;font-weight:700;">${esc(formatInr(totalPaid))}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:right;color:#b45309;font-weight:700;">${esc(formatInr(unpaid))}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(importantText)}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(otherText)}</td>
      </tr>`;
        })
        .join('');

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${view === 'fee' ? 'Pending Tuition & Other Fee' : view === 'documents' ? 'Pending Documents' : 'Pending Combined Fee & Documents'}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; color: #0f172a; }
    .page-header { text-align: center; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid #0f172a; }
    .page-header h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: 0.08em; text-transform: uppercase; }
    .page-header p { margin: 0; font-size: 12px; color: #64748b; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { padding: 8px; border: 1px solid #cbd5e1; background: #f1f5f9; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; text-align: left; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .footer { margin-top: 12px; font-size: 10px; color: #94a3b8; text-align: right; }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>${view === 'fee' ? 'Pending Tuition & Other Fee' : view === 'documents' ? 'Pending Documents' : 'Pending Combined Fee & Documents'}</h1>
    <p>${
      view === 'fee'
        ? feeSubtitle
        : view === 'documents'
        ? 'Other documents pending'
        : usingMinFee
        ? `Combined pending fee & documents — ${feeSubtitle}`
        : 'Combined pending fee and documents'
    } — ${finalPrintRows.length} student(s)</p>
    ${
      usingMinFee && view !== 'documents'
        ? `<p>Minimum Config active · ${minimumFeeConfigs.length} saved amount(s) · unpaid = min fee − paid where configured</p>`
        : ''
    }
    <p>Generated ${esc(new Date().toLocaleString('en-IN'))}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:40px;text-align:center;">S.No</th>
        <th>Student Name</th>
        <th>Admission No</th>
        <th>Course</th>
        <th>Parent Mobile</th>
        <th>Student Mobile</th>
        <th style="text-align:center;">Quota</th>
        ${
          view === 'fee'
            ? `<th style="text-align:right;">${esc(requiredFeeLabel)}</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Unpaid</th>`
            : view === 'documents'
            ? '<th>Important Documents</th><th>Other Documents Pending</th>'
            : `<th style="text-align:right;">${esc(requiredFeeLabel)}</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Unpaid</th><th>Important Documents</th><th>Other Documents Pending</th>`
        }
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="footer">Admissions CRM — ${
    view === 'fee'
      ? usingMinFee
        ? 'Pending Fee report (vs minimum fee required)'
        : 'Pending Fee report (Tuition + Other combined)'
      : view === 'documents'
      ? 'Pending Documents report'
      : usingMinFee
      ? 'Pending Combined Fee & Documents report (vs minimum fee required)'
      : 'Pending Combined Fee & Documents report'
  }</div>
</body>
</html>`;

      printHtmlDocument(
        html,
        view === 'fee'
          ? 'Pending Tuition & Other Fee'
          : view === 'documents'
          ? 'Pending Documents'
          : 'Pending Combined Fee & Documents'
      );
    } catch (error) {
      console.error('Error printing pending records:', error);
      showToast.error(
        view === 'fee'
          ? 'Failed to prepare pending fees print. Please try again.'
          : view === 'documents'
          ? 'Failed to prepare pending documents print. Please try again.'
          : 'Failed to prepare pending combined print. Please try again.'
      );
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[95vw] max-w-[75vw] flex-col overflow-hidden p-0 sm:max-w-[75vw]">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6 dark:border-slate-800">
          <DialogTitle>Pending fee & documents</DialogTitle>
          <DialogDescription>
            Active admissions only, using the same date and desk filters as the Abstract tab. Use the
            tabs to switch between combined and separate pending fee/document lists. Minimum fee is
            set from the Config button on Student Info.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b border-slate-100 px-4 py-4 sm:px-6 dark:border-slate-800">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => setView('combined')}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  view === 'combined'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                Combined
              </button>
              <button
                type="button"
                onClick={() => setView('fee')}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  view === 'fee'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                Pending Fee
              </button>
              <button
                type="button"
                onClick={() => setView('documents')}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  view === 'documents'
                    ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                Pending Documents
              </button>
            </div>
            <div className="min-w-[140px] flex-1">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                College
              </label>
              <select
                value={collegeId}
                onChange={(e) => {
                  setCollegeId(e.target.value);
                  setCourseId('');
                  setPage(1);
                  setHasLoadedOnce(false);
                  setSelectedIds(new Set());
                }}
                className={selectClassName}
              >
                <option value="">All Colleges</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[140px] flex-1">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Course
              </label>
              <select
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  setPage(1);
                  setHasLoadedOnce(false);
                  setSelectedIds(new Set());
                }}
                className={selectClassName}
                disabled={coursesLoading}
              >
                <option value="">{coursesLoading ? 'Loading courses...' : 'All Courses'}</option>
                {courses.map((c) => {
                  const id = String(c.id ?? c._id ?? '').trim();
                  if (!id) return null;
                  return (
                    <option key={id} value={id}>
                      {c.name || id}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="min-w-[120px] flex-1">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Quota
              </label>
              <select
                value={quota}
                onChange={(e) => {
                  setQuota(e.target.value);
                  setPage(1);
                  setHasLoadedOnce(false);
                  setSelectedIds(new Set());
                }}
                className={selectClassName}
                disabled={quotasLoading}
              >
                <option value="">{quotasLoading ? 'Loading quotas...' : 'All Quotas'}</option>
                {quotaOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-[38px] shrink-0 whitespace-nowrap"
              onClick={handleLoad}
              isLoading={currentLoading}
            >
              Show list
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-[38px] shrink-0 gap-2 whitespace-nowrap"
              onClick={handlePrintPdf}
              isLoading={isPrinting}
            >
              <Printer className="h-4 w-4" />
              Print PDF
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-[38px] shrink-0 gap-2 whitespace-nowrap"
              onClick={handleDownload}
              isLoading={isDownloading}
            >
              <Download className="h-4 w-4" />
              Download XLSX
            </Button>
          </div>
          {hasAnyMinimumFeeConfig ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
              Config active:{' '}
              <span className="font-semibold">
                {minimumFeeConfigs.length} minimum fee amount
                {minimumFeeConfigs.length === 1 ? '' : 's'} saved
              </span>
              {' — '}list and Print PDF show only students still below the matching minimum.
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4 sm:px-6">
          {!hasLoadedOnce ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Select filters and click <span className="font-semibold">Show list</span> to view pending fees and pending documents.
            </p>
          ) : currentLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-400 border-t-transparent" />
              <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-400">Loading…</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total students</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{totalStudents}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">Active admissions (desk filters)</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Fee paid</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-300">{feePaidStudents}</p>
                  <p className="mt-0.5 text-[10px] text-emerald-700/80 dark:text-emerald-400/80">
                    {hasAnyMinimumFeeConfig
                      ? 'Met configured minimum fee (among tuition-pending set)'
                      : 'Paid any amount on tuition + other'}
                  </p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Fee unpaid</p>
                  <p className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-300">{feeUnpaidStudents}</p>
                  <p className="mt-0.5 text-[10px] text-amber-700/80 dark:text-amber-400/80">
                    {hasAnyMinimumFeeConfig
                      ? 'Still below configured minimum fee'
                      : 'Remaining tuition + other balance'}
                  </p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 dark:border-sky-900/50 dark:bg-sky-950/30">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">No fee entry</p>
                  <p className="mt-1 text-2xl font-bold text-sky-800 dark:text-sky-300">{feeNoEntryStudents}</p>
                  <p className="mt-0.5 text-[10px] text-sky-700/80 dark:text-sky-400/80">
                    Pending but no Fee Management ledger (Year 2+ for lateral)
                  </p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50/80 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/30">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">Important docs pending</p>
                  <p className="mt-1 text-2xl font-bold text-red-800 dark:text-red-300">{importantPendingStudents}</p>
                  <p className="mt-0.5 text-[10px] text-red-700/80 dark:text-red-400/80">Important documents still incomplete</p>
                </div>
                <div className="rounded-xl border border-orange-200 bg-orange-50/80 px-4 py-3 dark:border-orange-900/50 dark:bg-orange-950/30">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400">Other docs pending</p>
                  <p className="mt-1 text-2xl font-bold text-orange-800 dark:text-orange-300">{otherPendingStudents}</p>
                  <p className="mt-0.5 text-[10px] text-orange-700/80 dark:text-orange-400/80">Other documents still incomplete</p>
                </div>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {view === 'fee'
                        ? hasAnyMinimumFeeConfig
                          ? 'Pending fee vs configured minimum amounts'
                          : 'Year 1 tuition + other fee — remaining balance'
                        : view === 'documents'
                        ? 'Other documents pending'
                        : hasAnyMinimumFeeConfig
                        ? 'Combined pending — unpaid vs configured minimum'
                        : 'Combined pending fee + documents'}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Showing {currentPageRows.length} of {currentTotal} student(s)
                      {currentPagination.pages > 1 ? ` — page ${currentPagination.page} of ${currentPagination.pages}` : ''}.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedCount > 0 ? (
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                        {selectedCount} selected
                      </span>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5"
                      disabled={selectedCount === 0 || bulkSmsMutation.isPending}
                      onClick={() => setConfirmBulkSmsOpen(true)}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Send SMS
                    </Button>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {view === 'fee' ? 'Fee view' : view === 'documents' ? 'Documents view' : 'Combined view'}
                    </span>
                  </div>
                </div>

                {currentRows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
                    {view === 'fee'
                      ? 'No students found with unpaid tuition + other fee for the selected filters.'
                      : view === 'documents'
                      ? 'No students found with pending documents for the selected filters.'
                      : 'No students found with pending fee or document information for the selected filters.'}
                  </p>
                ) : (
                  <>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                      <label className="inline-flex cursor-pointer items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={allSelectableSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelectableSelected;
                          }}
                          onChange={(e) => toggleSelectAllLoaded(e.target.checked)}
                        />
                        <span>
                          Select all {selectableRowIds.length} student(s) in this list
                        </span>
                      </label>
                      <span className="text-[11px] text-slate-500">
                        SMS includes pending Important Documents only
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="min-w-[800px] w-full divide-y divide-slate-200 dark:divide-slate-800">
                        <thead className="bg-slate-50 dark:bg-slate-900/70">
                          <tr>
                            <th className={`${tableThClass} w-10`}>
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                checked={allPageSelected}
                                ref={(el) => {
                                  if (el) {
                                    el.indeterminate = !allPageSelected && pageSelectableIds.some((id) => selectedIds.has(id));
                                  }
                                }}
                                onChange={(e) => toggleSelectAllPage(e.target.checked)}
                                aria-label="Select all on this page"
                                title="Select all on this page"
                              />
                            </th>
                            <th className={tableThClass}>Student</th>
                            <th className={`${tableThClass} hidden md:table-cell`}>Parent Mobile No</th>
                            <th className={`${tableThClass} hidden md:table-cell`}>Student Mobile No</th>
                            <th className={`${tableThClass} text-center`}>Quota</th>
                            {view === 'fee' ? (
                              <>
                                <th className={`${tableThClass} text-right`}>
                                  {hasAnyMinimumFeeConfig ? 'Min. Fee Required' : 'Tuition + Other'}
                                </th>
                                <th className={`${tableThClass} text-right`}>Paid</th>
                                <th className={`${tableThClass} text-right`}>Unpaid</th>
                              </>
                            ) : view === 'documents' ? (
                              <>
                                <th className={tableThClass}>Important Documents</th>
                                <th className={tableThClass}>Other Documents Pending</th>
                              </>
                            ) : (
                              <>
                                <th className={`${tableThClass} text-right`}>
                                  {hasAnyMinimumFeeConfig ? 'Min. Fee Required' : 'Tuition + Other'}
                                </th>
                                <th className={`${tableThClass} text-right`}>Paid</th>
                                <th className={`${tableThClass} text-right`}>Unpaid</th>
                                <th className={tableThClass}>Important Documents</th>
                                <th className={tableThClass}>Other Documents Pending</th>
                              </>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {currentPageRows.map((row) => {
                            const rowId = String(row.id);
                            const rowChecked = selectedIds.has(rowId);
                            const selectCell = (
                              <td className={`${tableTdClass} w-10`}>
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  checked={rowChecked}
                                  onChange={(e) => toggleRowSelected(rowId, e.target.checked)}
                                  aria-label={`Select ${row.studentName || row.admissionNumber || 'student'}`}
                                />
                              </td>
                            );

                            if (view === 'fee') {
                              const { requiredAmount, totalPaid, unpaid } =
                                resolvePendingFeeAmounts(
                                  row,
                                  minimumFeeConfigs,
                                  minFeeFilterContext
                                );
                              return (
                                <tr key={row.id}>
                                  {selectCell}
                                  <td className={`${tableTdClass} font-medium text-slate-900 dark:text-slate-100`}>
                                    <div className="flex flex-col gap-0.5">
                                      <span>{row.studentName || '—'}</span>
                                      <span className="font-semibold text-blue-600 dark:text-blue-400 text-xs">
                                        {row.admissionNumber || '—'}
                                      </span>
                                      <span className="text-xs text-slate-600 dark:text-slate-400">
                                        {row.course || '—'}{row.branch ? ` · ${row.branch}` : ''}
                                      </span>
                                    </div>
                                  </td>
                                  <td className={`${tableTdClass} hidden md:table-cell`}>{row.parentMobile || '—'}</td>
                                  <td className={`${tableTdClass} hidden md:table-cell`}>{row.studentMobile || '—'}</td>
                                  <td className={`${tableTdClass} text-center`}>
                                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                      {row.quota || '—'}
                                    </span>
                                  </td>
                                  <td className={`${tableTdClass} text-right font-semibold`}>{formatInr(requiredAmount)}</td>
                                  <td className={`${tableTdClass} text-right`}>
                                    <div className="flex flex-col items-end gap-0.5">
                                      <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                        Paid
                                      </span>
                                      <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                        {formatInr(totalPaid)}
                                      </span>
                                    </div>
                                  </td>
                                  <td className={`${tableTdClass} text-right`}>
                                    <FeeStatusCell
                                      feeStatus="unpaid"
                                      displayLabel="Unpaid"
                                      displayAmount={unpaid}
                                      hasFeeEntry={true}
                                    />
                                  </td>
                                </tr>
                              );
                            }

                            const importantText = row.importantDocumentsPending?.length
                              ? row.importantDocumentsPending.join(', ')
                              : row.importantDocumentsPendingText || 'Completed';
                            const otherText = row.otherDocumentsPending?.length
                              ? row.otherDocumentsPending.join(', ')
                              : row.otherDocumentsPendingText || row.pendingCertificatesText || 'Completed';

                            if (view === 'documents') {
                              return (
                                <tr key={row.id}>
                                  {selectCell}
                                  <td className={`${tableTdClass} font-medium text-slate-900 dark:text-slate-100`}>
                                    <div className="flex flex-col gap-0.5">
                                      <span>{row.studentName || '—'}</span>
                                      <span className="font-semibold text-blue-600 dark:text-blue-400 text-xs">
                                        {row.admissionNumber || '—'}
                                      </span>
                                      <span className="text-xs text-slate-600 dark:text-slate-400">
                                        {row.course || '—'}{row.branch ? ` · ${row.branch}` : ''}
                                      </span>
                                    </div>
                                  </td>
                                  <td className={`${tableTdClass} hidden md:table-cell`}>{row.parentMobile || '—'}</td>
                                  <td className={`${tableTdClass} hidden md:table-cell`}>{row.studentMobile || '—'}</td>
                                  <td className={`${tableTdClass} text-center`}>
                                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                      {row.quota || '—'}
                                    </span>
                                  </td>
                                  <td className={tableTdClass}>{importantText}</td>
                                  <td className={tableTdClass}>{otherText}</td>
                                </tr>
                              );
                            }

                            const { requiredAmount, totalPaid, unpaid } =
                              resolvePendingFeeAmounts(
                                row,
                                minimumFeeConfigs,
                                minFeeFilterContext
                              );

                            return (
                              <tr key={row.id}>
                                {selectCell}
                                <td className={`${tableTdClass} font-medium text-slate-900 dark:text-slate-100`}>
                                  <div className="flex flex-col gap-0.5">
                                    <span>{row.studentName || '—'}</span>
                                    <span className="font-semibold text-blue-600 dark:text-blue-400 text-xs">
                                      {row.admissionNumber || '—'}
                                    </span>
                                    <span className="text-xs text-slate-600 dark:text-slate-400">
                                      {row.course || '—'}{row.branch ? ` · ${row.branch}` : ''}
                                    </span>
                                  </div>
                                </td>
                                <td className={`${tableTdClass} hidden md:table-cell`}>{row.parentMobile || '—'}</td>
                                <td className={`${tableTdClass} hidden md:table-cell`}>{row.studentMobile || '—'}</td>
                                <td className={`${tableTdClass} text-center`}>
                                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                    {row.quota || '—'}
                                  </span>
                                </td>
                                <td className={`${tableTdClass} text-right font-semibold`}>{formatInr(requiredAmount)}</td>
                                <td className={`${tableTdClass} text-right`}>
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                      Paid
                                    </span>
                                    <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                                      {formatInr(totalPaid)}
                                    </span>
                                  </div>
                                </td>
                                <td className={`${tableTdClass} text-right`}>
                                  <FeeStatusCell
                                    feeStatus="unpaid"
                                    displayLabel="Unpaid"
                                    displayAmount={unpaid}
                                    hasFeeEntry={true}
                                  />
                                </td>
                                <td className={tableTdClass}>{importantText}</td>
                                <td className={tableTdClass}>{otherText}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {currentPagination.pages > 1 && (
                      <div className="mt-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:gap-4 dark:border-slate-700 dark:text-slate-300">
                        <div className="text-center sm:text-left">
                          Page {currentPagination.page} of {currentPagination.pages}
                        </div>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 sm:flex-none"
                            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                            disabled={currentPagination.page === 1 || currentLoading}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 sm:flex-none"
                            onClick={() => setPage((prev) => Math.min(prev + 1, currentPagination.pages))}
                            disabled={currentPagination.page === currentPagination.pages || currentLoading}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      <Dialog open={confirmBulkSmsOpen} onOpenChange={setConfirmBulkSmsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Important Documents SMS</DialogTitle>
            <DialogDescription>
              Send pending Important Documents SMS to {selectedCount} selected student(s). Other
              documents are not included.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Students without pending Important Documents or a valid phone number will be skipped.
          </p>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmBulkSmsOpen(false)}
              disabled={bulkSmsMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              isLoading={bulkSmsMutation.isPending}
              disabled={selectedCount === 0}
              onClick={() => bulkSmsMutation.mutate([...selectedIds])}
            >
              Send SMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
