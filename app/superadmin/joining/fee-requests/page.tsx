'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { feeRequestAPI } from '@/lib/api';
import type { FeeRequest, FeeRequestListResponse } from '@/types';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDashboardHeader, useJoiningDeskPermissions } from '@/components/layout/DashboardShell';
import { showToast } from '@/lib/toast';

const formatCurrency = (value?: number | null) => {
  if (value === undefined || value === null || !Number.isFinite(Number(value))) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value));
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function FeeRequestsPage() {
  const router = useRouter();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const { canApproveFeeRequest } = useJoiningDeskPermissions();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'approved'>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 400);
    return () => window.clearTimeout(id);
  }, [searchTerm]);

  const statusFilter = activeTab === 'pending' ? 'pending_approval' : 'approved';

  const { data, isLoading, isFetching } = useQuery<FeeRequestListResponse>({
    queryKey: ['fee-requests', page, limit, debouncedSearch, activeTab],
    queryFn: async () =>
      feeRequestAPI.list({
        page,
        limit,
        search: debouncedSearch || undefined,
        status: statusFilter,
      }),
    enabled: canApproveFeeRequest,
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });

  const payload = data?.data ?? {
    feeRequests: [],
    pagination: { page: 1, pages: 1, total: 0, limit },
  };
  const feeRequests = payload.feeRequests ?? [];
  const pagination = payload.pagination ?? { page: 1, pages: 1, total: 0, limit };

  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => feeRequestAPI.approve(id, note),
    onSuccess: () => {
      showToast.success('Fee request approved — fee portal and accommodation sync updated');
      setReviewNote('');
      setExpandedId(null);
      void queryClient.invalidateQueries({ queryKey: ['fee-requests'] });
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      showToast.error(error?.response?.data?.message || 'Failed to approve fee request');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => feeRequestAPI.reject(id, reason),
    onSuccess: () => {
      showToast.success('Fee request rejected');
      setRejectReason('');
      setExpandedId(null);
      void queryClient.invalidateQueries({ queryKey: ['fee-requests'] });
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      showToast.error(error?.response?.data?.message || 'Failed to reject fee request');
    },
  });

  const headerContent = useMemo(
    () => (
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Fee Requests</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Review revised Step 4 fee lines submitted from approved joinings. Approving applies fees to the fee portal
          and bus/hostel databases.
        </p>
      </div>
    ),
    []
  );

  useEffect(() => {
    if (!canApproveFeeRequest) {
      router.replace('/superadmin/joining');
    }
  }, [canApproveFeeRequest, router]);

  useEffect(() => {
    setHeaderContent(headerContent);
    return () => clearHeaderContent();
  }, [headerContent, setHeaderContent, clearHeaderContent]);

  if (!canApproveFeeRequest) {
    return null;
  }

  const isEmpty = !isLoading && feeRequests.length === 0;

  return (
    <div className="w-full space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder="Search by student, admission number, course, or branch…"
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
                setActiveTab('pending');
                setPage(1);
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                activeTab === 'pending'
                  ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              Pending Requests
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('approved');
                setPage(1);
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                activeTab === 'approved'
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              Approved Requests
            </button>
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Total {activeTab === 'pending' ? 'pending' : 'approved'}:{' '}
            <span className="font-semibold text-blue-600 dark:text-blue-300">{pagination.total}</span>
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
                  Student
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Course / Branch
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Batch
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Revised lines
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {activeTab === 'pending' ? 'Submitted' : 'Approved'}
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white/80 backdrop-blur-sm dark:divide-slate-800 dark:bg-slate-900/60">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-slate-500">
                    Loading fee requests…
                  </td>
                </tr>
              ) : isEmpty ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-slate-500">
                    No {activeTab === 'pending' ? 'pending' : 'approved'} fee requests yet.
                  </td>
                </tr>
              ) : (
                feeRequests.map((request: FeeRequest) => {
                  const lineCount = request.requestLines?.length ?? 0;
                  const isExpanded = expandedId === request.id;
                  const joinHref = request.leadId
                    ? `/superadmin/joining/${request.leadId}`
                    : request.joiningId
                      ? `/superadmin/joining/${request.joiningId}`
                      : null;

                  return (
                    <Fragment key={request.id}>
                      <tr className="transition hover:bg-blue-50/60 dark:hover:bg-slate-800/60">
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {request.studentName || '—'}
                            </span>
                            {request.admissionNumber ? (
                              <span className="text-xs text-slate-500">{request.admissionNumber}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                          <div>{request.course || '—'}</div>
                          <div className="text-xs text-slate-400">{request.branch || '—'}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {request.batch || '—'}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            {lineCount} changed
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {formatDateTime(
                            activeTab === 'pending' ? request.submittedAt : request.approvedAt
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setExpandedId(isExpanded ? null : request.id)}
                            >
                              {isExpanded ? 'Hide' : 'Details'}
                            </Button>
                            {joinHref ? (
                              <Link href={joinHref}>
                                <Button type="button" size="sm" variant="outline">
                                  Open joining
                                </Button>
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr key={`${request.id}-detail`} className="bg-slate-50/80 dark:bg-slate-900/40">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/70">
                              <div>
                                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  Revised fee lines
                                </h3>
                                <div className="mt-2 overflow-x-auto">
                                  <table className="min-w-full text-sm">
                                    <thead>
                                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                                        <th className="py-2 pr-4">Fee head</th>
                                        <th className="py-2 pr-4 text-right">Actual</th>
                                        <th className="py-2 pr-4 text-right">Revised</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(request.requestLines || []).map((line, idx) => (
                                        <tr key={`${request.id}-line-${idx}`} className="border-t border-slate-100 dark:border-slate-800">
                                          <td className="py-2 pr-4">
                                            {line.feeHeadName || line.feeHeadCode || line.structureId}
                                          </td>
                                          <td className="py-2 pr-4 text-right">
                                            {formatCurrency(line.actualAmount)}
                                          </td>
                                          <td className="py-2 pr-4 text-right font-semibold text-emerald-700 dark:text-emerald-300">
                                            {formatCurrency(line.revisedAmount)}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              {activeTab === 'pending' ? (
                                <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
                                  <div className="flex-1">
                                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                                      Reviewer note (optional)
                                    </label>
                                    <Input
                                      value={reviewNote}
                                      onChange={(e) => setReviewNote(e.target.value)}
                                      placeholder="Note recorded on approval…"
                                    />
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Input
                                      value={rejectReason}
                                      onChange={(e) => setRejectReason(e.target.value)}
                                      placeholder="Rejection reason…"
                                      className="min-w-[12rem]"
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      disabled={rejectMutation.isPending}
                                      onClick={() =>
                                        rejectMutation.mutate({ id: request.id, reason: rejectReason })
                                      }
                                    >
                                      Reject
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="primary"
                                      disabled={approveMutation.isPending}
                                      onClick={() =>
                                        approveMutation.mutate({ id: request.id, note: reviewNote })
                                      }
                                    >
                                      Approve
                                    </Button>
                                  </div>
                                </div>
                              ) : request.reviewerNote ? (
                                <p className="border-t border-slate-100 pt-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
                                  <span className="font-semibold">Reviewer note:</span> {request.reviewerNote}
                                </p>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-sm text-slate-500">
              Page {pagination.page} of {pagination.pages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= pagination.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
