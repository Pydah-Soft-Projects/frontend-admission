'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { leadAPI, userAPI, locationsAPI } from '@/lib/api';
import { User, FilterOptions, Lead } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/Dialog';
import * as XLSX from 'xlsx';
import { showToast } from '@/lib/toast';

// import { useDashboardHeader } from '@/components/layout/DashboardShell';

type AssignmentMode = 'bulk' | 'single' | 'remove' | 'stats' | 'institution';

interface AssignmentStats {
  totalLeads: number;
  assignedCount: number;
  unassignedCount: number;
  mandalBreakdown: Array<{ mandal: string; count: number }>;
  stateBreakdown: Array<{ state: string; count: number }>;
  institutionBreakdown?: Array<{ id: string; name: string; count: number }>;
}

export default function AssignLeadsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // const { setHeaderContent, clearHeaderContent } = useDashboardHeader();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [mode, setMode] = useState<AssignmentMode>('bulk');
  const [users, setUsers] = useState<User[]>([]);
  const [filters, setFilters] = useState<FilterOptions | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [mandal, setMandal] = useState('');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  /** Academic year for the stats cards and bulk assignment. Default '' = All (matches dashboard). */
  const [statsAcademicYear, setStatsAcademicYear] = useState<number | ''>('');
  const [statsStudentGroup, setStatsStudentGroup] = useState<string>('');
  /** Location filters for the Stats tab (Unassigned by Location) */
  const [statsState, setStatsState] = useState('');
  const [statsDistrict, setStatsDistrict] = useState('');
  const [statsMandal, setStatsMandal] = useState('');
  const [statsLocationDistricts, setStatsLocationDistricts] = useState<LocationOption[]>([]);
  const [statsLocationMandals, setStatsLocationMandals] = useState<LocationOption[]>([]);
  const [academicYear, setAcademicYear] = useState<number | ''>(2025);
  const [studentGroup, setStudentGroup] = useState<string>('');
  const [count, setCount] = useState(1000);
  const [isReady, setIsReady] = useState(false);

  // Location dropdowns (cascade: State → District → Mandal) from locations API
  type LocationOption = { id: string; name: string };
  const [locationStates, setLocationStates] = useState<LocationOption[]>([]);
  const [locationDistricts, setLocationDistricts] = useState<LocationOption[]>([]);
  const [locationMandals, setLocationMandals] = useState<LocationOption[]>([]);

  // Remove assignment state
  const [removeUserId, setRemoveUserId] = useState('');
  const [removeMandal, setRemoveMandal] = useState('');
  const [removeState, setRemoveState] = useState('');
  const [removeDistrict, setRemoveDistrict] = useState('');
  const [removeLocationDistricts, setRemoveLocationDistricts] = useState<LocationOption[]>([]);
  const [removeLocationMandals, setRemoveLocationMandals] = useState<LocationOption[]>([]);
  const [removeAcademicYear, setRemoveAcademicYear] = useState<number | ''>('');
  const [removeStudentGroup, setRemoveStudentGroup] = useState<string>('');
  const [removeCount, setRemoveCount] = useState(100);

  const STUDENT_GROUP_OPTIONS = ['10th', 'Inter', 'Inter-MPC', 'Inter-BIPC', 'Degree', 'Diploma'];
  const studentGroupOptions = filters?.studentGroups?.length ? filters.studentGroups : STUDENT_GROUP_OPTIONS;

  const currentYear = new Date().getFullYear();
  const academicYearOptions = [currentYear, currentYear + 1, currentYear - 1, currentYear - 2].filter(
    (y, i, arr) => arr.indexOf(y) === i
  ).sort((a, b) => b - a);
  const filterAcademicYearOptions = filters?.academicYears?.length
    ? filters.academicYears
    : academicYearOptions;

  // Single assignment state
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [leadSearch, setLeadSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Lead[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Institution-wise (school/college) allocation state
  const [institutionStudentGroup, setInstitutionStudentGroup] = useState<string>('');
  const [institutionName, setInstitutionName] = useState<string>('');
  const [institutionAcademicYear, setInstitutionAcademicYear] = useState<number | ''>(2025);
  const [institutionUserId, setInstitutionUserId] = useState<string>('');
  const [institutionCount, setInstitutionCount] = useState(1000);
  const [schoolsList, setSchoolsList] = useState<{ id: string; name: string }[]>([]);
  const [collegesList, setCollegesList] = useState<{ id: string; name: string }[]>([]);

  // Export Confirmation State
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportData, setExportData] = useState<any[]>([]);
  const [exportFileName, setExportFileName] = useState('');

  const handleConfirmExport = () => {
    try {
      if (exportData.length === 0) return;

      const dataToExport = exportData.map((lead: any) => ({
        'Lead Name': lead.name,
        'Phone Number': lead.phone,
        'Remarks': lead.remarks || '',
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Assigned Leads');
      XLSX.writeFile(workbook, exportFileName || 'Assigned_Leads.xlsx');

      showToast.success('Leads exported successfully');
    } catch (error) {
      console.error('Export failed:', error);
      showToast.error('Failed to export leads');
    } finally {
      setShowExportDialog(false);
      setExportData([]);
      setExportFileName('');
    }
  };

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

        // Normalize filter options: API returns { success, data: { mandals, states, ... }, message }
        const raw = filtersResponse?.data ?? filtersResponse ?? {};
        const options: FilterOptions = {
          mandals: Array.isArray(raw.mandals) ? raw.mandals : [],
          districts: Array.isArray(raw.districts) ? raw.districts : [],
          states: Array.isArray(raw.states) ? raw.states : [],
          quotas: Array.isArray(raw.quotas) ? raw.quotas : [],
          leadStatuses: Array.isArray(raw.leadStatuses) ? raw.leadStatuses : [],
          applicationStatuses: Array.isArray(raw.applicationStatuses) ? raw.applicationStatuses : [],
          academicYears: Array.isArray(raw.academicYears) ? raw.academicYears : [],
          studentGroups: Array.isArray(raw.studentGroups) ? raw.studentGroups : [],
        };

        // Fallback: if no states/mandals from leads (e.g. empty DB), use locations master data
        if (options.states.length === 0 || options.mandals.length === 0) {
          try {
            const statesList = await locationsAPI.listStates();
            const stateNames = Array.isArray(statesList) ? statesList.map((s: { id?: string; name: string }) => s.name) : [];
            if (stateNames.length > 0 && options.states.length === 0) options.states = stateNames;
          } catch {
            // ignore
          }
        }

        setFilters(options);
      } catch (error) {
        console.error('Failed to load assign-leads data:', error);
        showToast.error('Unable to load users or filters.');
      }
    };

    load();
  }, [currentUser]);

  // Load states from locations API (cascade source for State → District → Mandal)
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await locationsAPI.listStates();
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setLocationStates(arr.map((s: { id?: string; name: string }) => ({ id: s.id || '', name: s.name || String(s) })));
      } catch (e) {
        if (!cancelled) console.error('Failed to load states for assign leads:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  // When state (bulk) changes: fetch districts, clear district & mandal
  useEffect(() => {
    if (!state) {
      setLocationDistricts([]);
      setLocationMandals([]);
      setDistrict('');
      setMandal('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await locationsAPI.listDistricts({ stateName: state });
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setLocationDistricts(arr.map((d: { id?: string; name: string }) => ({ id: d.id || '', name: d.name || String(d) })));
        setLocationMandals([]);
        setDistrict('');
        setMandal('');
      } catch (e) {
        if (!cancelled) setLocationDistricts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [state]);

  // When district (bulk) changes: fetch mandals
  useEffect(() => {
    if (!state || !district) {
      setLocationMandals([]);
      setMandal('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await locationsAPI.listMandals({ stateName: state, districtName: district });
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setLocationMandals(arr.map((m: { id?: string; name: string }) => ({ id: m.id || '', name: m.name || String(m) })));
        setMandal('');
      } catch (e) {
        if (!cancelled) setLocationMandals([]);
      }
    })();
    return () => { cancelled = true; };
  }, [state, district]);

  // When removeState changes: fetch remove districts, clear remove district & mandal
  useEffect(() => {
    if (!removeState) {
      setRemoveLocationDistricts([]);
      setRemoveLocationMandals([]);
      setRemoveDistrict('');
      setRemoveMandal('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await locationsAPI.listDistricts({ stateName: removeState });
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setRemoveLocationDistricts(arr.map((d: { id?: string; name: string }) => ({ id: d.id || '', name: d.name || String(d) })));
        setRemoveLocationMandals([]);
        setRemoveDistrict('');
        setRemoveMandal('');
      } catch (e) {
        if (!cancelled) setRemoveLocationDistricts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [removeState]);

  // When removeDistrict changes: fetch remove mandals
  useEffect(() => {
    if (!removeState || !removeDistrict) {
      setRemoveLocationMandals([]);
      setRemoveMandal('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await locationsAPI.listMandals({ stateName: removeState, districtName: removeDistrict });
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setRemoveLocationMandals(arr.map((m: { id?: string; name: string }) => ({ id: m.id || '', name: m.name || String(m) })));
        setRemoveMandal('');
      } catch (e) {
        if (!cancelled) setRemoveLocationMandals([]);
      }
    })();
    return () => { cancelled = true; };
  }, [removeState, removeDistrict]);

  // Stats tab: when statsState changes, load districts and clear district/mandal
  useEffect(() => {
    if (!statsState) {
      setStatsLocationDistricts([]);
      setStatsLocationMandals([]);
      setStatsDistrict('');
      setStatsMandal('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await locationsAPI.listDistricts({ stateName: statsState });
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setStatsLocationDistricts(arr.map((d: { id?: string; name: string }) => ({ id: d.id || '', name: d.name || String(d) })));
        setStatsLocationMandals([]);
        setStatsDistrict('');
        setStatsMandal('');
      } catch {
        if (!cancelled) setStatsLocationDistricts([]);
      }
    })();
    return () => { cancelled = true; };
  }, [statsState]);

  // Stats tab: when statsDistrict changes, load mandals
  useEffect(() => {
    if (!statsState || !statsDistrict) {
      setStatsLocationMandals([]);
      setStatsMandal('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await locationsAPI.listMandals({ stateName: statsState, districtName: statsDistrict });
        if (cancelled) return;
        const arr = Array.isArray(list) ? list : [];
        setStatsLocationMandals(arr.map((m: { id?: string; name: string }) => ({ id: m.id || '', name: m.name || String(m) })));
        setStatsMandal('');
      } catch {
        if (!cancelled) setStatsLocationMandals([]);
      }
    })();
    return () => { cancelled = true; };
  }, [statsState, statsDistrict]);

  // Which location filters to use for stats: stats tab uses its own, others use bulk form's
  const statsQueryState = mode === 'stats' ? statsState : state;
  const statsQueryMandal = mode === 'stats' ? statsMandal : mandal;

  // Fetch assignment statistics (scoped by academic year, student group, and location)
  const {
    data: statsData,
    refetch: refetchStats,
    isLoading: isStatsLoading,
    isFetching: isStatsFetching
  } = useQuery<{ data: AssignmentStats }>({
    queryKey: ['assignmentStats', statsQueryMandal, statsQueryState, statsAcademicYear, statsStudentGroup],
    queryFn: async () => {
      const response = await leadAPI.getAssignmentStats({
        mandal: statsQueryMandal || undefined,
        state: statsQueryState || undefined,
        academicYear: statsAcademicYear !== '' ? statsAcademicYear : undefined,
        studentGroup: statsStudentGroup || undefined,
      });
      // Backend returns { success, data: { totalLeads, assignedCount, ... }, message }
      const payload = response?.data ?? response ?? {};
      return { data: payload };
    },
    enabled: isReady && !!currentUser,
  });

  const stats = statsData?.data;

  // Institution-wise: use schools for 10th, colleges for Inter/Degree etc.
  const institutionUseSchools = institutionStudentGroup === '10th';
  const institutionForBreakdown = institutionUseSchools ? 'school' : 'college';

  // Fetch institution breakdown (school or college wise unassigned counts) when in institution mode
  const { data: institutionStatsData, refetch: refetchInstitutionStats } = useQuery<{ data: AssignmentStats }>({
    queryKey: ['assignmentStatsInstitution', institutionAcademicYear, institutionStudentGroup, institutionForBreakdown],
    queryFn: async () => {
      const response = await leadAPI.getAssignmentStats({
        academicYear: institutionAcademicYear !== '' ? institutionAcademicYear : undefined,
        studentGroup: institutionStudentGroup || undefined,
        forBreakdown: institutionForBreakdown,
      });
      const payload = response?.data ?? response ?? {};
      return { data: payload };
    },
    enabled: isReady && !!currentUser && mode === 'institution' && !!institutionStudentGroup,
  });
  const institutionStats = institutionStatsData?.data;

  // Load schools and colleges for institution dropdowns (when assign page is ready)
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    (async () => {
      try {
        const [schools, colleges] = await Promise.all([
          locationsAPI.listSchools(),
          locationsAPI.listColleges(),
        ]);
        if (cancelled) return;
        setSchoolsList(Array.isArray(schools) ? schools.map((s: { id?: string; name: string }) => ({ id: s.id || '', name: s.name || String(s) })) : []);
        setCollegesList(Array.isArray(colleges) ? colleges.map((c: { id?: string; name: string }) => ({ id: c.id || '', name: c.name || String(c) })) : []);
      } catch (e) {
        if (!cancelled) console.error('Failed to load schools/colleges', e);
      }
    })();
    return () => { cancelled = true; };
  }, [currentUser]);

  // Assigned count for selected user (for remove-assignment tab)
  const { data: assignedCountData } = useQuery<{ data?: { count?: number } }>({
    queryKey: ['assignedCountForUser', removeUserId, removeMandal, removeState, removeAcademicYear, removeStudentGroup],
    queryFn: async () => {
      if (!removeUserId) return { data: { count: 0 } };
      const response = await leadAPI.getAssignedCountForUser({
        userId: removeUserId,
        mandal: removeMandal || undefined,
        state: removeState || undefined,
        academicYear: removeAcademicYear !== '' ? removeAcademicYear : undefined,
        studentGroup: removeStudentGroup || undefined,
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
      studentGroup?: string;
      count?: number;
      leadIds?: string[];
      institutionName?: string;
    }) => leadAPI.assignLeads(payload),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['assignmentStats'] });
      queryClient.invalidateQueries({ queryKey: ['assignmentStatsInstitution'] });
      refetchStats();
      refetchInstitutionStats();
      const assignedCount = response.data?.assigned || response.assigned || 0;
      const userName = response.data?.userName || 'user';
      showToast.success(`Successfully assigned ${assignedCount} lead${assignedCount !== 1 ? 's' : ''} to ${userName}`);

      // Auto-export assigned leads to Excel (Ask for confirmation first)
      const assignedLeads = response.data?.assignedLeads || response.assignedLeads || [];
      if (assignedLeads.length > 0) {
        setExportData(assignedLeads);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        setExportFileName(`Assigned_Leads_${userName}_${timestamp}.xlsx`);
        setShowExportDialog(true);
      }

      // Reset form
      if (mode === 'bulk') {
        setSelectedUserId('');
        setMandal('');
        setState('');
        setDistrict('');
        setStudentGroup('');
        setAcademicYear(2025);
        setCount(1000);
      } else if (mode === 'institution') {
        setInstitutionUserId('');
        setInstitutionName('');
        setInstitutionCount(1000);
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
      studentGroup?: string;
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
      setRemoveDistrict('');
      setRemoveAcademicYear('');
      setRemoveStudentGroup('');
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
      studentGroup: studentGroup || undefined,
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

  const handleInstitutionAssign = (event: React.FormEvent) => {
    event.preventDefault();
    if (!institutionUserId) {
      showToast.error('Please select a user to assign leads to.');
      return;
    }
    if (!institutionStudentGroup) {
      showToast.error('Please select a student group (School or College).');
      return;
    }
    if (!institutionName) {
      showToast.error(`Please select a ${institutionUseSchools ? 'school' : 'college'}.`);
      return;
    }
    if (institutionAcademicYear === '') {
      showToast.error('Please select an academic year.');
      return;
    }
    if (institutionCount <= 0) {
      showToast.error('Count must be greater than zero.');
      return;
    }

    assignMutation.mutate({
      userId: institutionUserId,
      academicYear: institutionAcademicYear,
      studentGroup: institutionStudentGroup,
      institutionName: institutionName.trim(),
      count: institutionCount,
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
      studentGroup: removeStudentGroup || undefined,
      count: removeCount,
    });
  };

  // const header = useMemo(
  //   () => (
  //     <div className="flex flex-col items-end gap-2 text-right">
  //       <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Assign Leads</h1>
  //       <p className="text-sm text-slate-500 dark:text-slate-400">
  //         Distribute leads to counsellors and sub-admins using bulk or single assignment.
  //       </p>
  //     </div>
  //   ),
  //   []
  // );

  // useEffect(() => {
  //   setHeaderContent(header);
  //   return () => clearHeaderContent();
  // }, [header, setHeaderContent, clearHeaderContent]);

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
      (u.roleName === 'Student Counselor' || u.roleName === 'Data Entry User' || u.roleName === 'Sub Super Admin')
  );

  const usersByRole = {
    'Sub Super Admin': assignableUsers.filter((u) => u.roleName === 'Sub Super Admin'),
    'Student Counselor': assignableUsers.filter((u) => u.roleName === 'Student Counselor'),
    'Data Entry User': assignableUsers.filter((u) => u.roleName === 'Data Entry User'),
  };

  return (
    <div className="mx-auto w-full space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Assign Leads</h1>
          {/* <p className="text-sm text-slate-500 dark:text-slate-400">
            Distribute leads to counsellors and sub-admins.
          </p> */}
        </div>

        {/* Academic Year and Student Group filters – aligned to the right */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-slate-200 whitespace-nowrap">
              Academic year:
            </label>
            <select
              value={statsAcademicYear === '' ? '' : statsAcademicYear}
              onChange={(e) => setStatsAcademicYear(e.target.value === '' ? '' : Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">All years</option>
              {filterAcademicYearOptions.map((y: number) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-slate-200 whitespace-nowrap">
              Student group:
            </label>
            <select
              value={statsStudentGroup}
              onChange={(e) => setStatsStudentGroup(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">All</option>
              {studentGroupOptions.map((g: string) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      {/* Show skeleton if fetching or loading. Show real data if available. */}
      {(isStatsLoading || isStatsFetching) ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 space-y-2">
              <Skeleton variant="text" width="40%" height="20px" />
              <Skeleton variant="text" width="60%" height="32px" />
            </Card>
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 text-white border-none shadow-md">
            <div className="text-sm font-medium text-blue-100">Total Leads</div>
            <div className="mt-1 text-2xl font-bold text-white">{stats.totalLeads.toLocaleString()}</div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-none shadow-md">
            <div className="text-sm font-medium text-emerald-100">Assigned Leads</div>
            <div className="mt-1 text-2xl font-bold text-white">{stats.assignedCount.toLocaleString()}</div>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-orange-500 to-amber-600 text-white border-none shadow-md">
            <div className="text-sm font-medium text-orange-100">Unassigned Leads</div>
            <div className="mt-1 text-2xl font-bold text-white">{stats.unassignedCount.toLocaleString()}</div>
          </Card>
        </div>
      ) : null}

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
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${mode === 'bulk'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
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
                setDistrict('');
                setCount(1000);
              }}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${mode === 'single'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
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
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${mode === 'remove'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
            >
              Remove Assignment
            </button>
            <button
              onClick={() => {
                setMode('institution');
                setInstitutionName('');
              }}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${mode === 'institution'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
            >
              School/College wise
            </button>
            <button
              onClick={() => setMode('stats')}
              className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${mode === 'stats'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-300'
                }`}
            >
              Unassigned by Location
            </button>
          </nav>
        </div>

        <div className="p-6">
          {mode === 'stats' ? (
            <div className="space-y-6">
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Unassigned leads breakdown by <strong>State</strong> and <strong>Mandal</strong>. Use the filters below and the Academic year / Student group at the top to scope the counts.
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">State</label>
                  <select
                    value={statsState}
                    onChange={(e) => setStatsState(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">All States</option>
                    {locationStates.map((s) => (
                      <option key={s.id || s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">District</label>
                  <select
                    value={statsDistrict}
                    onChange={(e) => setStatsDistrict(e.target.value)}
                    disabled={!statsState}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 disabled:opacity-50"
                  >
                    <option value="">All Districts</option>
                    {statsLocationDistricts.map((d) => (
                      <option key={d.id || d.name} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Mandal</label>
                  <select
                    value={statsMandal}
                    onChange={(e) => setStatsMandal(e.target.value)}
                    disabled={!statsDistrict}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 disabled:opacity-50"
                  >
                    <option value="">All Mandals</option>
                    {statsLocationMandals.map((m) => (
                      <option key={m.id || m.name} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {stats ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {stats.stateBreakdown.length > 0 ? (
                    <Card>
                      <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Unassigned Leads by State
                      </h3>
                      <div className="max-h-80 space-y-2 overflow-y-auto">
                        {stats.stateBreakdown.map((item) => (
                          <div key={item.state} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700 dark:text-slate-300">{item.state}</span>
                            <span className="font-medium text-slate-900 dark:text-slate-100">{item.count.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ) : (
                    <Card className="p-6">
                      <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">Unassigned by State</h3>
                      <p className="text-sm text-gray-500 dark:text-slate-400">No unassigned leads for the current filters.</p>
                    </Card>
                  )}
                  {stats.mandalBreakdown.length > 0 ? (
                    <Card>
                      <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Unassigned Leads by Mandal
                      </h3>
                      <div className="max-h-80 space-y-2 overflow-y-auto">
                        {stats.mandalBreakdown.map((item) => (
                          <div key={item.mandal} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700 dark:text-slate-300">{item.mandal}</span>
                            <span className="font-medium text-slate-900 dark:text-slate-100">{item.count.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </Card>
                  ) : (
                    <Card className="p-6">
                      <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">Unassigned by Mandal</h3>
                      <p className="text-sm text-gray-500 dark:text-slate-400">No unassigned leads for the current filters.</p>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-300 py-12 dark:border-slate-600">
                  <p className="text-sm text-gray-500 dark:text-slate-400">Loading stats…</p>
                </div>
              )}
              {stats && (
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Filters applied: Academic year {statsAcademicYear || 'All'}, Student group {statsStudentGroup || 'All'}
                  {statsState ? `, State: ${statsState}` : ''}{statsDistrict ? `, District: ${statsDistrict}` : ''}{statsMandal ? `, Mandal: ${statsMandal}` : ''}.
                </p>
              )}
            </div>
          ) : mode === 'institution' ? (
            <form onSubmit={handleInstitutionAssign} className="space-y-6">
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Assign unassigned leads by <strong>school</strong> (10th) or <strong>college</strong> (Inter, Degree, etc.). Select student group first to show the correct list.
              </p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Student group *
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={institutionStudentGroup}
                    onChange={(e) => {
                      setInstitutionStudentGroup(e.target.value);
                      setInstitutionName('');
                    }}
                    required
                  >
                    <option value="">Select group…</option>
                    {studentGroupOptions.map((g: string) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    {institutionStudentGroup === '10th' ? 'Shows schools.' : institutionStudentGroup ? 'Shows colleges.' : '10th = schools, others = colleges.'}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    {institutionUseSchools ? 'School' : 'College'} *
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    disabled={!institutionStudentGroup}
                    required
                  >
                    <option value="">
                      {!institutionStudentGroup ? `Select student group first` : `Select ${institutionUseSchools ? 'school' : 'college'}…`}
                    </option>
                    {(institutionUseSchools ? schoolsList : collegesList).map((item) => (
                      <option key={item.id || item.name} value={item.name}>
                        {item.name}
                        {institutionStats?.institutionBreakdown?.find((b) => b.name === item.name)
                          ? ` (${institutionStats.institutionBreakdown.find((b) => b.name === item.name)?.count ?? 0} unassigned)`
                          : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Academic year *</label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={institutionAcademicYear === '' ? '' : institutionAcademicYear}
                    onChange={(e) => setInstitutionAcademicYear(e.target.value === '' ? '' : Number(e.target.value))}
                    required
                  >
                    <option value="">Select year…</option>
                    {academicYearOptions.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Assign to user *</label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={institutionUserId}
                    onChange={(e) => setInstitutionUserId(e.target.value)}
                    required
                  >
                    <option value="">Choose user…</option>
                    {assignableUsers.map((user) => (
                      <option key={user._id} value={user._id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Number of leads *</label>
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  value={institutionCount}
                  onChange={(e) => setInstitutionCount(Number(e.target.value))}
                  required
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Unassigned for this {institutionUseSchools ? 'school' : 'college'}: {(institutionName && institutionStats?.institutionBreakdown?.find((b) => b.name === institutionName)?.count) ?? 0}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  disabled={
                    assignMutation.isPending ||
                    !institutionUserId ||
                    !institutionStudentGroup ||
                    !institutionName ||
                    institutionAcademicYear === ''
                  }
                >
                  {assignMutation.isPending ? 'Assigning…' : 'Assign by ' + (institutionUseSchools ? 'school' : 'college')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setInstitutionUserId('');
                    setInstitutionName('');
                    setInstitutionCount(1000);
                  }}
                  disabled={assignMutation.isPending}
                >
                  Reset
                </Button>
              </div>
            </form>
          ) : mode === 'remove' ? (
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

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Student group (optional)
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={removeStudentGroup}
                    onChange={(e) => setRemoveStudentGroup(e.target.value)}
                  >
                    <option value="">All</option>
                    {studentGroupOptions.map((g: string) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    State (optional)
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={removeState}
                    onChange={(e) => setRemoveState(e.target.value)}
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
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    District (optional)
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={removeDistrict}
                    onChange={(e) => setRemoveDistrict(e.target.value)}
                    disabled={!removeState}
                  >
                    <option value="">All Districts</option>
                    {removeLocationDistricts.map((d) => (
                      <option key={d.id || d.name} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Mandal (optional)
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={removeMandal}
                    onChange={(e) => setRemoveMandal(e.target.value)}
                    disabled={!removeDistrict}
                  >
                    <option value="">All Mandals</option>
                    {removeLocationMandals.map((m) => (
                      <option key={m.id || m.name} value={m.name}>
                        {m.name}
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
                  {removeStudentGroup && `, ${removeStudentGroup}`}
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
                    setRemoveDistrict('');
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

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Student group (optional)
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={studentGroup}
                    onChange={(e) => setStudentGroup(e.target.value)}
                  >
                    <option value="">All</option>
                    {studentGroupOptions.map((g: string) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    Restrict to a specific student group (e.g. 10th, Inter, Degree).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    State (optional)
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                  >
                    <option value="">All States</option>
                    {locationStates.map((s) => (
                      <option key={s.id || s.name} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    Select state first, then district and mandal.
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    District (optional)
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    disabled={!state}
                  >
                    <option value="">All Districts</option>
                    {locationDistricts.map((d) => (
                      <option key={d.id || d.name} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Mandal (optional)
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={mandal}
                    onChange={(e) => setMandal(e.target.value)}
                    disabled={!district}
                  >
                    <option value="">All Mandals</option>
                    {locationMandals.map((m) => (
                      <option key={m.id || m.name} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    Filter by state → district → mandal. Leave blank for all.
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
                  {studentGroup && `, ${studentGroup}`}
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
                    setDistrict('');
                    setStudentGroup('');
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
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-slate-800 ${selectedLeadId === lead._id ? 'bg-blue-50 dark:bg-blue-900/20' : ''
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
      {/* Export Confirmation Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Assigned Leads?</DialogTitle>
            <DialogDescription>
              Lead assignment was successful. Would you like to download the list of assigned leads as an Excel file?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              No, Skip
            </Button>
            <Button onClick={handleConfirmExport}>
              Yes, Download Excel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Export Confirmation Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Assigned Leads?</DialogTitle>
            <DialogDescription>
              Lead assignment was successful. Would you like to download the list of assigned leads as an Excel file?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              No, Skip
            </Button>
            <Button onClick={handleConfirmExport}>
              Yes, Download Excel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
