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

const summaryCardStyles = [
  'from-blue-500/10 via-blue-500/15 to-transparent text-blue-700 dark:text-blue-200',
  'from-emerald-500/10 via-emerald-500/15 to-transparent text-emerald-700 dark:text-emerald-200',
  'from-rose-500/10 via-rose-500/15 to-transparent text-rose-700 dark:text-rose-200',
  'from-violet-500/10 via-violet-500/15 to-transparent text-violet-700 dark:text-violet-200',
  'from-amber-500/10 via-amber-500/15 to-transparent text-amber-700 dark:text-amber-200',
  'from-indigo-500/10 via-indigo-500/15 to-transparent text-indigo-700 dark:text-indigo-200',
];

const STUDENT_GROUP_OPTIONS = ['10th', 'Inter-MPC', 'Inter-BIPC', 'Degree', 'Diploma'];

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
      label: 'Assigned Leads',
      value: overviewAnalytics?.totals.assignedLeads ?? 0,
      helper: 'Assigned to team members',
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
    {
      label: 'Admitted Leads',
      value: overviewAnalytics?.totals.admittedLeads ?? 0,
      helper: 'Converted via workflows',
    },
  ]), [overviewAnalytics]);

  const userAnalytics = userAnalyticsData?.users || [];

  if (isTeamLoading || isLoadingOverview || isLoadingUserAnalytics) {
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
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            Super Admin Dashboard
          </h1>
          <p className="mt-2 text-base text-slate-600 dark:text-slate-300">
            Comprehensive analytics and insights for lead management, admissions, and team performance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <span>Academic Year:</span>
            <select
              value={dashboardAcademicYear === '' ? '' : dashboardAcademicYear}
              onChange={(e) => setDashboardAcademicYear(e.target.value ? Number(e.target.value) : '')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">All</option>
              {academicYearOptions.map((y: number) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <span>Student Group:</span>
            <select
              value={dashboardStudentGroup}
              onChange={(e) => setDashboardStudentGroup(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="">All</option>
              {STUDENT_GROUP_OPTIONS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </label>
          <Link href="/superadmin/leads/individual">
            <Button variant="primary">Create Individual Lead</Button>
          </Link>
          <Link href="/superadmin/users">
            <Button variant="outline">Manage Users</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 lg:grid-cols-6">
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

      <Card className="space-y-4 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Today&apos;s scheduled calls</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Leads with a follow-up call scheduled for today. Set from lead details after a call.
            </p>
          </div>
          <Link href="/superadmin/leads">
            <Button variant="outline" size="sm">View all leads</Button>
          </Link>
        </div>
        {scheduledLeads.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-4">No calls scheduled for today.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700 max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
            {scheduledLeads.map((lead: { _id: string; name?: string; enquiryNumber?: string; phone?: string; nextScheduledCall?: string; assignedTo?: { name?: string } }) => (
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
                    {typeof lead.assignedTo === 'object' && lead.assignedTo?.name && (
                      <span className="ml-2">→ {lead.assignedTo.name}</span>
                    )}
                  </p>
                </div>
                <Link href={`/superadmin/leads/${lead._id}`}>
                  <Button variant="outline" size="sm">Open</Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 space-y-6 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Leads vs Admissions</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Trailing 14-day trend including today's live data. Today is highlighted.
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

        <Card className="space-y-6 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Joining Funnel Snapshot</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Current status breakdown of all joining forms
            </p>
          </div>
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
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Status Change Velocity</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Daily status changes including today's live data. Today is highlighted.
            </p>
          </div>
          <div className="h-72">
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

        <Card className="space-y-6 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Lead Pool Composition</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Distribution of leads by status
              </p>
            </div>
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

      <Card className="space-y-6 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">User Performance Analytics</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Track assigned leads and status breakdown for each team member.
            </p>
          </div>
          <Link href="/superadmin/users">
            <Button size="sm" variant="outline">
              Manage Users
            </Button>
          </Link>
        </div>
        {userAnalytics.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {userAnalytics.map((user: any) => {
              const statusEntries = Object.entries(user.statusBreakdown || {}).filter(([_, count]) => (count as number) > 0);
              return (
                <div
                  key={user.userId}
                  className="rounded-2xl border border-white/70 bg-white/80 p-5 shadow-sm shadow-blue-100/30 backdrop-blur dark:border-slate-800/60 dark:bg-slate-900/60 dark:shadow-none"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{user.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{user.email}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        user.isActive
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
          <div className="text-center py-8">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No users found. Use the User Management module to onboard your counselling team.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

