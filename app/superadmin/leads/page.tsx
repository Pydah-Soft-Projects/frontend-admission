'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { leadAPI } from '@/lib/api';
import { Lead, LeadFilters, FilterOptions } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { showToast } from '@/lib/toast';
import { Skeleton, TableSkeleton, CardSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { exportToExcel, exportToCSV } from '@/lib/export';
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

export default function LeadsPage() {
  const router = useRouter();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const [user, setUser] = useState(auth.getUser());
  const pageSizeOptions = [50, 100, 200, 300];
  const defaultPageSize = 50;
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(() => {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem('leadTablePageSize');
      const parsed = stored ? parseInt(stored, 10) : defaultPageSize;
      if (!Number.isNaN(parsed) && pageSizeOptions.includes(parsed)) {
        return parsed;
      }
    }
    return defaultPageSize;
  });
  const [search, setSearch] = useState('');
  const [enquiryNumber, setEnquiryNumber] = useState('');
  const [filters, setFilters] = useState<LeadFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [comment, setComment] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [newQuota, setNewQuota] = useState('Not Applicable');
  const quotaOptions = ['Not Applicable', 'Management', 'Convenor'];
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set<string>());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [sortField, setSortField] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [searchSuggestions, setSearchSuggestions] = useState<Lead[]>([]);
  const [enquirySuggestions, setEnquirySuggestions] = useState<Lead[]>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const [showEnquirySuggestions, setShowEnquirySuggestions] = useState(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState(0);
  const bulkDeleteProgressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bulkDeleteProgressResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();

  // Debounce search inputs
  const debouncedSearch = useDebounce(search, 500);
  const debouncedEnquiryNumber = useDebounce(enquiryNumber, 500);
  
  // Track previous search values to detect actual changes
  const prevSearchRef = useRef<string>('');
  const prevEnquiryRef = useRef<string>('');

  // Reset to page 1 when search or enquiry number changes
  useEffect(() => {
    // Only reset if search or enquiry number actually changed (not just on initial mount)
    const searchChanged = debouncedSearch !== prevSearchRef.current;
    const enquiryChanged = debouncedEnquiryNumber !== prevEnquiryRef.current;
    
    if (searchChanged || enquiryChanged) {
      setPage(1);
      prevSearchRef.current = debouncedSearch;
      prevEnquiryRef.current = debouncedEnquiryNumber;
    }
  }, [debouncedSearch, debouncedEnquiryNumber]);

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
    setPage(1);
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

  // Load filter options
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

  // Search suggestions for general search
  useEffect(() => {
    let active = true;

    const fetchSuggestions = async () => {
      try {
        const response = await leadAPI.getAll({
          ...filters,
          search: debouncedSearch,
          page: 1,
          limit: 5,
        });
        if (!active) return;
        const results = response.data?.leads || response.leads || [];
        setSearchSuggestions(results);
      } catch (error) {
        if (!active) return;
        setSearchSuggestions([]);
      }
    };

    if (debouncedSearch && debouncedSearch.length >= 2) {
      fetchSuggestions();
    } else {
      setSearchSuggestions([]);
    }

    return () => {
      active = false;
    };
  }, [debouncedSearch, filters]);

  // Suggestions for enquiry number search
  useEffect(() => {
    let active = true;

    const fetchSuggestions = async () => {
      try {
        const response = await leadAPI.getAll({
          ...filters,
          enquiryNumber: debouncedEnquiryNumber,
          page: 1,
          limit: 5,
        });
        if (!active) return;
        const results = response.data?.leads || response.leads || [];
        setEnquirySuggestions(results);
      } catch (error) {
        if (!active) return;
        setEnquirySuggestions([]);
      }
    };

    if (debouncedEnquiryNumber && debouncedEnquiryNumber.length >= 2) {
      fetchSuggestions();
    } else {
      setEnquirySuggestions([]);
    }

    return () => {
      active = false;
    };
  }, [debouncedEnquiryNumber, filters]);

  // Build query filters
  const queryFilters = useMemo(() => {
    const query: LeadFilters = {
      page,
      limit,
      ...filters,
    };
    if (debouncedSearch) {
      query.search = debouncedSearch;
    }
    if (debouncedEnquiryNumber) {
      query.enquiryNumber = debouncedEnquiryNumber;
    }
    return query;
  }, [page, limit, filters, debouncedSearch, debouncedEnquiryNumber]);

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

  const headerNode = useMemo(
    () => (
      <div className="flex flex-col items-end gap-2 text-right">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Leads Management</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Monitor enquiries, qualify prospects, and trigger communications from a single, streamlined workspace.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => exportToExcel(leads, `leads-${new Date().toISOString().split('T')[0]}`)}
            disabled={!leads.length}
          >
            Export Excel
          </Button>
          <Button
            variant="outline"
            onClick={() => exportToCSV(leads, `leads-${new Date().toISOString().split('T')[0]}`)}
            disabled={!leads.length}
          >
            Export CSV
          </Button>
        </div>
      </div>
    ),
    [leads]
  );

  useEffect(() => {
    setHeaderContent(headerNode);
    return () => clearHeaderContent();
  }, [headerNode, setHeaderContent, clearHeaderContent]);

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
      const aValue = (a as Record<string, any>)[sortField];
      const bValue = (b as Record<string, any>)[sortField];

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
      } else {
        delete newFilters[key];
      }
      setPage(1); // Reset to first page on filter change
      return newFilters;
    });
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters({});
    setSearch('');
    setEnquiryNumber('');
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

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      return await leadAPI.bulkDelete(leadIds);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setSelectedLeads(new Set<string>());
      setShowBulkDeleteModal(false);
      setPage(1); // Reset to first page
      const deletedCount = Array.isArray(variables) ? variables.length : 0;
      showToast.success(`Successfully deleted ${deletedCount} lead(s)`);
    },
    onError: (error: any) => {
      console.error('Error bulk deleting leads:', error);
      showToast.error(error.response?.data?.message || 'Failed to delete leads');
    },
  });

  useEffect(() => {
    if (bulkDeleteMutation.isPending) {
      clearBulkDeleteProgressResetTimeout();
      setBulkDeleteProgress((prev) => (prev > 5 ? prev : 5));
      clearBulkDeleteProgressInterval();
      bulkDeleteProgressIntervalRef.current = setInterval(() => {
        setBulkDeleteProgress((prev) => {
          if (prev >= 92) {
            return prev;
          }
          const increment = Math.random() * 6 + 3;
          return Math.min(prev + increment, 92);
        });
      }, 500);
    } else {
      clearBulkDeleteProgressInterval();
      setBulkDeleteProgress((prev) => {
        if (prev === 0) return 0;
        if (prev < 100) return 100;
        return prev;
      });
      clearBulkDeleteProgressResetTimeout();
      bulkDeleteProgressResetTimeoutRef.current = setTimeout(() => {
        setBulkDeleteProgress(0);
      }, 800);
    }

    return () => {
      clearBulkDeleteProgressInterval();
    };
  }, [bulkDeleteMutation.isPending]);

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
      if (debouncedSearch) {
        filtersForIds.search = debouncedSearch;
      }
      if (debouncedEnquiryNumber) {
        filtersForIds.enquiryNumber = debouncedEnquiryNumber;
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

  // Prevent hydration mismatch by not rendering until mounted
  if (!isMounted || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-full max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <CardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <Card className="mb-6 space-y-4">
          {/* Search and Filters Bar */}
          <div className="space-y-4">
              {/* Search Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                    Search by Enquiry Number
                  </label>
                  <Input
                    type="text"
                    placeholder="ENQ24000001 or 24000001 or 000001"
                    value={enquiryNumber}
                    onChange={(e) => setEnquiryNumber(e.target.value)}
                    onFocus={() => setShowEnquirySuggestions(true)}
                    onBlur={() => setTimeout(() => setShowEnquirySuggestions(false), 150)}
                    className="w-full"
                  />
                  {showEnquirySuggestions && enquirySuggestions.length > 0 && (
                    <div className="absolute z-20 mt-2 w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
                      {enquirySuggestions.map((suggestion) => (
                        <button
                          key={`enquiry-suggestion-${suggestion._id}`}
                          type="button"
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800/60 flex justify-between gap-3"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            if (suggestion.enquiryNumber) {
                              setEnquiryNumber(suggestion.enquiryNumber);
                              setPage(1);
                            }
                            setShowEnquirySuggestions(false);
                          }}
                        >
                          <span className="font-medium">{suggestion.enquiryNumber || '—'}</span>
                          <span className="text-xs text-gray-500 dark:text-slate-400">{suggestion.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                    Search by Name/Phone/Email
                  </label>
                  <Input
                    type="text"
                    placeholder="Search leads..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => setShowSearchSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 150)}
                    className="w-full"
                  />
                  {showSearchSuggestions && searchSuggestions.length > 0 && (
                    <div className="absolute z-20 mt-2 w-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg overflow-hidden">
                      {searchSuggestions.map((suggestion) => (
                        <button
                          key={`search-suggestion-${suggestion._id}`}
                          type="button"
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-800/60 flex flex-col gap-1"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const value = suggestion.name || suggestion.phone || suggestion.email || '';
                            if (value) {
                              setSearch(value);
                              setPage(1);
                            }
                            setShowSearchSuggestions(false);
                          }}
                        >
                          <span className="font-medium">{suggestion.name || suggestion.phone || 'Untitled Lead'}</span>
                          <span className="text-xs text-gray-500 dark:text-slate-400 flex gap-2">
                            {suggestion.phone && <span>{suggestion.phone}</span>}
                            {suggestion.email && <span>{suggestion.email}</span>}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowFilters(!showFilters)}
                    className="w-full"
                  >
                    {showFilters ? 'Hide' : 'Show'} Filters
                  </Button>
                  {(Object.keys(filters).length > 0 || search || enquiryNumber) && (
                    <Button
                      variant="outline"
                      onClick={clearFilters}
                      className="w-full"
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {/* Filter Row */}
              {showFilters && (
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 pt-4 border-t border-gray-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                      Mandal
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                      value={filters.mandal || ''}
                      onChange={(e) => handleFilterChange('mandal', e.target.value)}
                    >
                      <option value="">All Mandals</option>
                      {filterOptions?.mandals?.map((mandal) => (
                        <option key={mandal} value={mandal}>
                          {mandal}
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
                    >
                      <option value="">All Districts</option>
                      {filterOptions?.districts?.map((district) => (
                        <option key={district} value={district}>
                          {district}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                      State
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                      value={filters.state || ''}
                      onChange={(e) => handleFilterChange('state', e.target.value)}
                    >
                      <option value="">All States</option>
                      {filterOptions?.states?.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                      Quota
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                      value={filters.quota || ''}
                      onChange={(e) => handleFilterChange('quota', e.target.value)}
                    >
                      <option value="">All Quotas</option>
                      {filterOptions?.quotas?.map((quota) => (
                        <option key={quota} value={quota}>
                          {quota}
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
                      Application Status
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                      value={filters.applicationStatus || ''}
                      onChange={(e) => handleFilterChange('applicationStatus', e.target.value)}
                    >
                      <option value="">All Application Statuses</option>
                      {filterOptions?.applicationStatuses?.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <section className="space-y-6">
            {/* Results Summary */}
            <div className="mb-4 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <p className="text-sm text-gray-600 dark:text-slate-300">
                  Showing {leads.length} of {pagination.total} leads
                  {pagination.total > 0 && (
                    <span className="ml-2">
                      (Page {pagination.page} of {pagination.pages})
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2">
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
                      <span className="text-sm text-gray-700 font-medium">
                        {selectedLeads.size} selected
                      </span>
                      <Button
                        variant="outline"
                        onClick={handleBulkDelete}
                        className="bg-red-50 hover:bg-red-100 text-red-600 border-red-300 hover:border-red-400"
                        size="sm"
                      >
                        Delete Selected
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  Loading...
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
              <Card>
                <div className="p-6">
                  <TableSkeleton rows={5} cols={18} />
                </div>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 md:hidden">
                  {displayedLeads.map((lead: Lead) => (
                    <Card
                      key={`mobile-${lead._id}`}
                      className="p-4 bg-white/80 dark:bg-slate-900/60"
                      onClick={() => router.push(`/superadmin/leads/${lead._id}`)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-slate-400">Enquiry #</p>
                          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                            {lead.enquiryNumber || '—'}
                          </p>
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
                        {lead.hallTicketNumber && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-slate-400">Hall Ticket</span>
                            <span className="font-medium text-gray-900 dark:text-slate-100">{lead.hallTicketNumber}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Name</span>
                          <span className="font-medium text-gray-900 dark:text-slate-100">{lead.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Phone</span>
                          <span className="font-medium text-blue-600 dark:text-blue-300">{lead.phone}</span>
                        </div>
                        {lead.email && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-slate-400">Email</span>
                            <span className="text-gray-700 dark:text-slate-200 truncate max-w-[55%] text-right">{lead.email}</span>
                          </div>
                        )}
                        {lead.fatherPhone && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-slate-400">Father Phone</span>
                            <span className="text-gray-700 dark:text-slate-200">{lead.fatherPhone}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Mandal</span>
                          <span className="text-gray-700 dark:text-slate-200">{lead.mandal}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Village</span>
                          <span className="text-gray-700 dark:text-slate-200">{lead.village}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">District</span>
                          <span className="text-gray-700 dark:text-slate-200">{lead.district}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">State</span>
                          <span className="text-gray-700 dark:text-slate-200">{lead.state}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Gender</span>
                          <span className="text-gray-700 dark:text-slate-200">{lead.gender || '—'}</span>
                        </div>
                        {lead.interCollege && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-slate-400">Inter College</span>
                            <span className="text-gray-700 dark:text-slate-200 truncate max-w-[55%] text-right">{lead.interCollege}</span>
                          </div>
                        )}
                        {lead.rank !== undefined && lead.rank !== null && (
                          <div className="flex justify-between">
                            <span className="text-gray-500 dark:text-slate-400">Rank</span>
                            <span className="text-gray-700 dark:text-slate-200">{lead.rank}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Application Status</span>
                          <span className="text-gray-700 dark:text-slate-200">{lead.applicationStatus || 'Not Provided'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500 dark:text-slate-400">Quota</span>
                          <span className="text-gray-700 dark:text-slate-200">{lead.quota}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className="text-gray-500 dark:text-slate-400">Lead Status</span>
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
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/superadmin/leads/${lead._id}`);
                          }}
                        >
                          View Details
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenCommentModal(lead, e as unknown as React.MouseEvent);
                          }}
                        >
                          Comment / Update Status
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>

                <Card className="hidden md:block">
                  <div className="overflow-x-auto w-full">
                    <table className="w-full divide-y divide-gray-200 dark:divide-slate-700">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100/50 dark:from-slate-900/60 dark:to-slate-900/40">
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
                            className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                            onClick={() => handleSort('enquiryNumber')}
                          >
                            <div className="flex items-center gap-1">
                              Enquiry #
                              {sortField === 'enquiryNumber' && (
                                <span className="text-blue-600 dark:text-blue-300">
                                  {sortOrder === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </th>
                          <th 
                            className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60 hidden lg:table-cell"
                            onClick={() => handleSort('hallTicketNumber')}
                          >
                            <div className="flex items-center gap-1">
                              Hall Ticket
                              {sortField === 'hallTicketNumber' && (
                                <span className="text-blue-600 dark:text-blue-300">
                                  {sortOrder === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </th>
                          <th 
                            className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                            onClick={() => handleSort('name')}
                          >
                            <div className="flex items-center gap-1">
                              Name
                              {sortField === 'name' && (
                                <span className="text-blue-600 dark:text-blue-300">
                                  {sortOrder === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </th>
                          <th 
                            className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                            onClick={() => handleSort('phone')}
                          >
                            <div className="flex items-center gap-1">
                              Phone
                              {sortField === 'phone' && (
                                <span className="text-blue-600 dark:text-blue-300">
                                  {sortOrder === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider hidden sm:table-cell dark:text-slate-200">
                            Email
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider hidden md:table-cell dark:text-slate-200">
                            Father Phone
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider dark:text-slate-200">
                            Mandal
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider dark:text-slate-200 hidden xl:table-cell">
                            Village
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider hidden lg:table-cell dark:text-slate-200">
                            District
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider hidden xl:table-cell dark:text-slate-200">
                            Gender
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider hidden 2xl:table-cell dark:text-slate-200">
                            Inter College
                          </th>
                          <th 
                            className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider hidden lg:table-cell cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                            onClick={() => handleSort('rank')}
                          >
                            <div className="flex items-center gap-1">
                              Rank
                              {sortField === 'rank' && (
                                <span className="text-blue-600 dark:text-blue-300">
                                  {sortOrder === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider hidden 2xl:table-cell dark:text-slate-200">
                            Quota
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider hidden xl:table-cell dark:text-slate-200">
                            Application Status
                          </th>
                          <th 
                            className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800/60"
                            onClick={() => handleSort('leadStatus')}
                          >
                            <div className="flex items-center gap-1">
                              Lead Status
                              {sortField === 'leadStatus' && (
                                <span className="text-blue-600 dark:text-blue-300">
                                  {sortOrder === 'asc' ? '↑' : '↓'}
                                </span>
                              )}
                            </div>
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider hidden md:table-cell dark:text-slate-200">
                            Created
                          </th>
                          <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 uppercase tracking-wider dark:text-slate-200">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white/50 dark:bg-slate-900/30 divide-y divide-gray-200 dark:divide-slate-700">
                        {displayedLeads.map((lead: Lead) => (
                          <tr
                            key={lead._id}
                            className="hover:bg-blue-50/50 dark:hover:bg-slate-800/60 transition-colors duration-200 cursor-pointer"
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
                            <td className="px-2 py-2 whitespace-nowrap text-xs font-mono font-medium text-blue-600 dark:text-blue-300">
                              {lead.enquiryNumber || '-'}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 hidden lg:table-cell">
                              {lead.hallTicketNumber || '—'}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs font-medium text-gray-900 dark:text-slate-100">
                              {lead.name}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300">
                              {lead.phone}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 hidden sm:table-cell">
                              {lead.email || '-'}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 hidden md:table-cell">
                              {lead.fatherPhone || '—'}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300">
                              {lead.mandal}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 hidden xl:table-cell">
                              {lead.village}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 hidden lg:table-cell">
                              {lead.district}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 hidden xl:table-cell">
                              {lead.gender || '—'}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 hidden 2xl:table-cell">
                              {lead.interCollege || '—'}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 hidden lg:table-cell">
                              {lead.rank ?? '—'}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 hidden 2xl:table-cell">
                              {lead.quota}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 hidden xl:table-cell">
                              {lead.applicationStatus || 'Not Provided'}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenCommentModal(lead, e);
                                }}
                                className={`px-2 py-0.5 inline-flex text-[10px] leading-4 font-semibold rounded-full transition-all cursor-pointer hover:opacity-80 ${getStatusColor(
                                  lead.leadStatus
                                )}`}
                                title="Click to update status"
                              >
                                {lead.leadStatus || 'New'}
                              </span>
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs text-gray-600 dark:text-slate-300 hidden md:table-cell">
                              {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '-'}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap text-xs">
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenCommentModal(lead, e);
                                  }}
                                  className="text-[10px]"
                                >
                                  Comment
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/superadmin/leads/${lead._id}`);
                                  }}
                                  className="text-[10px]"
                                >
                                  View
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}

            {/* Pagination - Moved to bottom beside page selection */}
            {pagination.pages > 1 && (
              <div className="mt-6 pt-4 border-t border-gray-200 flex justify-between items-center gap-4">
                <div className="flex items-center gap-2">
                  {/* First Page Button (Icon Only) */}
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
                  
                  {/* Previous Page Button (Icon Only) */}
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || isLoading}
                    size="sm"
                    className="p-2"
                    title="Previous Page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </Button>

                  {/* Page Numbers */}
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
                          className="min-w-[40px]"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>

                  {/* Next Page Button (Icon Only) */}
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                    disabled={page === pagination.pages || isLoading}
                    size="sm"
                    className="p-2"
                    title="Next Page"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Button>

                  {/* Last Page Button (Icon Only) */}
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
                </div>

                {/* Jump to Page Dropdown (only if pages > 50) */}
                {pagination.pages > 50 && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 dark:text-slate-300">Jump to:</label>
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
                      {/* Add current page if not in the list */}
                      {!Array.from({ length: Math.ceil(pagination.pages / 50) }, (_, i) => (i + 1) * 50).includes(page) && (
                        <option value={page}>Page {page} (Current)</option>
                      )}
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 dark:text-slate-300">Rows per page:</label>
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

                {/* Page Info */}
                <div className="text-sm text-gray-600 dark:text-slate-300">
                  Page {pagination.page} of {pagination.pages}
                </div>
              </div>
            )}
          </section>

      {showCommentModal && selectedLead && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4">Add Comment / Update Status / Quota</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Current Status: <span className="font-semibold">{selectedLead.leadStatus || 'New'}</span>
                </label>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Update Status
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
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
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Current Quota: <span className="font-semibold">{selectedLead.quota || 'Not Applicable'}</span>
                </label>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Update Quota
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
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
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-200 mb-1">
                  Comment
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm min-h-[100px] dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment..."
                />
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  variant="primary"
                  onClick={handleSaveActivity}
                  disabled={
                    addActivityMutation.isPending ||
                    (!comment.trim() &&
                      newStatus === selectedLead.leadStatus &&
                      newQuota === (selectedLead.quota || 'Not Applicable'))
                  }
                >
                  {addActivityMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowCommentModal(false);
                    setShowConfirmModal(false);
                    setSelectedLead(null);
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

      {showConfirmModal && selectedLead && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
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
                    setNewStatus(selectedLead.leadStatus || '');
                    setNewQuota(selectedLead.quota || 'Not Applicable');
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

      {showBulkDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Selected Leads</h2>
            <div className="space-y-4">
              <p className="text-gray-700 dark:text-slate-200">
                Are you sure you want to delete <span className="font-semibold">{selectedLeads.size}</span> lead(s)? This action cannot be undone.
              </p>
              <p className="text-sm text-red-600 dark:text-rose-300 font-medium">
                ⚠️ This will also delete all activity logs associated with these leads.
              </p>
              <div className="flex gap-2 pt-4">
                <Button
                  variant="primary"
                  onClick={handleConfirmBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white border-red-600 hover:border-red-700"
                >
                  {bulkDeleteMutation.isPending
                    ? `Deleting… ${Math.min(100, Math.max(5, Math.round(bulkDeleteProgress)))}%`
                    : 'Delete Leads'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowBulkDeleteModal(false);
                    setBulkDeleteProgress(0);
                  }}
                  disabled={bulkDeleteMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
              {bulkDeleteProgress > 0 && (
                <div className="pt-3">
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-slate-400 mb-1">
                    <span>
                      {bulkDeleteMutation.isPending ? 'Deleting leads…' : 'Finalizing deletions…'}
                    </span>
                    <span>{Math.min(100, Math.max(1, Math.round(bulkDeleteProgress)))}%</span>
                  </div>
                  <div className="h-2 w-full bg-gray-200/80 dark:bg-slate-700/80 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-red-500 via-orange-500 to-amber-500 transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.round(bulkDeleteProgress))}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

