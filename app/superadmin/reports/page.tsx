'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { reportAPI, userAPI, leadAPI, locationsAPI } from '@/lib/api';
import { format, subDays, startOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { exportToExcel, exportToCSV } from '@/lib/export';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton, ReportDashboardSkeleton, LeadsAbstractSkeleton } from '@/components/ui/Skeleton';
import { showToast } from '@/lib/toast';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

type TabType = 'calls' | 'conversions' | 'users' | 'abstract' | 'activityLogs';

type DatePreset = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'custom';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

// Call reports tab: gradient styles for stats cards (Total Users, Assigned Leads, Total Calls, Total SMS)
const CALL_REPORT_CARD_STYLES = [
  'from-blue-500 to-indigo-600 shadow-blue-500/25',
  'from-emerald-500 to-teal-600 shadow-emerald-500/25',
  'from-orange-500 to-amber-600 shadow-orange-500/25',
  'from-violet-500 to-purple-600 shadow-violet-500/25',
];

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('calls');

  useEffect(() => {
    const tabFromUrl = searchParams?.get('tab');
    if (tabFromUrl && ['calls', 'conversions', 'users', 'abstract', 'activityLogs'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl as TabType);
    }
  }, [searchParams]);
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [callReportExportPreviewOpen, setCallReportExportPreviewOpen] = useState(false);
  const [activityLogPage, setActivityLogPage] = useState(1);
  const [activityLogEventType, setActivityLogEventType] = useState<'tracking_enabled' | 'tracking_disabled' | ''>('');

  // Unified filters for all tabs (default to today)
  const [filters, setFilters] = useState({
    startDate: format(startOfDay(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfDay(new Date()), 'yyyy-MM-dd'),
    userId: '',
    course: '',
    status: '',
    source: '',
    district: '',
    mandal: '',
    state: '',
    academicYear: new Date().getFullYear(),
    studentGroup: '',
    abstractStateId: '',
    abstractDistrictId: '',
  });

  // Fetch users
  const { data: usersResponse } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      try {
        const response = await userAPI.getAll();
        if (Array.isArray(response)) return response;
        if (response?.data && Array.isArray(response.data)) return response.data;
        return [];
      } catch (error) {
        console.error('Error fetching users:', error);
        return [];
      }
    },
  });

  const users = useMemo(() => {
    if (!usersResponse) return [];
    return Array.isArray(usersResponse) ? usersResponse : [];
  }, [usersResponse]);

  const activityLogUsers = useMemo(
    () =>
      users.filter(
        (u: any) => u.roleName !== 'Super Admin' && u.roleName !== 'Sub Super Admin'
      ),
    [users]
  );

  // Fetch filter options
  const { data: filterOptions } = useQuery({
    queryKey: ['filterOptions'],
    queryFn: () => leadAPI.getFilterOptions(),
  });

  // Date preset handler
  const handleDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    const now = new Date();
    let start: Date, end: Date;

    switch (preset) {
      case 'today':
        start = startOfDay(now);
        end = endOfDay(now);
        break;
      case 'yesterday':
        start = startOfDay(subDays(now, 1));
        end = endOfDay(subDays(now, 1));
        break;
      case 'last7days':
        start = startOfDay(subDays(now, 7));
        end = endOfDay(now);
        break;
      case 'last30days':
        start = startOfDay(subDays(now, 30));
        end = endOfDay(now);
        break;
      case 'thisWeek':
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfDay(now);
        break;
      case 'thisMonth':
        start = startOfMonth(now);
        end = endOfDay(now);
        break;
      case 'lastMonth':
        start = startOfMonth(subDays(now, 30));
        end = endOfMonth(subDays(now, 30));
        break;
      default:
        return;
    }

    setFilters({
      ...filters,
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
    });
    setActivityLogPage(1);
  };

  // Call Reports
  const { data: callReports, isLoading: isLoadingCalls, error: callReportsError } = useQuery({
    queryKey: ['callReports', filters.startDate, filters.endDate, filters.userId],
    queryFn: () => reportAPI.getDailyCallReports({
      startDate: filters.startDate,
      endDate: filters.endDate,
      userId: filters.userId || undefined,
    }),
    enabled: activeTab === 'calls',
    retry: 2,
  });

  // Conversion Reports
  const { data: conversionReports, isLoading: isLoadingConversions, error: conversionReportsError } = useQuery({
    queryKey: ['conversionReports', filters.startDate, filters.endDate, filters.userId],
    queryFn: () => reportAPI.getConversionReports({
      startDate: filters.startDate,
      endDate: filters.endDate,
      userId: filters.userId || undefined,
      period: 'custom',
    }),
    enabled: activeTab === 'conversions',
    retry: 2,
  });

  // Activity Logs (time tracking ON/OFF)
  const { data: activityLogsData, isLoading: isLoadingActivityLogs } = useQuery({
    queryKey: [
      'all-user-login-logs',
      activityLogPage,
      filters.userId || undefined,
      activityLogEventType || undefined,
      filters.startDate,
      filters.endDate,
    ],
    queryFn: () =>
      userAPI.getAllUserLoginLogs({
        page: activityLogPage,
        limit: 100,
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(activityLogEventType ? { eventType: activityLogEventType } : {}),
        startDate: filters.startDate,
        endDate: filters.endDate,
      }),
    enabled: activeTab === 'activityLogs',
    staleTime: 30000,
  });

  const activityLogs = (activityLogsData?.logs ?? []) as Array<{
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    userRole: string;
    eventType: 'tracking_enabled' | 'tracking_disabled';
    createdAt: string;
  }>;
  const activityLogsPagination = activityLogsData?.pagination;

  // User Analytics (used for Call reports tab stats + User Analytics tab detail; same date range)
  const { data: userAnalytics, isLoading: isLoadingUserAnalytics } = useQuery({
    queryKey: ['userAnalytics', filters.startDate, filters.endDate, filters.academicYear],
    queryFn: () => leadAPI.getUserAnalytics({
      startDate: filters.startDate,
      endDate: filters.endDate,
      academicYear: filters.academicYear != null ? filters.academicYear : undefined,
    }),
    enabled: activeTab === 'calls' || activeTab === 'users',
    retry: 2,
  });

  // States for Abstract tab (state → districts → mandals)
  const { data: abstractStates } = useQuery({
    queryKey: ['locations', 'states'],
    queryFn: () => locationsAPI.listStates(),
    enabled: activeTab === 'abstract',
  });

  // Default state to Andhra Pradesh when states load and none selected
  useEffect(() => {
    if (activeTab !== 'abstract' || filters.abstractStateId || !abstractStates) return;
    const arr = Array.isArray(abstractStates) ? abstractStates : [];
    const ap = arr.find((s: { name?: string }) => String(s?.name || '').toLowerCase().includes('andhra pradesh'));
    if (ap?.id) {
      setFilters((prev) => ({ ...prev, abstractStateId: ap.id }));
    }
  }, [activeTab, abstractStates, filters.abstractStateId]);

  const { data: abstractDistricts } = useQuery({
    queryKey: ['locations', 'districts', filters.abstractStateId],
    queryFn: () => locationsAPI.listDistricts({ stateId: filters.abstractStateId }),
    enabled: activeTab === 'abstract' && !!filters.abstractStateId,
  });

  // Leads Abstract (district, mandal, school, college by academic year + student group + state/district filter)
  const { data: leadsAbstract, isLoading: isLoadingAbstract, isFetching: isFetchingAbstract } = useQuery({
    queryKey: ['leadsAbstract', filters.academicYear, filters.studentGroup, filters.abstractStateId, filters.abstractDistrictId],
    queryFn: () => reportAPI.getLeadsAbstract({
      academicYear: filters.academicYear ?? 2025,
      studentGroup: filters.studentGroup || undefined,
      stateId: filters.abstractStateId || undefined,
      districtId: filters.abstractDistrictId || undefined,
    }),
    enabled: activeTab === 'abstract',
    staleTime: 60000,
    retry: 2,
    placeholderData: (previousData: any) => previousData,
  });

  // Export handlers
  const handleExport = (type: 'excel' | 'csv', data: any[], filename: string) => {
    if (!data || data.length === 0) return;

    // Create generic export
    const exportData = data.map((item: any) => {
      const row: any = {};
      Object.keys(item).forEach((key) => {
        if (key !== '_id' && key !== '__v') {
          const value = item[key];
          if (value instanceof Date) {
            row[key] = format(value, 'yyyy-MM-dd HH:mm:ss');
          } else if (typeof value === 'object' && value !== null) {
            row[key] = JSON.stringify(value);
          } else {
            row[key] = value || '';
          }
        }
      });
      return row;
    });

    if (type === 'excel') {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
      XLSX.writeFile(workbook, `${filename}.xlsx`);
    } else {
      const csv = Papa.unparse(exportData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Call reports: build merged data for Excel (User Performance + Daily Report)
  const callReportMergedData = useMemo(() => {
    const users = userAnalytics?.users || [];
    const daily = callReports?.reports || [];
    const performanceRows = users.map((u: any) => ({
      User: u.name || u.userName || '—',
      'Total Leads': u.totalAssigned ?? 0,
      Calls: u.calls?.total ?? 0,
      'Avg Call (sec)': u.calls?.averageDuration ?? 0,
      SMS: u.sms?.total ?? 0,
      'Status Changes': u.statusConversions?.total ?? 0,
      Confirmed: u.convertedLeads ?? 0,
      'Conversion Rate %': u.conversionRate ?? 0,
    }));
    const dailyRows = daily.map((r: any) => ({
      Date: format(new Date(r.date), 'yyyy-MM-dd'),
      User: r.userName || '—',
      Calls: r.callCount ?? 0,
      'Total Duration (sec)': r.totalDuration ?? 0,
      'Avg Duration (sec)': r.averageDuration ?? 0,
    }));
    return { performanceRows, dailyRows };
  }, [userAnalytics?.users, callReports?.reports]);

  const downloadCallReportExcel = () => {
    const { performanceRows, dailyRows } = callReportMergedData;
    if (performanceRows.length === 0 && dailyRows.length === 0) return;
    const workbook = XLSX.utils.book_new();
    if (performanceRows.length > 0) {
      const ws1 = XLSX.utils.json_to_sheet(performanceRows);
      XLSX.utils.book_append_sheet(workbook, ws1, 'User Performance');
    }
    if (dailyRows.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(dailyRows);
      XLSX.utils.book_append_sheet(workbook, ws2, 'Daily Call Report');
    }
    const filename = `call-report-${filters.startDate}-${filters.endDate}.xlsx`;
    XLSX.writeFile(workbook, filename);
    setCallReportExportPreviewOpen(false);
  };

  // Prepare chart data
  const conversionChartData = useMemo(() => {
    if (!conversionReports?.reports) return [];
    return conversionReports.reports.map((report: any) => ({
      name: report.userName || 'Unknown',
      leads: report.totalLeads || 0,
      converted: report.convertedLeads || 0,
      rate: report.conversionRate || 0,
    }));
  }, [conversionReports]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between dark:border-slate-700">
        {/* Page Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Reports</h1>
          {/* <p className="text-sm text-slate-500 dark:text-slate-400">
          Analyze call performance, conversions, and user activity.
        </p> */}
        </div>

        {/* Tabs */}
        <div>
          <nav className="-mb-4 flex space-x-8 overflow-x-auto md:mb-0">
            {(['calls', 'conversions', 'users', 'activityLogs', 'abstract'] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  const url = new URL(window.location.href);
                  url.searchParams.set('tab', tab);
                  window.history.replaceState({}, '', url.toString());
                }}
                className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${activeTab === tab
                  ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                  }`}
              >
                {tab === 'calls' && 'Call Reports'}
                {tab === 'conversions' && 'Conversion Reports'}
                {tab === 'users' && 'User Analytics'}
                {tab === 'activityLogs' && 'Activity Logs'}
                {tab === 'abstract' && 'Leads Abstract'}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Filters & Date Presets */}
      <div className="flex flex-wrap items-center gap-2">
        {activeTab === 'calls' && (
          <>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Academic Year</span>
            <select
              value={filters.academicYear}
              onChange={(e) => setFilters({ ...filters, academicYear: e.target.value === '' ? new Date().getFullYear() : Number(e.target.value) })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 mr-2"
            >
              {[2023, 2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="mx-1 text-slate-400 dark:text-slate-500">|</span>
          </>
        )}

        {activeTab === 'abstract' && (
          <>
            <select
              value={filters.abstractStateId}
              onChange={(e) => setFilters({ ...filters, abstractStateId: e.target.value, abstractDistrictId: '' })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 max-w-[150px]"
            >
              <option value="">State: All</option>
              {(abstractStates || []).map((s: { id: string; name: string }) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <select
              value={filters.abstractDistrictId}
              onChange={(e) => setFilters({ ...filters, abstractDistrictId: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 max-w-[150px]"
              disabled={!filters.abstractStateId}
            >
              <option value="">District: All</option>
              {(abstractDistricts || []).map((d: { id: string; name: string }) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>

            <select
              value={filters.academicYear}
              onChange={(e) => setFilters({ ...filters, academicYear: Number(e.target.value) })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
            >
              <option value="">Year</option>
              {[2023, 2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <select
              value={filters.studentGroup}
              onChange={(e) => setFilters({ ...filters, studentGroup: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 max-w-[120px]"
            >
              <option value="">Group: All</option>
              <option value="10th">10th</option>
              <option value="Inter">Inter</option>
              <option value="Inter-MPC">Inter-MPC</option>
              <option value="Inter-BIPC">Inter-BIPC</option>
              <option value="Degree">Degree</option>
              <option value="Diploma">Diploma</option>
            </select>
            <span className="mx-1 text-slate-400 dark:text-slate-500">|</span>
          </>
        )}

        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Quick Filters:</span>
        {(['today', 'yesterday', 'last7days', 'last30days', 'thisWeek'] as DatePreset[]).map((preset) => (
          <button
            key={preset}
            onClick={() => handleDatePreset(preset)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${datePreset === preset
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
              }`}
          >
            {preset === 'today' && 'Today'}
            {preset === 'yesterday' && 'Yesterday'}
            {preset === 'last7days' && 'Last 7 Days'}
            {preset === 'last30days' && 'Last 30 Days'}
            {preset === 'thisWeek' && 'This Week'}
          </button>
        ))}
      </div>

      {/* Filters – hidden on Call Reports, User Analytics, and Leads Abstract */}
      {activeTab !== 'calls' && activeTab !== 'users' && activeTab !== 'abstract' && (
        <Card className="p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => {
                  setFilters({ ...filters, startDate: e.target.value });
                  setDatePreset('custom');
                  if (activeTab === 'activityLogs') setActivityLogPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => {
                  setFilters({ ...filters, endDate: e.target.value });
                  setDatePreset('custom');
                  if (activeTab === 'activityLogs') setActivityLogPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">User/Counsellor</label>
              <select
                value={filters.userId}
                onChange={(e) => {
                  setFilters({ ...filters, userId: e.target.value });
                  if (activeTab === 'activityLogs') setActivityLogPage(1);
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              >
                <option value="">All Users</option>
                {(activeTab === 'activityLogs' ? activityLogUsers : users).map((user: any) => (
                  <option key={user._id} value={user._id}>
                    {user.name} {activeTab === 'activityLogs' ? `(${user.roleName})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {activeTab === 'activityLogs' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Event</label>
                <select
                  value={activityLogEventType}
                  onChange={(e) => {
                    setActivityLogEventType(e.target.value as 'tracking_enabled' | 'tracking_disabled' | '');
                    setActivityLogPage(1);
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                >
                  <option value="">All (ON & OFF)</option>
                  <option value="tracking_enabled">ON</option>
                  <option value="tracking_disabled">OFF</option>
                </select>
              </div>
            )}
            {activeTab !== 'activityLogs' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Source</label>
                  <select
                    value={filters.source}
                    onChange={(e) => setFilters({ ...filters, source: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                  >
                    <option value="">All Sources</option>
                    {filterOptions?.sources?.map((source: string) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Course</label>
                  <select
                    value={filters.course}
                    onChange={(e) => setFilters({ ...filters, course: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                  >
                    <option value="">All Courses</option>
                    {filterOptions?.courses?.map((course: string) => (
                      <option key={course} value={course}>
                        {course}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Status</label>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                  >
                    <option value="">All Statuses</option>
                    {filterOptions?.leadStatuses?.map((status: string) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">District</label>
                  <select
                    value={filters.district}
                    onChange={(e) => setFilters({ ...filters, district: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                  >
                    <option value="">All Districts</option>
                    {filterOptions?.districts?.map((district: string) => (
                      <option key={district} value={district}>
                        {district}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Mandal</label>
                  <select
                    value={filters.mandal}
                    onChange={(e) => setFilters({ ...filters, mandal: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                  >
                    <option value="">All Mandals</option>
                    {filterOptions?.mandals?.map((mandal: string) => (
                      <option key={mandal} value={mandal}>
                        {mandal}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Academic Year</label>
                  <select
                    value={filters.academicYear}
                    onChange={(e) => setFilters({ ...filters, academicYear: e.target.value === '' ? 2025 : Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                  >
                    {[2023, 2024, 2025, 2026, 2027].map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Student Group</label>
                  <select
                    value={filters.studentGroup}
                    onChange={(e) => setFilters({ ...filters, studentGroup: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                  >
                    <option value="">All Groups</option>
                    <option value="10th">10th</option>
                    <option value="Inter">Inter</option>
                    <option value="Inter-MPC">Inter-MPC</option>
                    <option value="Inter-BIPC">Inter-BIPC</option>
                    <option value="Degree">Degree</option>
                    <option value="Diploma">Diploma</option>
                  </select>
                </div>
              </>
            )}
          </div>
        </Card>
      )}

      {/* User Analytics Tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {isLoadingUserAnalytics ? (
            <ReportDashboardSkeleton />
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-600">
                  <thead>
                    <tr className="bg-gradient-to-r from-slate-600 to-slate-700 dark:from-slate-700 dark:to-slate-800">
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">User</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Total Leads</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Calls</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">SMS</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Conversion</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800/50">
                    {userAnalytics?.users?.map((user: any, rowIdx: number) => (
                      <tr key={user.userId} className={`${rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-800/50' : 'bg-slate-50/80 dark:bg-slate-700/30'} hover:bg-slate-100 dark:hover:bg-slate-700/50`}>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                          <div className="flex flex-col">
                            <span>{user.name || user.userName}</span>
                            <span className="text-xs text-slate-500">{user.roleName || 'User'}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.totalAssigned || 0}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.calls?.total ?? 0}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.sms?.total ?? 0}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-900 dark:text-slate-100">{user.convertedLeads ?? 0}</span>
                            <span className={`text-xs ${(user.conversionRate ?? 0) >= 30 ? 'text-green-600' : 'text-slate-500'}`}>
                              ({user.conversionRate ?? 0}%)
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  showToast.loading('Fetching assigned leads...');
                                  const response = await leadAPI.getAll({
                                    assignedTo: user.userId,
                                    limit: 10000,
                                    page: 1
                                  });
                                  const leads = response.data?.leads || response.leads || [];

                                  if (leads.length === 0) {
                                    showToast.error('No assigned leads found');
                                    return;
                                  }

                                  const exportData = leads.map((lead: any) => ({
                                    'Lead Name': lead.name,
                                    'Phone Number': lead.phone,
                                    'Remarks': lead.notes || '',
                                  }));

                                  const worksheet = XLSX.utils.json_to_sheet(exportData);
                                  const workbook = XLSX.utils.book_new();
                                  XLSX.utils.book_append_sheet(workbook, worksheet, 'Assigned Leads');
                                  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                                  XLSX.writeFile(workbook, `Assigned_Leads_${user.name || user.userName}_${timestamp}.xlsx`);
                                  showToast.success('Export successful');
                                } catch (error) {
                                  console.error(error);
                                  showToast.error('Failed to export');
                                }
                              }}
                            >
                              Export Leads
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => window.location.href = `/superadmin/users/${user.userId}/leads`}
                            >
                              View Analytics
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Call Reports Tab */}
      {activeTab === 'calls' && (
        <div className="space-y-6">
          {isLoadingCalls || isLoadingUserAnalytics ? (
            <ReportDashboardSkeleton />
          ) : callReportsError ? (
            <Card className="p-8 text-center">
              <p className="text-red-600 dark:text-red-400">
                Failed to load call reports. Please try again.
              </p>
            </Card>
          ) : (
            <>
              {/* Original User Performance stats for other tabs (if any) or shared view */}
              {userAnalytics?.users && Array.isArray(userAnalytics.users) && userAnalytics.users.length > 0 && (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    {[
                      { label: 'Total Users', value: userAnalytics.users.length, style: CALL_REPORT_CARD_STYLES[0] },
                      { label: 'Total Assigned Leads', value: userAnalytics.users.reduce((sum: number, u: any) => sum + (u.totalAssigned || 0), 0), style: CALL_REPORT_CARD_STYLES[1] },
                      { label: 'Total Calls', value: userAnalytics.users.reduce((sum: number, u: any) => sum + (u.calls?.total ?? 0), 0), style: CALL_REPORT_CARD_STYLES[2] },
                      { label: 'Total SMS', value: userAnalytics.users.reduce((sum: number, u: any) => sum + (u.sms?.total ?? 0), 0), style: CALL_REPORT_CARD_STYLES[3] },
                    ].map((item, i) => (
                      <div key={i} className={`overflow-hidden rounded-xl border-0 bg-gradient-to-br ${item.style} p-4 shadow-lg`}>
                        <p className="text-sm font-semibold uppercase tracking-wider text-white/90">{item.label}</p>
                        <p className="mt-2 text-2xl font-bold text-white drop-shadow-sm">{item.value}</p>
                      </div>
                    ))}
                  </div>
                  {/* User Performance Summary – single export opens preview modal */}
                  <div className="space-y-4">

                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">User Performance Summary</h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCallReportExportPreviewOpen(true)}
                        disabled={!(userAnalytics?.users?.length || callReports?.reports?.length)}
                      >
                        Export report (Excel)
                      </Button>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-600">
                        <thead>
                          <tr className="bg-gradient-to-r from-slate-600 to-slate-700 dark:from-slate-700 dark:to-slate-800">
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">User</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Total Leads</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Calls</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">SMS</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Status Changes</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Confirmed</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Conversion Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800/50">
                          {userAnalytics.users.map((user: any, rowIdx: number) => (
                            <tr key={user.userId} className={`${rowIdx % 2 === 0 ? 'bg-white dark:bg-slate-800/50' : 'bg-slate-50/80 dark:bg-slate-700/30'} hover:bg-slate-100 dark:hover:bg-slate-700/50`}>
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">{user.name || user.userName}</td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.totalAssigned || 0}</td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                                <div className="flex flex-col">
                                  <span>{user.calls?.total ?? 0}</span>
                                  {user.calls?.averageDuration > 0 && (
                                    <span className="text-xs text-slate-500">
                                      Avg: {Math.floor(user.calls.averageDuration / 60)}m {user.calls.averageDuration % 60}s
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.sms?.total ?? 0}</td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.statusConversions?.total ?? 0}</td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.convertedLeads ?? 0}</td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm">
                                <span
                                  className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${(user.conversionRate ?? 0) >= 50
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : (user.conversionRate ?? 0) >= 30
                                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                    }`}
                                >
                                  {user.conversionRate ?? 0}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
              {callReports?.reports && callReports.reports.length > 0 ? (
                <>
                  <Card className="overflow-hidden border-slate-200 dark:border-slate-700">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-600">
                        <thead>
                          <tr className="bg-gradient-to-r from-slate-600 to-slate-700 dark:from-slate-700 dark:to-slate-800">
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">User</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Calls</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Total Duration</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Avg Duration</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-600">
                          {callReports.reports.map((report: any, idx: number) => (
                            <tr
                              key={idx}
                              className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-700/50' : 'bg-slate-50/80 dark:bg-slate-700/30 hover:bg-slate-100 dark:hover:bg-slate-700/50'}
                            >
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                                {format(new Date(report.date), 'MMM dd, yyyy')}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">{report.userName}</td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{report.callCount}</td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                                {Math.floor(report.totalDuration / 60)}m {report.totalDuration % 60}s
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                                {Math.floor(report.averageDuration / 60)}m {report.averageDuration % 60}s
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </>
              ) : (
                <Card className="p-8 text-center">
                  <p className="text-slate-500 dark:text-slate-400">No call reports found for the selected period.</p>
                </Card>
              )}

              {/* Excel export preview modal (portaled so it appears above header) */}
              {callReportExportPreviewOpen && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setCallReportExportPreviewOpen(false)}>
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                      <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Excel export preview</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                        Report will contain two sheets: <strong>User Performance</strong>, <strong>Daily Call Report</strong>. Click Proceed to download.
                      </p>
                    </div>
                    <div className="flex-1 overflow-auto p-6 space-y-6">
                      {callReportMergedData.performanceRows.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Sheet: User Performance</h4>
                          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
                            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-600 text-sm">
                              <thead>
                                <tr className="bg-slate-100 dark:bg-slate-800">
                                  <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">User</th>
                                  <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Total Leads</th>
                                  <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Calls</th>
                                  <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Avg Call (sec)</th>
                                  <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">SMS</th>
                                  <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Status Changes</th>
                                  <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Confirmed</th>
                                  <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Conversion Rate %</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-600 bg-white dark:bg-slate-800/50">
                                {callReportMergedData.performanceRows.map((row: any, idx: number) => (
                                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800/50' : 'bg-slate-50 dark:bg-slate-700/30'}>
                                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row.User}</td>
                                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row['Total Leads']}</td>
                                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row.Calls}</td>
                                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row['Avg Call (sec)']}</td>
                                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row.SMS}</td>
                                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row['Status Changes']}</td>
                                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row.Confirmed}</td>
                                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row['Conversion Rate %']}%</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {callReportMergedData.dailyRows.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Sheet: Daily Call Report</h4>
                          <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
                            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-600 text-sm">
                              <thead>
                                <tr className="bg-slate-100 dark:bg-slate-800">
                                  <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Date</th>
                                  <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">User</th>
                                  <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Calls</th>
                                  <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Total Duration (sec)</th>
                                  <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Avg Duration (sec)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-600 bg-white dark:bg-slate-800/50">
                                {callReportMergedData.dailyRows.map((row: any, idx: number) => (
                                  <tr key={idx} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800/50' : 'bg-slate-50 dark:bg-slate-700/30'}>
                                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row.Date}</td>
                                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row.User}</td>
                                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row.Calls}</td>
                                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row['Total Duration (sec)']}</td>
                                    <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row['Avg Duration (sec)']}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {callReportMergedData.performanceRows.length === 0 && callReportMergedData.dailyRows.length === 0 && (
                        <p className="text-slate-500 dark:text-slate-400">No data to export.</p>
                      )}
                    </div>
                    <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCallReportExportPreviewOpen(false)}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={downloadCallReportExcel} disabled={callReportMergedData.performanceRows.length === 0 && callReportMergedData.dailyRows.length === 0}>
                        Proceed & download
                      </Button>
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </>
          )}
        </div>
      )}

      {/* Conversion Reports Tab */}
      {activeTab === 'conversions' && (
        <div className="space-y-6">
          {isLoadingConversions ? (
            <Skeleton className="h-64" />
          ) : conversionReportsError ? (
            <Card className="p-8 text-center">
              <p className="text-red-600 dark:text-red-400">Failed to load conversion reports. Please try again.</p>
            </Card>
          ) : (
            <>
              {/* Summary Cards */}
              {conversionReports?.summary && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <Card className="p-4">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Leads</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{conversionReports.summary.totalLeads}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Admissions</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{conversionReports.summary.totalAdmissions}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Conversion Rate</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{conversionReports.summary.overallConversionRate}%</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Counsellors</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{conversionReports.summary.totalCounsellors}</p>
                  </Card>
                </div>
              )}

              {/* Status Conversions Summary */}
              {conversionReports?.reports && conversionReports.reports.some((r: any) => r.statusConversions && Object.keys(r.statusConversions).length > 0) && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Status Conversions Overview</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {conversionReports.reports.map((report: any) => (
                      report.statusConversions && Object.keys(report.statusConversions).length > 0 && (
                        <div key={report.userId} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{report.userName}</h4>
                          <div className="space-y-1">
                            {Object.entries(report.statusConversions).map(([conversion, count]: [string, any]) => (
                              <div key={conversion} className="flex justify-between text-xs">
                                <span className="text-slate-600 dark:text-slate-400">{conversion}</span>
                                <span className="font-medium text-slate-900 dark:text-slate-100">{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                </Card>
              )}

              {/* Charts */}
              {conversionChartData.length > 0 && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Conversion by Counsellor</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={conversionChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="leads" fill="#3b82f6" name="Total Leads" />
                      <Bar dataKey="converted" fill="#10b981" name="Converted" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Export and Table */}
              <div className="flex justify-end gap-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('excel', conversionReports?.reports || [], `conversion-reports-${filters.startDate}-${filters.endDate}`)}
                  disabled={!conversionReports?.reports?.length}
                >
                  Export Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('csv', conversionReports?.reports || [], `conversion-reports-${filters.startDate}-${filters.endDate}`)}
                  disabled={!conversionReports?.reports?.length}
                >
                  Export CSV
                </Button>
              </div>

              {/* Table */}
              {conversionReports?.reports && conversionReports.reports.length > 0 ? (
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                      <thead className="bg-slate-50 dark:bg-slate-900">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Counsellor</th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Leads</th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Confirmed</th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Converted</th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Status Changes</th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Conversion Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                        {conversionReports.reports.map((report: any) => (
                          <tr key={report.userId} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">{report.userName}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{report.totalLeads}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{report.confirmedLeads || 0}</td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{report.convertedLeads}</td>
                            <td className="px-6 py-4 text-sm">
                              {report.statusChangeCount > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                    {report.statusChangeCount} changes
                                  </span>
                                  {report.statusConversions && Object.keys(report.statusConversions).length > 0 && (
                                    <span className="text-xs text-slate-500">
                                      ({Object.keys(report.statusConversions).length} types)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm">
                              <span
                                className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${report.conversionRate >= 50
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                  : report.conversionRate >= 30
                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                  }`}
                              >
                                {report.conversionRate}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ) : (
                <Card className="p-8 text-center">
                  <p className="text-slate-500 dark:text-slate-400">No conversion reports found for the selected period.</p>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* User Analytics Tab – per-user call activity (calls, SMS, status changes) like the counsellor Call activity page */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4 rounded-lg bg-slate-100 dark:bg-slate-800 p-3">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Date range: <strong>{filters.startDate}</strong> to <strong>{filters.endDate}</strong>
            </span>
            {filters.academicYear != null && (
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Academic Year: <strong>{filters.academicYear}</strong> (assigned leads filter)
              </span>
            )}
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Full call activity (day-wise calls, SMS, status changes) per user below.
            </span>
          </div>
          {isLoadingUserAnalytics ? (
            <Skeleton className="h-64" />
          ) : userAnalytics?.users && Array.isArray(userAnalytics.users) && userAnalytics.users.length > 0 ? (
            <>
              {/* Export */}
              <div className="flex justify-end gap-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('excel', userAnalytics.users || [], `user-analytics-${filters.startDate}-${filters.endDate}`)}
                  disabled={!userAnalytics?.users?.length}
                >
                  Export Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('csv', userAnalytics.users || [], `user-analytics-${filters.startDate}-${filters.endDate}`)}
                  disabled={!userAnalytics?.users?.length}
                >
                  Export CSV
                </Button>
              </div>

              {/* Per-user call activity (same structure as user/call-activity page) */}
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-2 mb-2">Call activity by user</h3>
              {userAnalytics.users.map((user: any) => (
                <Card key={user.userId} className="p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{user.name || user.userName}</h3>
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${user.isActive
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        }`}
                    >
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="space-y-6">
                    {/* Day-wise call activity (data from user.calls.dailyCallActivity) */}
                    {user.calls?.dailyCallActivity && user.calls.dailyCallActivity.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                          Day-wise call activity
                        </h4>
                        <div className="space-y-3">
                          {user.calls.dailyCallActivity.map((day: { date: string; callCount: number; leads?: { leadId: string; leadName: string; leadPhone?: string; enquiryNumber?: string; callCount: number }[] }, dayIdx: number) => {
                            const dateLabel = day.date ? format(new Date(day.date + 'T12:00:00'), 'MMM d, yyyy') : day.date;
                            return (
                              <div key={dayIdx} className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
                                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-600">
                                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    {dateLabel}
                                  </span>
                                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {day.callCount} call{day.callCount !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                {day.leads && day.leads.length > 0 && (
                                  <div className="overflow-x-auto">
                                    <table className="min-w-full text-sm">
                                      <thead className="border-b border-slate-200 dark:border-slate-600">
                                        <tr>
                                          <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Lead</th>
                                          <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Phone</th>
                                          <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Enquiry #</th>
                                          <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-600 dark:text-slate-400">Calls</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                        {day.leads.map((lead: any, lidx: number) => (
                                          <tr key={lidx}>
                                            <td className="px-3 py-1.5 text-slate-900 dark:text-slate-100">{lead.leadName}</td>
                                            <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{lead.leadPhone || '—'}</td>
                                            <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{lead.enquiryNumber || '—'}</td>
                                            <td className="px-3 py-1.5 text-right text-slate-900 dark:text-slate-100">{lead.callCount}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Calls Section */}
                    {user.calls && user.calls.total > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                          Calls Made ({user.calls.total})
                        </h4>
                        <div className="space-y-2">
                          {user.calls.byLead && user.calls.byLead.length > 0 ? (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead className="bg-slate-50 dark:bg-slate-800">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Lead</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Phone</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Calls</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Total Duration</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                  {user.calls.byLead.map((lead: any, idx: number) => (
                                    <tr key={idx}>
                                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{lead.leadName}</td>
                                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{lead.leadPhone}</td>
                                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{lead.callCount}</td>
                                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                                        {Math.floor(lead.totalDuration / 60)}m {lead.totalDuration % 60}s
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-sm text-slate-500">No calls made in this period</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* SMS Section */}
                    {user.sms && user.sms.total > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                          SMS/Texts Sent ({user.sms.total})
                        </h4>

                        {/* Template Usage */}
                        {user.sms.templateUsage && user.sms.templateUsage.length > 0 && (
                          <div className="mb-4">
                            <h5 className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Template Usage</h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {user.sms.templateUsage.map((template: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded">
                                  <span className="text-sm text-slate-700 dark:text-slate-300">{template.name}</span>
                                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                    {template.count} times ({template.uniqueLeads} leads)
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* SMS by Lead */}
                        {user.sms.byLead && user.sms.byLead.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-50 dark:bg-slate-800">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Lead</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Phone</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">SMS Count</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {user.sms.byLead.map((lead: any, idx: number) => (
                                  <tr key={idx}>
                                    <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{lead.leadName}</td>
                                    <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{lead.leadPhone}</td>
                                    <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{lead.smsCount}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Status Conversions Section */}
                    {user.statusConversions && user.statusConversions.total > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                          Status Conversions ({user.statusConversions.total})
                        </h4>

                        {/* Conversion Breakdown */}
                        {user.statusConversions.breakdown && Object.keys(user.statusConversions.breakdown).length > 0 && (
                          <div className="mb-4">
                            <h5 className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Conversion Types</h5>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(user.statusConversions.breakdown).map(([conversion, count]: [string, any]) => (
                                <span
                                  key={conversion}
                                  className="inline-flex rounded-full px-3 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                >
                                  {conversion}: {count}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Conversions by Lead */}
                        {user.statusConversions.byLead && user.statusConversions.byLead.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-sm">
                              <thead className="bg-slate-50 dark:bg-slate-800">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Lead</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Conversions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                {user.statusConversions.byLead.map((lead: any, idx: number) => (
                                  <tr key={idx}>
                                    <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{lead.leadName}</td>
                                    <td className="px-3 py-2">
                                      <div className="flex flex-wrap gap-1">
                                        {lead.conversions.map((conv: any, cIdx: number) => (
                                          <span
                                            key={cIdx}
                                            className="inline-flex rounded px-2 py-0.5 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                                          >
                                            {conv.from} → {conv.to}
                                          </span>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Lead Summary */}
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Lead Summary</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-slate-600 dark:text-slate-400">Total Assigned</p>
                          <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{user.totalAssigned || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600 dark:text-slate-400">Active Leads</p>
                          <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{user.activeLeads || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600 dark:text-slate-400">Confirmed</p>
                          <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                            {user.statusBreakdown?.['Confirmed'] || user.statusBreakdown?.['confirmed'] || 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-600 dark:text-slate-400">Converted</p>
                          <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{user.convertedLeads || 0}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-slate-500 dark:text-slate-400">No user analytics available.</p>
            </Card>
          )}
        </div>
      )}

      {/* Activity Logs Tab – time tracking ON/OFF in tabular format */}
      {activeTab === 'activityLogs' && (
        <Card className="overflow-hidden p-0">
          {isLoadingActivityLogs ? (
            <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-800">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1 space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <Skeleton className="h-6 w-12 shrink-0 rounded-full" />
                  <Skeleton className="h-4 w-24 shrink-0" />
                </div>
              ))}
            </div>
          ) : activityLogs.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400 sm:px-5">
              No activity logs found for the selected period. Users turn time tracking ON/OFF from their Settings page.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-800/50">
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400 sm:px-5">
                        User
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400 sm:px-5">
                        Role
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400 sm:px-5">
                        Event
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400 sm:px-5">
                        Date & Time
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activityLogs.map((log) => {
                      const label = log.eventType === 'tracking_enabled' ? 'ON' : 'OFF';
                      const badgeClass =
                        log.eventType === 'tracking_enabled'
                          ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
                      return (
                        <tr
                          key={log.id}
                          className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                        >
                          <td className="px-4 py-3 sm:px-5">
                            <div>
                              <div className="font-medium text-slate-900 dark:text-slate-100">{log.userName}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{log.userEmail}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 sm:px-5">
                            {log.userRole}
                          </td>
                          <td className="px-4 py-3 sm:px-5">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}
                            >
                              {label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-slate-600 dark:text-slate-400 sm:px-5">
                            {format(new Date(log.createdAt), 'MMM d, yyyy · h:mm a')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {activityLogsPagination && activityLogsPagination.pages > 1 && (
                <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-5">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Page {activityLogsPagination.page} of {activityLogsPagination.pages} · {activityLogsPagination.total} total
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActivityLogPage((p) => Math.max(1, p - 1))}
                      disabled={activityLogPage <= 1}
                      className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-slate-600"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() =>
                        setActivityLogPage((p) => Math.min(activityLogsPagination.pages, p + 1))
                      }
                      disabled={activityLogPage >= activityLogsPagination.pages}
                      className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-slate-600"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* Leads Abstract Tab – State → Districts → Mandals filters; 4-column Kanban */}
      {activeTab === 'abstract' && (
        <div className="space-y-4">
          {/* Filters: State → District; Academic Year; Student Group */}
          {isLoadingAbstract && !leadsAbstract ? (
            <LeadsAbstractSkeleton />
          ) : leadsAbstract ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[calc(100vh-16rem)]">
              {/* Districts table – always shown first */}
              <Card className="flex flex-col overflow-hidden h-full">
                <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Districts</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Lead count by district · Select a district to see mandal-wise stats</p>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {isFetchingAbstract ? (
                    <div className="p-4 space-y-4">
                      {[...Array(20)].map((_, i) => (
                        <div key={i} className="flex items-center">
                          <Skeleton className="h-8 w-full rounded" />
                        </div>
                      ))}
                    </div>
                  ) : (leadsAbstract.districtBreakdown || []).length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No districts</p>
                  ) : (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                      {(leadsAbstract.districtBreakdown || []).map((row: { id?: string; name: string; count: number }, idx: number) => (
                        <li
                          key={row.id ?? `district-${idx}`}
                          onClick={() => {
                            if (row.id) {
                              setFilters({ ...filters, abstractDistrictId: row.id });
                            }
                          }}
                          className={`flex items-center justify-between px-4 py-3 text-sm cursor-pointer transition-colors ${filters.abstractDistrictId === row.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                        >
                          <span className="text-slate-900 dark:text-slate-100 truncate pr-2">
                            {row.name}
                            {row.name === leadsAbstract.maxDistrict && (
                              <span className="ml-1 text-amber-600 dark:text-amber-400">(Highest)</span>
                            )}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-slate-700 dark:text-slate-300">{Number(row.count)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>

              {/* Mandals table – only when a district is selected */}
              {filters.abstractDistrictId ? (
                <Card className="flex flex-col overflow-hidden h-full">
                  <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Mandals</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Lead count by mandal for selected district</p>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {isFetchingAbstract ? (
                      <div className="p-4 space-y-4">
                        {[...Array(20)].map((_, i) => (
                          <div key={i} className="flex items-center">
                            <Skeleton className="h-8 w-full rounded" />
                          </div>
                        ))}
                      </div>
                    ) : (leadsAbstract.mandalBreakdown || []).length === 0 ? (
                      <div className="flex items-center justify-center h-full p-4 text-sm text-slate-500">
                        No mandals found for this district
                      </div>
                    ) : (
                      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                        {(leadsAbstract.mandalBreakdown || []).map((row: { id?: string; name: string; count: number }, idx: number) => (
                          <li
                            key={row.id ?? `mandal-${idx}`}
                            className={`flex items-center justify-between px-4 py-3 text-sm ${row.name === leadsAbstract.maxMandal ? 'bg-amber-50 dark:bg-amber-900/20 font-medium' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                              }`}
                          >
                            <span className="text-slate-900 dark:text-slate-100 truncate pr-2">
                              {row.name}
                              {row.name === leadsAbstract.maxMandal && (
                                <span className="ml-1 text-amber-600 dark:text-amber-400">(Highest)</span>
                              )}
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-slate-700 dark:text-slate-300">{Number(row.count)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Card>
              ) : (
                <div className="hidden md:flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 h-full bg-slate-50/50 dark:bg-slate-800/30 text-slate-400 p-8 text-center">
                  <p>Select a district to view mandal breakdown</p>
                </div>
              )}
            </div>
          ) : (
            <Card className="p-8 text-center">
              <p className="text-slate-500 dark:text-slate-400">No abstract data. Select Academic Year and try again.</p>
            </Card>
          )}
        </div>
      )}

    </div>
  );
}
