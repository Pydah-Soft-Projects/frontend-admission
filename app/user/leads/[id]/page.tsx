'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { leadAPI, communicationAPI, userAPI } from '@/lib/api';
import {
  Lead,
  LeadUpdatePayload,
  User,
  ActivityLog,
  CommunicationRecord,
  MessageTemplate,
  MessageTemplateVariable,
  CommunicationStatsEntry,
} from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { showToast } from '@/lib/toast';
import { LeadDetailSkeleton } from '@/components/ui/Skeleton';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import { useLocations } from '@/lib/useLocations';

// Timeline item type
interface TimelineItem {
  id: string;
  type: 'enquiry_created' | 'assigned' | 'call' | 'sms' | 'field_update' | 'status_change' | 'comment';
  date: string;
  title: string;
  description: string;
  performedBy?: string;
  metadata?: Record<string, any>;
}

export default function UserLeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const { setHeaderContent, clearHeaderContent, setMobileTopBar, clearMobileTopBar } = useDashboardHeader();
  const leadId = params?.id as string;
  const [user, setUser] = useState<User | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<LeadUpdatePayload>({});

  // Expandable details section
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);

  // Action bar modals
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [statusComment, setStatusComment] = useState('');

  // Comment modal state
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showScheduleCallModal, setShowScheduleCallModal] = useState(false);
  const [scheduleCallDateTime, setScheduleCallDateTime] = useState('');

  // Communication modals
  const [showCallNumberModal, setShowCallNumberModal] = useState(false);
  const [selectedCallNumber, setSelectedCallNumber] = useState('');
  const [showCallRemarksModal, setShowCallRemarksModal] = useState(false);
  const [callData, setCallData] = useState({
    contactNumber: '',
    remarks: '',
    outcome: '',
    durationSeconds: 0,
  });
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsData, setSmsData] = useState({
    selectedNumbers: [] as string[],
    selectedTemplates: {} as Record<string, { template: MessageTemplate; variables: Record<string, string> }>,
    languageFilter: 'all' as string,
  });

  // Status options (lead pipeline stage – only these allowed for status update)
  const statusOptions = [
    'Interested',
    'Not interested',
    'Confirmed',
    'Polycet applied',
    'Eamcet applied',
    'Other cet applied',
    'Admitted only',
  ];

  // Get the appropriate leads page URL for regular users
  const getLeadsPageUrl = () => {
    return '/user/dashboard'; // Regular users redirect to dashboard
  };

  // Check authentication - only allow regular users (not super admin or manager)
  useEffect(() => {
    setIsMounted(true);
    const currentUser = auth.getUser();
    if (!currentUser) {
      router.push('/auth/login');
      return;
    }
    // Redirect super admins and managers to their respective dashboards
    if (currentUser.roleName === 'Super Admin' || currentUser.roleName === 'Sub Super Admin') {
      router.push('/superadmin/dashboard');
      return;
    }
    if (currentUser.isManager) {
      router.push('/manager/dashboard');
      return;
    }
    setUser(currentUser);
  }, [router]);

  // Fetch lead data
  const {
    data: leadData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      const response = await leadAPI.getById(leadId);
      return response.data || response;
    },
    enabled: !!leadId && !!user,
    staleTime: 30000,
  });

  const lead = (leadData?.data || leadData) as Lead | undefined;

  // Fetch activity logs
  const {
    data: activityLogsData,
    isLoading: isLoadingLogs,
  } = useQuery({
    queryKey: ['lead', leadId, 'activityLogs'],
    queryFn: async () => {
      const response = await leadAPI.getActivityLogs(leadId);
      return response.data?.logs || response.logs || [];
    },
    enabled: !!leadId && !!user,
  });

  const activityLogs = (activityLogsData || []) as ActivityLog[];

  // Fetch communication history
  const {
    data: communicationHistoryResponse,
    isLoading: isLoadingCommunications,
  } = useQuery({
    queryKey: ['lead', leadId, 'communications'],
    queryFn: async () => {
      const response = await communicationAPI.getHistory(leadId, {
        page: 1,
        limit: 100,
      });
      return response.data || response;
    },
    enabled: !!leadId && !!user,
  });

  const communications: CommunicationRecord[] =
    communicationHistoryResponse?.data?.items ||
    communicationHistoryResponse?.items ||
    [];

  // Fetch communication stats
  const { data: communicationStatsResponse } = useQuery({
    queryKey: ['lead', leadId, 'communicationStats'],
    queryFn: async () => {
      const response = await communicationAPI.getStats(leadId);
      return response.data || response;
    },
    enabled: !!leadId && !!user,
    staleTime: 30000,
  });

  const communicationStats: CommunicationStatsEntry[] =
    communicationStatsResponse?.stats || communicationStatsResponse || [];

  // Fetch users for assignment
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await userAPI.getAll();
      return response.data || response;
    },
    enabled: false, // Regular users cannot assign leads
  });

  // Fetch lead IDs for "next lead" navigation: ordered by name, excluding leads touched today (call/SMS/activity)
  const { data: allLeadIds } = useQuery({
    queryKey: ['leadIds', 'user-leads', 'excludeTouchedToday'],
    queryFn: async () => {
      const response = await leadAPI.getAllIds({ excludeTouchedToday: true });

      // Handle potential response structure variations
      const ids = response.data?.ids || response.ids || response.data?.data?.ids || [];

      return ids.map((id: string | number) => String(id));
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });

  const nextLeadId = useMemo(() => {
    if (!allLeadIds || allLeadIds.length === 0 || !leadId) return null;

    const currentIdStr = String(leadId);
    const index = allLeadIds.findIndex((id: string) => String(id) === currentIdStr);

    if (index === -1) {
      // Current lead not in list (e.g. touched today and excluded) → "Next" = first untouched lead
      return allLeadIds[0];
    }

    if (index === allLeadIds.length - 1) return null;
    return allLeadIds[index + 1];
  }, [allLeadIds, leadId]);

  const handleNextLead = useCallback(() => {
    if (nextLeadId) {
      router.push(`/user/leads/${nextLeadId}`);
    } else {
      // Diagnostic message for the user
      const count = allLeadIds?.length || 0;
      showToast.info(`No more leads. (List: ${count}, Current: ${leadId})`);
    }
  }, [nextLeadId, router, allLeadIds, leadId]);

  const users: User[] = (usersData?.data || usersData || []).filter(
    (u: User) => u.isActive && u.roleName !== 'Super Admin' && u.roleName !== 'Sub Super Admin'
  );

  // Separate call logs for Call History section - MUST be before early returns
  const callLogs = useMemo(() => {
    if (!communications || communications.length === 0) {
      return [];
    }

    // Group calls by contact number and sort chronologically
    const callsByNumber = new Map<string, CommunicationRecord[]>();

    communications
      .filter((comm) => comm.type === 'call')
      .forEach((comm) => {
        const number = comm.contactNumber || 'Unknown';
        if (!callsByNumber.has(number)) {
          callsByNumber.set(number, []);
        }
        callsByNumber.get(number)!.push(comm);
      });

    // Sort each group chronologically and assign sequence numbers
    const allCalls: Array<CommunicationRecord & { sequenceNumber: number; ordinal: string }> = [];

    callsByNumber.forEach((calls, contactNumber) => {
      const sortedCalls = [...calls].sort((a, b) =>
        new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
      );

      sortedCalls.forEach((call, index) => {
        const sequenceNumber = index + 1;
        const ordinal = sequenceNumber === 1 ? '1st' :
          sequenceNumber === 2 ? '2nd' :
            sequenceNumber === 3 ? '3rd' :
              `${sequenceNumber}th`;

        allCalls.push({
          ...call,
          sequenceNumber,
          ordinal,
        });
      });
    });

    // Sort all calls by date (newest first for display)
    return allCalls.sort((a, b) =>
      new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
    );
  }, [communications]);

  // Separate comments from timeline - MUST be before early returns
  const comments = useMemo(() => {
    return activityLogs.filter((log) => log.type === 'comment');
  }, [activityLogs]);

  // Separate status changes from timeline - MUST be before early returns
  const statusChanges = useMemo(() => {
    return activityLogs.filter((log) => log.type === 'status_change');
  }, [activityLogs]);

  // Build timeline from all activities
  const timelineItems: TimelineItem[] = useMemo(() => {
    const items: TimelineItem[] = [];

    // 1. Enquiry creation
    if (lead?.createdAt) {
      items.push({
        id: `enquiry-${lead._id}`,
        type: 'enquiry_created',
        date: lead.createdAt,
        title: 'Enquiry Created',
        description: `Enquiry #${lead.enquiryNumber || 'N/A'} was created`,
        performedBy: typeof lead.uploadedBy === 'object' ? lead.uploadedBy.name : undefined,
      });
    }

    // 2. Assignment - check activity logs first, then fallback to lead.assignedAt
    const assignmentLog = activityLogs.find((log) =>
      log.type === 'status_change' &&
      log.metadata?.assignment
    );

    if (assignmentLog) {
      const assignedUserName = assignmentLog.metadata?.assignment?.assignedTo
        ? 'Counsellor'
        : 'Unknown';
      items.push({
        id: `assigned-${assignmentLog._id}`,
        type: 'assigned',
        date: assignmentLog.createdAt,
        title: 'Assigned to Counsellor',
        description: assignmentLog.comment || `Assigned to counsellor`,
        performedBy: typeof assignmentLog.performedBy === 'object' ? assignmentLog.performedBy.name : undefined,
        metadata: assignmentLog.metadata,
      });
    } else if (lead?.assignedAt && lead?.assignedTo) {
      const assignedUserName = typeof lead.assignedTo === 'object'
        ? lead.assignedTo.name
        : 'Unknown';
      items.push({
        id: `assigned-${lead._id}`,
        type: 'assigned',
        date: lead.assignedAt,
        title: 'Assigned to Counsellor',
        description: `Assigned to ${assignedUserName}`,
        performedBy: typeof lead.assignedBy === 'object' ? lead.assignedBy.name : undefined,
      });
    }

    // 3. Calls and SMS from communication records with sequence numbers
    // Group communications by contact number and type, then sort chronologically
    const communicationsByNumber = new Map<string, { calls: typeof communications; sms: typeof communications }>();

    communications.forEach((comm) => {
      const number = comm.contactNumber || 'Unknown';
      if (!communicationsByNumber.has(number)) {
        communicationsByNumber.set(number, { calls: [], sms: [] });
      }
      const group = communicationsByNumber.get(number)!;
      if (comm.type === 'call') {
        group.calls.push(comm);
      } else if (comm.type === 'sms') {
        group.sms.push(comm);
      }
    });

    // Sort each group chronologically and assign sequence numbers
    communicationsByNumber.forEach((group, contactNumber) => {
      // Sort calls by date (oldest first for sequence numbering)
      const sortedCalls = [...group.calls].sort((a, b) =>
        new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
      );

      // Sort SMS by date (oldest first for sequence numbering)
      const sortedSms = [...group.sms].sort((a, b) =>
        new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
      );

      // Add calls with sequence numbers
      sortedCalls.forEach((comm, index) => {
        const sequenceNumber = index + 1;
        const ordinal = sequenceNumber === 1 ? '1st' :
          sequenceNumber === 2 ? '2nd' :
            sequenceNumber === 3 ? '3rd' :
              `${sequenceNumber}th`;

        items.push({
          id: `call-${comm._id}`,
          type: 'call',
          date: comm.sentAt,
          title: `${ordinal} Call - ${contactNumber}`,
          description: comm.remarks || comm.callOutcome || 'Call logged',
          performedBy: typeof comm.sentBy === 'object' ? comm.sentBy.name : undefined,
          metadata: {
            outcome: comm.callOutcome,
            duration: comm.durationSeconds,
            contactNumber: contactNumber,
            sequenceNumber: sequenceNumber,
          },
        });
      });

      // Add SMS with sequence numbers
      sortedSms.forEach((comm, index) => {
        const sequenceNumber = index + 1;
        const ordinal = sequenceNumber === 1 ? '1st' :
          sequenceNumber === 2 ? '2nd' :
            sequenceNumber === 3 ? '3rd' :
              `${sequenceNumber}th`;

        const messageText = comm.template?.renderedContent ||
          comm.template?.originalContent ||
          'Message sent';
        const templateName = comm.template?.name || 'Unknown Template';

        items.push({
          id: `sms-${comm._id}`,
          type: 'sms',
          date: comm.sentAt,
          title: `${ordinal} Message - ${contactNumber}`,
          description: `Template: ${templateName}\n${messageText}`,
          performedBy: typeof comm.sentBy === 'object' ? comm.sentBy.name : undefined,
          metadata: {
            contactNumber: contactNumber,
            sequenceNumber: sequenceNumber,
            templateName: templateName,
            messageText: messageText,
            templateId: comm.template?.templateId,
            status: comm.status,
          },
        });
      });
    });

    // 4. Activity logs (status changes, comments, field updates)
    // Skip status_change logs that are assignments (already added above)
    activityLogs.forEach((log) => {
      // Skip assignment status changes as they're already in timeline
      if (log.type === 'status_change' && log.metadata?.assignment) {
        return; // Already added as assignment above
      }

      if (log.type === 'status_change') {
        items.push({
          id: `status-${log._id}`,
          type: 'status_change',
          date: log.createdAt,
          title: 'Status Changed',
          description: `Changed from "${log.oldStatus || 'N/A'}" to "${log.newStatus || 'N/A'}"${log.comment ? ` - ${log.comment}` : ''}`,
          performedBy: typeof log.performedBy === 'object' ? log.performedBy.name : undefined,
          metadata: {
            oldStatus: log.oldStatus,
            newStatus: log.newStatus,
            comment: log.comment,
          },
        });
      } else if (log.type === 'comment') {
        items.push({
          id: `comment-${log._id}`,
          type: 'comment',
          date: log.createdAt,
          title: 'Comment Added',
          description: log.comment || '',
          performedBy: typeof log.performedBy === 'object' ? log.performedBy.name : undefined,
        });
      } else if (log.type === 'quota_change' || log.type === 'field_update' || log.metadata?.fieldUpdate) {
        items.push({
          id: `update-${log._id}`,
          type: 'field_update',
          date: log.createdAt,
          title: 'Details Updated',
          description: log.comment || 'Student details were updated',
          performedBy: typeof log.performedBy === 'object' ? log.performedBy.name : undefined,
          metadata: log.metadata,
        });
      }
    });

    // Sort by date (newest first)
    return items.sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [lead, activityLogs, communications]);

  // Set header
  useEffect(() => {
    if (!lead) {
      return () => clearHeaderContent();
    }

    setHeaderContent(
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Lead Details</h1>
      </div>
    );

    return () => clearHeaderContent();
  }, [lead, user, router, setHeaderContent, clearHeaderContent]);

  useEffect(() => {
    setMobileTopBar({
      title: 'Lead Details',
      showBack: true,
      backHref: '/user/leads',
      iconKey: 'lead-details',
    });
    return () => clearMobileTopBar();
  }, [lead, setMobileTopBar, clearMobileTopBar]);

  // Initialize form data
  useEffect(() => {
    if (lead && !isEditing) {
      setFormData({
        name: lead.name,
        phone: lead.phone,
        fatherName: lead.fatherName,
        fatherPhone: lead.fatherPhone,
        village: lead.village,
        mandal: lead.mandal,
        district: lead.district,
        state: lead.state || 'Andhra Pradesh',
        applicationStatus: lead.applicationStatus,
        hallTicketNumber: lead.hallTicketNumber,
        gender: lead.gender,
        interCollege: lead.interCollege,
        rank: lead.rank,
      });
    }
  }, [lead, isEditing]);

  // State/district/mandal dropdown options from database
  const selectedState = formData.state ?? lead?.state ?? '';
  const selectedDistrict = formData.district ?? lead?.district ?? '';
  const { stateNames, districtNames, mandalNames } = useLocations({
    stateName: selectedState || undefined,
    districtName: selectedDistrict || undefined,
  });
  const availableDistricts = districtNames;
  const availableMandals = mandalNames;

  // Mutations
  const updateMutation = useMutation({
    mutationFn: async (data: LeadUpdatePayload) => {
      return await leadAPI.update(leadId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setIsEditing(false);
      showToast.success('Lead updated successfully!');
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to update lead');
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await leadAPI.assignToUser(leadId, userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setShowAssignModal(false);
      setSelectedUserId('');
      showToast.success('Lead assigned successfully!');
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to assign lead');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await leadAPI.delete(leadId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      showToast.success('Lead deleted successfully!');
      router.push(getLeadsPageUrl());
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to delete lead');
    },
  });

  const statusUpdateMutation = useMutation({
    mutationFn: async (data: { newStatus?: string; comment?: string }) => {
      return await leadAPI.addActivity(leadId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId, 'activityLogs'] });
      setShowStatusModal(false);
      setNewStatus('');
      setStatusComment('');
      showToast.success('Status updated successfully!');
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to update status');
    },
  });

  // Comment mutation - MUST be before early returns
  const commentMutation = useMutation({
    mutationFn: async (comment: string) => {
      return await leadAPI.addActivity(leadId, { comment });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId, 'activityLogs'] });
      setShowCommentModal(false);
      setCommentText('');
      showToast.success('Comment added successfully!');
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to add comment');
    },
  });



  // Call mutation
  const callMutation = useMutation({
    mutationFn: async (data: typeof callData & { next?: boolean }) => {
      // We don't send 'next' to the API
      const { next, ...apiData } = data;
      return await communicationAPI.logCall(leadId, apiData);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId, 'communications'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId, 'communicationStats'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId, 'activityLogs'] });
      setShowCallRemarksModal(false);
      setCallData({ contactNumber: '', remarks: '', outcome: '', durationSeconds: 0 });
      setSelectedCallNumber('');
      showToast.success('Call logged successfully!');

      if (variables.next) {
        handleNextLead();
      }
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to log call');
    },
  });

  const scheduleCallMutation = useMutation({
    mutationFn: async (payload: { nextScheduledCall: string | null }) => {
      return await leadAPI.update(leadId, {
        nextScheduledCall: payload.nextScheduledCall ?? undefined,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setShowScheduleCallModal(false);
      setScheduleCallDateTime('');
      showToast.success(variables.nextScheduledCall ? 'Next call scheduled.' : 'Scheduled call cleared.');
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to update schedule');
    },
  });

  // Fetch active templates for SMS
  const { data: templatesData, isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['activeTemplates', smsData.languageFilter],
    queryFn: async () => {
      const response = await communicationAPI.getActiveTemplates(smsData.languageFilter !== 'all' ? smsData.languageFilter : undefined);
      return response.data || response;
    },
    enabled: showSmsModal,
  });

  const templates: MessageTemplate[] = Array.isArray(templatesData) ? templatesData : templatesData?.data || [];

  // Get available phone numbers from lead
  const contactOptions = useMemo(() => {
    if (!lead) return [];
    const options: { label: string; number: string }[] = [];
    if (lead.phone) {
      options.push({ label: 'Primary Phone', number: lead.phone });
    }
    if (lead.fatherPhone) {
      options.push({ label: 'Father Phone', number: lead.fatherPhone });
    }
    return options;
  }, [lead]);

  // Get available template languages
  const availableLanguages = useMemo(() => {
    const languages = new Set<string>();
    templates.forEach((template) => {
      if (template.language) languages.add(template.language);
    });
    return Array.from(languages);
  }, [templates]);

  // Filter templates by language
  const filteredTemplates = useMemo(() => {
    if (smsData.languageFilter === 'all') return templates;
    return templates.filter((t) => t.language === smsData.languageFilter);
  }, [templates, smsData.languageFilter]);

  // Build default template values
  const buildDefaultTemplateValues = useCallback((template: MessageTemplate) => {
    const values: Record<string, string> = {};
    if (template.variables && template.variables.length > 0) {
      template.variables.forEach((variable, index) => {
        const key = variable.key || `var${index + 1}`;
        if (index === 0 && lead?.name) {
          values[key] = lead.name;
        } else if (variable.defaultValue) {
          values[key] = variable.defaultValue;
        } else {
          values[key] = '';
        }
      });
    } else if (template.variableCount > 0) {
      for (let i = 0; i < template.variableCount; i++) {
        const key = `var${i + 1}`;
        values[key] = i === 0 && lead?.name ? lead.name : '';
      }
    }
    return values;
  }, [lead?.name]);

  // Render template preview
  const renderTemplatePreview = useCallback((template: MessageTemplate, values: Record<string, string>) => {
    const keys = template.variables && template.variables.length > 0
      ? template.variables.map((v, i) => v.key || `var${i + 1}`)
      : Array.from({ length: template.variableCount }).map((_, i) => `var${i + 1}`);

    let pointer = 0;
    return template.content.replace(/\{#var#\}/gi, () => {
      const key = keys[pointer] || `var${pointer + 1}`;
      pointer += 1;
      return values[key] || '';
    });
  }, []);

  // Communication stats map
  const communicationStatsMap = useMemo(() => {
    const map = new Map<string, CommunicationStatsEntry>();
    communicationStats.forEach((entry) => {
      map.set(entry.contactNumber, entry);
    });
    return map;
  }, [communicationStats]);

  // SMS mutation - send templates to multiple numbers
  const smsMutation = useMutation({
    mutationFn: async (data: {
      contactNumbers: string[];
      templates: Array<{ templateId: string; variables: Array<{ key: string; value: string }> }>
    }) => {
      return await communicationAPI.sendSms(leadId, data);
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId, 'communications'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId, 'communicationStats'] });
      const resultData = response.data || response;
      const results = resultData?.results || [];
      const successCount = results.filter((r: any) => r.success).length;
      const totalCount = results.length;
      if (successCount === totalCount) {
        showToast.success(`All ${successCount} message(s) sent successfully!`);
      } else {
        showToast.success(`${successCount}/${totalCount} message(s) sent successfully`);
      }
      setShowSmsModal(false);
      setSmsData({ selectedNumbers: [], selectedTemplates: {}, languageFilter: 'all' });
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to send SMS');
    },
  });

  // Handlers
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleAssign = () => {
    if (!selectedUserId) {
      showToast.error('Please select a counsellor');
      return;
    }
    assignMutation.mutate(selectedUserId);
  };

  const handleStatusUpdate = () => {
    if (!newStatus || newStatus === lead?.leadStatus) {
      if (!statusComment.trim()) {
        showToast.error('Please select a new status or add a comment');
        return;
      }
    }
    statusUpdateMutation.mutate({
      newStatus: newStatus && newStatus !== lead?.leadStatus ? newStatus : undefined,
      comment: statusComment.trim() || undefined,
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status?: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'interested' || s === 'confirmed') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    if (s === 'not interested' || s === 'not interest') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    if (s === 'admitted only' || s === 'admitted') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
    if (s === 'polycet applied' || s === 'eamcet applied' || s === 'other cet applied') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  };

  const getCallOutcomeColor = (outcome?: string) => {
    if (!outcome) return 'bg-gray-100 text-gray-700';

    const outcomeLower = outcome.toLowerCase().trim();

    // Positive outcomes - Green
    if (outcomeLower.includes('answered') ||
      outcomeLower.includes('interested') ||
      outcomeLower.includes('yes') ||
      outcomeLower.includes('confirmed') ||
      outcomeLower.includes('agreed') ||
      outcomeLower.includes('accepted')) {
      return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
    }

    // Negative outcomes - Red
    if (outcomeLower.includes('not interested') ||
      outcomeLower.includes('rejected') ||
      outcomeLower.includes('declined') ||
      outcomeLower.includes('wrong number') ||
      outcomeLower.includes('wrong data') ||
      outcomeLower.includes('switch off') ||
      (outcomeLower.includes('no') && !outcomeLower.includes('answer'))) {
      return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
    }

    // Neutral/Warning outcomes - Yellow/Orange (callback_requested / "call back" etc.)
    if (outcomeLower.includes('busy') ||
      outcomeLower.includes('not answered') ||
      outcomeLower.includes('no answer') ||
      outcomeLower.includes('missed') ||
      outcomeLower.includes('call back') ||
      outcomeLower.includes('callback') ||
      outcomeLower.includes('follow up')) {
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
    }

    // Default - Gray
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  };

  const getCallOutcomeIconColor = (outcome?: string) => {
    if (!outcome) {
      return {
        iconBg: 'bg-gradient-to-br from-gray-500 to-gray-600',
        border: 'border-gray-400',
        line: 'from-gray-400 to-gray-200',
        cardBg: 'from-gray-50/50',
        cardBorder: 'border-gray-400',
      };
    }

    const outcomeLower = outcome.toLowerCase().trim();

    // Positive outcomes - Green
    if (outcomeLower.includes('answered') ||
      outcomeLower.includes('interested') ||
      outcomeLower.includes('yes') ||
      outcomeLower.includes('confirmed') ||
      outcomeLower.includes('agreed') ||
      outcomeLower.includes('accepted')) {
      return {
        iconBg: 'bg-gradient-to-br from-green-500 to-green-600',
        border: 'border-green-400',
        line: 'from-green-400 to-green-200',
        cardBg: 'from-green-50/50',
        cardBorder: 'border-green-400',
      };
    }

    // Negative outcomes - Red
    if (outcomeLower.includes('not interested') ||
      outcomeLower.includes('rejected') ||
      outcomeLower.includes('declined') ||
      outcomeLower.includes('wrong number') ||
      outcomeLower.includes('wrong data') ||
      outcomeLower.includes('switch off') ||
      (outcomeLower.includes('no') && !outcomeLower.includes('answer'))) {
      return {
        iconBg: 'bg-gradient-to-br from-red-500 to-red-600',
        border: 'border-red-400',
        line: 'from-red-400 to-red-200',
        cardBg: 'from-red-50/50',
        cardBorder: 'border-red-400',
      };
    }

    // Neutral/Warning outcomes - Yellow/Orange (callback_requested / "call back" etc.)
    if (outcomeLower.includes('busy') ||
      outcomeLower.includes('not answered') ||
      outcomeLower.includes('no answer') ||
      outcomeLower.includes('missed') ||
      outcomeLower.includes('call back') ||
      outcomeLower.includes('callback') ||
      outcomeLower.includes('follow up')) {
      return {
        iconBg: 'bg-gradient-to-br from-yellow-500 to-yellow-600',
        border: 'border-yellow-400',
        line: 'from-yellow-400 to-yellow-200',
        cardBg: 'from-yellow-50/50',
        cardBorder: 'border-yellow-400',
      };
    }

    // Default - Gray
    return {
      iconBg: 'bg-gradient-to-br from-gray-500 to-gray-600',
      border: 'border-gray-400',
      line: 'from-gray-400 to-gray-200',
      cardBg: 'from-gray-50/50',
      cardBorder: 'border-gray-400',
    };
  };

  if (!isMounted || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return <LeadDetailSkeleton />;
  }

  if (isError || !lead) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <div className="text-center py-8">
            <p className="text-red-600 mb-4">
              {error instanceof Error ? error.message : 'Lead not found'}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const handleAddComment = () => {
    if (!commentText.trim()) {
      showToast.error('Please enter a comment');
      return;
    }
    commentMutation.mutate(commentText.trim());
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-3 sm:space-y-6 px-0 sm:px-4 pb-36 sm:pb-6 pt-3 sm:pt-6 lg:px-8 lg:pb-6">
      {/* Mobile-only sticky action bar: icons only (above bottom nav) */}
      <div
        className="lg:hidden fixed left-0 right-0 z-20 flex items-center justify-center gap-3 px-4 py-3 bg-white/95 dark:bg-slate-900/95 border-t border-slate-200 dark:border-slate-700 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
        aria-label="Quick actions"
      >
        <div className="flex items-center justify-center gap-3 w-full max-w-sm mx-auto">
          <button
            type="button"
            onClick={() => lead && setShowCallNumberModal(true)}
            className="flex items-center justify-center size-12 rounded-xl bg-green-500 hover:bg-green-600 active:scale-95 text-white shadow-sm"
            aria-label="Call"
          >
            <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              if (lead) {
                setSmsData({ selectedNumbers: contactOptions.map(o => o.number), selectedTemplates: {}, languageFilter: 'all' });
                setShowSmsModal(true);
              }
            }}
            className="flex items-center justify-center size-12 rounded-xl bg-purple-500 hover:bg-purple-600 active:scale-95 text-white shadow-sm"
            aria-label="SMS"
          >
            <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => { setNewStatus(lead?.leadStatus || ''); setStatusComment(''); setShowStatusModal(true); }}
            className="flex items-center justify-center size-12 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white shadow-sm"
            aria-label="Update status"
          >
            <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => { setCommentText(''); setShowCommentModal(true); }}
            className="flex items-center justify-center size-12 rounded-xl bg-slate-600 hover:bg-slate-700 active:scale-95 text-white shadow-sm"
            aria-label="Add comment"
          >
            <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>

          {/* Next Lead Button - Mobile Only */}
          <button
            type="button"
            onClick={handleNextLead}
            className="flex items-center justify-center size-12 rounded-xl text-white shadow-sm transition-all bg-blue-600 hover:bg-blue-700 active:scale-95"
            aria-label="Next Lead"
          >
            <svg className="size-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </div>

      {/* MAIN CONTENT - 2 Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
        {/* LEFT COLUMN - Student Details & History */}
        <div className="lg:col-span-2 space-y-3 sm:space-y-6">
          {/* SECTION 1: PROFILE CARD - identity / pass style, rich orange gradient; compact on mobile */}
          <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border-2 border-orange-400/50 shadow-lg sm:shadow-xl shadow-orange-900/20">
            {/* Lighter orange gradient background */}
            <div className="absolute inset-0 bg-gradient-to-t from-orange-400 to-orange-600" aria-hidden />
            <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/15" aria-hidden />
            {/* Edit pencil - top right of card (mobile: primary edit entry; desktop: alternative to Actions Edit) */}
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="absolute top-3 right-3 z-10 flex items-center justify-center size-9 rounded-lg bg-white/90 hover:bg-white text-orange-700 shadow-sm active:scale-95 lg:size-8"
                aria-label="Edit student details"
              >
                <svg className="size-5 lg:size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
            <div className="relative px-3 py-3 sm:px-6 sm:py-6">
              {isEditing ? (
                <div className="rounded-lg sm:rounded-xl bg-white/95 p-3 sm:p-6 shadow-inner">
                  <form onSubmit={handleSave} className="space-y-4 sm:space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                        <Input
                          value={formData.name || ''}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                        <Input
                          value={formData.phone || ''}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Father Name *</label>
                        <Input
                          value={formData.fatherName || ''}
                          onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Father Phone *</label>
                        <Input
                          value={formData.fatherPhone || ''}
                          onChange={(e) => setFormData({ ...formData, fatherPhone: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Village *</label>
                        <Input
                          value={formData.village || ''}
                          onChange={(e) => setFormData({ ...formData, village: e.target.value })}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          value={formData.state || 'Andhra Pradesh'}
                          onChange={(e) => {
                            const state = e.target.value;
                            setFormData({ ...formData, state, district: undefined, mandal: undefined });
                          }}
                        >
                          {stateNames.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">District *</label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          value={formData.district || ''}
                          onChange={(e) => {
                            const district = e.target.value;
                            setFormData({ ...formData, district, mandal: undefined });
                          }}
                          required
                        >
                          <option value="">Select district</option>
                          {availableDistricts.map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Mandal *</label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          value={formData.mandal || ''}
                          onChange={(e) => setFormData({ ...formData, mandal: e.target.value })}
                          required
                        >
                          <option value="">Select mandal</option>
                          {availableMandals.map((m) => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" variant="primary" disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </div>
              ) : (
                <>
                  {/* Profile header: avatar (initial) + name + phone - compact on mobile */}
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="flex h-10 w-10 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-full bg-white/95 text-orange-600 shadow-md ring-2 ring-white/50 font-bold text-lg sm:text-xl uppercase">
                      {(lead.name || '?').charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base sm:text-lg font-bold text-white drop-shadow-sm wrap-break-word">{lead.name}</h2>
                      <div className="mt-0.5 sm:mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="text-xs sm:text-sm font-medium text-white/95 break-all flex items-center gap-1.5">
                          <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-amber-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {lead.phone || '—'}
                        </p>
                        {lead.leadStatus && (
                          <span className="inline-flex shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-white/25 text-white backdrop-blur">
                            {lead.leadStatus}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expandable: extra details - on card use light panel; compact on mobile */}
                  <div className="mt-2 sm:mt-3">
                    {isDetailsExpanded && (
                      <div className="space-y-2 rounded-lg sm:rounded-xl border border-white/20 bg-white/15 backdrop-blur pt-2 px-2 pb-2 sm:pt-3 sm:px-3 sm:pb-3 text-xs sm:text-sm text-white/95">
                        {lead.email && (
                          <p className="flex items-center gap-2">
                            <svg className="h-4 w-4 shrink-0 text-amber-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            {lead.email}
                          </p>
                        )}
                        {(lead.village || lead.mandal || lead.district || lead.state) && (
                          <p className="flex items-center gap-2">
                            <svg className="h-4 w-4 shrink-0 text-amber-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {[lead.village, lead.mandal, lead.district, lead.state].filter(Boolean).join(', ')}
                          </p>
                        )}
                        {(lead.fatherName || lead.fatherPhone) && (
                          <p className="flex items-center gap-2">
                            <svg className="h-4 w-4 shrink-0 text-amber-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                            {lead.fatherName}
                            {lead.fatherPhone && ` · ${lead.fatherPhone}`}
                          </p>
                        )}
                        {lead.enquiryNumber && (
                          <p className="flex items-center gap-2">
                            <svg className="h-4 w-4 shrink-0 text-amber-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                            </svg>
                            #{lead.enquiryNumber}
                          </p>
                        )}
                        {lead.leadStatus && (
                          <p className="flex items-center gap-2">
                            <svg className="h-4 w-4 shrink-0 text-amber-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {lead.leadStatus}
                          </p>
                        )}
                        {lead.source && (
                          <p className="flex items-center gap-2">
                            <svg className="h-4 w-4 shrink-0 text-amber-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            {lead.source}
                          </p>
                        )}
                        {lead.applicationStatus && <p>{lead.applicationStatus}</p>}
                        {lead.hallTicketNumber && <p>Hall ticket: {lead.hallTicketNumber}</p>}
                        {lead.rank != null && <p>Rank: {lead.rank}</p>}
                        {lead.interCollege && <p>{lead.interCollege}</p>}
                        {lead.gender && <p>{lead.gender}</p>}
                        {lead.isNRI && <p>NRI</p>}
                        {lead.assignedTo && (
                          <p className="flex items-center gap-2">
                            <svg className="h-4 w-4 shrink-0 text-amber-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            {typeof lead.assignedTo === 'object' ? lead.assignedTo.name : ''}
                          </p>
                        )}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                      className="mt-1.5 sm:mt-2 flex items-center gap-1.5 text-xs font-semibold text-white/90 hover:text-white"
                    >
                      {isDetailsExpanded ? (
                        <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg> Show less</>
                      ) : (
                        <><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg> More details</>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ACTIONS - hidden on mobile, visible from sm up */}
          <div className="hidden sm:block">
            <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">Actions</p>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => lead && setShowCallNumberModal(true)}
                className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg bg-green-50 hover:bg-green-100 border border-green-200 dark:bg-green-900/20 dark:border-green-800 dark:hover:bg-green-900/30 text-green-700 dark:text-green-300 text-xs sm:text-sm font-medium"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                Call
              </button>
              <button
                type="button"
                onClick={() => {
                  if (lead) {
                    setSmsData({ selectedNumbers: contactOptions.map(o => o.number), selectedTemplates: {}, languageFilter: 'all' });
                    setShowSmsModal(true);
                  }
                }}
                className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 dark:bg-purple-900/20 dark:border-purple-800 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs sm:text-sm font-medium"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                SMS
              </button>
              <button
                type="button"
                onClick={() => { setNewStatus(lead?.leadStatus || ''); setStatusComment(''); setShowStatusModal(true); }}
                className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200 dark:bg-orange-900/20 dark:border-orange-800 dark:hover:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs sm:text-sm font-medium"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Status
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 dark:bg-indigo-900/20 dark:border-indigo-800 dark:hover:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs sm:text-sm font-medium"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            </div>
          </div>

          {/* STATUS - on desktop; on mobile shown in profile card */}
          {lead.leadStatus && (
            <div className="hidden sm:block">
              <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Status</p>
              <span className={`inline-block px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium ${getStatusColor(lead.leadStatus)}`}>
                {lead.leadStatus}
              </span>
            </div>
          )}

          {/* COMMUNICATION SUMMARY: Primary & Father phone in same row; Calls / SMS on separate rows each */}
          <div>
            {contactOptions.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No phone numbers</p>
            ) : (
              <div className={`grid gap-3 sm:gap-4 ${contactOptions.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                {contactOptions.map((option, index) => {
                  const stats = communicationStatsMap.get(option.number);
                  const callCount = stats?.callCount || 0;
                  const smsCount = stats?.smsCount || 0;
                  const templateUsage = stats?.templateUsage || [];
                  return (
                    <div
                      key={`${option.label}-${option.number}-${index}`}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 p-3 sm:p-3.5"
                    >
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{option.label}</p>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate mt-0.5">{option.number}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1" title="Calls">
                          <svg className="w-3.5 h-3.5 text-green-600 dark:text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{callCount}</span>
                        </span>
                        <span className="inline-flex items-center gap-1" title="SMS">
                          <svg className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{smsCount}</span>
                        </span>
                        {templateUsage.length > 0 && (
                          <span className="text-slate-400 dark:text-slate-500">{templateUsage.length} template{templateUsage.length !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                      {/* Call/SMS buttons - hidden on mobile (sticky action bar used there) */}
                      <div className="hidden sm:flex gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => {
                            setCallData({ contactNumber: option.number, remarks: '', outcome: '', durationSeconds: 0 });
                            setShowCallNumberModal(true);
                          }}
                          className="flex items-center justify-center w-9 h-9 rounded-lg bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 text-slate-700 dark:text-slate-200"
                          aria-label="Call"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSmsData({ selectedNumbers: [option.number], selectedTemplates: {}, languageFilter: 'all' });
                            setShowSmsModal(true);
                          }}
                          className="flex items-center justify-center w-9 h-9 rounded-lg bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300"
                          aria-label="SMS"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* HISTORY & REMARKS */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3 border-b border-slate-200 dark:border-slate-700">
              <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">History & Remarks</p>
              <div className="flex flex-nowrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (lead.nextScheduledCall) {
                      const d = new Date(lead.nextScheduledCall);
                      setScheduleCallDateTime(d.toISOString().slice(0, 16));
                    } else {
                      const now = new Date();
                      now.setMinutes(0, 0, 0);
                      now.setHours(now.getHours() + 1);
                      setScheduleCallDateTime(now.toISOString().slice(0, 16));
                    }
                    setShowScheduleCallModal(true);
                  }}
                  className="inline-flex items-center justify-center gap-1.5 min-h-8 px-3 rounded-md text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white shadow-sm active:scale-[0.98] shrink-0"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {lead.nextScheduledCall ? 'Reschedule' : 'Schedule call'}
                </button>
                {lead.nextScheduledCall && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Clear scheduled call for this lead?')) {
                        scheduleCallMutation.mutate({ nextScheduledCall: null });
                      }
                    }}
                    disabled={scheduleCallMutation.isPending}
                    className="inline-flex items-center justify-center gap-1.5 min-h-8 px-3 rounded-md text-xs font-medium border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-[0.98] disabled:opacity-50 shrink-0"
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear schedule
                  </button>
                )}
              </div>
            </div>
            <div className="px-3 py-2 sm:px-4 sm:py-3 space-y-2">
              {/* Date row */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {lead.lastFollowUp && (
                  <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                    <svg className="w-3.5 h-3.5 shrink-0 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium text-slate-700 dark:text-slate-300">Last follow up</span>
                    <span className="text-slate-900 dark:text-slate-100">{formatDate(lead.lastFollowUp)}</span>
                  </div>
                )}
                {lead.createdAt && (
                  <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                    <svg className="w-3.5 h-3.5 shrink-0 text-emerald-500 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="font-medium text-slate-700 dark:text-slate-300">Created</span>
                    <span className="text-slate-900 dark:text-slate-100">{formatDate(lead.createdAt)}</span>
                  </div>
                )}
                {lead.nextScheduledCall && (
                  <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                    <svg className="w-3.5 h-3.5 shrink-0 text-amber-500 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="font-medium text-slate-700 dark:text-slate-300">Next call</span>
                    <span className="text-slate-900 dark:text-slate-100">{formatDate(lead.nextScheduledCall)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="border-t border-slate-200 dark:border-slate-700 px-3 py-2 sm:px-4 sm:py-3">
              {isLoadingLogs ? (
                <div className="text-center py-4">
                  <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                </div>
              ) : timelineItems.length === 0 ? (
                <p className="text-slate-500 dark:text-slate-400 text-center py-3 text-xs">No history yet</p>
              ) : (
                <div className="relative">
                  <div className="space-y-2">
                    {timelineItems.map((item, index) => {
                      const isCall = item.type === 'call';
                      const isSms = item.type === 'sms';
                      const dotColor = isCall ? 'bg-green-500' : isSms ? 'bg-purple-500' : 'bg-blue-500';
                      const borderColor = isCall ? 'border-green-500' : isSms ? 'border-purple-500' : 'border-blue-500';

                      return (
                        <div key={item.id} className="relative pl-4 sm:pl-6 pb-2 last:pb-0">
                          {index !== timelineItems.length - 1 && (
                            <div className="absolute left-1.5 sm:left-2.5 top-3 bottom-0 w-0.5 bg-gray-300 dark:bg-slate-700"></div>
                          )}
                          <div className={`absolute left-0 top-0.5 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full ${dotColor} border-2 border-white flex items-center justify-center`}>
                            {isCall ? (
                              <svg className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                            ) : isSms ? (
                              <svg className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                            )}
                          </div>
                          <div className={`rounded-md p-2 sm:p-2.5 border-l-2 ${borderColor} bg-slate-50 dark:bg-slate-800/50`}>
                            <div className="flex justify-between items-start gap-1.5 mb-0.5">
                              <div className="min-w-0">
                                <h3 className="text-xs font-medium text-gray-900 dark:text-slate-100 truncate">
                                  {item.title}
                                </h3>
                                <p className="text-[11px] text-gray-500 dark:text-slate-400">
                                  {formatDate(item.date)}
                                </p>
                              </div>
                              {item.performedBy && (
                                <span className="text-[11px] text-gray-500 dark:text-slate-400 shrink-0">
                                  {item.performedBy}
                                </span>
                              )}
                            </div>

                            {/* Call details */}
                            {isCall && (
                              <>
                                <p className="text-xs text-gray-700 dark:text-slate-200 whitespace-pre-wrap line-clamp-3">
                                  {item.description}
                                </p>
                                {(item.metadata?.outcome || item.metadata?.duration) && (
                                  <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
                                    {item.metadata?.outcome && <>Outcome: {item.metadata.outcome}</>}
                                    {item.metadata?.outcome && item.metadata?.duration && ' · '}
                                    {item.metadata?.duration != null && <>Duration: {item.metadata.duration}s</>}
                                  </p>
                                )}
                              </>
                            )}

                            {/* SMS details */}
                            {isSms && (
                              <div className="space-y-1">
                                {item.metadata?.templateName && (
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="text-[11px] font-medium text-gray-500 dark:text-slate-400">Template:</span>
                                    <span className="text-[11px] text-gray-700 dark:text-slate-200">{item.metadata.templateName}</span>
                                    {item.metadata?.status && (
                                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${item.metadata.status === 'success'
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                        : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                        }`}>
                                        {item.metadata.status === 'success' ? 'Sent' : 'Failed'}
                                      </span>
                                    )}
                                  </div>
                                )}
                                {item.metadata?.messageText && (
                                  <div className="bg-white dark:bg-slate-700 rounded p-2 border border-gray-200 dark:border-slate-600">
                                    <p className="text-[11px] text-gray-500 dark:text-slate-400 mb-0.5">Message:</p>
                                    <p className="text-xs text-gray-700 dark:text-slate-200 whitespace-pre-wrap line-clamp-3">
                                      {item.metadata.messageText}
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Other types */}
                            {!isCall && !isSms && (
                              <p className="text-xs text-gray-700 dark:text-slate-200 whitespace-pre-wrap line-clamp-3">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN - Status Changes, Comments, Call History */}
        <div className="space-y-3 sm:space-y-6">
          {/* Status Changes - no card, compact */}
          <div>
            <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2 pb-1 border-b border-slate-200 dark:border-slate-700">Status Changes</p>
            {isLoadingLogs ? (
              <div className="text-center py-3">
                <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : statusChanges.length === 0 ? (
              <p className="text-gray-500 text-center py-3 text-xs sm:text-sm">No status changes</p>
            ) : (
              <div className="space-y-0 max-h-[320px] sm:max-h-[400px] overflow-y-auto">
                {statusChanges.map((log: ActivityLog, index: number) => (
                  <div key={log._id} className="relative pl-6 sm:pl-8 pb-3 sm:pb-4 last:pb-0">
                    {index !== statusChanges.length - 1 && (
                      <div className="absolute left-2.5 sm:left-3 top-4 sm:top-5 bottom-0 w-0.5 bg-blue-200 dark:bg-blue-800"></div>
                    )}
                    <div className="absolute left-0 top-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                    </div>
                    <div className="rounded-lg p-2.5 sm:p-3 border-l-2 border-blue-400 bg-blue-50/50 dark:bg-blue-900/20">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="text-xs font-medium text-gray-900 dark:text-slate-100">
                          {typeof log.performedBy === 'object' ? log.performedBy.name : 'Unknown'}
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-slate-400">
                          {formatDate(log.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${getStatusColor(log.oldStatus || '')}`}>
                          {log.oldStatus || 'N/A'}
                        </span>
                        <span className="text-gray-400">→</span>
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${getStatusColor(log.newStatus || '')}`}>
                          {log.newStatus || 'N/A'}
                        </span>
                      </div>
                      {log.comment && (
                        <p className="text-[11px] sm:text-xs text-gray-600 dark:text-slate-400 mt-1.5 italic line-clamp-2">"{log.comment}"</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comments - no card, compact */}
          <div>
            <div className="flex justify-between items-center mb-2 pb-1 border-b border-slate-200 dark:border-slate-700">
              <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400">Comments</p>
              <Button
                variant="outline"
                size="sm"
                className="text-xs px-2.5 py-1.5"
                onClick={() => {
                  setCommentText('');
                  setShowCommentModal(true);
                }}
              >
                Add
              </Button>
            </div>
            {isLoadingLogs ? (
              <div className="text-center py-3">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : comments.length === 0 ? (
              <p className="text-gray-500 text-center py-3 text-xs sm:text-sm">No comments</p>
            ) : (
              <div className="space-y-0 max-h-[320px] sm:max-h-[400px] overflow-y-auto">
                {comments.map((log: ActivityLog, index: number) => (
                  <div key={log._id} className="relative pl-6 sm:pl-8 pb-3 sm:pb-4 last:pb-0">
                    {index !== comments.length - 1 && (
                      <div className="absolute left-2.5 sm:left-3 top-4 sm:top-5 bottom-0 w-0.5 bg-purple-200 dark:bg-purple-800"></div>
                    )}
                    <div className="absolute left-0 top-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-purple-500 border-2 border-white flex items-center justify-center">
                      <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="rounded-lg p-2.5 sm:p-3 border-l-2 border-purple-400 bg-purple-50/50 dark:bg-purple-900/20">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className="text-xs font-medium text-gray-900 dark:text-slate-100">
                          {typeof log.performedBy === 'object' ? log.performedBy.name : 'Unknown'}
                        </span>
                        <span className="text-[11px] text-gray-500 dark:text-slate-400">
                          {formatDate(log.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 dark:text-slate-300 whitespace-pre-wrap line-clamp-3 sm:line-clamp-none">
                        {log.comment}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Call History - no card, compact */}
          <div>
            <p className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2 pb-1 border-b border-slate-200 dark:border-slate-700">Call History</p>
            {isLoadingCommunications ? (
              <div className="text-center py-3">
                <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : callLogs.length === 0 ? (
              <p className="text-gray-500 text-center py-3 text-xs sm:text-sm">No calls yet</p>
            ) : (
              <div className="space-y-0 max-h-[320px] sm:max-h-[400px] overflow-y-auto">
                {callLogs.map((call, index) => {
                  const callWithSequence = call as CommunicationRecord & { sequenceNumber: number; ordinal: string };
                  const iconColors = getCallOutcomeIconColor(call.callOutcome);
                  return (
                    <div key={call._id} className="relative pl-6 sm:pl-8 pb-3 sm:pb-4 last:pb-0">
                      {index !== callLogs.length - 1 && (
                        <div className={`absolute left-2.5 sm:left-3 top-4 sm:top-5 bottom-0 w-0.5 bg-gradient-to-b ${iconColors.line}`}></div>
                      )}
                      <div className={`absolute left-0 top-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full ${iconColors.iconBg} border-2 border-white flex items-center justify-center`}>
                        <svg className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </div>
                      <div className={`rounded-lg p-2.5 sm:p-3 border-l-2 ${iconColors.cardBorder} bg-gradient-to-r ${iconColors.cardBg} to-transparent`}>
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="text-xs sm:text-sm font-medium text-gray-900 dark:text-slate-100">
                            {callWithSequence.ordinal} · {call.contactNumber}
                          </span>
                          <span className="text-[11px] text-gray-500 dark:text-slate-400">
                            {formatDate(call.sentAt)}
                          </span>
                          {typeof call.sentBy === 'object' && call.sentBy && (
                            <span className="text-[11px] text-gray-500 dark:text-slate-400">· {call.sentBy.name}</span>
                          )}
                        </div>
                        {call.remarks && (
                          <p className="text-[11px] sm:text-xs text-gray-600 dark:text-slate-400 whitespace-pre-wrap line-clamp-2 mb-1.5">
                            {call.remarks}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {call.callOutcome && (
                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${getCallOutcomeColor(call.callOutcome)}`}>
                              {call.callOutcome}
                            </span>
                          )}
                          {call.durationSeconds && (
                            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                              {call.durationSeconds}s
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">Assign to Counsellor</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Counsellor
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">Select a counsellor...</option>
                  {users.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.name} {u.designation ? `(${u.designation})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={handleAssign}
                  disabled={!selectedUserId || assignMutation.isPending}
                >
                  {assignMutation.isPending ? 'Assigning...' : 'Assign'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedUserId('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Status Update Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">Update Status</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Status: <span className="font-semibold">{lead.leadStatus || 'New'}</span>
                </label>
                <label className="block text-sm font-medium text-gray-700 mb-1 mt-3">
                  New Status
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                >
                  <option value="">Keep Current Status</option>
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Remarks (Optional)
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                  value={statusComment}
                  onChange={(e) => setStatusComment(e.target.value)}
                  placeholder="Add remarks about this status change..."
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={handleStatusUpdate}
                  disabled={statusUpdateMutation.isPending}
                >
                  {statusUpdateMutation.isPending ? 'Updating...' : 'Update Status'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowStatusModal(false);
                    setNewStatus('');
                    setStatusComment('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Lead</h2>
            <div className="space-y-4">
              <p className="text-gray-700">
                Are you sure you want to delete this lead? This action cannot be undone.
              </p>
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Enquiry Number:</span> {lead.enquiryNumber || 'N/A'}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Name:</span>{' '}
                  <span className="inline-flex items-center gap-2">
                    <span>{lead.name}</span>
                    {lead.isNRI && (
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded">
                        NRI
                      </span>
                    )}
                  </span>
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete Lead'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Schedule next call Modal */}
      {showScheduleCallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Schedule next call</h2>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 mb-3">
              Set date and time for the next follow-up call.
            </p>
            <div className="mb-4">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Date & time</label>
              <input
                type="datetime-local"
                value={scheduleCallDateTime}
                onChange={(e) => setScheduleCallDateTime(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                min={new Date().toISOString().slice(0, 16)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                className="text-xs sm:text-sm px-3 py-2"
                onClick={() => {
                  if (!scheduleCallDateTime.trim()) {
                    showToast.error('Please select date and time');
                    return;
                  }
                  scheduleCallMutation.mutate({
                    nextScheduledCall: new Date(scheduleCallDateTime).toISOString(),
                  });
                }}
                disabled={scheduleCallMutation.isPending}
              >
                {scheduleCallMutation.isPending ? 'Saving...' : 'Save'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs sm:text-sm px-3 py-2"
                onClick={() => {
                  setShowScheduleCallModal(false);
                  setScheduleCallDateTime('');
                }}
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Comment Modal */}
      {showCommentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">Add Comment</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comment
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment..."
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={handleAddComment}
                  disabled={!commentText.trim() || commentMutation.isPending}
                >
                  {commentMutation.isPending ? 'Adding...' : 'Add Comment'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCommentModal(false);
                    setCommentText('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Call Number Selection Modal - radio options, theme styling */}
      {showCallNumberModal && lead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="max-w-md w-full p-4 sm:p-5">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Select Number to Call</h2>
            <div className="space-y-2">
              {contactOptions.map((option, index) => {
                const stats = communicationStatsMap.get(option.number);
                const callCount = stats?.callCount || 0;
                const isSelected = selectedCallNumber === option.number;
                return (
                  <label
                    key={`${option.label}-${option.number}-${index}`}
                    className={`flex items-center gap-3 w-full p-3 rounded-lg border-2 cursor-pointer transition-all ${isSelected
                      ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-500'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                      }`}
                  >
                    <input
                      type="radio"
                      name="callNumber"
                      value={option.number}
                      checked={isSelected}
                      onChange={() => setSelectedCallNumber(option.number)}
                      className="h-4 w-4 accent-orange-500 border-slate-300 focus:ring-orange-500 focus:ring-2"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{option.label}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{option.number}</p>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Calls: {callCount}</span>
                  </label>
                );
              })}
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={() => {
                  if (!selectedCallNumber) {
                    showToast.error('Please select a number');
                    return;
                  }
                  setShowCallNumberModal(false);
                  window.location.href = `tel:${selectedCallNumber.replace(/\s/g, '')}`;
                  setTimeout(() => {
                    setCallData({ contactNumber: selectedCallNumber, remarks: '', outcome: '', durationSeconds: 0 });
                    setShowCallRemarksModal(true);
                  }, 1000);
                }}
                disabled={!selectedCallNumber}
              >
                Call
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowCallNumberModal(false);
                  setSelectedCallNumber('');
                }}
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Log Call Details Modal - compact, optimised */}
      {showCallRemarksModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50">
          <Card className="max-w-md w-full p-4 sm:p-5">
            <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3">Log Call Details</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="min-w-0">
                  <p className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">Contact</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{callData.contactNumber}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Call #</p>
                  <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                    {(communicationStatsMap.get(callData.contactNumber)?.callCount || 0) + 1}
                  </p>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Outcome *</label>
                <select
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={callData.outcome}
                  onChange={(e) => setCallData({ ...callData, outcome: e.target.value })}
                >
                  <option value="">Select outcome...</option>
                  <option value="callback_requested">Call back</option>
                  <option value="switch_off">Switch off</option>
                  <option value="answered">Answered</option>
                  <option value="no_answer">No Answer</option>
                  <option value="busy">Busy</option>
                  <option value="voicemail">Voicemail</option>
                  <option value="interested">Interested</option>
                  <option value="not_interested">Not Interested</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Duration (sec) – optional</label>
                <Input
                  type="number"
                  value={callData.durationSeconds || ''}
                  onChange={(e) => setCallData({ ...callData, durationSeconds: parseInt(e.target.value) || 0 })}
                  placeholder="e.g. 120"
                  min="0"
                  className="text-sm py-2"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Remarks – optional</label>
                <textarea
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[80px] dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  value={callData.remarks}
                  onChange={(e) => setCallData({ ...callData, remarks: e.target.value })}
                  placeholder="Add call remarks..."
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  onClick={() => callMutation.mutate(callData)}
                  disabled={!callData.outcome || callMutation.isPending}
                >
                  {callMutation.isPending ? 'Saving...' : 'Save Call'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowCallRemarksModal(false);
                    setCallData({ contactNumber: '', remarks: '', outcome: '', durationSeconds: 0 });
                    setSelectedCallNumber('');
                  }}
                >
                  Skip
                </Button>
              </div>

              {/* Separate 'Log & Next' row for better mobile ergonomics */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30 border-blue-200 dark:border-blue-800"
                  onClick={() => callMutation.mutate({ ...callData, next: true })}
                  disabled={!callData.outcome || callMutation.isPending || !nextLeadId}
                >
                  {callMutation.isPending ? 'Saving...' : 'Log & Next Lead →'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* SMS Modal */}
      {showSmsModal && lead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 overflow-y-auto">
          <div className="flex min-h-full w-full items-start sm:items-center justify-center py-4 sm:py-8">
            <Card noPadding className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl">
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="flex-none p-3 sm:p-6 space-y-3 sm:space-y-6 overflow-y-auto">
                  <div className="flex items-start justify-between gap-2 bg-white dark:bg-slate-900 z-10 pb-2 border-b border-slate-200 dark:border-slate-700">
                    <div className="min-w-0">
                      <h2 className="text-base sm:text-xl font-semibold text-slate-900 dark:text-slate-100">Send SMS</h2>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 mt-0.5">
                        Select recipients and templates.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSmsModal(false);
                        setSmsData({ selectedNumbers: [], selectedTemplates: {}, languageFilter: 'all' });
                      }}
                      className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                      disabled={smsMutation.isPending}
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
                    {/* Left: Recipients */}
                    <div className="lg:col-span-1 space-y-2 sm:space-y-4">
                      <div>
                        <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200 mb-1.5">Recipients</h3>
                        {contactOptions.length === 0 ? (
                          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">No phone numbers.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {contactOptions.map((option, index) => {
                              const stats = communicationStatsMap.get(option.number);
                              const smsCount = stats?.smsCount || 0;
                              const isSelected = smsData.selectedNumbers.includes(option.number);

                              return (
                                <label
                                  key={`${option.label}-${option.number}-${index}`}
                                  className={`flex items-start gap-2 p-2 sm:p-2.5 border rounded-lg cursor-pointer transition-all ${isSelected
                                    ? 'bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-600'
                                    : 'bg-white border-gray-200 hover:bg-gray-50 dark:bg-slate-900/50 dark:border-slate-700 dark:hover:bg-slate-800/60'
                                    }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSmsData({
                                          ...smsData,
                                          selectedNumbers: [...smsData.selectedNumbers, option.number],
                                        });
                                      } else {
                                        setSmsData({
                                          ...smsData,
                                          selectedNumbers: smsData.selectedNumbers.filter((n) => n !== option.number),
                                        });
                                      }
                                    }}
                                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs sm:text-sm font-medium text-gray-800 dark:text-slate-100 truncate">
                                      {option.label}
                                    </div>
                                    <div className="text-[11px] sm:text-xs text-gray-500 dark:text-slate-400 truncate">
                                      {option.number}
                                    </div>
                                    <div className="text-[10px] sm:text-[11px] text-gray-400 dark:text-slate-500 mt-0.5">
                                      Sent: {smsCount}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                        <p className="text-[11px] sm:text-xs text-gray-500 dark:text-slate-400 mt-1.5">
                          {smsData.selectedNumbers.length} selected
                        </p>

                        <div className="space-y-1.5 mt-2 sm:mt-3">
                          <label className="block text-xs font-medium text-gray-700 dark:text-slate-300">
                            Language
                          </label>
                          <select
                            className="w-full px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                            value={smsData.languageFilter}
                            onChange={(e) => setSmsData({ ...smsData, languageFilter: e.target.value })}
                          >
                            <option value="all">All Languages</option>
                            {availableLanguages.map((lang) => (
                              <option key={lang} value={lang}>
                                {lang.toUpperCase()}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Right: Templates */}
                    <div className="lg:col-span-2 space-y-2 sm:space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm sm:text-base font-semibold text-slate-800 dark:text-slate-200">Templates</h3>
                        <span className="text-[11px] sm:text-xs text-gray-500 dark:text-slate-400">
                          {Object.keys(smsData.selectedTemplates).length} selected
                        </span>
                      </div>

                      {isLoadingTemplates ? (
                        <div className="text-center py-4 sm:py-6">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                        </div>
                      ) : filteredTemplates.length === 0 ? (
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400">
                          No active templates.
                        </p>
                      ) : (
                        <div className="space-y-2 sm:space-y-3">
                          {filteredTemplates.map((template) => {
                            const templateState = smsData.selectedTemplates[template._id];
                            const variableDescriptors: MessageTemplateVariable[] =
                              template.variables && template.variables.length > 0
                                ? template.variables
                                : Array.from({ length: template.variableCount }).map((_, index) => ({
                                  key: `var${index + 1}`,
                                  label: `Variable ${index + 1}`,
                                })) as MessageTemplateVariable[];

                            return (
                              <div
                                key={template._id}
                                className="border border-gray-200 dark:border-slate-700 rounded-lg p-2.5 sm:p-3 space-y-2 sm:space-y-3"
                              >
                                <label className="flex items-start gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(templateState)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSmsData({
                                          ...smsData,
                                          selectedTemplates: {
                                            ...smsData.selectedTemplates,
                                            [template._id]: {
                                              template,
                                              variables: buildDefaultTemplateValues(template),
                                            },
                                          },
                                        });
                                      } else {
                                        const newTemplates = { ...smsData.selectedTemplates };
                                        delete newTemplates[template._id];
                                        setSmsData({
                                          ...smsData,
                                          selectedTemplates: newTemplates,
                                        });
                                      }
                                    }}
                                    className="mt-0.5 h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs sm:text-sm font-medium text-gray-800 dark:text-slate-100 truncate">
                                      {template.name}
                                    </div>
                                    <div className="text-[11px] sm:text-xs text-gray-500 dark:text-slate-400">
                                      {template.language?.toUpperCase() || 'N/A'} · {template.variableCount} var(s)
                                    </div>
                                  </div>
                                </label>

                                {templateState && (
                                  <div className="space-y-2 sm:space-y-3 ml-5 sm:ml-7">
                                    {variableDescriptors.length > 0 && (
                                      <div className="space-y-1.5">
                                        {variableDescriptors.map((variable, index) => {
                                          const key = variable.key || `var${index + 1}`;
                                          return (
                                            <div
                                              key={`${template._id}-${key}`}
                                              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                                            >
                                              <div>
                                                <label className="block text-[11px] sm:text-xs font-medium text-gray-600 dark:text-slate-400 mb-0.5">
                                                  {variable.label || `Var ${index + 1}`}
                                                </label>
                                                <Input
                                                  value={templateState.variables[key] || ''}
                                                  onChange={(e) => {
                                                    setSmsData({
                                                      ...smsData,
                                                      selectedTemplates: {
                                                        ...smsData.selectedTemplates,
                                                        [template._id]: {
                                                          ...templateState,
                                                          variables: {
                                                            ...templateState.variables,
                                                            [key]: e.target.value,
                                                          },
                                                        },
                                                      },
                                                    });
                                                  }}
                                                  placeholder={
                                                    index === 0 && lead?.name
                                                      ? lead.name
                                                      : variable.defaultValue || ''
                                                  }
                                                  className="text-xs sm:text-sm py-1.5 sm:py-2"
                                                />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                    <div className="bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700 rounded-lg p-2 sm:p-3">
                                      <p className="text-[10px] sm:text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Preview</p>
                                      <p className="text-[11px] sm:text-xs text-gray-700 dark:text-slate-300 whitespace-pre-wrap line-clamp-3 sm:line-clamp-none">
                                        {renderTemplatePreview(template, templateState.variables)}
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center gap-2 sm:gap-3 pt-2 sm:pt-3 flex-wrap border-t border-gray-200 dark:border-slate-700 sticky bottom-0 bg-white dark:bg-slate-900">
                    <div className="text-[11px] sm:text-xs text-gray-500 dark:text-slate-400">
                      {smsData.selectedNumbers.length === 0
                        ? 'Select a contact.'
                        : Object.keys(smsData.selectedTemplates).length === 0
                          ? 'Select a template.'
                          : `Send (${Object.keys(smsData.selectedTemplates).length} template${Object.keys(smsData.selectedTemplates).length > 1 ? 's' : ''})`}
                    </div>
                    <div className="flex gap-1.5 sm:gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs px-2.5 py-1.5 sm:px-3 sm:py-2"
                        onClick={() => {
                          setShowSmsModal(false);
                          setSmsData({ selectedNumbers: [], selectedTemplates: {}, languageFilter: 'all' });
                        }}
                        disabled={smsMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        className="text-xs px-2.5 py-1.5 sm:px-3 sm:py-2"
                        onClick={() => {
                          if (smsData.selectedNumbers.length === 0) {
                            showToast.error('Please select at least one contact number');
                            return;
                          }
                          if (Object.keys(smsData.selectedTemplates).length === 0) {
                            showToast.error('Please select at least one template');
                            return;
                          }

                          // Build templates payload
                          const templatesPayload = Object.values(smsData.selectedTemplates).map(({ template, variables }) => {
                            const variablesArray =
                              template.variables && template.variables.length > 0
                                ? template.variables.map((variable, index) => ({
                                  key: variable.key || `var${index + 1}`,
                                  value: variables[variable.key || `var${index + 1}`] || '',
                                }))
                                : Array.from({ length: template.variableCount }).map((_, index) => {
                                  const key = `var${index + 1}`;
                                  return {
                                    key,
                                    value: variables[key] || '',
                                  };
                                });

                            return {
                              templateId: template._id,
                              variables: variablesArray,
                            };
                          });

                          smsMutation.mutate({
                            contactNumbers: smsData.selectedNumbers,
                            templates: templatesPayload,
                          });
                        }}
                        disabled={
                          smsMutation.isPending ||
                          smsData.selectedNumbers.length === 0 ||
                          Object.keys(smsData.selectedTemplates).length === 0
                        }
                      >
                        {smsMutation.isPending ? 'Sending...' : 'Send Message'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
