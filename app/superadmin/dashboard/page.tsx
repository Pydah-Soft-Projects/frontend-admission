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
import { CardSkeleton } from '@/components/ui/Skeleton';
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

const summaryCardStyles = [
  'from-blue-500/10 via-blue-500/15 to-transparent text-blue-700 dark:text-blue-200',
  'from-emerald-500/10 via-emerald-500/15 to-transparent text-emerald-700 dark:text-emerald-200',
  'from-violet-500/10 via-violet-500/15 to-transparent text-violet-700 dark:text-violet-200',
  'from-amber-500/10 via-amber-500/15 to-transparent text-amber-700 dark:text-amber-200',
];

export default function SuperAdminDashboard() {
  const router = useRouter();
  const { theme } = useTheme();
  const [team, setTeam] = useState<User[]>([]);
  const [isTeamLoading, setIsTeamLoading] = useState(true);

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
        setTeam(response.data || response);
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
    data: overviewData,
    isLoading: isLoadingOverview,
  } = useQuery({
    queryKey: ['overview-analytics'],
    queryFn: async () => {
      const response = await leadAPI.getOverviewAnalytics({ days: 14 });
      return response.data || response;
    },
    staleTime: 120_000,
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

  const leadsAdmissionsData = leadsTrend.map((point) => ({
    date: formatShortDate(point.date),
    leads: point.count,
    admissions: admissionsMap.get(point.date) ?? 0,
  }));

  const statusChanges = overviewAnalytics?.daily.statusChanges ?? [];
  const statusKeys = useMemo(() => {
    const collector = new Set<string>();
    statusChanges.forEach((entry) => {
      Object.keys(entry.statuses || {}).forEach((key) => {
        if (key !== 'total') collector.add(key);
      });
    });
    return Array.from(collector).slice(0, 4);
  }, [statusChanges]);

  const statusChangeData = statusChanges.map((entry) => {
    const row: Record<string, number | string> = { date: formatShortDate(entry.date) };
    statusKeys.forEach((key) => {
      row[key] = entry.statuses?.[key] ?? 0;
    });
    return row;
  });

  const joiningProgress = overviewAnalytics?.daily.joiningProgress ?? [];
  const joiningProgressData = joiningProgress.map((entry) => ({
    date: formatShortDate(entry.date),
    draft: entry.draft,
    pending: entry.pending_approval,
    approved: entry.approved,
  }));

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
      label: 'Confirmed Leads',
      value: overviewAnalytics?.totals.confirmedLeads ?? 0,
      helper: 'Awaiting joining forms',
    },
    {
      label: 'Admissions',
      value: overviewAnalytics?.totals.admissions ?? 0,
      helper: 'Approved & enrolled',
    },
    {
      label: 'Admitted Leads',
      value: overviewAnalytics?.totals.admittedLeads ?? 0,
      helper: 'Converted via workflows',
    },
  ]), [overviewAnalytics]);

  const activeUsers = useMemo(() => {
    const sorted = [...team].sort((a, b) => Number(b.isActive) - Number(a.isActive));
    return sorted.slice(0, 6);
  }, [team]);

  if (isTeamLoading || isLoadingOverview) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Super Admin Overview
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Monitor lead momentum, joining velocity, and admissions in one elegant glance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/superadmin/leads/individual">
            <Button variant="primary">Create Individual Lead</Button>
          </Link>
          <Link href="/superadmin/users">
            <Button variant="outline">Manage Users</Button>
          </Link>
        </div>
      </div>

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
            <p className="mt-2 text-xs text-slate-500/90 dark:text-slate-400/90">
              {card.helper}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 space-y-6 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Leads vs Admissions</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Trailing 14-day trend comparing captured leads to approved admissions.
              </p>
            </div>
          </div>
          <div className="h-72">
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
                <XAxis dataKey="date" stroke={chartTextColor} tick={{ fill: chartTextColor }} />
                <YAxis stroke={chartTextColor} tick={{ fill: chartTextColor }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Area type="monotone" dataKey="leads" stroke="#3b82f6" fill="url(#leadsGradient)" strokeWidth={2.5} />
                <Area type="monotone" dataKey="admissions" stroke="#22c55e" fill="url(#admissionsGradient)" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="space-y-6 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Joining Funnel Snapshot</h2>
          <div className="h-72">
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
          <div className="rounded-2xl bg-slate-50/80 p-4 text-sm text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
            Approved joining forms are promoted to Admissions automatically, generating admission numbers sequentially.
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-6 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Status Change Velocity</h2>
          <div className="h-72">
            <ResponsiveContainer>
              <LineChart data={statusChangeData}>
                <CartesianGrid strokeDasharray="6 4" stroke={chartGridColor} />
                <XAxis dataKey="date" stroke={chartTextColor} tick={{ fill: chartTextColor }} />
                <YAxis stroke={chartTextColor} tick={{ fill: chartTextColor }} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                {statusKeys.map((status, index) => (
                  <Line
                    key={status}
                    type="monotone"
                    dataKey={status}
                    strokeWidth={2}
                    stroke={['#3b82f6', '#22c55e', '#f97316', '#a855f7'][index % 4]}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="space-y-6 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Lead Pool Composition</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
              {leadStatusData.length} statuses
            </span>
          </div>
          <div className="h-72">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={leadStatusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={4}
                >
                  {leadStatusData.map((entry, index) => (
                    <Cell
                      key={entry.name}
                      fill={['#2563eb', '#16a34a', '#f97316', '#7c3aed', '#f59e0b', '#ef4444'][index % 6]}
                    />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(value: number) => formatNumber(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card className="space-y-6 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Team Snapshot</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Quick glance at the counsellor roster. Dive deeper from the User Management module.
            </p>
          </div>
          <Link href="/superadmin/users">
            <Button size="sm" variant="outline">
              View all users
            </Button>
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {activeUsers.map((member) => (
            <div
              key={member._id}
              className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm shadow-blue-100/30 backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/60 dark:shadow-none"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{member.name}</p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    member.isActive
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200'
                  }`}
                >
                  {member.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{member.email}</p>
              <p className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                {member.roleName}
              </p>
            </div>
          ))}
          {activeUsers.length === 0 && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No users found. Use the User Management module to onboard your counselling team.
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}

