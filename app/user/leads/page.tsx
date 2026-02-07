'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { leadAPI } from '@/lib/api';
import { Lead, LeadFilters, FilterOptions } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { showToast } from '@/lib/toast';
import { LeadCardSkeleton } from '@/components/ui/Skeleton';
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
  const [limit] = useState(50);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<LeadFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [comment, setComment] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<Lead[]>([]);
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const queryClient = useQueryClient();
  const { setHeaderContent, clearHeaderContent, setMobileTopBar, clearMobileTopBar } = useDashboardHeader();
  const handleGoToDashboard = useCallback(() => {
    router.push('/user/dashboard');
  }, [router]);

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
          enquiryNumber: debouncedSearch,
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
  const queryFilters = useMemo(() => {
    const query: LeadFilters = {
      page,
      limit,
      ...filters,
    };
    if (debouncedSearch) {
      query.search = debouncedSearch;
      query.enquiryNumber = debouncedSearch;
    }
    return query;
  }, [page, limit, filters, debouncedSearch]);

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
  const pagination = leadsData?.pagination || { page: 1, limit: 50, total: 0, pages: 1 };
  const needsUpdateCount = leadsData?.needsUpdateCount ?? 0;

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
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-orange-500 border-t-transparent"></div>
          <p className="text-gray-600 dark:text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-0 sm:px-0 pb-2">
      <Card className="p-3 sm:p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-slate-200 sm:text-sm">
              <svg className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Search
            </label>
            <div className="flex items-center gap-1.5 shrink-0 sm:gap-2">
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white min-h-[44px] px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:min-h-0 sm:px-3 sm:py-2 sm:text-sm"
              >
                <svg className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {showFilters ? 'Hide filters' : 'Filters'}
              </button>
              {(Object.keys(filters).length > 0 || search) && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="min-h-[44px] px-3 text-xs sm:min-h-0 sm:h-9 sm:px-3 sm:text-sm">
                  Clear
                </Button>
              )}
            </div>
          </div>
          <div className="relative">
            <Input
              type="text"
              placeholder="Name, phone, email or enquiry number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setShowSearchSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSearchSuggestions(false), 150)}
              className="min-h-[44px] w-full text-base sm:min-h-0 sm:h-10 sm:text-sm"
            />
            {showSearchSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                {searchSuggestions.map((suggestion) => (
                  <button
                    key={`user-search-suggestion-${suggestion._id}`}
                    type="button"
                    className="flex w-full flex-col gap-1 px-4 py-2 text-left text-sm text-gray-700 transition hover:bg-blue-50 dark:text-slate-200 dark:hover:bg-slate-800/60"
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

          {showFilters && (
            <div className="grid grid-cols-2 gap-3 border-t border-gray-200 pt-3 dark:border-slate-700 md:grid-cols-5">
              <div>
                <label className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-slate-200 sm:text-sm">
                  <svg className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Mandal
                </label>
                <select
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 sm:px-3 sm:py-2 sm:text-sm"
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
                <label className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-slate-200 sm:text-sm">
                  <svg className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0h.5a2.5 2.5 0 002.5-2.5V8.935M12 12.075V14m0 0v2m0-2a2 2 0 00-2-2h-2a2 2 0 00-2 2v2m4 0h-4" />
                  </svg>
                  State
                </label>
                <select
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 sm:px-3 sm:py-2 sm:text-sm"
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
                <label className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-slate-200 sm:text-sm">
                  <svg className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  Quota
                </label>
                <select
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 sm:px-3 sm:py-2 sm:text-sm"
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
                <label className="mb-0.5 flex items-center gap-1.5 text-xs font-medium text-gray-700 dark:text-slate-200 sm:text-sm">
                  <svg className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400 sm:h-4 sm:w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Status
                </label>
                <select
                  className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 sm:px-3 sm:py-2 sm:text-sm"
                  value={filters.status || ''}
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                >
                  <option value="">All Statuses</option>
                  {filterOptions?.statuses?.map((status) => (
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600 dark:text-slate-300">
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
            title="No leads assigned yet"
            description="You don't have any leads assigned to you. Contact your administrator to get started."
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
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {leads.map((lead: Lead) => (
              <article
                key={`lead-${lead._id}`}
                onClick={() => router.push(`/user/leads/${lead._id}`)}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-200 hover:shadow-md hover:border-orange-200/80 dark:border-slate-700/80 dark:bg-slate-900/80 dark:hover:border-orange-500/40 dark:hover:shadow-lg cursor-pointer"
              >
                {/* Top accent by status (optional subtle bar) */}
                <div className="h-1 w-full bg-slate-100 dark:bg-slate-800 group-hover:bg-orange-100 dark:group-hover:bg-orange-900/30 transition-colors" aria-hidden />
                <div className="relative flex flex-1 flex-col p-4 sm:p-5">
                  {/* Header: avatar + name + status */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 ring-1 ring-slate-200/60 dark:ring-slate-700/60">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">
                        {lead.name}
                      </h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusColor(lead.leadStatus || '')}`}>
                          {lead.leadStatus || 'New'}
                        </span>
                        {lead.needsManualUpdate && (
                          <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/50 dark:text-amber-200" title="Details need manual update">
                            Update
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Meta: phone, location */}
                  <div className="mt-4 space-y-2 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                    <div className="flex items-center gap-2 text-sm">
                      <svg className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <span className="truncate font-medium text-slate-800 dark:text-slate-200">{lead.phone}</span>
                    </div>
                    {(lead.mandal || lead.village) && (
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <svg className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        </svg>
                        <span className="truncate">{[lead.village, lead.mandal].filter(Boolean).join(', ') || '—'}</span>
                      </div>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="mt-4 flex gap-2 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                    <Button
                      size="sm"
                      variant="primary"
                      className="min-h-10 sm:min-h-9 flex-1 rounded-xl text-sm font-medium"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/user/leads/${lead._id}`);
                      }}
                    >
                      View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-10 sm:min-h-9 flex-1 rounded-xl border-slate-200 text-sm font-medium dark:border-slate-600"
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

      {pagination.pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4 border-t border-gray-200 pt-4 pb-2 dark:border-slate-700">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setPage(1)}
              disabled={page === 1 || isLoading}
              size="sm"
              className="min-h-[44px] min-w-[44px] p-2 sm:min-h-9 sm:min-w-0"
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
              className="min-h-[44px] min-w-[44px] p-2 sm:min-h-9 sm:min-w-0"
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
                    className="min-h-[44px] min-w-[44px] sm:min-h-9 sm:min-w-[40px]"
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
          <div className="text-sm text-gray-600 dark:text-slate-300 w-full sm:w-auto text-center sm:text-left">
            Page {pagination.page} of {pagination.pages}
          </div>
        </div>
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
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 min-h-[44px]"
                    value={newStatus}
                    onChange={(e) => handleStatusChange(e.target.value)}
                  >
                    <option value="">Keep Current Status</option>
                    <option value="New">New</option>
                    <option value="Interested">Interested</option>
                    <option value="Not Interested">Not Interested</option>
                    <option value="Partial">Partial</option>
                    <option value="Confirmed">Confirmed</option>
                    <option value="Lost">Lost</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Comment</label>
                  <textarea
                    className="min-h-[120px] w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
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

