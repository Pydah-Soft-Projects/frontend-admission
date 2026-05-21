'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { joiningAPI } from '@/lib/api';
import { parseJoiningPublicLinkFromApiResponse } from '@/lib/joiningInviteLink';
import { JoiningDraftSmsModal } from '@/components/joining/JoiningDraftSmsModal';
import { AddJoiningFormModal } from '@/components/joining/AddJoiningFormModal';
import { JoiningListResponse, Joining } from '@/types';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import { showToast } from '@/lib/toast';
import { useCourseLookup } from '@/hooks/useCourseLookup';
import { resolveJoiningOrAdmissionCourseLabel } from '@/lib/admissionCourseDisplay';

const statusColors: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  interested: 'bg-green-100 text-green-700',
  contacted: 'bg-sky-100 text-sky-700',
  qualified: 'bg-indigo-100 text-indigo-700',
  'not interested': 'bg-red-100 text-red-700',
  partial: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-purple-100 text-purple-700',
  admitted: 'bg-emerald-100 text-emerald-700',
};

const getStatusBadge = (status?: string) => {
  if (!status) return 'bg-slate-100 text-slate-600';
  const key = status.toLowerCase();
  return statusColors[key] || 'bg-slate-100 text-slate-600';
};

/** Managed course + branch + quota + college must be set before pipeline approval (staff). */
function joiningRegistrationHasCollege(j: Joining): boolean {
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

const JoiningPipelinePage = () => {
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'draft' | 'pending'>('draft');
  const [isAddJoiningModalOpen, setIsAddJoiningModalOpen] = useState(false);
  const [smsSession, setSmsSession] = useState<{
    leadId: string;
    admissionPublicLink: { url: string; expiresAt?: string; pathToken: string };
    joiningOnlineAdmissionMode: true;
  } | null>(null);
  const { getCourseName, getBranchName } = useCourseLookup();

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 400);
    return () => window.clearTimeout(id);
  }, [searchTerm]);

  const { data, isLoading, isFetching } = useQuery<JoiningListResponse>({
    queryKey: ['joining-pipeline', page, limit, debouncedSearch, activeTab],
    queryFn: async () => {
      const statusValue = activeTab === 'pending' ? 'pending_approval' : 'draft';
      const response = await joiningAPI.list({
        page,
        limit,
        search: debouncedSearch || undefined,
        status: statusValue,
        requireEnquiry: true,
      });
      return response;
    },
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });

  const payload = data?.data ?? {
    joinings: [],
    pagination: { page: 1, pages: 1, total: 0, limit },
  };
  const joinings = payload.joinings ?? [];
  const pagination = payload.pagination ?? { page: 1, pages: 1, total: 0, limit };
  
  const isEmpty = !isLoading && joinings.length === 0;
  const showTableLoading = isLoading;
  const queryClient = useQueryClient();

  const mintLinkForSmsMutation = useMutation({
    mutationFn: (leadId: string) => joiningAPI.createPublicEditLink(leadId),
    onSuccess: (res, leadId) => {
      const parsed = parseJoiningPublicLinkFromApiResponse(res);
      if (!parsed?.url) {
        showToast.error('Link was created but the URL could not be resolved. Copy it from the joining detail page instead.');
        return;
      }
      setSmsSession({
        leadId,
        admissionPublicLink: {
          url: parsed.url,
          expiresAt: parsed.expiresAt,
          pathToken: parsed.pathToken,
        },
        joiningOnlineAdmissionMode: true,
      });
      showToast.success('Public link created. Review the message, then send SMS.');
      void queryClient.invalidateQueries({ queryKey: ['joining-pipeline'] });
      void queryClient.invalidateQueries({ queryKey: ['joining-in-progress'] });
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) => {
      showToast.error(error?.response?.data?.message || error?.message || 'Could not create public link');
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (leadId: string) => {
      return await joiningAPI.approve(leadId);
    },
    onSuccess: () => {
      showToast.success('Joining form approved successfully');
      queryClient.invalidateQueries({ queryKey: ['joining-pipeline'] });
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      showToast.error(error?.response?.data?.message || 'Failed to approve joining form');
    },
  });

  const headerContent = useMemo(
    () => (
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Joining Forms In Progress
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Track drafts and pending approvals. Open a form to continue the admission journey.
        </p>
      </div>
    ),
    []
  );

  useEffect(() => {
    setHeaderContent(headerContent);
    return () => clearHeaderContent();
  }, [headerContent, setHeaderContent, clearHeaderContent]);

  return (
    <div className="w-full space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder="Search joining forms by student, phone, or enquiry number…"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setPage(1);
            }}
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="primary"
              className="whitespace-nowrap"
              onClick={() => setIsAddJoiningModalOpen(true)}
            >
              Add Joining Form
            </Button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('draft');
                setPage(1);
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                activeTab === 'draft'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              Draft Forms
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('pending');
                setPage(1);
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                activeTab === 'pending'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              Pending Approval
            </button>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Total {activeTab === 'pending' ? 'pending' : 'in progress'}:{' '}
            <span className="font-semibold text-blue-600 dark:text-blue-300">{pagination.total}</span>
            {pagination.pages > 1 ? (
              <span className="ml-2 text-slate-400">
                (page {pagination.page} of {pagination.pages})
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
              Rows per page
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value) || 20);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
              >
                {[20, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </Card>

      <Card className="relative overflow-hidden border border-white/60 shadow-lg shadow-blue-100/30 dark:border-slate-800/70 dark:shadow-none">
        {isFetching && !isLoading ? (
          <div className="border-b border-slate-200/80 bg-blue-50/80 px-4 py-2 text-center text-xs font-medium text-blue-700 dark:border-slate-800 dark:bg-blue-950/40 dark:text-blue-200">
            Updating list…
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200/80 dark:divide-slate-800/80">
            <thead className="bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/70">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {activeTab === 'pending' ? 'Enquiry #' : 'Lead'}
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {activeTab === 'pending' ? 'Student Name' : 'Contact'}
                </th>
                {activeTab === 'pending' ? (
                  <>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Course
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Branch
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Quota
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Admission Fee Status
                    </th>
                  </>
                ) : (
                  <>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Course Interest
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Quota
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Mandal
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Updated
                    </th>
                  </>
                )}
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white/80 backdrop-blur-sm dark:divide-slate-800 dark:bg-slate-900/60">
              {showTableLoading ? (
                <tr>
                  <td colSpan={activeTab === 'pending' ? 7 : 7} className="px-6 py-16 text-center text-sm text-slate-500">
                    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-400 border-t-transparent" />
                    <p className="mt-4 text-xs uppercase tracking-[0.3em] text-slate-400">Loading joining forms…</p>
                  </td>
                </tr>
              ) : isEmpty ? (
                <tr>
                  <td colSpan={activeTab === 'pending' ? 7 : 7} className="px-6 py-16 text-center text-sm text-slate-500">
                    <p className="font-medium text-slate-600 dark:text-slate-400">
                      No joining drafts or pending approvals yet.
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.3em] text-slate-400">
                      CREATE A JOINING FORM FROM A CONFIRMED LEAD TO SEE IT LISTED HERE.
                    </p>
                  </td>
                </tr>
              ) : (
                joinings.map((joining) => {
                  const paymentStatus = joining.paymentSummary?.status || 'not_started';
                  const paymentStatusLabel = paymentStatus.replace(/_/g, ' ');
                  const paymentStatusClass = 
                    paymentStatus === 'paid' 
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200'
                      : paymentStatus === 'partial'
                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200'
                      : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
                  
                  return (
                    <tr key={joining._id} className="transition hover:bg-blue-50/60 dark:hover:bg-slate-800/60">
                      <td className="px-6 py-4">
                        {activeTab === 'pending' ? (
                          <span className="text-sm font-semibold text-blue-600 dark:text-blue-300">
                            {joining.lead?.enquiryNumber || joining.leadData?.enquiryNumber || '—'}
                          </span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {joining.lead?.name || joining.studentInfo?.name || joining.leadData?.name || '—'}
                            </span>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              {joining.lead?.enquiryNumber || joining.leadData?.enquiryNumber ? (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5">
                                  {joining.lead?.enquiryNumber || joining.leadData?.enquiryNumber}
                                </span>
                              ) : null}
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${getStatusBadge(joining.status)}`}>
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                                Draft
                              </span>
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                        {activeTab === 'pending' ? (
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {joining.studentInfo?.name || joining.lead?.name || joining.leadData?.name || '—'}
                          </span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <span>{joining.studentInfo?.phone || joining.lead?.phone || joining.leadData?.phone || '—'}</span>
                            {(joining.lead?.fatherPhone || joining.leadData?.fatherPhone) && (
                              <span className="text-xs text-slate-400">
                                Father: {joining.lead?.fatherPhone || joining.leadData?.fatherPhone}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      {activeTab === 'pending' ? (
                        <>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                            {resolveJoiningOrAdmissionCourseLabel(joining, getCourseName) || '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                            {joining.courseInfo?.branch ||
                              getBranchName(joining.courseInfo?.branchId) ||
                              '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                            {joining.courseInfo?.quota || joining.lead?.quota || joining.leadData?.quota || '—'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${paymentStatusClass}`}>
                              {paymentStatusLabel}
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                            <div className="flex flex-col gap-1">
                              <span>
                                {resolveJoiningOrAdmissionCourseLabel(joining, getCourseName) || '—'}
                              </span>
                              <span className="text-xs text-slate-400">
                                {joining.courseInfo?.branch ||
                                  getBranchName(joining.courseInfo?.branchId) ||
                                  'Branch pending'}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                            {joining.courseInfo?.quota || joining.lead?.quota || joining.leadData?.quota || '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                            <div className="flex flex-col gap-1">
                              <span>{joining.lead?.mandal || joining.leadData?.mandal || '—'}</span>
                              <span className="text-xs text-slate-400">{joining.lead?.district || joining.leadData?.district || '—'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {new Date(joining.updatedAt).toLocaleString()}
                          </td>
                        </>
                      )}
                      <td className="px-6 py-4 text-right">
                        {activeTab === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={
                                approveMutation.isPending ||
                                !joiningHasManagedCourseAndBranch(joining)
                              }
                              title={
                                joiningHasManagedCourseAndBranch(joining)
                                  ? undefined
                                  : 'Open the joining form and set college, quota, managed course, and managed branch under Course & Quota before approving.'
                              }
                              onClick={() => {
                                approveMutation.mutate(joining.leadId || joining._id);
                              }}
                            >
                              {approveMutation.isPending ? 'Approving…' : 'Approve'}
                            </Button>
                            <Link href={`/superadmin/joining/${joining.leadId || joining._id || 'new'}/detail`}>
                              <Button variant="outline" size="sm">
                                View
                              </Button>
                            </Link>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {joining.leadId && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={mintLinkForSmsMutation.isPending}
                                onClick={() => mintLinkForSmsMutation.mutate(joining.leadId!)}
                              >
                                {mintLinkForSmsMutation.isPending ? 'Preparing…' : 'Send admission SMS'}
                              </Button>
                            )}
                            <Link href={`/superadmin/joining/${joining.leadId || joining._id || 'new'}/detail`}>
                              <Button variant="primary" className="group inline-flex items-center gap-2">
                                <span className="transition-transform group-hover:-translate-x-0.5">View Details</span>
                                <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </Button>
                            </Link>
                          </div>
                        )}
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
              Showing{' '}
              <span className="font-medium">
                {joinings.length === 0 ? 0 : (page - 1) * limit + 1}–{(page - 1) * limit + joinings.length}
              </span>{' '}
              of <span className="font-medium">{pagination.total}</span>
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage(1)}
              >
                First
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              >
                Previous
              </Button>
              <span className="px-2 text-sm text-slate-600 dark:text-slate-300">
                Page {pagination.page} of {pagination.pages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= pagination.pages || isFetching}
                onClick={() => setPage((prev) => Math.min(prev + 1, pagination.pages))}
              >
                Next
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= pagination.pages || isFetching}
                onClick={() => setPage(pagination.pages)}
              >
                Last
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <JoiningDraftSmsModal
        open={Boolean(smsSession)}
        leadId={smsSession?.leadId}
        admissionPublicLink={smsSession?.admissionPublicLink}
        joiningOnlineAdmissionMode={Boolean(smsSession?.joiningOnlineAdmissionMode)}
        onClose={() => setSmsSession(null)}
      />

      <AddJoiningFormModal
        open={isAddJoiningModalOpen}
        onClose={() => setIsAddJoiningModalOpen(false)}
      />
    </div>
  );
};

export default JoiningPipelinePage;


