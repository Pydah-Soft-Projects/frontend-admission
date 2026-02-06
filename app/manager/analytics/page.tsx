'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { managerAPI, authAPI } from '@/lib/api';
import { User } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
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
  LineChart,
  Line,
} from 'recharts';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { UserIcon } from '@/components/layout/DashboardShell';

type DatePreset = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'custom';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

export default function ManagerAnalyticsPage() {
  const router = useRouter();
  const { setHeaderContent, clearHeaderContent, setMobileTopBar, clearMobileTopBar } = useDashboardHeader();
  const [user, setUser] = useState<User | null>(null);
  const [datePreset, setDatePreset] = useState<DatePreset>('last30days');
  const [filters, setFilters] = useState({
    startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    const checkAuth = async () => {
      let currentUser = auth.getUser();
      if (!currentUser) {
        router.push('/auth/login');
        return;
      }
      
      // If isManager is undefined, fetch latest user data from backend
      if (currentUser.isManager === undefined) {
        try {
          const userData = await authAPI.getCurrentUser();
          // API client already extracts data, so userData is the user object
          if (userData && userData._id) {
            // Update stored user data
            const token = auth.getToken();
            if (token) {
              auth.setAuth(token, userData);
            }
            currentUser = userData;
          }
        } catch (error) {
          console.error('Failed to fetch current user:', error);
          // Continue with existing user data
        }
      }
      
      // Ensure currentUser is still valid after async operations
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
    };
    
    checkAuth();
  }, [router]);

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
      default:
        return;
    }

    setFilters({
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
    });
  };

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['manager-analytics', filters],
    queryFn: async () => {
      const response = await managerAPI.getAnalytics(filters);
      return response.data || response;
    },
    enabled: !!user,
  });

  useEffect(() => {
    setHeaderContent(
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Team Analytics</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Comprehensive performance metrics for your team
        </p>
      </div>
    );

    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent]);

  useEffect(() => {
    setMobileTopBar({ title: 'Analytics', iconKey: 'analytics' });
    return () => clearMobileTopBar();
  }, [setMobileTopBar, clearMobileTopBar]);

  const statusChartData = analytics?.statusBreakdown
    ? Object.entries(analytics.statusBreakdown).map(([name, value]) => ({
        name,
        value: value as number,
      }))
    : [];

  const teamChartData = analytics?.teamAnalytics
    ? analytics.teamAnalytics.map((member: any) => ({
        name: member.name.length > 10 ? member.name.substring(0, 10) + '...' : member.name,
        fullName: member.name,
        leads: member.totalLeads,
        confirmed: member.confirmedLeads,
        calls: member.todayCalls,
        activities: member.todayActivities,
      }))
    : [];

  const conversionData = useMemo(() => {
    if (!analytics?.teamAnalytics) return [];
    const conversions: Record<string, number> = {};
    analytics.teamAnalytics.forEach((member: any) => {
      if (member.statusConversions) {
        Object.entries(member.statusConversions).forEach(([key, value]) => {
          if (!conversions[key]) {
            conversions[key] = 0;
          }
          conversions[key] += value as number;
        });
      }
    });
    return Object.entries(conversions).map(([name, value]) => ({
      name,
      value,
    }));
  }, [analytics]);

  return (
    <div className="space-y-6">
      {/* Date Presets */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={datePreset === 'today' ? 'primary' : 'outline'}
            onClick={() => handleDatePreset('today')}
          >
            Today
          </Button>
          <Button
            size="sm"
            variant={datePreset === 'yesterday' ? 'primary' : 'outline'}
            onClick={() => handleDatePreset('yesterday')}
          >
            Yesterday
          </Button>
          <Button
            size="sm"
            variant={datePreset === 'last7days' ? 'primary' : 'outline'}
            onClick={() => handleDatePreset('last7days')}
          >
            Last 7 Days
          </Button>
          <Button
            size="sm"
            variant={datePreset === 'last30days' ? 'primary' : 'outline'}
            onClick={() => handleDatePreset('last30days')}
          >
            Last 30 Days
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
            />
          </div>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                {isLoading ? '...' : formatNumber(analytics?.teamAnalytics?.length || 0)}
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Breakdown */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Lead Status Breakdown
          </h3>
          {isLoading ? (
            <Skeleton className="h-64" />
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
            <Skeleton className="h-64" />
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

      {/* Conversion Analytics */}
      {conversionData.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Status Conversions
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={conversionData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#f59e0b" name="Conversions" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Detailed Team Analytics Table */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Detailed Team Analytics
        </h3>
        {isLoading ? (
          <Skeleton className="h-64" />
        ) : analytics?.teamAnalytics && analytics.teamAnalytics.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Name
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
                  <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Status Conversions
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
                    <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-gray-100">
                      {formatNumber(member.totalLeads)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-emerald-600 dark:text-emerald-400 font-semibold">
                      {formatNumber(member.confirmedLeads)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-gray-100">
                      {formatNumber(member.todayCalls)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-900 dark:text-gray-100">
                      {formatNumber(member.todayActivities)}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {member.statusConversions &&
                      Object.keys(member.statusConversions).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(member.statusConversions)
                            .slice(0, 3)
                            .map(([key, value]) => (
                              <span
                                key={key}
                                className="inline-flex px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200"
                              >
                                {key}: {value as number}
                              </span>
                            ))}
                          {Object.keys(member.statusConversions).length > 3 && (
                            <span className="text-xs text-gray-500">
                              +{Object.keys(member.statusConversions).length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">No conversions</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">No team analytics available</div>
        )}
      </Card>
    </div>
  );
}

