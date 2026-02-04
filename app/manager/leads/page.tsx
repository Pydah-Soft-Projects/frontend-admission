'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { managerAPI } from '@/lib/api';
import { Lead, User } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import Link from 'next/link';
// Using inline icons

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

export default function ManagerLeadsPage() {
  const router = useRouter();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState('');
  const [enquiryNumber, setEnquiryNumber] = useState('');
  const [leadStatus, setLeadStatus] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);

  // Debounce search inputs
  const debouncedSearch = useDebounce(search, 500);
  const debouncedEnquiryNumber = useDebounce(enquiryNumber, 500);

  // Check authentication
  useEffect(() => {
    const currentUser = auth.getUser();
    if (!currentUser) {
      router.push('/auth/login');
      return;
    }
    // Check if user is a manager - explicitly check for true
    if (currentUser.isManager !== true) {
      if (currentUser.roleName === 'Super Admin' || currentUser.roleName === 'Sub Super Admin') {
        router.push('/superadmin/dashboard');
      } else {
        router.push('/user/dashboard');
      }
      return;
    }
    setUser(currentUser);
  }, [router]);

  // Load team members
  const { data: teamData } = useQuery({
    queryKey: ['manager-team'],
    queryFn: async () => {
      const response = await managerAPI.getTeamMembers();
      return response.data || response;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (teamData) {
      setTeamMembers(teamData);
    }
  }, [teamData]);

  // Build query filters
  const queryFilters = useMemo(() => {
    const filters: any = {
      page,
      limit,
    };
    if (debouncedSearch) filters.search = debouncedSearch;
    if (debouncedEnquiryNumber) filters.enquiryNumber = debouncedEnquiryNumber;
    if (leadStatus) filters.leadStatus = leadStatus;
    if (assignedTo) filters.assignedTo = assignedTo;
    return filters;
  }, [page, limit, debouncedSearch, debouncedEnquiryNumber, leadStatus, assignedTo]);

  // Fetch leads
  const {
    data: leadsData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['manager-leads', queryFilters],
    queryFn: async () => {
      const response = await managerAPI.getLeads(queryFilters);
      return response.data || response;
    },
    enabled: !!user,
    staleTime: 30000,
  });

  const leads = leadsData?.leads || [];
  const pagination = leadsData?.pagination || { page: 1, limit: 50, total: 0, pages: 1 };
  const needsUpdateCount = leadsData?.needsUpdateCount ?? 0;

  useEffect(() => {
    setHeaderContent(
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">All Leads</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Manage leads assigned to you and your team ({pagination.total} total)
          {needsUpdateCount > 0 && (
            <span className="ml-2 inline-flex items-center rounded-md bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
              {needsUpdateCount} need{needsUpdateCount === 1 ? 's' : ''} update
            </span>
          )}
        </p>
      </div>
    );

    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent, pagination.total, needsUpdateCount]);

  // Clear filters
  const clearFilters = () => {
    setSearch('');
    setEnquiryNumber('');
    setLeadStatus('');
    setAssignedTo('');
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
      case 'lost':
        return 'bg-gray-100 text-gray-800 dark:bg-slate-800/60 dark:text-slate-200';
      case 'new':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-slate-800/60 dark:text-slate-200';
    }
  };

  const hasActiveFilters = search || enquiryNumber || leadStatus || assignedTo;

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <Card className="p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search by Name/Phone/Email */}
          <div className="flex-1">
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">🔍</span>
              <Input
                type="text"
                placeholder="Search by Name/Phone/Email"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-10 py-2 text-sm"
              />
            </div>
          </div>

          {/* Search by Enquiry Number */}
          <div className="flex-1">
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">🔍</span>
              <Input
                type="text"
                placeholder="Search by Enquiry Number"
                value={enquiryNumber}
                onChange={(e) => {
                  setEnquiryNumber(e.target.value);
                  setPage(1);
                }}
                className="pl-10 py-2 text-sm"
              />
            </div>
          </div>

          {/* Filter Toggle */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={showFilters ? 'primary' : 'outline'}
              onClick={() => setShowFilters(!showFilters)}
              className="h-10"
            >
              <span className="mr-2">⚙</span>
              Filters
            </Button>
            {hasActiveFilters && (
              <Button size="sm" variant="outline" onClick={clearFilters} className="h-10">
                <span className="mr-2">×</span>
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Lead Status
              </label>
              <select
                value={leadStatus}
                onChange={(e) => {
                  setLeadStatus(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
              >
                <option value="">All Statuses</option>
                <option value="New">New</option>
                <option value="Contacted">Contacted</option>
                <option value="Interested">Interested</option>
                <option value="Qualified">Qualified</option>
                <option value="Converted">Converted</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Not Interested">Not Interested</option>
                <option value="Lost">Lost</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Assigned To
              </label>
              <select
                value={assignedTo}
                onChange={(e) => {
                  setAssignedTo(e.target.value);
                  setPage(1);
                }}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
              >
                <option value="">All Team Members</option>
                <option value={user?._id}>Me ({user?.name})</option>
                {teamMembers.map((member) => (
                  <option key={member._id} value={member._id}>
                    {member.name} ({member.roleName})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </Card>

      {/* Leads Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <TableSkeleton />
        ) : isError ? (
          <div className="p-8 text-center">
            <p className="text-red-600 dark:text-red-400">Error loading leads. Please try again.</p>
          </div>
        ) : leads.length === 0 ? (
          <EmptyState
            title="No leads found"
            description="Try adjusting your search or filters to find leads."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Enquiry #
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Assigned To
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {leads.map((lead: Lead) => (
                    <tr
                      key={lead._id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {lead.enquiryNumber || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        <span className="flex items-center gap-1.5">
                          {lead.name}
                          {lead.needsManualUpdate && (
                            <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 rounded" title="Details need manual update">Needs update</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {lead.phone}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                            lead.leadStatus || 'New'
                          )}`}
                        >
                          {lead.leadStatus || 'New'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {typeof lead.assignedTo === 'object' && lead.assignedTo
                          ? lead.assignedTo.name
                          : 'Unassigned'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {formatDate(lead.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/manager/leads/${lead._id}`}>
                          <Button size="sm" variant="outline">
                            👁
                            View
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div className="text-sm text-gray-700 dark:text-gray-300">
                  Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, pagination.total)} of{' '}
                  {pagination.total} leads
                  {needsUpdateCount > 0 && (
                    <span className="ml-3 inline-flex items-center rounded-md bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200 ring-1 ring-inset ring-amber-600/20">
                      {needsUpdateCount} need{needsUpdateCount === 1 ? 's' : ''} update
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                    disabled={page === pagination.pages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

