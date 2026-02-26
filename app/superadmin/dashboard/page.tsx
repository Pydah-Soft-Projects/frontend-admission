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
  AreaChart,
  Area,
  LineChart,
  Line,
  RadialBarChart,
  RadialBar,
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
  PolarAngleAxis,
} from 'recharts';

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

const formatShortDate = (isoDate: string) => {
  try {
    return new Date(isoDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  } catch {
    return isoDate;
  }
};

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
  { bar: 'bg-orange-500', bg: 'bg-orange-50 dark:bg-orange-950/30', label: 'text-orange-700 dark:text-orange-300', value: 'text-orange-900 dark:text-orange-100' },
  { bar: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/30', label: 'text-emerald-700 dark:text-emerald-300', value: 'text-emerald-900 dark:text-emerald-100' },
  { bar: 'bg-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/30', label: 'text-rose-700 dark:text-rose-300', value: 'text-rose-900 dark:text-rose-100' },
  { bar: 'bg-violet-500', bg: 'bg-violet-50 dark:bg-violet-950/30', label: 'text-violet-700 dark:text-violet-300', value: 'text-violet-900 dark:text-violet-100' },
  { bar: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/30', label: 'text-amber-700 dark:text-amber-300', value: 'text-amber-900 dark:text-amber-100' },
  { bar: 'bg-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/30', label: 'text-indigo-700 dark:text-indigo-300', value: 'text-indigo-900 dark:text-indigo-100' },
];

const STUDENT_GROUP_OPTIONS = ['10th', 'Inter', 'Inter-MPC', 'Inter-BIPC', 'Degree', 'Diploma'];

export default function SuperAdminDashboard() {
  const router = useRouter();
  const { theme } = useTheme();
  const [team, setTeam] = useState<User[]>([]);
  const [isTeamLoading, setIsTeamLoading] = useState(true);
  const [dashboardAcademicYear, setDashboardAcademicYear] = useState<number | ''>('');
  const [dashboardStudentGroup, setDashboardStudentGroup] = useState<string>('');

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

    const loadTeam = async () => {
      try {
        const response = await userAPI.getAll();
        const allUsers = response.data || response;
        // Filter out Super Admin and Sub Super Admin users
        const filteredUsers = allUsers.filter(
          (user: User) => user.roleName !== 'Super Admin' && user.roleName !== 'Sub Super Admin'
        );
        setTeam(filteredUsers);
      } catch (error) {
        console.error('Failed to load team roster', error);
        showToast.error('Unable to load team roster right now');
      } finally {
        setIsTeamLoading(false);
      }
    };

    loadTeam();
  }, [router]);

  const {
    data: userAnalyticsData,
    isLoading: isLoadingUserAnalytics,
  } = useQuery({
    queryKey: ['user-analytics'],
    queryFn: async () => {
      const response = await leadAPI.getUserAnalytics();
      return response.data || response;
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
    queryKey: ['overview-analytics', dashboardAcademicYear, dashboardStudentGroup],
    queryFn: async () => {
      const response = await leadAPI.getOverviewAnalytics({
        days: 14,
        ...(dashboardAcademicYear !== '' && { academicYear: dashboardAcademicYear }),
        ...(dashboardStudentGroup && { studentGroup: dashboardStudentGroup }),
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

  const leadsTrend = overviewAnalytics?.daily.leadsCreated ?? [];
  const admissionsTrend = overviewAnalytics?.daily.admissions ?? [];
  const admissionsMap = useMemo(() => {
    const map = new Map<string, number>();
    admissionsTrend.forEach((entry) => {
      map.set(entry.date, entry.count);
    });
    return map;
  }, [admissionsTrend]);

  const leadsAdmissionsData = useMemo(() => {
    return leadsTrend.map((point) => ({
      date: formatDateWithToday(point.date),
      dateKey: point.date,
      isToday: isToday(point.date),
      leads: point.count,
      admissions: admissionsMap.get(point.date) ?? 0,
    }));
  }, [leadsTrend, admissionsMap]);

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

  const joiningProgress = overviewAnalytics?.daily.joiningProgress ?? [];
  const joiningProgressData = useMemo(() => {
    return joiningProgress.map((entry) => ({
      date: formatDateWithToday(entry.date),
      dateKey: entry.date,
      isToday: isToday(entry.date),
      draft: entry.draft,
      pending: entry.pending_approval,
      approved: entry.approved,
    }));
  }, [joiningProgress]);

  const radialJoiningData = [
    {
      name: 'Draft',
      value: overviewAnalytics?.totals.joinings.draft ?? 0,
      fill: '#60a5fa',
    },
    {
      name: 'Pending',
      value: overviewAnalytics?.totals.joinings.pendingApproval ?? 0,
      fill: '#fbbf24',
    },
    {
      name: 'Approved',
      value: overviewAnalytics?.totals.joinings.approved ?? 0,
      fill: '#34d399',
    },
  ];

  const leadStatusData = useMemo(() => {
    if (!overviewAnalytics?.leadStatusBreakdown) return [];
    return Object.entries(overviewAnalytics.leadStatusBreakdown)
      .map(([name, value]) => ({ name, value }))
      .filter((item) => item.value > 0);
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

  const isInitialLoad = !overviewData && isLoadingOverview;
  if (isTeamLoading || isLoadingUserAnalytics || isInitialLoad) {
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
        {isFetchingOverview && (
          <div className="absolute right-0 top-0 z-10 flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-500" />
            Updating…
          </div>
        )}
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
                  <p className={`mt-1 text-2xl font-bold sm:text-3xl ${style.value}`}>
                    {formatNumber(card.value)}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Today's scheduled calls */}
      {/* Today's scheduled calls - Minimal Layout */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-m font-semibold text-slate-900 dark:text-slate-100">Today&apos;s scheduled calls</h2>
          <Link href="/superadmin/leads" className="text-xs font-medium text-orange-600 hover:text-orange-700 dark:text-orange-500">
            View all
          </Link>
        </div>

        {scheduledLeads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
            No calls scheduled for today.
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
            {scheduledLeads.map((lead: { _id: string; name?: string; enquiryNumber?: string; phone?: string; nextScheduledCall?: string; assignedTo?: { name?: string } }) => (
              <li key={lead._id} className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-900 dark:text-slate-100 text-sm truncate">{lead.name ?? '—'}</p>
                    {lead.enquiryNumber && <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-sm">{lead.enquiryNumber}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {lead.nextScheduledCall && (
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
                        {new Date(lead.nextScheduledCall).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {typeof lead.assignedTo === 'object' && lead.assignedTo?.name && (
                      <span>• {lead.assignedTo.name}</span>
                    )}
                  </div>
                </div>
                <Link href={`/superadmin/leads/${lead._id}`}>
                  <button className="flex items-center justify-center h-7 w-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <span className="sr-only">Open</span>
                    <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Charts row 1: Leads vs Admissions + Joining Funnel */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm lg:col-span-2">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Leads vs Admissions</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Trailing 14-day trend. Today is highlighted.
            </p>
          </div>
          <div className="h-72 px-4 pb-4">
            <ResponsiveContainer>
              <AreaChart data={leadsAdmissionsData}>
                <defs>
                  <linearGradient id="leadsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="admissionsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                <Area type="monotone" dataKey="leads" stroke="#3b82f6" fill="url(#leadsGradient)" strokeWidth={2.5} />
                <Area type="monotone" dataKey="admissions" stroke="#22c55e" fill="url(#admissionsGradient)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Joining Funnel Snapshot</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Status breakdown of all joining forms
            </p>
          </div>
          <div className="h-72 px-4 py-4">
            <ResponsiveContainer>
              <RadialBarChart
                cx="50%"
                cy="50%"
                innerRadius="20%"
                outerRadius="90%"
                barSize={22}
                data={radialJoiningData}
              >
                <PolarAngleAxis type="number" domain={[0, Math.max(...radialJoiningData.map((item) => item.value || 1))]} tick={false} />
                <RadialBar background dataKey="value" cornerRadius={16} />
                <Legend iconType="circle" verticalAlign="bottom" height={80} />
                {radialJoiningData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div className="mx-4 mb-4 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
            Approved joining forms become Admissions and get sequential admission numbers.
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
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/50 px-5 py-4 dark:border-slate-800 dark:bg-slate-800/30 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">User Performance Analytics</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Assigned leads and status breakdown per team member.
            </p>
          </div>
          <Link href="/superadmin/users" className="shrink-0">
            <Button size="sm" variant="outline">Manage Users</Button>
          </Link>
        </div>
        <div className="p-5">
          {userAnalytics.length > 0 ? (
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
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No users found. Use User Management to onboard your counselling team.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

