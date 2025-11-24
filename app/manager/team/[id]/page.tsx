'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { userAPI, leadAPI, managerAPI } from '@/lib/api';
import { User, Lead } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import Link from 'next/link';
import { UserIcon } from '@/components/layout/DashboardShell';
import { format } from 'date-fns';

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

// Date presets
const getDatePresets = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const last7Days = new Date(today);
  last7Days.setDate(last7Days.getDate() - 7);
  
  const last30Days = new Date(today);
  last30Days.setDate(last30Days.getDate() - 30);
  
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - today.getDay());
  
  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  
  return {
    today: { start: today, end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) },
    yesterday: { start: yesterday, end: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1) },
    last7Days: { start: last7Days, end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) },
    last30Days: { start: last30Days, end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) },
    thisWeek: { start: thisWeekStart, end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) },
    thisMonth: { start: thisMonthStart, end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) },
    lastMonth: { start: lastMonthStart, end: lastMonthEnd },
  };
};

// Lead Status Modal Component
const LeadStatusModal = ({ 
  isOpen, 
  onClose, 
  status, 
  leads, 
  memberName 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  status: string; 
  leads: Lead[]; 
  memberName: string;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {status} Leads - {memberName}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {leads.length} lead{leads.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            ✕ Close
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {leads.length === 0 ? (
            <EmptyState
              title="No leads found"
              description={`No leads with status "${status}" for this team member.`}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                      Enquiry #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                      Phone
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {leads.map((lead: Lead) => (
                    <tr key={lead._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {lead.enquiryNumber || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {lead.name}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {lead.phone}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/manager/leads/${lead._id}`}>
                          <Button size="sm" variant="outline">
                            View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function TeamMemberDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const memberId = params?.id as string;
  const [user, setUser] = useState<User | null>(null);
  const [dateRange, setDateRange] = useState<'today' | 'yesterday' | 'last7Days' | 'last30Days' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'custom'>('today');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [statusLeads, setStatusLeads] = useState<Lead[]>([]);

  const datePresets = getDatePresets();
  
  const getDateRange = () => {
    if (dateRange === 'custom' && customStartDate && customEndDate) {
      return {
        startDate: format(new Date(customStartDate), 'yyyy-MM-dd'),
        endDate: format(new Date(customEndDate), 'yyyy-MM-dd'),
      };
    }
    const preset = datePresets[dateRange];
    return {
      startDate: format(preset.start, 'yyyy-MM-dd'),
      endDate: format(preset.end, 'yyyy-MM-dd'),
    };
  };

  useEffect(() => {
    const currentUser = auth.getUser();
    if (!currentUser) {
      router.push('/auth/login');
      return;
    }
    if (!currentUser.isManager) {
      if (currentUser.roleName === 'Super Admin' || currentUser.roleName === 'Sub Super Admin') {
        router.push('/superadmin/dashboard');
      } else {
        router.push('/user/dashboard');
      }
      return;
    }
    setUser(currentUser);
  }, [router]);

  const { data: memberData, isLoading: isLoadingMember } = useQuery({
    queryKey: ['user', memberId],
    queryFn: async () => {
      const response = await userAPI.getById(memberId);
      return response.data || response;
    },
    enabled: !!memberId && !!user,
  });

  const dateRangeParams = getDateRange();
  
  // Get today's date range for KPI cards
  const todayRange = datePresets.today;
  const todayParams = {
    startDate: format(todayRange.start, 'yyyy-MM-dd'),
    endDate: format(todayRange.end, 'yyyy-MM-dd'),
  };

  // Get user analytics for the selected period
  const { data: analyticsData, isLoading: isLoadingAnalytics } = useQuery({
    queryKey: ['user-analytics', memberId, dateRangeParams.startDate, dateRangeParams.endDate],
    queryFn: async () => {
      const response = await leadAPI.getUserAnalytics({
        startDate: dateRangeParams.startDate,
        endDate: dateRangeParams.endDate,
      });
      // Response structure: { users: [...] } or array
      const data = response.data || response;
      const users = Array.isArray(data) ? data : (data?.users || []);
      // Find user by matching _id or userId field
      return users.find((u: any) => {
        const userId = u.userId?.toString() || u._id?.toString() || '';
        return userId === memberId;
      }) || null;
    },
    enabled: !!memberId && !!user,
  });

  // Get today's analytics for KPI cards
  const { data: todayAnalytics, isLoading: isLoadingToday } = useQuery({
    queryKey: ['user-analytics-today', memberId, todayParams.startDate, todayParams.endDate],
    queryFn: async () => {
      const response = await leadAPI.getUserAnalytics({
        startDate: todayParams.startDate,
        endDate: todayParams.endDate,
      });
      const data = response.data || response;
      const users = Array.isArray(data) ? data : (data?.users || []);
      return users.find((u: any) => {
        const userId = u.userId?.toString() || u._id?.toString() || '';
        return userId === memberId;
      }) || null;
    },
    enabled: !!memberId && !!user,
  });

  // Get all leads for status breakdown
  const { data: leadsData, isLoading: isLoadingLeads } = useQuery({
    queryKey: ['user-leads', memberId],
    queryFn: async () => {
      const response = await leadAPI.getAll({ assignedTo: memberId, limit: 10000 });
      return response.data || response;
    },
    enabled: !!memberId && !!user,
  });

  // Get unfollowed leads for this user
  const { data: unfollowedData, isLoading: isLoadingUnfollowed } = useQuery({
    queryKey: ['unfollowed-leads', memberId],
    queryFn: async () => {
      const response = await managerAPI.getUnfollowedLeads({ days: 7 });
      const data = response.data || response;
      const leads = data?.leads || [];
      // Filter to only this user's leads
      return leads.filter((lead: Lead) => {
        const assignedTo = typeof lead.assignedTo === 'object' ? lead.assignedTo?._id : lead.assignedTo;
        return assignedTo === memberId;
      });
    },
    enabled: !!memberId && !!user,
  });

  const member = memberData as User | undefined;
  const leads = (leadsData?.leads || []) as Lead[];
  const unfollowedLeads = (unfollowedData || []) as Lead[];

  // Calculate today's KPIs
  const todayKPIs = useMemo(() => {
    if (!todayAnalytics) {
      return {
        confirmedLeads: 0,
        followedLeads: 0,
        callsMade: 0,
        messagesSent: 0,
      };
    }
    
    // Today's confirmed leads (count status conversions to Confirmed)
    let confirmedLeads = 0;
    if (todayAnalytics.statusConversions?.breakdown) {
      // statusConversions.breakdown is an object like { "New → Confirmed": 2, ... }
      Object.keys(todayAnalytics.statusConversions.breakdown).forEach((key) => {
        if (key.includes('→ Confirmed') || key.includes('→Confirmed')) {
          confirmedLeads += todayAnalytics.statusConversions.breakdown[key] || 0;
        }
      });
    }
    
    // Today's followed leads (unique leads with calls or SMS today)
    const followedLeadIds = new Set<string>();
    if (todayAnalytics.calls?.byLead) {
      todayAnalytics.calls.byLead.forEach((callData: any) => {
        if (callData.leadId) followedLeadIds.add(callData.leadId);
      });
    }
    if (todayAnalytics.sms?.byLead) {
      todayAnalytics.sms.byLead.forEach((smsData: any) => {
        if (smsData.leadId) followedLeadIds.add(smsData.leadId);
      });
    }
    const followedLeads = followedLeadIds.size;
    
    return {
      confirmedLeads,
      followedLeads,
      callsMade: todayAnalytics.calls?.total || 0,
      messagesSent: todayAnalytics.sms?.total || 0,
    };
  }, [todayAnalytics]);

  // Status breakdown
  const statusBreakdown = useMemo(() => {
    return leads.reduce((acc: Record<string, { count: number; leads: Lead[] }>, lead: Lead) => {
      const status = lead.leadStatus || 'Not Provided';
      if (!acc[status]) {
        acc[status] = { count: 0, leads: [] };
      }
      acc[status].count += 1;
      acc[status].leads.push(lead);
      return acc;
    }, {});
  }, [leads]);

  // Notification mutation
  const notifyMutation = useMutation({
    mutationFn: async (data: { userIds: string[]; message: string; subject?: string }) => {
      return managerAPI.notifyTeam(data);
    },
  });

  const handleSendNotification = () => {
    if (!memberId || unfollowedLeads.length === 0) return;
    
    const message = `You have ${unfollowedLeads.length} unfollowed lead(s) that need attention. Please review and follow up.`;
    
    notifyMutation.mutate(
      {
        userIds: [memberId],
        message,
        subject: 'Unfollowed Leads Reminder',
      },
      {
        onSuccess: () => {
          alert('Notification sent successfully!');
        },
        onError: (error: any) => {
          alert(`Failed to send notification: ${error.message || 'Unknown error'}`);
        },
      }
    );
  };

  const handleStatusClick = (status: string) => {
    setSelectedStatus(status);
    setStatusLeads(statusBreakdown[status]?.leads || []);
  };

  useEffect(() => {
    if (member) {
      setHeaderContent(
        <div className="flex items-center gap-4">
          <Link href="/manager/team">
            <Button size="sm" variant="outline">
              ← Back to Team
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {member.name}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {member.email} · {member.roleName}
            </p>
          </div>
        </div>
      );
    }

    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent, member]);

  if (isLoadingMember) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading team member details...</p>
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-8 text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">Team member not found</p>
          <Link href="/manager/team">
            <Button variant="primary">Back to Team</Button>
          </Link>
        </Card>
      </div>
    );
  }

  // Verify this member is actually in the manager's team
  const isTeamMember = typeof member.managedBy === 'object'
    ? member.managedBy?._id === user?._id
    : member.managedBy === user?._id;

  if (!isTeamMember) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-8 text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">
            This user is not part of your team
          </p>
          <Link href="/manager/team">
            <Button variant="primary">Back to Team</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Member Information */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Team Member Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{member.name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email
            </label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{member.email}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Role
            </label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{member.roleName}</p>
          </div>
          {member.designation && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Designation
              </label>
              <p className="text-sm text-gray-900 dark:text-gray-100">{member.designation}</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Status
            </label>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                member.isActive
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200'
              }`}
            >
              {member.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </Card>

      {/* Today's KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Today's Confirmed</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {isLoadingToday ? '...' : formatNumber(todayKPIs.confirmedLeads)}
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
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Today's Followed</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {isLoadingToday ? '...' : formatNumber(todayKPIs.followedLeads)}
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
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Today's Calls</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {isLoadingToday ? '...' : formatNumber(todayKPIs.callsMade)}
              </p>
            </div>
            <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <div className="w-6 h-6 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold">
                📞
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Today's Messages</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                {isLoadingToday ? '...' : formatNumber(todayKPIs.messagesSent)}
              </p>
            </div>
            <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
              <div className="w-6 h-6 text-orange-600 dark:text-orange-400 flex items-center justify-center font-bold">
                💬
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Date Range Selector */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Period:
          </label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7Days">Last 7 Days</option>
            <option value="last30Days">Last 30 Days</option>
            <option value="thisWeek">This Week</option>
            <option value="thisMonth">This Month</option>
            <option value="lastMonth">Last Month</option>
            <option value="custom">Custom Range</option>
          </select>
          {dateRange === 'custom' && (
            <>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
              />
              <span className="text-gray-600 dark:text-gray-400">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
              />
            </>
          )}
        </div>
      </Card>

      {/* Period Performance Summary */}
      {analyticsData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Calls</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
              {formatNumber(analyticsData.calls?.total || 0)}
            </p>
          </Card>
          <Card className="p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total SMS</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
              {formatNumber(analyticsData.sms?.total || 0)}
            </p>
          </Card>
          <Card className="p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Leads</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
              {formatNumber(analyticsData.totalAssigned || 0)}
            </p>
          </Card>
          <Card className="p-6">
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Confirmed Leads</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
              {formatNumber(analyticsData.convertedLeads || 0)}
            </p>
          </Card>
        </div>
      )}

      {/* Call Analytics */}
      {analyticsData && analyticsData.calls && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Call Analytics
          </h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Calls</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {formatNumber(analyticsData.calls.total || 0)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Duration</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {formatNumber(Math.floor((analyticsData.calls.totalDuration || 0) / 60))} min
                </p>
              </div>
            </div>
            {analyticsData.calls.byLead && analyticsData.calls.byLead.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Calls by Lead ({analyticsData.calls.byLead.length} leads)
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {analyticsData.calls.byLead.slice(0, 10).map((callData: any, idx: number) => (
                    <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {callData.leadName} ({callData.enquiryNumber || callData.leadPhone})
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {callData.callCount} call(s) · {Math.floor((callData.totalDuration || 0) / 60)} min
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* SMS Analytics */}
      {analyticsData && analyticsData.sms && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            SMS Analytics
          </h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total SMS</p>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {formatNumber(analyticsData.sms.total || 0)}
              </p>
            </div>
            {analyticsData.sms.byLead && analyticsData.sms.byLead.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  SMS by Lead ({analyticsData.sms.byLead.length} leads)
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {analyticsData.sms.byLead.slice(0, 10).map((smsData: any, idx: number) => (
                    <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {smsData.leadName} ({smsData.enquiryNumber || smsData.leadPhone})
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {smsData.smsCount} message(s)
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {analyticsData.sms.templateUsage && analyticsData.sms.templateUsage.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Template Usage
                </p>
                <div className="space-y-2">
                  {analyticsData.sms.templateUsage.slice(0, 5).map((template: any, idx: number) => (
                    <div key={idx} className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {template.name}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {template.count} message(s) · {template.uniqueLeads} lead(s)
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Status Breakdown (Clickable) */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Lead Status Breakdown
        </h2>
        {isLoadingLeads ? (
          <TableSkeleton />
        ) : Object.keys(statusBreakdown).length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No leads assigned yet</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(statusBreakdown).map(([status, data]) => (
              <button
                key={status}
                onClick={() => handleStatusClick(status)}
                className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left cursor-pointer"
              >
                <p className="text-sm text-gray-600 dark:text-gray-400">{status}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {formatNumber(data.count)}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Click to view →</p>
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Unfollowed Leads */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Unfollowed Leads
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Leads with no activity in the last 7 days
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSendNotification}
            disabled={notifyMutation.isPending || unfollowedLeads.length === 0}
          >
            {notifyMutation.isPending ? 'Sending...' : 'Send Notification'}
          </Button>
        </div>
        {isLoadingUnfollowed ? (
          <TableSkeleton />
        ) : unfollowedLeads.length === 0 ? (
          <EmptyState
            title="No unfollowed leads"
            description="All leads have been followed up recently."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                    Enquiry #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                {unfollowedLeads.slice(0, 20).map((lead: Lead) => (
                  <tr key={lead._id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {lead.enquiryNumber || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {lead.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {lead.phone}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 dark:bg-slate-800/60 dark:text-slate-200">
                        {lead.leadStatus || 'New'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/manager/leads/${lead._id}`}>
                        <Button size="sm" variant="outline">
                          View
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {unfollowedLeads.length > 20 && (
              <div className="px-4 py-3 text-center text-sm text-gray-600 dark:text-gray-400">
                Showing 20 of {unfollowedLeads.length} unfollowed leads
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Status Leads Modal */}
      <LeadStatusModal
        isOpen={selectedStatus !== null}
        onClose={() => setSelectedStatus(null)}
        status={selectedStatus || ''}
        leads={statusLeads}
        memberName={member.name}
      />
    </div>
  );
}
