'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { managerAPI, leadAPI } from '@/lib/api';
import { User } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CardSkeleton } from '@/components/ui/Skeleton';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
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
  LineChart,
  Line,
  Legend,
} from 'recharts';
import Link from 'next/link';
import { UserIcon } from '@/components/layout/DashboardShell';

const COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4'];

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

const getTodayDateString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function ManagerDashboard() {
  const router = useRouter();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const [user, setUser] = useState<User | null>(null);
  const [isAuthorising, setIsAuthorising] = useState(true);

  useEffect(() => {
    const currentUser = auth.getUser();
    if (!currentUser) {
      router.push('/auth/login');
      return;
    }
    // Check if user is a manager - explicitly check for true
    if (currentUser.isManager !== true) {
      if (currentUser.roleName === 'Super Admin' || currentUser.roleName === 'Sub Super Admin') {
        router.push('/superadmin/dashboard');
      } else {
        router.push('/user/dashboard');
      }
      return;
    }
    setUser(currentUser);
    setIsAuthorising(false);
  }, [router]);

  useEffect(() => {
    setHeaderContent(
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Manager Dashboard
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Overview of your team's performance and leads
        </p>
      </div>
    );

    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent]);

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['manager-analytics'],
    queryFn: async () => {
      const response = await managerAPI.getAnalytics();
      // API client already extracts data, so response is the analytics object
      return response;
    },
  });

  const { data: teamData } = useQuery({
    queryKey: ['manager-team'],
    queryFn: async () => {
      const response = await managerAPI.getTeamMembers();
      return response.data || response;
    },
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

  if (isAuthorising) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  const statusChartData = analytics?.statusBreakdown
    ? Object.entries(analytics.statusBreakdown).map(([name, value]) => ({
        name,
        value: value as number,
      }))
    : [];

  const teamChartData = analytics?.teamAnalytics
    ? analytics.teamAnalytics.map((member: any) => ({
        name: member.name,
        leads: member.totalLeads,
        confirmed: member.confirmedLeads,
        calls: member.todayCalls,
      }))
    : [];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Leads</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {isLoading ? '...' : formatNumber(analytics?.totalLeads || 0)}
              </p>
            </div>
            <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <UserIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Confirmed Leads</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {isLoading ? '...' : formatNumber(analytics?.confirmedLeads || 0)}
              </p>
            </div>
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <div className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                ✓
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Team Members</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {isLoading ? '...' : formatNumber(teamData?.length || 0)}
              </p>
            </div>
            <div className="p-3 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
              <UserIcon className="w-6 h-6 text-violet-600 dark:text-violet-400" />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Unfollowed Leads</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {isLoading ? '...' : formatNumber(analytics?.unfollowedCount || 0)}
              </p>
            </div>
            <div className="p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <div className="w-6 h-6 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                !
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Today&apos;s scheduled calls</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Your follow-up calls for today. Set from lead details after a call.
            </p>
          </div>
          <Link href="/manager/leads">
            <Button variant="outline" size="sm">View leads</Button>
          </Link>
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
                <Link href={`/manager/leads/${lead._id}`}>
                  <Button variant="outline" size="sm">Open</Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Breakdown */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Lead Status Breakdown
          </h3>
          {isLoading ? (
            <CardSkeleton className="h-64" />
          ) : statusChartData.length > 0 ? (
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
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No data available
            </div>
          )}
        </Card>

        {/* Team Performance */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Team Performance
          </h3>
          {isLoading ? (
            <CardSkeleton className="h-64" />
          ) : teamChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={teamChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="leads" fill="#3b82f6" name="Total Leads" />
                <Bar dataKey="confirmed" fill="#10b981" name="Confirmed" />
                <Bar dataKey="calls" fill="#8b5cf6" name="Today's Calls" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No team data available
            </div>
          )}
        </Card>
      </div>

      {/* Team Analytics Table */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Team Member Analytics
          </h3>
          <Link href="/manager/team">
            <Button size="sm" variant="primary">
              View Team
            </Button>
          </Link>
        </div>
        {isLoading ? (
          <CardSkeleton className="h-64" />
        ) : analytics?.teamAnalytics && analytics.teamAnalytics.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Name
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Role
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Total Leads
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Confirmed
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Today's Calls
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Today's Activities
                  </th>
                </tr>
              </thead>
              <tbody>
                {analytics.teamAnalytics.map((member: any) => (
                  <tr
                    key={member.userId}
                    className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100">
                      {member.name}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {member.roleName}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-gray-100">
                      {formatNumber(member.totalLeads)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-emerald-600 dark:text-emerald-400">
                      {formatNumber(member.confirmedLeads)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-gray-100">
                      {formatNumber(member.todayCalls)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-gray-100">
                      {formatNumber(member.todayActivities)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">No team members found</div>
        )}
      </Card>

      {/* Unfollowed Leads */}
      {analytics?.unfollowedLeads && analytics.unfollowedLeads.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Unfollowed Leads ({analytics.unfollowedCount})
            </h3>
            <Link href="/manager/unfollowed">
              <Button size="sm" variant="primary">
                View All
              </Button>
            </Link>
          </div>
          <div className="space-y-2">
            {analytics.unfollowedLeads.slice(0, 5).map((lead: any) => (
              <div
                key={lead._id}
                className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {lead.name} - {lead.phone}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {lead.enquiryNumber} · Assigned to:{' '}
                    {typeof lead.assignedTo === 'object'
                      ? lead.assignedTo?.name
                      : 'Unknown'}
                  </p>
                </div>
                <Link href={`/manager/leads/${lead._id}`}>
                  <Button size="sm" variant="outline">
                    View
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/manager/leads">
          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              View All Leads
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Manage all leads assigned to you and your team
            </p>
          </Card>
        </Link>
        <Link href="/manager/analytics">
          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Detailed Analytics
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              View comprehensive team performance metrics
            </p>
          </Card>
        </Link>
        <Link href="/manager/team">
          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Manage Team
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              View and manage your team members
            </p>
          </Card>
        </Link>
      </div>
    </div>
  );
}

