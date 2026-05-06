'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { admissionAPI, courseAPI } from '@/lib/api';
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
import { LayoutGrid, List, Calendar, Filter, Download } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'abstract' | 'detailed'>('abstract');
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

  // Stats Query
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ['admissions', 'stats', dateRange, courseFilter, branchFilter],
    queryFn: () => admissionAPI.getStats({
      startDate: dateRange.from || undefined,
      endDate: dateRange.to || undefined,
      courseId: courseFilter || undefined,
      branchId: branchFilter || undefined,
      courseName: getCourseName(courseFilter) || undefined,
      branchName: getBranchName(branchFilter) || undefined,
    }),
  });

  const stats = statsData?.stats || [];

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
        endDate: dateRange.to || undefined,
      });
      return response.data || response;
    },
    placeholderData: (previousData) => previousData,
  });

  const headerContent = useMemo(
    () => (
      <div className="flex flex-col items-end gap-2 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Admissions Desk</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Monitor course-wise performance and manage completed admissions.
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

  const totalAdmissionsCount = useMemo(() => {
    return stats.reduce((acc: number, curr: any) => acc + curr.totalAdmissions, 0);
  }, [stats]);

  const totalCancelledCount = useMemo(() => {
    return stats.reduce((acc: number, curr: any) => acc + (curr.totalCancelled || 0), 0);
  }, [stats]);

  return (
    <div className="w-full space-y-6 pb-12">
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

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex flex-col gap-1 border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/10 dark:to-slate-900">
          <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Total Admissions</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {statsLoading ? '...' : totalAdmissionsCount}
            </span>
          </div>
        </Card>
        <Card className="flex flex-col gap-1 border-l-4 border-l-red-500 bg-gradient-to-br from-red-50 to-white dark:from-red-900/10 dark:to-slate-900">
          <span className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">Cancelled Admissions</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {statsLoading ? '...' : totalCancelledCount}
            </span>
          </div>
        </Card>
        {stats.slice(0, 2).map((s: any) => (
          <Card key={s.courseId} className="flex flex-col gap-1 border-l-4 border-l-slate-300 dark:border-l-slate-700">
            <span className="truncate text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {s.courseName || 'Other'}
            </span>
            <div className="flex items-center gap-4">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{s.totalAdmissions}</span>
                <span className="text-[10px] text-blue-500 uppercase font-bold">Active</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-slate-900 dark:text-slate-100">{s.totalCancelled || 0}</span>
                <span className="text-[10px] text-red-500 uppercase font-bold">Cancelled</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Combined Filters & Tabs Bar */}
      <Card className="bg-slate-50/50 p-4 dark:bg-slate-900/50">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            {/* Tabs Switcher */}
            <div className="flex items-center gap-1 rounded-2xl bg-slate-200/50 p-1 dark:bg-slate-800/50">
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
            </div>

            {/* Quick Actions / Export (Moved here for better layout) */}
            <div className="flex items-center gap-2">
               <Button variant="outline" size="sm" className="gap-2">
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
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">From Date</label>
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
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">To Date</label>
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
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Course-wise Joinings Abstract</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
                <thead>
                  <tr className="bg-white dark:bg-slate-900">
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Course</th>
                    <th className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Branch</th>
                    <th className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider text-slate-500 text-blue-600 dark:text-blue-400">Active</th>
                    <th className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider text-slate-500 text-red-600 dark:text-red-400">Cancelled</th>
                    <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {statsLoading ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center">
                        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                      </td>
                    </tr>
                  ) : stats.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-20 text-center text-slate-500">No data available for the selected filters.</td>
                    </tr>
                  ) : (
                    stats.flatMap((c: any) => 
                      c.branches.map((b: any) => ({
                        courseId: c.courseId,
                        courseName: c.courseName,
                        branchId: b.branchId,
                        branchName: b.branchName,
                        totalAdmissions: b.totalAdmissions,
                        totalCancelled: b.totalCancelled
                      }))
                    ).map((row: any) => (
                      <tr key={`${row.courseId}-${row.branchId}`} className="group transition hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900 dark:text-slate-100">{row.courseName || 'Unknown Course'}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            {row.branchName || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{row.totalAdmissions}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-lg font-bold text-red-600 dark:text-red-400">{row.totalCancelled || 0}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                              <div 
                                className="h-full bg-blue-500" 
                                style={{ width: `${(row.totalAdmissions / totalAdmissionsCount) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                              {((row.totalAdmissions / totalAdmissionsCount) * 100).toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
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
                              View
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
      )}
    </div>
  );
};

export default CompletedAdmissionsPage;
