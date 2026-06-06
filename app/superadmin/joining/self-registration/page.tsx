'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { joiningAPI } from '@/lib/api';
import { SELF_REGISTRATION_SOURCE } from '@/lib/joiningSelfRegistration';
import { ShareSelfRegistrationModal } from '@/components/joining/ShareSelfRegistrationModal';
import { Joining, JoiningListResponse } from '@/types';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import { showToast } from '@/lib/toast';
import { useCourseLookup } from '@/hooks/useCourseLookup';
import { resolveJoiningOrAdmissionCourseLabel } from '@/lib/admissionCourseDisplay';

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

export default function SelfRegistrationPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'draft' | 'pending'>('draft');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const { getCourseName, getBranchName } = useCourseLookup();

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 400);
    return () => window.clearTimeout(id);
  }, [searchTerm]);

  const { data, isLoading, isFetching } = useQuery<JoiningListResponse>({
    queryKey: ['self-registration', page, limit, debouncedSearch, activeTab],
    queryFn: async () => {
      const statusValue = activeTab === 'pending' ? 'pending_approval' : 'draft';
      const response = await joiningAPI.list({
        page,
        limit,
        search: debouncedSearch || undefined,
        status: statusValue,
        source: SELF_REGISTRATION_SOURCE,
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

  const approveMutation = useMutation({
    mutationFn: async (routeId: string) => joiningAPI.approve(routeId),
    onSuccess: (res) => {
      const admissionId = (res as { data?: { admissionId?: string } })?.data?.admissionId;
      showToast.success('Self-registration approved — opening admission record');
      void queryClient.invalidateQueries({ queryKey: ['self-registration'] });
      void queryClient.invalidateQueries({ queryKey: ['joining-pipeline'] });
      void queryClient.invalidateQueries({ queryKey: ['admissions'] });
      if (admissionId) {
        router.push(`/superadmin/admission/${admissionId}/detail`);
      } else {
        router.push('/superadmin/joining/completed');
      }
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      showToast.error(error?.response?.data?.message || 'Failed to approve self-registration');
    },
  });

  const headerContent = useMemo(
    () => (
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Self Registration</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Student-submitted applications stay here until approved, then move to Admissions.
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

  return (
    <div className="w-full space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder="Search by student, phone, or enquiry number…"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setPage(1);
            }}
          />
          <div className="flex items-center gap-2">
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
              Draft
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
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Total: <span className="font-semibold text-blue-600 dark:text-blue-300">{pagination.total}</span>
          </p>
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
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-slate-500">
                    Loading self-registration requests…
                  </td>
                </tr>
              ) : isEmpty ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-slate-500">
                    <p className="font-medium text-slate-600 dark:text-slate-400">
                      No self-registration requests in this tab.
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Use <span className="font-medium">Show QR / Print</span> above to display or print the campus link for students.
                    </p>
                  </td>
                </tr>
              ) : (
                joinings.map((joining) => {
                  const routeId = routeIdFor(joining);
                  const canApprove = activeTab === 'pending' && joiningHasManagedCourseAndBranch(joining);
                  return (
                    <tr key={joining._id} className="transition hover:bg-blue-50/60 dark:hover:bg-slate-800/60">
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-semibold text-blue-600 dark:text-blue-300">
                            {joining.lead?.enquiryNumber || joining.leadData?.enquiryNumber || '—'}
                          </span>
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {joining.studentInfo?.name || joining.lead?.name || joining.leadData?.name || '—'}
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
                          <Link href={`/superadmin/joining/${routeId}`}>
                            <Button variant="outline" size="sm">
                              Edit
                            </Button>
                          </Link>
                          <Link href={`/superadmin/joining/${routeId}/detail`}>
                            <Button variant="light" size="sm">
                              View
                            </Button>
                          </Link>
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

      <ShareSelfRegistrationModal open={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} />
    </div>
  );
}
