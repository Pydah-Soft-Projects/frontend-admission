'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { leadAPI, userAPI } from '@/lib/api';
import { Lead, LeadFilters, FilterOptions, User } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { showToast } from '@/lib/toast';
import { useTheme } from '@/app/providers';
import * as XLSX from 'xlsx';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from 'recharts';

interface UserAnalytics {
  totalLeads: number;
  statusBreakdown: Record<string, number>;
  mandalBreakdown: Array<{ mandal: string; count: number }>;
  stateBreakdown: Array<{ state: string; count: number }>;
  recentActivity: {
    leadsUpdatedLast7Days: number;
  };
}

const summaryCardStyles = [
  'from-blue-500/10 via-blue-500/15 to-transparent text-blue-700 dark:text-blue-200',
  'from-emerald-500/10 via-emerald-500/15 to-transparent text-emerald-700 dark:text-emerald-200',
  'from-violet-500/10 via-violet-500/15 to-transparent text-violet-700 dark:text-violet-200',
  'from-amber-500/10 via-amber-500/15 to-transparent text-amber-700 dark:text-amber-200',
];

const chartColors = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#ef4444', '#14b8a6'];

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

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

export default function UserLeadsViewPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params?.userId as string;
  const { theme } = useTheme();
  const [currentUser, setCurrentUser] = useState(auth.getUser());
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState('');
  const [enquiryNumber, setEnquiryNumber] = useState('');
  const [filters, setFilters] = useState<LeadFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [showLeadsTable, setShowLeadsTable] = useState(false);
  const queryClient = useQueryClient();

  // Debounce search inputs
  const debouncedSearch = useDebounce(search, 500);
  const debouncedEnquiryNumber = useDebounce(enquiryNumber, 500);

  // Track previous search values to detect actual changes
  const prevSearchRef = useRef<string>('');
  const prevEnquiryRef = useRef<string>('');

  // Reset to page 1 when search or enquiry number changes
  useEffect(() => {
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
    const user = auth.getUser();
    if (!user) {
      router.push('/auth/login');
      return;
    }
    if (user.roleName !== 'Super Admin' && user.roleName !== 'Sub Super Admin') {
      router.push('/user/dashboard');
      return;
    }
    setCurrentUser(user);
  }, [router]);

  // Fetch viewing user info
  const { data: userData } = useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      const response = await userAPI.getById(userId);
      return response.data || response;
    },
    enabled: !!userId && !!currentUser,
  });

  useEffect(() => {
    if (userData) {
      setViewingUser(userData);
    }
  }, [userData]);

  const {
    data: analyticsResponse,
    isLoading: isLoadingAnalytics,
  } = useQuery({
    queryKey: ['user-analytics-summary', userId],
    queryFn: async () => {
      if (!userId) return null;
      const response = await leadAPI.getAnalytics(userId);
      return response.data || response;
    },
    enabled: !!userId && !!currentUser,
    staleTime: 60000,
  });

  const analytics = (analyticsResponse?.data || analyticsResponse) as UserAnalytics | null;

  const chartGridColor = theme === 'dark' ? 'rgba(148, 163, 184, 0.2)' : '#e2e8f0';
  const chartTextColor = theme === 'dark' ? '#cbd5f5' : '#475569';

  const tooltipStyle = useMemo(
    () => ({
      backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
      color: theme === 'dark' ? '#f8fafc' : '#1f2937',
      borderRadius: '12px',
      border:
        theme === 'dark'
          ? '1px solid rgba(148, 163, 184, 0.35)'
          : '1px solid rgba(148, 163, 184, 0.2)',
      boxShadow:
        theme === 'dark'
          ? '0 12px 36px rgba(15, 23, 42, 0.45)'
          : '0 12px 36px rgba(15, 23, 42, 0.12)',
      padding: '12px',
    }),
    [theme]
  );

  const summaryCards = useMemo(
    () => [
      {
        label: 'Assigned Leads',
        value: analytics?.totalLeads ?? 0,
        helper: 'Allotted to this counsellor',
      },
      {
        label: 'Touched (7 days)',
        value: analytics?.recentActivity?.leadsUpdatedLast7Days ?? 0,
        helper: 'Engaged recently',
      },
      {
        label: 'New Leads',
        value: analytics?.statusBreakdown?.New ?? analytics?.statusBreakdown?.new ?? 0,
        helper: 'Waiting for first touch',
      },
      {
        label: 'Interested',
        value:
          analytics?.statusBreakdown?.Interested ??
          analytics?.statusBreakdown?.interested ??
          0,
        helper: 'High intent prospects',
      },
    ],
    [analytics]
  );

  const statusChartData = useMemo(() => {
    if (!analytics?.statusBreakdown) return [] as Array<{ name: string; value: number }>;
    return Object.entries(analytics.statusBreakdown)
      .map(([status, count]) => ({
        name: status,
        value: typeof count === 'number' ? count : Number(count) || 0,
      }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [analytics]);

  const mandalChartData = useMemo(() => {
    if (!analytics?.mandalBreakdown) return [] as Array<{ name: string; value: number }>;
    return analytics.mandalBreakdown
      .map((item) => ({ name: item.mandal, value: item.count }))
      .filter((item) => item.value > 0)
      .slice(0, 6);
  }, [analytics]);

  const stateChartData = useMemo(() => {
    if (!analytics?.stateBreakdown) return [] as Array<{ name: string; value: number }>;
    return analytics.stateBreakdown
      .map((item) => ({ name: item.state, value: item.count }))
      .filter((item) => item.value > 0)
      .slice(0, 8);
  }, [analytics]);

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
    if (currentUser && userId) {
      loadFilterOptions();
    }
  }, [currentUser, userId]);

  // Build query filters - include assignedTo filter
  const queryFilters = useMemo(() => {
    const query: LeadFilters = {
      page,
      limit,
      assignedTo: userId, // Filter by the user we're viewing
      ...filters,
    };
    if (debouncedSearch) {
      query.search = debouncedSearch;
    }
    if (debouncedEnquiryNumber) {
      query.enquiryNumber = debouncedEnquiryNumber;
    }
    return query;
  }, [page, limit, userId, filters, debouncedSearch, debouncedEnquiryNumber]);

  // Fetch leads with React Query
  const {
    data: leadsData,
    isLoading: isLoadingLeads,
    isFetching: isFetchingLeads,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['leads', queryFilters],
    queryFn: async () => {
      const response = await leadAPI.getAll(queryFilters);
      return response.data || response;
    },
    enabled: showLeadsTable && !!currentUser && !!userId,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const leads = leadsData?.leads || [];
  const pagination = leadsData?.pagination || { page: 1, limit: 50, total: 0, pages: 1 };

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
    switch (status?.toLowerCase()) {
      case 'interested':
        return 'bg-green-100 text-green-800';
      case 'not interested':
        return 'bg-red-100 text-red-800';
      case 'partial':
        return 'bg-yellow-100 text-yellow-800';
      case 'new':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Prevent hydration mismatch
  if (!isMounted || !currentUser || !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* Background - solid warm light theme */}
      <div className="fixed inset-0 bg-gradient-to-br from-orange-50/40 via-amber-50/20 to-orange-50/30 pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-200/50 sticky top-0 z-20">
          <div className="max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {viewingUser ? `${viewingUser.name}'s Assigned Leads` : 'User Leads'}
                </h1>
                <p className="text-sm text-gray-600">
                  {viewingUser?.email || 'Loading user info...'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push('/superadmin/dashboard')}
                >
                  Back to Dashboard
                </Button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <section className="mb-10 space-y-6">
            {isLoadingAnalytics ? (
              <Card className="flex min-h-[220px] items-center justify-center">
                <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                  Loading analytics for {viewingUser?.name || 'user'}…
                </div>
              </Card>
            ) : analytics ? (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {summaryCards.map((card, index) => (
                    <Card
                      key={card.label}
                      className={`overflow-hidden border border-white/60 bg-gradient-to-br ${summaryCardStyles[index % summaryCardStyles.length]} p-6 shadow-lg shadow-blue-100/40 dark:border-slate-800/60 dark:shadow-none`}
                    >
                      <p className="text-sm font-medium uppercase tracking-[0.2em] text-slate-500/80 dark:text-slate-400/80">
                        {card.label}
                      </p>
                      <p className="mt-3 text-3xl font-semibold text-slate-900 dark:text-slate-100">
                        {formatNumber(card.value)}
                      </p>
                      <p className="mt-2 text-xs text-slate-500/90 dark:text-slate-400/90">{card.helper}</p>
                    </Card>
                  ))}
                </div>

                {statusChartData.length > 0 && (
                  <Card className="space-y-6 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Lead Status Mix</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Distribution of leads assigned to {viewingUser?.name || 'this counsellor'}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div className="h-72">
                        <ResponsiveContainer>
                          <BarChart data={statusChartData}>
                            <CartesianGrid stroke={chartGridColor} strokeDasharray="6 4" />
                            <XAxis
                              dataKey="name"
                              stroke={chartTextColor}
                              tickLine={false}
                              axisLine={{ stroke: chartGridColor }}
                              tick={{ fill: chartTextColor, fontSize: 12 }}
                            />
                            <YAxis
                              stroke={chartTextColor}
                              allowDecimals={false}
                              tickLine={false}
                              axisLine={{ stroke: chartGridColor }}
                              tick={{ fill: chartTextColor, fontSize: 12 }}
                            />
                            <Tooltip
                              contentStyle={tooltipStyle}
                              cursor={{ fill: theme === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(59, 130, 246, 0.08)' }}
                            />
                            <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                              {statusChartData.map((entry, idx) => (
                                <Cell key={`status-${entry.name}`} fill={chartColors[idx % chartColors.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-3">
                        {statusChartData.map((item) => (
                          <div
                            key={item.name}
                            className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 dark:border-slate-800/70 dark:bg-slate-900/60"
                          >
                            <div>
                              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{item.name}</p>
                              <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                                {formatNumber(item.value)}
                              </p>
                            </div>
                            <span className="text-xs uppercase tracking-[0.25em] text-slate-400 dark:text-slate-500">
                              Leads
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                )}

                <div className="grid gap-6 lg:grid-cols-2">
                  {mandalChartData.length > 0 && (
                    <Card className="space-y-6 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Top Mandals</h2>
                      <div className="grid gap-6 lg:grid-cols-2">
                        <div className="h-72">
                          <ResponsiveContainer>
                            <BarChart data={mandalChartData} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                              <CartesianGrid stroke={chartGridColor} strokeDasharray="6 4" />
                              <XAxis
                                type="number"
                                stroke={chartTextColor}
                                tickLine={false}
                                axisLine={{ stroke: chartGridColor }}
                                tick={{ fill: chartTextColor, fontSize: 12 }}
                              />
                              <YAxis
                                type="category"
                                dataKey="name"
                                stroke={chartTextColor}
                                tickLine={false}
                                axisLine={{ stroke: chartGridColor }}
                                tick={{ fill: chartTextColor, fontSize: 12 }}
                                width={110}
                              />
                              <Tooltip
                                contentStyle={tooltipStyle}
                                cursor={{ fill: theme === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(59, 130, 246, 0.08)' }}
                              />
                              <Bar dataKey="value" radius={[0, 12, 12, 0]}>
                                {mandalChartData.map((entry, idx) => (
                                  <Cell key={`mandal-${entry.name}`} fill={chartColors[idx % chartColors.length]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-3">
                          {mandalChartData.map((item, idx) => (
                            <div
                              key={item.name}
                              className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 dark:border-slate-800/70 dark:bg-slate-900/60"
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: chartColors[idx % chartColors.length] }}
                                />
                                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{item.name}</span>
                              </div>
                              <span className="text-base font-semibold text-blue-600 dark:text-blue-300">
                                {formatNumber(item.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Card>
                  )}

                  {stateChartData.length > 0 && (
                    <Card className="space-y-6 p-6 shadow-lg shadow-blue-100/30 dark:shadow-none">
                      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Leads by State</h2>
                      <div className="grid gap-6 lg:grid-cols-2">
                        <div className="h-72">
                          <ResponsiveContainer>
                            <PieChart>
                              <Tooltip
                                contentStyle={tooltipStyle}
                                cursor={{ fill: theme === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(59, 130, 246, 0.08)' }}
                              />
                              <Pie
                                data={stateChartData}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={60}
                                outerRadius={95}
                                paddingAngle={4}
                              >
                                {stateChartData.map((entry, idx) => (
                                  <Cell key={`state-${entry.name}`} fill={chartColors[idx % chartColors.length]} />
                                ))}
                              </Pie>
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-3">
                          {stateChartData.map((item, idx) => (
                            <div
                              key={item.name}
                              className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-white/80 px-4 py-3 dark:border-slate-800/70 dark:bg-slate-900/60"
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className="h-2.5 w-2.5 rounded-full"
                                  style={{ backgroundColor: chartColors[idx % chartColors.length] }}
                                />
                                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{item.name}</span>
                              </div>
                              <span className="text-base font-semibold text-blue-600 dark:text-blue-300">
                                {formatNumber(item.value)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              </>
            ) : (
              <Card className="p-8 text-center">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">No analytics available yet</h2>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Once {viewingUser?.name || 'this counsellor'} starts working on leads, performance insights will appear
                  here automatically.
                </p>
              </Card>
            )}
          </section>

          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                Assigned Leads ({analytics?.totalLeads ?? pagination.total ?? 0})
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Detailed list of every record currently owned by {viewingUser?.name || 'this counsellor'}.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    // Fetch all assigned leads for this user (without pagination if possible, or use current filters)
                    // For export, we usually want ALL assigned leads, or the current filtered view? 
                    // User said: "display the only the asisnged leas... update there to export rhe excel for the assigned leads also"
                    // I will export what corresponds to the current view (or all assigned if no filters).
                    // Actually, `getAll` with limit=10000 or similar might be needed. 
                    // Let's use the current `queryFilters` but without pagination limit for export.

                    const exportFilters = { ...queryFilters, limit: 10000, page: 1 };
                    const response = await leadAPI.getAll(exportFilters);
                    const leadsToExport = response.data?.leads || response.leads || [];

                    if (leadsToExport.length === 0) {
                      showToast.error('No leads to export');
                      return;
                    }

                    const exportData = leadsToExport.map((lead: any) => ({
                      'Lead Name': lead.name,
                      'Phone Number': lead.phone,
                      'Remarks': lead.notes || '', // Map notes to remarks
                    }));

                    const worksheet = XLSX.utils.json_to_sheet(exportData);
                    const workbook = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(workbook, worksheet, 'Assigned Leads');
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    XLSX.writeFile(workbook, `Assigned_Leads_${viewingUser?.name}_${timestamp}.xlsx`);
                    showToast.success('Leads exported successfully');
                  } catch (error) {
                    console.error('Export error:', error);
                    showToast.error('Failed to export leads');
                  }
                }}
              >
                Export Excel
              </Button>
              <Button
                variant={showLeadsTable ? 'outline' : 'primary'}
                onClick={() => setShowLeadsTable((prev) => !prev)}
              >
                {showLeadsTable ? 'Hide Assigned Leads' : 'See Assigned Leads'}
              </Button>
            </div>
          </div>

          {!showLeadsTable && (
            <Card className="p-8 text-center">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Assigned leads table hidden</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Click “See Assigned Leads” above to explore the full list, apply filters, and audit individual records.
              </p>
            </Card>
          )}
          {showLeadsTable && (
            <>
              {/* Search and Filters */}
              <Card className="mb-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Search by Enquiry Number
                      </label>
                      <Input
                        type="text"
                        placeholder="ENQ24000001 or 24000001 or 000001"
                        value={enquiryNumber}
                        onChange={(e) => setEnquiryNumber(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Search by Name/Phone/Email
                      </label>
                      <Input
                        type="text"
                        placeholder="Search leads..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full"
                      />
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
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t border-gray-200">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Mandal
                        </label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm"
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          State
                        </label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm"
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Quota
                        </label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm"
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Status
                        </label>
                        <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm"
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

              {/* Results Summary */}
              <div className="mb-4 flex justify-between items-center">
                <p className="text-sm text-gray-600">
                  Showing {leads.length} of {pagination.total} leads
                  {pagination.total > 0 && (
                    <span className="ml-2">
                      (Page {pagination.page} of {pagination.pages})
                    </span>
                  )}
                </p>
                {(isLoadingLeads || isFetchingLeads) && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    Loading...
                  </div>
                )}
              </div>

              {/* Leads Table */}
              {isError ? (
                <Card>
                  <div className="text-center py-8">
                    <p className="text-red-600 mb-4">
                      Error loading leads: {error instanceof Error ? error.message : 'Unknown error'}
                    </p>
                    <Button onClick={() => refetch()}>Retry</Button>
                  </div>
                </Card>
              ) : leads.length === 0 && !(isLoadingLeads || isFetchingLeads) ? (
                <Card>
                  <div className="text-center py-8">
                    <p className="text-gray-600">No leads assigned to this user yet</p>
                  </div>
                </Card>
              ) : (
                <Card>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gradient-to-r from-gray-50 to-gray-100/50">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Enquiry #
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Phone
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Email
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Mandal
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            State
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Created
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white/50 divide-y divide-gray-200">
                        {leads.map((lead: Lead) => (
                          <tr
                            key={lead._id}
                            className="hover:bg-blue-50/50 transition-colors duration-200 cursor-pointer"
                            onClick={() => router.push(`/superadmin/leads/${lead._id}`)}
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-medium text-blue-600">
                              {lead.enquiryNumber || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                              {lead.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {lead.phone}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {lead.email || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {lead.mandal}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                              {lead.state}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full transition-all ${getStatusColor(
                                  lead.leadStatus
                                )}`}
                              >
                                {lead.leadStatus || 'New'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {lead.createdAt ? formatDate(lead.createdAt) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {pagination.pages > 1 && (
                    <div className="mt-6 pt-4 border-t border-gray-200 flex justify-between items-center gap-4">
                      <div className="flex items-center gap-2">
                        {/* First Page Button */}
                        <Button
                          variant="outline"
                          onClick={() => setPage(1)}
                          disabled={page === 1 || isLoadingLeads || isFetchingLeads}
                          size="sm"
                          className="p-2"
                          title="First Page"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                          </svg>
                        </Button>

                        {/* Previous Page Button */}
                        <Button
                          variant="outline"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page === 1 || isLoadingLeads || isFetchingLeads}
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
                                disabled={isLoadingLeads || isFetchingLeads}
                                size="sm"
                                className="min-w-[40px]"
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>

                        {/* Next Page Button */}
                        <Button
                          variant="outline"
                          onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                          disabled={page === pagination.pages || isLoadingLeads || isFetchingLeads}
                          size="sm"
                          className="p-2"
                          title="Next Page"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Button>

                        {/* Last Page Button */}
                        <Button
                          variant="outline"
                          onClick={() => setPage(pagination.pages)}
                          disabled={page === pagination.pages || isLoadingLeads || isFetchingLeads}
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
                          <label className="text-sm text-gray-600">Jump to:</label>
                          <select
                            value={page}
                            onChange={(e) => setPage(Number(e.target.value))}
                            disabled={isLoadingLeads || isFetchingLeads}
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 backdrop-blur-sm text-sm"
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

                      {/* Page Info */}
                      <div className="text-sm text-gray-600">
                        Page {pagination.page} of {pagination.pages}
                      </div>
                    </div>
                  )}
                </Card>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

