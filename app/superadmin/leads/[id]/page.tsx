'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { leadAPI, communicationAPI } from '@/lib/api';
import {
  Lead,
  LeadUpdatePayload,
  User,
  ActivityLog,
  MessageTemplate,
  MessageTemplateVariable,
  CommunicationRecord,
  CommunicationStatsEntry,
  CommunicationHistoryResponse,
} from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { showToast } from '@/lib/toast';
import { useDashboardHeader } from '@/components/layout/DashboardShell';

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const leadId = params?.id as string;
  const [user, setUser] = useState<User | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<LeadUpdatePayload>({});
  const [isSaving, setIsSaving] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [showStatusUpdate, setShowStatusUpdate] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [newQuota, setNewQuota] = useState('Not Applicable');
  const [comment, setComment] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const quotaOptions = ['Not Applicable', 'Management', 'Convenor'];
  const leadStatusOptions = [
    'New',
    'Contacted',
    'Qualified',
    'Converted',
    'Confirmed',
    'Lost',
    'Admitted',
  ];
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [callNumber, setCallNumber] = useState('');
  const [callRemarks, setCallRemarks] = useState('');
  const [callOutcome, setCallOutcome] = useState('');
  const [callDuration, setCallDuration] = useState('');
  const [isSmsModalOpen, setIsSmsModalOpen] = useState(false);
  const [selectedNumbers, setSelectedNumbers] = useState<string[]>([]);
  const [selectedTemplatesState, setSelectedTemplatesState] = useState<
    Record<string, { template: MessageTemplate; variables: Record<string, string> }>
  >({});
  const [smsLanguageFilter, setSmsLanguageFilter] = useState<'all' | string>('all');
  const [communicationPage, setCommunicationPage] = useState(1);
  const [communicationLimit] = useState(20);
  const [communicationTypeFilter, setCommunicationTypeFilter] = useState<'all' | 'call' | 'sms'>(
    'all'
  );
  const sanitizePhoneNumber = useCallback((value: string | undefined | null) => {
    if (!value) return '';
    return String(value).replace(/[^\d+]/g, '');
  }, []);

  // Check authentication and mount state
  useEffect(() => {
    setIsMounted(true);
    const currentUser = auth.getUser();
    if (!currentUser) {
      router.push('/auth/login');
      return;
    }
    if (currentUser.roleName !== 'Super Admin' && currentUser.roleName !== 'Sub Super Admin') {
      router.push('/user/dashboard');
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
      // Backend returns: { success: true, data: lead, message: "..." }
      // API client extracts response.data, so we get: { success: true, data: lead, message: "..." }
      // Extract the actual lead from response.data
      return response.data || response;
    },
    enabled: !!leadId && !!user,
    staleTime: 30000,
  });

  // Extract lead from response structure
  // Response structure: { success: true, data: lead, message: "..." }
  const lead = (leadData?.data || leadData) as Lead | undefined;
  const normalizedLeadStatus = (lead?.leadStatus || '').toLowerCase();
  const canAccessJoiningForm = ['confirmed', 'admitted', 'joined'].includes(normalizedLeadStatus);
  const joiningButtonLabel =
    normalizedLeadStatus === 'admitted' || normalizedLeadStatus === 'joined'
      ? 'View Joining Form'
      : 'Join Lead';
  useEffect(() => {
    if (!lead) {
      return () => clearHeaderContent();
    }

    setHeaderContent(
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Lead Details
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {lead.name}
            {lead.enquiryNumber ? ` · Enquiry #${lead.enquiryNumber}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push('/superadmin/leads')}>
            Back to Leads
          </Button>
          {canAccessJoiningForm && (
            <Button
              variant="secondary"
              onClick={() => router.push(`/superadmin/joining/${lead._id}`)}
            >
              {joiningButtonLabel}
            </Button>
          )}
        </div>
      </div>
    );

    return () => clearHeaderContent();
  }, [lead, canAccessJoiningForm, joiningButtonLabel, router, setHeaderContent, clearHeaderContent]);

  const contactOptions = useMemo(() => {
    if (!lead) return [];

    const options: { label: string; number: string; display: string }[] = [];

    const addNumber = (label: string, rawValue: string | number | undefined | null) => {
      if (rawValue === undefined || rawValue === null) return;
      const stringValue = String(rawValue);
      const sanitized = sanitizePhoneNumber(stringValue);
      if (!sanitized) return;
      const numericDigits = sanitized.replace(/\D/g, '');
      if (numericDigits.length < 10 || numericDigits.length > 13) {
        return;
      }
      if (options.some((option) => option.number === sanitized)) return;
      options.push({
        label,
        number: sanitized,
        display: stringValue,
      });
    };

    addNumber('Primary Phone', lead.phone);
    addNumber('Father Phone', lead.fatherPhone);

    if (lead.dynamicFields && typeof lead.dynamicFields === 'object') {
      Object.entries(lead.dynamicFields).forEach(([key, value]) => {
        if (typeof value === 'string' || typeof value === 'number') {
          addNumber(key, value);
        }
      });
    }

    return options;
  }, [lead, sanitizePhoneNumber]);

  const buildDefaultTemplateValues = useCallback(
    (template: MessageTemplate) => {
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
        for (let index = 0; index < template.variableCount; index += 1) {
          const key = `var${index + 1}`;
          values[key] = index === 0 && lead?.name ? lead.name : '';
        }
      }
      return values;
    },
    [lead?.name]
  );

  const isCommunicationActivity = useCallback((log: ActivityLog) => {
    if (!log?.metadata) return false;
    const metadata: any = log.metadata;
    if (typeof metadata.get === 'function') {
      return Boolean(metadata.get('communicationType'));
    }
    return Boolean(metadata.communicationType);
  }, []);

  const loadActivityLogs = useCallback(async () => {
    if (!leadId) return;
    try {
      setIsLoadingLogs(true);
      const response = await leadAPI.getActivityLogs(leadId);
      const logs = response.data?.logs || response.logs || [];
      setActivityLogs(logs);
    } catch (activityError) {
      console.error('Error loading activity logs:', activityError);
    } finally {
      setIsLoadingLogs(false);
    }
  }, [leadId]);

  // Fetch activity logs
  useEffect(() => {
    if (leadId && lead) {
      loadActivityLogs();
    }
  }, [leadId, lead, loadActivityLogs]);

  const {
    data: communicationHistoryResponse,
    isLoading: isLoadingCommunications,
    refetch: refetchCommunications,
  } = useQuery({
    queryKey: ['lead', leadId, 'communications', communicationPage, communicationTypeFilter],
    queryFn: async () => {
      const response = await communicationAPI.getHistory(leadId, {
        page: communicationPage,
        limit: communicationLimit,
        type: communicationTypeFilter === 'all' ? undefined : communicationTypeFilter,
      });
      return response.data || response;
    },
    enabled: !!leadId && !!user,
    placeholderData: (previousData) => previousData,
  });

  const communicationHistory = (
    communicationHistoryResponse?.data || communicationHistoryResponse
  ) as CommunicationHistoryResponse | undefined;

  const communications: CommunicationRecord[] = communicationHistory?.items ?? [];
  const communicationPagination = communicationHistory?.pagination ?? {
    page: 1,
    limit: communicationLimit,
    total: 0,
    pages: 1,
  };

  const { data: communicationStatsResponse, refetch: refetchCommunicationStats } = useQuery({
    queryKey: ['lead', leadId, 'communicationStats'],
    queryFn: async () => {
      const response = await communicationAPI.getStats(leadId);
      return response.data || response;
    },
    enabled: !!leadId && !!user,
    staleTime: 60000,
  });

  const communicationStats =
    (communicationStatsResponse?.data || communicationStatsResponse)?.stats || [];

  const {
    data: activeTemplatesResponse,
    isLoading: isLoadingTemplates,
  } = useQuery({
    queryKey: ['communicationTemplatesActive', isSmsModalOpen],
    queryFn: async () => {
      const response = await communicationAPI.getActiveTemplates();
      return response?.data ?? [];
    },
    enabled: isSmsModalOpen,
  });

  const activeTemplates: MessageTemplate[] = useMemo(() => {
    if (!Array.isArray(activeTemplatesResponse)) return [];
    return activeTemplatesResponse.filter((template) => template.isActive);
  }, [activeTemplatesResponse]);

  const selectedTemplateEntries = useMemo(
    () => Object.values(selectedTemplatesState),
    [selectedTemplatesState]
  );

  const availableTemplateLanguages = useMemo(() => {
    const languages = new Set<string>();
    activeTemplates.forEach((template) => {
      if (template.language) {
        languages.add(template.language);
      }
    });
    return Array.from(languages);
  }, [activeTemplates]);

  const filteredTemplates = useMemo(() => {
    return activeTemplates.filter((template) =>
      smsLanguageFilter === 'all' ? true : template.language === smsLanguageFilter
    );
  }, [activeTemplates, smsLanguageFilter]);

  const selectedNumberSet = useMemo(() => new Set(selectedNumbers), [selectedNumbers]);
  const communicationStatsMap = useMemo(() => {
    const map = new Map<string, CommunicationStatsEntry>();
    communicationStats.forEach((entry: CommunicationStatsEntry) => {
      map.set(entry.contactNumber, entry);
    });
    return map;
  }, [communicationStats]);

  useEffect(() => {
    setCommunicationPage(1);
  }, [communicationTypeFilter]);

  useEffect(() => {
    if (!isSmsModalOpen) return;
    setSelectedNumbers((prev) => {
      const validNumbers = prev.filter((number) =>
        contactOptions.some((option) => option.number === number)
      );
      if (validNumbers.length > 0) {
        return validNumbers;
      }
      return contactOptions.map((option) => option.number);
    });
  }, [contactOptions, isSmsModalOpen]);

  // Initialize form data when lead is loaded
  useEffect(() => {
    if (lead && !isEditing) {
      setFormData({
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        fatherName: lead.fatherName,
        fatherPhone: lead.fatherPhone,
        motherName: lead.motherName,
        courseInterested: lead.courseInterested,
        village: lead.village,
        mandal: lead.mandal,
        district: lead.district,
        state: lead.state || 'Andhra Pradesh',
        quota: lead.quota || 'Not Applicable',
        leadStatus: lead.leadStatus,
        notes: lead.notes,
        lastFollowUp: lead.lastFollowUp,
        applicationStatus: lead.applicationStatus,
        hallTicketNumber: lead.hallTicketNumber,
        gender: lead.gender,
        interCollege: lead.interCollege,
        rank: lead.rank,
      });
    }
  }, [lead, isEditing]);

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: LeadUpdatePayload) => {
      return await leadAPI.update(leadId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setIsEditing(false);
      setIsSaving(false);
      showToast.success('Lead updated successfully!');
    },
    onError: (error: any) => {
      console.error('Error updating lead:', error);
      showToast.error(error.response?.data?.message || 'Failed to update lead');
      setIsSaving(false);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await leadAPI.delete(leadId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      showToast.success('Lead deleted successfully!');
      router.push('/superadmin/leads');
    },
    onError: (error: any) => {
      console.error('Error deleting lead:', error);
      showToast.error(error.response?.data?.message || 'Failed to delete lead');
      setIsDeleting(false);
      setShowDeleteModal(false);
    },
  });

  const logCallMutation = useMutation({
    mutationFn: (data: {
      contactNumber: string;
      remarks?: string;
      outcome?: string;
      durationSeconds?: number;
    }) => communicationAPI.logCall(leadId, data),
    onSuccess: () => {
      showToast.success('Call logged successfully');
      setIsCallModalOpen(false);
      setCallRemarks('');
      setCallOutcome('');
      setCallDuration('');
      refetchCommunications();
      refetchCommunicationStats();
      loadActivityLogs();
    },
    onError: (error: any) => {
      console.error('Error logging call:', error);
      showToast.error(error.response?.data?.message || 'Failed to log call');
    },
  });

  const sendSmsMutation = useMutation({
    mutationFn: (payload: {
      contactNumbers: string[];
      templates: Array<{
        templateId: string;
        variables?: { key?: string; value?: string; defaultValue?: string }[];
      }>;
    }) => communicationAPI.sendSms(leadId, payload),
    onSuccess: (response, variables) => {
      const resultPayload = response.data || response;
      const results = resultPayload?.results || [];
      const successCount = results.filter((item: any) => item.success).length;
      const totalCount =
        results.length || variables.templates.length || selectedTemplateEntries.length || 0;
      showToast.success(
        `Messages processed: ${successCount}/${totalCount || results.length || 0}`
      );
      setIsSmsModalOpen(false);
      setSelectedTemplatesState({});
      refetchCommunications();
      refetchCommunicationStats();
      loadActivityLogs();
    },
    onError: (error: any) => {
      console.error('Error sending SMS:', error);
      showToast.error(error.response?.data?.message || 'Failed to send SMS');
    },
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    updateMutation.mutate(formData);
  };

  const handleCancel = () => {
    if (lead) {
      setFormData({
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        fatherName: lead.fatherName,
        fatherPhone: lead.fatherPhone,
        motherName: lead.motherName,
        courseInterested: lead.courseInterested,
        village: lead.village,
        mandal: lead.mandal,
        district: lead.district,
        state: lead.state || 'Andhra Pradesh',
        quota: lead.quota || 'Not Applicable',
        leadStatus: lead.leadStatus,
        notes: lead.notes,
        lastFollowUp: lead.lastFollowUp,
        applicationStatus: lead.applicationStatus,
        hallTicketNumber: lead.hallTicketNumber,
        gender: lead.gender,
        interCollege: lead.interCollege,
        rank: lead.rank,
      });
    }
    setIsEditing(false);
  };

  // Handle status change with confirmation
  const handleStatusChange = (status: string) => {
    setNewStatus(status);
    // Don't show confirmation modal immediately - let user save first
    // Confirmation will show when they click Save if status changed
  };

  const handleTemplateSelectionChange = (template: MessageTemplate, checked: boolean) => {
    setSelectedTemplatesState((prev) => {
      const next = { ...prev };
      if (checked) {
        next[template._id] = {
          template,
          variables: buildDefaultTemplateValues(template),
        };
      } else {
        delete next[template._id];
      }
      return next;
    });
  };

  const handleTemplateVariableChange = (templateId: string, key: string, value: string) => {
    setSelectedTemplatesState((prev) => {
      const current = prev[templateId];
      if (!current) return prev;
      return {
        ...prev,
        [templateId]: {
          ...current,
          variables: {
            ...current.variables,
            [key]: value,
          },
        },
      };
    });
  };

  const handleToggleNumberSelection = (number: string, checked: boolean) => {
    const sanitized = sanitizePhoneNumber(number);
    if (!sanitized) return;
    setSelectedNumbers((prev) => {
      if (checked) {
        return prev.includes(sanitized) ? prev : [...prev, sanitized];
      }
      return prev.filter((item) => item !== sanitized);
    });
  };

  const handleCallClick = (rawNumber: string | undefined | null) => {
    const sanitized = sanitizePhoneNumber(rawNumber || '');
    if (!sanitized) {
      showToast.error('Invalid phone number');
      return;
    }
    if (typeof window !== 'undefined') {
      window.open(`tel:${sanitized}`);
    }
    setCallNumber(sanitized);
    setCallRemarks('');
    setCallOutcome('');
    setCallDuration('');
    setIsCallModalOpen(true);
  };

  const handleOpenSmsModal = () => {
    if (contactOptions.length === 0) {
      showToast.error('No contact numbers available for this lead');
      return;
    }
    setSelectedNumbers(contactOptions.map((option) => option.number));
    setSelectedTemplatesState({});
    setSmsLanguageFilter('all');
    setIsSmsModalOpen(true);
  };

  const closeCallModal = () => {
    if (logCallMutation.isPending) return;
    setIsCallModalOpen(false);
    setCallRemarks('');
    setCallOutcome('');
    setCallDuration('');
  };

  const closeSmsModal = () => {
    if (sendSmsMutation.isPending) return;
    setIsSmsModalOpen(false);
    setSelectedTemplatesState({});
  };

  const renderTemplatePreview = useCallback(
    (template: MessageTemplate, values: Record<string, string>) => {
      const keys =
        template.variables && template.variables.length > 0
          ? template.variables.map((variable, index) => variable.key || `var${index + 1}`)
          : Array.from({ length: template.variableCount }).map((_, index) => `var${index + 1}`);

      let pointer = 0;
      return template.content.replace(/\{#var#\}/gi, () => {
        const key = keys[pointer] || `var${pointer + 1}`;
        pointer += 1;
        return values[key] || '';
      });
    },
    []
  );

  const handleSubmitCallLog = () => {
    if (!callNumber) {
      showToast.error('Phone number is required to log the call');
      return;
    }
    const trimmedDuration = callDuration.trim();
    let durationSeconds: number | undefined;
    if (trimmedDuration) {
      const parsed = Number(trimmedDuration);
      if (Number.isNaN(parsed) || parsed < 0) {
        showToast.error('Call duration must be a positive number');
        return;
      }
      durationSeconds = parsed;
    }

    logCallMutation.mutate({
      contactNumber: callNumber,
      remarks: callRemarks.trim() ? callRemarks.trim() : undefined,
      outcome: callOutcome.trim() ? callOutcome.trim() : undefined,
      durationSeconds,
    });
  };

  const handleSendSms = () => {
    if (selectedNumbers.length === 0) {
      showToast.error('Select at least one contact number');
      return;
    }
    if (selectedTemplateEntries.length === 0) {
      showToast.error('Select at least one template');
      return;
    }

    const templatesPayload = selectedTemplateEntries.map(({ template, variables }) => {
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

    const payload = {
      contactNumbers: selectedNumbers,
      templates: templatesPayload,
    };

    // Debug log to verify payload before sending
    // eslint-disable-next-line no-console
    console.log('[Communications][SMS] Dispatch payload', {
      leadId,
      payload,
    });

    sendSmsMutation.mutate(payload);
  };

  // Mutation for adding activity (status/quota update)
  const addActivityMutation = useMutation({
    mutationFn: async (data: { comment?: string; newStatus?: string; newQuota?: string }) => {
      return await leadAPI.addActivity(leadId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setShowStatusUpdate(false);
      setShowConfirmModal(false);
      setComment('');
      setNewStatus('');
      setNewQuota('Not Applicable');
      showToast.success('Status updated successfully!');
      loadActivityLogs();
    },
    onError: (error: any) => {
      console.error('Error adding activity:', error);
      showToast.error(error.response?.data?.message || 'Failed to update status');
    },
  });

  // Handle save status update
  const handleSaveStatusUpdate = () => {
    if (!lead) return;
    
    const hasComment = comment.trim().length > 0;
    const hasStatusChange = newStatus && newStatus !== lead.leadStatus;
    const currentQuota = lead.quota || 'Not Applicable';
    const hasQuotaChange = newQuota && newQuota !== currentQuota;

    if (!hasComment && !hasStatusChange && !hasQuotaChange) {
      showToast.error('Please add a comment or change the status/quota');
      return;
    }

    // If status is changing, show confirmation first
    if (hasStatusChange) {
      setShowConfirmModal(true);
    } else {
      // Just save comment without confirmation
      addActivityMutation.mutate({
        comment: hasComment ? comment.trim() : undefined,
        newStatus: undefined,
        newQuota: hasQuotaChange ? newQuota : undefined,
      });
    }
  };

  // Confirm status change
  const handleConfirmStatusChange = () => {
    if (!lead) return;
    setShowConfirmModal(false);
    // Save with status change
    addActivityMutation.mutate({
      comment: comment.trim() ? comment.trim() : undefined,
      newStatus: newStatus && newStatus !== lead.leadStatus ? newStatus : undefined,
      newQuota: newQuota && newQuota !== (lead.quota || 'Not Applicable') ? newQuota : undefined,
    });
  };

  // Handle delete
  const handleDelete = () => {
    setShowDeleteModal(true);
  };

  // Confirm delete
  const handleConfirmDelete = () => {
    setIsDeleting(true);
    deleteMutation.mutate();
  };

  const getStatusColor = (status?: string) => {
    switch ((status || '').toLowerCase()) {
      case 'interested':
        return 'bg-green-100 text-green-800';
      case 'contacted':
        return 'bg-sky-100 text-sky-800';
      case 'qualified':
        return 'bg-indigo-100 text-indigo-800';
      case 'converted':
        return 'bg-teal-100 text-teal-800';
      case 'confirmed':
        return 'bg-purple-100 text-purple-800';
      case 'admitted':
      case 'joined':
        return 'bg-emerald-100 text-emerald-800';
      case 'not interested':
        return 'bg-red-100 text-red-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'lost':
        return 'bg-gray-300 text-gray-800';
      case 'new':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getCommunicationStatusBadge = (status?: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800 dark:bg-emerald-900/50 dark:text-emerald-200';
      case 'failed':
        return 'bg-red-100 text-red-800 dark:bg-rose-900/50 dark:text-rose-200';
      case 'pending':
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-slate-800/60 dark:text-slate-200';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Prevent hydration mismatch by not rendering until mounted
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
            <Button onClick={() => router.push('/superadmin/leads')}>
              Back to Leads
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <div className="rounded-3xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {lead.name}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {lead.enquiryNumber && <span>Enquiry #{lead.enquiryNumber}</span>}
                {lead.leadStatus && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ${getStatusColor(
                      lead.leadStatus
                    )}`}
                  >
                    {lead.leadStatus}
                  </span>
                )}
                {lead.quota && <span>· {lead.quota}</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              {lead.phone && <span>📞 {lead.phone}</span>}
              {lead.email && <span>✉️ {lead.email}</span>}
              {lead.village && <span>{lead.village}</span>}
              {lead.district && <span>{lead.district}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {isEditing ? (
              <Button variant="secondary" onClick={() => setIsEditing(false)}>
                Exit Editing
              </Button>
            ) : (
              <>
                {canAccessJoiningForm && (
                  <Button
                    variant="primary"
                    onClick={() => router.push(`/superadmin/joining/${lead._id}`)}
                  >
                    {joiningButtonLabel}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowStatusUpdate(true);
                    setNewStatus(lead?.leadStatus || '');
                    setNewQuota(lead?.quota || 'Not Applicable');
                    setComment('');
                  }}
                >
                  Update Status
                </Button>
                <Button variant="primary" onClick={() => setIsEditing(true)}>
                  Edit Lead
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDelete}
                  className="bg-red-50 hover:bg-red-100 text-red-600 border-red-300 hover:border-red-400"
                >
                  Delete Lead
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-8">
          {isEditing ? (
            <Card>
              <h2 className="text-xl font-semibold mb-6">Edit Lead</h2>
              <form onSubmit={handleSave} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name *
                    </label>
                    <Input
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone *
                    </label>
                    <Input
                      value={formData.phone || ''}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <Input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Father Name *
                    </label>
                    <Input
                      value={formData.fatherName || ''}
                      onChange={(e) => setFormData({ ...formData, fatherName: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Father Phone *
                    </label>
                    <Input
                      value={formData.fatherPhone || ''}
                      onChange={(e) => setFormData({ ...formData, fatherPhone: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mother Name
                    </label>
                    <Input
                      value={formData.motherName || ''}
                      onChange={(e) => setFormData({ ...formData, motherName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Course Interested
                    </label>
                    <Input
                      value={formData.courseInterested || ''}
                      onChange={(e) => setFormData({ ...formData, courseInterested: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Village *
                    </label>
                    <Input
                      value={formData.village || ''}
                      onChange={(e) => setFormData({ ...formData, village: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mandal *
                    </label>
                    <Input
                      value={formData.mandal || ''}
                      onChange={(e) => setFormData({ ...formData, mandal: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State *
                    </label>
                    <Input
                      value={formData.state || 'Andhra Pradesh'}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quota *
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm"
                      value={formData.quota || 'Not Applicable'}
                      onChange={(e) => setFormData({ ...formData, quota: e.target.value })}
                    >
                      {quotaOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Status
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm"
                      value={formData.leadStatus || 'New'}
                      onChange={(e) => setFormData({ ...formData, leadStatus: e.target.value })}
                    >
                      {leadStatusOptions.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {statusOption}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm min-h-[100px]"
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Add notes about this lead..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last Follow Up
                  </label>
                  <Input
                    type="datetime-local"
                    value={formData.lastFollowUp ? new Date(formData.lastFollowUp).toISOString().slice(0, 16) : ''}
                    onChange={(e) => setFormData({ ...formData, lastFollowUp: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleCancel}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Details */}
              <div className="lg:col-span-2 space-y-6">
                {/* Basic Information */}
                <Card>
                  <h2 className="text-xl font-semibold mb-4">Basic Information</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Enquiry Number
                      </label>
                      <p className="text-lg font-mono font-semibold text-blue-600">
                        {lead.enquiryNumber || '-'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Status
                      </label>
                      <span
                        onClick={() => {
                          setShowStatusUpdate(true);
                          setNewStatus(lead?.leadStatus || '');
                          setNewQuota(lead?.quota || 'Not Applicable');
                          setComment('');
                        }}
                        className={`px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full cursor-pointer hover:opacity-80 transition-opacity ${getStatusColor(
                          lead.leadStatus
                        )}`}
                        title="Click to update status"
                      >
                        {lead.leadStatus || 'New'}
                      </span>
                    </div>
                    {lead.admissionNumber && (
                      <div>
                        <label className="block text-sm font-medium text-gray-500 mb-1">
                          Admission Number
                        </label>
                        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/40 dark:text-emerald-200">
                          {lead.admissionNumber}
                        </p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Name
                      </label>
                      <p className="text-gray-900 font-medium">{lead.name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Phone
                      </label>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-900">{lead.phone || '-'}</span>
                        {lead.phone && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleCallClick(lead.phone)}
                          >
                            Call
                          </Button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Email
                      </label>
                      <p className="text-gray-900">{lead.email || '-'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Course Interested
                      </label>
                      <p className="text-gray-900">{lead.courseInterested || '-'}</p>
                    </div>
                  </div>
                </Card>

                <Card>
                  <h2 className="text-xl font-semibold mb-4">Communication Summary</h2>
                  {contactOptions.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      No phone numbers available for this lead.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {contactOptions.map((option) => {
                        const stats = communicationStatsMap.get(option.number);
                        return (
                          <div
                            key={option.number}
                            className="flex items-center justify-between rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-2"
                          >
                            <div>
                              <div className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                                {option.label}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-slate-400">
                                {option.display}
                              </div>
                            </div>
                            <div className="text-right text-xs text-gray-600 dark:text-slate-300">
                              <div>
                                Calls:{' '}
                                <span className="font-semibold text-gray-900 dark:text-slate-100">
                                  {stats?.callCount ?? 0}
                                </span>
                              </div>
                              <div>
                                SMS:{' '}
                                <span className="font-semibold text-gray-900 dark:text-slate-100">
                                  {stats?.smsCount ?? 0}
                                </span>
                              </div>
                              {stats?.lastContactedAt && (
                                <div className="text-[11px] text-gray-400 dark:text-slate-500 mt-1">
                                  Last: {new Date(stats.lastContactedAt).toLocaleString()}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {contactOptions.map((option) => (
                      <Button
                        key={`call-${option.number}`}
                        variant="secondary"
                        size="sm"
                        onClick={() => handleCallClick(option.number)}
                      >
                        Call {option.label}
                      </Button>
                    ))}
                    <Button variant="primary" size="sm" onClick={handleOpenSmsModal}>
                      Send Message
                    </Button>
                  </div>
                </Card>

                <Card>
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
                    <h2 className="text-xl font-semibold">Communication History</h2>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 dark:text-slate-400">Filter:</span>
                      <select
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                        value={communicationTypeFilter}
                        onChange={(e) => setCommunicationTypeFilter(e.target.value as 'all' | 'call' | 'sms')}
                      >
                        <option value="all">All</option>
                        <option value="call">Calls</option>
                        <option value="sms">SMS</option>
                      </select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    {isLoadingCommunications ? (
                      <div className="space-y-2">
                        <Skeleton className="w-full h-16" />
                        <Skeleton className="w-full h-16" />
                      </div>
                    ) : communications.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No communications logged yet. Use the buttons above to record calls or send messages.
                      </p>
                    ) : (
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
                        <thead className="bg-gray-50 dark:bg-slate-900/60">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                              Type
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                              Number
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                              Details
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                              User
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                              Time
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-800 bg-white/60 dark:bg-slate-900/50">
                          {communications.map((communication) => (
                            <tr key={communication._id}>
                              <td className="px-4 py-3 text-sm capitalize text-gray-700 dark:text-slate-200">
                                {communication.type}
                              </td>
                              <td className="px-4 py-3 text-sm font-mono text-blue-600">
                                {communication.contactNumber}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-200 space-y-1">
                                {communication.type === 'sms' ? (
                                  <>
                                    <div>
                                      Template:{' '}
                                      <span className="font-semibold">
                                        {communication.template?.name || '—'}
                                      </span>
                                    </div>
                                    {communication.template?.renderedContent && (
                                      <div className="text-xs text-gray-500 dark:text-slate-400 whitespace-pre-wrap">
                                        {communication.template.renderedContent}
                                      </div>
                                    )}
                                    {communication.providerMessageIds?.length ? (
                                      <div className="text-xs text-gray-400">
                                        ID(s): {communication.providerMessageIds.join(', ')}
                                      </div>
                                    ) : null}
                                  </>
                                ) : (
                                  <>
                                    {communication.callOutcome && (
                                      <div>
                                        Outcome:{' '}
                                        <span className="font-semibold">
                                          {communication.callOutcome}
                                        </span>
                                      </div>
                                    )}
                                    {communication.remarks && (
                                      <div className="text-xs text-gray-500 dark:text-slate-400 whitespace-pre-wrap">
                                        {communication.remarks}
                                      </div>
                                    )}
                                    {communication.durationSeconds ? (
                                      <div className="text-xs text-gray-400">
                                        Duration: {communication.durationSeconds}s
                                      </div>
                                    ) : null}
                                  </>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 dark:text-slate-200">
                                {typeof communication.sentBy === 'object'
                                  ? communication.sentBy.name
                                  : '—'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-300">
                                {new Date(communication.sentAt).toLocaleString()}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${getCommunicationStatusBadge(
                                    communication.status
                                  )}`}
                                >
                                  {communication.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {communicationPagination.total > communicationLimit && (
                    <div className="flex items-center justify-between mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCommunicationPage((prev) => Math.max(1, prev - 1))
                        }
                        disabled={communicationPagination.page <= 1 || isLoadingCommunications}
                      >
                        Previous
                      </Button>
                      <div className="text-sm text-gray-600 dark:text-slate-300">
                        Page {communicationPagination.page} of {communicationPagination.pages}{' '}
                        ({communicationPagination.total} records)
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCommunicationPage((prev) =>
                            Math.min(communicationPagination.pages, prev + 1)
                          )
                        }
                        disabled={
                          communicationPagination.page >= communicationPagination.pages ||
                          isLoadingCommunications
                        }
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </Card>

                {/* Parent Information */}
                <Card>
                  <h2 className="text-xl font-semibold mb-4">Parent Information</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Father Name
                      </label>
                      <p className="text-gray-900 font-medium">{lead.fatherName}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Father Phone
                      </label>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-900">{lead.fatherPhone || '-'}</span>
                        {lead.fatherPhone && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleCallClick(lead.fatherPhone)}
                          >
                            Call
                          </Button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Mother Name
                      </label>
                      <p className="text-gray-900">{lead.motherName || '-'}</p>
                    </div>
                  </div>
                </Card>

                {/* Location Information */}
                <Card>
                  <h2 className="text-xl font-semibold mb-4">Location Information</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Mandal
                      </label>
                      <p className="text-gray-900">{lead.mandal}</p>
                    </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">
                      Village
                    </label>
                    <p className="text-gray-900">{lead.village}</p>
                  </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        State
                      </label>
                      <p className="text-gray-900">{lead.state}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Quota
                      </label>
                      <p className="text-gray-900">{lead.quota}</p>
                    </div>
                  </div>
                </Card>

                {/* Notes */}
                {lead.notes && (
                  <Card>
                    <h2 className="text-xl font-semibold mb-4">Notes</h2>
                    <p className="text-gray-700 whitespace-pre-wrap">{lead.notes}</p>
                  </Card>
                )}

                {/* Dynamic Fields */}
                {lead.dynamicFields && Object.keys(lead.dynamicFields).length > 0 && (
                  <Card>
                    <h2 className="text-xl font-semibold mb-4">Additional Information</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(lead.dynamicFields).map(([key, value]) => (
                        <div key={key}>
                          <label className="block text-sm font-medium text-gray-500 mb-1">
                            {key}
                          </label>
                          <p className="text-gray-900">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Metadata */}
                <Card>
                  <h2 className="text-xl font-semibold mb-4">Metadata</h2>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Source
                      </label>
                      <p className="text-gray-900">{lead.source || '-'}</p>
                    </div>
                    {lead.assignedTo && (
                      <div>
                        <label className="block text-sm font-medium text-gray-500 mb-1">
                          Assigned To
                        </label>
                        <p className="text-gray-900">
                          {typeof lead.assignedTo === 'object' ? lead.assignedTo.name : '-'}
                        </p>
                      </div>
                    )}
                    {lead.uploadedBy && (
                      <div>
                        <label className="block text-sm font-medium text-gray-500 mb-1">
                          Uploaded By
                        </label>
                        <p className="text-gray-900">
                          {typeof lead.uploadedBy === 'object' ? lead.uploadedBy.name : '-'}
                        </p>
                      </div>
                    )}
                    {lead.lastFollowUp && (
                      <div>
                        <label className="block text-sm font-medium text-gray-500 mb-1">
                          Last Follow Up
                        </label>
                        <p className="text-gray-900">{formatDate(lead.lastFollowUp)}</p>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Created At
                      </label>
                      <p className="text-gray-900">{formatDate(lead.createdAt)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-1">
                        Updated At
                      </label>
                      <p className="text-gray-900">{formatDate(lead.updatedAt)}</p>
                    </div>
                  </div>
                </Card>

                {/* Status Changes Timeline */}
                <Card>
                  <h2 className="text-xl font-semibold mb-4">Status & Quota Changes</h2>
                  {isLoadingLogs ? (
                    <div className="text-center py-4">
                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    </div>
                  ) : (
                    (() => {
                      const statusChanges = activityLogs.filter(
                        (log: ActivityLog) => log.type === 'status_change' || log.type === 'quota_change'
                      );
                      return statusChanges.length === 0 ? (
                        <p className="text-gray-500 text-center py-4 text-sm">No status changes yet</p>
                      ) : (
                        <div className="space-y-0 max-h-[400px] overflow-y-auto">
                          {statusChanges.map((log: ActivityLog, index: number) => (
                            <div key={log._id} className="relative pl-8 pb-6 last:pb-0">
                              {/* Timeline line */}
                              {index !== statusChanges.length - 1 && (
                                <div className="absolute left-3 top-6 bottom-0 w-0.5 bg-gradient-to-b from-blue-400 to-blue-200"></div>
                              )}
                              {/* Timeline dot */}
                              <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 border-2 border-white shadow-md flex items-center justify-center">
                                <div className="w-2 h-2 rounded-full bg-white"></div>
                              </div>
                              {/* Content */}
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
                                {log.type === 'status_change' ? (
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(log.oldStatus || '')}`}>
                                      {log.oldStatus || 'N/A'}
                                    </span>
                                    <span className="text-gray-400">→</span>
                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(log.newStatus || '')}`}>
                                      {log.newStatus || 'N/A'}
                                    </span>
                                  </div>
                                ) : (
                                  (() => {
                                    const quotaChange =
                                      (log.metadata && (log.metadata as Record<string, any>).quotaChange) || undefined;
                                    const oldQuota = quotaChange?.oldQuota || 'Not Applicable';
                                    const newQuota = quotaChange?.newQuota || 'Not Applicable';
                                    return (
                                      <div className="text-sm">
                                        <p className="text-gray-600">
                                          Quota updated from <span className="font-semibold text-gray-800">{oldQuota}</span> to{' '}
                                          <span className="font-semibold text-gray-800">{newQuota}</span>
                                        </p>
                                      </div>
                                    );
                                  })()
                                )}
                                {log.comment && (
                                  <p className="text-xs text-gray-600 mt-2 italic">"{log.comment}"</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    })()
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
                        setShowStatusUpdate(true);
                        setNewStatus(lead?.leadStatus || '');
                        setNewQuota(lead?.quota || 'Not Applicable');
                        setComment('');
                      }}
                    >
                      Add Comment
                    </Button>
                  </div>
                  {isLoadingLogs ? (
                    <div className="text-center py-4">
                      <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    </div>
                  ) : (
                    (() => {
      const comments = activityLogs.filter(
        (log: ActivityLog) => log.type === 'comment' && !isCommunicationActivity(log)
      );
                      return comments.length === 0 ? (
                        <p className="text-gray-500 text-center py-4 text-sm">No comments yet</p>
                      ) : (
                        <div className="space-y-0 max-h-[400px] overflow-y-auto">
                          {comments.map((log: ActivityLog, index: number) => (
                            <div key={log._id} className="relative pl-8 pb-6 last:pb-0">
                              {/* Timeline line */}
                              {index !== comments.length - 1 && (
                                <div className="absolute left-3 top-6 bottom-0 w-0.5 bg-gradient-to-b from-purple-400 to-purple-200"></div>
                              )}
                              {/* Timeline dot */}
                              <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-purple-600 border-2 border-white shadow-md flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                                </svg>
                              </div>
                              {/* Content */}
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
                      );
                    })()
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* Call Log Modal */}
          {isCallModalOpen && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <Card className="max-w-md w-full space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Log Call</h2>
                  <button
                    type="button"
                    onClick={closeCallModal}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Close call log modal"
                    disabled={logCallMutation.isPending}
                  >
                    ✕
                  </button>
                </div>
                {(() => {
                  const selectedContact = contactOptions.find(
                    (option) => option.number === callNumber
                  );
                  return (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Contact Number
                        </label>
                        <p className="text-sm text-gray-900">
                          {selectedContact
                            ? `${selectedContact.label}: ${selectedContact.display}`
                            : callNumber}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Call Outcome
                        </label>
                        <Input
                          value={callOutcome}
                          onChange={(e) => setCallOutcome(e.target.value)}
                          placeholder="e.g., Spoke to parent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Duration (seconds)
                        </label>
                        <Input
                          type="number"
                          min={0}
                          value={callDuration}
                          onChange={(e) => setCallDuration(e.target.value)}
                          placeholder="Optional"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Remarks
                        </label>
                        <textarea
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm min-h-[100px]"
                          value={callRemarks}
                          onChange={(e) => setCallRemarks(e.target.value)}
                          placeholder="Add remarks about the call"
                        />
                      </div>
                    </div>
                  );
                })()}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={closeCallModal}
                    disabled={logCallMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSubmitCallLog}
                    isLoading={logCallMutation.isPending}
                  >
                    Save Call Log
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* SMS Modal */}
          {isSmsModalOpen && (
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
                    onClick={closeSmsModal}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Close SMS modal"
                    disabled={sendSmsMutation.isPending}
                  >
                    ✕
                  </button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-1 space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Recipients</h3>
                      {contactOptions.length === 0 ? (
                        <p className="text-sm text-gray-500">
                          No phone numbers available for this lead.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {contactOptions.map((option) => (
                            <label
                              key={`sms-${option.number}`}
                              className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer dark:border-slate-700 dark:hover:bg-slate-800/60"
                            >
                              <input
                                type="checkbox"
                                checked={selectedNumberSet.has(option.number)}
                                onChange={(e) =>
                                  handleToggleNumberSelection(option.number, e.target.checked)
                                }
                                className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              />
                              <div>
                                <div className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                                  {option.label}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-slate-400">
                                  {option.display}
                                </div>
                                {communicationStatsMap.get(option.number) && (
                                  <div className="text-[11px] text-gray-400 dark:text-slate-500">
                                    Sent:{' '}
                                    {communicationStatsMap.get(option.number)?.smsCount ?? 0}{' '}
                                    message(s)
                                  </div>
                                )}
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-gray-500">
                      Selected {selectedNumbers.length} recipient
                      {selectedNumbers.length === 1 ? '' : 's'}.
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700">
                        Language Filter
                      </label>
                      <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                        value={smsLanguageFilter}
                        onChange={(e) => setSmsLanguageFilter(e.target.value)}
                      >
                        <option value="all">All Languages</option>
                        {availableTemplateLanguages.map((lang) => (
                          <option key={lang} value={lang}>
                            {lang.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="lg:col-span-2 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold">Templates</h3>
                      <div className="text-sm text-gray-500">
                        Selected: {selectedTemplateEntries.length}
                      </div>
                    </div>
                    {isLoadingTemplates ? (
                      <div className="space-y-3">
                        <Skeleton className="w-full h-24" />
                        <Skeleton className="w-full h-24" />
                      </div>
                    ) : filteredTemplates.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No active templates available. Add templates from the communications
                        admin page.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {filteredTemplates.map((template) => {
                          const templateState = selectedTemplatesState[template._id];
                          const variableDescriptors: MessageTemplateVariable[] =
                            template.variables && template.variables.length > 0
                              ? template.variables
                              : (Array.from({ length: template.variableCount }).map((_, index) => ({
                                  key: `var${index + 1}`,
                                  label: `Variable ${index + 1}`,
                                })) as MessageTemplateVariable[]);

                          return (
                            <div
                              key={template._id}
                              className="border border-gray-200 rounded-lg p-4 space-y-3 dark:border-slate-700"
                            >
                              <label className="flex items-start gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(templateState)}
                                  onChange={(e) =>
                                    handleTemplateSelectionChange(template, e.target.checked)
                                  }
                                  className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <div>
                                  <div className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                                    {template.name}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-slate-400">
                                    DLT ID: {template.dltTemplateId} · Language:{' '}
                                    {template.language?.toUpperCase()}
                                  </div>
                                  <div className="text-xs text-gray-400 dark:text-slate-500">
                                    Placeholders: {template.variableCount}
                                  </div>
                                </div>
                              </label>
                              {templateState && (
                                <div className="space-y-3">
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
                                              <label className="block text-xs font-medium text-gray-600 mb-1">
                                                {variable.label || `Variable ${index + 1}`}
                                              </label>
                                              <Input
                                                value={templateState.variables[key] || ''}
                                                onChange={(e) =>
                                                  handleTemplateVariableChange(
                                                    template._id,
                                                    key,
                                                    e.target.value
                                                  )
                                                }
                                                placeholder={
                                                  index === 0 && lead?.name
                                                    ? lead.name
                                                    : variable.defaultValue || ''
                                                }
                                              />
                                            </div>
                                            <div className="text-xs text-gray-400 flex items-end">
                                              Placeholder: {`{#var#}`}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                  <div className="bg-gray-50 dark:bg-slate-900/50 border border-gray-200 dark:border-slate-700 rounded-lg p-3 text-xs text-gray-700 dark:text-slate-300 whitespace-pre-wrap">
                                    {renderTemplatePreview(template, templateState.variables)}
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
                <div className="flex justify-between items-center gap-3 pt-2 flex-wrap">
                  <div className="text-xs text-gray-500">
                    {selectedNumbers.length === 0
                      ? 'Select at least one contact number.'
                      : selectedTemplateEntries.length === 0
                      ? 'Select at least one template to send.'
                      : `Ready to send using ${selectedTemplateEntries.length} template${
                          selectedTemplateEntries.length > 1 ? 's' : ''
                        }.`}
                  </div>
                  <Button
                    variant="secondary"
                    onClick={closeSmsModal}
                    disabled={sendSmsMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSendSms}
                    isLoading={sendSmsMutation.isPending}
                    disabled={
                      sendSmsMutation.isPending ||
                      contactOptions.length === 0 ||
                      selectedNumbers.length === 0 ||
                      selectedTemplateEntries.length === 0
                    }
                  >
                    Send Message
                  </Button>
                </div>
              </Card>
            </div>
          )}

          {/* Status Update Modal */}
    {showStatusUpdate && lead && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <Card className="max-w-md w-full">
                <h2 className="text-xl font-semibold mb-4">Update Status / Quota / Comment</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Current Status: <span className="font-semibold">{lead.leadStatus || 'New'}</span>
                    </label>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Update Status
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm"
                      value={newStatus}
                      onChange={(e) => handleStatusChange(e.target.value)}
                    >
                      <option value="">Keep Current Status</option>
                      <option value="interested">Interested</option>
                      <option value="not interested">Not Interested</option>
                      <option value="partial">Partial</option>
                      <option value="Confirmed">Confirmed</option>
                      <option value="Admitted">Admitted</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Current Quota: <span className="font-semibold">{lead.quota || 'Not Applicable'}</span>
                    </label>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Update Quota
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm"
                      value={newQuota}
                      onChange={(e) => setNewQuota(e.target.value)}
                    >
                      {quotaOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Comment
                    </label>
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm min-h-[100px]"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add a comment..."
                    />
                  </div>
                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="primary"
                      onClick={handleSaveStatusUpdate}
                      disabled={
                        addActivityMutation.isPending ||
                        (
                          !comment.trim() &&
                          newStatus === lead.leadStatus &&
                          newQuota === (lead.quota || 'Not Applicable')
                        )
                      }
                    >
                      {addActivityMutation.isPending ? 'Saving...' : 'Save'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowStatusUpdate(false);
                        setShowConfirmModal(false);
                        setComment('');
                        setNewStatus('');
                        setNewQuota('Not Applicable');
                      }}
                      disabled={addActivityMutation.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Confirmation Modal */}
          {showConfirmModal && lead && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <Card className="max-w-md w-full">
                <h2 className="text-xl font-semibold mb-4">Confirm Status Change</h2>
                <div className="space-y-4">
                  <p className="text-gray-700">
                    Are you sure you want to change the status from{' '}
                    <span className="font-semibold">{lead.leadStatus || 'New'}</span> to{' '}
                    <span className="font-semibold">{newStatus}</span>?
                  </p>
                  {newQuota !== (lead.quota || 'Not Applicable') && (
                    <p className="text-gray-700">
                      Quota will also be updated from{' '}
                      <span className="font-semibold">{lead.quota || 'Not Applicable'}</span> to{' '}
                      <span className="font-semibold">{newQuota}</span>.
                    </p>
                  )}
                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="primary"
                      onClick={handleConfirmStatusChange}
                      disabled={addActivityMutation.isPending}
                    >
                      {addActivityMutation.isPending ? 'Saving...' : 'Confirm'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowConfirmModal(false);
                        setNewStatus(lead.leadStatus || '');
                        setNewQuota(lead.quota || 'Not Applicable');
                      }}
                      disabled={addActivityMutation.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {showDeleteModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <Card className="max-w-md w-full">
                <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Lead</h2>
                <div className="space-y-4">
                  <p className="text-gray-700">
                    Are you sure you want to delete this lead? This action cannot be undone.
                  </p>
                  {lead && (
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold">Enquiry Number:</span> {lead.enquiryNumber || 'N/A'}
                      </p>
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold">Name:</span> {lead.name}
                      </p>
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold">Phone:</span> {lead.phone}
                      </p>
                    </div>
                  )}
                  <p className="text-sm text-red-600 font-medium">
                    ⚠️ This will also delete all activity logs associated with this lead.
                  </p>
                  <div className="flex gap-2 pt-4">
                    <Button
                      variant="primary"
                      onClick={handleConfirmDelete}
                      disabled={isDeleting || deleteMutation.isPending}
                      className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700"
                    >
                      {isDeleting || deleteMutation.isPending ? 'Deleting...' : 'Delete Lead'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowDeleteModal(false);
                        setIsDeleting(false);
                      }}
                      disabled={isDeleting || deleteMutation.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
        )}
      </div>
    </div>
  );
}

