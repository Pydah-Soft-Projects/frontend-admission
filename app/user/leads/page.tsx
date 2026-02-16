'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { leadAPI } from '@/lib/api';
import { Lead, LeadFilters, FilterOptions } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { showToast } from '@/lib/toast';
import { LeadCardSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
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

export default function UserLeadsPage() {
  const router = useRouter();
  const [user, setUser] = useState(auth.getUser());
  const [page, setPage] = useState(1);
  const [limit] = useState(100);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<LeadFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [comment, setComment] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'assigned' | 'touched'>('assigned');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [isMounted, setIsMounted] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<Lead[]>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const queryClient = useQueryClient();
  const { setHeaderContent, clearHeaderContent, setMobileTopBar, clearMobileTopBar } = useDashboardHeader();
  const handleGoToDashboard = useCallback(() => {
    router.push('/user/dashboard');
  }, [router]);

  useEffect(() => {
    setIsMounted(true);
    // Restore view mode preference
    const savedView = localStorage.getItem('leadsViewMode');
    if (savedView === 'card' || savedView === 'table') {
      setViewMode(savedView as 'card' | 'table');
    }
  }, []);

  useEffect(() => {
    setHeaderContent(
      <div className="flex flex-col items-end gap-2 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">My Leads</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Manage and nurture your assigned pipeline
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleGoToDashboard}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    );

    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent, handleGoToDashboard]);

  useEffect(() => {
    setMobileTopBar({ title: 'My Leads', iconKey: 'leads' });
    return () => clearMobileTopBar();
  }, [setMobileTopBar, clearMobileTopBar]);

  // Debounce search input
  const debouncedSearch = useDebounce(search, 500);
  const prevSearchRef = useRef<string>('');

  // Reset to page 1 when search changes
  useEffect(() => {
    if (debouncedSearch !== prevSearchRef.current) {
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
    if (currentUser.roleName === 'Super Admin') {
      router.push('/superadmin/dashboard');
      return;
    }
    setUser(currentUser);
  }, [router]);

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

  // Single search suggestions (name, phone, email, enquiry number)
  useEffect(() => {
    let active = true;
    const fetchSuggestions = async () => {
      try {
        const response = await leadAPI.getAll({
          ...filters,
          search: debouncedSearch,
          page: 1,
          limit: 8,
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
    return () => { active = false; };
  }, [debouncedSearch, filters]);

  // Build query filters (single search for name, phone, email, enquiry number)
  // Use only 'search' - backend search covers all fields. Sending both search + enquiryNumber
  // causes AND logic and breaks name/phone/email searches (enquiry_number rarely matches).
  const queryFilters = useMemo(() => {
    const query: LeadFilters = {
      page,
      limit,
      ...filters,
    };
    if (debouncedSearch) {
      query.search = debouncedSearch;
    }
    if (activeTab === 'touched') {
      query.touchedToday = true;
    }
    return query;
  }, [page, limit, filters, debouncedSearch, activeTab]);

  // Combined Status Options (Lead Status + Call Outcomes)
  const combinedStatusOptions = useMemo(() => {
    const backendStatuses = filterOptions?.statuses || [];
    const callOutcomes = [
      'Answered', 'No Answer', 'Interested', 'Not Interested',
      'Confirmed', 'CET Applied'
    ];
    const defaultStatuses = [
      'New'
    ];

    const uniqueStatuses = new Set([
      ...backendStatuses,
      ...callOutcomes,
      ...defaultStatuses
    ]);

    return Array.from(uniqueStatuses).sort();
  }, [filterOptions]);

  // Fetch leads with React Query
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
      return response.data || response;
    },
    enabled: !!user,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const leads = leadsData?.leads || [];
  const pagination = leadsData?.pagination || { page: 1, limit: 100, total: 0, pages: 1 };
  const needsUpdateCount = leadsData?.needsUpdateCount ?? 0;

  // Reset page when tab changes
  useEffect(() => {
    setPage(1);
  }, [activeTab]);

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
  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'interested':
        return 'bg-green-100 text-green-800 dark:bg-emerald-900/60 dark:text-emerald-200';
      case 'contacted':
        return 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200';
      case 'qualified':
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200';
      case 'converted':
        return 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200';
      case 'confirmed':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200';
      case 'admitted':
      case 'joined':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200';
      case 'not interested':
        return 'bg-red-100 text-red-800 dark:bg-rose-900/60 dark:text-rose-200';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800 dark:bg-amber-900/60 dark:text-amber-200';
      case 'lost':
        return 'bg-gray-100 text-gray-800 dark:bg-slate-800/60 dark:text-slate-200';
      case 'new':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-slate-800/60 dark:text-slate-200';
    }
  };

  // Open comment modal
  const handleOpenCommentModal = (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedLead(lead);
    setComment('');
    setNewStatus(lead.leadStatus || '');
    setShowCommentModal(true);
  };

  // Handle status change
  const handleStatusChange = (status: string) => {
    setNewStatus(status);
  };

  // Mutation for adding activity
  const addActivityMutation = useMutation({
    mutationFn: async (data: { comment?: string; newStatus?: string }) => {
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

    if (!hasComment && !hasStatusChange) {
      showToast.error('Please add a comment or change the status');
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
      });
    }
  };

  // Confirm status change
  const handleConfirmStatusChange = () => {
    if (!selectedLead) return;
    setShowConfirmModal(false);
    addActivityMutation.mutate({
      comment: comment.trim() ? comment.trim() : undefined,
      newStatus: newStatus && newStatus !== selectedLead.leadStatus ? newStatus : undefined,
    });
  };

  // Prevent hydration mismatch
  if (!isMounted || !user) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-4 px-0 pb-2">
        <div className="space-y-2">
          <div className="flex flex-nowrap items-center gap-2">
            <Skeleton className="flex-1 h-9 min-w-0 rounded border-0" />
            <Skeleton className="h-9 w-20 shrink-0 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <LeadCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-0 sm:px-0 pb-2">
      {/* Search + filters + View Toggle */}
      <div className="space-y-2">
        <div className="flex flex-nowrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              type="text"
              placeholder="Name, phone, email or enquiry number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setShowSearchSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 150)}
              className="h-9 w-full rounded border border-slate-200 bg-white py-1.5 px-2.5 text-sm focus:ring-1 focus:ring-orange-500"
            />
            {showSearchSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
                {searchSuggestions.map((suggestion) => (
                  <button
                    key={`user-search-suggestion-${suggestion._id}`}
                    type="button"
                    className="flex w-full flex-col gap-1 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const value = suggestion.enquiryNumber || suggestion.name || suggestion.phone || suggestion.email || '';
                      if (value) {
                        setSearch(value);
                        setPage(1);
                      }
                      setShowSearchSuggestions(false);
                    }}
                  >
                    <span className="font-medium">{suggestion.name || suggestion.phone || 'Untitled Lead'}</span>
                    <span className="flex gap-2 text-xs text-gray-500 dark:text-slate-400">
                      {suggestion.enquiryNumber && <span>#{suggestion.enquiryNumber}</span>}
                      {suggestion.phone && <span>{suggestion.phone}</span>}
                      {suggestion.email && <span>{suggestion.email}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View Toggle */}
          <div className="hidden sm:flex items-center rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => {
                setViewMode('card');
                localStorage.setItem('leadsViewMode', 'card');
              }}
              className={`rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 ${viewMode === 'card' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400'}`}
              title="Card View"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1"></div>
            <button
              type="button"
              onClick={() => {
                setViewMode('table');
                localStorage.setItem('leadsViewMode', 'table');
              }}
              className={`rounded p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 ${viewMode === 'table' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' : 'text-slate-500 dark:text-slate-400'}`}
              title="Table View"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center gap-1 rounded border border-slate-200 bg-transparent px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
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
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-2 md:grid-cols-5">
            <div className="flex items-center gap-1.5 min-w-0">
              <label className="text-[10px] font-medium text-slate-500 shrink-0">Mandal</label>
              <select
                className="flex-1 min-w-0 rounded border border-slate-200 bg-white py-1 px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                value={filters.mandal || ''}
                onChange={(e) => handleFilterChange('mandal', e.target.value)}
              >
                <option value="">All</option>
                {filterOptions?.mandals?.map((mandal) => (
                  <option key={mandal} value={mandal}>{mandal}</option>
                ))}
              </select>
            </div>
            <div className="hidden md:flex items-center gap-1.5 min-w-0">
              <label className="text-[10px] font-medium text-slate-500 shrink-0">State</label>
              <select
                className="flex-1 min-w-0 rounded border border-slate-200 bg-white py-1 px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                value={filters.state || ''}
                onChange={(e) => handleFilterChange('state', e.target.value)}
              >
                <option value="">All</option>
                {filterOptions?.states?.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </div>
            <div className="hidden md:flex items-center gap-1.5 min-w-0">
              <label className="text-[10px] font-medium text-slate-500 shrink-0">Quota</label>
              <select
                className="flex-1 min-w-0 rounded border border-slate-200 bg-white py-1 px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                value={filters.quota || ''}
                onChange={(e) => handleFilterChange('quota', e.target.value)}
              >
                <option value="">All</option>
                {filterOptions?.quotas?.map((quota) => (
                  <option key={quota} value={quota}>{quota}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5 min-w-0">
              <label className="text-[10px] font-medium text-slate-500 shrink-0">Group</label>
              <select
                className="flex-1 min-w-0 rounded border border-slate-200 bg-white py-1 px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                value={filters.studentGroup || ''}
                onChange={(e) => handleFilterChange('studentGroup', e.target.value)}
              >
                <option value="">All</option>
                {filterOptions?.studentGroups?.map((group) => (
                  <option key={group} value={group}>{group}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5 min-w-0 col-span-2 md:col-span-1">
              <label className="text-[10px] font-medium text-slate-500 shrink-0">Status</label>
              <select
                className="flex-1 min-w-0 rounded border border-slate-200 bg-white py-1 px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                value={filters.status || ''}
                onChange={(e) => handleFilterChange('status', e.target.value)}
              >
                <option value="">All</option>
                {combinedStatusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Tabs: Assigned | Touched Today */}
      <div className="flex w-full min-w-0 gap-1 rounded-lg border border-slate-200 bg-slate-50/50 p-1 dark:border-slate-700 dark:bg-slate-800/30 sm:w-fit">
        <button
          type="button"
          onClick={() => setActiveTab('assigned')}
          className={`flex-1 rounded-md px-3 py-2.5 text-xs font-medium transition-colors sm:flex-initial sm:px-4 sm:text-sm ${activeTab === 'assigned'
            ? 'bg-orange-500 text-white shadow-sm hover:bg-orange-600 dark:bg-orange-500 dark:hover:bg-orange-600'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
        >
          Assigned
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('touched')}
          className={`flex-1 rounded-md px-3 py-2.5 text-xs font-medium transition-colors sm:flex-initial sm:px-4 sm:text-sm ${activeTab === 'touched'
            ? 'bg-orange-500 text-white shadow-sm hover:bg-orange-600 dark:bg-orange-500 dark:hover:bg-orange-600'
            : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
        >
          Touched Today
        </button>
      </div>

      {/* Pagination and count at top */}
      <div className="space-y-3 min-w-0">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
          <p className="text-xs text-gray-600 dark:text-slate-300 sm:text-sm">
            Showing {leads.length} of {pagination.total} leads
            {pagination.total > 0 && (
              <span className="ml-2">
                (Page {pagination.page} of {pagination.pages})
              </span>
            )}
            {needsUpdateCount > 0 && (
              <span className="ml-3 inline-flex items-center rounded-md bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200 ring-1 ring-inset ring-amber-600/20">
                {needsUpdateCount} need{needsUpdateCount === 1 ? 's' : ''} update
              </span>
            )}
          </p>
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-orange-500 border-t-transparent"></div>
              Loading...
            </div>
          )}
        </div>
        {pagination.pages > 1 && (
          <div className="flex flex-col gap-3 border-b border-gray-200 pb-3 dark:border-slate-700 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
            <div className="flex min-w-0 flex-nowrap items-center justify-center gap-1.5 overflow-x-auto pb-1 sm:justify-start sm:overflow-visible sm:pb-0 sm:gap-2 [&::-webkit-scrollbar]:h-1">
              <Button
                variant="outline"
                onClick={() => setPage(1)}
                disabled={page === 1 || isLoading}
                size="sm"
                className="min-h-[32px] min-w-[32px] p-0 sm:p-2 sm:min-h-9 sm:min-w-0"
                title="First Page"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </Button>
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
                size="sm"
                className="min-h-[32px] min-w-[32px] p-0 sm:p-2 sm:min-h-9 sm:min-w-0"
                title="Previous Page"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      className="min-h-[32px] min-w-[32px] px-2 sm:min-h-9 sm:min-w-[40px]"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages || isLoading}
                size="sm"
                className="min-h-[44px] min-w-[44px] p-2 sm:min-h-9 sm:min-w-0"
                title="Next Page"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Button>
              <Button
                variant="outline"
                onClick={() => setPage(pagination.pages)}
                disabled={page === pagination.pages || isLoading}
                size="sm"
                className="min-h-[44px] min-w-[44px] p-2 sm:min-h-9 sm:min-w-0"
                title="Last Page"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </Button>
            </div>
            <div className="text-xs text-gray-600 dark:text-slate-300 w-full shrink-0 text-center sm:w-auto sm:text-left sm:text-sm">
              Page {pagination.page} of {pagination.pages}
            </div>
          </div>
        )}
      </div>

      {isError ? (
        <Card>
          <div className="py-8 text-center">
            <p className="mb-4 text-red-600 dark:text-rose-300">
              Error loading leads: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
            <Button onClick={() => refetch()}>Retry</Button>
          </div>
        </Card>
      ) : leads.length === 0 && !isLoading ? (
        <Card>
          <EmptyState
            title={activeTab === 'touched' ? 'No leads touched today' : 'No leads assigned yet'}
            description={activeTab === 'touched'
              ? 'Leads with a comment or status update today will appear here. Add a comment or change status on any lead to track it.'
              : "You don't have any leads assigned to you. Contact your administrator to get started."}
            icon={
              <svg className="h-16 w-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            }
          />
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-2 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <LeadCardSkeleton key={i} />
          ))}
        </div>
      ) : viewMode === 'table' ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <tr>
                  <th className="px-6 py-3 font-medium">Name</th>
                  <th className="px-6 py-3 font-medium">Phone</th>
                  <th className="px-6 py-3 font-medium">Group</th>
                  <th className="px-6 py-3 font-medium">District</th>
                  <th className="px-6 py-3 font-medium">Mandal</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {leads.map((lead: Lead) => (
                  <tr
                    key={`table-lead-${lead._id}`}
                    onClick={() => router.push(`/user/leads/${lead._id}`)}
                    className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <td className="px-6 py-3 font-medium text-slate-900 dark:text-slate-100">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200/60 font-semibold text-xs uppercase">
                          {(lead.name || '?').charAt(0)}
                        </div>
                        <span className="truncate max-w-[150px]">{lead.name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-300">
                      {lead.phone}
                    </td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-300">
                      {lead.studentGroup || '—'}
                    </td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-300">
                      {lead.district || '—'}
                    </td>
                    <td className="px-6 py-3 text-slate-600 dark:text-slate-300">
                      {lead.mandal || '—'}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusColor(lead.leadStatus || '')}`}>
                          {lead.leadStatus || 'New'}
                        </span>
                        {lead.needsManualUpdate && (
                          <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700" title="Details need manual update">
                            Update
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Button
                        size="sm"
                        variant="light"
                        className="h-8 w-8 p-0 border-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenCommentModal(lead, e);
                        }}
                      >
                        <span className="sr-only">Menu</span>
                        <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {leads.map((lead: Lead) => (
              <article
                key={`lead-${lead._id}`}
                onClick={() => router.push(`/user/leads/${lead._id}`)}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm transition-all duration-200 hover:shadow-md hover:border-orange-200/80 cursor-pointer"
              >
                <div className="h-0.5 w-full bg-slate-100 group-hover:bg-orange-100 transition-colors" aria-hidden />
                <div className="relative flex flex-1 flex-col p-3 sm:p-4">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200/60 font-semibold text-sm uppercase">
                      {(lead.name || '?').charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/user/leads/${lead._id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="truncate text-sm font-semibold text-slate-900 underline underline-offset-2 decoration-orange-500 hover:text-orange-600 dark:text-slate-100 dark:decoration-orange-400 dark:hover:text-orange-400"
                      >
                        {lead.name || '—'}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusColor(lead.leadStatus || '')}`}>
                          {lead.leadStatus || 'New'}
                        </span>
                        {lead.needsManualUpdate && (
                          <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-700" title="Details need manual update">
                            Update
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2">
                    <div className="flex items-center gap-1.5 text-xs">
                      <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span className="truncate font-medium text-slate-800">{lead.phone}</span>
                    </div>
                    {(lead.mandal || lead.village) && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-600">
                        <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        <span className="truncate">{[lead.village, lead.mandal].filter(Boolean).join(', ') || '—'}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 hidden gap-1.5 border-t border-slate-100 pt-2 sm:flex">
                    <Button
                      size="sm"
                      variant="outline"
                      className="!min-h-0 h-8 flex-1 !rounded-lg border-slate-200 !text-xs font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenCommentModal(lead, e);
                      }}
                    >
                      Comment
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {showCommentModal && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 sm:bg-black/50">
          <div className="w-full max-h-[90vh] overflow-y-auto sm:max-h-none sm:overflow-visible rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-xl sm:max-w-md pt-4 pb-[env(safe-area-inset-bottom)] sm:pb-4">
            <div className="px-4 sm:px-6 pb-4">
              <div className="mx-auto w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 sm:hidden mb-4" aria-hidden />
              <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Add Comment / Update Status</h2>
              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Current Status: <span className="font-semibold">{selectedLead.leadStatus || 'New'}</span>
                  </label>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Update Status</label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 min-h-[44px]"
                    value={newStatus}
                    onChange={(e) => handleStatusChange(e.target.value)}
                  >
                    <option value="">Keep Current Status</option>
                    {combinedStatusOptions.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Comment</label>
                  <textarea
                    className="min-h-[120px] w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Add a comment..."
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <Button
                    variant="primary"
                    onClick={handleSaveActivity}
                    disabled={
                      addActivityMutation.isPending ||
                      (!comment.trim() && newStatus === selectedLead.leadStatus)
                    }
                    className="min-h-[44px] flex-1 sm:flex-initial"
                  >
                    {addActivityMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCommentModal(false);
                      setShowConfirmModal(false);
                      setComment('');
                      setNewStatus('');
                      setSelectedLead(null);
                    }}
                    disabled={addActivityMutation.isPending}
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

      {showConfirmModal && selectedLead && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
          <div className="w-full max-h-[90vh] overflow-y-auto sm:max-h-none rounded-t-2xl sm:rounded-2xl bg-white dark:bg-slate-900 shadow-xl sm:max-w-md pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6 px-4 sm:px-6">
            <div className="mx-auto w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600 sm:hidden mb-4" aria-hidden />
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Confirm Status Change</h2>
            <p className="text-gray-700 dark:text-slate-200 text-base mb-6">
              Are you sure you want to change the status from{' '}
              <span className="font-semibold">{selectedLead.leadStatus || 'New'}</span> to{' '}
              <span className="font-semibold">{newStatus}</span>?
            </p>
            <div className="flex gap-3">
              <Button
                variant="primary"
                onClick={handleConfirmStatusChange}
                disabled={addActivityMutation.isPending}
                className="min-h-[44px] flex-1"
              >
                {addActivityMutation.isPending ? 'Saving...' : 'Confirm'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowConfirmModal(false);
                  setNewStatus(selectedLead.leadStatus || '');
                }}
                disabled={addActivityMutation.isPending}
                className="min-h-[44px] flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

