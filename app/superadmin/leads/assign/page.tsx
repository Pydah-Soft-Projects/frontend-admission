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
import UnassignedLocationPrintView from '@/components/superadmin/UnassignedLocationPrintView';
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
  /** Present when requesting geoBreakdown=district (scoped by state + form filters). */
  districtAssignmentBreakdown?: Array<{ district: string; unassignedCount: number; assignedCount: number }>;
  /** Present when requesting geoBreakdown=mandal (scoped by state + district + form filters). */
  mandalAssignmentBreakdown?: Array<{ mandal: string; unassignedCount: number; assignedCount: number }>;
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
  const [bulkSelectedRole, setBulkSelectedRole] = useState('');
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
  const [statsCycleNumber, setStatsCycleNumber] = useState<number | ''>('');
  const [debouncedStatsState, setDebouncedStatsState] = useState('');
  const [debouncedStatsDistrict, setDebouncedStatsDistrict] = useState('');
  const [debouncedStatsMandal, setDebouncedStatsMandal] = useState('');
  const [debouncedStatsAcademicYear, setDebouncedStatsAcademicYear] = useState<number | ''>('');
  const [debouncedStatsStudentGroup, setDebouncedStatsStudentGroup] = useState('');
  const [debouncedStatsCycleNumber, setDebouncedStatsCycleNumber] = useState<number | ''>('');
  const [statsLocationDistricts, setStatsLocationDistricts] = useState<LocationOption[]>([]);
  const [statsLocationMandals, setStatsLocationMandals] = useState<LocationOption[]>([]);
  const [academicYear, setAcademicYear] = useState<number | ''>(2026);
  const [studentGroup, setStudentGroup] = useState<string>('');
  const [count, setCount] = useState(1000);
  const [targetDate, setTargetDate] = useState<string>('');
  const [cycleNumber, setCycleNumber] = useState<number | ''>('');
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
  const [removeCycleNumber, setRemoveCycleNumber] = useState<number | ''>('');
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
  const printStatsRef = useRef<HTMLDivElement>(null);
  const isPrintingRef = useRef(false);

  // Institution-wise (school/college) allocation state
  const [institutionStudentGroup, setInstitutionStudentGroup] = useState<string>('');
  const [institutionName, setInstitutionName] = useState<string>('');
  const [institutionAcademicYear, setInstitutionAcademicYear] = useState<number | ''>(2026);
  const [institutionUserId, setInstitutionUserId] = useState<string>('');
  const [institutionCount, setInstitutionCount] = useState(1000);
  const [institutionTargetDate, setInstitutionTargetDate] = useState('');
  const [singleAssignTargetDate, setSingleAssignTargetDate] = useState('');
  const [institutionCycleNumber, setInstitutionCycleNumber] = useState<number | ''>('');

  // Export Confirmation State
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportData, setExportData] = useState<any[]>([]);
  const [exportFileName, setExportFileName] = useState('');
  /** Backend sends targetRole; PRO exports include district, mandal, village, full address */
  const [exportTargetRole, setExportTargetRole] = useState<string | null>(null);

  const handleConfirmExport = () => {
    try {
      if (exportData.length === 0) return;

      const isProExport = String(exportTargetRole || '').trim().toUpperCase() === 'PRO';

      const dataToExport = exportData.map((lead: any) => {
        if (isProExport) {
          return {
            'Lead Name': lead.name ?? '',
            'Phone Number': lead.phone ?? '',
            District: lead.district ?? '',
            Mandal: lead.mandal ?? '',
            Village: lead.village ?? '',
            'Full Address': lead.address ?? '',
            Remarks: lead.remarks || '',
          };
        }
        return {
          'Lead Name': lead.name ?? '',
          'Phone Number': lead.phone ?? '',
          Remarks: lead.remarks || '',
        };
      });

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
      setExportTargetRole(null);
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
          userAPI.getAssignable(),
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

  // Location context: Stats tab uses its own dropdowns; bulk/remove use bulk/remove forms; institution tab has no geo (summary uses year / group / cycle only).
  useEffect(() => {
    if (mode !== 'stats') return;
    const t = setTimeout(() => {
      setDebouncedStatsState(statsState);
      setDebouncedStatsDistrict(statsDistrict);
      setDebouncedStatsMandal(statsMandal);
      setDebouncedStatsAcademicYear(statsAcademicYear);
      setDebouncedStatsStudentGroup(statsStudentGroup);
      setDebouncedStatsCycleNumber(statsCycleNumber);
    }, 300);
    return () => clearTimeout(t);
  }, [mode, statsState, statsDistrict, statsMandal, statsAcademicYear, statsStudentGroup, statsCycleNumber]);

  const statsQueryState = mode === 'stats' ? debouncedStatsState : mode === 'institution' ? '' : state;
  const statsQueryDistrict = mode === 'stats' ? debouncedStatsDistrict : mode === 'institution' ? '' : district;
  const statsQueryMandal = mode === 'stats' ? debouncedStatsMandal : mode === 'institution' ? '' : mandal;

  // Top stats: bulk tab uses the bulk form filters; stats tab uses debounced stats filters; institution tab uses year / student group / cycle only (no state/district/mandal).
  const statsQueryAcademicYear =
    mode === 'institution' ? institutionAcademicYear : mode === 'bulk' ? academicYear : debouncedStatsAcademicYear;
  const statsQueryStudentGroup =
    mode === 'institution' ? institutionStudentGroup : mode === 'bulk' ? studentGroup : debouncedStatsStudentGroup;
  const statsQueryCycleNumber =
    mode === 'institution' ? institutionCycleNumber : mode === 'bulk' ? cycleNumber : debouncedStatsCycleNumber;

  // Fetch assignment statistics (scoped by academic year, student group, and location)
  const activeUserId = mode === 'institution' ? institutionUserId : selectedUserId;
  const targetUser = users.find(u => (u.id || u._id) === activeUserId);
  const targetRole = targetUser?.roleName?.trim().toUpperCase();

  const {
    data: statsData,
    refetch: refetchStats,
    isLoading: isStatsLoading,
    isFetching: isStatsFetching
  } = useQuery<{ data: AssignmentStats }>({
    queryKey: ['assignmentStats', mode, statsQueryMandal, statsQueryDistrict, statsQueryState, statsQueryAcademicYear, statsQueryStudentGroup, statsQueryCycleNumber, targetRole],
    queryFn: async () => {
      const response = await leadAPI.getAssignmentStats({
        mandal: statsQueryMandal || undefined,
        district: statsQueryDistrict || undefined,
        state: statsQueryState || undefined,
        academicYear: statsQueryAcademicYear !== '' ? statsQueryAcademicYear : undefined,
        studentGroup: statsQueryStudentGroup || undefined,
        cycleNumber: statsQueryCycleNumber !== '' ? statsQueryCycleNumber : undefined,
        targetRole: targetRole || undefined,
        includeBreakdowns: mode === 'stats',
        summaryOnly: mode === 'stats',
      });
      // Backend returns { success, data: { totalLeads, assignedCount, ... }, message }
      const payload = response?.data ?? response ?? {};
      return { data: payload };
    },
    enabled:
      isReady &&
      !!currentUser &&
      mode !== 'remove' &&
      !(mode === 'bulk' && academicYear === '') &&
      !(mode === 'institution' && institutionAcademicYear === ''),
    staleTime: 20_000,
    refetchOnWindowFocus: false,
  });

  const stats = statsData?.data;

  const { data: statsBreakdownsData, isFetching: isBreakdownsFetching } = useQuery<{ data: AssignmentStats }>({
    queryKey: ['assignmentStatsBreakdowns', statsQueryMandal, statsQueryDistrict, statsQueryState, statsQueryAcademicYear, statsQueryStudentGroup, statsQueryCycleNumber, targetRole],
    queryFn: async () => {
      const response = await leadAPI.getAssignmentStats({
        mandal: statsQueryMandal || undefined,
        district: statsQueryDistrict || undefined,
        state: statsQueryState || undefined,
        academicYear: statsQueryAcademicYear !== '' ? statsQueryAcademicYear : undefined,
        studentGroup: statsQueryStudentGroup || undefined,
        cycleNumber: statsQueryCycleNumber !== '' ? statsQueryCycleNumber : undefined,
        targetRole: targetRole || undefined,
        includeBreakdowns: true,
      });
      const payload = response?.data ?? response ?? {};
      return { data: payload };
    },
    enabled: isReady && !!currentUser && mode === 'stats',
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const statsBreakdowns = statsBreakdownsData?.data;
  const mergedStats = stats
    ? {
      ...stats,
      stateBreakdown: statsBreakdowns?.stateBreakdown ?? stats.stateBreakdown ?? [],
      mandalBreakdown: statsBreakdowns?.mandalBreakdown ?? stats.mandalBreakdown ?? [],
    }
    : undefined;

  const { data: districtGeoStatsRaw, isFetching: isDistrictGeoFetching } = useQuery({
    queryKey: ['assignmentStatsGeo', 'district', mode, statsQueryState, statsQueryAcademicYear, statsQueryStudentGroup, statsQueryCycleNumber, targetRole],
    queryFn: async () => {
      const response = await leadAPI.getAssignmentStats({
        academicYear: statsQueryAcademicYear !== '' ? statsQueryAcademicYear : undefined,
        studentGroup: statsQueryStudentGroup || undefined,
        cycleNumber: statsQueryCycleNumber !== '' ? statsQueryCycleNumber : undefined,
        state: statsQueryState || undefined,
        geoBreakdown: 'district',
        targetRole: targetRole || undefined,
        includeBreakdowns: false,
      });
      const payload = (response?.data ?? response) as AssignmentStats;
      return payload;
    },
    enabled:
      isReady &&
      !!currentUser &&
      (mode === 'bulk' || mode === 'stats') &&
      !!statsQueryState &&
      !(mode === 'bulk' && academicYear === ''),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: mandalGeoStatsRaw, isFetching: isMandalGeoFetching } = useQuery({
    queryKey: ['assignmentStatsGeo', 'mandal', mode, statsQueryState, statsQueryDistrict, statsQueryAcademicYear, statsQueryStudentGroup, statsQueryCycleNumber, targetRole],
    queryFn: async () => {
      const response = await leadAPI.getAssignmentStats({
        academicYear: statsQueryAcademicYear !== '' ? statsQueryAcademicYear : undefined,
        studentGroup: statsQueryStudentGroup || undefined,
        cycleNumber: statsQueryCycleNumber !== '' ? statsQueryCycleNumber : undefined,
        state: statsQueryState || undefined,
        district: statsQueryDistrict || undefined,
        geoBreakdown: 'mandal',
        targetRole: targetRole || undefined,
        includeBreakdowns: false,
      });
      const payload = (response?.data ?? response) as AssignmentStats;
      return payload;
    },
    enabled:
      isReady &&
      !!currentUser &&
      (mode === 'bulk' || mode === 'stats') &&
      !!statsQueryState &&
      !!statsQueryDistrict &&
      !(mode === 'bulk' && academicYear === ''),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const districtAssignmentRows = useMemo(
    () =>
      (districtGeoStatsRaw?.districtAssignmentBreakdown || []).map((row) => ({
        label: row.district,
        unassignedCount: row.unassignedCount,
        assignedCount: row.assignedCount,
      })),
    [districtGeoStatsRaw]
  );

  const mandalAssignmentRows = useMemo(
    () =>
      (mandalGeoStatsRaw?.mandalAssignmentBreakdown || []).map((row) => ({
        label: row.mandal,
        unassignedCount: row.unassignedCount,
        assignedCount: row.assignedCount,
      })),
    [mandalGeoStatsRaw]
  );

  const handlePrintUnassignedStats = () => {
    if (isPrintingRef.current) return;
    const node = printStatsRef.current;
    if (!node) {
      showToast.error('Nothing to print yet.');
      return;
    }
    isPrintingRef.current = true;
    const printWindow = window.open('', 'unassigned-location-report', 'width=1000,height=800');
    if (!printWindow) {
      isPrintingRef.current = false;
      showToast.error('Popup blocked. Please allow popups and try again.');
      return;
    }
    printWindow.document.open();
    printWindow.document.write(`
      <html>
        <head>
          <title>Unassigned By Location Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 16px; }
            @page { size: A4 portrait; margin: 12mm; }
          </style>
        </head>
        <body>${node.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      // Release lock shortly after invoking print to avoid duplicate windows.
      setTimeout(() => {
        isPrintingRef.current = false;
      }, 500);
    }, 200);
  };

  const districtCountByName = useMemo(() => {
    const m = new Map<string, { u: number; a: number }>();
    for (const row of districtGeoStatsRaw?.districtAssignmentBreakdown || []) {
      const k = String(row.district || '').trim().toLowerCase();
      m.set(k, { u: row.unassignedCount, a: row.assignedCount });
    }
    return m;
  }, [districtGeoStatsRaw]);

  const mandalCountByName = useMemo(() => {
    const m = new Map<string, { u: number; a: number }>();
    for (const row of mandalGeoStatsRaw?.mandalAssignmentBreakdown || []) {
      const k = String(row.mandal || '').trim().toLowerCase();
      m.set(k, { u: row.unassignedCount, a: row.assignedCount });
    }
    return m;
  }, [mandalGeoStatsRaw]);

  // Institution-wise: use schools for 10th, colleges for Inter/Degree etc.
  const institutionUseSchools = institutionStudentGroup === '10th';
  const institutionForBreakdown = institutionUseSchools ? 'school' : 'college';

  // Fetch institution breakdown (school or college wise unassigned counts) when in institution mode
  const { data: institutionStatsData, refetch: refetchInstitutionStats, isFetching: isInstitutionStatsFetching } =
    useQuery<{ data: AssignmentStats }>({
      queryKey: [
        'assignmentStatsInstitution',
        institutionAcademicYear,
        institutionStudentGroup,
        institutionForBreakdown,
        institutionCycleNumber,
        targetRole,
      ],
      queryFn: async () => {
        const response = await leadAPI.getAssignmentStats({
          academicYear: institutionAcademicYear !== '' ? institutionAcademicYear : undefined,
          studentGroup: institutionStudentGroup || undefined,
          forBreakdown: institutionForBreakdown,
          targetRole: targetRole || undefined,
          includeBreakdowns: false,
          cycleNumber: institutionCycleNumber !== '' ? institutionCycleNumber : undefined,
        });
        const payload = response?.data ?? response ?? {};
        return { data: payload };
      },
      enabled:
        isReady &&
        !!currentUser &&
        mode === 'institution' &&
        !!institutionStudentGroup &&
        institutionAcademicYear !== '',
      staleTime: 20_000,
      refetchOnWindowFocus: false,
    });
  const institutionStats = institutionStatsData?.data;

  const institutionDropdownOptions = useMemo(() => {
    const rows = institutionStats?.institutionBreakdown || [];
    return [...rows].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [institutionStats?.institutionBreakdown]);

  const institutionUnassignedByNameNorm = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of institutionStats?.institutionBreakdown || []) {
      const k = String(row.name || '').trim().toLowerCase();
      if (k) m.set(k, Number(row.count) || 0);
    }
    return m;
  }, [institutionStats?.institutionBreakdown]);

  const selectedInstitutionUnassigned = useMemo(() => {
    const k = String(institutionName || '').trim().toLowerCase();
    if (!k) return 0;
    return institutionUnassignedByNameNorm.get(k) ?? 0;
  }, [institutionName, institutionUnassignedByNameNorm]);

  // Assigned count for selected user (remove tab only — drives top cards there)
  const {
    data: assignedCountData,
    isLoading: isRemoveUserCountLoading,
    isFetching: isRemoveUserCountFetching,
    isError: isRemoveUserCountError,
  } = useQuery<{ data: { count: number } }>({
    queryKey: ['assignedCountForUser', removeUserId, removeMandal, removeDistrict, removeState, removeAcademicYear, removeStudentGroup, removeCycleNumber],
    queryFn: async () => {
      if (!removeUserId) return { data: { count: 0 } };
      const { count } = await leadAPI.getAssignedCountForUser({
        userId: removeUserId,
        mandal: removeMandal || undefined,
        district: removeDistrict || undefined,
        state: removeState || undefined,
        academicYear: removeAcademicYear !== '' ? removeAcademicYear : undefined,
        studentGroup: removeStudentGroup || undefined,
        cycleNumber: removeCycleNumber !== '' ? removeCycleNumber : undefined,
      });
      return { data: { count } };
    },
    enabled: isReady && mode === 'remove' && !!removeUserId,
    staleTime: 0,
    gcTime: 5 * 60 * 1000,
  });
  const assignedToUserCount = assignedCountData?.data?.count ?? 0;
  const removeUserIdNorm = removeUserId.trim().toLowerCase();
  const removeTargetUser = users.find(
    (u) => String(u.id || u._id || '').trim().toLowerCase() === removeUserIdNorm
  );
  const removeTargetRoleLabel = removeTargetUser?.roleName?.trim() || 'User';

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
      district?: string;
      state?: string;
      academicYear?: number | string;
      studentGroup?: string;
      count?: number;
      leadIds?: string[];
      institutionName?: string;
      targetDate?: string;
      cycleNumber?: number | string;
    }) => leadAPI.assignLeads(payload),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['assignmentStats'] });
      queryClient.invalidateQueries({ queryKey: ['assignmentStatsGeo'] });
      queryClient.invalidateQueries({ queryKey: ['assignmentStatsInstitution'] });
      queryClient.invalidateQueries({ queryKey: ['assignmentStatsBreakdowns'] });
      refetchStats();
      refetchInstitutionStats();
      const assignedCount = response.data?.assigned || response.assigned || 0;
      const userName = response.data?.userName || 'user';
      showToast.success(`Successfully assigned ${assignedCount} lead${assignedCount !== 1 ? 's' : ''} to ${userName}`);

      // Auto-export assigned leads to Excel (Ask for confirmation first)
      const assignedLeads = response.data?.assignedLeads || response.assignedLeads || [];
      if (assignedLeads.length > 0) {
        setExportData(assignedLeads);
        setExportTargetRole(
          (response.data?.targetRole ?? response.targetRole ?? null) as string | null
        );
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
        setAcademicYear(2026);
        setCycleNumber('');
        setTargetDate('');
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
      district?: string;
      state?: string;
      academicYear?: number | string;
      studentGroup?: string;
      cycleNumber?: number | string;
      count: number;
    }) => leadAPI.removeAssignments(payload),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['assignmentStats'] });
      queryClient.invalidateQueries({ queryKey: ['assignedCountForUser'] });
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
      setRemoveCycleNumber('');
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
    if (!targetDate || !String(targetDate).trim()) {
      showToast.error('Target date is required (used for automated reclaim).');
      return;
    }

    assignMutation.mutate({
      userId: selectedUserId,
      mandal: mandal || undefined,
      district: district || undefined,
      state: state || undefined,
      academicYear,
      studentGroup: studentGroup || undefined,
      targetDate: targetDate.trim(),
      cycleNumber: cycleNumber !== '' ? cycleNumber : undefined,
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
    if (!singleAssignTargetDate || !String(singleAssignTargetDate).trim()) {
      showToast.error('Target date is required (used for automated reclaim).');
      return;
    }

    assignMutation.mutate({
      userId: selectedUserId,
      leadIds: [selectedLeadId],
      targetDate: singleAssignTargetDate.trim(),
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
    if (!institutionTargetDate || !String(institutionTargetDate).trim()) {
      showToast.error('Target date is required (used for automated reclaim).');
      return;
    }

    assignMutation.mutate({
      userId: institutionUserId,
      academicYear: institutionAcademicYear,
      studentGroup: institutionStudentGroup,
      institutionName: institutionName.trim(),
      count: institutionCount,
      targetDate: institutionTargetDate.trim(),
      cycleNumber: institutionCycleNumber !== '' ? institutionCycleNumber : undefined,
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
      district: removeDistrict || undefined,
      state: removeState || undefined,
      academicYear: removeAcademicYear !== '' ? removeAcademicYear : undefined,
      studentGroup: removeStudentGroup || undefined,
      cycleNumber: removeCycleNumber !== '' ? removeCycleNumber : undefined,
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

  // Filter users: include Users, Student Counselors, Data Entry Users, Sub Super Admins (exclude Super Admin)
  const { assignableUsers, usersByRole } = useMemo(() => {
    const assignable = users.filter(
      (u) =>
        u.isActive &&
        u.roleName !== 'Super Admin' &&
        ['Student Counselor', 'Data Entry User', 'Sub Super Admin', 'PRO'].includes(u.roleName)
    );

    const byRole = {
      'Sub Super Admin': assignable.filter((u) => u.roleName === 'Sub Super Admin'),
      'Student Counselor': assignable.filter((u) => u.roleName === 'Student Counselor'),
      'Data Entry User': assignable.filter((u) => u.roleName === 'Data Entry User'),
      'PRO': assignable.filter((u) => u.roleName === 'PRO'),
    };

    return { assignableUsers: assignable, usersByRole: byRole };
  }, [users]);

  const bulkRoleOptions = useMemo(
    () => ['Sub Super Admin', 'Student Counselor', 'Data Entry User', 'PRO'],
    []
  );

  const bulkUsersBySelectedRole = useMemo(() => {
    if (!bulkSelectedRole) return [];
    return usersByRole[bulkSelectedRole as keyof typeof usersByRole] || [];
  }, [bulkSelectedRole, usersByRole]);

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


  return (
    <div className="mx-auto w-full space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">Assign Leads</h1>
          {/* <p className="text-sm text-slate-500 dark:text-slate-400">
            Distribute leads to counsellors and sub-admins.
          </p> */}
        </div>
        <div className="md:ml-auto">
          <div className="rounded-xl border border-[#e2e8f0] bg-white/80 p-1 dark:border-[#334155] dark:bg-slate-900/60">
            <nav className="flex flex-wrap items-center gap-1" aria-label="Tabs">
              <button
                onClick={() => {
                  setMode('bulk');
                  setSelectedLeadId('');
                  setLeadSearch('');
                  setSearchResults([]);
                }}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${mode === 'bulk'
                  ? 'bg-[#f97316] text-white'
                  : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#334155] dark:text-[#94a3b8] dark:hover:bg-[#1e293b] dark:hover:text-[#cbd5e1]'
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
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${mode === 'single'
                  ? 'bg-[#f97316] text-white'
                  : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#334155] dark:text-[#94a3b8] dark:hover:bg-[#1e293b] dark:hover:text-[#cbd5e1]'
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
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${mode === 'remove'
                  ? 'bg-[#f97316] text-white'
                  : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#334155] dark:text-[#94a3b8] dark:hover:bg-[#1e293b] dark:hover:text-[#cbd5e1]'
                  }`}
              >
                Remove Assignment
              </button>
              <button
                onClick={() => {
                  setMode('institution');
                  setInstitutionName('');
                }}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${mode === 'institution'
                  ? 'bg-[#f97316] text-white'
                  : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#334155] dark:text-[#94a3b8] dark:hover:bg-[#1e293b] dark:hover:text-[#cbd5e1]'
                  }`}
              >
                School/College wise
              </button>
              <button
                onClick={() => setMode('stats')}
                className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${mode === 'stats'
                  ? 'bg-[#f97316] text-white'
                  : 'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#334155] dark:text-[#94a3b8] dark:hover:bg-[#1e293b] dark:hover:text-[#cbd5e1]'
                  }`}
              >
                Unassigned by Location
              </button>
            </nav>
          </div>
        </div>
      </div>

      {/* Statistics Cards — Remove tab: only the user selected below + filters in that form (not global header totals) */}
      {mode === 'remove' ? (
        !removeUserId ? (
          <Card className="border border-dashed border-slate-300 bg-slate-50/80 p-5 dark:border-slate-600 dark:bg-slate-900/40">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Remove Assignment</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Choose a user in the tab below. The summary cards will show how many leads are assigned to them for the filters you set there (academic year, group, cycle, location).
            </p>
          </Card>
        ) : isRemoveUserCountLoading || isRemoveUserCountFetching ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 space-y-2">
                <Skeleton variant="text" width="40%" height="20px" />
                <Skeleton variant="text" width="60%" height="32px" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="p-3 bg-[#3b82f6] text-[#ffffff] border-none shadow-md dark:bg-[#2563eb]">
              <div className="text-sm font-medium text-[#f1f5f9]">Selected user</div>
              <div className="mt-1 text-lg font-bold leading-tight text-[#ffffff]">{removeTargetUser?.name ?? '—'}</div>
              <div className="mt-1 text-xs text-[#e2e8f0]">{removeTargetUser?.email ?? ''}</div>
              {!removeTargetUser && removeUserId ? (
                <div className="mt-2 text-xs text-amber-200">User id does not match the loaded list — try refreshing the page.</div>
              ) : null}
            </Card>
            <Card className="p-3 bg-[#10b981] text-[#ffffff] border-none shadow-md dark:bg-[#059669]">
              <div className="text-sm font-medium text-[#f1f5f9]">Assigned (matches tab filters)</div>
              <div className="mt-1 text-xl font-bold text-[#ffffff]">
                {isRemoveUserCountError ? '—' : assignedToUserCount.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-[#d1fae5]">
                {isRemoveUserCountError
                  ? 'Could not load count. Check network or try again.'
                  : 'Maximum you can remove in one action (subject to the count you enter).'}
              </div>
            </Card>
            <Card className="p-3 bg-[#f97316] text-[#ffffff] border-none shadow-md dark:bg-[#ea580c]">
              <div className="text-sm font-medium text-[#f1f5f9]">Role</div>
              <div className="mt-1 text-xl font-bold text-[#ffffff]">{removeTargetRoleLabel}</div>
              <div className="mt-1 text-xs text-[#ffedd5]">
                {removeTargetRoleLabel === 'PRO' ? 'Uses PRO assignment field.' : 'Uses counsellor assignment field.'}
              </div>
            </Card>
          </div>
        )
      ) : (isStatsLoading || isStatsFetching) ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 space-y-2">
              <Skeleton variant="text" width="40%" height="20px" />
              <Skeleton variant="text" width="60%" height="32px" />
            </Card>
          ))}
        </div>
      ) : mergedStats ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="p-3 bg-[#3b82f6] text-[#ffffff] border-none shadow-md dark:bg-[#2563eb]">
            <div className="text-sm font-medium text-[#f1f5f9]">Total Leads</div>
            <div className="mt-1 text-xl font-bold text-[#ffffff]">{mergedStats.totalLeads.toLocaleString()}</div>
          </Card>
          <Card className="p-3 bg-[#10b981] text-[#ffffff] border-none shadow-md dark:bg-[#059669]">
            <div className="text-sm font-medium text-[#f1f5f9]">{targetRole === 'PRO' ? 'Assigned to PROs' : 'Assigned Leads'}</div>
            <div className="mt-1 text-xl font-bold text-[#ffffff]">{mergedStats.assignedCount.toLocaleString()}</div>
          </Card>
          <Card className="p-3 bg-[#f97316] text-[#ffffff] border-none shadow-md dark:bg-[#ea580c]">
            <div className="text-sm font-medium text-[#f1f5f9]">{targetRole === 'PRO' ? 'Available for Assignment' : 'Unassigned Leads'}</div>
            <div className="mt-1 text-xl font-bold text-[#ffffff]">{mergedStats.unassignedCount.toLocaleString()}</div>
          </Card>
        </div>
      ) : null}

      <div>
        <div className="p-6">
          {mode === 'stats' ? (
            <div className="space-y-6">
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Unassigned leads breakdown by <strong>State</strong> and <strong>Mandal</strong>. Use the filters below to scope the counts.
              </p>
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={handlePrintUnassignedStats} disabled={!stats}>
                  Print / Save PDF
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Academic year</label>
                  <select
                    value={statsAcademicYear === '' ? '' : statsAcademicYear}
                    onChange={(e) => setStatsAcademicYear(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">All years</option>
                    {filterAcademicYearOptions.map((y: number) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Student group</label>
                  <select
                    value={statsStudentGroup}
                    onChange={(e) => setStatsStudentGroup(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">All</option>
                    {studentGroupOptions.map((g: string) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Cycle</label>
                  <select
                    value={statsCycleNumber === '' ? '' : statsCycleNumber}
                    onChange={(e) => setStatsCycleNumber(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <option value="">All cycles</option>
                    {[1, 2, 3, 4, 5].map((c) => (
                      <option key={c} value={c}>
                        Cycle {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
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
              {mergedStats ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  {isStatsFetching || isBreakdownsFetching ? (
                    <Card className="p-6">
                      <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Unassigned Leads by State
                      </h3>
                      <div className="space-y-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={`state-loading-${i}`} className="flex items-center justify-between">
                            <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                            <div className="h-4 w-14 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                          </div>
                        ))}
                      </div>
                    </Card>
                  ) : mergedStats.stateBreakdown.length > 0 ? (
                    <Card>
                      <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Unassigned Leads by State
                      </h3>
                      <div className="max-h-80 space-y-2 overflow-y-auto">
                        {mergedStats.stateBreakdown.map((item) => (
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
                  {isStatsFetching || isBreakdownsFetching ? (
                    <Card className="p-6">
                      <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Unassigned Leads by Mandal
                      </h3>
                      <div className="space-y-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div key={`mandal-loading-${i}`} className="flex items-center justify-between">
                            <div className="h-4 w-36 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                            <div className="h-4 w-14 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                          </div>
                        ))}
                      </div>
                    </Card>
                  ) : mergedStats.mandalBreakdown.length > 0 ? (
                    <Card>
                      <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                        Unassigned Leads by Mandal
                      </h3>
                      <div className="max-h-80 space-y-2 overflow-y-auto">
                        {mergedStats.mandalBreakdown.map((item) => (
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
              {mergedStats && (
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  Filters applied: Academic year {statsAcademicYear || 'All'}, Student group {statsStudentGroup || 'All'}
                  {statsState ? `, State: ${statsState}` : ''}{statsDistrict ? `, District: ${statsDistrict}` : ''}{statsMandal ? `, Mandal: ${statsMandal}` : ''}.
                  {isBreakdownsFetching ? ' Updating breakdowns…' : ''}
                </p>
              )}
              {mergedStats && (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <Card>
                    <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      District Wise (Assigned vs Unassigned)
                    </h3>
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                      {isDistrictGeoFetching ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <div key={`district-geo-loading-${i}`} className="flex items-center justify-between gap-4 text-sm">
                            <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                            <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                          </div>
                        ))
                      ) : (districtAssignmentRows || []).length > 0 ? (
                        districtAssignmentRows.map((row) => (
                          <div key={`dst-${row.label}`} className="flex items-center justify-between gap-4 text-sm">
                            <span className="text-gray-700 dark:text-slate-300">{row.label}</span>
                            <span className="text-slate-900 dark:text-slate-100">
                              U: {row.unassignedCount.toLocaleString()} | A: {(row.assignedCount || 0).toLocaleString()}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-slate-400">Select a state to view district-wise counts.</p>
                      )}
                    </div>
                  </Card>
                  <Card>
                    <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
                      Mandal Wise (Assigned vs Unassigned)
                    </h3>
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                      {isMandalGeoFetching ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <div key={`mandal-geo-loading-${i}`} className="flex items-center justify-between gap-4 text-sm">
                            <div className="h-4 w-32 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                            <div className="h-4 w-24 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
                          </div>
                        ))
                      ) : (mandalAssignmentRows || []).length > 0 ? (
                        mandalAssignmentRows.map((row) => (
                          <div key={`mnd-${row.label}`} className="flex items-center justify-between gap-4 text-sm">
                            <span className="text-gray-700 dark:text-slate-300">{row.label}</span>
                            <span className="text-slate-900 dark:text-slate-100">
                              U: {row.unassignedCount.toLocaleString()} | A: {(row.assignedCount || 0).toLocaleString()}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-slate-400">Select a district to view mandal-wise counts.</p>
                      )}
                    </div>
                  </Card>
                </div>
              )}
              <div className="hidden">
                <div ref={printStatsRef}>
                  <UnassignedLocationPrintView
                    generatedAt={new Date().toLocaleString()}
                    filters={{
                      academicYear: statsAcademicYear ? String(statsAcademicYear) : 'All',
                      studentGroup: statsStudentGroup || 'All',
                      cycle: statsCycleNumber ? `Cycle ${statsCycleNumber}` : 'All',
                      state: statsState || 'All',
                      district: statsDistrict || 'All',
                      mandal: statsMandal || 'All',
                    }}
                    summary={{
                      totalLeads: mergedStats?.totalLeads || 0,
                      assignedCount: mergedStats?.assignedCount || 0,
                      unassignedCount: mergedStats?.unassignedCount || 0,
                    }}
                    stateBreakdown={(mergedStats?.stateBreakdown || []).map((x) => ({ name: x.state, count: x.count }))}
                    mandalBreakdown={(mergedStats?.mandalBreakdown || []).map((x) => ({ name: x.mandal, count: x.count }))}
                    districtAssignmentBreakdown={districtAssignmentRows}
                    mandalAssignmentBreakdown={mandalAssignmentRows}
                  />
                </div>
              </div>
            </div>
          ) : mode === 'institution' ? (
            <form onSubmit={handleInstitutionAssign} className="space-y-6">
              <p className="text-sm text-gray-600 dark:text-slate-400">
                Filter by academic year, student group, and cycle, then pick a <strong>{institutionUseSchools ? 'school' : 'college'}</strong> with{' '}
                {targetRole === 'PRO' ? 'available' : 'unassigned'} leads in that scope (10th = schools; other groups = colleges). The list comes from the
                server for those filters, not the full master catalog.
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
                    {institutionStudentGroup === '10th' ? 'School list.' : institutionStudentGroup ? 'College list.' : 'Choose a group to load institutions.'}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Academic year *</label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={institutionAcademicYear === '' ? '' : institutionAcademicYear}
                    onChange={(e) => {
                      setInstitutionAcademicYear(e.target.value === '' ? '' : Number(e.target.value));
                      setInstitutionName('');
                    }}
                    required
                  >
                    <option value="">Select year…</option>
                    {academicYearOptions.map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0">
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Cycle (filter leads)
                  </label>
                  <select
                    className="w-full min-w-0 rounded-lg border border-gray-300 bg-white/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={institutionCycleNumber}
                    onChange={(e) => {
                      setInstitutionCycleNumber(e.target.value === '' ? '' : Number(e.target.value));
                      setInstitutionName('');
                    }}
                  >
                    <option value="">All cycles</option>
                    {[1, 2, 3, 4, 5].map((c) => (
                      <option key={c} value={c}>
                        Cycle {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Target date (auto-reclaim) *</label>
                  <Input
                    type="date"
                    value={institutionTargetDate}
                    onChange={(e) => setInstitutionTargetDate(e.target.value)}
                    className="w-full min-w-0 px-3 py-2 text-sm"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    {institutionUseSchools ? 'School' : 'College'} *
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    disabled={!institutionStudentGroup || institutionAcademicYear === ''}
                    required
                  >
                    <option value="">
                      {!institutionStudentGroup || institutionAcademicYear === ''
                        ? 'Select student group and academic year first…'
                        : isInstitutionStatsFetching
                          ? 'Loading institutions…'
                          : institutionDropdownOptions.length === 0
                            ? `No ${institutionUseSchools ? 'schools' : 'colleges'} with matching ${targetRole === 'PRO' ? 'available' : 'unassigned'} leads`
                            : `Select ${institutionUseSchools ? 'school' : 'college'}…`}
                    </option>
                    {institutionDropdownOptions.map((item) => (
                      <option key={item.id || item.name} value={item.name}>
                        {item.name} ({Number(item.count) || 0} {targetRole === 'PRO' ? 'available' : 'unassigned'})
                      </option>
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
                    {Object.entries(usersByRole).map(([role, roleUsers]) => (
                      roleUsers.length > 0 && (
                        <optgroup key={role} label={role === 'Sub Super Admin' ? 'Sub Super Admins' : role + 's'}>
                          {roleUsers.map((user) => (
                            <option key={user.id || user._id} value={user.id || user._id}>
                              {user.name} ({user.email})
                            </option>
                          ))}
                        </optgroup>
                      )
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
                  {targetRole === 'PRO' ? 'Available' : 'Unassigned'} for this {institutionUseSchools ? 'school' : 'college'}: {selectedInstitutionUnassigned.toLocaleString()}
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
                    institutionAcademicYear === '' ||
                    !String(institutionTargetDate).trim()
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
                    setInstitutionTargetDate('');
                    setInstitutionCycleNumber('');
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
                        <option key={user.id || user._id} value={user.id || user._id}>
                          {user.name} ({user.email}) - Sub Admin
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {usersByRole['Student Counselor'].length > 0 && (
                    <optgroup label="Student Counselors">
                      {usersByRole['Student Counselor'].map((user) => (
                        <option key={user.id || user._id} value={user.id || user._id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {usersByRole['Data Entry User'].length > 0 && (
                    <optgroup label="Data Entry Users">
                      {usersByRole['Data Entry User'].map((user) => (
                        <option key={user.id || user._id} value={user.id || user._id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {usersByRole['PRO'].length > 0 && (
                    <optgroup label="PRO Users">
                      {usersByRole['PRO'].map((user) => (
                        <option key={user.id || user._id} value={user.id || user._id}>
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

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Cycle (optional)
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={removeCycleNumber === '' ? '' : removeCycleNumber}
                    onChange={(e) => setRemoveCycleNumber(e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    <option value="">All cycles</option>
                    {[1, 2, 3, 4, 5].map((c) => (
                      <option key={c} value={c}>
                        Cycle {c}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                    Match bulk assignment cycle filter when counting and removing.
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
                  {removeCycleNumber !== '' && `, cycle ${removeCycleNumber}`}
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
                    setRemoveAcademicYear('');
                    setRemoveStudentGroup('');
                    setRemoveCycleNumber('');
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
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Select Role *
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={bulkSelectedRole}
                    onChange={(event) => {
                      setBulkSelectedRole(event.target.value);
                      setSelectedUserId('');
                    }}
                    required
                  >
                    <option value="">Choose role…</option>
                    {bulkRoleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Select User *
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    value={selectedUserId}
                    onChange={(event) => setSelectedUserId(event.target.value)}
                    disabled={!bulkSelectedRole}
                    required
                  >
                    <option value="">
                      {bulkSelectedRole ? 'Choose user…' : 'Select role first…'}
                    </option>
                    {bulkUsersBySelectedRole.map((user) => (
                      <option key={user.id || user._id} value={user.id || user._id}>
                        {user.name} ({user.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
                <div className="min-w-0">
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Academic Year *
                  </label>
                  <select
                    className="w-full min-w-0 rounded-lg border border-gray-300 bg-white/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={academicYear === '' ? '' : academicYear}
                    onChange={(event) => setAcademicYear(event.target.value === '' ? '' : Number(event.target.value))}
                    required
                  >
                    <option value="">Select academic year…</option>
                    {filterAcademicYearOptions.map((y: number) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Student group (optional)
                  </label>
                  <select
                    className="w-full min-w-0 rounded-lg border border-gray-300 bg-white/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
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
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Cycle (Filter Leads)
                  </label>
                  <select
                    className="w-full min-w-0 rounded-lg border border-gray-300 bg-white/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                    value={cycleNumber}
                    onChange={(e) => setCycleNumber(e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    <option value="">All cycles</option>
                    {[1, 2, 3, 4, 5].map((c) => (
                      <option key={c} value={c}>
                        Cycle {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Target date (auto-reclaim) *
                  </label>
                  <Input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full min-w-0 px-3 py-2 text-sm"
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                {targetRole === 'PRO'
                  ? 'Available leads for the selected academic year will be assigned. Summary cards above use these filters on the Bulk tab.'
                  : 'Only unassigned leads for the selected academic year will be assigned. Summary cards above use these filters on the Bulk tab.'}{' '}
                Target date is required: automated reclaim only runs for assigned leads once this date is on or before today (status rules apply). &quot;Assigned&quot; keeps the same cycle; &quot;Not Interested&quot; and &quot;Wrong Data&quot; advance cycle on reclaim.
              </p>

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
                    {locationDistricts.map((d) => {
                      const c = districtCountByName.get(String(d.name).trim().toLowerCase()) ?? { u: 0, a: 0 };
                      return (
                        <option key={d.id || d.name} value={d.name}>
                          {d.name} — Unassigned: {c.u.toLocaleString()}, Assigned: {c.a.toLocaleString()}
                        </option>
                      );
                    })}
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
                    {locationMandals.map((m) => {
                      const c = mandalCountByName.get(String(m.name).trim().toLowerCase()) ?? { u: 0, a: 0 };
                      return (
                        <option key={m.id || m.name} value={m.name}>
                          {m.name} — Unassigned: {c.u.toLocaleString()}, Assigned: {c.a.toLocaleString()}
                        </option>
                      );
                    })}
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
                  Number of {targetRole === 'PRO' ? 'available' : 'unassigned'} leads to assign. Available: {stats?.unassignedCount.toLocaleString() || 0} leads
                  {academicYear !== '' && ` for ${academicYear}`}
                  {studentGroup && `, ${studentGroup}`}
                  {mandal && ` in ${mandal}`}
                  {state && `, ${state}`}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  disabled={
                    assignMutation.isPending ||
                    !selectedUserId ||
                    academicYear === '' ||
                    !String(targetDate).trim()
                  }
                >
                  {assignMutation.isPending ? 'Assigning…' : 'Assign Leads'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectedUserId('');
                    setBulkSelectedRole('');
                    setMandal('');
                    setState('');
                    setDistrict('');
                    setStudentGroup('');
                    setAcademicYear(2026);
                    setCycleNumber('');
                    setTargetDate('');
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
                        <option key={user.id || user._id} value={user.id || user._id}>
                          {user.name} ({user.email}) - Sub Admin
                        </option>
                      ))}
                    </optgroup>
                  )}

                  {usersByRole['Student Counselor'].length > 0 && (
                    <optgroup label="Student Counselors">
                      {usersByRole['Student Counselor'].map((user) => (
                        <option key={user.id || user._id} value={user.id || user._id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {usersByRole['Data Entry User'].length > 0 && (
                    <optgroup label="Data Entry Users">
                      {usersByRole['Data Entry User'].map((user) => (
                        <option key={user.id || user._id} value={user.id || user._id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {usersByRole['PRO'].length > 0 && (
                    <optgroup label="PRO Users">
                      {usersByRole['PRO'].map((user) => (
                        <option key={user.id || user._id} value={user.id || user._id}>
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

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Target date (auto-reclaim) *
                </label>
                <Input
                  type="date"
                  value={singleAssignTargetDate}
                  onChange={(e) => setSingleAssignTargetDate(e.target.value)}
                  className="w-full max-w-xs px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  disabled={
                    assignMutation.isPending ||
                    !selectedUserId ||
                    !selectedLeadId ||
                    !String(singleAssignTargetDate).trim()
                  }
                >
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
                    setSingleAssignTargetDate('');
                  }}
                  disabled={assignMutation.isPending}
                >
                  Reset
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
      <Dialog
        open={showExportDialog}
        onOpenChange={(open) => {
          setShowExportDialog(open);
          if (!open) {
            setExportData([]);
            setExportFileName('');
            setExportTargetRole(null);
          }
        }}
      >
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
    </div >
  );
}
