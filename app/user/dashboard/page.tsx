'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
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
} from 'recharts';
import { useDashboardHeader } from '@/components/layout/DashboardShell';

interface Analytics {
  totalLeads: number;
  statusBreakdown: Record<string, number>;
  mandalBreakdown: Array<{ mandal: string; count: number }>;
  stateBreakdown: Array<{ state: string; count: number }>;
  recentActivity: {
    leadsUpdatedLast7Days: number;
  };
}

const summaryCardStyles = [
  'from-sky-500/15 via-sky-500/10 to-transparent text-sky-700 dark:text-sky-200 border-sky-200/50 dark:border-sky-500/30',
  'from-teal-500/15 via-teal-500/10 to-transparent text-teal-700 dark:text-teal-200 border-teal-200/50 dark:border-teal-500/30',
  'from-indigo-500/15 via-indigo-500/10 to-transparent text-indigo-700 dark:text-indigo-200 border-indigo-200/50 dark:border-indigo-500/30',
  'from-rose-500/15 via-rose-500/10 to-transparent text-rose-700 dark:text-rose-200 border-rose-200/50 dark:border-rose-500/30',
];

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

const getTodayDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function UserDashboard() {
  const router = useRouter();
  const { theme } = useTheme();
  const { setHeaderContent, clearHeaderContent, setMobileTopBar, clearMobileTopBar } = useDashboardHeader();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthorising, setIsAuthorising] = useState(true);

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

  const {
    data: analyticsData,
    isLoading: isLoadingAnalytics,
  } = useQuery({
    queryKey: ['user-analytics-summary', user?._id],
    queryFn: async () => {
      if (!user?._id) return null;
      const response = await leadAPI.getAnalytics(user._id);
      return response.data || response;
    },
    enabled: !!user?._id,
    staleTime: 60_000,
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
        label: 'Touched (7 days)',
        value: analytics?.recentActivity?.leadsUpdatedLast7Days ?? 0,
        helper: 'Updated recently',
      },
      {
        label: 'New Leads',
        value: analytics?.statusBreakdown?.New ?? 0,
        helper: 'Need first contact',
      },
      {
        label: 'Interested',
        value: analytics?.statusBreakdown?.Interested ?? analytics?.statusBreakdown?.interested ?? 0,
        helper: 'High intent prospects',
      },
    ],
    [analytics]
  );

  const chartColors = useMemo(
    () => ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#14b8a6'],
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

  const stateChartData = useMemo(() => {
    if (!analytics?.stateBreakdown) return [] as Array<{ name: string; value: number }>;
    return analytics.stateBreakdown
      .map((item) => ({ name: item.state, value: item.count }))
      .filter((item) => item.value > 0)
      .slice(0, 8);
  }, [analytics]);

  if (isAuthorising || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <CardSkeleton />
      </div>
    );
  }

  if (isLoadingAnalytics) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <CardSkeleton />
      </div>
    );
  }

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
    <div className="mx-auto w-full max-w-7xl space-y-6 sm:space-y-8 lg:space-y-10 px-0 sm:px-2">
      <div className="grid grid-cols-2 gap-2 sm:gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card, index) => (
          <Card
            key={card.label}
            className={`overflow-hidden border bg-gradient-to-br ${summaryCardStyles[index % summaryCardStyles.length]} p-3 shadow-sm sm:p-5 lg:p-6`}
          >
            <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-slate-500/90 dark:text-slate-400">
              {card.label}
            </p>
            <p className="mt-1 sm:mt-2 text-xl font-semibold text-inherit sm:text-2xl lg:text-3xl">
              {formatNumber(card.value)}
            </p>
            <p className="mt-0.5 sm:mt-2 text-[10px] sm:text-xs text-slate-500/90 dark:text-slate-400">{card.helper}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2 p-3 sm:gap-3 sm:p-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 sm:h-10 sm:w-10">
              <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100 sm:text-lg">Today&apos;s scheduled calls</h2>
                <button
                  type="button"
                  onClick={handleGoToLeads}
                  className="flex shrink-0 items-center justify-center rounded-md p-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="View my leads"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
                Follow-ups for today · Set from lead details after a call
              </p>
            </div>
          </div>
        </div>
        {scheduledLeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 border-t border-slate-100 px-3 py-8 text-center dark:border-slate-800">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <svg className="h-5 w-5 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">No calls scheduled for today</p>
            <Button variant="outline" size="sm" onClick={handleGoToLeads}>
              Go to My Leads
            </Button>
          </div>
        ) : (
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {scheduledLeads.map((lead: { _id: string; name?: string; enquiryNumber?: string; nextScheduledCall?: string }) => {
              const timeStr = lead.nextScheduledCall
                ? new Date(lead.nextScheduledCall).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
                : null;
              return (
                <li key={lead._id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/user/leads/${lead._id}`)}
                    className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-2 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/50 sm:gap-3 sm:px-4"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center self-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 sm:h-9 sm:w-9">
                      <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <div className="min-w-0 overflow-hidden">
                      <p className="break-words font-medium text-slate-900 dark:text-slate-100 line-clamp-2">{lead.name ?? '—'}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        {lead.enquiryNumber && <span>{lead.enquiryNumber}</span>}
                        {lead.enquiryNumber && timeStr && <span className="mx-1">·</span>}
                        {timeStr && <span>{timeStr}</span>}
                      </p>
                    </div>
                    <span className="min-w-[3.5rem] shrink-0 text-right text-xs font-medium text-orange-700 dark:text-orange-300">
                      {timeStr ?? '—'}
                    </span>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full text-slate-400 dark:text-slate-500 sm:h-8 sm:w-8">
                      <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {statusChartData.length > 0 && (
        <Card className="space-y-6 p-6 border-slate-200 shadow-sm bg-white dark:bg-slate-900 dark:border-slate-700">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Lead Status Mix</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Distribution of your assigned leads by status
              </p>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="h-72">
              <ResponsiveContainer>
                <BarChart data={statusChartData}>
                  <CartesianGrid stroke={chartGridColor} strokeDasharray="6 4" />
                  <XAxis
                    dataKey="name"
                    stroke={chartTextColor}
                    tickLine={false}
                    axisLine={{ stroke: chartGridColor }}
                    tick={{ fill: chartTextColor, fontSize: 12 }}
                  />
                  <YAxis
                    stroke={chartTextColor}
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={{ stroke: chartGridColor }}
                    tick={{ fill: chartTextColor, fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: theme === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(59, 130, 246, 0.08)' }}
                  />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                    {statusChartData.map((entry, idx) => (
                      <Cell key={`status-${entry.name}`} fill={chartColors[idx % chartColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-3">
              {statusChartData.map((item) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{item.name}</p>
                    <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{formatNumber(item.value)}</p>
                  </div>
                  <span className="text-xs uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">Leads</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {mandalChartData.length > 0 && (
          <Card className="space-y-6 p-6 border-slate-200 shadow-sm bg-white dark:bg-slate-900 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Top Mandals</h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-72">
                <ResponsiveContainer>
                  <BarChart data={mandalChartData} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid stroke={chartGridColor} strokeDasharray="6 4" />
                    <XAxis
                      type="number"
                      stroke={chartTextColor}
                      tickLine={false}
                      axisLine={{ stroke: chartGridColor }}
                      tick={{ fill: chartTextColor, fontSize: 12 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      stroke={chartTextColor}
                      tickLine={false}
                      axisLine={{ stroke: chartGridColor }}
                      tick={{ fill: chartTextColor, fontSize: 12 }}
                      width={110}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: theme === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(59, 130, 246, 0.08)' }}
                    />
                    <Bar dataKey="value" radius={[0, 12, 12, 0]}>
                      {mandalChartData.map((entry, idx) => (
                        <Cell key={`mandal-${entry.name}`} fill={chartColors[idx % chartColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {mandalChartData.map((item, idx) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3"
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

        {stateChartData.length > 0 && (
          <Card className="space-y-6 p-6 border-slate-200 shadow-sm bg-white dark:bg-slate-900 dark:border-slate-700">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Leads by State</h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-72">
                <ResponsiveContainer>
                  <PieChart>
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: theme === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(59, 130, 246, 0.08)' }}
                    />
                    <Pie
                      data={stateChartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={4}
                    >
                      {stateChartData.map((entry, idx) => (
                        <Cell key={`state-${entry.name}`} fill={chartColors[idx % chartColors.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {stateChartData.map((item, idx) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3"
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

