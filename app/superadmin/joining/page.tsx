'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { joiningAPI } from '@/lib/api';
import { JoiningListResponse } from '@/types';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import { showToast } from '@/lib/toast';
import { useCourseLookup } from '@/hooks/useCourseLookup';

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

const JoiningPipelinePage = () => {
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'draft' | 'pending'>('draft');
  const { getCourseName, getBranchName } = useCourseLookup();

  const { data, isLoading, isFetching } = useQuery<JoiningListResponse>({
    queryKey: ['joining-pipeline', page, limit, searchTerm, activeTab],
    queryFn: async () => {
      const statusValue = activeTab === 'pending' ? 'pending_approval' : 'draft';
      const response = await joiningAPI.list({
        page,
        limit,
        search: searchTerm || undefined,
        status: statusValue,
      });
      
      // Debug logging
      console.log('Joining API Response:', {
        statusValue,
        activeTab,
        response,
        data: response?.data,
        joinings: response?.data?.joinings?.length || 0,
      });
      
      return response;
    },
    placeholderData: (previousData) => previousData,
  });

  const payload = data?.data ?? {
    joinings: [],
    pagination: { page: 1, pages: 1, total: 0, limit },
  };
  const joinings = payload.joinings ?? [];
  const pagination = payload.pagination ?? { page: 1, pages: 1, total: 0, limit };
  
  // Debug logging
  useEffect(() => {
    console.log('Joining Page State:', {
      activeTab,
      isLoading,
      isFetching,
      data,
      payload,
      joiningsCount: joinings.length,
      pagination,
    });
  }, [activeTab, isLoading, isFetching, data, payload, joinings.length, pagination]);
  const isEmpty = !isLoading && joinings.length === 0;
  const queryClient = useQueryClient();

  const approveMutation = useMutation({
    mutationFn: async (leadId: string) => {
      return await joiningAPI.approve(leadId);
    },
    onSuccess: () => {
      showToast.success('Joining form approved successfully');
      queryClient.invalidateQueries({ queryKey: ['joining-pipeline'] });
    },
    onError: (error: any) => {
      showToast.error(error?.response?.data?.message || 'Failed to approve joining form');
    },
  });

  const formatCurrency = (amount?: number | null) => {
    if (amount === undefined || amount === null || Number.isNaN(amount)) {
      return '—';
    }
    try {
      return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2,
      }).format(amount);
    } catch {
      return amount.toString();
    }
  };

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
    <div className="mx-auto w-full max-w-7xl space-y-6">
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
            <Link href="/superadmin/joining/new">
              <Button variant="primary" className="whitespace-nowrap">
                Add Joining Form
              </Button>
            </Link>
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
            Total {activeTab === 'pending' ? 'pending' : 'in progress'}: <span className="font-semibold text-blue-600 dark:text-blue-300">{pagination.total}</span>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden border border-white/60 shadow-lg shadow-blue-100/30 dark:border-slate-800/70 dark:shadow-none">
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
              {isLoading || isFetching ? (
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
                            {getCourseName(joining.courseInfo?.courseId) || joining.courseInfo?.course || '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                            {getBranchName(joining.courseInfo?.branchId) || joining.courseInfo?.branch || '—'}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                            {joining.courseInfo?.quota || '—'}
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
                              <span>{getCourseName(joining.courseInfo?.courseId) || joining.courseInfo?.course || joining.lead?.courseInterested || joining.leadData?.courseInterested || '—'}</span>
                              <span className="text-xs text-slate-400">
                                {getBranchName(joining.courseInfo?.branchId) || joining.courseInfo?.branch || 'Branch pending'}
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
                              disabled={approveMutation.isPending}
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
                          <Link href={`/superadmin/joining/${joining.leadId || joining._id || 'new'}/detail`}>
                            <Button variant="primary" className="group inline-flex items-center gap-2">
                              <span className="transition-transform group-hover:-translate-x-0.5">View Details</span>
                              <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })
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

export default JoiningPipelinePage;


