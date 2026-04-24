'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { userAPI, leadAPI } from '@/lib/api';
import { User, OverviewAnalytics } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SuperAdminDashboardSkeleton } from '@/components/ui/Skeleton';
import { showToast } from '@/lib/toast';
import { useTheme } from '@/app/providers';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from 'recharts';
import { Loader2, Search } from 'lucide-react';

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

const formatDateWithToday = (isoDate: string) => {
  try {
    const date = new Date(isoDate);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const formatted = date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    return isToday ? `${formatted} (Today)` : formatted;
  } catch {
    return isoDate;
  }
};

const isToday = (isoDate: string): boolean => {
  try {
    const date = new Date(isoDate);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  } catch {
    return false;
  }
};

const getTodayDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const summaryCardConfig = [
  { bar: 'bg-[#f97316]', bg: 'bg-[#fff7ed] dark:bg-[#fff7ed]/10', label: 'text-[#c2410c] dark:text-[#ffedd5]', value: 'text-[#7c2d12] dark:text-[#ffedd5]' },
  { bar: 'bg-[#10b981]', bg: 'bg-[#ecfdf5] dark:bg-[#ecfdf5]/10', label: 'text-[#047857] dark:text-[#d1fae5]', value: 'text-[#064e3b] dark:text-[#d1fae5]' },
  { bar: 'bg-[#f43f5e]', bg: 'bg-[#fff1f2] dark:bg-[#fff1f2]/10', label: 'text-[#be123c] dark:text-[#ffe4e6]', value: 'text-[#881337] dark:text-[#ffe4e6]' },
  { bar: 'bg-[#8b5cf6]', bg: 'bg-[#f5f3ff] dark:bg-[#f5f3ff]/10', label: 'text-[#6d28d9] dark:text-[#ede9fe]', value: 'text-[#4c1d95] dark:text-[#ede9fe]' },
  { bar: 'bg-[#f59e0b]', bg: 'bg-[#fffbeb] dark:bg-[#fffbeb]/10', label: 'text-[#b45309] dark:text-[#fef3c7]', value: 'text-[#78350f] dark:text-[#fef3c7]' },
  { bar: 'bg-[#6366f1]', bg: 'bg-[#eef2ff] dark:bg-[#eef2ff]/10', label: 'text-[#4338ca] dark:text-[#e0e7ff]', value: 'text-[#312e81] dark:text-[#e0e7ff]' },
];

const STUDENT_GROUP_OPTIONS = ['10th', 'Inter', 'Inter-MPC', 'Inter-BIPC', 'Degree', 'Diploma'];

/** User Performance card: small page size keeps overview load fast (server still scores full role cohort). */
const USER_PERF_PAGE_SIZE = 12;

export default function SuperAdminDashboard() {
  const router = useRouter();
  const { theme } = useTheme();
  const [dashboardAcademicYear, setDashboardAcademicYear] = useState<number | ''>('');
  const [dashboardStudentGroup, setDashboardStudentGroup] = useState<string>('');
  const [dashboardFunnelSource, setDashboardFunnelSource] = useState('');
  const [dashboardFunnelCycle, setDashboardFunnelCycle] = useState<number | ''>('');
  const [showAllCalls, setShowAllCalls] = useState(false);
  const [scheduledTab, setScheduledTab] = useState<'today' | 'yesterdayMissed'>('today');
  const [recentLeadsDays, setRecentLeadsDays] = useState<3 | 7 | 10>(3);
  const [shouldLoadUserPerformance, setShouldLoadUserPerformance] = useState(false);
  const [userPerfSearchInput, setUserPerfSearchInput] = useState('');
  const [debouncedUserPerfSearch, setDebouncedUserPerfSearch] = useState('');
  const [userPerfRole, setUserPerfRole] = useState('Student Counselor');
  const [userPerfPage, setUserPerfPage] = useState(1);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedUserPerfSearch(userPerfSearchInput.trim()), 400);
    return () => window.clearTimeout(t);
  }, [userPerfSearchInput]);

  useEffect(() => {
    setUserPerfPage(1);
  }, [debouncedUserPerfSearch, userPerfRole, dashboardAcademicYear]);

  useEffect(() => {
    const currentUser = auth.getUser();
    if (!currentUser) {
      router.push('/auth/login');
      return;
    }
    if (currentUser.roleName !== 'Super Admin' && currentUser.roleName !== 'Sub Super Admin') {
      router.push('/user/dashboard');
      return;
    }
  }, [router]);

  const { data: usersDirectoryData } = useQuery({
    queryKey: ['users-directory'],
    queryFn: async () => {
      const response = await userAPI.getAll();
      if (Array.isArray(response)) return response;
      if (response?.data && Array.isArray(response.data)) return response.data;
      return [];
    },
    staleTime: 120_000,
  });

  const todayStr = getTodayDateString();
  const { data: scheduledLeadsData } = useQuery({
    queryKey: ['leads', 'scheduled', todayStr],
    queryFn: async () => {
      const res = await leadAPI.getAll({ scheduledOn: todayStr, limit: 50 });
      return res?.leads ?? [];
    },
    staleTime: 60_000,
  });
  const scheduledLeads = Array.isArray(scheduledLeadsData) ? scheduledLeadsData : [];
  const usersDirectory = Array.isArray(usersDirectoryData) ? usersDirectoryData : [];

  const userPerfRoleOptions = useMemo(() => {
    const roles = new Set<string>();
    usersDirectory.forEach((u: any) => {
      const r = String(u?.roleName ?? u?.role_name ?? '').trim();
      if (r && r !== 'Super Admin' && r !== 'Sub Super Admin') roles.add(r);
    });
    return Array.from(roles).sort((a, b) => a.localeCompare(b));
  }, [usersDirectory]);

  const {
    data: userAnalyticsData,
    isLoading: isLoadingUserAnalytics,
    isFetching: isFetchingUserAnalytics,
    error: userAnalyticsError,
  } = useQuery({
    queryKey: [
      'user-analytics',
      'overview-performance',
      'current-portfolio',
      dashboardAcademicYear,
      debouncedUserPerfSearch,
      userPerfRole,
      userPerfPage,
      USER_PERF_PAGE_SIZE,
    ],
    queryFn: async () =>
      leadAPI.getUserAnalytics({
        currentPortfolioOnly: true,
        ...(dashboardAcademicYear !== '' && { academicYear: dashboardAcademicYear }),
        ...(debouncedUserPerfSearch !== '' && { perfSearch: debouncedUserPerfSearch }),
        ...(userPerfRole !== '' && { perfRole: userPerfRole }),
        page: userPerfPage,
        limit: USER_PERF_PAGE_SIZE,
      }),
    enabled: shouldLoadUserPerformance,
    staleTime: 120_000,
    retry: 1,
    placeholderData: (previousData) => previousData,
  });

  const todayScheduledLeads = useMemo(
    () => scheduledLeads.filter((lead: any) => !lead?.isYesterdayMissedCall),
    [scheduledLeads]
  );
  const yesterdayMissedLeads = useMemo(
    () => scheduledLeads.filter((lead: any) => !!lead?.isYesterdayMissedCall),
    [scheduledLeads]
  );

  const selectedScheduledLeads = scheduledTab === 'today' ? scheduledLeads : yesterdayMissedLeads;

  const scheduledByUserSelected = useMemo(() => {
    const userMetaByName = new Map<string, { department: string }>();
    usersDirectory.forEach((u: any) => {
      const name = String(u?.name || '').trim();
      if (!name) return;
      userMetaByName.set(name.toLowerCase(), {
        department: String(u?.department || '').trim() || '—',
      });
    });

    const counts = new Map<string, { userName: string; department: string; count: number }>();
    selectedScheduledLeads.forEach((lead: any) => {
      const assignedCounsellorName =
        typeof lead?.assignedTo === 'object' && lead?.assignedTo?.name
          ? String(lead.assignedTo.name).trim()
          : '';
      const assignedProName =
        typeof lead?.assignedToPro === 'object' && lead?.assignedToPro?.name
          ? String(lead.assignedToPro.name).trim()
          : '';
      const assigneeName = assignedCounsellorName || assignedProName || 'Unassigned';
      if (assigneeName === 'Unassigned') return;
      const key = assigneeName.toLowerCase();
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
        return;
      }
      const dept = assigneeName === 'Unassigned'
        ? '—'
        : (userMetaByName.get(key)?.department || '—');
      counts.set(key, { userName: assigneeName, department: dept, count: 1 });
    });
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count || a.userName.localeCompare(b.userName));
  }, [selectedScheduledLeads, usersDirectory]);

  const { data: filterOptionsData } = useQuery({
    queryKey: ['filterOptions'],
    queryFn: () => leadAPI.getFilterOptions(),
    staleTime: 120_000,
  });
  const filterOptions = filterOptionsData?.data || filterOptionsData;
  const academicYearOptions = filterOptions?.academicYears ?? (() => {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2, y - 3];
  })();

  const {
    data: overviewData,
    isLoading: isLoadingOverview,
    isFetching: isFetchingOverview,
  } = useQuery({
    queryKey: [
      'overview-analytics',
      dashboardAcademicYear,
      dashboardStudentGroup,
      dashboardFunnelSource,
      dashboardFunnelCycle,
    ],
    queryFn: async () => {
      const response = await leadAPI.getOverviewAnalytics({
        days: 14,
        ...(dashboardAcademicYear !== '' && { academicYear: dashboardAcademicYear }),
        ...(dashboardStudentGroup && { studentGroup: dashboardStudentGroup }),
        ...(dashboardFunnelSource && { source: dashboardFunnelSource }),
        ...(dashboardFunnelCycle !== '' && dashboardFunnelCycle != null && { cycleNumber: dashboardFunnelCycle }),
      });
      return response.data || response;
    },
    staleTime: 120_000,
    placeholderData: (previousData) => previousData,
  });

  const overviewAnalytics = (overviewData?.data || overviewData) as OverviewAnalytics | null;

  const chartGridColor = theme === 'dark' ? 'rgba(148, 163, 184, 0.2)' : '#e2e8f0';
  const chartTextColor = theme === 'dark' ? '#cbd5f5' : '#475569';
  const tooltipStyle = useMemo(
    () => ({
      backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
      color: theme === 'dark' ? '#f8fafc' : '#1f2937',
      borderRadius: '14px',
      border: theme === 'dark'
        ? '1px solid rgba(148, 163, 184, 0.35)'
        : '1px solid rgba(148, 163, 184, 0.25)',
      boxShadow: '0 20px 45px rgba(15, 23, 42, 0.15)',
      padding: '12px 16px',
    }),
    [theme],
  );

  const statusChanges = overviewAnalytics?.daily.statusChanges ?? [];
  const statusKeys = useMemo(() => {
    const collector = new Set<string>();
    statusChanges.forEach((entry) => {
      Object.keys(entry.statuses || {}).forEach((key) => {
        if (key !== 'total') collector.add(key);
      });
    });

    // Priority statuses to always show
    const priorityStatuses = ['Admitted', 'Interested', 'Partial'];
    const allStatuses = Array.from(collector);

    // Sort: priority statuses first, then others
    const sorted = [
      ...priorityStatuses.filter(s => allStatuses.includes(s)),
      ...allStatuses.filter(s => !priorityStatuses.includes(s))
    ];

    // Return all statuses (or limit if needed, but show priority ones first)
    return sorted;
  }, [statusChanges]);

  const statusChangeData = useMemo(() => {
    return statusChanges.map((entry) => {
      const row: Record<string, number | string | boolean> = {
        date: formatDateWithToday(entry.date),
        dateKey: entry.date,
        isToday: isToday(entry.date),
      };
      statusKeys.forEach((key) => {
        row[key] = entry.statuses?.[key] ?? 0;
      });
      return row;
    });
  }, [statusChanges, statusKeys]);

  const leadStatusData = useMemo(() => {
    if (!overviewAnalytics?.leadStatusBreakdown) return [];
    return Object.entries(overviewAnalytics.leadStatusBreakdown)
      .map(([name, value]) => ({ name, value }))
      .filter((item) => item.value > 0);
  }, [overviewAnalytics]);

  /** Pipeline funnel: one aggregated overview query (same filters as summary cards). */
  const pipelineFunnelStages = useMemo(() => {
    const t = overviewAnalytics?.totals;
    if (!t) return [];

    const total = Number(t.leads) || 0;
    const assigned = Number(t.assignedLeads ?? 0) || 0;
    const sc = Number(t.assignedLeadsToCounselor ?? 0) || 0;
    const pro = Number(t.assignedLeadsToPro ?? 0) || 0;
    const contact = Number(t.callOrVisitDone ?? 0) || 0;
    const interested = Number(t.interestedLeads ?? 0) || 0;
    const confirmed = Number(t.confirmedLeads ?? 0) || 0;

    const baseStages = [
      {
        key: 'total',
        label: 'Overall Leads',
        value: total,
        hint: 'All leads matching selected filters',
        color: '#3b82f6',
      },
      {
        key: 'assigned',
        label: 'Assigned Leads',
        value: assigned,
        hint: `Counsellor ${formatNumber(sc)} | PRO ${formatNumber(pro)}`,
        color: '#2dd4bf',
      },
      {
        key: 'contact',
        label: 'Calls / Visits Done',
        value: contact,
        hint: 'Statuses progressed beyond initial Assigned',
        color: '#facc15',
      },
      {
        key: 'interested',
        label: 'Interested',
        value: interested,
        hint: 'Interested + CET Applied',
        color: '#f97316',
      },
      {
        key: 'confirmed',
        label: 'Confirmed',
        value: confirmed,
        hint: 'Lead status Confirmed',
        color: '#c084fc',
      },
    ];

    const fixedShapeWidths = [100, 82, 66, 52, 40];

    return baseStages.map((stage, index) => ({
        ...stage,
        // Keep funnel geometry consistent irrespective of data values.
        widthPct: fixedShapeWidths[index] ?? 36,
      }));
  }, [overviewAnalytics]);

  const summaryCards = useMemo(() => ([
    {
      label: 'Total Leads',
      value: overviewAnalytics?.totals.leads ?? 0,
      helper: 'Captured so far',
    },
    {
      label: 'Counselor Assigned',
      value: overviewAnalytics?.totals.assignedLeadsToCounselor ?? 0,
      helper: 'Assigned to counselors',
    },
    {
      label: 'PRO Assigned',
      value: overviewAnalytics?.totals.assignedLeadsToPro ?? 0,
      helper: 'Assigned to PRO users',
    },
    {
      label: 'Unassigned Leads',
      value: overviewAnalytics?.totals.unassignedLeads ?? 0,
      helper: 'Pending assignment',
    },
    {
      label: 'Confirmed Leads',
      value: overviewAnalytics?.totals.confirmedLeads ?? 0,
      helper: 'Awaiting joining forms',
    },
    {
      label: 'Admissions',
      value: overviewAnalytics?.totals.admissions ?? 0,
      helper: 'Approved & enrolled',
    },
  ]), [overviewAnalytics]);

  const userAnalytics = userAnalyticsData?.users || [];
  const userPerfPagination = userAnalyticsData?.pagination as
    | { page: number; limit: number; total: number; pages: number }
    | undefined;
  const userPerfSearchDebouncing =
    userPerfSearchInput.trim() !== debouncedUserPerfSearch;
  const userPerfListRefetching =
    Boolean(userAnalyticsData) && isFetchingUserAnalytics;
  const userPerfFiltersBusy = userPerfSearchDebouncing || userPerfListRefetching;

  const { data: recentLeadsData } = useQuery({
    queryKey: ['recent-leads-source', recentLeadsDays],
    queryFn: async () => {
      const now = new Date();
      const start = new Date(now);
      start.setDate(now.getDate() - (recentLeadsDays - 1));
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      const response = await leadAPI.getAll({
        page: 1,
        limit: 5000,
        startDate: fmt(start),
        endDate: fmt(now),
      } as any);
      return Array.isArray(response?.leads) ? response.leads : [];
    },
    staleTime: 60_000,
  });

  const recentLeadsSourceCounts = useMemo(() => {
    const leads = Array.isArray(recentLeadsData) ? recentLeadsData : [];
    const sourceMap = new Map<string, number>();
    leads.forEach((lead: any) => {
      const source = String(lead?.source || '').trim() || 'Unknown';
      sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
    });
    return Array.from(sourceMap.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source));
  }, [recentLeadsData]);

  const isInitialLoad = !overviewData && isLoadingOverview;
  useEffect(() => {
    if (!isInitialLoad) {
      setShouldLoadUserPerformance(true);
    }
  }, [isInitialLoad]);

  if (isInitialLoad) {
    return <SuperAdminDashboardSkeleton />;
  }

  return (
    <div className="space-y-8">
      {/* Page header: title + filters + actions */}
      <div className="flex flex-col gap-4 sm:flex-row mt-0 sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 sm:text-3xl">
            Super Admin Dashboard
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <span className="shrink-0">Academic Year</span>
            <select
              value={dashboardAcademicYear === '' ? '' : dashboardAcademicYear}
              onChange={(e) => setDashboardAcademicYear(e.target.value ? Number(e.target.value) : '')}
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">All</option>
              {academicYearOptions.map((y: number) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <span className="shrink-0">Student Group</span>
            <select
              value={dashboardStudentGroup}
              onChange={(e) => setDashboardStudentGroup(e.target.value)}
              className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">All</option>
              {STUDENT_GROUP_OPTIONS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
          <div className="flex shrink-0 gap-2">
            <Link href="/superadmin/leads/individual">
              <Button variant="primary" size="md">Create Lead</Button>
            </Link>
            <Link href="/superadmin/users">
              <Button variant="outline" size="md">Manage Users</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats cards: aligned grid, theme-colored */}
      <div className="relative">
        <div className={`grid grid-cols-1 gap-4 transition-opacity duration-200 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 ${isFetchingOverview ? 'opacity-75' : 'opacity-100'}`}>
          {summaryCards.map((card, index) => {
            const style = summaryCardConfig[index % summaryCardConfig.length];
            return (
              <Card
                key={card.label}
                className={`overflow-hidden border border-slate-200/80 dark:border-slate-700/80 ${style.bg} shadow-sm`}
              >
                <div className={`h-1 w-full shrink-0 ${style.bar}`} aria-hidden />
                <div className="mt-2 text-center">
                  <p className={`text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${style.label}`}>
                    {card.label}
                  </p>
                  <div className="mt-1 flex min-h-9 items-center justify-center">
                    {isFetchingOverview ? (
                      <span
                        className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-70 ${style.value}`}
                        aria-label="Updating"
                      />
                    ) : (
                      <p className={`text-2xl font-bold sm:text-3xl ${style.value}`}>
                        {formatNumber(card.value)}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Calls + Recent Sources + Lead Funnel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-m font-semibold text-[#0f172a] dark:text-[#f1f5f9]">Today&apos;s scheduled calls</h2>
              <Link href="/superadmin/leads" className="text-xs font-medium text-[#ea580c] hover:text-[#c2410c] dark:text-[#f97316]">
                View all
              </Link>
            </div>
            <div className="flex items-center gap-2 px-1">
              <button
                onClick={() => {
                  setScheduledTab('today');
                  setShowAllCalls(false);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  scheduledTab === 'today'
                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                Today ({todayScheduledLeads.length} + {yesterdayMissedLeads.length})
              </button>
              <button
                onClick={() => {
                  setScheduledTab('yesterdayMissed');
                  setShowAllCalls(false);
                }}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  scheduledTab === 'yesterdayMissed'
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                Yesterday Missed ({yesterdayMissedLeads.length})
              </button>
            </div>

            {scheduledByUserSelected.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-[#e2e8f0] p-4 text-xs text-[#64748b] dark:border-[#334155] dark:text-[#94a3b8]">
                {scheduledTab === 'today' ? 'No calls scheduled for today.' : 'No yesterday missed calls.'}
              </div>
            ) : (
              <>
                <ul className="overflow-hidden rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:divide-slate-800">
                  {scheduledByUserSelected.slice(0, showAllCalls ? undefined : 5).map((row) => (
                    <li key={row.userName} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {row.userName}
                          <span className="ml-2 text-xs font-normal text-[#64748b] dark:text-[#94a3b8]">
                            {row.department}
                          </span>
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:text-orange-300">
                        {formatNumber(row.count)}
                      </span>
                    </li>
                  ))}
                </ul>
                {scheduledByUserSelected.length > 5 && (
                  <button
                    onClick={() => setShowAllCalls(!showAllCalls)}
                    className="mt-1 w-full rounded-md border border-slate-200 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-800/50"
                  >
                    {showAllCalls ? 'Show Less' : `Show ${scheduledByUserSelected.length - 5} More`}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-m font-semibold text-[#0f172a] dark:text-[#f1f5f9]">Recent Leads by Source</h2>
              <Link href="/superadmin/leads" className="text-xs font-medium text-[#ea580c] hover:text-[#c2410c] dark:text-[#f97316]">
                View leads
              </Link>
            </div>
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-center gap-2 border-b border-slate-100 p-2 dark:border-slate-800">
                {[3, 7, 10].map((d) => (
                  <button
                    key={d}
                    onClick={() => setRecentLeadsDays(d as 3 | 7 | 10)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      recentLeadsDays === d
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                  >
                    Last {d} days
                  </button>
                ))}
              </div>
              {recentLeadsSourceCounts.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400">
                  No recent leads found.
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recentLeadsSourceCounts.slice(0, 8).map((row) => (
                    <li key={row.source} className="flex items-center justify-between px-3 py-2">
                      <Link
                        href={`/superadmin/leads?source=${encodeURIComponent(row.source)}`}
                        className="truncate text-sm text-slate-700 hover:text-orange-600 dark:text-slate-200 dark:hover:text-orange-300"
                      >
                        {row.source}
                      </Link>
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        {formatNumber(row.count)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Lead pipeline funnel</h2>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <span className="shrink-0">Source</span>
                  <select
                    value={dashboardFunnelSource}
                    onChange={(e) => setDashboardFunnelSource(e.target.value)}
                    className="max-w-[10.5rem] cursor-pointer truncate rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 sm:max-w-[12rem]"
                  >
                    <option value="">All sources</option>
                    {(filterOptions?.sources ?? []).map((src: string) => (
                      <option key={src} value={src}>
                        {src}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <span className="shrink-0">Cycle</span>
                  <select
                    value={dashboardFunnelCycle === '' ? '' : String(dashboardFunnelCycle)}
                    onChange={(e) =>
                      setDashboardFunnelCycle(e.target.value ? Number(e.target.value) : '')
                    }
                    className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">All cycles</option>
                    {[1, 2, 3, 4, 5].map((c) => (
                      <option key={c} value={c}>
                        Cycle {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            
          </div>
          <div className="min-h-72 px-3 py-3 sm:px-4">
            <div className="grid grid-cols-[minmax(6.5rem,1fr)_minmax(0,2.7fr)_minmax(6.5rem,1fr)] items-start gap-2">
              <div className="space-y-3">
                {pipelineFunnelStages.map((stage) => (
                  <div key={`left-${stage.key}`} className="flex h-14 items-center justify-end pr-1 sm:h-16 sm:pr-2">
                    <p className="text-right text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-300 sm:text-xs">
                      {stage.label}
                    </p>
                  </div>
                ))}
              </div>

              <div className={`space-y-3 transition-opacity duration-200 ${isFetchingOverview ? 'opacity-80' : 'opacity-100'}`}>
                {pipelineFunnelStages.map((stage, index) => {
                  const taperLimit = 100 - index * 9;
                  const stageWidth = Math.max(16, Math.min(taperLimit, stage.widthPct));
                  const bottomInset = Math.min(28, 12 + index * 4);
                  const topInset = Math.min(20, 3 + index * 2);
                  return (
                    <div key={stage.key} className="relative h-14 sm:h-16">
                      <div
                        className="mx-auto h-full rounded-md shadow-sm transition-all duration-500"
                        style={{
                          width: `${stageWidth}%`,
                          background: `linear-gradient(180deg, ${stage.color} 0%, ${stage.color}cc 100%)`,
                          clipPath: `polygon(${topInset}% 0%, ${100 - topInset}% 0%, ${100 - bottomInset}% 100%, ${bottomInset}% 100%)`,
                        }}
                        title={isFetchingOverview ? `Updating ${stage.label}...` : `${stage.label}: ${formatNumber(stage.value)}`}
                      >
                        <div className="flex h-full items-center justify-center">
                          {isFetchingOverview ? (
                            <span
                              className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-900/70 border-t-transparent"
                              aria-label={`Updating ${stage.label}`}
                            />
                          ) : (
                            <span className="text-sm font-bold tracking-wide text-slate-900/80 sm:text-base">
                              {formatNumber(stage.value)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-3">
                {pipelineFunnelStages.map((stage) => (
                  <div key={`right-${stage.key}`} className="flex h-14 items-center justify-start pl-1 sm:h-16 sm:pl-2">
                    <div className="text-left leading-tight">
                      <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 sm:text-xs">
                        {stage.label}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 sm:text-[11px]">{stage.hint}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts row 2: Status Change + Lead Pool */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Status Change Velocity</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Daily status changes. Today is highlighted.
            </p>
          </div>
          <div className="h-72 px-4 py-4">
            <ResponsiveContainer>
              <LineChart data={statusChangeData}>
                <CartesianGrid strokeDasharray="6 4" stroke={chartGridColor} />
                <XAxis
                  dataKey="date"
                  stroke={chartTextColor}
                  tick={{ fill: chartTextColor }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis stroke={chartTextColor} tick={{ fill: chartTextColor }} allowDecimals={false} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(label, payload) => {
                    const data = payload?.[0]?.payload;
                    return data?.isToday ? `📅 ${label} (Live)` : label;
                  }}
                />
                <Legend />
                {statusKeys.map((status, index) => {
                  const colors = [
                    '#3b82f6', // Blue
                    '#22c55e', // Green
                    '#f97316', // Orange
                    '#a855f7', // Purple
                    '#ef4444', // Red
                    '#06b6d4', // Cyan
                    '#f59e0b', // Amber
                    '#ec4899', // Pink
                    '#6366f1', // Indigo
                    '#84cc16', // Lime
                  ];
                  return (
                    <Line
                      key={status}
                      type="monotone"
                      dataKey={status}
                      strokeWidth={2.5}
                      stroke={colors[index % colors.length]}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Lead Pool Composition</h2>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Distribution of leads by status
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {leadStatusData.length} statuses
            </span>
          </div>
          <div className="h-72 px-4 py-4">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={leadStatusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  label={(props: any) => {
                    const { name, percent } = props;
                    if (percent !== undefined) {
                      return `${name}: ${(percent * 100).toFixed(0)}%`;
                    }
                    return name;
                  }}
                  labelLine={false}
                >
                  {leadStatusData.map((entry, index) => {
                    const colors = ['#2563eb', '#16a34a', '#f97316', '#7c3aed', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#ec4899', '#6366f1'];
                    return (
                      <Cell
                        key={entry.name}
                        fill={colors[index % colors.length]}
                      />
                    );
                  })}
                </Pie>
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value: number, name: string) => [
                    formatNumber(value),
                    name
                  ]}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => value}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* User Performance */}
      <Card className="overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/30 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <h2 className="shrink-0 text-base font-semibold text-slate-900 dark:text-slate-100">
            User Performance Analytics
          </h2>
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-2">
            <div className="relative w-full min-w-0 sm:max-w-[14rem]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                type="search"
                value={userPerfSearchInput}
                onChange={(e) => setUserPerfSearchInput(e.target.value)}
                placeholder="Search name or email"
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                aria-label="Search users in performance list"
              />
            </div>
            <label className="flex w-full min-w-0 items-center gap-2 text-sm text-slate-600 dark:text-slate-400 sm:w-auto">
              <span className="shrink-0">Role</span>
              <select
                value={userPerfRole}
                onChange={(e) => setUserPerfRole(e.target.value)}
                className="min-w-0 flex-1 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 sm:min-w-[11rem]"
                aria-label="Filter by role"
              >
                <option value="">All roles</option>
                {userPerfRoleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            {userPerfFiltersBusy ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-md border border-orange-200/80 bg-orange-50/90 px-2 py-1.5 text-xs font-medium text-orange-800 dark:border-orange-800/60 dark:bg-orange-950/50 dark:text-orange-200"
                role="status"
                aria-live="polite"
                aria-label={userPerfListRefetching ? 'Updating list' : 'Applying search'}
              >
                <Loader2
                  className={`h-3.5 w-3.5 shrink-0 text-orange-600 dark:text-orange-300 ${
                    userPerfListRefetching ? 'animate-spin' : 'animate-pulse'
                  }`}
                  aria-hidden
                />
                {userPerfListRefetching ? 'Updating list…' : 'Applying search…'}
              </span>
            ) : null}
            <Link href="/superadmin/users" className="shrink-0">
              <Button size="sm" variant="outline">Manage Users</Button>
            </Link>
          </div>
        </div>
        {userPerfFiltersBusy && userAnalyticsData ? (
          <div
            className="h-0.5 w-full animate-pulse bg-orange-400 dark:bg-orange-500"
            aria-hidden
          />
        ) : null}
        <div className="p-5" aria-busy={userPerfFiltersBusy}>
          {!shouldLoadUserPerformance || (isLoadingUserAnalytics && !userAnalyticsData) ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Loading user performance analytics in background...
              </p>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={`user-performance-skeleton-${idx}`}
                    className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100/70 dark:border-slate-700 dark:bg-slate-800/50"
                  />
                ))}
              </div>
            </div>
          ) : userAnalyticsError ? (
            <div className="py-8 text-center">
              <p className="text-sm text-rose-600 dark:text-rose-300">
                Failed to load user performance analytics. Please refresh and try again.
              </p>
            </div>
          ) : userAnalytics.length > 0 ? (
            <div className={`space-y-4 ${isFetchingUserAnalytics ? 'opacity-70' : ''} transition-opacity`}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {userAnalytics.map((user: any) => {
                const statusEntries = Object.entries(user.statusBreakdown || {}).filter(([_, count]) => (count as number) > 0);
                return (
                  <div
                    key={user.userId}
                    className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:border-slate-700 dark:bg-slate-800/30"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{user.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{user.email}</p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${user.isActive
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200'
                          }`}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Assigned</span>
                        <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          {formatNumber(user.totalAssigned || 0)}
                        </span>
                      </div>
                      {statusEntries.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                            Status Breakdown
                          </p>
                          {statusEntries.map(([status, count]) => (
                            <div key={status} className="flex items-center justify-between">
                              <span className="text-xs text-slate-600 dark:text-slate-400 truncate">{status}</span>
                              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 ml-2">
                                {formatNumber(count as number)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {statusEntries.length === 0 && (
                        <p className="text-xs text-slate-400 dark:text-slate-500 italic">No leads assigned</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {userPerfPagination && userPerfPagination.total > 0 && (
              <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Showing {(userPerfPagination.page - 1) * userPerfPagination.limit + 1}–
                  {Math.min(userPerfPagination.page * userPerfPagination.limit, userPerfPagination.total)} of{' '}
                  {formatNumber(userPerfPagination.total)} users
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={userPerfPagination.page <= 1 || isFetchingUserAnalytics}
                    onClick={() => setUserPerfPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
                    Page {userPerfPagination.page} / {userPerfPagination.pages}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={userPerfPagination.page >= userPerfPagination.pages || isFetchingUserAnalytics}
                    onClick={() => setUserPerfPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No users found. Try another role or clear the search filter.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

