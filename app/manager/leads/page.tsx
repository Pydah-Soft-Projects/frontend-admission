'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { managerAPI, locationsAPI } from '@/lib/api';
import { showToast } from '@/lib/toast';
import { Lead, User } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import {
  MANAGER_LEADS_EXPORT_COLUMNS,
  ManagerLeadsExportColumnKey,
  getDefaultExportColumnSelection,
  getSelectedExportColumnKeys,
} from '@/lib/managerLeadsExport';
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
  const { setHeaderContent, clearHeaderContent, setMobileTopBar, clearMobileTopBar } = useDashboardHeader();
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [search, setSearch] = useState('');
  const [leadStatus, setLeadStatus] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterMandal, setFilterMandal] = useState('');
  const [filterVillage, setFilterVillage] = useState('');
  const [locationStates, setLocationStates] = useState<{ id: string; name: string }[]>([]);
  const [locationDistricts, setLocationDistricts] = useState<{ id: string; name: string }[]>([]);
  const [locationMandals, setLocationMandals] = useState<{ id: string; name: string }[]>([]);
  const [locationVillages, setLocationVillages] = useState<{ id: string; name: string }[]>([]);
  const [teamMembers, setTeamMembers] = useState<User[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportColumnSelection, setExportColumnSelection] = useState<
    Record<ManagerLeadsExportColumnKey, boolean>
  >(getDefaultExportColumnSelection);

  // Debounce search inputs
  const debouncedSearch = useDebounce(search, 700);

  const selectClass =
    'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm disabled:opacity-50';

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

  // Load states for location filters
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await locationsAPI.listStates();
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setLocationStates(
          arr.map((s: { id?: string; name: string }) => ({
            id: s.id || '',
            name: s.name || String(s),
          }))
        );
      } catch (e) {
        if (!cancelled) console.error('Failed to load states for manager leads:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!filterState) {
      setLocationDistricts([]);
      setLocationMandals([]);
      setLocationVillages([]);
      setFilterDistrict('');
      setFilterMandal('');
      setFilterVillage('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await locationsAPI.listDistricts({ stateName: filterState });
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setLocationDistricts(
          arr.map((d: { id?: string; name: string }) => ({
            id: d.id || '',
            name: d.name || String(d),
          }))
        );
        setLocationMandals([]);
        setLocationVillages([]);
        setFilterDistrict('');
        setFilterMandal('');
        setFilterVillage('');
      } catch {
        if (!cancelled) setLocationDistricts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterState]);

  useEffect(() => {
    if (!filterState || !filterDistrict) {
      setLocationMandals([]);
      setLocationVillages([]);
      setFilterMandal('');
      setFilterVillage('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await locationsAPI.listMandals({
          stateName: filterState,
          districtName: filterDistrict,
        });
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setLocationMandals(
          arr.map((m: { id?: string; name: string }) => ({
            id: m.id || '',
            name: m.name || String(m),
          }))
        );
        setLocationVillages([]);
        setFilterMandal('');
        setFilterVillage('');
      } catch {
        if (!cancelled) setLocationMandals([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterState, filterDistrict]);

  useEffect(() => {
    if (!filterState || !filterDistrict || !filterMandal) {
      setLocationVillages([]);
      setFilterVillage('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await locationsAPI.listVillages({
          stateName: filterState,
          districtName: filterDistrict,
          mandalName: filterMandal,
        });
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setLocationVillages(
          arr.map((v: { id?: string; name: string }) => ({
            id: v.id || v.name || '',
            name: v.name || String(v),
          }))
        );
        setFilterVillage('');
      } catch {
        if (!cancelled) setLocationVillages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterState, filterDistrict, filterMandal]);

  // Build query filters
  const queryFilters = useMemo(() => {
    const filters: Record<string, string | number> = {
      page,
      limit,
    };
    const searchTrimmed = debouncedSearch?.trim() ?? '';
    if (searchTrimmed.length >= 2) filters.search = searchTrimmed;
    if (leadStatus) filters.leadStatus = leadStatus;
    if (assignedTo) filters.assignedTo = assignedTo;
    if (filterState) filters.state = filterState;
    if (filterDistrict) filters.district = filterDistrict;
    if (filterMandal) filters.mandal = filterMandal;
    if (filterVillage) filters.village = filterVillage;
    return filters;
  }, [
    page,
    limit,
    debouncedSearch,
    leadStatus,
    assignedTo,
    filterState,
    filterDistrict,
    filterMandal,
    filterVillage,
  ]);

  // Fetch leads
  const {
    data: leadsData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['manager-leads', queryFilters],
    queryFn: async () => {
      const response = await managerAPI.getLeads(queryFilters);
      const raw =
        response && typeof response === 'object' && 'leads' in response
          ? response
          : response && typeof response === 'object' && response.data && typeof response.data === 'object'
            ? response.data
            : null;
      if (!raw || !Array.isArray((raw as { leads?: Lead[] }).leads)) {
        return {
          leads: [],
          pagination: { page: 1, limit: 50, total: 0, pages: 0 },
          needsUpdateCount: 0,
        };
      }
      const payload = raw as {
        leads: Lead[];
        pagination?: { page?: number; limit?: number; total?: number; pages?: number };
        needsUpdateCount?: number;
      };
      const p = payload.pagination || {};
      const total = Number(p.total) || 0;
      const limitNum = Number(p.limit) || limit;
      return {
        leads: payload.leads,
        pagination: {
          page: Number(p.page) || 1,
          limit: limitNum,
          total,
          pages: Number(p.pages) || (total > 0 ? Math.ceil(total / limitNum) : 0),
        },
        needsUpdateCount: Number(payload.needsUpdateCount) || 0,
      };
    },
    enabled: !!user,
    staleTime: 30000,
  });

  const leads = leadsData?.leads || [];
  const pagination = useMemo(() => {
    const p = leadsData?.pagination || { page: 1, limit: 50, total: 0, pages: 0 };
    const total = Number(p.total) || 0;
    const limitNum = Number(p.limit) || limit;
    const pageNum = Number(p.page) || 1;
    const pages = Number(p.pages) || (total > 0 ? Math.ceil(total / limitNum) : 0);
    return { page: pageNum, limit: limitNum, total, pages };
  }, [leadsData, limit]);
  const filteredTotal = pagination.total;

  const hasActiveFilters =
    !!search ||
    !!leadStatus ||
    !!assignedTo ||
    !!filterState ||
    !!filterDistrict ||
    !!filterMandal ||
    !!filterVillage;

  const teamLeadsTitleWithCount = (
    <div className="flex flex-wrap items-baseline gap-2 sm:gap-3">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Team Leads</h1>
      {isLoading ? (
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Loading…</span>
      ) : (
        <span className="text-base font-semibold text-slate-600 dark:text-slate-300">
          ({filteredTotal.toLocaleString()} lead{filteredTotal === 1 ? '' : 's'}
          {hasActiveFilters ? ' matching filters' : ' total'})
        </span>
      )}
    </div>
  );

  useEffect(() => {
    setHeaderContent(teamLeadsTitleWithCount);

    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent, filteredTotal, hasActiveFilters, isLoading]);

  useEffect(() => {
    setMobileTopBar({ title: 'Team Leads', iconKey: 'team-leads' });
    return () => clearMobileTopBar();
  }, [setMobileTopBar, clearMobileTopBar]);

  // Clear filters
  const clearFilters = () => {
    setSearch('');
    setLeadStatus('');
    setAssignedTo('');
    setFilterState('');
    setFilterDistrict('');
    setFilterMandal('');
    setFilterVillage('');
    setPage(1);
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

  const selectedExportColumnCount = getSelectedExportColumnKeys(exportColumnSelection).length;

  const setAllExportColumns = (checked: boolean) => {
    setExportColumnSelection(
      MANAGER_LEADS_EXPORT_COLUMNS.reduce(
        (acc, col) => {
          acc[col.key] = checked;
          return acc;
        },
        {} as Record<ManagerLeadsExportColumnKey, boolean>
      )
    );
  };

  const handleExportExcel = async () => {
    const columns = getSelectedExportColumnKeys(exportColumnSelection);
    if (columns.length === 0) {
      showToast.error('Select at least one column to export.');
      return;
    }

    try {
      setIsExporting(true);

      const { page: _page, limit: _limit, ...exportFilters } = queryFilters;
      const blob = await managerAPI.exportLeads({ ...exportFilters, columns });

      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      const date = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `team_leads_export_${date}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      setExportModalOpen(false);
      showToast.success('Excel downloaded successfully');
    } catch (error) {
      console.error('Error exporting leads:', error);
      showToast.error('Failed to export leads. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mobile: count inline after title (title also in top bar) */}
      <div className="lg:hidden flex flex-wrap items-baseline gap-2">
        <span className="text-lg font-bold text-slate-900 dark:text-white">Team Leads</span>
        {!isLoading && (
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            ({filteredTotal.toLocaleString()} lead{filteredTotal === 1 ? '' : 's'}
            {hasActiveFilters ? ' matching filters' : ' total'})
          </span>
        )}
      </div>

      {/* Search and Filters */}
      <Card className="p-4 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
            <Input
              type="text"
              placeholder="Search by name or enquiry number"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-10 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2 shrink-0">
            {hasActiveFilters && (
              <Button size="sm" variant="outline" onClick={clearFilters} className="h-10">
                Clear filters
              </Button>
            )}
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                setExportColumnSelection(getDefaultExportColumnSelection());
                setExportModalOpen(true);
              }}
              disabled={isExporting}
              isLoading={isExporting}
              className="h-10"
            >
              <span className="mr-2">📥</span>
              Export Excel
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Lead Status
            </label>
            <select
              value={leadStatus}
              onChange={(e) => {
                setLeadStatus(e.target.value);
                setPage(1);
              }}
              className={selectClass}
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
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Assigned To
            </label>
            <select
              value={assignedTo}
              onChange={(e) => {
                setAssignedTo(e.target.value);
                setPage(1);
              }}
              className={selectClass}
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

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              State
            </label>
            <select
              value={filterState}
              onChange={(e) => {
                setFilterState(e.target.value);
                setPage(1);
              }}
              className={selectClass}
            >
              <option value="">All States</option>
              {locationStates.map((s) => (
                <option key={s.id || s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              District
            </label>
            <select
              value={filterDistrict}
              onChange={(e) => {
                setFilterDistrict(e.target.value);
                setPage(1);
              }}
              disabled={!filterState}
              className={selectClass}
            >
              <option value="">{filterState ? 'All Districts' : 'Select state'}</option>
              {locationDistricts.map((d) => (
                <option key={d.id || d.name} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Mandal
            </label>
            <select
              value={filterMandal}
              onChange={(e) => {
                setFilterMandal(e.target.value);
                setPage(1);
              }}
              disabled={!filterDistrict}
              className={selectClass}
            >
              <option value="">{filterDistrict ? 'All Mandals' : 'Select district'}</option>
              {locationMandals.map((m) => (
                <option key={m.id || m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Village
            </label>
            <select
              value={filterVillage}
              onChange={(e) => {
                setFilterVillage(e.target.value);
                setPage(1);
              }}
              disabled={!filterMandal}
              className={selectClass}
            >
              <option value="">{filterMandal ? 'All Villages' : 'Select mandal'}</option>
              {locationVillages.map((v) => (
                <option key={v.id || v.name} value={v.name}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>
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
          <>
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
              {filteredTotal === 0 ? (
                <>No leads{hasActiveFilters ? ' matching filters' : ''}</>
              ) : (
                <>
                  <span className="font-semibold text-gray-900 dark:text-gray-100">
                    {filteredTotal.toLocaleString()}
                  </span>{' '}
                  lead{filteredTotal === 1 ? '' : 's'}
                  {hasActiveFilters ? ' match filters' : ' total'} (none on this page)
                </>
              )}
            </div>
            <EmptyState
              title="No leads found"
              description="Try adjusting your search or filters to find leads."
            />
          </>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Phone
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      District
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Student Group
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                      Assigned To
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {leads.map((lead: Lead) => (
                    <tr
                      key={lead._id}
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/manager/leads/${lead._id}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/manager/leads/${lead._id}`);
                        }
                      }}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        <span className="flex items-center gap-1.5">
                          {lead.name}
                          {Number(lead.needsManualUpdate) > 0 && (
                            <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 rounded" title="Details need manual update">Needs update</span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {lead.phone}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {lead.district || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {lead.studentGroup || '-'}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {filteredTotal === 0 ? (
                  <>No leads{hasActiveFilters ? ' matching filters' : ''}</>
                ) : (
                  <>
                    Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, filteredTotal)} of{' '}
                    <span className="font-semibold">{filteredTotal.toLocaleString()}</span>
                    {hasActiveFilters ? ' filtered' : ''} lead{filteredTotal === 1 ? '' : 's'}
                  </>
                )}
              </div>
              {pagination.pages > 1 && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    Previous
                  </Button>
                  <span className="flex items-center text-sm text-gray-600 dark:text-gray-400 px-1">
                    Page {page} of {pagination.pages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                    disabled={page === pagination.pages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>

      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden p-0">
          <div className="shrink-0 px-6 pt-6 pr-12">
            <DialogHeader>
              <DialogTitle>Export Excel</DialogTitle>
              <DialogDescription>
                Choose columns to include. Export uses your current filters (
                {filteredTotal.toLocaleString()} lead{filteredTotal === 1 ? '' : 's'}
                {hasActiveFilters ? ' matching filters' : ''}).
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2 py-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setExportColumnSelection(getDefaultExportColumnSelection())}
              >
                Basic columns
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setAllExportColumns(true)}>
                Select all
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setAllExportColumns(false)}>
                Clear all
              </Button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {selectedExportColumnCount} of {MANAGER_LEADS_EXPORT_COLUMNS.length} selected
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              {MANAGER_LEADS_EXPORT_COLUMNS.map((col) => (
                <label
                  key={col.key}
                  className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer rounded-md px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                >
                  <input
                    type="checkbox"
                    checked={exportColumnSelection[col.key]}
                    onChange={(e) => {
                      setExportColumnSelection((prev) => ({
                        ...prev,
                        [col.key]: e.target.checked,
                      }));
                    }}
                    className="h-4 w-4 rounded border-gray-300 text-[#ea580c] focus:ring-[#fdba74] dark:border-gray-600"
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          </div>

          <DialogFooter className="shrink-0 mt-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800/80 gap-3 sm:gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExportModalOpen(false)}
              disabled={isExporting}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleExportExcel}
              disabled={isExporting || selectedExportColumnCount === 0}
              isLoading={isExporting}
              className="w-full sm:w-auto"
            >
              {isExporting ? 'Downloading…' : 'Download Excel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

