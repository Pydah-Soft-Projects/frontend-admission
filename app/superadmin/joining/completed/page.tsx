'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { admissionAPI, courseAPI } from '@/lib/api';
import { Admission, AdmissionListResponse } from '@/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ReferenceUserSelect } from '@/components/admission/ReferenceUserSelect';
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
import { useDashboardHeader, useJoiningDeskPermissions } from '@/components/layout/DashboardShell';
import { useCourseLookup } from '@/hooks/useCourseLookup';
import { LayoutGrid, List, Calendar, Filter, Download, UserCircle, CalendarDays, Pencil } from 'lucide-react';

type AdmissionStatusFilter = 'all' | 'active' | 'withdrawn' | 'Admission Cancelled';

const ADMISSION_CANCELLED_STATUS = 'Admission Cancelled';

const statusOptions: Array<{ label: string; value: AdmissionStatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Withdrawn', value: 'withdrawn' },
  { label: 'Admission Cancelled', value: ADMISSION_CANCELLED_STATUS },
];

type AdmissionCourseStat = {
  courseId?: string;
  courseName?: string;
  totalAdmissions: number;
  totalCancelled?: number;
};

/** Local calendar date as YYYY-MM-DD (for stats “through today”). */
const formatLocalDateIso = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const ABSTRACT_COLUMN_COUNT = 11;

type AbstractIntakeEditRow = {
  courseId: string;
  branchId: string;
  courseName: string;
  branchName: string;
  cqIntake: number | null;
  mqIntake: number | null;
};

/** Course column metadata from admissions pivot APIs (`/stats/by-reference`, `/stats/by-date`). */
type AdmissionStatsPivotCourse = {
  courseId: string;
  courseName: string;
};

const formatAbstractIntake = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : String(value);

const getAdmissionStatusBadge = (status?: string) => {
  if (status === 'active') {
    return {
      label: 'Active',
      className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200',
    };
  }
  if (status === ADMISSION_CANCELLED_STATUS) {
    return {
      label: ADMISSION_CANCELLED_STATUS,
      className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200',
    };
  }
  return {
    label: 'Withdrawn',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  };
};

type ApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

/** EWS Yes/No from `reservation.isEws` (with legacy fallbacks). */
const formatReservationEws = (reservation?: Admission['reservation']) => {
  if (reservation?.isEws === true) return 'Yes';
  if (reservation?.isEws === false) return 'No';
  if (reservation?.general === 'ews' || reservation?.other?.includes('EWS')) return 'Yes';
  return 'No';
};

/** Reference 1 from admission list row (lead_data.reference1 or list API referenceName). */
const resolveAdmissionReference1 = (record: Admission) => {
  const fromList = record.referenceName?.trim();
  if (fromList) return fromList;
  const ld = record.leadData as Record<string, unknown> | undefined;
  return String(ld?.reference1 ?? ld?.referenceName ?? '').trim();
};

const CompletedAdmissionsPage = () => {
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const { canEditReference, canEditAdmission } = useJoiningDeskPermissions();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<
    'abstract' | 'detailed' | 'student-info' | 'reference-list' | 'date-wise'
  >('abstract');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdmissionStatusFilter>('active');
  const [courseFilter, setCourseFilter] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState({
    from: '',
    to: '',
  });
  
  const [cancelTarget, setCancelTarget] = useState<Admission | null>(null);
  const [cancelForm, setCancelForm] = useState({
    reason: '',
    approvedBy: '',
  });
  const [intakeEditTarget, setIntakeEditTarget] = useState<AbstractIntakeEditRow | null>(null);
  const [intakeForm, setIntakeForm] = useState({ cqIntake: '', mqIntake: '' });
  const [studentInfoViewRecord, setStudentInfoViewRecord] = useState<Admission | null>(null);
  const [referenceEditTarget, setReferenceEditTarget] = useState<Admission | null>(null);
  const [referenceEditValue, setReferenceEditValue] = useState('');

  const { getCourseName, getBranchName } = useCourseLookup();

  // Fetch courses for dropdown
  const { data: coursesData } = useQuery({
    queryKey: ['courses', 'list'],
    queryFn: async () => {
      const response = await courseAPI.list({ showInactive: false });
      return response.data || response;
    },
  });
  const courses = Array.isArray(coursesData) ? coursesData : (coursesData as any)?.data || [];

  // Fetch branches for dropdown
  const { data: branchesData } = useQuery({
    queryKey: ['branches', 'list', courseFilter],
    queryFn: async () => {
      if (!courseFilter) return [];
      const response = await courseAPI.listBranches({ courseId: courseFilter });
      return response.data || response;
    },
    enabled: !!courseFilter,
  });
  const branches = Array.isArray(branchesData) ? branchesData : (branchesData as any)?.data || [];

  const [isExporting, setIsExporting] = useState(false);

  const statsThroughDate = dateRange.to || formatLocalDateIso(new Date());

  // Stats Query (course cards count admissions through today when “Admission To” is empty)
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['admissions', 'stats', dateRange.from, statsThroughDate, courseFilter, branchFilter],
    queryFn: () =>
      admissionAPI.getStats({
        startDate: dateRange.from || undefined,
        endDate: statsThroughDate,
        courseId: courseFilter || undefined,
        branchId: branchFilter || undefined,
        courseName: getCourseName(courseFilter) || undefined,
        branchName: getBranchName(branchFilter) || undefined,
      }),
  });

  const stats: AdmissionCourseStat[] = statsData?.stats || [];

  const courseStatsForCards = useMemo(() => {
    return stats
      .filter((row) => {
        const active = Number(row.totalAdmissions) || 0;
        const cancelled = Number(row.totalCancelled) || 0;
        return active + cancelled > 0;
      })
      .sort((a, b) => (Number(b.totalAdmissions) || 0) - (Number(a.totalAdmissions) || 0));
  }, [stats]);

  const saveBranchIntakeMutation = useMutation({
    mutationFn: (payload: AbstractIntakeEditRow & { cqIntake: number | null; mqIntake: number | null }) =>
      admissionAPI.upsertBranchIntake({
        courseId: payload.courseId,
        branchId: payload.branchId,
        courseName: payload.courseName,
        branchName: payload.branchName,
        cqIntake: payload.cqIntake,
        mqIntake: payload.mqIntake,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admissions', 'stats'] });
      showToast.success('Intake saved');
      setIntakeEditTarget(null);
    },
    onError: (error: ApiError) => {
      showToast.error(error.response?.data?.message || 'Failed to save intake');
    },
  });

  const openIntakeEditor = (row: AbstractIntakeEditRow) => {
    setIntakeEditTarget(row);
    setIntakeForm({
      cqIntake: row.cqIntake != null ? String(row.cqIntake) : '',
      mqIntake: row.mqIntake != null ? String(row.mqIntake) : '',
    });
  };

  const submitIntakeEdit = () => {
    if (!intakeEditTarget) return;
    const parseField = (raw: string): number | null => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return NaN;
      return n;
    };
    const cqIntake = parseField(intakeForm.cqIntake);
    const mqIntake = parseField(intakeForm.mqIntake);
    if (Number.isNaN(cqIntake) || Number.isNaN(mqIntake)) {
      showToast.error('Intake must be a whole number ≥ 0, or leave blank');
      return;
    }
    saveBranchIntakeMutation.mutate({
      ...intakeEditTarget,
      cqIntake,
      mqIntake,
    });
  };

  const pivotReportParams = useMemo(
    () => ({
      startDate: dateRange.from || undefined,
      endDate: statsThroughDate,
      courseId: courseFilter || undefined,
      branchId: branchFilter || undefined,
      courseName: getCourseName(courseFilter) || undefined,
      branchName: getBranchName(branchFilter) || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
    }),
    [dateRange.from, statsThroughDate, courseFilter, branchFilter, statusFilter, getCourseName, getBranchName]
  );

  const { data: referenceStatsData, isLoading: referenceStatsLoading } = useQuery({
    queryKey: ['admissions', 'stats', 'by-reference', pivotReportParams],
    queryFn: async () => admissionAPI.getStatsByReference(pivotReportParams),
    enabled: activeTab === 'reference-list',
  });

  const { data: dateWiseStatsData, isLoading: dateWiseStatsLoading } = useQuery({
    queryKey: ['admissions', 'stats', 'by-date', pivotReportParams],
    queryFn: async () => admissionAPI.getStatsByDate(pivotReportParams),
    enabled: activeTab === 'date-wise',
  });

  const referenceCourses = (referenceStatsData?.courses ?? []) as AdmissionStatsPivotCourse[];
  const referenceRows = referenceStatsData?.rows ?? [];
  const dateWiseCourses = (dateWiseStatsData?.courses ?? []) as AdmissionStatsPivotCourse[];
  const dateWiseRows = dateWiseStatsData?.rows ?? [];

  // Detailed List Query
  const queryKey = useMemo(
    () => ['admissions', page, limit, searchTerm, statusFilter, courseFilter, branchFilter, dateRange],
    [page, limit, searchTerm, statusFilter, courseFilter, branchFilter, dateRange]
  );

  const { data, isLoading, isFetching } = useQuery<AdmissionListResponse>({
    queryKey,
    queryFn: async () => {
      const response = await admissionAPI.list({
        page,
        limit,
        search: searchTerm || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        courseId: courseFilter || undefined,
        branchId: branchFilter || undefined,
        courseName: getCourseName(courseFilter) || undefined,
        branchName: getBranchName(branchFilter) || undefined,
        startDate: dateRange.from || undefined,
        endDate: statsThroughDate,
      });
      return response.data || response;
    },
    placeholderData: (previousData) => previousData,
  });

  const admissions = data?.admissions ?? [];
  const pagination = data?.pagination ?? { page: 1, pages: 1, limit: 20, total: 0 };
  const isEmpty = !isLoading && admissions.length === 0;

  const cancelAdmissionMutation = useMutation({
    mutationFn: async () => {
      if (!cancelTarget?._id) {
        throw new Error('Select an admission to cancel');
      }
      return admissionAPI.cancelById(cancelTarget._id, {
        reason: cancelForm.reason.trim(),
        approvedBy: cancelForm.approvedBy.trim(),
      });
    },
    onSuccess: async () => {
      showToast.success('Admission cancelled successfully');
      setCancelTarget(null);
      setCancelForm({ reason: '', approvedBy: '' });
      await queryClient.invalidateQueries({ queryKey: ['admissions'] });
    },
    onError: (error: ApiError) => {
      showToast.error(error.response?.data?.message || 'Failed to cancel admission');
    },
  });

  const openCancelDialog = (record: Admission) => {
    setCancelTarget(record);
    setCancelForm({ reason: '', approvedBy: '' });
  };

  const submitCancellation = () => {
    if (!cancelForm.reason.trim()) {
      showToast.error('Reason for cancellation is required');
      return;
    }
    if (!cancelForm.approvedBy.trim()) {
      showToast.error('Approved by is required');
      return;
    }
    cancelAdmissionMutation.mutate();
  };

  const saveReferenceMutation = useMutation({
    mutationFn: async () => {
      if (!referenceEditTarget?._id) {
        throw new Error('Select an admission to update');
      }
      return admissionAPI.patchReferenceById(referenceEditTarget._id, referenceEditValue.trim());
    },
    onSuccess: async () => {
      showToast.success('Reference updated');
      setReferenceEditTarget(null);
      setReferenceEditValue('');
      await queryClient.invalidateQueries({ queryKey: ['admissions'] });
      await queryClient.invalidateQueries({ queryKey: ['admissions', 'stats', 'by-reference'] });
    },
    onError: (error: ApiError) => {
      showToast.error(error.response?.data?.message || 'Failed to update reference');
    },
  });

  const openReferenceEditor = (record: Admission) => {
    setReferenceEditTarget(record);
    setReferenceEditValue(resolveAdmissionReference1(record));
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const blob = await admissionAPI.exportAdmissions({
        search: searchTerm || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        courseId: courseFilter || undefined,
        branchId: branchFilter || undefined,
        courseName: getCourseName(courseFilter) || undefined,
        branchName: getBranchName(branchFilter) || undefined,
        startDate: dateRange.from || undefined,
        endDate: statsThroughDate,
      });

      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      const date = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `admissions_export_${date}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast.success('Excel export started successfully');
    } catch (error) {
      console.error('Error exporting admissions:', error);
      showToast.error('Failed to export admissions. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const totalAdmissionsCount = useMemo(() => {
    return stats.reduce((acc, curr) => acc + (Number(curr.totalAdmissions) || 0), 0);
  }, [stats]);

  const totalCancelledCount = useMemo(() => {
    return stats.reduce((acc, curr) => acc + (Number(curr.totalCancelled) || 0), 0);
  }, [stats]);

  const statsThroughLabel = useMemo(() => {
    try {
      return new Date(`${statsThroughDate}T12:00:00`).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return statsThroughDate;
    }
  }, [statsThroughDate]);

  const headerContent = useMemo(
    () => (
      <div className="flex flex-col items-end gap-0.5 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Admissions Desk</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Through {statsThroughLabel}
          {dateRange.from ? ` · from ${dateRange.from}` : ''} ·{' '}
          <span className="font-medium text-blue-600">A</span> active ·{' '}
          <span className="font-medium text-red-600">C</span> cancelled
        </p>
      </div>
    ),
    [statsThroughLabel, dateRange.from]
  );

  useEffect(() => {
    setHeaderContent(headerContent);
    return () => clearHeaderContent();
  }, [headerContent, setHeaderContent, clearHeaderContent]);

  const statCardsGridClass =
    'grid w-full grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-10';

  const statCardShell =
    'flex h-[5rem] w-full min-w-0 flex-col !rounded-lg border border-slate-200/90 bg-white !p-0 !shadow-sm transition-shadow hover:!scale-100 hover:!shadow-md dark:border-slate-700 dark:bg-slate-900';

  const statCardInner = 'flex h-full min-w-0 flex-col justify-center px-2 py-2 sm:px-2.5 sm:py-2.5';

  const renderStatCounts = (active: number, cancelled: number) => (
    <div className="mt-1.5 grid grid-cols-2 divide-x divide-slate-200/90 dark:divide-slate-600">
      <div className="flex items-baseline justify-center gap-px pr-1">
        <span className="text-lg font-bold leading-none tabular-nums text-slate-900 sm:text-xl lg:text-2xl dark:text-slate-100">
          {active}
        </span>
        <span className="text-[10px] font-bold text-blue-600 sm:text-xs dark:text-blue-400">A</span>
      </div>
      <div className="flex items-baseline justify-center gap-px pl-1">
        <span className="text-lg font-bold leading-none tabular-nums text-slate-900 sm:text-xl lg:text-2xl dark:text-slate-100">
          {cancelled}
        </span>
        <span className="text-[10px] font-bold text-red-600 sm:text-xs dark:text-red-400">C</span>
      </div>
    </div>
  );

  return (
    <div className="w-full space-y-6 pb-12">
      <Dialog
        open={!!referenceEditTarget}
        onOpenChange={(open) => {
          if (!open) {
            setReferenceEditTarget(null);
            setReferenceEditValue('');
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Reference 1</DialogTitle>
            <DialogDescription>
              Stored on the admission, joining form, and CRM lead (when linked). Used by the Reference list
              report.
            </DialogDescription>
          </DialogHeader>
          {referenceEditTarget && (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {referenceEditTarget.studentInfo?.name || 'Student'}
                </p>
                <p className="text-xs text-slate-500">{referenceEditTarget.admissionNumber}</p>
              </div>
              <ReferenceUserSelect
                id="admission-reference1"
                label="Reference"
                value={referenceEditValue}
                onChange={setReferenceEditValue}
                disabled={saveReferenceMutation.isPending}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReferenceEditTarget(null);
                setReferenceEditValue('');
              }}
              disabled={saveReferenceMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              isLoading={saveReferenceMutation.isPending}
              onClick={() => saveReferenceMutation.mutate()}
            >
              Save Reference
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancel Admission</DialogTitle>
            <DialogDescription>
              Capture the approval details before changing this student status to Admission Cancelled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {cancelTarget?.studentInfo?.name || 'Selected student'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {cancelTarget?.admissionNumber || ''}
              </p>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="list-cancel-reason"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                Reason for cancellation
              </label>
              <textarea
                id="list-cancel-reason"
                rows={4}
                value={cancelForm.reason}
                onChange={(event) =>
                  setCancelForm((prev) => ({ ...prev, reason: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 hover:bg-white focus:border-orange-500/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:focus:border-orange-500/50 dark:focus:bg-slate-950 dark:focus:ring-orange-900/20"
                placeholder="Enter cancellation reason"
                required
              />
            </div>
            <Input
              id="list-cancel-approved-by"
              label="Approved by"
              value={cancelForm.approvedBy}
              onChange={(event) =>
                setCancelForm((prev) => ({ ...prev, approvedBy: event.target.value }))
              }
              placeholder="Enter approver name"
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelTarget(null)}
              disabled={cancelAdmissionMutation.isPending}
            >
              Close
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={cancelAdmissionMutation.isPending}
              onClick={submitCancellation}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!studentInfoViewRecord}
        onOpenChange={(open) => {
          if (!open) setStudentInfoViewRecord(null);
        }}
      >
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Student information</DialogTitle>
            <DialogDescription>
              Quick view for this admission. Use Edit joining form to change joining data, or open the full admission
              page for payments, documents, and Step 2.
            </DialogDescription>
          </DialogHeader>
          {studentInfoViewRecord && (
            <div className="grid gap-4 text-sm">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Admission</p>
                <p className="mt-1 font-mono text-base font-semibold text-blue-600 dark:text-blue-400">
                  {studentInfoViewRecord.admissionNumber}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Recorded:{' '}
                  {studentInfoViewRecord.createdAt
                    ? new Date(studentInfoViewRecord.createdAt).toLocaleString()
                    : '—'}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student</p>
                  <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {studentInfoViewRecord.studentInfo?.name ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Contact</p>
                  <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {studentInfoViewRecord.studentInfo?.phone ?? '—'}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Course / branch</p>
                  <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {studentInfoViewRecord.courseInfo?.course || getCourseName(studentInfoViewRecord.courseInfo?.courseId) || '—'}{' '}
                    <span className="text-slate-500">·</span>{' '}
                    {studentInfoViewRecord.courseInfo?.branch ||
                      getBranchName(studentInfoViewRecord.courseInfo?.branchId) ||
                      '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Quota</p>
                  <p className="mt-0.5 font-medium uppercase text-slate-900 dark:text-slate-100">
                    {studentInfoViewRecord.courseInfo?.quota || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Caste</p>
                  <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {(studentInfoViewRecord.reservation?.general || 'OC').toUpperCase()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">EWS</p>
                  <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {formatReservationEws(studentInfoViewRecord.reservation)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Paid</p>
                  <p className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {new Intl.NumberFormat('en-IN', {
                      style: 'currency',
                      currency: 'INR',
                      maximumFractionDigits: 0,
                    }).format(studentInfoViewRecord.paymentSummary?.totalPaid || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Reference</p>
                  <p className="mt-0.5 text-slate-700 dark:text-slate-300">
                    {resolveAdmissionReference1(studentInfoViewRecord) || '—'}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setStudentInfoViewRecord(null)}>
              Close
            </Button>
            {canEditAdmission && studentInfoViewRecord?.joiningId ? (
              <Link href={`/superadmin/joining/${studentInfoViewRecord.joiningId}`} className="w-full sm:w-auto">
                <Button type="button" className="w-full gap-2 sm:w-auto">
                  <Pencil className="h-4 w-4" />
                  Edit joining form
                </Button>
              </Link>
            ) : null}
            {studentInfoViewRecord?._id ? (
              <Link href={`/superadmin/admission/${studentInfoViewRecord._id}/detail`} className="w-full sm:w-auto">
                <Button type="button" variant="outline" className="w-full sm:w-auto">
                  Full admission page
                </Button>
              </Link>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!intakeEditTarget} onOpenChange={(open) => !open && setIntakeEditTarget(null)}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Edit branch intake</DialogTitle>
            <DialogDescription>
              Set convenor (CQ) and management (MQ) seat intake for this course and branch on the abstract
              report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {intakeEditTarget?.courseName || '—'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {intakeEditTarget?.branchName || '—'}
              </p>
            </div>
            <Input
              id="abstract-cq-intake"
              label="CQ - Intake"
              type="number"
              min={0}
              step={1}
              value={intakeForm.cqIntake}
              onChange={(e) => setIntakeForm((prev) => ({ ...prev, cqIntake: e.target.value }))}
              placeholder="Convenor seats"
            />
            <Input
              id="abstract-mq-intake"
              label="MQ - Intake"
              type="number"
              min={0}
              step={1}
              value={intakeForm.mqIntake}
              onChange={(e) => setIntakeForm((prev) => ({ ...prev, mqIntake: e.target.value }))}
              placeholder="Management seats"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIntakeEditTarget(null)}
              disabled={saveBranchIntakeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitIntakeEdit}
              isLoading={saveBranchIntakeMutation.isPending}
              disabled={!intakeEditTarget?.courseId || !intakeEditTarget?.branchId}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Statistics Cards — full-width responsive grid */}
      <div>
        {statsLoading ? (
          <div className={statCardsGridClass}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={`stats-skeleton-${i}`}
                className="h-[5rem] w-full min-w-0 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : courseStatsForCards.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No course admissions in this date range.</p>
        ) : (
          <div className={statCardsGridClass}>
            <Card
              noPadding
              className={`${statCardShell} border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50/95 to-white dark:from-blue-950/40 dark:to-slate-900`}
            >
              <div className={statCardInner} title="All courses combined">
                <p className="truncate text-xs font-bold uppercase tracking-wide text-blue-800 sm:text-sm dark:text-blue-200">
                  Total
                </p>
                {renderStatCounts(totalAdmissionsCount, totalCancelledCount)}
              </div>
            </Card>
            {courseStatsForCards.map((s) => {
              const key = s.courseId || s.courseName || 'unknown';
              const active = Number(s.totalAdmissions) || 0;
              const cancelled = Number(s.totalCancelled) || 0;
              const label = s.courseName || 'Other';
              return (
                <Card key={key} noPadding className={statCardShell}>
                  <div className={statCardInner} title={label}>
                    <p className="truncate text-xs font-bold uppercase tracking-wide text-slate-700 sm:text-sm dark:text-slate-200">
                      {label}
                    </p>
                    {renderStatCounts(active, cancelled)}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Combined Filters & Tabs Bar */}
      <Card className="bg-slate-50/50 p-4 dark:bg-slate-900/50">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            {/* Tabs Switcher */}
            <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-slate-200/50 p-1 dark:bg-slate-800/50">
              <button
                onClick={() => setActiveTab('abstract')}
                className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-all duration-200 ${
                  activeTab === 'abstract'
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                    : 'text-slate-500 hover:bg-white/50 dark:text-slate-400 dark:hover:bg-slate-700/50'
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
                Abstract
              </button>
              <button
                onClick={() => setActiveTab('detailed')}
                className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-all duration-200 ${
                  activeTab === 'detailed'
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                    : 'text-slate-500 hover:bg-white/50 dark:text-slate-400 dark:hover:bg-slate-700/50'
                }`}
              >
                <List className="h-4 w-4" />
                Detailed View
              </button>
              <button
                onClick={() => setActiveTab('student-info')}
                className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-all duration-200 ${
                  activeTab === 'student-info'
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                    : 'text-slate-500 hover:bg-white/50 dark:text-slate-400 dark:hover:bg-slate-700/50'
                }`}
              >
                <Filter className="h-4 w-4" />
                Student Info
              </button>
              <button
                onClick={() => setActiveTab('reference-list')}
                className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-all duration-200 ${
                  activeTab === 'reference-list'
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                    : 'text-slate-500 hover:bg-white/50 dark:text-slate-400 dark:hover:bg-slate-700/50'
                }`}
              >
                <UserCircle className="h-4 w-4" />
                Reference list
              </button>
              <button
                onClick={() => setActiveTab('date-wise')}
                className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-all duration-200 ${
                  activeTab === 'date-wise'
                    ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                    : 'text-slate-500 hover:bg-white/50 dark:text-slate-400 dark:hover:bg-slate-700/50'
                }`}
              >
                <CalendarDays className="h-4 w-4" />
                Date-wise
              </button>
            </div>

            {/* Quick Actions / Export (Moved here for better layout) */}
            <div className="flex items-center gap-2">
               <Button 
                 variant="outline" 
                 size="sm" 
                 className="gap-2"
                 onClick={handleExportExcel}
                 isLoading={isExporting}
               >
                 <Download className="h-4 w-4" /> Export XLSX
               </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Course</label>
              <select
                value={courseFilter}
                onChange={(e) => {
                  setCourseFilter(e.target.value);
                  setBranchFilter('');
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
              >
                <option value="">All Courses</option>
                {courses.map((c: any) => (
                  <option key={c._id} value={c._id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Branch</label>
              <select
                value={branchFilter}
                onChange={(e) => {
                  setBranchFilter(e.target.value);
                  setPage(1);
                }}
                disabled={!courseFilter}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900"
              >
                <option value="">{courseFilter ? 'All Branches' : 'Select Course First'}</option>
                {branches.map((b: any) => (
                  <option key={b._id} value={b._id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as AdmissionStatusFilter);
                  setPage(1);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Admission From</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Admission To</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="md:col-span-2 lg:col-span-2">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Search</label>
              <Input
                placeholder="Search student, admission #, phone..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="h-[38px]"
              />
            </div>
          </div>
        </div>
      </Card>

      {activeTab === 'abstract' ? (
        <div className="w-full">
          <Card className="overflow-hidden border-none p-0 shadow-lg dark:shadow-none">
            <div className="bg-slate-50 px-6 py-4 dark:bg-slate-800/50">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Course-wise Admissions Abstract</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                CQ = Convenor (CONV) · MQ = Management (MANG) · Merit Quota = registration Merit Eligible (Not Eligible / blank are not counted)
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                <thead>
                  <tr className="bg-white dark:bg-slate-900">
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Course</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Branch</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">CQ - Intake</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">CQ - Admitted</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">CQ - Cancelled</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">MQ - Admitted</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">MQ - Intake</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">MQ - Cancelled</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Merit Quota Admitted</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Merit Quota Cancelled</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 w-14">Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {statsLoading ? (
                    <tr>
                      <td colSpan={ABSTRACT_COLUMN_COUNT} className="py-20 text-center">
                        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                      </td>
                    </tr>
                  ) : stats.length === 0 ? (
                    <tr>
                      <td colSpan={ABSTRACT_COLUMN_COUNT} className="py-20 text-center text-slate-500">No data available for the selected filters.</td>
                    </tr>
                  ) : (
                    stats.flatMap((c: any) => 
                      c.branches.map((b: any) => ({
                        courseId: c.courseId,
                        courseName: c.courseName,
                        branchId: b.branchId,
                        branchName: b.branchName,
                        cqIntake: b.cqIntake,
                        cqAdmitted: b.cqAdmitted,
                        cqCancelled: b.cqCancelled,
                        mqAdmitted: b.mqAdmitted,
                        mqIntake: b.mqIntake,
                        mqCancelled: b.mqCancelled,
                        meritQuotaAdmitted: b.meritQuotaAdmitted,
                        meritQuotaCancelled: b.meritQuotaCancelled,
                      }))
                    ).map((row: any) => (
                      <tr key={`${row.courseId || row.courseName}-${row.branchId || row.branchName}`} className="group transition hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-4 py-3">
                          <span className="font-bold text-slate-900 dark:text-slate-100">{row.courseName || 'Unknown Course'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            {row.branchName || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">
                          {formatAbstractIntake(row.cqIntake)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-blue-600 dark:text-blue-400">
                          {row.cqAdmitted ?? 0}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-red-600 dark:text-red-400">
                          {row.cqCancelled ?? 0}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-amber-600 dark:text-amber-400">
                          {row.mqAdmitted ?? 0}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:text-slate-300">
                          {formatAbstractIntake(row.mqIntake)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-red-600 dark:text-red-400">
                          {row.mqCancelled ?? 0}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          {row.meritQuotaAdmitted ?? 0}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-red-600 dark:text-red-400">
                          {row.meritQuotaCancelled ?? 0}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => openIntakeEditor(row)}
                            disabled={!canEditAdmission || !row.courseId || !row.branchId}
                            title={
                              row.courseId && row.branchId
                                ? 'Edit CQ and MQ intake'
                                : 'Course and branch id required to set intake'
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : activeTab === 'detailed' ? (
        <Card className="overflow-hidden border-white/60 shadow-lg dark:border-slate-800/70 dark:shadow-none">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200/80 dark:divide-slate-800/80">
              <thead className="bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/70">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Admission #
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Student
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Course
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Branch
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Updated
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white/80 backdrop-blur-sm dark:divide-slate-800 dark:bg-slate-900/60">
                {isLoading || isFetching ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center text-sm text-slate-500">
                      <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-400 border-t-transparent" />
                      <p className="mt-4 text-xs uppercase tracking-[0.3em] text-slate-400">Loading admissions…</p>
                    </td>
                  </tr>
                ) : isEmpty ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center text-sm text-slate-500">
                      <p className="font-medium text-slate-600 dark:text-slate-400">No admissions found.</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.3em] text-slate-400">
                        Adjust filters or search criteria.
                      </p>
                    </td>
                  </tr>
                ) : (
                  admissions.map((record) => (
                    <tr key={record._id} className="transition hover:bg-blue-50/60 dark:hover:bg-slate-800/60">
                      <td className="px-6 py-4 text-sm font-semibold text-blue-600 dark:text-blue-300">
                        {record.admissionNumber}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                        {record.studentInfo?.name ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        {record.courseInfo?.course || getCourseName(record.courseInfo?.courseId) || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        {record.courseInfo?.branch || getBranchName(record.courseInfo?.branchId) || '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        {(() => {
                          const badge = getAdmissionStatusBadge(record.status);
                          return (
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}>
                              {badge.label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {record.updatedAt ? new Date(record.updatedAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {canEditAdmission && record.status !== ADMISSION_CANCELLED_STATUS && (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => openCancelDialog(record)}
                            >
                              Cancel
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setStudentInfoViewRecord(record)}
                          >
                            View
                          </Button>
                          {canEditReference && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openReferenceEditor(record)}
                              title="Edit Reference 1 on admission, joining, and lead"
                            >
                              Ref
                            </Button>
                          )}
                          {canEditAdmission && record.joiningId ? (
                            <Link href={`/superadmin/joining/${record.joiningId}`}>
                              <Button variant="outline" size="sm" className="gap-1.5">
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </Button>
                            </Link>
                          ) : canEditAdmission ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              disabled
                              title="No joining record is linked to this admission"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {pagination.pages > 1 && (
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
              <div>
                Page {pagination.page} of {pagination.pages}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                  disabled={pagination.page === 1 || isFetching}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((prev) => Math.min(prev + 1, pagination.pages))}
                  disabled={pagination.page === pagination.pages || isFetching}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      ) : activeTab === 'student-info' ? (
        <Card className="overflow-hidden border-white/60 shadow-lg dark:border-slate-800/70 dark:shadow-none">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200/80 dark:divide-slate-800/80">
              <thead className="bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/70">
                <tr>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Admission #</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Timestamp</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Course / Branch</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Student Name</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Contact No</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Quota</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Caste</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">EWS</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Certificates</th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Paid</th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white/80 backdrop-blur-sm dark:divide-slate-800 dark:bg-slate-900/60">
                {isLoading || isFetching ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-16 text-center text-sm text-slate-500">
                      <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-400 border-t-transparent" />
                      <p className="mt-4 text-xs uppercase tracking-[0.3em] text-slate-400">Loading admissions…</p>
                    </td>
                  </tr>
                ) : isEmpty ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-16 text-center text-sm text-slate-500">
                      <p className="font-medium text-slate-600 dark:text-slate-400">No admissions found.</p>
                    </td>
                  </tr>
                ) : (
                  admissions.map((record: any) => (
                    <tr key={record._id} className="transition hover:bg-blue-50/60 dark:hover:bg-slate-800/60">
                      <td className="px-6 py-4 text-sm font-bold text-blue-600 dark:text-blue-400">
                        {record.admissionNumber}
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {record.createdAt ? new Date(record.createdAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{record.courseInfo?.course || '—'}</span>
                          <span className="text-[10px] text-slate-500">{record.courseInfo?.branch || '—'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                        {record.studentInfo?.name ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-400">
                        {record.studentInfo?.phone ?? '—'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="rounded-md bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {record.courseInfo?.quota || '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase">
                          {record.reservation?.general || 'OC'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {(() => {
                          const ewsLabel = formatReservationEws(record.reservation);
                          return (
                            <span
                              className={`text-xs font-semibold ${
                                ewsLabel === 'Yes'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {ewsLabel}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {(() => {
                           const docs = record.documents || {};
                           const received = Object.values(docs).filter(v => v === 'received').length;
                           const total = Object.values(docs).length;
                           return (
                             <div className="flex flex-col items-center gap-1">
                               <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{received}/{total}</span>
                               <div className="h-1 w-12 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                 <div 
                                   className="h-full bg-blue-500" 
                                   style={{ width: `${(received / (total || 1)) * 100}%` }}
                                 />
                               </div>
                             </div>
                           );
                        })()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(record.paymentSummary?.totalPaid || 0)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-xs text-slate-600 dark:text-slate-400">
                        {resolveAdmissionReference1(record) || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {pagination.pages > 1 && (
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-200 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
              <div>
                Page {pagination.page} of {pagination.pages}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(prev => Math.max(prev - 1, 1))} disabled={pagination.page === 1 || isFetching}>Previous</Button>
                <Button variant="outline" size="sm" onClick={() => setPage(prev => Math.min(prev + 1, pagination.pages))} disabled={pagination.page === pagination.pages || isFetching}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      ) : activeTab === 'reference-list' ? (
        <Card className="overflow-hidden border-none p-0 shadow-lg dark:shadow-none">
          <div className="bg-slate-50 px-6 py-4 dark:bg-slate-800/50">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Reference list</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Admissions grouped by student Reference 1 (from each admission record), broken down by course. Uses the course, branch, status, and admission date filters above.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead>
                <tr className="bg-white dark:bg-slate-900">
                  <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-900">
                    S. No.
                  </th>
                  <th className="sticky left-14 z-10 bg-white px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-900">
                    Reference
                  </th>
                  {referenceCourses.map((c) => (
                    <th
                      key={c.courseId}
                      title={c.courseName}
                      className="max-w-[160px] px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500"
                    >
                      <span className="line-clamp-2">{c.courseName}</span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {referenceStatsLoading ? (
                  <tr>
                    <td
                      colSpan={Math.max(3 + referenceCourses.length, 3)}
                      className="py-16 text-center text-slate-500"
                    >
                      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                      <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-400">Loading reference stats…</p>
                    </td>
                  </tr>
                ) : referenceRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(3 + referenceCourses.length, 3)}
                      className="py-16 text-center text-slate-500"
                    >
                      No data for the selected filters.
                    </td>
                  </tr>
                ) : (
                  referenceRows.map((row: any, idx: number) => {
                    const rowTotal =
                      Number(row.total) ||
                      referenceCourses.reduce(
                        (acc, c) => acc + (Number(row.counts?.[c.courseId]) || 0),
                        0
                      );
                    return (
                      <tr
                        key={row.referenceKey ?? `ref-${idx}`}
                        className="transition hover:bg-slate-50 dark:hover:bg-slate-800/30"
                      >
                        <td className="sticky left-0 z-10 bg-white px-4 py-3 text-sm font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                          {idx + 1}
                        </td>
                        <td className="sticky left-14 z-10 bg-white px-4 py-3 text-sm font-semibold text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                          {row.name}
                        </td>
                        {referenceCourses.map((c) => (
                          <td key={c.courseId} className="px-3 py-3 text-center text-sm font-semibold text-blue-600 dark:text-blue-400">
                            {Number(row.counts?.[c.courseId]) || 0}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center text-sm font-bold text-slate-900 dark:text-slate-100">
                          {rowTotal}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : activeTab === 'date-wise' ? (
        <Card className="overflow-hidden border-none p-0 shadow-lg dark:shadow-none">
          <div className="bg-slate-50 px-6 py-4 dark:bg-slate-800/50">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Date-wise admissions</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Count of admissions on each calendar day by course, using each student&apos;s admission date (not last updated). Uses the same filters as above.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead>
                <tr className="bg-white dark:bg-slate-900">
                  <th className="sticky left-0 z-10 bg-white px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-900">
                    Date
                  </th>
                  {dateWiseCourses.map((c) => (
                    <th
                      key={c.courseId}
                      title={c.courseName}
                      className="max-w-[160px] px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500"
                    >
                      <span className="line-clamp-2">{c.courseName}</span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {dateWiseStatsLoading ? (
                  <tr>
                    <td
                      colSpan={Math.max(3 + dateWiseCourses.length, 3)}
                      className="py-16 text-center text-slate-500"
                    >
                      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                      <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-400">Loading date-wise stats…</p>
                    </td>
                  </tr>
                ) : dateWiseRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(3 + dateWiseCourses.length, 3)}
                      className="py-16 text-center text-slate-500"
                    >
                      No data for the selected filters.
                    </td>
                  </tr>
                ) : (
                  dateWiseRows.map((row: any) => {
                    const rowTotal =
                      Number(row.total) ||
                      dateWiseCourses.reduce(
                        (acc, c) => acc + (Number(row.counts?.[c.courseId]) || 0),
                        0
                      );
                    let displayDate = row.date;
                    try {
                      displayDate = new Date(row.date + 'T12:00:00').toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      });
                    } catch {
                      displayDate = row.date;
                    }
                    return (
                      <tr
                        key={row.date}
                        className="transition hover:bg-slate-50 dark:hover:bg-slate-800/30"
                      >
                        <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-3 text-sm font-semibold text-slate-900 dark:bg-slate-900 dark:text-slate-100">
                          {displayDate}
                        </td>
                        {dateWiseCourses.map((c) => (
                          <td key={c.courseId} className="px-3 py-3 text-center text-sm font-semibold text-blue-600 dark:text-blue-400">
                            {Number(row.counts?.[c.courseId]) || 0}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-center text-sm font-bold text-slate-900 dark:text-slate-100">
                          {rowTotal}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
};

export default CompletedAdmissionsPage;


