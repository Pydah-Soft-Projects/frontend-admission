'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { leadAPI, userAPI } from '@/lib/api';
import { useLocations } from '@/lib/useLocations';
import { User, Lead, LeadFilters, FilterOptions, DeleteJobStatusResponse } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { showToast } from '@/lib/toast';
import { mergeQuotaSelectOptions } from '@/lib/studentQuotaCatalog';
import { Skeleton, CardSkeleton, LeadTableSkeleton, LeadCardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
// import { exportToExcel, exportToCSV } from '@/lib/export'; // Temporarily removed for future redesign
import { useDashboardHeader } from '@/components/layout/DashboardShell';

// Debounce hook for search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

const STORAGE_KEY = 'leads_management_state';

export default function LeadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { clearHeaderContent, setMobileTopBar, clearMobileTopBar } = useDashboardHeader();
  const [user, setUser] = useState(auth.getUser());
  const pageSizeOptions = [50, 100, 200, 300];
  const defaultPageSize = 50;

  // Initialize state from localStorage if available
  const getInitialState = () => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error('Error parsing stored state:', e);
        }
      }
    }
    return null;
  };

  const persistedState = getInitialState();

  const [page, setPage] = useState<number>(persistedState?.page || 1);
  const [limit, setLimit] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('leadTablePageSize');
      const parsed = stored ? parseInt(stored, 10) : (persistedState?.limit || defaultPageSize);
      if (!Number.isNaN(parsed) && pageSizeOptions.includes(parsed)) {
        return parsed;
      }
    }
    return persistedState?.limit || (defaultPageSize as number);
  });
  const [search, setSearch] = useState<string>(persistedState?.search || '');
  const [filters, setFilters] = useState<LeadFilters>(persistedState?.filters || {});
  const [showFilters, setShowFilters] = useState<boolean>(persistedState?.showFilters || false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [comment, setComment] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [newQuota, setNewQuota] = useState('Not Applicable');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set<string>());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignSelectedUserId, setAssignSelectedUserId] = useState('');
  const [assignableUsers, setAssignableUsers] = useState<User[]>([]);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [sortField, setSortField] = useState<string>(persistedState?.sortField || '');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(persistedState?.sortOrder || 'asc');
  const [searchSuggestions, setSearchSuggestions] = useState<Lead[]>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState(0);
  const bulkDeleteProgressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bulkDeleteProgressResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);
  const deleteJobPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [deleteJobStatus, setDeleteJobStatus] = useState<DeleteJobStatusResponse | null>(null);
  const deleteJobCompletedRef = useRef<boolean>(false);
  const [isExporting, setIsExporting] = useState(false);
  const queryClient = useQueryClient();

  // Apply source filter when navigated from dashboard quick links (e.g., Recent Leads by Source)
  useEffect(() => {
    const sourceFromUrl = searchParams?.get('source');
    if (!sourceFromUrl) return;
    setFilters((prev) => ({
      ...prev,
      source: sourceFromUrl,
    }));
    setPage(1);
    setShowFilters(true);
  }, [searchParams]);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && isMounted) {
      const stateToStore = {
        page,
        limit,
        search,
        filters,
        showFilters,
        sortField,
        sortOrder,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToStore));
    }
  }, [page, limit, search, filters, showFilters, sortField, sortOrder, isMounted]);

  // Debounce search inputs
  const debouncedSearch = useDebounce(search, 700);

  // Track previous values to detect actual changes and prevent resets on mount
  const prevSearchRef = useRef<string>(persistedState?.search || '');
  const prevLimitRef = useRef<number>(persistedState?.limit || (
    typeof window !== 'undefined' ? 
    (parseInt(window.localStorage.getItem('leadTablePageSize') || '', 10) || defaultPageSize) : 
    defaultPageSize
  ));

  // Reset to page 1 when search or enquiry number changes
  useEffect(() => {
    // Only reset if search or enquiry number actually changed (not just on initial mount)
    const searchChanged = debouncedSearch !== prevSearchRef.current;

    if (searchChanged) {
      setPage(1);
      prevSearchRef.current = debouncedSearch;
    }
  }, [debouncedSearch]);

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

  useEffect(() => {
    // Only reset page if limit actually changed from its previous/restored value
    if (limit !== prevLimitRef.current) {
      setPage(1);
      prevLimitRef.current = limit;
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('leadTablePageSize', String(limit));
    }
  }, [limit]);

  const clearBulkDeleteProgressInterval = () => {
    if (bulkDeleteProgressIntervalRef.current) {
      clearInterval(bulkDeleteProgressIntervalRef.current);
      bulkDeleteProgressIntervalRef.current = null;
    }
  };

  const clearBulkDeleteProgressResetTimeout = () => {
    if (bulkDeleteProgressResetTimeoutRef.current) {
      clearTimeout(bulkDeleteProgressResetTimeoutRef.current);
      bulkDeleteProgressResetTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearBulkDeleteProgressInterval();
      clearBulkDeleteProgressResetTimeout();
    };
  }, []);

  // State, district, mandal from locations master data (cascading)
  const { stateNames, districtNames, mandalNames } = useLocations({
    stateName: filters.state || undefined,
    districtName: filters.district || undefined,
  });

  // Load filter options (quota, leadStatus, academicYear, etc. - location filters use useLocations)
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const options = await leadAPI.getFilterOptions();
        setFilterOptions(options.data || options);
      } catch (error) {
        console.error('Error loading filter options:', error);
      }
    };
    if (user) {
      loadFilterOptions();
    }
  }, [user]);

  const quotaOptions = useMemo(
    () =>
      mergeQuotaSelectOptions(
        ['Not Applicable', ...(filterOptions?.quotas ?? [])],
        selectedLead?.quota
      ),
    [filterOptions?.quotas, selectedLead?.quota]
  );

  // Search suggestions (name or enquiry number only; matches backend)
  useEffect(() => {
    let active = true;

    const fetchSuggestions = async () => {
      const t = debouncedSearch.trim();
      try {
        const response = await leadAPI.getAll({
          ...filters,
          search: t,
          page: 1,
          limit: 10,
        });
        if (!active) return;
        const results = response.data?.leads || response.leads || [];
        setSearchSuggestions(results);
      } catch (error) {
        if (!active) return;
        setSearchSuggestions([]);
      }
    };

    if (debouncedSearch.trim().length >= 2) {
      fetchSuggestions();
    } else {
      setSearchSuggestions([]);
    }

    return () => {
      active = false;
    };
  }, [debouncedSearch, filters]);

  // Build query filters
  const queryFilters = useMemo(() => {
    const query: LeadFilters = {
      page,
      limit,
      ...filters,
    };
    const searchTrimmed = debouncedSearch?.trim() ?? '';
    if (searchTrimmed.length >= 2) {
      query.search = searchTrimmed;
    }
    return query;
  }, [page, limit, filters, debouncedSearch]);

  // Fetch leads with React Query for caching and performance
  const {
    data: leadsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['leads', queryFilters],
    queryFn: async () => {
      const response = await leadAPI.getAll(queryFilters);
      // Backend returns: { success: true, data: { leads: [...], pagination: {...} }, message: "..." }
      // API client extracts response.data, so we get: { success: true, data: { leads: [...], pagination: {...} }, message: "..." }
      return response.data || response;
    },
    enabled: !!user,
    staleTime: 30000, // Cache for 30 seconds
    refetchOnWindowFocus: false,
  });

  const leads = leadsData?.leads || [];
  const pagination = leadsData?.pagination || { page: 1, limit: 50, total: 0, pages: 1 };
  const needsUpdateCount = leadsData?.needsUpdateCount ?? 0;

  useEffect(() => {
    clearHeaderContent();
    return () => clearHeaderContent();
  }, [clearHeaderContent]);

  const isSubSuperAdmin = user?.roleName === 'Sub Super Admin';

  useEffect(() => {
    if (!isSubSuperAdmin) {
      clearMobileTopBar();
      return;
    }
    const titleMeta =
      !isError && leadsData != null
        ? `${pagination.total.toLocaleString()} total leads`
        : undefined;
    setMobileTopBar({ title: 'Leads Management', iconKey: 'leads', titleMeta });
    return () => clearMobileTopBar();
  }, [
    setMobileTopBar,
    clearMobileTopBar,
    isSubSuperAdmin,
    isError,
    leadsData,
    pagination.total,
  ]);

  const handleSort = useCallback((field: string) => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortOrder((prevOrder) => (prevOrder === 'asc' ? 'desc' : 'asc'));
        return prevField;
      }
      setSortOrder('asc');
      return field;
    });
  }, []);

  const displayedLeads = useMemo(() => {
    if (!sortField) return leads;
    const sorted = [...leads].sort((a: Lead, b: Lead) => {
      let aValue: string | number | null | undefined;
      let bValue: string | number | null | undefined;
      if (sortField === 'counsellorName') {
        aValue = typeof a.assignedTo === 'object' && a.assignedTo ? a.assignedTo.name : '';
        bValue = typeof b.assignedTo === 'object' && b.assignedTo ? b.assignedTo.name : '';
      } else if (sortField === 'proName') {
        aValue = typeof a.assignedToPro === 'object' && a.assignedToPro ? a.assignedToPro.name : '';
        bValue = typeof b.assignedToPro === 'object' && b.assignedToPro ? b.assignedToPro.name : '';
      } else {
        aValue = (a as unknown as Record<string, unknown>)[sortField] as string | number | null | undefined;
        bValue = (b as unknown as Record<string, unknown>)[sortField] as string | number | null | undefined;
      }

      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return sortOrder === 'asc' ? 1 : -1;
      if (bValue == null) return sortOrder === 'asc' ? -1 : 1;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
      }

      return sortOrder === 'asc'
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue));
    });
    return sorted;
  }, [leads, sortField, sortOrder]);

  // Handle filter changes
  const handleFilterChange = <K extends keyof LeadFilters>(
    key: K,
    value: LeadFilters[K] | '' | undefined | null
  ) => {
    setFilters((prev) => {
      const newFilters: LeadFilters = { ...prev };
      if (value !== undefined && value !== null && value !== '') {
        newFilters[key] = value as LeadFilters[K];
        if (key === 'state') {
          delete newFilters.district;
          delete newFilters.mandal;
        } else if (key === 'district') {
          delete newFilters.mandal;
        }
      } else {
        delete newFilters[key];
      }
      setPage(1);
      return newFilters;
    });
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({});
    setSearch('');
    setPage(1);
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Get status badge color
  const getStatusColor = (status?: string) => {
    switch ((status || '').toLowerCase()) {
      case 'interested':
        return 'bg-green-100 text-green-800';
      case 'contacted':
        return 'bg-sky-100 text-sky-800';
      case 'qualified':
      case 'cleared':
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
      case 'wrong data':
        return 'bg-orange-100 text-orange-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'lost':
        return 'bg-gray-300 text-gray-800';
      case 'not qualified':
      case 'rejected':
        return 'bg-rose-100 text-rose-800';
      case 'new':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Open comment modal
  const handleOpenCommentModal = (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    setSelectedLead(lead);
    setComment('');
    setNewStatus(lead.leadStatus || '');
    setNewQuota(lead.quota || 'Not Applicable');
    setShowCommentModal(true);
  };

  // Handle status change with confirmation
  const handleStatusChange = (status: string) => {
    setNewStatus(status);
    // Don't show confirmation modal immediately - let user save first
    // Confirmation will show when they click Save if status changed
  };

  // Mutation for adding activity
  const addActivityMutation = useMutation({
    mutationFn: async (data: { comment?: string; newStatus?: string; newQuota?: string }) => {
      if (!selectedLead) return;
      return await leadAPI.addActivity(selectedLead._id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['lead', selectedLead?._id] });
      setShowCommentModal(false);
      setShowConfirmModal(false);
      setSelectedLead(null);
      setComment('');
      setNewStatus('');
      setNewQuota('Not Applicable');
    },
    onError: (error: any) => {
      console.error('Error adding activity:', error);
      showToast.error(error.response?.data?.message || 'Failed to add activity');
    },
  });

  // Handle save comment/status
  const handleSaveActivity = () => {
    if (!selectedLead) return;

    const hasComment = comment.trim().length > 0;
    const hasStatusChange = newStatus && newStatus !== selectedLead.leadStatus;
    const currentQuota = selectedLead.quota || 'Not Applicable';
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
    if (!selectedLead) return;
    setShowConfirmModal(false);
    // Save with status change
    addActivityMutation.mutate({
      comment: comment.trim() ? comment.trim() : undefined,
      newStatus: newStatus && newStatus !== selectedLead.leadStatus ? newStatus : undefined,
      newQuota: newQuota && newQuota !== (selectedLead.quota || 'Not Applicable') ? newQuota : undefined,
    });
  };

  // Clear delete job polling
  const clearDeleteJobPolling = useCallback(() => {
    if (deleteJobPollingRef.current) {
      clearInterval(deleteJobPollingRef.current);
      deleteJobPollingRef.current = null;
    }
  }, []);

  // Poll for delete job status
  const pollDeleteJobStatus = useCallback(async (jobId: string) => {
    // Prevent multiple completion handlers - early return if already completed
    if (deleteJobCompletedRef.current) {
      return;
    }

    try {
      const status = await leadAPI.getDeleteJobStatus(jobId);
      if (status) {
        setDeleteJobStatus(status);

        // Update progress based on actual stats
        if (status.stats) {
          const { deletedLeadCount, validCount } = status.stats;
          if (validCount > 0) {
            const progress = Math.min(95, Math.round((deletedLeadCount / validCount) * 90));
            setBulkDeleteProgress(progress);
          }
        }

        // Stop polling if job is completed or failed
        if (status.status === 'completed' || status.status === 'failed') {
          // Double-check and mark as completed atomically to prevent race conditions
          if (deleteJobCompletedRef.current) {
            return;
          }

          // Set flag immediately before any async operations
          deleteJobCompletedRef.current = true;

          // Clear polling immediately to prevent any more calls
          clearDeleteJobPolling();
          setBulkDeleteProgress(100);

          // Show toast only once
          if (status.status === 'completed') {
            queryClient.invalidateQueries({ queryKey: ['leads'] });
            setSelectedLeads(new Set<string>());
            setShowBulkDeleteModal(false);
            setPage(1);
            const deletedCount = status.stats?.deletedLeadCount || 0;
            showToast.success(`Successfully deleted ${deletedCount} lead(s)`);
          } else {
            showToast.error(status.message || 'Failed to delete leads');
          }

          // Reset after a delay
          setTimeout(() => {
            setBulkDeleteProgress(0);
            setDeleteJobId(null);
            setDeleteJobStatus(null);
            deleteJobCompletedRef.current = false;
          }, 2000);
        }
      }
    } catch (error: any) {
      // Only show error if not already completed
      if (!deleteJobCompletedRef.current) {
        console.error('Error polling delete job status:', error);
        clearDeleteJobPolling();
        deleteJobCompletedRef.current = false;
        showToast.error('Failed to check delete job status');
      }
    }
  }, [clearDeleteJobPolling, queryClient]);

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const result = await leadAPI.bulkDelete(leadIds);
      if (!result || !result.jobId) {
        throw new Error('Failed to queue delete job');
      }
      return result;
    },
    onSuccess: (data) => {
      if (data?.jobId) {
        // Reset completion flag for new job
        deleteJobCompletedRef.current = false;
        setDeleteJobId(data.jobId);
        setBulkDeleteProgress(5);
        // Start polling
        deleteJobPollingRef.current = setInterval(() => {
          pollDeleteJobStatus(data.jobId);
        }, 2000);
        // Poll immediately
        pollDeleteJobStatus(data.jobId);
      }
    },
    onError: (error: any) => {
      console.error('Error bulk deleting leads:', error);
      clearDeleteJobPolling();
      deleteJobCompletedRef.current = false;
      setBulkDeleteProgress(0);
      showToast.error(error.response?.data?.message || 'Failed to queue delete job');
    },
  });

  // Load assignable users (Users and Sub Super Admins)
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const response = await userAPI.getAll();
        const allUsers = response.data || response;
        // Filter: include Users, Student Counselors, Data Entry Users, Sub Super Admins; exclude Super Admin
        const assignable = allUsers.filter(
          (u: User) =>
            u.isActive &&
            u.roleName !== 'Super Admin' &&
            ['Student Counselor', 'Data Entry User', 'Sub Super Admin', 'PRO'].includes(u.roleName)
        );
        setAssignableUsers(assignable);
      } catch (error) {
        console.error('Error loading users:', error);
      }
    };
    if (user) {
      loadUsers();
    }
  }, [user]);

  // Bulk assign mutation
  const bulkAssignMutation = useMutation({
    mutationFn: async ({ userId, leadIds }: { userId: string; leadIds: string[] }) => {
      return await leadAPI.assignLeads({
        userId,
        leadIds,
      });
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      const assignedCount = response.data?.assigned || response.assigned || 0;
      const userName = response.data?.userName || 'user';
      showToast.success(`Successfully assigned ${assignedCount} lead${assignedCount !== 1 ? 's' : ''} to ${userName}`);
      setSelectedLeads(new Set<string>());
      setShowAssignModal(false);
      setAssignSelectedUserId('');
    },
    onError: (error: any) => {
      console.error('Error assigning leads:', error);
      showToast.error(error.response?.data?.message || 'Failed to assign leads');
    },
  });

  const handleBulkAssign = () => {
    if (selectedLeads.size === 0) {
      showToast.error('Please select at least one lead to assign');
      return;
    }
    setShowAssignModal(true);
  };

  const handleConfirmAssign = () => {
    if (!assignSelectedUserId) {
      showToast.error('Please select a user to assign leads to');
      return;
    }
    const leadIds = Array.from(selectedLeads);
    bulkAssignMutation.mutate({ userId: assignSelectedUserId, leadIds });
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      clearDeleteJobPolling();
      clearBulkDeleteProgressInterval();
      if (bulkDeleteProgressResetTimeoutRef.current) {
        clearTimeout(bulkDeleteProgressResetTimeoutRef.current);
      }
    };
  }, [clearDeleteJobPolling]);

  const toggleLeadSelection = (leadId: string, shouldSelect?: boolean) => {
    setSelectedLeads((prev) => {
      const newSet = new Set<string>(prev);
      const isSelected = prev.has(leadId);
      const nextValue = shouldSelect ?? !isSelected;
      if (nextValue) {
        newSet.add(leadId);
      } else {
        newSet.delete(leadId);
      }
      return newSet;
    });
  };

  // Handle select/deselect lead
  const handleSelectLead = (leadId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    toggleLeadSelection(leadId);
  };

  // Handle select all
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const allIds = new Set<string>(displayedLeads.map((lead: Lead) => lead._id));
      setSelectedLeads(allIds);
    } else {
      setSelectedLeads(new Set<string>());
    }
  };

  // Handle bulk delete
  const handleBulkDelete = () => {
    if (selectedLeads.size === 0) {
      showToast.error('Please select at least one lead to delete');
      return;
    }
    setShowBulkDeleteModal(true);
  };

  // Confirm bulk delete
  const handleConfirmBulkDelete = () => {
    const leadIds = Array.from(selectedLeads);
    bulkDeleteMutation.mutate(leadIds);
  };

  // Handle select all in collection
  const handleSelectAllInCollection = async () => {
    try {
      setIsSelectingAll(true);
      // Build filters without pagination
      const filtersForIds: LeadFilters = {
        ...filters,
      };
      const searchTrimmed = debouncedSearch?.trim() ?? '';
      if (searchTrimmed.length >= 2) {
        filtersForIds.search = searchTrimmed;
      }

      // Fetch all lead IDs matching current filters
      const response = await leadAPI.getAllIds(filtersForIds);
      const allIds = (response.data?.ids || response.ids || []) as string[];

      // Select all IDs
      setSelectedLeads(new Set<string>(allIds));
    } catch (error) {
      console.error('Error selecting all leads:', error);
      showToast.error('Failed to select all leads. Please try again.');
    } finally {
      setIsSelectingAll(false);
    }
  };

  // Handle export to Excel
  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      
      // Build filters matching current view
      const exportFilters: any = {
        ...filters,
      };
      const searchTrimmed = debouncedSearch?.trim() ?? '';
      if (searchTrimmed.length >= 2) {
        exportFilters.search = searchTrimmed;
      }

      const blob = await leadAPI.exportLeads(exportFilters);
      
      // Create a URL for the blob
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      
      // Generate filename with date
      const date = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `leads_export_${date}.xlsx`);
      
      // Append to document, click and cleanup
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      showToast.success('Excel export started successfully');
    } catch (error) {
      console.error('Error exporting leads:', error);
      showToast.error('Failed to export leads. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Prevent hydration mismatch by not rendering until mounted
  if (!isMounted || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
          <CardSkeleton />
        </div>
      </div>
    );
  }

  const modalOverlayClass = isSubSuperAdmin
    ? 'fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50'
    : 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';

  return (
    <div className={isSubSuperAdmin ? 'mx-auto w-full max-w-7xl space-y-4 px-0 pb-2' : 'w-full space-y-4'}>
      {!isSubSuperAdmin ? (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Leads Management</h1>
          {!isError && leadsData != null && (
            <span className="text-sm font-semibold tabular-nums text-slate-500 dark:text-slate-400">
              {pagination.total.toLocaleString()} total leads
            </span>
          )}
        </div>
      ) : null}

      <div className="mb-2">
        {/* Search, Filters, and Action Bar */}
        <div className={isSubSuperAdmin ? 'flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-3' : 'flex flex-wrap gap-3'}>
          {/* Global search: name or enquiry number only */}
          <div className={`relative ${isSubSuperAdmin ? 'min-w-0 flex-1 sm:flex-[2] sm:min-w-[300px]' : 'flex-[2] min-w-[300px]'}`}>
            <Input
              type="text"
              placeholder={isSubSuperAdmin ? 'Name, enquiry, or mobile number…' : 'Search by name or enquiry # (e.g. ENQ24...)'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setShowSearchSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 150)}
              className={isSubSuperAdmin
                ? 'h-9 w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-sm pl-10 focus:ring-1 focus:ring-orange-500 sm:py-2 sm:text-sm'
                : 'w-full py-2 text-sm pl-10'}
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            {showSearchSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute z-20 mt-2 w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
                <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50/50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                  Quick Results
                </div>
                {searchSuggestions.map((suggestion) => (
                  <button
                    key={`search-suggestion-${suggestion._id}`}
                    type="button"
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800/60 flex flex-col gap-0.5 border-b last:border-0 border-gray-50 dark:border-slate-800"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const value = suggestion.name || suggestion.enquiryNumber || suggestion.phone || '';
                      if (value) {
                        setSearch(value);
                        setPage(1);
                      }
                      setShowSearchSuggestions(false);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                       <span className="font-semibold text-slate-800 dark:text-slate-100">{suggestion.name || 'Untitled Lead'}</span>
                       {suggestion.enquiryNumber && (
                         <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded font-mono uppercase tracking-tight">
                           {suggestion.enquiryNumber}
                         </span>
                       )}
                    </div>
                    <div className="flex gap-4 text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
                      {suggestion.phone && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          {suggestion.phone}
                        </span>
                      )}
                      {suggestion.mandal && (
                        <span className="flex items-center gap-1 uppercase tracking-tighter opacity-80">
                          <svg className="w-3 h-3 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {suggestion.mandal}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Filter Buttons */}
          <div className={`flex items-center shrink-0 self-end mb-0.5 ${isSubSuperAdmin ? 'gap-1.5' : 'gap-2'}`}>
            {isSubSuperAdmin ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowFilters(!showFilters)}
                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-transparent px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {showFilters ? 'Hide' : 'Filters'}
                </button>
                {(Object.keys(filters).length > 0 || search) && (
                  <Button variant="outline" size="sm" onClick={clearFilters} className="!py-1.5 !px-2 !text-xs !min-h-0 h-8">
                    Clear
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1.5 h-10">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {showFilters ? 'Hide' : 'Show'} Filters
                </Button>
                {(Object.keys(filters).length > 0 || search) && (
                  <Button variant="outline" onClick={clearFilters} className="flex items-center gap-1.5 h-10">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Clear
                  </Button>
                )}
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className={`flex items-center gap-2 self-end mb-0.5 flex-wrap ${isSubSuperAdmin ? 'hidden md:flex' : ''}`}>
            <Button
              variant="primary"
              onClick={() => router.push('/superadmin/leads/individual')}
              className="flex items-center gap-1.5 h-10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add New Enquiry
            </Button>
            <Button
              variant="primary"
              onClick={() => router.push('/superadmin/leads/upload')}
              className="flex items-center gap-1.5 h-10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Add Bulk data
            </Button>
            <Button
              variant="primary"
              onClick={() => router.push('/superadmin/leads/assign')}
              className="flex items-center gap-1.5 h-10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Assign Leads
            </Button>
            <Button
              variant="outline"
              onClick={handleExportExcel}
              disabled={isExporting}
              className="flex items-center gap-1.5 h-10 border-green-600 text-green-600 hover:bg-green-50 dark:border-green-500 dark:text-green-500 dark:hover:bg-green-900/20"
            >
              {isExporting ? (
                <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              )}
              {isExporting ? 'Exporting...' : 'Export Excel'}
            </Button>
          </div>
        </div>

        {/* Filters Section */}
        <div className="mt-2">

          {/* Filter Row */}
          {showFilters && (
            <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 md:grid-cols-6 w-full">
              <div className="flex min-w-0 flex-col gap-1 col-span-1">
                <label className="text-[10px] font-medium text-slate-500 md:text-sm md:text-gray-700 md:dark:text-slate-200 md:mb-1">
                  State
                </label>
                <select
                  className="w-full min-w-0 rounded border border-slate-200 bg-white py-1.5 px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 md:px-3 md:py-2 md:text-sm md:rounded-lg md:focus:ring-2 md:focus:ring-blue-500 dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                  value={filters.state || ''}
                  onChange={(e) => handleFilterChange('state', e.target.value)}
                >
                  <option value="">All States</option>
                  {stateNames.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  District
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                  value={filters.district || ''}
                  onChange={(e) => handleFilterChange('district', e.target.value)}
                  disabled={!filters.state}
                >
                  <option value="">{filters.state ? 'All Districts' : 'Select state first'}</option>
                  {districtNames.map((district) => (
                    <option key={district} value={district}>
                      {district}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Mandal
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                  value={filters.mandal || ''}
                  onChange={(e) => handleFilterChange('mandal', e.target.value)}
                  disabled={!filters.district}
                >
                  <option value="">{filters.district ? 'All Mandals' : 'Select district first'}</option>
                  {mandalNames.map((mandal) => (
                    <option key={mandal} value={mandal}>
                      {mandal}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Lead Status
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                  value={filters.leadStatus || ''}
                  onChange={(e) => handleFilterChange('leadStatus', e.target.value)}
                >
                  <option value="">All Lead Statuses</option>
                  {filterOptions?.leadStatuses?.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Source
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                  value={filters.source || ''}
                  onChange={(e) => handleFilterChange('source', e.target.value)}
                >
                  <option value="">All Sources</option>
                  {filterOptions?.sources?.map((src) => (
                    <option key={src} value={src}>
                      {src}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Academic Year
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                  value={filters.academicYear ?? ''}
                  onChange={(e) => handleFilterChange('academicYear', e.target.value ? Number(e.target.value) : undefined)}
                >
                  <option value="">All Years</option>
                  {filterOptions?.academicYears?.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Student Group
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                  value={filters.studentGroup || ''}
                  onChange={(e) => handleFilterChange('studentGroup', e.target.value)}
                >
                  <option value="">All Groups</option>
                  {filterOptions?.studentGroups?.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Cycle
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                  value={filters.cycleNumber || ''}
                  onChange={(e) => handleFilterChange('cycleNumber', e.target.value ? Number(e.target.value) : undefined)}
                >
                  <option value="">All Cycles</option>
                  {[1, 2, 3, 4, 5].map((cycle) => (
                    <option key={cycle} value={cycle}>
                      Cycle {cycle}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Manual Update
                </label>
                <div className="flex items-center h-10">
                  <button
                    type="button"
                    onClick={() => handleFilterChange('needsUpdate', filters.needsUpdate ? undefined : true)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                      filters.needsUpdate 
                        ? 'bg-amber-50 border-amber-300 text-amber-800 shadow-sm' 
                        : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${filters.needsUpdate ? 'bg-amber-500' : 'bg-gray-300 dark:bg-slate-600'}`}></span>
                    <span className="text-[11px] font-bold uppercase tracking-tight">Needs Update</span>
                    {needsUpdateCount > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${filters.needsUpdate ? 'bg-amber-200' : 'bg-gray-100 dark:bg-slate-800'}`}>
                        {needsUpdateCount}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <section className="space-y-6">
        {/* Results Summary + pagination (right) */}
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 min-w-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
            <p className="text-sm text-gray-600 dark:text-slate-300">
              Showing {leads.length} of {pagination.total} leads
              {pagination.total > 0 && (
                <span className="ml-2">
                  (Page {pagination.page} of {pagination.pages})
                </span>
              )}
            </p>
            <div className={`flex items-center gap-2 flex-wrap ${isSubSuperAdmin ? 'hidden md:flex' : ''}`}>
              {pagination.total > 0 && (
                <Button
                  variant="outline"
                  onClick={handleSelectAllInCollection}
                  disabled={isSelectingAll}
                  size="sm"
                  className="bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-300 hover:border-blue-400"
                >
                  {isSelectingAll ? (
                    <>
                      <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                      Selecting...
                    </>
                  ) : (
                    `Select All (${pagination.total})`
                  )}
                </Button>
              )}
              {selectedLeads.size > 0 && (
                <>
                  <span className="text-sm text-gray-700 dark:text-slate-200 font-medium">
                    {selectedLeads.size} selected
                  </span>
                  <Button
                    variant="primary"
                    onClick={handleBulkAssign}
                    size="sm"
                  >
                    Assign Selected
                  </Button>
                  {user?.roleName === 'Super Admin' && (
                    <Button
                      variant="outline"
                      onClick={handleBulkDelete}
                      className="bg-red-50 hover:bg-red-100 text-red-600 border-red-300 hover:border-red-400"
                      size="sm"
                    >
                      Delete Selected
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {!isError && (
            <div className="flex flex-wrap items-center justify-start lg:justify-end gap-2 lg:shrink-0">
              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300 mr-1">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  Loading...
                </div>
              )}
              {pagination.pages > 1 && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setPage(1)}
                    disabled={page === 1 || isLoading}
                    size="sm"
                    className="p-2"
                    title="First Page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    </svg>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPage((p: number) => Math.max(1, p - 1))}
                    disabled={page === 1 || isLoading}
                    size="sm"
                    className="p-2"
                    title="Previous Page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </Button>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                      let pageNum;
                      if (pagination.pages <= 5) {
                        pageNum = i + 1;
                      } else if (page <= 3) {
                        pageNum = i + 1;
                      } else if (page >= pagination.pages - 2) {
                        pageNum = pagination.pages - 4 + i;
                      } else {
                        pageNum = page - 2 + i;
                      }
                      return (
                        <Button
                          key={pageNum}
                          variant={page === pageNum ? 'primary' : 'outline'}
                          onClick={() => setPage(pageNum)}
                          disabled={isLoading}
                          size="sm"
                          className="min-w-10"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setPage((p: number) => Math.min(pagination.pages, p + 1))}
                    disabled={page === pagination.pages || isLoading}
                    size="sm"
                    className="p-2"
                    title="Next Page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPage(pagination.pages)}
                    disabled={page === pagination.pages || isLoading}
                    size="sm"
                    className="p-2"
                    title="Last Page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                    </svg>
                  </Button>
                </>
              )}
              {pagination.pages > 50 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 dark:text-slate-300 whitespace-nowrap">Jump to:</label>
                  <select
                    value={page}
                    onChange={(e) => setPage(Number(e.target.value))}
                    disabled={isLoading}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                  >
                    {Array.from({ length: Math.ceil(pagination.pages / 50) }, (_, i) => {
                      const pageValue = (i + 1) * 50;
                      if (pageValue <= pagination.pages) {
                        return (
                          <option key={pageValue} value={pageValue}>
                            Page {pageValue}
                          </option>
                        );
                      }
                      return null;
                    })}
                    {!Array.from({ length: Math.ceil(pagination.pages / 50) }, (_, i) => (i + 1) * 50).includes(page) && (
                      <option value={page}>Page {page} (Current)</option>
                    )}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-slate-300 whitespace-nowrap">Rows per page:</label>
                <select
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  disabled={isLoading}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm text-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Leads Table */}
        {isError ? (
          <Card>
            <div className="text-center py-8">
              <p className="text-red-600 dark:text-rose-300 mb-4">
                Error loading leads: {error instanceof Error ? error.message : 'Unknown error'}
              </p>
              <Button onClick={() => refetch()}>Retry</Button>
            </div>
          </Card>
        ) : leads.length === 0 && !isLoading ? (
          <Card>
            <EmptyState
              title="No leads found"
              description="Get started by uploading your first batch of leads or adding individual leads."
              icon={
                <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              action={{
                label: 'Upload Leads',
                onClick: () => router.push('/superadmin/leads/upload'),
              }}
            />
          </Card>
        ) : isLoading ? (
          isSubSuperAdmin ? (
            <>
              <div className="grid grid-cols-1 gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3 md:hidden">
                {Array.from({ length: 6 }).map((_, i) => (
                  <LeadCardSkeleton key={i} />
                ))}
              </div>
              <Card className="hidden md:block">
                <div className="p-0">
                  <LeadTableSkeleton rows={10} />
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <div className="p-0">
                <LeadTableSkeleton rows={10} />
              </div>
            </Card>
          )
        ) : (
          <>
            {isSubSuperAdmin ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:hidden">
              {displayedLeads.map((lead: Lead) => {
                const assignedUserName = typeof lead.assignedTo === 'object' && lead.assignedTo !== null
                  ? lead.assignedTo.name
                  : '—';
                return (
                  <article
                    key={`mobile-lead-${lead._id}`}
                    onClick={() => router.push(`/superadmin/leads/${lead._id}`)}
                    className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm transition-all duration-200 hover:shadow-md hover:border-orange-200/80 cursor-pointer dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="h-0.5 w-full bg-slate-100 group-hover:bg-orange-100 transition-colors dark:bg-slate-800" aria-hidden />
                    <div className="relative flex flex-1 flex-col p-3">
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-400 text-white shadow-sm ring-1 ring-orange-600/20 font-semibold text-sm uppercase">
                            {(lead.name || '?').charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <Link
                              href={`/superadmin/leads/${lead._id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="block truncate text-sm font-semibold text-slate-900 underline underline-offset-2 decoration-orange-500 hover:text-orange-600 dark:text-slate-100 dark:decoration-orange-400 dark:hover:text-orange-400"
                            >
                              {lead.name || '—'}
                            </Link>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1">
                              {lead.isNRI && (
                                <span className="rounded bg-purple-100 px-1 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                  NRI
                                </span>
                              )}
                              {Number(lead.needsManualUpdate) > 0 && (
                                <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700" title="Details need manual update">
                                  Update
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className={`shrink-0 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusColor(lead.leadStatus)}`}>
                          {lead.leadStatus || 'New'}
                        </span>
                      </div>

                      <div className="mt-1.5 ml-11 space-y-1">
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                          <span className="font-medium text-slate-700 dark:text-slate-300">{lead.phone || '—'}</span>
                        </div>
                        {(lead.studentGroup || lead.mandal || lead.district || assignedUserName !== '—') && (
                          <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span className="min-w-0 truncate">
                              {[lead.studentGroup, lead.mandal, lead.district].filter(Boolean).join(', ')}
                              {assignedUserName !== '—' && (
                                <span className="block text-[10px] text-slate-400 dark:text-slate-500">Counsellor: {assignedUserName}</span>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            ) : (
            <div className="grid gap-4 md:hidden">
              {displayedLeads.map((lead: Lead) => {
                const assignedUserName = typeof lead.assignedTo === 'object' && lead.assignedTo !== null
                  ? lead.assignedTo.name
                  : '—';
                const proUserName = typeof lead.assignedToPro === 'object' && lead.assignedToPro !== null
                  ? lead.assignedToPro.name
                  : '—';
                return (
                  <Card
                    key={`mobile-${lead._id}`}
                    className="p-4 bg-white/80 dark:bg-slate-900/60"
                    onClick={() => router.push(`/superadmin/leads/${lead._id}`)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Lead name</p>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{lead.name}</p>
                          {lead.isNRI && (
                            <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded">NRI</span>
                          )}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={selectedLeads.has(lead._id)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleLeadSelection(lead._id, e.target.checked);
                        }}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                      />
                    </div>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">Group</span>
                        <span className="font-medium text-gray-900 dark:text-slate-100">{lead.studentGroup || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">District</span>
                        <span className="font-medium text-gray-900 dark:text-slate-100">{lead.district || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">Mandal</span>
                        <span className="font-medium text-gray-900 dark:text-slate-100">{lead.mandal || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">Lead status</span>
                        <span
                          className={`px-2 py-0.5 inline-flex text-[11px] leading-4 font-semibold rounded-full ${getStatusColor(lead.leadStatus)}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCommentModal(lead, e as unknown as React.MouseEvent);
                          }}
                        >
                          {lead.leadStatus || 'New'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">Counsellor</span>
                        <span className="font-medium text-gray-900 dark:text-slate-100">{assignedUserName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">Counsellor status</span>
                        <span className="font-medium text-gray-900 dark:text-slate-100">{lead.callStatus || '—'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">PRO</span>
                        <span className="font-medium text-gray-900 dark:text-slate-100">{proUserName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-slate-400">PRO status</span>
                        <span className="font-medium text-gray-900 dark:text-slate-100">{lead.visitStatus || '—'}</span>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); router.push(`/superadmin/leads/${lead._id}`); }}>View Details</Button>
                      <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleOpenCommentModal(lead, e as unknown as React.MouseEvent); }}>Comment / Update Status</Button>
                    </div>
                  </Card>
                );
              })}
            </div>
            )}

            <div className="hidden md:block overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="overflow-x-auto w-full">
                <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-800/80">
                    <tr>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider w-10 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={selectedLeads.size > 0 && selectedLeads.size === displayedLeads.length}
                          onChange={handleSelectAll}
                          className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </th>
                      <th
                        className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        onClick={() => handleSort('name')}
                      >
                        <div className="flex items-center gap-1">
                          Lead name
                          {sortField === 'name' && (
                            <span className="text-blue-600 dark:text-blue-300">
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        onClick={() => handleSort('studentGroup')}
                      >
                        <div className="flex items-center gap-1">
                          Group
                          {sortField === 'studentGroup' && (
                            <span className="text-blue-600 dark:text-blue-300">
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        onClick={() => handleSort('district')}
                      >
                        <div className="flex items-center gap-1">
                          District
                          {sortField === 'district' && (
                            <span className="text-blue-600 dark:text-blue-300">
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        onClick={() => handleSort('mandal')}
                      >
                        <div className="flex items-center gap-1">
                          Mandal
                          {sortField === 'mandal' && (
                            <span className="text-blue-600 dark:text-blue-300">
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        onClick={() => handleSort('source')}
                      >
                        <div className="flex items-center gap-1">
                          Source
                          {sortField === 'source' && (
                            <span className="text-blue-600 dark:text-blue-300">
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        onClick={() => handleSort('leadStatus')}
                      >
                        <div className="flex items-center gap-1">
                          Lead status
                          {sortField === 'leadStatus' && (
                            <span className="text-blue-600 dark:text-blue-300">
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        onClick={() => handleSort('counsellorName')}
                      >
                        <div className="flex items-center gap-1">
                          Counsellor
                          {sortField === 'counsellorName' && (
                            <span className="text-blue-600 dark:text-blue-300">
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        onClick={() => handleSort('callStatus')}
                      >
                        <div className="flex items-center gap-1">
                          Counsellor status
                          {sortField === 'callStatus' && (
                            <span className="text-blue-600 dark:text-blue-300">
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        onClick={() => handleSort('proName')}
                      >
                        <div className="flex items-center gap-1">
                          PRO
                          {sortField === 'proName' && (
                            <span className="text-blue-600 dark:text-blue-300">
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                        onClick={() => handleSort('visitStatus')}
                      >
                        <div className="flex items-center gap-1">
                          PRO status
                          {sortField === 'visitStatus' && (
                            <span className="text-blue-600 dark:text-blue-300">
                              {sortOrder === 'asc' ? '↑' : '↓'}
                            </span>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {displayedLeads.map((lead: Lead, rowIndex: number) => {
                      const assignedUserName = typeof lead.assignedTo === 'object' && lead.assignedTo !== null
                        ? lead.assignedTo.name
                        : '—';
                      const proUserName = typeof lead.assignedToPro === 'object' && lead.assignedToPro !== null
                        ? lead.assignedToPro.name
                        : '—';
                      const isEven = rowIndex % 2 === 0;
                      return (
                        <tr
                          key={lead._id}
                          className={`cursor-pointer transition-colors duration-200 ${isEven ? 'bg-white dark:bg-slate-900/40' : 'bg-slate-50 dark:bg-slate-800/50'} hover:bg-slate-100 dark:hover:bg-slate-800/70`}
                          onClick={() => router.push(`/superadmin/leads/${lead._id}`)}
                        >
                          <td className="px-3 py-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedLeads.has(lead._id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleLeadSelection(lead._id, e.target.checked);
                              }}
                              className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs font-medium text-gray-900 dark:text-slate-100" title={lead.name}>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span>{lead.name}</span>
                              {lead.isNRI && (
                                <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded">
                                  NRI
                                </span>
                              )}
                              {lead.needsManualUpdate === 1 && (
                                <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 rounded" title="District or mandal may not match master data. Update manually.">
                                  Needs update
                                </span>
                              )}
                              {lead.needsManualUpdate === 2 && (
                                <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 rounded" title="District is valid, but Mandal misspelling detected. Update manually.">
                                  Mandal need to be updated
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300" title={lead.studentGroup || '—'}>
                            {lead.studentGroup || '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 truncate max-w-[100px]" title={lead.district || '—'}>
                            {lead.district || '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 truncate max-w-[100px]" title={lead.mandal || '—'}>
                            {lead.mandal || '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 truncate max-w-[120px]" title={lead.source || '—'}>
                            {lead.source || '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap max-w-[112px]">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenCommentModal(lead, e);
                              }}
                              className={`px-2 py-0.5 inline-flex text-[10px] leading-4 font-semibold rounded-full transition-all cursor-pointer hover:opacity-80 truncate max-w-full ${getStatusColor(
                                lead.leadStatus
                              )}`}
                              title="Click to update status"
                            >
                              {lead.leadStatus || 'New'}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 truncate max-w-[120px]" title={assignedUserName}>
                            {assignedUserName}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 truncate max-w-[100px]" title={lead.callStatus || '—'}>
                            {lead.callStatus || '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 truncate max-w-[120px]" title={proUserName}>
                            {proUserName}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 truncate max-w-[100px]" title={lead.visitStatus || '—'}>
                            {lead.visitStatus || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>

      {showCommentModal && selectedLead && (
        <div className={modalOverlayClass}>
          {isSubSuperAdmin ? (
            <div className="w-full max-h-[90vh] overflow-y-auto sm:max-h-none sm:overflow-visible rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-xl sm:max-w-md pt-4 pb-[env(safe-area-inset-bottom)] sm:pb-4">
              <div className="px-4 sm:px-6 pb-4">
                <div className="mx-auto w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 sm:hidden mb-4" aria-hidden />
                <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-slate-100">Add Comment / Update Status / Quota</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                      Current Status: <span className="font-semibold">{selectedLead.leadStatus || 'New'}</span>
                    </label>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">Update Status</label>
                    <select
                      className="w-full min-h-[44px] px-3 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-slate-900/70 dark:border-slate-700 dark:text-slate-100"
                      value={newStatus}
                      onChange={(e) => handleStatusChange(e.target.value)}
                    >
                      <option value="">Keep Current Status</option>
                      <option value="Interested">Interested</option>
                      <option value="Not Interested">Not Interested</option>
                      <option value="Wrong Data">Wrong Data</option>
                      <option value="partial">Partial</option>
                      <option value="Confirmed">Confirmed</option>
                      <option value="Admitted">Admitted</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                      Current Quota: <span className="font-semibold">{selectedLead.quota || 'Not Applicable'}</span>
                    </label>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">Update Quota</label>
                    <select
                      className="w-full min-h-[44px] px-3 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-slate-900/70 dark:border-slate-700 dark:text-slate-100"
                      value={newQuota}
                      onChange={(e) => setNewQuota(e.target.value)}
                    >
                      {quotaOptions.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">Comment</label>
                    <textarea
                      className="w-full min-h-[120px] px-3 py-3 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white dark:bg-slate-900/70 dark:border-slate-700 dark:text-slate-100"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add a comment..."
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button variant="primary" onClick={handleSaveActivity} disabled={addActivityMutation.isPending || (!comment.trim() && newStatus === selectedLead.leadStatus && newQuota === (selectedLead.quota || 'Not Applicable'))} className="min-h-[44px] flex-1 sm:flex-initial">
                      {addActivityMutation.isPending ? 'Saving...' : 'Save'}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowCommentModal(false); setShowConfirmModal(false); setSelectedLead(null); setComment(''); setNewStatus(''); setNewQuota('Not Applicable'); }} disabled={addActivityMutation.isPending} className="min-h-[44px] flex-1 sm:flex-initial">
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <Card className="max-w-md w-full">
              <h2 className="text-xl font-semibold mb-4">Add Comment / Update Status / Quota</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                    Current Status: <span className="font-semibold">{selectedLead.leadStatus || 'New'}</span>
                  </label>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">Update Status</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100" value={newStatus} onChange={(e) => handleStatusChange(e.target.value)}>
                    <option value="">Keep Current Status</option>
                    <option value="Interested">Interested</option>
                    <option value="Not Interested">Not Interested</option>
                    <option value="Wrong Data">Wrong Data</option>
                    <option value="partial">Partial</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Admitted">Admitted</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                    Current Quota: <span className="font-semibold">{selectedLead.quota || 'Not Applicable'}</span>
                  </label>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">Update Quota</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100" value={newQuota} onChange={(e) => setNewQuota(e.target.value)}>
                    {quotaOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">Comment</label>
                  <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm min-h-[100px] dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment..." />
                </div>
                <div className="flex gap-2 pt-4">
                  <Button variant="primary" onClick={handleSaveActivity} disabled={addActivityMutation.isPending || (!comment.trim() && newStatus === selectedLead.leadStatus && newQuota === (selectedLead.quota || 'Not Applicable'))}>
                    {addActivityMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowCommentModal(false); setShowConfirmModal(false); setSelectedLead(null); setComment(''); setNewStatus(''); setNewQuota('Not Applicable'); }} disabled={addActivityMutation.isPending}>
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {showConfirmModal && selectedLead && (
        <div className={modalOverlayClass}>
          <div className={`w-full max-h-[90vh] overflow-y-auto sm:max-h-none sm:overflow-visible bg-white dark:bg-slate-900 shadow-xl sm:max-w-md ${isSubSuperAdmin ? 'rounded-t-2xl sm:rounded-2xl pt-4 pb-[env(safe-area-inset-bottom)] sm:pb-4' : 'rounded-2xl p-0'}`}>
            {isSubSuperAdmin ? (
              <div className="px-4 sm:px-6 pb-4">
                <div className="mx-auto w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 sm:hidden mb-4" aria-hidden />
                <h2 className="text-xl font-semibold mb-4 text-slate-900 dark:text-slate-100">Confirm Status Change</h2>
                <div className="space-y-4">
                  <p className="text-gray-700 dark:text-slate-200">
                    Are you sure you want to change the status from{' '}
                    <span className="font-semibold">{selectedLead.leadStatus || 'New'}</span> to{' '}
                    <span className="font-semibold">{newStatus}</span>?
                  </p>
                  {newQuota !== (selectedLead.quota || 'Not Applicable') && (
                    <p className="text-gray-700 dark:text-slate-200">
                      Quota will also be updated from{' '}
                      <span className="font-semibold">{selectedLead.quota || 'Not Applicable'}</span> to{' '}
                      <span className="font-semibold">{newQuota}</span>.
                    </p>
                  )}
                  <div className="flex gap-3 pt-4">
                    <Button variant="primary" onClick={handleConfirmStatusChange} disabled={addActivityMutation.isPending} className="min-h-[44px] flex-1 sm:flex-initial">
                      {addActivityMutation.isPending ? 'Saving...' : 'Confirm'}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowConfirmModal(false); setNewStatus(selectedLead.leadStatus || ''); setNewQuota(selectedLead.quota || 'Not Applicable'); }} disabled={addActivityMutation.isPending} className="min-h-[44px] flex-1 sm:flex-initial">
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <Card className="max-w-md w-full border-0 shadow-none">
                <h2 className="text-xl font-semibold mb-4">Confirm Status Change</h2>
                <div className="space-y-4">
                  <p className="text-gray-700 dark:text-slate-200">
                    Are you sure you want to change the status from{' '}
                    <span className="font-semibold">{selectedLead.leadStatus || 'New'}</span> to{' '}
                    <span className="font-semibold">{newStatus}</span>?
                  </p>
                  {newQuota !== (selectedLead.quota || 'Not Applicable') && (
                    <p className="text-gray-700 dark:text-slate-200">
                      Quota will also be updated from{' '}
                      <span className="font-semibold">{selectedLead.quota || 'Not Applicable'}</span> to{' '}
                      <span className="font-semibold">{newQuota}</span>.
                    </p>
                  )}
                  <div className="flex gap-2 pt-4">
                    <Button variant="primary" onClick={handleConfirmStatusChange} disabled={addActivityMutation.isPending}>
                      {addActivityMutation.isPending ? 'Saving...' : 'Confirm'}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowConfirmModal(false); setNewStatus(selectedLead.leadStatus || ''); setNewQuota(selectedLead.quota || 'Not Applicable'); }} disabled={addActivityMutation.isPending}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {showAssignModal && (
        <div className={modalOverlayClass}>
          <div className="w-full max-h-[90vh] overflow-y-auto sm:max-h-none sm:overflow-visible rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-xl sm:max-w-md pt-4 pb-[env(safe-area-inset-bottom)] sm:pb-4">
            <div className="px-4 sm:px-6 pb-4">
              <div className="mx-auto w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 sm:hidden mb-4" aria-hidden />
              <h2 className="text-xl font-semibold mb-4 text-blue-600 dark:text-blue-400">Assign Selected Leads</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-slate-200">
                Assign <span className="font-semibold">{selectedLeads.size}</span> selected lead(s) to a user or sub-admin.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">
                  Select User or Sub Admin *
                </label>
                <select
                  className="w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                  value={assignSelectedUserId}
                  onChange={(e) => setAssignSelectedUserId(e.target.value)}
                >
                  <option value="">Choose a user or sub-admin…</option>
                  {Object.entries({
                    'Sub Super Admin': assignableUsers.filter((u) => u.roleName === 'Sub Super Admin'),
                    'Student Counselor': assignableUsers.filter((u) => u.roleName === 'Student Counselor'),
                    'Data Entry User': assignableUsers.filter((u) => u.roleName === 'Data Entry User'),
                    'PRO': assignableUsers.filter((u) => u.roleName === 'PRO'),
                  }).map(([role, roleUsers]) => (
                    roleUsers.length > 0 && (
                      <optgroup key={role} label={role}>
                        {roleUsers.map((user) => (
                          <option key={user._id} value={user._id}>
                            {user.name} ({user.email}) - {role === 'Sub Super Admin' ? 'Sub Admin' : role}
                          </option>
                        ))}
                      </optgroup>
                    )
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="primary"
                  onClick={handleConfirmAssign}
                  disabled={bulkAssignMutation.isPending || !assignSelectedUserId}
                  className="min-h-[44px] flex-1 sm:flex-initial"
                >
                  {bulkAssignMutation.isPending ? 'Assigning…' : 'Assign Leads'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!bulkAssignMutation.isPending) {
                      setShowAssignModal(false);
                      setAssignSelectedUserId('');
                    }
                  }}
                  disabled={bulkAssignMutation.isPending}
                  className="min-h-[44px] flex-1 sm:flex-initial"
                >
                  Cancel
                </Button>
              </div>
            </div>
            </div>
          </div>
        </div>
      )}

      {showBulkDeleteModal && (
        <div className={modalOverlayClass}>
          <div className="w-full max-h-[90vh] overflow-y-auto sm:max-h-none sm:overflow-visible rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-xl sm:max-w-md pt-4 pb-[env(safe-area-inset-bottom)] sm:pb-4">
            <div className="px-4 sm:px-6 pb-4">
              <div className="mx-auto w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 sm:hidden mb-4" aria-hidden />
              <h2 className="text-xl font-semibold mb-4 text-red-600 dark:text-red-400">Delete Selected Leads</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-slate-200">
                Are you sure you want to delete <span className="font-semibold">{selectedLeads.size}</span> lead(s)? This action cannot be undone.
              </p>
              <p className="text-sm text-red-600 dark:text-rose-300 font-medium">
                ⚠️ This will also delete all activity logs associated with these leads.
              </p>
              <div className="flex gap-3 pt-4">
                <Button
                  variant="primary"
                  onClick={handleConfirmBulkDelete}
                  disabled={bulkDeleteMutation.isPending || (deleteJobStatus?.status === 'processing' || deleteJobStatus?.status === 'queued')}
                  className="min-h-[44px] flex-1 sm:flex-initial bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700"
                >
                  {(bulkDeleteMutation.isPending || deleteJobStatus?.status === 'processing' || deleteJobStatus?.status === 'queued')
                    ? `Deleting… ${Math.min(100, Math.max(5, Math.round(bulkDeleteProgress)))}%`
                    : 'Delete Leads'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!bulkDeleteMutation.isPending && deleteJobStatus?.status !== 'processing' && deleteJobStatus?.status !== 'queued') {
                      setShowBulkDeleteModal(false);
                      setBulkDeleteProgress(0);
                      setDeleteJobId(null);
                      setDeleteJobStatus(null);
                    }
                  }}
                  disabled={bulkDeleteMutation.isPending || (deleteJobStatus?.status === 'processing' || deleteJobStatus?.status === 'queued')}
                  className="min-h-[44px] flex-1 sm:flex-initial"
                >
                  Cancel
                </Button>
              </div>
              {(bulkDeleteProgress > 0 || deleteJobStatus) && (
                <div className="pt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400 mb-1">
                    <span>
                      {deleteJobStatus?.status === 'processing'
                        ? `Deleting leads… (${deleteJobStatus.stats?.deletedLeadCount || 0}/${deleteJobStatus.stats?.validCount || 0})`
                        : deleteJobStatus?.status === 'queued'
                          ? 'Job queued, starting soon…'
                          : deleteJobStatus?.status === 'completed'
                            ? 'Deletion completed!'
                            : deleteJobStatus?.status === 'failed'
                              ? 'Deletion failed'
                              : bulkDeleteMutation.isPending
                                ? 'Deleting leads…'
                                : 'Finalizing deletions…'}
                    </span>
                    <span>{Math.min(100, Math.max(1, Math.round(bulkDeleteProgress)))}%</span>
                  </div>
                  <div className="h-2 w-full bg-gray-200/80 dark:bg-slate-700/80 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${deleteJobStatus?.status === 'failed'
                        ? 'bg-gradient-to-r from-red-600 to-red-500'
                        : 'bg-gradient-to-r from-red-500 via-orange-500 to-amber-500'
                        }`}
                      style={{ width: `${Math.min(100, Math.round(bulkDeleteProgress))}%` }}
                    />
                  </div>
                  {deleteJobStatus?.message && (
                    <p className="text-xs mt-2 text-gray-600 dark:text-slate-300">
                      {deleteJobStatus.message}
                    </p>
                  )}
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


