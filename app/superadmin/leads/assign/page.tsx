'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { leadAPI, userAPI } from '@/lib/api';
import { User, FilterOptions, Lead } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { showToast } from '@/lib/toast';
import { useDashboardHeader } from '@/components/layout/DashboardShell';

type AssignmentMode = 'bulk' | 'single' | 'remove';

interface AssignmentStats {
  totalLeads: number;
  assignedCount: number;
  unassignedCount: number;
  mandalBreakdown: Array<{ mandal: string; count: number }>;
  stateBreakdown: Array<{ state: string; count: number }>;
}

export default function AssignLeadsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [mode, setMode] = useState<AssignmentMode>('bulk');
  const [users, setUsers] = useState<User[]>([]);
  const [filters, setFilters] = useState<FilterOptions | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [mandal, setMandal] = useState('');
  const [state, setState] = useState('');
  const [academicYear, setAcademicYear] = useState<number | ''>(2025);
  const [count, setCount] = useState(1000);
  const [isReady, setIsReady] = useState(false);

  // Remove assignment state
  const [removeUserId, setRemoveUserId] = useState('');
  const [removeMandal, setRemoveMandal] = useState('');
  const [removeState, setRemoveState] = useState('');
  const [removeAcademicYear, setRemoveAcademicYear] = useState<number | ''>('');
  const [removeCount, setRemoveCount] = useState(100);

  const academicYearOptions = [2024, 2025, 2026, 2027];

  // Single assignment state
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Lead[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
    setIsReady(true);
  }, [router]);

  useEffect(() => {
    if (!currentUser) return;

    const load = async () => {
      try {
        const [usersResponse, filtersResponse] = await Promise.all([
          userAPI.getAll(),
          leadAPI.getFilterOptions(),
        ]);
        setUsers(usersResponse.data || usersResponse);
        setFilters(filtersResponse.data || filtersResponse);
      } catch (error) {
        console.error('Failed to load assign-leads data:', error);
        showToast.error('Unable to load users or filters.');
      }
    };

    load();
  }, [currentUser]);

  // Fetch assignment statistics (scoped by academic year when in bulk mode)
  const { data: statsData, refetch: refetchStats } = useQuery<{ data: AssignmentStats }>({
    queryKey: ['assignmentStats', mandal, state, academicYear],
    queryFn: async () => {
      const response = await leadAPI.getAssignmentStats({
        mandal: mandal || undefined,
        state: state || undefined,
        academicYear: academicYear !== '' ? academicYear : undefined,
      });
      return { data: response.data || response };
    },
    enabled: isReady && !!currentUser,
  });

  const stats = statsData?.data;

  // Assigned count for selected user (for remove-assignment tab)
  const { data: assignedCountData } = useQuery<{ data?: { count?: number } }>({
    queryKey: ['assignedCountForUser', removeUserId, removeMandal, removeState, removeAcademicYear],
    queryFn: async () => {
      if (!removeUserId) return { data: { count: 0 } };
      const response = await leadAPI.getAssignedCountForUser({
        userId: removeUserId,
        mandal: removeMandal || undefined,
        state: removeState || undefined,
        academicYear: removeAcademicYear !== '' ? removeAcademicYear : undefined,
      });
      return { data: response.data ?? response };
    },
    enabled: isReady && !!removeUserId,
  });
  const assignedToUserCount = assignedCountData?.data?.count ?? 0;

  // Search leads for single assignment
  useEffect(() => {
    if (!leadSearch || leadSearch.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const searchLeads = async () => {
      try {
        const response = await leadAPI.getAll({
          search: leadSearch,
          limit: 10,
          page: 1,
        });
        const leads = response.data?.leads || response.leads || [];
        setSearchResults(leads);
        setShowSearchResults(true);
      } catch (error) {
        console.error('Failed to search leads:', error);
      }
    };

    const timeoutId = setTimeout(searchLeads, 300);
    return () => clearTimeout(timeoutId);
  }, [leadSearch]);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };

    if (showSearchResults) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showSearchResults]);

  const assignMutation = useMutation({
    mutationFn: async (payload: {
      userId: string;
      mandal?: string;
      state?: string;
      academicYear?: number | string;
      count?: number;
      leadIds?: string[];
    }) => leadAPI.assignLeads(payload),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['assignmentStats'] });
      refetchStats();
      const assignedCount = response.data?.assigned || response.assigned || 0;
      const userName = response.data?.userName || 'user';
      showToast.success(`Successfully assigned ${assignedCount} lead${assignedCount !== 1 ? 's' : ''} to ${userName}`);
      
      // Reset form
      if (mode === 'bulk') {
        setSelectedUserId('');
        setMandal('');
        setState('');
        setAcademicYear(2025);
        setCount(1000);
      } else {
        setSelectedUserId('');
        setSelectedLeadId('');
        setLeadSearch('');
        setSearchResults([]);
      }
    },
    onError: (error: any) => {
      console.error('Assign leads error:', error);
      showToast.error(error.response?.data?.message || 'Failed to assign leads');
    },
  });

  const removeAssignmentsMutation = useMutation({
    mutationFn: async (payload: {
      userId: string;
      mandal?: string;
      state?: string;
      academicYear?: number | string;
      count: number;
    }) => leadAPI.removeAssignments(payload),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['assignmentStats'] });
      refetchStats();
      const removed = response.data?.removed ?? response.removed ?? 0;
      const userName = response.data?.userName ?? response.userName ?? 'user';
      showToast.success(`Removed assignment for ${removed} lead${removed !== 1 ? 's' : ''} from ${userName}`);
      setRemoveUserId('');
      setRemoveMandal('');
      setRemoveState('');
      setRemoveAcademicYear('');
      setRemoveCount(100);
    },
    onError: (error: any) => {
      console.error('Remove assignments error:', error);
      showToast.error(error.response?.data?.message || 'Failed to remove assignments');
    },
  });

  const handleBulkAssign = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUserId) {
      showToast.error('Please select a user to assign leads.');
      return;
    }
    if (academicYear === '') {
      showToast.error('Please select an academic year.');
      return;
    }
    if (count <= 0) {
      showToast.error('Count must be greater than zero.');
      return;
    }

    assignMutation.mutate({
      userId: selectedUserId,
      mandal: mandal || undefined,
      state: state || undefined,
      academicYear,
      count,
    });
  };

  const handleSingleAssign = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUserId) {
      showToast.error('Please select a user to assign the lead.');
      return;
    }
    if (!selectedLeadId) {
      showToast.error('Please select a lead to assign.');
      return;
    }

    assignMutation.mutate({
      userId: selectedUserId,
      leadIds: [selectedLeadId],
    });
  };

  const handleRemoveAssignments = (event: React.FormEvent) => {
    event.preventDefault();
    if (!removeUserId) {
      showToast.error('Please select a user to remove assignments from.');
      return;
    }
    if (removeCount <= 0) {
      showToast.error('Count must be greater than zero.');
      return;
    }
    if (removeCount > assignedToUserCount) {
      showToast.error(`This user has only ${assignedToUserCount} assigned lead(s). Enter a count up to ${assignedToUserCount}.`);
      return;
    }
    removeAssignmentsMutation.mutate({
      userId: removeUserId,
      mandal: removeMandal || undefined,
      state: removeState || undefined,
      academicYear: removeAcademicYear !== '' ? removeAcademicYear : undefined,
      count: removeCount,
    });
  };

  const header = useMemo(
    () => (
      <div className="flex flex-col items-end gap-2 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Assign Leads</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Distribute leads to counsellors and sub-admins using bulk or single assignment.
        </p>
      </div>
    ),
    []
  );

  useEffect(() => {
    setHeaderContent(header);
    return () => clearHeaderContent();
  }, [header, setHeaderContent, clearHeaderContent]);

  if (!isReady || !currentUser) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-600 dark:text-slate-300">Loading…</p>
        </div>
      </div>
    );
  }

  // Filter users: include Users, Student Counselors, Data Entry Users, Sub Super Admins (exclude Super Admin)
  const assignableUsers = users.filter(
    (u) =>
      u.isActive &&
      u.roleName !== 'Super Admin' &&
      (u.roleName === 'User' || u.roleName === 'Student Counselor' || u.roleName === 'Data Entry User' || u.roleName === 'Sub Super Admin')
  );

  // Group users by role
  const usersByRole = {
    'Sub Super Admin': assignableUsers.filter((u) => u.roleName === 'Sub Super Admin'),
    User: assignableUsers.filter((u) => u.roleName === 'User'),
    'Student Counselor': assignableUsers.filter((u) => u.roleName === 'Student Counselor'),
    'Data Entry User': assignableUsers.filter((u) => u.roleName === 'Data Entry User'),
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="p-4">
            <div className="text-sm font-medium text-gray-600 dark:text-slate-400">Total Leads</div>
            <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{stats.totalLeads.toLocaleString()}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-medium text-gray-600 dark:text-slate-400">Assigned Leads</div>
            <div className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">{stats.assignedCount.toLocaleString()}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-medium text-gray-600 dark:text-slate-400">Unassigned Leads</div>
            <div className="mt-1 text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.unassignedCount.toLocaleString()}</div>
          </Card>
        </div>
      )}

      {/* Mode Tabs */}
      <Card>
        <div className="border-b border-gray-200 dark:border-slate-700">
          <nav className="flex space-x-4" aria-label="Tabs">
            <button
              onClick={() => {
                setMode('bulk');
                setSelectedLeadId('');
                setLeadSearch('');
                setSearchResults([]);
              }}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                mode === 'bulk'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
            >
              Bulk Assignment
            </button>
            <button
              onClick={() => {
                setMode('single');
                setMandal('');
                setState('');
                setCount(1000);
              }}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                mode === 'single'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
            >
              Single Assignment
            </button>
            <button
              onClick={() => {
                setMode('remove');
                setSelectedUserId('');
                setSelectedLeadId('');
                setLeadSearch('');
                setSearchResults([]);
              }}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                mode === 'remove'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
            >
              Remove Assignment
            </button>
          </nav>
        </div>

        <div className="p-6">
          {mode === 'remove' ? (
            <form onSubmit={handleRemoveAssignments} className="space-y-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Select User to Remove Assignments From *
                </label>
                <select
                  className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                  value={removeUserId}
                  onChange={(event) => setRemoveUserId(event.target.value)}
                  required
                >
                  <option value="">Choose a user…</option>
                  {usersByRole['Sub Super Admin'].length > 0 && (
                    <optgroup label="Sub Super Admins">
                      {usersByRole['Sub Super Admin'].map((user) => (
                        <option key={user._id} value={user._id}>
                          {user.name} ({user.email}) - Sub Admin
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {usersByRole.User.length > 0 && (
                    <optgroup label="Users">
                      {usersByRole.User.map((user) => (
                        <option key={user._id} value={user._id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {usersByRole['Student Counselor'].length > 0 && (
                    <optgroup label="Student Counselors">
                      {usersByRole['Student Counselor'].map((user) => (
                        <option key={user._id} value={user._id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {usersByRole['Data Entry User'].length > 0 && (
                    <optgroup label="Data Entry Users">
                      {usersByRole['Data Entry User'].map((user) => (
                        <option key={user._id} value={user._id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Leads currently assigned to this user will become unassigned (pool).
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Academic Year (optional)
                </label>
                <select
                  className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                  value={removeAcademicYear === '' ? '' : removeAcademicYear}
                  onChange={(event) => setRemoveAcademicYear(event.target.value === '' ? '' : Number(event.target.value))}
                >
                  <option value="">All years</option>
                  {academicYearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Filter by academic year; leave as &quot;All years&quot; to remove from any year.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Mandal (optional)
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={removeMandal}
                    onChange={(event) => setRemoveMandal(event.target.value)}
                  >
                    <option value="">All Mandals</option>
                    {filters?.mandals?.map((mandalOption) => (
                      <option key={mandalOption} value={mandalOption}>
                        {mandalOption}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    State (optional)
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={removeState}
                    onChange={(event) => setRemoveState(event.target.value)}
                  >
                    <option value="">All States</option>
                    {filters?.states?.map((stateOption) => (
                      <option key={stateOption} value={stateOption}>
                        {stateOption}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Number of Leads to Unassign *
                </label>
                <Input
                  type="number"
                  min={1}
                  max={Math.max(assignedToUserCount, 10000)}
                  value={removeCount}
                  onChange={(event) => setRemoveCount(Number(event.target.value))}
                  required
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Assigned to this user: {assignedToUserCount.toLocaleString()} leads
                  {removeAcademicYear !== '' && ` for ${removeAcademicYear}`}
                  {removeMandal && ` in ${removeMandal}`}
                  {removeState && `, ${removeState}`}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  variant="outline"
                  disabled={
                    removeAssignmentsMutation.isPending ||
                    !removeUserId ||
                    removeCount <= 0 ||
                    assignedToUserCount === 0
                  }
                  className="border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-600 dark:text-orange-300 dark:hover:bg-orange-900/20"
                >
                  {removeAssignmentsMutation.isPending ? 'Removing…' : 'Remove Assignments'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRemoveUserId('');
                    setRemoveMandal('');
                    setRemoveState('');
                    setRemoveCount(100);
                  }}
                  disabled={removeAssignmentsMutation.isPending}
                >
                  Reset
                </Button>
              </div>
            </form>
          ) : mode === 'bulk' ? (
            <form onSubmit={handleBulkAssign} className="space-y-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Select User or Sub Admin *
                </label>
                <select
                  className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  required
                >
                  <option value="">Choose a user or sub-admin…</option>
                  {usersByRole['Sub Super Admin'].length > 0 && (
                    <optgroup label="Sub Super Admins">
                      {usersByRole['Sub Super Admin'].map((user) => (
                        <option key={user._id} value={user._id}>
                          {user.name} ({user.email}) - Sub Admin
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {usersByRole.User.length > 0 && (
                    <optgroup label="Users">
                      {usersByRole.User.map((user) => (
                        <option key={user._id} value={user._id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {usersByRole['Student Counselor'].length > 0 && (
                    <optgroup label="Student Counselors">
                      {usersByRole['Student Counselor'].map((user) => (
                        <option key={user._id} value={user._id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {usersByRole['Data Entry User'].length > 0 && (
                    <optgroup label="Data Entry Users">
                      {usersByRole['Data Entry User'].map((user) => (
                        <option key={user._id} value={user._id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Select a user or sub-admin to assign leads to.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Academic Year *
                </label>
                <select
                  className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                  value={academicYear === '' ? '' : academicYear}
                  onChange={(event) => setAcademicYear(event.target.value === '' ? '' : Number(event.target.value))}
                  required
                >
                  <option value="">Select academic year…</option>
                  {academicYearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Only unassigned leads for this academic year will be assigned.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Mandal (optional)
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={mandal}
                    onChange={(event) => setMandal(event.target.value)}
                  >
                    <option value="">All Mandals</option>
                    {filters?.mandals?.map((mandalOption) => (
                      <option key={mandalOption} value={mandalOption}>
                        {mandalOption}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    Filter leads by mandal. Leave blank to assign from all mandals.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    State (optional)
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={state}
                    onChange={(event) => setState(event.target.value)}
                  >
                    <option value="">All States</option>
                    {filters?.states?.map((stateOption) => (
                      <option key={stateOption} value={stateOption}>
                        {stateOption}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    Filter leads by state. Leave blank to assign from all states.
                  </p>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Number of Leads *
                </label>
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                  required
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Number of unassigned leads to assign. Available: {stats?.unassignedCount.toLocaleString() || 0} leads
                  {academicYear !== '' && ` for ${academicYear}`}
                  {mandal && ` in ${mandal}`}
                  {state && `, ${state}`}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={assignMutation.isPending || !selectedUserId || academicYear === ''}>
                  {assignMutation.isPending ? 'Assigning…' : 'Assign Leads'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectedUserId('');
                    setMandal('');
                    setState('');
                    setAcademicYear(2025);
                    setCount(1000);
                  }}
                  disabled={assignMutation.isPending}
                >
                  Reset
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSingleAssign} className="space-y-6">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Select User or Sub Admin *
                </label>
                <select
                  className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  required
                >
                  <option value="">Choose a user or sub-admin…</option>
                  {usersByRole['Sub Super Admin'].length > 0 && (
                    <optgroup label="Sub Super Admins">
                      {usersByRole['Sub Super Admin'].map((user) => (
                        <option key={user._id} value={user._id}>
                          {user.name} ({user.email}) - Sub Admin
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {usersByRole.User.length > 0 && (
                    <optgroup label="Users">
                      {usersByRole.User.map((user) => (
                        <option key={user._id} value={user._id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {usersByRole['Student Counselor'].length > 0 && (
                    <optgroup label="Student Counselors">
                      {usersByRole['Student Counselor'].map((user) => (
                        <option key={user._id} value={user._id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {usersByRole['Data Entry User'].length > 0 && (
                    <optgroup label="Data Entry Users">
                      {usersByRole['Data Entry User'].map((user) => (
                        <option key={user._id} value={user._id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Select a user or sub-admin to assign the lead to.
                </p>
              </div>

              <div className="relative" ref={searchRef}>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Search and Select Lead *
                </label>
                <Input
                  type="text"
                  placeholder="Search by name, phone, email, or enquiry number..."
                  value={leadSearch}
                  onChange={(event) => {
                    setLeadSearch(event.target.value);
                    setSelectedLeadId('');
                  }}
                  onFocus={() => {
                    if (searchResults.length > 0) setShowSearchResults(true);
                  }}
                  required
                />
                {showSearchResults && searchResults.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-300 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                    {searchResults.map((lead) => (
                      <button
                        key={lead._id}
                        type="button"
                        onClick={() => {
                          setSelectedLeadId(lead._id);
                          setLeadSearch(
                            `${lead.name}${lead.enquiryNumber ? ` (${lead.enquiryNumber})` : ''} - ${lead.phone}`
                          );
                          setShowSearchResults(false);
                        }}
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-slate-800 ${
                          selectedLeadId === lead._id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                      >
                        <div className="font-medium text-slate-900 dark:text-slate-100">{lead.name}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400">
                          {lead.phone} {lead.email && `• ${lead.email}`}
                          {lead.enquiryNumber && ` • EN: ${lead.enquiryNumber}`}
                        </div>
                        {lead.assignedTo && (
                          <div className="text-xs text-orange-600 dark:text-orange-400">
                            Already assigned to: {typeof lead.assignedTo === 'object' ? lead.assignedTo.name : 'User'}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {selectedLeadId && (
                  <p className="mt-1 text-xs text-green-600 dark:text-green-400">✓ Lead selected</p>
                )}
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Search for a lead by name, phone number, email, or enquiry number.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button type="submit" disabled={assignMutation.isPending || !selectedUserId || !selectedLeadId}>
                  {assignMutation.isPending ? 'Assigning…' : 'Assign Lead'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectedUserId('');
                    setSelectedLeadId('');
                    setLeadSearch('');
                    setSearchResults([]);
                    setShowSearchResults(false);
                  }}
                  disabled={assignMutation.isPending}
                >
                  Reset
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>

      {/* Additional Statistics */}
      {stats && (stats.mandalBreakdown.length > 0 || stats.stateBreakdown.length > 0) && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {stats.mandalBreakdown.length > 0 && (
            <Card>
              <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                Unassigned Leads by Mandal
              </h3>
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {stats.mandalBreakdown.slice(0, 10).map((item) => (
                  <div key={item.mandal} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 dark:text-slate-300">{item.mandal}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{item.count}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {stats.stateBreakdown.length > 0 && (
            <Card>
              <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                Unassigned Leads by State
              </h3>
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {stats.stateBreakdown.map((item) => (
                  <div key={item.state} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 dark:text-slate-300">{item.state}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{item.count}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
