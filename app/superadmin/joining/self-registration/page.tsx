'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { admissionAPI, joiningAPI } from '@/lib/api';
import { SELF_REGISTRATION_SOURCE } from '@/lib/joiningSelfRegistration';
import { ShareSelfRegistrationModal } from '@/components/joining/ShareSelfRegistrationModal';
import { Admission, Joining, JoiningListResponse, JoiningStatusCounts } from '@/types';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { useDashboardHeader, useJoiningDeskPermissions } from '@/components/layout/DashboardShell';
import { showToast } from '@/lib/toast';
import { useCourseLookup } from '@/hooks/useCourseLookup';
import { resolveJoiningOrAdmissionCourseLabel } from '@/lib/admissionCourseDisplay';

type SelfRegTab = 'draft' | 'pending' | 'approved';

const INR_CURRENCY_FORMAT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function joiningRegistrationHasCollege(j: Joining & { hasCollege?: boolean }): boolean {
  if (typeof j.hasCollege === 'boolean') return j.hasCollege;
  const r = j.registrationFormData;
  if (!r || typeof r !== 'object') return false;
  const o = r as Record<string, unknown>;
  for (const k of ['college_id', 'collegeId', 'school_or_college_id', 'schoolOrCollegeId'] as const) {
    const v = o[k];
    if (v !== undefined && v !== null && String(v).trim()) return true;
  }
  const byName = o.school_or_college_name ?? o.college;
  if (typeof byName === 'string' && byName.trim()) return true;
  return false;
}

const joiningHasManagedCourseAndBranch = (joining: Joining): boolean => {
  const c = String(joining.courseInfo?.courseId ?? '').trim();
  const b = String(joining.courseInfo?.branchId ?? '').trim();
  const q = String(joining.courseInfo?.quota ?? '').trim();
  if (!c || !b || !q) return false;
  return joiningRegistrationHasCollege(joining);
};

const tabToStatus = (tab: SelfRegTab): 'draft' | 'pending_approval' | 'approved' => {
  if (tab === 'pending') return 'pending_approval';
  if (tab === 'approved') return 'approved';
  return 'draft';
};

const EMPTY_STATUS_COUNTS: JoiningStatusCounts = {
  draft: 0,
  pending_approval: 0,
  approved: 0,
};

const formatReservationEws = (reservation?: Joining['reservation'] | Admission['reservation']) => {
  if (reservation?.isEws === true) return 'Yes';
  if (reservation?.isEws === false) return 'No';
  if (reservation?.general === 'ews' || reservation?.other?.includes('EWS')) return 'Yes';
  return 'No';
};

const formatQualificationMerit = (qualifications?: { merit?: boolean | null }) => {
  if (qualifications?.merit === true) return 'Yes';
  if (qualifications?.merit === false) return 'No';
  return '—';
};

const formatQualificationAc = (qualifications?: { ac?: boolean | null }) => {
  if (qualifications?.ac === true) return 'AC';
  if (qualifications?.ac === false) return 'Non-AC';
  return '—';
};

const resolveAdmissionReference1 = (record: Admission) => {
  const anyRecord = record as unknown as Record<string, unknown>;
  const fromList =
    (typeof record.referenceName === 'string' ? record.referenceName : '') ||
    (typeof anyRecord.reference_name === 'string' ? (anyRecord.reference_name as string) : '') ||
    (typeof anyRecord.reference1 === 'string' ? (anyRecord.reference1 as string) : '');
  const direct = String(fromList ?? '').trim();
  if (direct) return direct;
  const ld = (record.leadData as Record<string, unknown> | undefined) ?? undefined;
  return String(ld?.reference1 ?? ld?.referenceName ?? ld?.reference_name ?? '').trim();
};

const resolveAdmissionSource = (record: Admission) => {
  const fromLead = String(record.leadSource || '').trim();
  if (fromLead) return fromLead;
  const ld = (record.leadData as Record<string, unknown> | undefined) ?? undefined;
  return String(ld?.source ?? ld?.leadSource ?? '').trim();
};

const extractAdmissionFromApi = (response: unknown): Admission | null => {
  if (!response || typeof response !== 'object') return null;
  const root = response as Record<string, unknown>;
  const nested = root.data;
  if (nested && typeof nested === 'object') {
    const data = nested as Record<string, unknown>;
    if (data.admission && typeof data.admission === 'object') {
      return data.admission as Admission;
    }
    if (data._id || data.admissionNumber) {
      return data as unknown as Admission;
    }
  }
  if (root._id || root.admissionNumber) {
    return root as unknown as Admission;
  }
  return null;
};

export default function SelfRegistrationPage() {
  const queryClient = useQueryClient();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const { canAccessJoiningPage } = useJoiningDeskPermissions();
  const canAccessPage = canAccessJoiningPage('self-registration');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState<SelfRegTab>('draft');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [deletingRouteId, setDeletingRouteId] = useState<string | null>(null);
  /** Admissions-style view dialog: Step 1 (draft/pending) or full admission (approved). */
  const [viewDialog, setViewDialog] = useState<
    | { kind: 'step1'; routeId: string }
    | { kind: 'admission'; admissionId: string; routeId: string }
    | null
  >(null);
  const [isResolvingView, setIsResolvingView] = useState(false);
  const { getCourseName, getBranchName } = useCourseLookup();

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 400);
    return () => window.clearTimeout(id);
  }, [searchTerm]);

  const { data, isLoading, isFetching } = useQuery<JoiningListResponse>({
    queryKey: ['self-registration', page, limit, debouncedSearch, activeTab],
    queryFn: async () => {
      const response = await joiningAPI.list({
        page,
        limit,
        search: debouncedSearch || undefined,
        status: tabToStatus(activeTab),
        source: SELF_REGISTRATION_SOURCE,
        requireEnquiry: true,
      });
      return response;
    },
    enabled: canAccessPage,
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });

  const viewAdmissionId = viewDialog?.kind === 'admission' ? viewDialog.admissionId : null;
  const viewStep1RouteId = viewDialog?.kind === 'step1' ? viewDialog.routeId : null;

  const {
    data: admissionViewRecord,
    isLoading: isAdmissionViewLoading,
    isError: isAdmissionViewError,
  } = useQuery({
    queryKey: ['admission', 'self-registration-view', viewAdmissionId],
    enabled: Boolean(viewAdmissionId),
    queryFn: async () => {
      const response = await admissionAPI.getById(viewAdmissionId as string);
      const admission = extractAdmissionFromApi(response);
      if (!admission?._id) {
        throw new Error('Admission record not found');
      }
      return admission;
    },
    staleTime: 60_000,
  });

  const {
    data: step1Joining,
    isLoading: isStep1ViewLoading,
    isError: isStep1ViewError,
  } = useQuery({
    queryKey: ['joining', 'self-registration-step1-view', viewStep1RouteId],
    enabled: Boolean(viewStep1RouteId),
    queryFn: async () => {
      const response = await joiningAPI.getByLeadId(viewStep1RouteId as string);
      const joining =
        (response as { data?: { joining?: Joining } })?.data?.joining ||
        (response as { joining?: Joining })?.joining ||
        null;
      if (!joining?._id) {
        throw new Error('Self-registration not found');
      }
      return joining;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (isAdmissionViewError && viewAdmissionId) {
      showToast.error('Failed to load admission details');
      setViewDialog(null);
    }
  }, [isAdmissionViewError, viewAdmissionId]);

  useEffect(() => {
    if (isStep1ViewError && viewStep1RouteId) {
      showToast.error('Failed to load Step 1 details');
      setViewDialog(null);
    }
  }, [isStep1ViewError, viewStep1RouteId]);

  const payload = data?.data ?? {
    joinings: [],
    pagination: { page: 1, pages: 1, total: 0, limit },
    statusCounts: EMPTY_STATUS_COUNTS,
  };
  const joinings = payload.joinings ?? [];
  const pagination = payload.pagination ?? { page: 1, pages: 1, total: 0, limit };
  const statusCounts = payload.statusCounts ?? EMPTY_STATUS_COUNTS;
  const isEmpty = !isLoading && joinings.length === 0;

  const approveMutation = useMutation({
    mutationFn: async (routeId: string) => joiningAPI.approve(routeId),
    onSuccess: () => {
      showToast.success('Self-registration approved — it stays on this page under Approved');
      void queryClient.invalidateQueries({ queryKey: ['self-registration'] });
      void queryClient.invalidateQueries({ queryKey: ['joining-pipeline'] });
      void queryClient.invalidateQueries({ queryKey: ['admissions'] });
      void queryClient.invalidateQueries({ queryKey: ['confirmed-leads'] });
      setActiveTab('approved');
      setPage(1);
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      showToast.error(error?.response?.data?.message || 'Failed to approve self-registration');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (routeId: string) => joiningAPI.deleteSelfRegistration(routeId),
    onSuccess: () => {
      showToast.success('Self-registration deleted');
      setDeletingRouteId(null);
      void queryClient.invalidateQueries({ queryKey: ['self-registration'] });
      void queryClient.invalidateQueries({ queryKey: ['confirmed-leads'] });
      void queryClient.invalidateQueries({ queryKey: ['joining-pipeline'] });
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      setDeletingRouteId(null);
      showToast.error(error?.response?.data?.message || 'Failed to delete self-registration');
    },
  });

  const headerContent = useMemo(
    () => (
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Self Registration</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Student-submitted applications stay on this page through draft, pending, and approved — they do not
            appear on Confirmed Leads.
          </p>
        </div>
        <Button type="button" variant="primary" className="whitespace-nowrap" onClick={() => setIsShareModalOpen(true)}>
          Show QR / Print
        </Button>
      </div>
    ),
    []
  );

  useEffect(() => {
    setHeaderContent(headerContent);
    return () => clearHeaderContent();
  }, [headerContent, setHeaderContent, clearHeaderContent]);

  const routeIdFor = (joining: (typeof joinings)[number]) =>
    String(joining.leadId || joining._id || '');

  const handleDelete = (routeId: string, label: string) => {
    if (!routeId) return;
    const ok = window.confirm(
      `Delete self-registration${label ? ` for ${label}` : ''}? This cannot be undone.`
    );
    if (!ok) return;
    setDeletingRouteId(routeId);
    deleteMutation.mutate(routeId);
  };

  const openViewDialog = async (joining: Joining) => {
    const routeId = routeIdFor(joining);
    if (!routeId) {
      showToast.error('Record id is missing');
      return;
    }

    const wantsAdmission =
      activeTab === 'approved' ||
      joining.status === 'approved' ||
      Boolean(String(joining.admissionId || '').trim());

    if (!wantsAdmission) {
      setViewDialog({ kind: 'step1', routeId });
      return;
    }

    const directAdmissionId = String(joining.admissionId || '').trim();
    if (directAdmissionId) {
      setViewDialog({ kind: 'admission', admissionId: directAdmissionId, routeId });
      return;
    }

    const joiningId = String(joining._id || '').trim();
    if (!joiningId) {
      showToast.error('No admission entry for this record');
      return;
    }

    setIsResolvingView(true);
    try {
      const response = await admissionAPI.getByJoiningId(joiningId);
      const admission = extractAdmissionFromApi(response);
      if (!admission?._id) {
        showToast.error('No admission entry for this record');
        return;
      }
      setViewDialog({ kind: 'admission', admissionId: String(admission._id), routeId });
    } catch {
      showToast.error('No admission entry for this record');
    } finally {
      setIsResolvingView(false);
    }
  };

  if (!canAccessPage) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        You do not have access to Self Registration. Ask a Super Admin to enable it under User Management →
        Joining Desk pages.
      </div>
    );
  }

  const tabButtonClass = (tab: SelfRegTab, activeClass: string) =>
    `rounded-full px-3 py-1.5 text-xs font-semibold transition ${
      activeTab === tab
        ? activeClass
        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
    }`;

  const colSpan = activeTab === 'approved' ? 7 : 6;

  return (
    <div className="w-full space-y-6">
      <Card className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="w-full max-w-xs">
            <Input
              compact
              placeholder="Search student, phone, enquiry…"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('draft');
                setPage(1);
              }}
              className={tabButtonClass('draft', 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200')}
            >
              Draft{' '}
              <span className="ml-1 tabular-nums opacity-80">({statusCounts.draft})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('pending');
                setPage(1);
              }}
              className={tabButtonClass(
                'pending',
                'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200'
              )}
            >
              Pending{' '}
              <span className="ml-1 tabular-nums opacity-80">({statusCounts.pending_approval})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('approved');
                setPage(1);
              }}
              className={tabButtonClass(
                'approved',
                'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200'
              )}
            >
              Approved{' '}
              <span className="ml-1 tabular-nums opacity-80">({statusCounts.approved})</span>
            </button>
            <span className="hidden h-4 w-px bg-slate-200 dark:bg-slate-700 sm:inline-block" aria-hidden />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Draft <span className="font-semibold text-blue-600 dark:text-blue-300">{statusCounts.draft}</span>
              <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
              Pending{' '}
              <span className="font-semibold text-amber-600 dark:text-amber-300">
                {statusCounts.pending_approval}
              </span>
              <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
              Approved{' '}
              <span className="font-semibold text-emerald-600 dark:text-emerald-300">
                {statusCounts.approved}
              </span>
            </p>
          </div>
        </div>
      </Card>

      <Card className="relative overflow-hidden">
        {isFetching && !isLoading ? (
          <div className="border-b border-slate-200/80 bg-blue-50/80 px-4 py-2 text-center text-xs font-medium text-blue-700 dark:border-slate-800 dark:bg-blue-950/40 dark:text-blue-200">
            Updating list…
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200/80 dark:divide-slate-800/80">
            <thead className="bg-slate-50/80 dark:bg-slate-900/70">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Enquiry / Student
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Contact
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Course
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Quota
                </th>
                {activeTab === 'approved' ? (
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Admission
                  </th>
                ) : null}
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Updated
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white/80 dark:divide-slate-800 dark:bg-slate-900/60">
              {isLoading ? (
                <tr>
                  <td colSpan={colSpan} className="px-6 py-16 text-center text-sm text-slate-500">
                    Loading self-registration requests…
                  </td>
                </tr>
              ) : isEmpty ? (
                <tr>
                  <td colSpan={colSpan} className="px-6 py-16 text-center text-sm text-slate-500">
                    <p className="font-medium text-slate-600 dark:text-slate-400">
                      No self-registration requests in this tab.
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Use <span className="font-medium">Show QR / Print</span> above to display or print the campus
                      link for students.
                    </p>
                  </td>
                </tr>
              ) : (
                joinings.map((joining) => {
                  const routeId = routeIdFor(joining);
                  const canApprove = activeTab === 'pending' && joiningHasManagedCourseAndBranch(joining);
                  const studentLabel =
                    joining.studentInfo?.name || joining.lead?.name || joining.leadData?.name || '';
                  const isDeleting = deletingRouteId === routeId && deleteMutation.isPending;
                  const admissionConfirmed = Boolean(joining.admissionConfirmed);
                  const admissionNumber = String(joining.admissionNumber || '').trim();
                  const admissionStatus = String(joining.admissionStatus || '').trim();
                  const isCancelled = admissionStatus.toLowerCase() === 'admission cancelled';
                  return (
                    <tr key={joining._id} className="transition hover:bg-blue-50/60 dark:hover:bg-slate-800/60">
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-semibold text-blue-600 dark:text-blue-300">
                            {joining.lead?.enquiryNumber || joining.leadData?.enquiryNumber || '—'}
                          </span>
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {studentLabel || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        <div className="flex flex-col gap-1">
                          <span>{joining.studentInfo?.phone || joining.lead?.phone || '—'}</span>
                          {(joining.lead?.fatherPhone || joining.leadData?.fatherPhone) && (
                            <span className="text-xs text-slate-400">
                              Father: {joining.lead?.fatherPhone || joining.leadData?.fatherPhone}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        <div className="flex flex-col gap-1">
                          <span>{resolveJoiningOrAdmissionCourseLabel(joining, getCourseName) || '—'}</span>
                          <span className="text-xs text-slate-400">
                            {joining.courseInfo?.branch || getBranchName(joining.courseInfo?.branchId) || '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        {joining.courseInfo?.quota || joining.lead?.quota || '—'}
                      </td>
                      {activeTab === 'approved' ? (
                        <td className="px-6 py-4">
                          {admissionConfirmed ? (
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex w-fit rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                                Admission confirmed
                              </span>
                              {admissionNumber ? (
                                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                  {admissionNumber}
                                </span>
                              ) : null}
                              {joining.admissionId ? (
                                <Link
                                  href={`/superadmin/admission/${joining.admissionId}/detail`}
                                  className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-300"
                                >
                                  Open admission
                                </Link>
                              ) : null}
                            </div>
                          ) : isCancelled ? (
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex w-fit rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
                                Admission cancelled
                              </span>
                              {admissionNumber ? (
                                <span className="text-xs text-slate-500">{admissionNumber}</span>
                              ) : null}
                            </div>
                          ) : (
                            <span className="inline-flex w-fit rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              No admission entry
                            </span>
                          )}
                        </td>
                      ) : null}
                      <td className="px-6 py-4 text-sm text-slate-500">
                        {joining.updatedAt ? new Date(joining.updatedAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {activeTab === 'pending' ? (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={approveMutation.isPending || !canApprove}
                              title={
                                canApprove
                                  ? undefined
                                  : 'Open Edit and complete college, quota, course, and branch before approving.'
                              }
                              onClick={() => approveMutation.mutate(routeId)}
                            >
                              {approveMutation.isPending ? 'Approving…' : 'Approve'}
                            </Button>
                          ) : null}
                          {activeTab !== 'approved' ? (
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={isDeleting || deleteMutation.isPending}
                              onClick={() => handleDelete(routeId, studentLabel)}
                            >
                              {isDeleting ? 'Deleting…' : 'Delete'}
                            </Button>
                          ) : null}
                          <Link href={`/superadmin/joining/${routeId}?from=self-registration`}>
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          </Link>
                          <Button
                            variant="light"
                            size="sm"
                            disabled={isResolvingView || isAdmissionViewLoading || isStep1ViewLoading}
                            onClick={() => void openViewDialog(joining)}
                          >
                            View
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination.total > 0 ? (
          <div className="flex flex-col gap-3 border-t border-slate-200/80 px-6 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Showing {(page - 1) * limit + 1}–{(page - 1) * limit + joinings.length} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                Rows
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value) || 20);
                    setPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                >
                  {[20, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <span className="text-sm text-slate-600">
                {pagination.page} / {pagination.pages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= pagination.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Dialog
        open={Boolean(viewDialog)}
        onOpenChange={(open) => {
          if (!open) setViewDialog(null);
        }}
      >
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto">
          {viewDialog?.kind === 'step1' ? (
            <>
              <DialogHeader>
                <DialogTitle>Student information</DialogTitle>
                <DialogDescription>
                  Step 1 details only for this self-registration
                  {step1Joining?.status === 'pending_approval'
                    ? ' (pending approval)'
                    : ' (draft)'}
                  . Full admission details appear after approval.
                </DialogDescription>
              </DialogHeader>
              {isStep1ViewLoading || !step1Joining ? (
                <p className="py-8 text-center text-sm text-slate-500">Loading Step 1 details…</p>
              ) : (
                <div className="grid gap-4 text-sm">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Enquiry</p>
                    <p className="mt-1 font-mono text-base font-semibold text-blue-600 dark:text-blue-400">
                      {step1Joining.lead?.enquiryNumber ||
                        step1Joining.leadData?.enquiryNumber ||
                        '—'}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Status:{' '}
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {step1Joining.status === 'pending_approval'
                          ? 'Pending approval'
                          : step1Joining.status === 'draft'
                            ? 'Draft'
                            : step1Joining.status}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Updated:{' '}
                      {step1Joining.updatedAt
                        ? new Date(step1Joining.updatedAt).toLocaleString()
                        : '—'}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {step1Joining.studentInfo?.name ||
                          step1Joining.lead?.name ||
                          step1Joining.leadData?.name ||
                          '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Contact</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {step1Joining.studentInfo?.phone || step1Joining.lead?.phone || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Gender</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {step1Joining.studentInfo?.gender || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Date of birth
                      </p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {step1Joining.studentInfo?.dateOfBirth || '—'}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Course / branch
                      </p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {resolveJoiningOrAdmissionCourseLabel(step1Joining, getCourseName) || '—'}{' '}
                        <span className="text-slate-500">·</span>{' '}
                        {step1Joining.courseInfo?.branch ||
                          getBranchName(step1Joining.courseInfo?.branchId) ||
                          '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Quota</p>
                      <p className="mt-0.5 font-medium uppercase text-slate-900 dark:text-slate-100">
                        {step1Joining.courseInfo?.quota || step1Joining.lead?.quota || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Caste</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {(step1Joining.reservation?.general || 'OC').toUpperCase()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">EWS</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {formatReservationEws(step1Joining.reservation)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Merit</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {formatQualificationMerit(step1Joining.qualifications)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">AC / Non-AC</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {formatQualificationAc(step1Joining.qualifications)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Father</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {step1Joining.parents?.father?.name ||
                          step1Joining.leadData?.fatherName ||
                          '—'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {step1Joining.parents?.father?.phone ||
                          step1Joining.lead?.fatherPhone ||
                          step1Joining.leadData?.fatherPhone ||
                          '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Mother</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {step1Joining.parents?.mother?.name ||
                          step1Joining.leadData?.motherName ||
                          '—'}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {step1Joining.parents?.mother?.phone || '—'}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Source</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {SELF_REGISTRATION_SOURCE}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                {viewDialog.routeId ? (
                  <Link
                    href={`/superadmin/joining/${viewDialog.routeId}?from=self-registration`}
                    className="w-full sm:w-auto"
                  >
                    <Button type="button" className="w-full sm:w-auto">
                      Edit Step 1 form
                    </Button>
                  </Link>
                ) : null}
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Student information</DialogTitle>
                <DialogDescription>
                  Full admission view for this approved self-registration. Open the admission page for
                  payments, documents, and later steps.
                </DialogDescription>
              </DialogHeader>
              {isAdmissionViewLoading || !admissionViewRecord ? (
                <p className="py-8 text-center text-sm text-slate-500">Loading admission details…</p>
              ) : (
                <div className="grid gap-4 text-sm">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Admission</p>
                    <p className="mt-1 font-mono text-base font-semibold text-blue-600 dark:text-blue-400">
                      {admissionViewRecord.admissionNumber || '—'}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Status:{' '}
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {admissionViewRecord.status || '—'}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Recorded:{' '}
                      {admissionViewRecord.createdAt
                        ? new Date(admissionViewRecord.createdAt).toLocaleString()
                        : '—'}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {admissionViewRecord.studentInfo?.name ?? '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Contact</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {admissionViewRecord.studentInfo?.phone ?? '—'}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Course / branch
                      </p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {resolveJoiningOrAdmissionCourseLabel(admissionViewRecord, getCourseName) ||
                          '—'}{' '}
                        <span className="text-slate-500">·</span>{' '}
                        {admissionViewRecord.courseInfo?.branch ||
                          getBranchName(admissionViewRecord.courseInfo?.branchId) ||
                          '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Quota</p>
                      <p className="mt-0.5 font-medium uppercase text-slate-900 dark:text-slate-100">
                        {admissionViewRecord.courseInfo?.quota || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Caste</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {(admissionViewRecord.reservation?.general || 'OC').toUpperCase()}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">EWS</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {formatReservationEws(admissionViewRecord.reservation)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Merit</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {formatQualificationMerit(admissionViewRecord.qualifications)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">AC / Non-AC</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {formatQualificationAc(admissionViewRecord.qualifications)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Paid</p>
                      <p className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                        {INR_CURRENCY_FORMAT.format(
                          admissionViewRecord.paymentSummary?.yearOnePaid ?? 0
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Reference
                      </p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {resolveAdmissionReference1(admissionViewRecord) || '—'}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Source</p>
                      <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                        {resolveAdmissionSource(admissionViewRecord) || SELF_REGISTRATION_SOURCE}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                {admissionViewRecord?.joiningId || viewDialog?.routeId ? (
                  <Link
                    href={`/superadmin/joining/${
                      admissionViewRecord?.joiningId || viewDialog?.routeId
                    }?from=self-registration`}
                    className="w-full sm:w-auto"
                  >
                    <Button type="button" variant="outline" className="w-full sm:w-auto">
                      Edit joining form
                    </Button>
                  </Link>
                ) : null}
                {admissionViewRecord?._id ? (
                  <Link
                    href={`/superadmin/admission/${admissionViewRecord._id}/detail?from=self-registration`}
                    className="w-full sm:w-auto"
                  >
                    <Button type="button" className="w-full sm:w-auto">
                      Full admission page
                    </Button>
                  </Link>
                ) : null}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ShareSelfRegistrationModal open={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} />
    </div>
  );
}
