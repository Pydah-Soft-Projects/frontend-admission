'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { joiningAPI } from '@/lib/api';
import { JoiningListResponse, JoiningStatus } from '@/types';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import { useCourseLookup } from '@/hooks/useCourseLookup';

const statusPalette: Record<JoiningStatus, string> = {
  draft: 'bg-blue-100 text-blue-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
};

const defaultStatuses: JoiningStatus[] = ['draft', 'pending_approval'];

const JoiningInProgressPage = () => {
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<JoiningStatus[]>(defaultStatuses);
  const { getCourseName, getBranchName } = useCourseLookup();

  const queryKey = useMemo(
    () => [
      'joining-in-progress',
      page,
      limit,
      searchTerm,
      selectedStatuses.slice().sort().join(','),
    ],
    [page, limit, searchTerm, selectedStatuses]
  );

  const { data, isLoading, isFetching } = useQuery<JoiningListResponse>({
    queryKey,
    queryFn: async () => {
      const response = await joiningAPI.list({
        page,
        limit,
        search: searchTerm || undefined,
        status: selectedStatuses,
      });
      return response.data;
    },
    placeholderData: (previousData) => previousData,
  });

  const payload = data?.data ?? {
    joinings: [],
    pagination: { page: 1, pages: 1, total: 0, limit },
  };

  const joinings = payload.joinings ?? [];
  const pagination = payload.pagination ?? { page: 1, pages: 1, total: 0, limit };
  const isEmpty = !isLoading && joinings.length === 0;

  const headerContent = useMemo(
    () => (
      <div className="flex flex-col items-end gap-2 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Joining Forms In Progress</h1>
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

  const toggleStatus = (status: JoiningStatus) => {
    setSelectedStatuses((prev) => {
      if (prev.includes(status)) {
        const next = prev.filter((item) => item !== status);
        return next.length ? next : prev;
      }
      return [...prev, status];
    });
    setPage(1);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Input
            placeholder="Search joining forms by student, phone, or hall ticket…"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setPage(1);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            {defaultStatuses.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => toggleStatus(status)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  selectedStatuses.includes(status)
                    ? statusPalette[status]
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {status === 'pending_approval' ? 'Pending Approval' : 'Draft'}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden border border-white/60 shadow-lg shadow-blue-100/30 dark:border-slate-800/70 dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200/80 dark:divide-slate-800/80">
            <thead className="bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/70">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Student
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Contact
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Course / Branch
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Quota
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
                    <p className="mt-4 text-xs uppercase tracking-[0.3em] text-slate-400">Loading joining forms…</p>
                  </td>
                </tr>
              ) : isEmpty ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-sm text-slate-500">
                    <p className="font-medium text-slate-600 dark:text-slate-400">No joining drafts or pending approvals yet.</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.3em] text-slate-400">
                      Create a joining form from a confirmed lead to see it listed here.
                    </p>
                  </td>
                </tr>
              ) : (
                joinings.map((joining) => (
                  <tr key={joining._id} className="transition hover:bg-blue-50/60 dark:hover:bg-slate-800/60">
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {joining.lead?.name || joining.studentInfo?.name || '—'}
                        </span>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {joining.lead?.enquiryNumber && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5">
                              {joining.lead.enquiryNumber}
                            </span>
                          )}
                          {joining.lead?.leadStatus && (
                            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-700 dark:bg-purple-900/60 dark:text-purple-200">
                              Lead: {joining.lead.leadStatus}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                      <div className="flex flex-col gap-1">
                        <span>{joining.studentInfo?.phone || joining.lead?.phone || '—'}</span>
                        {joining.lead?.fatherPhone && (
                          <span className="text-xs text-slate-400">Father: {joining.lead.fatherPhone}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                      <div className="flex flex-col gap-1">
                        <span>{getCourseName(joining.courseInfo?.courseId) || joining.courseInfo?.course || joining.lead?.courseInterested || '—'}</span>
                        <span className="text-xs text-slate-400">
                          {getBranchName(joining.courseInfo?.branchId) || joining.courseInfo?.branch || 'Branch pending'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                      {joining.courseInfo?.quota || joining.lead?.quota || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${statusPalette[joining.status]}`}>
                        <span className="inline-block h-2 w-2 rounded-full bg-current opacity-70" />
                        {joining.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(joining.updatedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/superadmin/joining/${joining.leadId || joining._id}/detail`}>
                        <Button variant="outline" className="group inline-flex items-center gap-2">
                          <span className="transition-transform group-hover:-translate-x-0.5">View Details</span>
                          <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {pagination.pages > 1 && (
        <div className="mt-6 flex items-center justify-end gap-3">
          <Button
            variant="secondary"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-slate-600 dark:text-slate-300">
            Page {pagination.page} of {pagination.pages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= pagination.pages || isFetching}
            onClick={() => setPage((prev) => Math.min(prev + 1, pagination.pages))}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
};

export default JoiningInProgressPage;
