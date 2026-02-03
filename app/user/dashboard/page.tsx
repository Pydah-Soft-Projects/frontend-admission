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
  'from-blue-500/10 via-blue-500/15 to-transparent text-blue-700 dark:text-blue-200',
  'from-emerald-500/10 via-emerald-500/15 to-transparent text-emerald-700 dark:text-emerald-200',
  'from-violet-500/10 via-violet-500/15 to-transparent text-violet-700 dark:text-violet-200',
  'from-amber-500/10 via-amber-500/15 to-transparent text-amber-700 dark:text-amber-200',
];

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

const getTodayDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function UserDashboard() {
  const router = useRouter();
  const { theme } = useTheme();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
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
  const scheduledLeads = Array.isArray(scheduledLeadsData) ? scheduledLeadsData : [];

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
    <div className="mx-auto w-full max-w-7xl space-y-10">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card, index) => (
          <Card
            key={card.label}
            className={`overflow-hidden border border-white/60 bg-gradient-to-br ${summaryCardStyles[index % summaryCardStyles.length]} p-6 shadow-lg shadow-blue-100/40 dark:border-slate-800/60 dark:shadow-none`}
          >
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500/80 dark:text-slate-400/80">
              {card.label}
            </p>
            <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">
              {formatNumber(card.value)}
            </p>
            <p className="mt-2 text-xs text-slate-500/90 dark:text-slate-400/90">{card.helper}</p>
          </Card>
        ))}
      </div>

      <Card className="space-y-4 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Today&apos;s scheduled calls</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Your follow-up calls for today. Set from lead details after a call.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleGoToLeads}>View my leads</Button>
        </div>
        {scheduledLeads.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-4">No calls scheduled for today.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700 max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
            {scheduledLeads.map((lead: { _id: string; name?: string; enquiryNumber?: string; nextScheduledCall?: string }) => (
              <li key={lead._id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{lead.name ?? '—'}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {lead.enquiryNumber && <span>{lead.enquiryNumber}</span>}
                    {lead.nextScheduledCall && (
                      <span className="ml-2">
                        {new Date(lead.nextScheduledCall).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => router.push(`/user/leads/${lead._id}`)}>Open</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {statusChartData.length > 0 && (
        <Card className="space-y-6 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
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
                  className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 dark:border-slate-800/70 dark:bg-slate-900/60"
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
          <Card className="space-y-6 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
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
                    className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 dark:border-slate-800/70 dark:bg-slate-900/60"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: chartColors[idx % chartColors.length] }}
                      />
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{item.name}</span>
                    </div>
                    <span className="text-base font-semibold text-blue-600 dark:text-blue-300">{formatNumber(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {stateChartData.length > 0 && (
          <Card className="space-y-6 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
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
                    className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 dark:border-slate-800/70 dark:bg-slate-900/60"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: chartColors[idx % chartColors.length] }}
                      />
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{item.name}</span>
                    </div>
                    <span className="text-base font-semibold text-blue-600 dark:text-blue-300">{formatNumber(item.value)}</span>
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

