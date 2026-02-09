'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
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

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
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
  
  const isSuperAdmin = user?.roleName === 'Super Admin' || user?.roleName === 'Sub Super Admin';
  const canDeleteLead = user?.roleName === 'Super Admin';
  const isManager = user?.isManager === true;
  
  // Get the appropriate leads page URL based on user role
  const getLeadsPageUrl = () => {
    if (isSuperAdmin) return '/superadmin/leads';
    if (isManager) return '/manager/leads';
    return '/user/dashboard'; // Regular users don't have a leads list page, redirect to dashboard
  };

  // Check authentication - allow all authenticated users (Super Admin, Manager, User)
  useEffect(() => {
    setIsMounted(true);
    const currentUser = auth.getUser();
    if (!currentUser) {
      router.push('/auth/login');
      return;
    }
    // Allow all authenticated users to view leads (access control is handled by backend)
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
    enabled: showAssignModal && isSuperAdmin,
  });

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
      } else if (log.type === 'quota_change' || log.metadata?.fieldUpdate) {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href={getLeadsPageUrl()}>
            <Button size="sm" variant="outline">
              ← Back to Leads
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Lead Details
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-2">
                <span>{lead.name}</span>
                {lead.isNRI && (
                  <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded">
                    NRI
                  </span>
                )}
                {lead.needsManualUpdate && (
                  <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 rounded" title="District or mandal may not match master data. Please update manually.">
                    Needs update
                  </span>
                )}
              </span>
              {lead.enquiryNumber ? ` · Enquiry #${lead.enquiryNumber}` : ''}
            </p>
          </div>
        </div>
      </div>
    );

    return () => clearHeaderContent();
  }, [lead, user, isSuperAdmin, isManager, router, setHeaderContent, clearHeaderContent]);

  // Normalize state/district for API lookup (e.g. "AP" -> "Andhra Pradesh", "Guntur District" -> "Guntur")
  const normalizeStateForLookup = (s: string) => {
    const t = (s || '').trim();
    if (/^ap$/i.test(t)) return 'Andhra Pradesh';
    return t || undefined;
  };
  const stripDistrictSuffix = (s: string) =>
    (s || '').replace(/\s+(dist(rict)?|dt\.?)\s*$/i, '').trim() || s;

  const selectedState = formData.state ?? lead?.state ?? '';
  const selectedDistrict = formData.district ?? lead?.district ?? '';
  const selectedDistrictForFetch = stripDistrictSuffix(selectedDistrict) || selectedDistrict;
  const { stateNames, districtNames, mandalNames } = useLocations({
    stateName: normalizeStateForLookup(selectedState) || undefined,
    districtName: selectedDistrictForFetch || undefined,
  });

  // Include lead's district/mandal in options when not in master list (ensures prefilling works for variations)
  const currentDistrict = formData.district ?? lead?.district ?? '';
  const currentMandal = formData.mandal ?? lead?.mandal ?? '';
  const availableDistricts =
    currentDistrict && !districtNames.includes(currentDistrict)
      ? [currentDistrict, ...districtNames]
      : districtNames;
  const availableMandals =
    currentMandal && !mandalNames.includes(currentMandal)
      ? [currentMandal, ...mandalNames]
      : mandalNames;

  // Initialize form data (normalize state "AP" -> "Andhra Pradesh" for dropdown match)
  useEffect(() => {
    if (lead && !isEditing) {
      const rawState = lead.state || 'Andhra Pradesh';
      const stateForForm = /^ap$/i.test((rawState || '').trim()) ? 'Andhra Pradesh' : rawState;
      setFormData({
        name: lead.name,
        phone: lead.phone,
        fatherName: lead.fatherName,
        fatherPhone: lead.fatherPhone,
        village: lead.village,
        mandal: lead.mandal,
        district: lead.district,
        state: stateForForm,
        applicationStatus: lead.applicationStatus,
        academicYear: lead.academicYear,
        studentGroup: lead.studentGroup,
        hallTicketNumber: lead.hallTicketNumber,
        gender: lead.gender,
        interCollege: lead.interCollege,
        rank: lead.rank,
      });
    }
  }, [lead, isEditing]);

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
    mutationFn: async (data: typeof callData) => {
      return await communicationAPI.logCall(leadId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId, 'communications'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId, 'communicationStats'] });
      queryClient.invalidateQueries({ queryKey: ['lead', leadId, 'activityLogs'] });
      setShowCallRemarksModal(false);
      setCallData({ contactNumber: '', remarks: '', outcome: '', durationSeconds: 0 });
      setSelectedCallNumber('');
      showToast.success('Call logged successfully!');
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
    
    // Neutral/Warning outcomes - Yellow/Orange (call back, callback_requested)
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
    
    // Neutral/Warning outcomes - Yellow/Orange (call back, callback_requested)
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
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading lead details...</p>
        </div>
      </div>
    );
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
    <div className="mx-auto w-full max-w-[98vw] space-y-6 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      {lead?.needsManualUpdate && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-200" role="alert">
          <strong>Details need manual update.</strong> This lead was bulk-uploaded and district or mandal may not match master data. Please review and correct in the form below.
        </div>
      )}
      {/* MAIN CONTENT - 2 Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN - Student Details & History */}
        <div className="lg:col-span-2 space-y-6">
          {/* SECTION 1: STUDENT DETAILS */}
          <Card>
            <h2 className="text-xl font-semibold mb-6">Student Details</h2>
            {isEditing ? (
              <form onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      value={formData.academicYear ?? ''}
                      onChange={(e) => setFormData({ ...formData, academicYear: e.target.value ? Number(e.target.value) : undefined })}
                    >
                      <option value="">—</option>
                      {[2024, 2025, 2026, 2027].map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Student Group</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      value={formData.studentGroup || ''}
                      onChange={(e) => setFormData({ ...formData, studentGroup: e.target.value })}
                    >
                      <option value="">—</option>
                      {['10th', 'Inter', 'Inter-MPC', 'Inter-BIPC', 'Degree', 'Diploma'].map((g) => (
                        <option key={g} value={g}>{g}</option>
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
            ) : (
              <div className="space-y-6">
                  {/* Badges at top - single line */}
                  <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
                    {lead.enquiryNumber && (
                      <span className="px-3 py-1.5 text-sm font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-800 whitespace-nowrap flex-shrink-0">
                        #{lead.enquiryNumber}
                      </span>
                    )}
                    <span className={`px-3 py-1.5 text-sm font-medium rounded-full border whitespace-nowrap flex-shrink-0 ${getStatusColor(lead.leadStatus)}`}>
                      {lead.leadStatus || 'New'}
                    </span>
                    {lead.source && (
                      <span className="px-3 py-1.5 text-sm font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded-full border border-green-200 dark:border-green-800 whitespace-nowrap flex-shrink-0">
                        {lead.source}
                      </span>
                    )}
                  </div>

                {/* Main student details - larger font with gender and email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-4 sm:mb-6">
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1 sm:mb-2">Name</label>
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <p className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 break-words">{lead.name}</p>
                      {lead.isNRI && (
                        <span className="px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded whitespace-nowrap">
                          NRI
                        </span>
                      )}
                      {lead.gender && (
                        <span className="px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded whitespace-nowrap">
                          {lead.gender.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1 sm:mb-2">Phone</label>
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <p className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 break-all">{lead.phone || '-'}</p>
                    </div>
                  </div>
                </div>

                {/* Address Information - without heading */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-4 sm:mb-6">
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">Village</label>
                    <p className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 break-words">{lead.village}</p>
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">Mandal/Tehsil</label>
                    <p className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 break-words">{lead.mandal}</p>
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">District</label>
                    <p className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 break-words">{lead.district}</p>
                  </div>
                </div>

                {/* Parent Information */}
                <div>
                  <h3 className="text-sm sm:text-base font-medium text-gray-900 dark:text-gray-100 mb-3 sm:mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">Parent Information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                    <div>
                      <label className="block text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">Father Name</label>
                      <p className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 break-words">{lead.fatherName}</p>
                    </div>
                    <div>
                      <label className="block text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-1">Father Phone</label>
                      <p className="text-xs sm:text-sm text-gray-900 dark:text-gray-100 break-all">{lead.fatherPhone}</p>
                    </div>
                  </div>
                </div>

                {/* Expandable Additional Details Section */}
                <div className="relative border-t border-gray-200 dark:border-gray-700 pt-6">
                  {/* Vignette effect at bottom when collapsed */}
                  {!isDetailsExpanded && (
                    <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-white via-white/60 to-transparent dark:from-slate-900 dark:via-slate-900/60 dark:to-transparent pointer-events-none z-10 rounded-b-lg"></div>
                  )}
                  
                  {/* Expandable content */}
                  {isDetailsExpanded && (
                    <div className="space-y-6 pb-6">
                      {/* Student Additional Details */}
                      {(lead.rank || lead.interCollege || lead.hallTicketNumber) && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Additional Student Details</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {lead.rank && (
                              <div>
                                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Rank</label>
                                <p className="text-sm text-gray-900 dark:text-gray-100">{lead.rank}</p>
                              </div>
                            )}
                            {lead.interCollege && (
                              <div>
                                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Inter College</label>
                                <p className="text-sm text-gray-900 dark:text-gray-100">{lead.interCollege}</p>
                              </div>
                            )}
                            {lead.hallTicketNumber && (
                              <div>
                                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Hall Ticket Number</label>
                                <p className="text-sm text-gray-900 dark:text-gray-100">{lead.hallTicketNumber}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Additional Address Information */}
                      <div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          <div>
                            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">State</label>
                            <p className="text-sm text-gray-900 dark:text-gray-100">{lead.state || '-'}</p>
                          </div>
                          {lead.applicationStatus && (
                            <div>
                              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Application Status</label>
                              <p className="text-sm text-gray-900 dark:text-gray-100">{lead.applicationStatus}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Additional Information */}
                      {(lead.assignedTo || lead.utmSource || lead.utmMedium || lead.utmCampaign) && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Additional Information</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {lead.assignedTo && (
                              <div>
                                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Assigned To</label>
                                <p className="text-sm text-gray-900 dark:text-gray-100">
                                  {typeof lead.assignedTo === 'object' ? lead.assignedTo.name : '-'}
                                </p>
                              </div>
                            )}
                            {lead.utmSource && (
                              <div>
                                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">UTM Source</label>
                                <p className="text-sm text-gray-900 dark:text-gray-100">{lead.utmSource}</p>
                              </div>
                            )}
                            {lead.utmMedium && (
                              <div>
                                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">UTM Medium</label>
                                <p className="text-sm text-gray-900 dark:text-gray-100">{lead.utmMedium}</p>
                              </div>
                            )}
                            {lead.utmCampaign && (
                              <div>
                                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">UTM Campaign</label>
                                <p className="text-sm text-gray-900 dark:text-gray-100">{lead.utmCampaign}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Custom / Other fields (e.g. from bulk upload columns not in main form) */}
                      {lead.dynamicFields && typeof lead.dynamicFields === 'object' && Object.keys(lead.dynamicFields).length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Other fields</h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {Object.entries(lead.dynamicFields)
                              .filter(([, value]) => value != null && String(value).trim() !== '')
                              .map(([key, value]) => (
                                <div key={key}>
                                  <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                                  </label>
                                  <p className="text-sm text-gray-900 dark:text-gray-100 break-words">{String(value)}</p>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Expand/Collapse Button with Icon - Positioned at bottom center */}
                  <div className="flex justify-center mt-4 sm:mt-6 relative z-20">
                    <button
                      onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                      className="flex flex-col items-center gap-1 px-4 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-all rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800/50 group"
                    >
                      {isDetailsExpanded ? (
                        <>
                          <svg className="w-5 h-5 sm:w-6 sm:h-6 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                          <span className="text-[10px] sm:text-xs">Show Less</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5 sm:w-6 sm:h-6 transition-transform group-hover:scale-110 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                          <span className="text-[10px] sm:text-xs">Show More Details</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* COMMUNICATION SUMMARY */}
          <Card>
            <h2 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-6 pb-2 border-b border-gray-200 dark:border-gray-700">Communication Summary</h2>
            {contactOptions.length === 0 ? (
              <p className="text-sm text-gray-500">No phone numbers available for this lead.</p>
            ) : (
              <div className="space-y-4">
                {contactOptions.map((option, index) => {
                  const stats = communicationStatsMap.get(option.number);
                  const callCount = stats?.callCount || 0;
                  const smsCount = stats?.smsCount || 0;
                  const templateUsage = stats?.templateUsage || [];
                  
                  return (
                    <div
                      key={`${option.label}-${option.number}-${index}`}
                      className="rounded-lg border border-gray-200 dark:border-slate-700 p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-slate-100">
                            {option.label}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                            {option.number}
                          </div>
                        </div>
                        <div className="text-right text-sm">
                          <div className="text-gray-600 dark:text-slate-400">
                            Calls: <span className="font-medium text-gray-900 dark:text-slate-100">{callCount}</span>
                          </div>
                          <div className="text-gray-600 dark:text-slate-400">
                            SMS: <span className="font-medium text-gray-900 dark:text-slate-100">{smsCount}</span>
                          </div>
                        </div>
                      </div>
                      
                      {templateUsage.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-700">
                          <div className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">
                            Template Usage:
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {templateUsage.map((usage) => (
                              <span
                                key={usage.templateId}
                                className="px-2 py-1 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded text-xs"
                              >
                                {usage.templateName || usage.templateId}: {usage.count}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex flex-col sm:flex-row gap-2 mt-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setCallData({ contactNumber: option.number, remarks: '', outcome: '', durationSeconds: 0 });
                            setShowCallNumberModal(true);
                          }}
                          className="w-full sm:w-auto text-xs sm:text-sm"
                        >
                          Call {option.label}
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setSmsData({ 
                              selectedNumbers: [option.number], 
                              selectedTemplates: {}, 
                              languageFilter: 'all' 
                            });
                            setShowSmsModal(true);
                          }}
                          className="w-full sm:w-auto text-xs sm:text-sm"
                        >
                          Send Message
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* SECTION 2: HISTORY & REMARKS */}
          <Card>
            <div className="mb-6">
              <h2 className="text-base font-medium text-gray-900 dark:text-gray-100 mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">History & Remarks</h2>
              {/* Last Follow Up & Created On Info */}
              <div className="flex flex-wrap gap-4 text-sm">
                {lead.lastFollowUp && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Last Follow Up:</span>
                    <span className="text-gray-900 dark:text-gray-100">{formatDate(lead.lastFollowUp)}</span>
                  </div>
                )}
                {lead.createdAt && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Created On:</span>
                    <span className="text-gray-900 dark:text-gray-100">{formatDate(lead.createdAt)}</span>
                  </div>
                )}
                {lead.nextScheduledCall && (
                  <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="font-medium text-gray-700 dark:text-gray-300">Next scheduled call:</span>
                    <span className="text-gray-900 dark:text-gray-100">{formatDate(lead.nextScheduledCall)}</span>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
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
                >
                  {lead.nextScheduledCall ? 'Reschedule next call' : 'Schedule next call'}
                </Button>
                {lead.nextScheduledCall && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/20"
                    onClick={() => {
                      if (window.confirm('Clear scheduled call for this lead?')) {
                        scheduleCallMutation.mutate({ nextScheduledCall: null });
                      }
                    }}
                    disabled={scheduleCallMutation.isPending}
                  >
                    Clear schedule
                  </Button>
                )}
              </div>
            </div>
            {isLoadingLogs ? (
              <div className="text-center py-8">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : timelineItems.length === 0 ? (
              <p className="text-gray-500 text-center py-8">No history available</p>
            ) : (
              <div className="relative">
                {/* Timeline */}
                <div className="space-y-6">
                  {timelineItems.map((item, index) => {
                    const isCall = item.type === 'call';
                    const isSms = item.type === 'sms';
                    const dotColor = isCall ? 'bg-green-500' : isSms ? 'bg-purple-500' : 'bg-blue-500';
                    const borderColor = isCall ? 'border-green-500' : isSms ? 'border-purple-500' : 'border-blue-500';
                    
                    return (
                      <div key={item.id} className="relative pl-6 sm:pl-8 pb-4 sm:pb-6 last:pb-0">
                        {/* Timeline line */}
                        {index !== timelineItems.length - 1 && (
                          <div className="absolute left-2.5 sm:left-3 top-5 sm:top-6 bottom-0 w-0.5 bg-gray-300 dark:bg-slate-700"></div>
                        )}
                        {/* Timeline dot */}
                        <div className={`absolute left-0 top-0.5 sm:top-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full ${dotColor} border-2 border-white shadow-md flex items-center justify-center`}>
                          {isCall ? (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                          ) : isSms ? (
                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-white"></div>
                          )}
                        </div>
                        {/* Content */}
                        <div className={`rounded-lg p-4 border-l-2 ${borderColor} bg-white dark:bg-slate-900/50`}>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="text-sm font-medium text-gray-900 dark:text-slate-100">
                                {item.title}
                              </h3>
                              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                                {formatDate(item.date)}
                              </p>
                            </div>
                            {item.performedBy && (
                              <span className="text-xs text-gray-500 dark:text-slate-400">
                                by {item.performedBy}
                              </span>
                            )}
                          </div>
                          
                          {/* Call details */}
                          {isCall && (
                            <>
                              <p className="text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap">
                                {item.description}
                              </p>
                              {item.metadata?.outcome && (
                                <p className="text-xs text-gray-500 dark:text-slate-400 mt-2">
                                  Outcome: {item.metadata.outcome}
                                </p>
                              )}
                              {item.metadata?.duration && (
                                <p className="text-xs text-gray-500 dark:text-slate-400">
                                  Duration: {item.metadata.duration}s
                                </p>
                              )}
                            </>
                          )}
                          
                          {/* SMS details */}
                          {isSms && (
                            <div className="space-y-2">
                              {item.metadata?.templateName && (
                                <div>
                                  <span className="text-xs font-medium text-gray-500 dark:text-slate-400">Template: </span>
                                  <span className="text-xs text-gray-700 dark:text-slate-200">{item.metadata.templateName}</span>
                                  {item.metadata?.status && (
                                    <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                                      item.metadata.status === 'success' 
                                        ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' 
                                        : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                    }`}>
                                      {item.metadata.status === 'success' ? 'Sent' : 'Failed'}
                                    </span>
                                  )}
                                </div>
                              )}
                              {item.metadata?.messageText && (
                                <div className="bg-white dark:bg-slate-700 rounded p-3 border border-gray-200 dark:border-slate-600">
                                  <p className="text-xs text-gray-500 dark:text-slate-400 mb-1">Message:</p>
                                  <p className="text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap">
                                    {item.metadata.messageText}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Other types */}
                          {!isCall && !isSms && (
                            <p className="text-sm text-gray-700 dark:text-slate-200 whitespace-pre-wrap">
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
          </Card>
        </div>

        {/* RIGHT COLUMN - Action Bar, Metadata, Status Changes, Comments */}
        <div className="space-y-6">
          {/* ACTION BAR - Grid Layout with Icons */}
          <Card>
            <h2 className="text-xl font-semibold mb-4">Actions</h2>
            <div className="grid grid-cols-2 gap-3">
              {/* Assign */}
              <button
                onClick={() => {
                  setShowAssignModal(true);
                  setSelectedUserId('');
                }}
                className="flex flex-col items-center justify-center p-4 bg-blue-50 hover:bg-blue-100 rounded-lg border-2 border-blue-200 hover:border-blue-300 transition-all group"
              >
                <svg className="w-6 h-6 text-blue-600 mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-sm font-semibold text-blue-700">Assign</span>
              </button>

              {/* Call */}
              <button
                onClick={() => {
                  if (lead) {
                    setShowCallNumberModal(true);
                  }
                }}
                className="flex flex-col items-center justify-center p-4 bg-green-50 hover:bg-green-100 rounded-lg border-2 border-green-200 hover:border-green-300 transition-all group"
              >
                <svg className="w-6 h-6 text-green-600 mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span className="text-sm font-semibold text-green-700">Call</span>
              </button>

              {/* SMS */}
              <button
                onClick={() => {
                  if (lead) {
                    // Initialize with all available numbers selected
                    const numbers = contactOptions.map(opt => opt.number);
                    setSmsData({ 
                      selectedNumbers: numbers, 
                      selectedTemplates: {}, 
                      languageFilter: 'all' 
                    });
                    setShowSmsModal(true);
                  }
                }}
                className="flex flex-col items-center justify-center p-4 bg-purple-50 hover:bg-purple-100 rounded-lg border-2 border-purple-200 hover:border-purple-300 transition-all group"
              >
                <svg className="w-6 h-6 text-purple-600 mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span className="text-sm font-semibold text-purple-700">SMS</span>
              </button>

              {/* Update Status */}
              <button
                onClick={() => {
                  setNewStatus(lead.leadStatus || '');
                  setStatusComment('');
                  setShowStatusModal(true);
                }}
                className="flex flex-col items-center justify-center p-4 bg-orange-50 hover:bg-orange-100 rounded-lg border-2 border-orange-200 hover:border-orange-300 transition-all group"
              >
                <svg className="w-6 h-6 text-orange-600 mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-sm font-semibold text-orange-700">Status</span>
              </button>

              {/* Edit - Super Admin Only */}
              {isSuperAdmin && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex flex-col items-center justify-center p-4 bg-indigo-50 hover:bg-indigo-100 rounded-lg border-2 border-indigo-200 hover:border-indigo-300 transition-all group"
                >
                  <svg className="w-6 h-6 text-indigo-600 mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span className="text-sm font-semibold text-indigo-700">Edit</span>
                </button>
              )}

              {/* Delete - Super Admin only (hidden for Sub Super Admin) */}
              {canDeleteLead && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="flex flex-col items-center justify-center p-4 bg-red-50 hover:bg-red-100 rounded-lg border-2 border-red-200 hover:border-red-300 transition-all group"
                >
                  <svg className="w-6 h-6 text-red-600 mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span className="text-sm font-semibold text-red-700">Delete</span>
                </button>
              )}
            </div>
            {lead.leadStatus && (
              <div className="mt-4 text-center">
                <span className={`px-4 py-2 rounded-full text-sm font-semibold ${getStatusColor(lead.leadStatus)}`}>
                  Current: {lead.leadStatus}
                </span>
              </div>
            )}
          </Card>

          {/* Status Changes Timeline */}
          <Card>
            <h2 className="text-xl font-semibold mb-4">Status Changes</h2>
            {isLoadingLogs ? (
              <div className="text-center py-4">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : statusChanges.length === 0 ? (
              <p className="text-gray-500 text-center py-4 text-sm">No status changes yet</p>
            ) : (
              <div className="space-y-0 max-h-[400px] overflow-y-auto">
                {statusChanges.map((log: ActivityLog, index: number) => (
                  <div key={log._id} className="relative pl-8 pb-6 last:pb-0">
                    {index !== statusChanges.length - 1 && (
                      <div className="absolute left-3 top-6 bottom-0 w-0.5 bg-gradient-to-b from-blue-400 to-blue-200"></div>
                    )}
                    <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 border-2 border-white shadow-md flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-white"></div>
                    </div>
                    <div className="bg-gradient-to-r from-blue-50/50 to-transparent rounded-lg p-3 border-l-2 border-blue-400">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-sm font-semibold text-gray-900">
                            {typeof log.performedBy === 'object' ? log.performedBy.name : 'Unknown'}
                          </span>
                          <span className="text-xs text-gray-500 ml-2">
                            {formatDate(log.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(log.oldStatus || '')}`}>
                          {log.oldStatus || 'N/A'}
                        </span>
                        <span className="text-gray-400">→</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(log.newStatus || '')}`}>
                          {log.newStatus || 'N/A'}
                        </span>
                      </div>
                      {log.comment && (
                        <p className="text-xs text-gray-600 mt-2 italic">"{log.comment}"</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Comments Timeline */}
          <Card>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Comments</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCommentText('');
                  setShowCommentModal(true);
                }}
              >
                Add Comment
              </Button>
            </div>
            {isLoadingLogs ? (
              <div className="text-center py-4">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : comments.length === 0 ? (
              <p className="text-gray-500 text-center py-4 text-sm">No comments yet</p>
            ) : (
              <div className="space-y-0 max-h-[400px] overflow-y-auto">
                {comments.map((log: ActivityLog, index: number) => (
                  <div key={log._id} className="relative pl-8 pb-6 last:pb-0">
                    {index !== comments.length - 1 && (
                      <div className="absolute left-3 top-6 bottom-0 w-0.5 bg-gradient-to-b from-purple-400 to-purple-200"></div>
                    )}
                    <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 border-2 border-white shadow-md flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="bg-gradient-to-r from-purple-50/50 to-transparent rounded-lg p-3 border-l-2 border-purple-400">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="text-sm font-semibold text-gray-900">
                            {typeof log.performedBy === 'object' ? log.performedBy.name : 'Unknown'}
                          </span>
                          <span className="text-xs text-gray-500 ml-2">
                            {formatDate(log.createdAt)}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white/60 p-3 rounded-lg border border-purple-100">
                        {log.comment}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Call History Timeline */}
          <Card>
            <h2 className="text-xl font-semibold mb-4">Call History</h2>
            {isLoadingCommunications ? (
              <div className="text-center py-4">
                <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : callLogs.length === 0 ? (
              <p className="text-gray-500 text-center py-4 text-sm">No call history yet</p>
            ) : (
              <div className="space-y-0 max-h-[400px] overflow-y-auto">
                {callLogs.map((call, index) => {
                  const callWithSequence = call as CommunicationRecord & { sequenceNumber: number; ordinal: string };
                  const iconColors = getCallOutcomeIconColor(call.callOutcome);
                  return (
                    <div key={call._id} className="relative pl-8 pb-6 last:pb-0">
                      {index !== callLogs.length - 1 && (
                        <div className={`absolute left-3 top-6 bottom-0 w-0.5 bg-gradient-to-b ${iconColors.line}`}></div>
                      )}
                      <div className={`absolute left-0 top-1 w-6 h-6 rounded-full ${iconColors.iconBg} border-2 border-white shadow-md flex items-center justify-center`}>
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </div>
                      <div className={`bg-gradient-to-r ${iconColors.cardBg} to-transparent rounded-lg p-3 border-l-2 ${iconColors.cardBorder}`}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="text-sm font-semibold text-gray-900">
                              {callWithSequence.ordinal} Call - {call.contactNumber}
                            </span>
                            <span className="text-xs text-gray-500 ml-2">
                              {formatDate(call.sentAt)}
                            </span>
                          </div>
                          {typeof call.sentBy === 'object' && call.sentBy && (
                            <span className="text-xs text-gray-500">
                              by {call.sentBy.name}
                            </span>
                          )}
                        </div>
                        {call.remarks && (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap bg-white/60 p-3 rounded-lg border border-green-100 mb-2">
                            {call.remarks}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          {call.callOutcome && (
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCallOutcomeColor(call.callOutcome)}`}>
                              Outcome: {call.callOutcome}
                            </span>
                          )}
                          {call.durationSeconds && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                              Duration: {call.durationSeconds}s
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
                  <span className="flex items-center gap-2 inline-flex">
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">Schedule next call</h2>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Set the date and time for the next follow-up call. This will appear on your dashboard for that day.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date & time</label>
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
                  onClick={() => {
                    setShowScheduleCallModal(false);
                    setScheduleCallDateTime('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Comment Modal */}
      {showCommentModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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

      {/* Call Number Selection Modal */}
      {showCallNumberModal && lead && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">Select Number to Call</h2>
            <div className="space-y-3">
              {contactOptions.map((option, index) => {
                const stats = communicationStatsMap.get(option.number);
                const callCount = stats?.callCount || 0;
                
                return (
                  <button
                    key={`${option.label}-${option.number}-${index}`}
                    onClick={() => {
                      setSelectedCallNumber(option.number);
                      setShowCallNumberModal(false);
                      // Open phone dialer
                      window.location.href = `tel:${option.number}`;
                      // After a delay, show remarks modal
                      setTimeout(() => {
                        setCallData({ 
                          contactNumber: option.number, 
                          remarks: '', 
                          outcome: '', 
                          durationSeconds: 0 
                        });
                        setShowCallRemarksModal(true);
                      }, 1000);
                    }}
                    className="w-full p-4 bg-blue-50 hover:bg-blue-100 rounded-lg border-2 border-blue-200 hover:border-blue-300 transition-all text-left"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-semibold text-blue-900">{option.label}</div>
                        <div className="text-sm text-blue-700">{option.number}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">Calls: {callCount}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
              <Button
                variant="outline"
                onClick={() => {
                  setShowCallNumberModal(false);
                  setSelectedCallNumber('');
                }}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Call Remarks Modal - Shows after call */}
      {showCallRemarksModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">Log Call Details</h2>
            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Contact Number</label>
                    <p className="text-gray-900 font-medium">{callData.contactNumber}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-500">Call #</div>
                    <div className="text-lg font-bold text-blue-600">
                      {(communicationStatsMap.get(callData.contactNumber)?.callCount || 0) + 1}
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Outcome *
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={callData.outcome}
                  onChange={(e) => setCallData({ ...callData, outcome: e.target.value })}
                  required
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Duration (seconds) - Optional
                </label>
                <Input
                  type="number"
                  value={callData.durationSeconds || ''}
                  onChange={(e) => setCallData({ ...callData, durationSeconds: parseInt(e.target.value) || 0 })}
                  placeholder="Call duration in seconds"
                  min="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Remarks - Optional
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[100px]"
                  value={callData.remarks}
                  onChange={(e) => setCallData({ ...callData, remarks: e.target.value })}
                  placeholder="Add call remarks..."
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  onClick={() => callMutation.mutate(callData)}
                  disabled={!callData.outcome || callMutation.isPending}
                >
                  {callMutation.isPending ? 'Saving...' : 'Save Call'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCallRemarksModal(false);
                    setCallData({ contactNumber: '', remarks: '', outcome: '', durationSeconds: 0 });
                    setSelectedCallNumber('');
                  }}
                >
                  Skip
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* SMS Modal */}
      {showSmsModal && lead && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold mb-1">Send SMS</h2>
                <p className="text-sm text-gray-500">
                  Select recipients and DLT templates to send compliant messages.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowSmsModal(false);
                  setSmsData({ selectedNumbers: [], selectedTemplates: {}, languageFilter: 'all' });
                }}
                className="text-gray-400 hover:text-gray-600"
                disabled={smsMutation.isPending}
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left: Recipients */}
              <div className="lg:col-span-1 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-2">Recipients</h3>
                  {contactOptions.length === 0 ? (
                    <p className="text-sm text-gray-500">No phone numbers available.</p>
                  ) : (
                    <div className="space-y-2">
                      {contactOptions.map((option, index) => {
                        const stats = communicationStatsMap.get(option.number);
                        const smsCount = stats?.smsCount || 0;
                        const isSelected = smsData.selectedNumbers.includes(option.number);
                        
                        return (
                          <label
                            key={`${option.label}-${option.number}-${index}`}
                            className={`flex items-start gap-3 p-3 border-2 rounded-lg cursor-pointer transition-all ${
                              isSelected
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
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                                {option.label}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-slate-400">
                                {option.number}
                              </div>
                              <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">
                                Sent: {smsCount} message(s)
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <div className="text-sm text-gray-500 mt-2">
                    Selected {smsData.selectedNumbers.length} recipient{smsData.selectedNumbers.length === 1 ? '' : 's'}.
                  </div>
                  
                  <div className="space-y-2 mt-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                      Language Filter
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
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
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Templates</h3>
                  <div className="text-sm text-gray-500">
                    Selected: {Object.keys(smsData.selectedTemplates).length}
                  </div>
                </div>

                {isLoadingTemplates ? (
                  <div className="text-center py-8">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No active templates available. Add templates from the communications admin page.
                  </p>
                ) : (
                  <div className="space-y-3">
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
                          className="border border-gray-200 rounded-lg p-4 space-y-3 dark:border-slate-700"
                        >
                          <label className="flex items-start gap-3 cursor-pointer">
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
                              className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                                {template.name}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-slate-400">
                                DLT ID: {template.dltTemplateId} · Language: {template.language?.toUpperCase() || 'N/A'}
                              </div>
                              <div className="text-xs text-gray-400 dark:text-slate-500">
                                Placeholders: {template.variableCount}
                              </div>
                            </div>
                          </label>

                          {templateState && (
                            <div className="space-y-3 ml-7">
                              {variableDescriptors.length > 0 && (
                                <div className="space-y-2">
                                  {variableDescriptors.map((variable, index) => {
                                    const key = variable.key || `var${index + 1}`;
                                    return (
                                      <div
                                        key={`${template._id}-${key}`}
                                        className="grid grid-cols-1 md:grid-cols-2 gap-3"
                                      >
                                        <div>
                                          <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">
                                            {variable.label || `Variable ${index + 1}`}
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
                                          />
                                        </div>
                                        <div className="text-xs text-gray-400 dark:text-slate-500 flex items-end">
                                          Placeholder: {`{#var#}`}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              <div className="bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700 rounded-lg p-3">
                                <div className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">
                                  Preview:
                                </div>
                                <div className="text-xs text-gray-700 dark:text-slate-300 whitespace-pre-wrap">
                                  {renderTemplatePreview(template, templateState.variables)}
                                </div>
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

            <div className="flex justify-between items-center gap-3 pt-2 flex-wrap border-t border-gray-200 dark:border-slate-700">
              <div className="text-xs text-gray-500">
                {smsData.selectedNumbers.length === 0
                  ? 'Select at least one contact number.'
                  : Object.keys(smsData.selectedTemplates).length === 0
                  ? 'Select at least one template to send.'
                  : `Ready to send using ${Object.keys(smsData.selectedTemplates).length} template${
                      Object.keys(smsData.selectedTemplates).length > 1 ? 's' : ''
                    }.`}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
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
          </Card>
        </div>
      )}
    </div>
  );
}
