'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { leadAPI, communicationAPI } from '@/lib/api';
import { Lead, User, ActivityLog, CommunicationRecord } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import Link from 'next/link';
// Using inline icons or existing components

export default function ManagerLeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const leadId = params?.id as string;
  const [user, setUser] = useState<User | null>(null);

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

  const { data: leadData, isLoading } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      const response = await leadAPI.getById(leadId);
      return response.data || response;
    },
    enabled: !!leadId,
  });

  const { data: activitiesData } = useQuery({
    queryKey: ['lead-activities', leadId],
    queryFn: async () => {
      const response = await communicationAPI.getActivityLogs(leadId);
      return response.data || response;
    },
    enabled: !!leadId,
  });

  const { data: communicationsData } = useQuery({
    queryKey: ['lead-communications', leadId],
    queryFn: async () => {
      const response = await communicationAPI.getCommunications(leadId);
      return response.data || response;
    },
    enabled: !!leadId,
  });

  const lead = leadData as Lead | undefined;
  const activities = (activitiesData as ActivityLog[]) || [];
  const communications = (communicationsData as CommunicationRecord[]) || [];

  useEffect(() => {
    if (lead) {
      setHeaderContent(
        <div className="flex items-center gap-4">
          <Link href="/manager/leads">
            <Button size="sm" variant="outline">
              ← Back to Leads
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {lead.name}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {lead.enquiryNumber || 'No Enquiry Number'}
            </p>
          </div>
        </div>
      );
    }

    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent, lead]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading lead details...</p>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="p-8 text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">Lead not found</p>
          <Link href="/manager/leads">
            <Button variant="primary">Back to Leads</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Basic Information */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Basic Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Name
            </label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{lead.name}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Phone
            </label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{lead.phone}</p>
          </div>
          {lead.email && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <p className="text-sm text-gray-900 dark:text-gray-100">{lead.email}</p>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Status
            </label>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {lead.leadStatus || 'Not Provided'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Assigned To
            </label>
            <p className="text-sm text-gray-900 dark:text-gray-100">
              {typeof lead.assignedTo === 'object' && lead.assignedTo
                ? lead.assignedTo.name
                : 'Unassigned'}
            </p>
          </div>
        </div>
      </Card>

      {/* Address Information */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Address Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Village
            </label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{lead.village}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Mandal
            </label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{lead.mandal}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              District
            </label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{lead.district}</p>
          </div>
          {lead.state && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                State
              </label>
              <p className="text-sm text-gray-900 dark:text-gray-100">{lead.state}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Parent Information */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Parent Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Father Name
            </label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{lead.fatherName}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Father Phone
            </label>
            <p className="text-sm text-gray-900 dark:text-gray-100">{lead.fatherPhone}</p>
          </div>
          {lead.motherName && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Mother Name
              </label>
              <p className="text-sm text-gray-900 dark:text-gray-100">{lead.motherName}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Activity Timeline */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Activity Timeline
        </h2>
        {activities.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No activities recorded</p>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => (
              <div
                key={activity._id}
                className="flex gap-4 pb-4 border-b border-gray-200 dark:border-gray-700 last:border-0"
              >
                <div className="flex-shrink-0">
                  <div className="w-2 h-2 rounded-full bg-blue-500 mt-2"></div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {activity.activityType === 'status_change'
                      ? `Status changed: ${activity.oldStatus} → ${activity.newStatus}`
                      : activity.activityType === 'comment'
                      ? 'Comment added'
                      : activity.activityType}
                  </p>
                  {activity.comment && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {activity.comment}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    {formatDate(activity.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Communications */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Communications
        </h2>
        {communications.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No communications recorded</p>
        ) : (
          <div className="space-y-4">
            {communications.map((comm) => (
              <div
                key={comm._id}
                className="flex gap-4 pb-4 border-b border-gray-200 dark:border-gray-700 last:border-0"
              >
                <div className="flex-shrink-0">
                  {comm.type === 'call' ? (
                    <div className="w-5 h-5 text-blue-500 mt-1 flex items-center justify-center font-bold">
                      📞
                    </div>
                  ) : (
                    <div className="w-5 h-5 text-green-500 mt-1 flex items-center justify-center font-bold">
                      ✉
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {comm.type === 'call' ? 'Call' : 'SMS'}
                  </p>
                  {comm.type === 'call' && comm.duration && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Duration: {Math.round(comm.duration / 60)} minutes
                    </p>
                  )}
                  {comm.message && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{comm.message}</p>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    {formatDate(comm.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

