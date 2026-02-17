'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { leadAPI } from '@/lib/api';
import { User } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useTheme } from '@/app/providers';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  Legend,
  LabelList,
} from 'recharts';
import { useDashboardHeader } from '@/components/layout/DashboardShell';

interface Analytics {
  totalLeads: number;
  statusBreakdown: Record<string, number>;
  mandalBreakdown: Array<{ mandal: string; count: number }>;
  stateBreakdown: Array<{ state: string; count: number }>;
  studentGroupBreakdown: Array<{ group: string; count: number }>;
  recentActivity: {
    leadsUpdatedLast7Days: number;
  };
}

const STATS_CARD_STYLES = [
  'from-orange-500 to-orange-600 shadow-orange-500/25',
  'from-amber-500 to-amber-600 shadow-amber-500/25',
  'from-emerald-500 to-teal-600 shadow-emerald-500/25',
  'from-slate-500 to-slate-600 shadow-slate-500/25',
];

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

const getTodayDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const currentYear = new Date().getFullYear();
const DEFAULT_ACADEMIC_YEARS = [currentYear, currentYear - 1, currentYear - 2];
const STUDENT_GROUP_OPTIONS = ['10th', 'Inter', 'Inter-MPC', 'Inter-BIPC', 'Degree', 'Diploma'];

export default function UserDashboard() {
  const router = useRouter();
  const { theme } = useTheme();
  const { setHeaderContent, clearHeaderContent, setMobileTopBar, clearMobileTopBar } = useDashboardHeader();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthorising, setIsAuthorising] = useState(true);
  const [dashboardAcademicYear, setDashboardAcademicYear] = useState<number | ''>(currentYear);
  const [dashboardStudentGroup, setDashboardStudentGroup] = useState<string>('');

  useEffect(() => {
    const currentUser = auth.getUser();
    if (!currentUser) {
      router.push('/auth/login');
      return;
    }
    if (currentUser.roleName === 'Super Admin' || currentUser.roleName === 'Sub Super Admin') {
      router.push('/superadmin/dashboard');
      return;
    }
    setUser(currentUser);
    setIsAuthorising(false);
  }, [router]);

  const handleGoToLeads = useCallback(() => {
    router.push('/user/leads');
  }, [router]);

  useEffect(() => {
    setHeaderContent(
      <div className="flex flex-col items-end gap-2 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Welcome, {user?.designation || user?.name || 'Counsellor'}
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Snapshot of your assigned leads{user?.designation ? ` · ${user.designation}` : user?.name ? ` · ${user.name}` : ''}
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={handleGoToLeads}>
            View My Leads
          </Button>
        </div>
      </div>
    );

    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent, handleGoToLeads, user?.name]);

  useEffect(() => {
    setMobileTopBar({ title: 'Dashboard', iconKey: 'dashboard' });
    return () => clearMobileTopBar();
  }, [setMobileTopBar, clearMobileTopBar]);

  const { data: filterOptionsData } = useQuery({
    queryKey: ['filterOptions'],
    queryFn: () => leadAPI.getFilterOptions(),
    staleTime: 120_000,
  });
  const filterOptions = filterOptionsData?.data || filterOptionsData;
  const academicYearOptions = filterOptions?.academicYears?.length
    ? filterOptions.academicYears
    : DEFAULT_ACADEMIC_YEARS;
  const studentGroupOptions = filterOptions?.studentGroups?.length
    ? filterOptions.studentGroups
    : STUDENT_GROUP_OPTIONS;

  const {
    data: analyticsData,
    isLoading: isLoadingAnalytics,
  } = useQuery({
    queryKey: ['user-analytics-summary', user?._id, dashboardAcademicYear, dashboardStudentGroup],
    queryFn: async () => {
      if (!user?._id) return null;
      const response = await leadAPI.getAnalytics(user._id, {
        ...(dashboardAcademicYear !== '' && { academicYear: dashboardAcademicYear }),
        ...(dashboardStudentGroup && { studentGroup: dashboardStudentGroup }),
      });
      return response.data || response;
    },
    enabled: !!user?._id,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const todayStr = getTodayDateString();
  const { data: scheduledLeadsData } = useQuery({
    queryKey: ['leads', 'scheduled', todayStr],
    queryFn: async () => {
      const res = await leadAPI.getAll({ scheduledOn: todayStr, limit: 50 });
      return res?.leads ?? [];
    },
    enabled: !!user?._id,
    staleTime: 60_000,
  });
  const scheduledLeads = useMemo(() => {
    const list = Array.isArray(scheduledLeadsData) ? scheduledLeadsData : [];
    return [...list].sort((a, b) => {
      const tA = a.nextScheduledCall ? new Date(a.nextScheduledCall).getTime() : 0;
      const tB = b.nextScheduledCall ? new Date(b.nextScheduledCall).getTime() : 0;
      return tA - tB;
    });
  }, [scheduledLeadsData]);

  const analytics = (analyticsData?.data || analyticsData) as Analytics | null;

  const chartGridColor = theme === 'dark' ? 'rgba(148, 163, 184, 0.2)' : '#e2e8f0';
  const chartTextColor = theme === 'dark' ? '#cbd5f5' : '#475569';

  const tooltipStyle = useMemo(
    () => ({
      backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
      color: theme === 'dark' ? '#f8fafc' : '#1f2937',
      borderRadius: '12px',
      border:
        theme === 'dark'
          ? '1px solid rgba(148, 163, 184, 0.35)'
          : '1px solid rgba(148, 163, 184, 0.2)',
      boxShadow:
        theme === 'dark'
          ? '0 12px 36px rgba(15, 23, 42, 0.45)'
          : '0 12px 36px rgba(15, 23, 42, 0.12)',
      padding: '12px',
    }),
    [theme]
  );

  const summaryCards = useMemo(
    () => [
      {
        label: 'Assigned Leads',
        value: analytics?.totalLeads ?? 0,
        helper: 'Allotted to you',
      },
      {
        label: 'Interested',
        value: analytics?.statusBreakdown?.Interested ?? analytics?.statusBreakdown?.interested ?? 0,
        helper: 'High intent',
      },
      {
        label: 'Confirmed',
        value: analytics?.statusBreakdown?.Confirmed ?? analytics?.statusBreakdown?.confirmed ?? 0,
        helper: 'Joined',
      },
      {
        label: 'Not Interested',
        value: analytics?.statusBreakdown?.['Not Interested'] ?? analytics?.statusBreakdown?.['Not interested'] ?? 0,
        helper: 'Declined',
      },
    ],
    [analytics]
  );

  const chartColors = useMemo(
    () => [
      '#3b82f6', // Blue
      '#10b981', // Emerald
      '#8b5cf6', // Violet
      '#f59e0b', // Amber
      '#ec4899', // Pink
      '#06b6d4', // Cyan
      '#f43f5e', // Rose
      '#6366f1', // Indigo
    ],
    []
  );

  const statusChartData = useMemo(() => {
    if (!analytics?.statusBreakdown) return [] as Array<{ name: string; value: number }>;
    return Object.entries(analytics.statusBreakdown)
      .map(([status, count]) => ({
        name: status,
        value: typeof count === 'number' ? count : Number(count) || 0,
      }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [analytics]);

  const mandalChartData = useMemo(() => {
    if (!analytics?.mandalBreakdown) return [] as Array<{ name: string; value: number }>;
    return analytics.mandalBreakdown
      .map((item) => ({ name: item.mandal, value: item.count }))
      .filter((item) => item.value > 0)
      .slice(0, 6);
  }, [analytics]);

  const studentGroupChartData = useMemo(() => {
    if (!analytics?.studentGroupBreakdown) return [] as Array<{ name: string; value: number }>;
    return analytics.studentGroupBreakdown
      .map((item) => ({ name: item.group || 'Unknown', value: item.count }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [analytics]);

  const totalForDonut = useMemo(
    () => statusChartData.reduce((sum, d) => sum + d.value, 0),
    [statusChartData]
  );

  if (isAuthorising || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <CardSkeleton />
      </div>
    );
  }

  // Removed blocking isLoadingAnalytics check to allow progressive loading
  // if (isLoadingAnalytics) { return ... } is gone. 
  // analytics will persist from previous data thanks to keepPreviousData

  if (!analytics) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <Card className="p-10 text-center">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">No analytics available yet</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Once you start working on leads, your performance insights will appear here automatically.
          </p>
          <div className="mt-6 flex justify-center">
            <Button variant="primary" onClick={handleGoToLeads}>
              Go to My Leads
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 sm:space-y-6 px-0 sm:px-2 pt-1 pb-2 sm:pt-0 sm:pb-0">
      {/* Filters: full width, single row, compact, no background */}
      <div className="w-full flex flex-nowrap items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 sm:flex-initial">
          <label className="text-[10px] sm:text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">Year</label>
          <select
            value={dashboardAcademicYear === '' ? '' : dashboardAcademicYear}
            onChange={(e) => setDashboardAcademicYear(e.target.value === '' ? '' : Number(e.target.value))}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] sm:text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-500 flex-1 min-w-0 sm:w-24 max-w-full"
          >
            <option value="">All</option>
            {academicYearOptions.map((y: number) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1.5 min-w-0 flex-1 sm:flex-initial">
          <label className="text-[10px] sm:text-xs font-medium text-slate-500 whitespace-nowrap shrink-0">Group</label>
          <select
            value={dashboardStudentGroup}
            onChange={(e) => setDashboardStudentGroup(e.target.value)}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] sm:text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-500 flex-1 min-w-0 sm:w-28 max-w-full"
          >
            <option value="">All</option>
            {studentGroupOptions.map((g: string) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Compact stats: Assigned, Interested, Admitted, Not Interested */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {summaryCards.map((card, index) => (
          <div
            key={card.label}
            className={`overflow-hidden rounded-xl border-0 bg-gradient-to-br ${STATS_CARD_STYLES[index % STATS_CARD_STYLES.length]} p-3 sm:p-4 shadow-md flex flex-col justify-center min-h-[72px] sm:min-h-[80px]`}
          >
            <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-white/85">
              {card.label}
            </p>
            <p className="mt-0.5 sm:mt-1 text-lg sm:text-xl font-bold text-white drop-shadow-sm">
              {formatNumber(card.value)}
            </p>
            <p className="mt-0.5 text-[10px] sm:text-xs text-white/75">{card.helper}</p>
          </div>
        ))}
      </div>

      {/* Today's scheduled calls - full width, responsive grid */}
      {/* Today's scheduled calls - simple list, no card background */}
      <div className="w-full space-y-3 pt-2">
        <div className="flex items-center gap-3 px-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-100 to-amber-100 text-orange-600 dark:from-orange-900/40 dark:to-amber-900/30 dark:text-orange-400">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Today&apos;s scheduled calls</h2>
        </div>

        {scheduledLeads.length === 0 ? (
          <div className="px-4 py-6 text-center rounded-xl border border-slate-100 bg-white/50 dark:border-slate-800 dark:bg-slate-900/50">
            <p className="text-sm font-medium text-slate-500">No calls scheduled for today.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
            {scheduledLeads.map((lead: { _id: string; name?: string; enquiryNumber?: string; nextScheduledCall?: string }) => {
              const timeStr = lead.nextScheduledCall
                ? new Date(lead.nextScheduledCall).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                : null;
              return (
                <button
                  key={lead._id}
                  type="button"
                  onClick={() => router.push(`/user/leads/${lead._id}`)}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-orange-300 hover:shadow-md active:scale-[0.99] dark:border-slate-700 dark:bg-slate-800 dark:hover:border-orange-700/50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 font-bold text-sm">
                    {(lead.name || '?').charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900 dark:text-slate-100 text-sm">{lead.name ?? '—'}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{lead.enquiryNumber ?? '—'}</span>
                      {timeStr && (
                        <>
                          <span>•</span>
                          <span className="text-orange-600 dark:text-orange-400 font-medium">{timeStr}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Status distribution: donut chart with filters (same row, no filter background) */}
      {statusChartData.length > 0 && (
        <Card className="border-slate-200 shadow-sm bg-white dark:bg-slate-900 dark:border-slate-700 p-3 sm:p-5">
          <h2 className="text-sm sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2 sm:mb-4 px-1">Lead Status</h2>
          <div className="grid gap-2 sm:gap-6 lg:grid-cols-2 lg:items-center">
            {/* Chart Section */}
            <div className="h-52 sm:h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => [formatNumber(value), 'Leads']}
                  />
                  <Pie
                    data={statusChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="45%"
                    outerRadius="80%"
                    paddingAngle={2}
                    labelLine={false}
                    label={({
                      cx,
                      cy,
                      midAngle,
                      innerRadius,
                      outerRadius,
                      percent,
                    }: any) => {
                      if (percent < 0.05) return null;
                      const RADIAN = Math.PI / 180;
                      const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                      const x = cx + radius * Math.cos(-midAngle * RADIAN);
                      const y = cy + radius * Math.sin(-midAngle * RADIAN);
                      return (
                        <text
                          x={x}
                          y={y}
                          fill="white"
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="text-[10px] font-bold"
                        >
                          {`${(percent * 100).toFixed(0)}%`}
                        </text>
                      );
                    }}
                  >
                    {statusChartData.map((entry, idx) => (
                      <Cell key={`status-${entry.name}`} fill={chartColors[idx % chartColors.length]} />
                    ))}
                  </Pie>
                  {/* Center total */}
                  <text
                    x="50%"
                    y="50%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-slate-900 dark:fill-slate-100 font-bold text-2xl"
                  >
                    {formatNumber(totalForDonut)}
                  </text>
                  <text
                    x="50%"
                    y="50%"
                    dy={20}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-slate-500 dark:fill-slate-400 text-xs font-medium uppercase tracking-wider"
                  >
                    Total
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend Section */}
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {statusChartData.map((item, idx) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 sm:gap-3">
                      <span
                        className="h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: chartColors[idx % chartColors.length] }}
                      />
                      <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 truncate">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="block text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100">{formatNumber(item.value)}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        {Math.round((item.value / totalForDonut) * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {mandalChartData.length > 0 && (
          <Card className="space-y-4 sm:space-y-6 p-4 sm:p-6 border-slate-200 shadow-sm bg-white dark:bg-slate-900 dark:border-slate-700">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">Top Mandals</h2>
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
              <div className="h-[200px] sm:h-64 lg:h-72 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mandalChartData} layout="vertical" margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
                    <CartesianGrid stroke={chartGridColor} strokeDasharray="6 4" />
                    <XAxis
                      type="number"
                      stroke={chartTextColor}
                      tickLine={false}
                      axisLine={{ stroke: chartGridColor }}
                      tick={{ fill: chartTextColor, fontSize: 10 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke={chartTextColor}
                      tickLine={false}
                      axisLine={{ stroke: chartGridColor }}
                      tick={{ fill: chartTextColor, fontSize: 10 }}
                      width={80}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: theme === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(249, 115, 22, 0.08)' }}
                    />
                    <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                      {mandalChartData.map((entry, idx) => (
                        <Cell key={`mandal-${entry.name}`} fill={chartColors[idx % chartColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 sm:space-y-3">
                {mandalChartData.map((item, idx) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 px-3 py-2.5 sm:px-4 sm:py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: chartColors[idx % chartColors.length] }}
                      />
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{item.name}</span>
                    </div>
                    <span className="text-base font-semibold text-orange-600 dark:text-orange-300">{formatNumber(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {studentGroupChartData.length > 0 && (
          <Card className="space-y-4 sm:space-y-6 p-4 sm:p-6 border-slate-200 shadow-sm bg-white dark:bg-slate-900 dark:border-slate-700">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">Student Group Distribution</h2>
            <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
              <div className="h-[200px] sm:h-64 lg:h-72 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: theme === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(249, 115, 22, 0.08)' }}
                    />
                    <Pie
                      data={studentGroupChartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="50%"
                      outerRadius="75%"
                      paddingAngle={4}
                    >
                      {studentGroupChartData.map((entry, idx) => (
                        <Cell key={`group-${entry.name}`} fill={chartColors[idx % chartColors.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 sm:space-y-3">
                {studentGroupChartData.map((item, idx) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 px-3 py-2.5 sm:px-4 sm:py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: chartColors[idx % chartColors.length] }}
                      />
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{item.name}</span>
                    </div>
                    <span className="text-base font-semibold text-orange-600 dark:text-orange-300">{formatNumber(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

