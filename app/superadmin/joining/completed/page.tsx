'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { admissionAPI } from '@/lib/api';
import { Admission, AdmissionListResponse } from '@/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
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
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import { useCourseLookup } from '@/hooks/useCourseLookup';

type AdmissionStatusFilter = 'all' | 'active' | 'withdrawn' | 'Admission Cancelled';

const ADMISSION_CANCELLED_STATUS = 'Admission Cancelled';

const statusOptions: Array<{ label: string; value: AdmissionStatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Withdrawn', value: 'withdrawn' },
  { label: 'Admission Cancelled', value: ADMISSION_CANCELLED_STATUS },
];

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

const CompletedAdmissionsPage = () => {
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdmissionStatusFilter>('active');
  const [cancelTarget, setCancelTarget] = useState<Admission | null>(null);
  const [cancelForm, setCancelForm] = useState({
    reason: '',
    approvedBy: '',
  });
  const { getCourseName, getBranchName } = useCourseLookup();

  const queryKey = useMemo(
    () => ['admissions', page, limit, searchTerm, statusFilter],
    [page, limit, searchTerm, statusFilter]
  );

  const { data, isLoading, isFetching } = useQuery<AdmissionListResponse>({
    queryKey,
    queryFn: async () => {
      const response = await admissionAPI.list({
        page,
        limit,
        search: searchTerm || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      return response.data;
    },
    placeholderData: (previousData) => previousData,
  });

  const headerContent = useMemo(
    () => (
      <div className="flex flex-col items-end gap-2 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Completed Admissions</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          View approved joinings and track admission status for every student.
        </p>
      </div>
    ),
    []
  );

  useEffect(() => {
    setHeaderContent(headerContent);
    return () => clearHeaderContent();
  }, [headerContent, setHeaderContent, clearHeaderContent]);

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
      await queryClient.invalidateQueries({ queryKey });
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

  return (
    <div className="w-full space-y-6">
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

      <Card className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Input
            placeholder="Search admission number, student, phone…"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setPage(1);
            }}
          />
          <select
            className="w-full rounded-xl border-2 border-slate-200/80 bg-white px-4 py-3 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 md:w-auto"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as AdmissionStatusFilter);
              setPage(1);
            }}
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="overflow-hidden border border-white/60 shadow-lg shadow-blue-100/30 dark:border-slate-800/70 dark:shadow-none">
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
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-slate-500">
                    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-400 border-t-transparent" />
                    <p className="mt-4 text-xs uppercase tracking-[0.3em] text-slate-400">Loading admissions…</p>
                  </td>
                </tr>
              ) : isEmpty ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-slate-500">
                    <p className="font-medium text-slate-600 dark:text-slate-400">No admissions found.</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.3em] text-slate-400">
                      Approve joining forms to create admission records.
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
                      <div className="flex flex-col gap-1">
                        <span>
                          {record.courseInfo?.course || getCourseName(record.courseInfo?.courseId) || '—'}
                        </span>
                        {record.courseInfo?.branchId && (
                          <span className="text-xs text-slate-400">
                            {record.courseInfo?.branch || getBranchName(record.courseInfo?.branchId) || ''}
                          </span>
                        )}
                      </div>
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
                      <div className="flex justify-end gap-2">
                        {record.status !== ADMISSION_CANCELLED_STATUS && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => openCancelDialog(record)}
                          >
                            Cancel
                          </Button>
                        )}
                        <Link href={`/superadmin/admission/${record._id}/detail`}>
                          <Button variant="outline" size="sm">
                            View Admission
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 && (
          <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-200 pt-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
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
    </div>
  );
};

export default CompletedAdmissionsPage;
