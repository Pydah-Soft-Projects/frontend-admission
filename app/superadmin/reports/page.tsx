'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportAPI, userAPI, leadAPI, locationsAPI } from '@/lib/api';
import { format, subDays, startOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { exportToExcel, exportToCSV } from '@/lib/export';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  ResponsiveContainer,
  LineChart,
  Line,
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

type TabType = 'calls' | 'conversions' | 'leads' | 'sources' | 'users' | 'abstract';

type DatePreset = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'custom';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('calls');
  const [datePreset, setDatePreset] = useState<DatePreset>('last30days');
  
  // Unified filters for all tabs
  const [filters, setFilters] = useState({
    startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    userId: '',
    course: '',
    status: '',
    source: '',
    district: '',
    mandal: '',
    state: '',
    academicYear: 2025,
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

  // Lead Analytics
  const { data: leadAnalytics, isLoading: isLoadingLeads, error: leadAnalyticsError } = useQuery({
    queryKey: ['leadAnalytics', filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        page: 1,
        limit: 100000, // Very high limit to get all leads in the period for analytics
      };
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (filters.userId) params.assignedTo = filters.userId;
      if (filters.course) params.courseInterested = filters.course;
      if (filters.status) params.leadStatus = filters.status;
      if (filters.source) params.source = filters.source;
      if (filters.district) params.district = filters.district;
      if (filters.mandal) params.mandal = filters.mandal;
      if (filters.state) params.state = filters.state;
      
      const response = await leadAPI.getAll(params);
      return response;
    },
    enabled: activeTab === 'leads',
    retry: 2,
  });

  // Overview Analytics for charts
  const { data: overviewAnalytics, isLoading: isLoadingOverview } = useQuery({
    queryKey: ['overviewAnalytics', filters.startDate, filters.endDate],
    queryFn: () => leadAPI.getOverviewAnalytics({ days: 30 }),
    enabled: activeTab === 'leads' || activeTab === 'sources',
    retry: 2,
  });

  // User Analytics (with academic year and day-wise call activity)
  const { data: userAnalytics, isLoading: isLoadingUserAnalytics } = useQuery({
    queryKey: ['userAnalytics', filters.startDate, filters.endDate, filters.academicYear],
    queryFn: () => leadAPI.getUserAnalytics({
      startDate: filters.startDate,
      endDate: filters.endDate,
      academicYear: filters.academicYear != null ? filters.academicYear : undefined,
    }),
    enabled: activeTab === 'users',
    retry: 2,
  });

  // States for Abstract tab (state → districts → mandals)
  const { data: abstractStates } = useQuery({
    queryKey: ['locations', 'states'],
    queryFn: () => locationsAPI.listStates(),
    enabled: activeTab === 'abstract',
  });
  const { data: abstractDistricts } = useQuery({
    queryKey: ['locations', 'districts', filters.abstractStateId],
    queryFn: () => locationsAPI.listDistricts({ stateId: filters.abstractStateId }),
    enabled: activeTab === 'abstract' && !!filters.abstractStateId,
  });

  // Leads Abstract (district, mandal, school, college by academic year + student group + state/district filter)
  const { data: leadsAbstract, isLoading: isLoadingAbstract } = useQuery({
    queryKey: ['leadsAbstract', filters.academicYear, filters.studentGroup, filters.abstractStateId, filters.abstractDistrictId],
    queryFn: () => reportAPI.getLeadsAbstract({
      academicYear: filters.academicYear ?? 2025,
      studentGroup: filters.studentGroup || undefined,
      stateId: filters.abstractStateId || undefined,
      districtId: filters.abstractDistrictId || undefined,
    }),
    enabled: activeTab === 'abstract',
    retry: 2,
  });

  // Export handlers
  const handleExport = (type: 'excel' | 'csv', data: any[], filename: string) => {
    if (!data || data.length === 0) return;
    
    // For lead data, use existing export functions
    if (activeTab === 'leads' && data[0]?.enquiryNumber !== undefined) {
      if (type === 'excel') {
        exportToExcel(data, filename);
      } else {
        exportToCSV(data, filename);
      }
      return;
    }

    // For other data types, create generic export
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

  // Prepare chart data
  const callChartData = useMemo(() => {
    if (!callReports?.reports) return [];
    const dailyData: Record<string, { date: string; calls: number; duration: number }> = {};
    
    callReports.reports.forEach((report: any) => {
      const date = report.date;
      if (!dailyData[date]) {
        dailyData[date] = { date, calls: 0, duration: 0 };
      }
      dailyData[date].calls += report.callCount || 0;
      dailyData[date].duration += report.totalDuration || 0;
    });

    return Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
  }, [callReports]);

  const conversionChartData = useMemo(() => {
    if (!conversionReports?.reports) return [];
    return conversionReports.reports.map((report: any) => ({
      name: report.userName || 'Unknown',
      leads: report.totalLeads || 0,
      converted: report.convertedLeads || 0,
      rate: report.conversionRate || 0,
    }));
  }, [conversionReports]);

  const sourceChartData = useMemo(() => {
    if (!leadAnalytics?.leads) return [];
    const sourceCounts: Record<string, number> = {};
    
    leadAnalytics.leads.forEach((lead: any) => {
      const source = lead.source || 'Unknown';
      sourceCounts[source] = (sourceCounts[source] || 0) + 1;
    });

    return Object.entries(sourceCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [leadAnalytics]);

  const statusChartData = useMemo(() => {
    if (!leadAnalytics?.leads) return [];
    const statusCounts: Record<string, number> = {};
    
    leadAnalytics.leads.forEach((lead: any) => {
      const status = lead.leadStatus || 'New';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  }, [leadAnalytics]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Comprehensive Reports & Analytics</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Complete analytics dashboard with user, lead, and source-based insights
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-700">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {(['calls', 'conversions', 'leads', 'sources', 'users', 'abstract'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
            >
              {tab === 'calls' && 'Call Reports'}
              {tab === 'conversions' && 'Conversion Reports'}
              {tab === 'leads' && 'Lead Analytics'}
              {tab === 'sources' && 'Source Analytics'}
              {tab === 'users' && 'User Analytics'}
              {tab === 'abstract' && 'Leads Abstract'}
            </button>
          ))}
        </nav>
      </div>

      {/* Date Presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Quick Filters:</span>
        {(['today', 'yesterday', 'last7days', 'last30days', 'thisWeek', 'thisMonth', 'lastMonth', 'custom'] as DatePreset[]).map((preset) => (
          <button
            key={preset}
            onClick={() => handleDatePreset(preset)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              datePreset === preset
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
            }`}
          >
            {preset === 'today' && 'Today'}
            {preset === 'yesterday' && 'Yesterday'}
            {preset === 'last7days' && 'Last 7 Days'}
            {preset === 'last30days' && 'Last 30 Days'}
            {preset === 'thisWeek' && 'This Week'}
            {preset === 'thisMonth' && 'This Month'}
            {preset === 'lastMonth' && 'Last Month'}
            {preset === 'custom' && 'Custom'}
          </button>
        ))}
      </div>

      {/* Filters */}
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
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">User/Counsellor</label>
            <select
              value={filters.userId}
              onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
            >
              <option value="">All Users</option>
              {users.map((user: any) => (
                <option key={user._id} value={user._id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
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
              <option value="Inter-MPC">Inter-MPC</option>
              <option value="Inter-BIPC">Inter-BIPC</option>
              <option value="Degree">Degree</option>
              <option value="Diploma">Diploma</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Call Reports Tab */}
      {activeTab === 'calls' && (
        <div className="space-y-6">
          {isLoadingCalls ? (
            <Skeleton className="h-64" />
          ) : callReportsError ? (
            <Card className="p-8 text-center">
              <p className="text-red-600 dark:text-red-400">
                Failed to load call reports. Please try again.
              </p>
            </Card>
          ) : (
            <>
              {/* Summary Cards */}
              {callReports?.summary && callReports.summary.length > 0 && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {callReports.summary.map((summary: any) => (
                    <Card key={summary.userId} className="p-4">
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{summary.userName}</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{summary.totalCalls}</p>
                      <p className="mt-1 text-xs text-slate-500">Avg: {summary.averageCallsPerDay} calls/day</p>
                      <p className="text-xs text-slate-500">
                        Avg Duration: {Math.floor(summary.averageDuration / 60)}m {summary.averageDuration % 60}s
                      </p>
                    </Card>
                  ))}
                </div>
              )}

              {/* Charts */}
              {callChartData.length > 0 && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Daily Call Trends</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={callChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="calls" stroke="#3b82f6" name="Calls" />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Export and Table */}
              <div className="flex justify-end gap-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('excel', callReports?.reports || [], `call-reports-${filters.startDate}-${filters.endDate}`)}
                  disabled={!callReports?.reports?.length}
                >
                  Export Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('csv', callReports?.reports || [], `call-reports-${filters.startDate}-${filters.endDate}`)}
                  disabled={!callReports?.reports?.length}
                >
                  Export CSV
                </Button>
              </div>

              {/* Table */}
              {callReports?.reports && callReports.reports.length > 0 ? (
                <Card className="overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                      <thead className="bg-slate-50 dark:bg-slate-900">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Date</th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">User</th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Calls</th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Duration</th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Avg Duration</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                        {callReports.reports.map((report: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                              {format(new Date(report.date), 'MMM dd, yyyy')}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{report.userName}</td>
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
              ) : (
                <Card className="p-8 text-center">
                  <p className="text-slate-500 dark:text-slate-400">No call reports found for the selected period.</p>
                </Card>
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
                                className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                  report.conversionRate >= 50
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

      {/* Lead Analytics Tab */}
      {activeTab === 'leads' && (
        <div className="space-y-6">
          {isLoadingLeads ? (
            <Skeleton className="h-64" />
          ) : leadAnalyticsError ? (
            <Card className="p-8 text-center">
              <p className="text-red-600 dark:text-red-400">Failed to load lead analytics. Please try again.</p>
            </Card>
          ) : (
            <>
              {/* Summary */}
              {leadAnalytics?.pagination && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                  <Card className="p-4">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Leads</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{leadAnalytics.pagination.total}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Showing</p>
                    <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{leadAnalytics.leads?.length || 0}</p>
                  </Card>
                </div>
              )}

              {/* Status Chart */}
              {statusChartData.length > 0 && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Leads by Status</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={statusChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(props: any) => {
                          const { name, percent } = props;
                          return `${name} ${((percent as number) * 100).toFixed(0)}%`;
                        }}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Export */}
              <div className="flex justify-end gap-2 mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('excel', leadAnalytics?.leads || [], `lead-analytics-${filters.startDate}-${filters.endDate}`)}
                  disabled={!leadAnalytics?.leads?.length}
                >
                  Export Excel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExport('csv', leadAnalytics?.leads || [], `lead-analytics-${filters.startDate}-${filters.endDate}`)}
                  disabled={!leadAnalytics?.leads?.length}
                >
                  Export CSV
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Source Analytics Tab */}
      {activeTab === 'sources' && (
        <div className="space-y-6">
          {isLoadingLeads ? (
            <Skeleton className="h-64" />
          ) : (
            <>
              {/* Source Chart */}
              {sourceChartData.length > 0 && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Leads by Source</h3>
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={sourceChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis dataKey="name" type="category" width={150} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#3b82f6" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* Source Pie Chart */}
              {sourceChartData.length > 0 && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">Source Distribution</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={sourceChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={(props: any) => {
                          const { name, percent } = props;
                          return `${name} ${((percent as number) * 100).toFixed(0)}%`;
                        }}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {sourceChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* User Analytics Tab */}
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
          </div>
          {isLoadingUserAnalytics ? (
            <Skeleton className="h-64" />
          ) : userAnalytics?.users && Array.isArray(userAnalytics.users) && userAnalytics.users.length > 0 ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <Card className="p-4">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Users</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{userAnalytics.users.length}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Assigned Leads</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {userAnalytics.users.reduce((sum: number, user: any) => sum + (user.totalAssigned || 0), 0)}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Calls</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {userAnalytics.users.reduce((sum: number, user: any) => sum + (user.calls?.total || 0), 0)}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total SMS</p>
                  <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {userAnalytics.users.reduce((sum: number, user: any) => sum + (user.sms?.total || 0), 0)}
                  </p>
                </Card>
              </div>

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

              {/* User Performance Chart */}
              {userAnalytics.users.length > 0 && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4">User Performance Comparison</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={userAnalytics.users.map((u: any) => ({ 
                      name: u.name, 
                      leads: u.totalAssigned || 0, 
                      converted: u.convertedLeads || 0,
                      calls: u.calls?.total || 0,
                      sms: u.sms?.total || 0,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="leads" fill="#3b82f6" name="Total Assigned" />
                      <Bar dataKey="converted" fill="#10b981" name="Converted" />
                      <Bar dataKey="calls" fill="#f59e0b" name="Calls" />
                      <Bar dataKey="sms" fill="#8b5cf6" name="SMS" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {/* User Performance Table */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">User Performance Summary</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                    <thead className="bg-slate-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Leads</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Calls</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">SMS</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Status Changes</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Confirmed</th>
                        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Conversion Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                      {userAnalytics.users.map((user: any) => (
                        <tr key={user.userId} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">{user.name || user.userName}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.totalAssigned || 0}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                            <div className="flex flex-col">
                              <span>{user.calls?.total || 0}</span>
                              {user.calls?.averageDuration > 0 && (
                                <span className="text-xs text-slate-500">
                                  Avg: {Math.floor(user.calls.averageDuration / 60)}m {user.calls.averageDuration % 60}s
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.sms?.total || 0}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.statusConversions?.total || 0}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.convertedLeads || 0}</td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm">
                            <span
                              className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                                (user.conversionRate || 0) >= 50
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                  : (user.conversionRate || 0) >= 30
                                  ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                  : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                              }`}
                            >
                              {user.conversionRate || 0}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Detailed User Analytics - Expandable Sections */}
              {userAnalytics.users.map((user: any) => (
                <Card key={user.userId} className="p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{user.name || user.userName}</h3>
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                        user.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}
                    >
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="space-y-6">
                    {/* Day-wise call activity */}
                    {user.dailyCallActivity && user.dailyCallActivity.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                          Day-wise Call Activity
                        </h4>
                        <div className="space-y-3">
                          {user.dailyCallActivity.map((day: { date: string; callCount: number; leads?: { leadId: string; leadName: string; leadPhone?: string; enquiryNumber?: string; callCount: number }[] }, dayIdx: number) => (
                            <div key={dayIdx} className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
                              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 px-3 py-2">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                  {day.date}
                                </span>
                                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {day.callCount} call{day.callCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                              {day.leads && day.leads.length > 0 && (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full text-sm">
                                    <thead className="bg-slate-100 dark:bg-slate-700/50">
                                      <tr>
                                        <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Lead</th>
                                        <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Phone</th>
                                        <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Enquiry #</th>
                                        <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Calls</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                      {day.leads.map((lead: any, lidx: number) => (
                                        <tr key={lidx}>
                                          <td className="px-3 py-1.5 text-slate-900 dark:text-slate-100">{lead.leadName}</td>
                                          <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{lead.leadPhone || '—'}</td>
                                          <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{lead.enquiryNumber || '—'}</td>
                                          <td className="px-3 py-1.5 text-slate-900 dark:text-slate-100">{lead.callCount}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          ))}
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

      {/* Leads Abstract Tab – State → Districts → Mandals filters; 4-column Kanban */}
      {activeTab === 'abstract' && (
        <div className="space-y-4">
          {/* Filters: State → District; Academic Year; Student Group */}
          <Card className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-[180px]">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">State</label>
                <select
                  value={filters.abstractStateId}
                  onChange={(e) => setFilters({ ...filters, abstractStateId: e.target.value, abstractDistrictId: '' })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                >
                  <option value="">All States</option>
                  {(abstractStates || []).map((s: { id: string; name: string }) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[180px]">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">District</label>
                <select
                  value={filters.abstractDistrictId}
                  onChange={(e) => setFilters({ ...filters, abstractDistrictId: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                  disabled={!filters.abstractStateId}
                >
                  <option value="">All Districts</option>
                  {(abstractDistricts || []).map((d: { id: string; name: string }) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[120px]">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Academic Year</label>
                <select
                  value={filters.academicYear}
                  onChange={(e) => setFilters({ ...filters, academicYear: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                >
                  {[2023, 2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="min-w-[160px]">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Student Group</label>
                <select
                  value={filters.studentGroup}
                  onChange={(e) => setFilters({ ...filters, studentGroup: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
                >
                  <option value="">All Groups</option>
                  <option value="10th">10th</option>
                  <option value="Inter-MPC">Inter-MPC</option>
                  <option value="Inter-BIPC">Inter-BIPC</option>
                  <option value="Degree">Degree</option>
                  <option value="Diploma">Diploma</option>
                </select>
              </div>
            </div>
          </Card>

          {isLoadingAbstract ? (
            <Skeleton className="h-96" />
          ) : leadsAbstract ? (
            /* 4-column Kanban: Districts | Mandals | Schools | Colleges */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Column 1: Districts */}
              <Card className="flex flex-col overflow-hidden shrink-0">
                <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Districts</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Lead count by district</p>
                </div>
                <div className="flex-1 min-h-[320px] max-h-[70vh] overflow-y-auto">
                  {(leadsAbstract.districtBreakdown || []).length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No districts</p>
                  ) : (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                      {(leadsAbstract.districtBreakdown || []).map((row: { id?: string; name: string; count: number }, idx: number) => (
                        <li
                          key={row.id ?? `district-${idx}`}
                          className={`flex items-center justify-between px-4 py-3 text-sm ${
                            row.name === leadsAbstract.maxDistrict ? 'bg-amber-50 dark:bg-amber-900/20 font-medium' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                          }`}
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

              {/* Column 2: Mandals */}
              <Card className="flex flex-col overflow-hidden shrink-0">
                <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Mandals</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Lead count by mandal</p>
                </div>
                <div className="flex-1 min-h-[320px] max-h-[70vh] overflow-y-auto">
                  {(leadsAbstract.mandalBreakdown || []).length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No mandals</p>
                  ) : (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                      {(leadsAbstract.mandalBreakdown || []).map((row: { id?: string; name: string; count: number }, idx: number) => (
                        <li
                          key={row.id ?? `mandal-${idx}`}
                          className={`flex items-center justify-between px-4 py-3 text-sm ${
                            row.name === leadsAbstract.maxMandal ? 'bg-amber-50 dark:bg-amber-900/20 font-medium' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
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

              {/* Column 3: Schools */}
              <Card className="flex flex-col overflow-hidden shrink-0">
                <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Schools</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Lead count by school</p>
                </div>
                <div className="flex-1 min-h-[320px] max-h-[70vh] overflow-y-auto">
                  {(leadsAbstract.schoolBreakdown || []).length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No schools</p>
                  ) : (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                      {(leadsAbstract.schoolBreakdown || []).map((row: { id?: string; name: string; count: number }, idx: number) => (
                        <li key={row.id ?? `school-${idx}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <span className="text-slate-900 dark:text-slate-100 truncate pr-2">{row.name}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-slate-700 dark:text-slate-300">{Number(row.count)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>

              {/* Column 4: Colleges */}
              <Card className="flex flex-col overflow-hidden shrink-0">
                <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Colleges</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Lead count by college</p>
                </div>
                <div className="flex-1 min-h-[320px] max-h-[70vh] overflow-y-auto">
                  {(leadsAbstract.collegeBreakdown || []).length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">No colleges</p>
                  ) : (
                    <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                      {(leadsAbstract.collegeBreakdown || []).map((row: { id?: string; name: string; count: number }, idx: number) => (
                        <li key={row.id ?? `college-${idx}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-700/50">
                          <span className="text-slate-900 dark:text-slate-100 truncate pr-2">{row.name}</span>
                          <span className="shrink-0 font-semibold tabular-nums text-slate-700 dark:text-slate-300">{Number(row.count)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
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
