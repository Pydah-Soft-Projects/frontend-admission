'use client';

import React, { useState, useEffect, useMemo, Fragment, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { reportAPI, userAPI, leadAPI, locationsAPI } from '@/lib/api';
import { format, subDays, startOfWeek, startOfMonth, endOfMonth, startOfDay, endOfDay } from 'date-fns';
import { exportToExcel, exportToCSV } from '@/lib/export';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton, ReportDashboardSkeleton, LeadsAbstractSkeleton } from '@/components/ui/Skeleton';
import { cn, formatSecondsToMMSS } from '@/lib/utils';
import { showToast } from '@/lib/toast';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { Check, ChevronDown, Download, Filter, FileSpreadsheet, Calendar, Search } from 'lucide-react';

type TabType = 'calls' | 'conversions' | 'users' | 'abstract' | 'activityLogs';

type DatePreset = 'today' | 'yesterday' | 'last7days' | 'last30days' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'custom' | 'overall';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

// Call reports tab: gradient styles for stats cards (user performance & daily top-line metrics)
const CALL_REPORT_CARD_STYLES = [
  'bg-[#3b82f6] shadow-[0_4px_14px_0_rgba(59,130,246,0.39)]',
  'bg-[#10b981] shadow-[0_4px_14px_0_rgba(16,185,129,0.39)]',
  'bg-[#f97316] shadow-[0_4px_14px_0_rgba(249,115,22,0.39)]',
  'bg-[#8b5cf6] shadow-[0_4px_14px_0_rgba(139,92,246,0.39)]',
  'bg-[#f43f5e] shadow-[0_4px_14px_0_rgba(244,63,94,0.35)]',
];

/**
 * Custom Multi-Select Dropdown with Checkboxes for the Export Modal
 */
function MultiSelectDropdown({ 
  label, 
  options, 
  selected, 
  onChange 
}: { 
  label: string; 
  options: string[]; 
  selected: string[]; 
  onChange: (vals: string[]) => void 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter(s => s !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  const isAllSelected = selected.length === options.length && options.length > 0;

  const toggleAll = () => {
    if (isAllSelected) {
      onChange([]);
    } else {
      onChange([...options]);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 min-w-[170px] relative" ref={containerRef}>
      <span className="text-[10px] font-bold text-slate-500 uppercase px-1">{label}</span>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium flex items-center justify-between gap-2 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 min-w-[180px]"
      >
        <span className="flex-1 text-left">
          {selected.length === 0 ? "All" : 
           selected.length === options.length ? "All Selected" : 
           `${selected.length} Selected`}
        </span>
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-full min-w-[200px] max-h-[250px] overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-xl z-50 p-1">
          <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded cursor-pointer border-b border-slate-100 dark:border-slate-700 mb-1">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={toggleAll}
              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 select-none">Select All</span>
          </label>
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded cursor-pointer group">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggleOption(opt)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-xs text-slate-600 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white select-none whitespace-normal">
                {opt}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('calls');
  const [callSubTab, setCallSubTab] = useState<'daily' | 'performance'>('daily');
  const [expandedDailyUsers, setExpandedDailyUsers] = useState<Set<string>>(new Set());
  const [expandedPerformanceUsers, setExpandedPerformanceUsers] = useState<Set<string>>(new Set());
  const [performanceSearch, setPerformanceSearch] = useState('');
  /** Default to Student Counselor so the heavy summary loads a smaller cohort first. */
  const [performanceRole, setPerformanceRole] = useState('Student Counselor');
  const [performanceDepartment, setPerformanceDepartment] = useState('');
  /** Lead `student_group` (MySQL), not HRMS employee group. */
  const [performanceStudentGroup, setPerformanceStudentGroup] = useState('');
  const [performanceDivision, setPerformanceDivision] = useState('');
  const [dailyDepartment, setDailyDepartment] = useState('');
  const [dailyStudentGroup, setDailyStudentGroup] = useState('');
  const [dailyDivision, setDailyDivision] = useState('');
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyLimit, setDailyLimit] = useState(50);
  const [performancePage, setPerformancePage] = useState(1);
  const [performanceLimit, setPerformanceLimit] = useState(25);

  useEffect(() => {
    const tabFromUrl = searchParams?.get('tab');
    if (tabFromUrl && ['calls', 'conversions', 'users', 'abstract', 'activityLogs'].includes(tabFromUrl)) {
      setActiveTab(tabFromUrl as TabType);
    }
  }, [searchParams]);
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [callReportExportPreviewOpen, setCallReportExportPreviewOpen] = useState(false);
  const [exportPreviewStartDate, setExportPreviewStartDate] = useState<string>('');
  const [exportPreviewEndDate, setExportPreviewEndDate] = useState<string>('');
  const [activityLogPage, setActivityLogPage] = useState(1);
  const [expandedActivityLogId, setExpandedActivityLogId] = useState<string | null>(null);
  const [activityLogEventType, setActivityLogEventType] = useState<'tracking_enabled' | 'tracking_disabled' | ''>('');
  
  // States for export preview filters (Multi-select)
  const [exportSelectedDivision, setExportSelectedDivision] = useState<string[]>([]);
  const [exportSelectedDepartment, setExportSelectedDepartment] = useState<string[]>([]);
  const [exportSelectedGroup, setExportSelectedGroup] = useState<string[]>([]);
  const [exportSelectedRole, setExportSelectedRole] = useState<string[]>([]);
  const isPrintingPerformanceRef = useRef(false);
  /** Full-screen message while print report is fetched/built (toasts cannot repaint during long sync work). */
  const [performancePrintOverlay, setPerformancePrintOverlay] = useState<string | null>(null);

  // Unified filters for all tabs (default to today)
  const [filters, setFilters] = useState({
    startDate: format(startOfDay(new Date()), 'yyyy-MM-dd'),
    endDate: format(endOfDay(new Date()), 'yyyy-MM-dd'),
    userId: '',
    course: '',
    status: '',
    source: '',
    district: '',
    mandal: '',
    state: '',
    academicYear: new Date().getFullYear(),
    studentGroup: '',
    abstractStateId: '',
    abstractDistrictId: '',
  });

  // Fetch users
  const { data: usersResponse } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      try {
        const response = await userAPI.getAll();
        if (Array.isArray(response)) return response;
        if (response?.data && Array.isArray(response.data)) return response.data;
        return [];
      } catch (error) {
        console.error('Error fetching users:', error);
        return [];
      }
    },
  });

  const users = useMemo(() => {
    if (!usersResponse) return [];
    return Array.isArray(usersResponse) ? usersResponse : [];
  }, [usersResponse]);

  const exportFilterOptions = useMemo(() => {
    const divs = new Set<string>();
    const depts = new Set<string>();
    const groups = new Set<string>();
    const roles = new Set<string>();

    users.forEach((u: any) => {
      if (u.division && u.division !== '-') divs.add(u.division);
      if (u.department && u.department !== '-') depts.add(u.department);
      if (u.group && u.group !== '-') groups.add(u.group);
      if (u.roleName && u.roleName !== '-') roles.add(u.roleName);
    });

    return {
      divisions: Array.from(divs).sort(),
      departments: Array.from(depts).sort(),
      groups: Array.from(groups).sort(),
      roles: Array.from(roles).sort()
    };
  }, [users]);

  const performanceFilterOptions = useMemo(() => {
    const divisions = Array.from(
      new Set(
        users
          .map((u: any) => u?.division)
          .filter((d: any) => d && d !== '-')
      )
    ).sort();
    const departments = Array.from(
      new Set(
        users
          .map((u: any) => u?.department)
          .filter((d: any) => d && d !== '-')
      )
    ).sort();
    const groups = Array.from(
      new Set(
        users
          .map((u: any) => u?.group)
          .filter((g: any) => g && g !== '-')
      )
    ).sort();
    const roles = Array.from(
      new Set(
        users
          .map((u: any) => u?.roleName)
          .filter((r: any) => r && r !== '-')
      )
    ).sort();
    return { divisions, departments, groups, roles };
  }, [users]);

  const activityLogUsers = useMemo(
    () =>
      users.filter(
        (u: any) => u.roleName !== 'Super Admin' && u.roleName !== 'Sub Super Admin'
      ),
    [users]
  );

  // Fetch filter options
  const { data: filterOptions } = useQuery({
    queryKey: ['filterOptions'],
    queryFn: () => leadAPI.getFilterOptions(),
  });

  /** Dedicated endpoint: one DISTINCT on `leads.student_group` + long server cache — not blocked by full filter-options bundle. */
  const { data: studentGroupFilterPayload } = useQuery({
    queryKey: ['studentGroupFilterOptions'],
    queryFn: () => leadAPI.getStudentGroupFilterOptions(),
    staleTime: 300_000,
    enabled: activeTab === 'calls',
  });

  const callReportStudentGroupOptions = useMemo(() => {
    const list = (studentGroupFilterPayload as { studentGroups?: string[] } | undefined)?.studentGroups;
    return Array.isArray(list) ? list : [];
  }, [studentGroupFilterPayload]);

  // Date preset handler
  const handleDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    const now = new Date();
    let start: Date, end: Date;

    switch (preset) {
      case 'today':
        start = startOfDay(now);
        end = endOfDay(now);
        break;
      case 'yesterday':
        start = startOfDay(subDays(now, 1));
        end = endOfDay(subDays(now, 1));
        break;
      case 'last7days':
        start = startOfDay(subDays(now, 7));
        end = endOfDay(now);
        break;
      case 'last30days':
        start = startOfDay(subDays(now, 30));
        end = endOfDay(now);
        break;
      case 'thisWeek':
        start = startOfWeek(now, { weekStartsOn: 1 });
        end = endOfDay(now);
        break;
      case 'thisMonth':
        start = startOfMonth(now);
        end = endOfDay(now);
        break;
      case 'lastMonth':
        start = startOfMonth(subDays(now, 30));
        end = endOfMonth(subDays(now, 30));
        break;
      case 'overall':
        setFilters({
          ...filters,
          startDate: '',
          endDate: '',
        });
        setActivityLogPage(1);
        return;
      default:
        return;
    }

    setFilters({
      ...filters,
      startDate: format(start, 'yyyy-MM-dd'),
      endDate: format(end, 'yyyy-MM-dd'),
    });
    setActivityLogPage(1);
  };

  // Call Reports
  const { data: callReports, isLoading: isLoadingCalls, error: callReportsError } = useQuery({
    queryKey: ['callReports', filters.startDate, filters.endDate, filters.userId, dailyDivision, dailyDepartment, dailyStudentGroup, dailyPage, dailyLimit],
    queryFn: () => reportAPI.getDailyCallReports({
      startDate: filters.startDate,
      endDate: filters.endDate,
      userId: filters.userId || undefined,
      division: dailyDivision || undefined,
      department: dailyDepartment || undefined,
      studentGroup: dailyStudentGroup || undefined,
      page: dailyPage,
      limit: dailyLimit,
    }),
    enabled: activeTab === 'calls' && callSubTab === 'daily',
    retry: 2,
  });

  // Conversion Reports
  const { data: conversionReports, isLoading: isLoadingConversions, error: conversionReportsError } = useQuery({
    queryKey: ['conversionReports', filters.startDate, filters.endDate, filters.userId],
    queryFn: () => reportAPI.getConversionReports({
      startDate: filters.startDate,
      endDate: filters.endDate,
      userId: filters.userId || undefined,
      period: 'custom',
    }),
    enabled: activeTab === 'conversions',
    retry: 2,
  });

  // Activity Logs (time tracking ON/OFF)
  const { data: activityLogsData, isLoading: isLoadingActivityLogs } = useQuery({
    queryKey: [
      'all-user-login-logs',
      activityLogPage,
      filters.userId || undefined,
      activityLogEventType || undefined,
      filters.startDate,
      filters.endDate,
    ],
    queryFn: () =>
      userAPI.getAllUserLoginLogs({
        page: activityLogPage,
        limit: 100,
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(activityLogEventType ? { eventType: activityLogEventType } : {}),
        startDate: filters.startDate,
        endDate: filters.endDate,
      }),
    enabled: activeTab === 'activityLogs',
    staleTime: 30000,
  });

  const activityLogs = (activityLogsData?.logs ?? []) as Array<{
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    userRole: string;
    eventType: 'tracking_enabled' | 'tracking_disabled';
    createdAt: string;
  }>;
  const activityLogsPagination = activityLogsData?.pagination;

  /**
   * Heavy endpoint — full user list for User Analytics tab only.
   * Call Reports → Performance uses a separate paginated query so the table loads quickly.
   */
  const { data: userAnalyticsForUsersTab, isLoading: isLoadingUserAnalyticsTab, error: userAnalyticsTabError } = useQuery({
    queryKey: ['userAnalyticsSummary', 'usersTab', filters.startDate, filters.endDate, filters.academicYear],
    queryFn: () =>
      leadAPI.getUserAnalytics({
        startDate: filters.startDate,
        endDate: filters.endDate,
        academicYear: filters.academicYear != null ? filters.academicYear : undefined,
        includeAssignmentDetails: false,
      }),
    enabled: activeTab === 'users',
    retry: 2,
    staleTime: 600_000,
    placeholderData: keepPreviousData,
  });

  const {
    data: performanceUserAnalyticsData,
    isLoading: isLoadingPerformanceUserList,
    isFetching: isFetchingPerformanceUserList,
    error: performanceUserListError,
  } = useQuery({
    queryKey: [
      'userAnalyticsSummary',
      'performancePaged',
      filters.startDate,
      filters.endDate,
      filters.academicYear,
      performancePage,
      performanceLimit,
      performanceSearch,
      performanceRole,
      performanceDivision,
      performanceDepartment,
      performanceStudentGroup,
    ],
    queryFn: () =>
      leadAPI.getUserAnalytics({
        startDate: filters.startDate,
        endDate: filters.endDate,
        academicYear: filters.academicYear != null ? filters.academicYear : undefined,
        includeAssignmentDetails: false,
        page: performancePage,
        limit: performanceLimit,
        perfSearch: performanceSearch.trim() || undefined,
        perfRole: performanceRole || undefined,
        perfDivision: performanceDivision || undefined,
        perfDepartment: performanceDepartment || undefined,
        studentGroup: performanceStudentGroup || undefined,
      }),
    enabled: activeTab === 'calls' && callSubTab === 'performance',
    retry: 2,
    /** Align with server USER_ANALYTICS_CACHE_MS (default 10m). */
    staleTime: 600_000,
    placeholderData: keepPreviousData,
  });

  const performanceTableUsers = useMemo(
    () => (Array.isArray(performanceUserAnalyticsData?.users) ? performanceUserAnalyticsData.users : []) as any[],
    [performanceUserAnalyticsData?.users]
  );

  useEffect(() => {
    setPerformancePage(1);
  }, [
    filters.startDate,
    filters.endDate,
    filters.academicYear,
    performanceSearch,
    performanceRole,
    performanceDivision,
    performanceDepartment,
    performanceStudentGroup,
    performanceLimit,
  ]);

  useEffect(() => {
    setExpandedPerformanceUsers(new Set());
  }, [performancePage]);

  /** Warm first page before opening Performance (paginated — smaller cohort SQL). */
  const prefetchUserPerformanceSummary = useCallback(() => {
    if (activeTab !== 'calls') return;
    void queryClient.prefetchQuery({
      queryKey: [
        'userAnalyticsSummary',
        'performancePaged',
        filters.startDate,
        filters.endDate,
        filters.academicYear,
        1,
        performanceLimit,
        performanceSearch,
        performanceRole,
        performanceDivision,
        performanceDepartment,
        performanceStudentGroup,
      ],
      queryFn: () =>
        leadAPI.getUserAnalytics({
          startDate: filters.startDate,
          endDate: filters.endDate,
          academicYear: filters.academicYear != null ? filters.academicYear : undefined,
          includeAssignmentDetails: false,
          page: 1,
          limit: performanceLimit,
          perfSearch: performanceSearch.trim() || undefined,
          perfRole: performanceRole || undefined,
          perfDivision: performanceDivision || undefined,
          perfDepartment: performanceDepartment || undefined,
          studentGroup: performanceStudentGroup || undefined,
        }),
      staleTime: 600_000,
    });
  }, [
    queryClient,
    activeTab,
    filters.startDate,
    filters.endDate,
    filters.academicYear,
    performanceLimit,
    performanceSearch,
    performanceRole,
    performanceDivision,
    performanceDepartment,
    performanceStudentGroup,
  ]);

  /** Start prefetch as soon as Call Reports is open (even on Daily) so first switch to Performance is faster. */
  useEffect(() => {
    if (activeTab !== 'calls') return;
    prefetchUserPerformanceSummary();
  }, [activeTab, prefetchUserPerformanceSummary]);

  const expandedPerformanceUserIds = useMemo(
    () => Array.from(expandedPerformanceUsers).sort(),
    [expandedPerformanceUsers]
  );

  // Load heavy assignment details only for expanded users.
  const {
    data: expandedPerformanceDetailsMap,
    isLoading: isLoadingPerformanceAnalytics,
    error: performanceAnalyticsError,
  } = useQuery({
    queryKey: [
      'userAnalyticsPerformanceExpanded',
      filters.startDate,
      filters.endDate,
      filters.academicYear,
      performanceStudentGroup,
      expandedPerformanceUserIds.join(','),
    ],
    queryFn: async () => {
      if (expandedPerformanceUserIds.length === 0) return {};
      const batchUserIds = expandedPerformanceUserIds.join(',');
      try {
        const data = await leadAPI.getUserAnalytics({
          startDate: filters.startDate,
          endDate: filters.endDate,
          academicYear: filters.academicYear != null ? filters.academicYear : undefined,
          studentGroup: performanceStudentGroup || undefined,
          userId: batchUserIds,
          includeAssignmentDetails: true,
        });
        const usersArr = Array.isArray(data?.users) ? data.users : [];
        const map: Record<string, any> = {};
        usersArr.forEach((u: any) => {
          const uid = u.id || u.userId;
          if (uid) map[uid] = u;
        });
        return map;
      } catch (error) {
        console.error('Batch analytics fetch failed:', error);
        return {};
      }
    },
    enabled: activeTab === 'calls' && callSubTab === 'performance' && expandedPerformanceUserIds.length > 0,
    placeholderData: (previousData) => previousData,
    retry: 1,
    staleTime: 60000,
  });

  const performanceSummaryTotals = performanceUserAnalyticsData?.summaryTotals as
    | {
        userCount: number;
        totalAssignedLeads: number;
        totalCallsDone: number;
        totalSms: number;
        totalInterested: number;
        totalCallbacksRevisits: number;
        totalUnattended: number;
      }
    | undefined;

  /** Performance “Total Leads”: Student Counselor / PRO show sum of date-wise bucket totals (matches expanded rows); others use portfolio total_assigned. */
  const getPerformanceTotalLeadsDisplay = useCallback((u: any): number => {
    const role = String(u?.roleName || '').trim();
    if (role === 'Student Counselor' || role === 'PRO') {
      const b = u?.allottedBucketSumTotal;
      if (b != null && !Number.isNaN(Number(b))) return Number(b);
    }
    return Number(u?.totalAssigned ?? 0);
  }, []);

  /**
   * Student Counselor / PRO: Total Leads (bucket sum) − Calls/Visits Done (cohort status sum excluding Assigned).
   * Other roles: API pendingBalance, then portfolio fallback.
   */
  const getPerformanceBalanceDisplay = useCallback(
    (u: any): number => {
      const role = String(u?.roleName || '').trim();
      if (role === 'Student Counselor' || role === 'PRO') {
        const allotted = getPerformanceTotalLeadsDisplay(u);
        const done = Number(u?.calls?.total ?? 0);
        return Math.max(0, allotted - done);
      }
      if (u.pendingBalance != null && !Number.isNaN(Number(u.pendingBalance))) {
        return Number(u.pendingBalance);
      }
      return Math.max(0, Number(u.totalAssigned || 0) - Number(u.callsOnCurrentPortfolio ?? u.calls?.total ?? 0));
    },
    [getPerformanceTotalLeadsDisplay]
  );

  const dailyCallSummary = useMemo(() => {
    const summaryRows = Array.isArray(callReports?.summary) ? callReports.summary : [];
    const ranking = summaryRows
      .map((u: any) => ({
        userId: u.userId || 'unknown',
        userName: u.userName || 'Unknown',
        calls: Number(u.totalCalls || 0),
        duration: Number(u.totalDuration || 0),
        days: Number(u.days || 0),
        avgDuration: Number(u.averageDuration || 0),
      }))
      .sort((a: any, b: any) => b.calls - a.calls || b.duration - a.duration || a.userName.localeCompare(b.userName));
    return {
      totalCalls: ranking.reduce((s: number, u: any) => s + Number(u.calls || 0), 0),
      totalDuration: ranking.reduce((s: number, u: any) => s + Number(u.duration || 0), 0),
      usersCovered: ranking.length,
      ranking,
    };
  }, [callReports?.summary]);

  const performanceSummary = useMemo(() => {
    const rows = performanceTableUsers;
    const ranking = [...rows]
      .sort((a: any, b: any) => (Number(b?.calls?.total || 0) - Number(a?.calls?.total || 0))
        || (Number(b?.interested || 0) - Number(a?.interested || 0))
        || String(a?.name || a?.userName || '').localeCompare(String(b?.name || b?.userName || '')));
    return {
      usersCovered: rows.length,
      totalAssigned: rows.reduce((s: number, u: any) => s + getPerformanceTotalLeadsDisplay(u), 0),
      totalDone: rows.reduce((s: number, u: any) => s + Number(u?.calls?.total || 0), 0),
      totalBalance: rows.reduce((s: number, u: any) => s + getPerformanceBalanceDisplay(u), 0),
      totalInterested: rows.reduce((s: number, u: any) => s + Number(u?.interested ?? 0), 0),
      totalUnattended: rows.reduce((s: number, u: any) => s + Number(u?.reclaimedUniqueLeads ?? 0), 0),
      ranking,
    };
  }, [performanceTableUsers, getPerformanceTotalLeadsDisplay, getPerformanceBalanceDisplay]);

  useEffect(() => {
    setDailyPage(1);
  }, [filters.startDate, filters.endDate, filters.userId, dailyDivision, dailyDepartment, dailyStudentGroup, dailyLimit]);

  const getLeadStatusCount = (day: any, status: string) =>
    Number((day?.statusBeforeReclaimCounts?.[status] ?? day?.leadStatusCounts?.[status]) || 0);

  /** Same order as counsellor lead list / filters (`app/user/leads`, dashboard) */
  const COUNSELLOR_CALL_STATUS_COLUMNS = [
    'Assigned',
    'Interested',
    'Not Interested',
    'Not Answered',
    'Wrong Data',
    'Call Back',
    'Visited',
    'Confirmed',
    'CET Applied',
  ] as const;

  /** Expanded counsellor table + print: no Not Answered column (those counts are merged into Call Back for display). */
  const COUNSELLOR_CALL_STATUS_COLUMNS_EXPANDED = COUNSELLOR_CALL_STATUS_COLUMNS.filter((c) => c !== 'Not Answered');

  const counsellorExpandedAssignmentColSpan =
    5 + COUNSELLOR_CALL_STATUS_COLUMNS_EXPANDED.length + 2;

  /** PRO field-visit workflow (`app/user/dashboard`) */
  const PRO_VISIT_STATUS_COLUMNS = [
    'Assigned',
    'Interested',
    'Not Interested',
    'Not Available',
    'Scheduled Revisit',
    'Wrong Data',
    'Confirmed',
  ] as const;

  const getCallStatusCount = (day: any, status: string) =>
    Number(day?.callStatusCounts?.[status] ?? 0) || 0;

  /** Balance = distinct students in bucket with call_status Assigned (API `balanceByPortfolioRule`); legacy payloads fall back to Assigned count. */
  const getCounsellorAssignmentBalanceForDay = (day: any) => {
    const raw = day?.balanceByPortfolioRule;
    if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
    if (raw != null && raw !== '' && !Number.isNaN(Number(raw))) return Number(raw);
    return getCallStatusCount(day, 'Assigned');
  };

  const getVisitStatusCount = (day: any, status: string) =>
    Number(day?.visitStatusCounts?.[status] ?? 0) || 0;

  const sumOtherChannelStatuses = (day: any, known: readonly string[], channel: 'call' | 'visit') => {
    const map = channel === 'call' ? day?.callStatusCounts : day?.visitStatusCounts;
    if (!map || typeof map !== 'object') return 0;
    const set = new Set(known);
    let sum = 0;
    Object.entries(map).forEach(([k, v]) => {
      if (!set.has(k)) sum += Number(v) || 0;
    });
    return sum;
  };

  /**
   * PRO visit_status keys → same labels as `PRO_VISIT_STATUS_COLUMNS`, then merge blank / Not set / unknown into Assigned
   * (matches backend canonical + assignment default visit_status).
   */
  const foldOutcomeVisitMapToCanonical = (raw: Record<string, unknown> | undefined): Record<string, number> => {
    if (!raw || typeof raw !== 'object') return {};
    const known = PRO_VISIT_STATUS_COLUMNS as unknown as readonly string[];
    const knownSet = new Set(known);
    const out: Record<string, number> = {};
    Object.entries(raw).forEach(([k, v]) => {
      const t = String(k).trim();
      const n = Number(v) || 0;
      if (!t && n === 0) return;
      const lower = t.toLowerCase();
      if (!t || /^not\s*set$/i.test(t)) {
        out['Assigned'] = (out['Assigned'] || 0) + n;
        return;
      }
      const hit = known.find((s) => s.toLowerCase() === lower);
      const key = hit || t;
      out[key] = (out[key] || 0) + n;
    });
    let extraAssigned = 0;
    Object.keys(out).forEach((k) => {
      if (!knownSet.has(k)) {
        extraAssigned += Number(out[k]) || 0;
        delete out[k];
      }
    });
    out['Assigned'] = (Number(out['Assigned']) || 0) + extraAssigned;
    return out;
  };

  const getProVisitStatusCountForDisplay = (day: any, status: string) =>
    Number(foldOutcomeVisitMapToCanonical(day?.visitStatusCounts as Record<string, unknown> | undefined)[status] ?? 0) ||
    0;

  /** PRO: API `balanceByPortfolioRule` = visit_status Assigned (distinct) for the bucket row. */
  const getProAssignmentBalanceForDay = (day: any) => {
    const raw = day?.balanceByPortfolioRule;
    if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
    if (raw != null && raw !== '' && !Number.isNaN(Number(raw))) return Number(raw);
    return getProVisitStatusCountForDisplay(day, 'Assigned');
  };

  /** Merge API map keys onto same labels as table columns (case/spelling variants). */
  const foldOutcomeCallMapToCanonical = (raw: Record<string, unknown> | undefined): Record<string, number> => {
    if (!raw || typeof raw !== 'object') return {};
    const known = COUNSELLOR_CALL_STATUS_COLUMNS as unknown as readonly string[];
    const out: Record<string, number> = {};
    Object.entries(raw).forEach(([k, v]) => {
      const t = String(k).trim();
      const n = Number(v) || 0;
      if (!t && n === 0) return;
      const lower = t.toLowerCase();
      if (!t || /^not\s*set$/i.test(t)) {
        out['Not set'] = (out['Not set'] || 0) + n;
        return;
      }
      const hit = known.find((s) => s.toLowerCase() === lower);
      const key = hit || t;
      out[key] = (out[key] || 0) + n;
    });
    return out;
  };

  /**
   * User Performance (Student Counselor): roll Not Answered into Call Back for display (Not Answered column hidden).
   * Display-only — API/DB unchanged; column totals still sum to the same cohort.
   */
  const mergeNotAnsweredIntoCallBackForCounsellorDisplay = (
    map: Record<string, number> | Record<string, unknown> | undefined
  ): Record<string, number> => {
    const base =
      map && typeof map === 'object' ? { ...(map as Record<string, number>) } : ({} as Record<string, number>);
    const na = Number(base['Not Answered'] ?? 0) || 0;
    const cb = Number(base['Call Back'] ?? 0) || 0;
    base['Call Back'] = cb + na;
    delete base['Not Answered'];
    return base;
  };

  const getCounsellorCallStatusCountForDisplay = (day: any, status: string) => {
    const folded = foldOutcomeCallMapToCanonical(day?.callStatusCounts as Record<string, unknown> | undefined);
    const merged = mergeNotAnsweredIntoCallBackForCounsellorDisplay(folded);
    return Number(merged[status] ?? 0) || 0;
  };

  /** DISTINCT outcome-call leads by current call_status (sums to Calls/Visits Done). */
  const countDistinctOutcomeCallByStatus = (map: Record<string, unknown> | undefined, status: string) =>
    Number(map?.[status] ?? 0) || 0;

  const sumDistinctOutcomeCallOutsideKnown = (
    map: Record<string, unknown> | undefined,
    known: readonly string[]
  ) => {
    if (!map || typeof map !== 'object') return 0;
    const set = new Set(known);
    let sum = 0;
    Object.entries(map).forEach(([k, v]) => {
      if (!set.has(k)) sum += Number(v) || 0;
    });
    return sum;
  };

  /** Expanded assignment table: pick columns by real role (analytics → users API → detail payload). */
  type PerformanceExpandedMode = 'counsellor' | 'pro' | 'pipeline';
  const getPerformanceExpandedMode = (
    analyticsRole: unknown,
    usersListRole: unknown,
    detailRole: unknown
  ): PerformanceExpandedMode => {
    const r = String(analyticsRole ?? usersListRole ?? detailRole ?? '').trim();
    if (r === 'Student Counselor') return 'counsellor';
    if (r === 'PRO') return 'pro';
    return 'pipeline';
  };

  const formatAssignedStudentGroups = (day: any) => {
    const entries = Object.entries(day?.studentGroupCounts || {})
      .map(([group, count]) => ({ group: String(group), count: Number(count) || 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group));
    if (!entries.length) return filters.studentGroup || 'Unknown';
    return entries.map((x) => `${x.group} (${x.count})`).join(', ');
  };

  const formatAssignedMandals = (day: any) => {
    const entries = Object.entries(day?.mandalCounts || {})
      .map(([mandal, count]) => ({ mandal: String(mandal), count: Number(count) || 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count || a.mandal.localeCompare(b.mandal));
    if (!entries.length) return '—';
    return entries.map((x) => `${x.mandal} (${x.count})`).join(', ');
  };

  const handlePrintPerformanceDetails = async () => {
    if (isPrintingPerformanceRef.current) return;
    const totalMatching = performanceUserAnalyticsData?.pagination?.total ?? performanceTableUsers.length;
    if (!totalMatching) {
      showToast.error('No performance rows match the current filters.');
      return;
    }
    isPrintingPerformanceRef.current = true;
    setPerformancePrintOverlay('Loading all matching users for print…');

    const escapeHtml = (s: unknown) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    let rowsToPrint: any[] = [];
    try {
      const full = await leadAPI.getUserAnalytics({
        startDate: filters.startDate,
        endDate: filters.endDate,
        academicYear: filters.academicYear != null ? filters.academicYear : undefined,
        includeAssignmentDetails: false,
        perfSearch: performanceSearch.trim() || undefined,
        perfRole: performanceRole || undefined,
        perfDivision: performanceDivision || undefined,
        perfDepartment: performanceDepartment || undefined,
        studentGroup: performanceStudentGroup || undefined,
      });
      rowsToPrint = Array.isArray(full?.users) ? full.users : [];
    } catch (e) {
      console.error(e);
      setPerformancePrintOverlay(null);
      isPrintingPerformanceRef.current = false;
      showToast.error('Could not load users for printing.');
      return;
    }

    if (!rowsToPrint.length) {
      setPerformancePrintOverlay(null);
      isPrintingPerformanceRef.current = false;
      showToast.error('No users to print.');
      return;
    }

    setPerformancePrintOverlay('Preparing detailed report for print…');

    const userIds = rowsToPrint.map((u: any) => u.userId || u.id).filter(Boolean);
    if (!userIds.length) {
      setPerformancePrintOverlay(null);
      isPrintingPerformanceRef.current = false;
      showToast.error('No users to print.');
      return;
    }

    let detailsMap: Record<string, any> = {};
    try {
      const data = await leadAPI.getUserAnalytics({
        startDate: filters.startDate,
        endDate: filters.endDate,
        academicYear: filters.academicYear != null ? filters.academicYear : undefined,
        userId: userIds.join(','),
        includeAssignmentDetails: true,
        // Apply filters to ensure detailed assignments match what was seen in the table
        perfSearch: performanceSearch.trim() || undefined,
        perfRole: performanceRole || undefined,
        perfDivision: performanceDivision || undefined,
        perfDepartment: performanceDepartment || undefined,
        studentGroup: performanceStudentGroup || undefined,
      });
      const usersArr = Array.isArray(data?.users) ? data.users : [];
      usersArr.forEach((u: any) => {
        const uid = u.id || u.userId;
        if (uid) detailsMap[uid] = u;
      });
    } catch (e) {
      console.error(e);
      setPerformancePrintOverlay(null);
      showToast.error('Could not load assignment details for printing.');
      isPrintingPerformanceRef.current = false;
      return;
    }

    setPerformancePrintOverlay('Building print layout…');
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    const generatedAt = new Date().toLocaleString();
    const sections = rowsToPrint.map((user: any) => {
      const uid = user.userId || user.id;
      const detailUser = detailsMap[uid];
      const fullUser = users.find((x: any) => x._id === uid || x.id === uid);
      const rows = Array.isArray(detailUser?.assignmentsByDate) ? detailUser.assignmentsByDate : [];
      const userName = escapeHtml(user.name || user.userName || 'Unknown');
      const roleRaw = user.roleName || detailUser?.roleName || fullUser?.roleName || '';
      const roleKey = String(roleRaw).trim();
      const roleName = escapeHtml(roleKey || '—');
      const statusLabel = user.isActive ? 'Active' : 'Inactive';
      const printMode = getPerformanceExpandedMode(user.roleName, fullUser?.roleName, detailUser?.roleName);
      const printColSpan = printMode === 'pro' ? 13 : 12;
      const headerStatusPro = `${PRO_VISIT_STATUS_COLUMNS.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}<th>Balance</th>`;
      const headerStatusPipeline = `<th>Assigned</th><th>Interested</th><th>Not Interested</th><th>Wrong Data</th><th>Call Back</th><th>Confirmed</th>`;

      if (printMode === 'counsellor') {
        const pc = detailUser?.expandedAssignmentDiagnostics?.performanceCohort;
        const allottedMap = foldOutcomeCallMapToCanonical(pc?.allottedByCallStatus as Record<string, unknown> | undefined);
        const allottedDisplayMap = mergeNotAnsweredIntoCallBackForCounsellorDisplay(allottedMap);
        const allottedTotal = Number(pc?.allottedDistinctLeads ?? 0);
        const allottedFooterCells = COUNSELLOR_CALL_STATUS_COLUMNS_EXPANDED.map(
          (c) => `<td>${countDistinctOutcomeCallByStatus(allottedDisplayMap, c)}</td>`
        ).join('');
        const periodBalanceFoot =
          typeof pc?.periodBalanceByPortfolioRule === 'number' && !Number.isNaN(pc.periodBalanceByPortfolioRule)
            ? pc.periodBalanceByPortfolioRule
            : '—';
        const footerRowCounsellor = pc
          ? `<tr style="font-weight:700;background:#f1f5f9;">
              <td colspan="4">Leads allotted (period) — distinct leads by current call_status (Not Answered merged into Call Back)</td>
              <td>${allottedTotal}</td>
              ${allottedFooterCells}
              <td>${periodBalanceFoot}</td>
              <td>${Number(pc?.reclaimedTotalInPeriod ?? 0) || '—'}</td>
            </tr>`
          : '';

        const headerStatusCounsellor = `${COUNSELLOR_CALL_STATUS_COLUMNS_EXPANDED.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}<th>Balance</th>`;
        const printColSpanCounsellor = counsellorExpandedAssignmentColSpan;
        const rowHtmlCounsellor = rows.length
          ? rows.map((day: any) => {
              const targetDateEntries = Object.entries(day.targetDateCounts || {})
                .sort((a: any, b: any) => String(a[0]).localeCompare(String(b[0])));
              const targetDateText = targetDateEntries.length
                ? targetDateEntries
                    .map(([dt, count]) => `${format(new Date(String(dt)), 'dd MMM yyyy')} (${Number(count) || 0})`)
                    .join(', ')
                : '—';
              const statusCells =
                COUNSELLOR_CALL_STATUS_COLUMNS_EXPANDED.map((c) => `<td>${getCounsellorCallStatusCountForDisplay(day, c)}</td>`).join('') +
                `<td>${getCounsellorAssignmentBalanceForDay(day)}</td>`;
              return `
              <tr>
                <td>${escapeHtml(day.date ? format(new Date(day.date), 'dd MMM yyyy') : 'Unknown')}</td>
                <td>${escapeHtml(targetDateText)}</td>
                <td>${escapeHtml(formatAssignedStudentGroups(day))}</td>
                <td>${escapeHtml(formatAssignedMandals(day))}</td>
                <td>${Number(day?.totalAssigned || 0)}</td>
                ${statusCells}
                <td>${Number(day?.reclaimedCount || 0)}</td>
              </tr>
            `;
            }).join('')
          : `<tr><td colspan="${printColSpanCounsellor}">No date-wise assignment history found.</td></tr>`;


        const mergedPrintUser = { ...user, ...(detailUser || {}) };
        const mainRowBalance = getPerformanceBalanceDisplay(mergedPrintUser);
        const mainRowLeads = getPerformanceTotalLeadsDisplay(mergedPrintUser);
        const mainRowCalls = mergedPrintUser.calls?.total ?? 0;
        const mainRowInterested = mergedPrintUser.interested ?? 0;
        const mainRowVisited = roleKey === 'Student Counselor' ? (mergedPrintUser.visitedCumulative ?? 0) : '—';
        const mainRowConfirmed = mergedPrintUser.convertedLeads ?? 0;
        const mainRowAdmitted = mergedPrintUser.admittedLeads ?? mergedPrintUser.statusBreakdown?.Admitted ?? 0;

        const summaryTableHtml = `
          <table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:6px;background:#f8fafc;border:1px solid #e2e8f0;">
            <thead>
              <tr style="background:#475569;color:#fff;text-align:center;">
                <th style="padding:4px;border:1px solid #334155;">Total Leads</th>
                <th style="padding:4px;border:1px solid #334155;">Calls Done</th>
                <th style="padding:4px;border:1px solid #334155;">Balance</th>
                <th style="padding:4px;border:1px solid #334155;">Interested</th>
                <th style="padding:4px;border:1px solid #334155;">Visited</th>
                <th style="padding:4px;border:1px solid #334155;">Confirmed</th>
                <th style="padding:4px;border:1px solid #334155;">Admitted</th>
              </tr>
            </thead>
            <tbody>
              <tr style="text-align:center;font-weight:700;color:#1e293b;">
                <td style="padding:4px;border:1px solid #e2e8f0;">${mainRowLeads}</td>
                <td style="padding:4px;border:1px solid #e2e8f0;">${mainRowCalls}</td>
                <td style="padding:4px;border:1px solid #e2e8f0;">${mainRowBalance}</td>
                <td style="padding:4px;border:1px solid #e2e8f0;">${mainRowInterested}</td>
                <td style="padding:4px;border:1px solid #e2e8f0;">${mainRowVisited}</td>
                <td style="padding:4px;border:1px solid #e2e8f0;">${mainRowConfirmed}</td>
                <td style="padding:4px;border:1px solid #e2e8f0;">${mainRowAdmitted}</td>
              </tr>
            </tbody>
          </table>
        `;

        return `
        <section style="margin-bottom:10px; break-inside: avoid;">
          <h3 style="margin:0 0 3px 0;font-size:10px;font-weight:700;">${userName} <span style="font-weight:600;color:#334155;">(${roleName})</span> · ${statusLabel}</h3>
          ${summaryTableHtml}
          <p style="margin:0 0 4px 0;font-size:8px;color:#475569;">Student Counselor — Assignment history by date buckets. Main table summary counts shown above.</p>
          <table style="width:100%;border-collapse:collapse;font-size:8.5px;line-height:1.25;">
            <thead>
              <tr>
                <th>Allotted Date</th>
                <th>Target Date</th>
                <th>Student Group Assigned</th>
                <th>Mandal Assigned</th>
                <th>Total Allotted</th>
                ${headerStatusCounsellor}
                <th>Unattended (batch)</th>
              </tr>
            </thead>
            <tbody>${rowHtmlCounsellor}</tbody>
            ${footerRowCounsellor ? `<tfoot>${footerRowCounsellor}</tfoot>` : ''}
          </table>
        </section>
      `;
      }

      const theadStatusRow = printMode === 'pro' ? headerStatusPro : headerStatusPipeline;

      const rowHtml = rows.length
        ? rows.map((day: any) => {
            const targetDateEntries = Object.entries(day.targetDateCounts || {})
              .sort((a: any, b: any) => String(a[0]).localeCompare(String(b[0])));
            const targetDateText = targetDateEntries.length
              ? targetDateEntries.map(([dt, count]) => `${format(new Date(String(dt)), 'dd MMM yyyy')} (${Number(count) || 0})`).join(', ')
              : '—';
            let statusCells = '';
            if (printMode === 'pro') {
              statusCells =
                PRO_VISIT_STATUS_COLUMNS.map((c) => `<td>${getProVisitStatusCountForDisplay(day, c)}</td>`).join('') +
                `<td>${getProAssignmentBalanceForDay(day)}</td>`;
            } else {
              statusCells = `<td>${getLeadStatusCount(day, 'Assigned')}</td>
                <td>${getLeadStatusCount(day, 'Interested')}</td>
                <td>${getLeadStatusCount(day, 'Not Interested')}</td>
                <td>${getLeadStatusCount(day, 'Wrong Data')}</td>
                <td>${getLeadStatusCount(day, 'Call Back')}</td>
                <td>${getLeadStatusCount(day, 'Confirmed')}</td>`;
            }
            return `
              <tr>
                <td>${escapeHtml(day.date ? format(new Date(day.date), 'dd MMM yyyy') : 'Unknown')}</td>
                <td>${escapeHtml(targetDateText)}</td>
                <td>${escapeHtml(formatAssignedStudentGroups(day))}</td>
                <td>${escapeHtml(formatAssignedMandals(day))}</td>
                <td>${Number(day?.totalAssigned || 0)}</td>
                ${statusCells}
                <td>${Number(day?.reclaimedCount || 0)}</td>
              </tr>
            `;
          }).join('')
        : `<tr><td colspan="${printColSpan}">No date-wise assignment history found.</td></tr>`;

      let footerRowPro = '';
      if (printMode === 'pro' && detailUser?.expandedAssignmentDiagnostics?.performanceCohort) {
        const pc = detailUser.expandedAssignmentDiagnostics.performanceCohort as {
          allottedDistinctLeads?: number;
          allottedByVisitStatus?: Record<string, unknown>;
          periodBalanceByPortfolioRule?: number;
        };
        if (pc.allottedByVisitStatus) {
          const visitMap = foldOutcomeVisitMapToCanonical(pc.allottedByVisitStatus);
          const allottedTotal = Number(pc.allottedDistinctLeads ?? 0);
          const visitCells = PRO_VISIT_STATUS_COLUMNS.map(
            (c) => `<td>${countDistinctOutcomeCallByStatus(visitMap, c)}</td>`
          ).join('');
          const bal =
            typeof pc.periodBalanceByPortfolioRule === 'number' && !Number.isNaN(pc.periodBalanceByPortfolioRule)
              ? pc.periodBalanceByPortfolioRule
              : '—';
          footerRowPro = `<tfoot><tr style="font-weight:700;background:#f1f5f9;">
            <td colspan="4">Leads allotted (period) — distinct by current visit_status</td>
            <td>${allottedTotal}</td>
            ${visitCells}
            <td>${bal}</td>
            <td>${Number(pc?.reclaimedTotalInPeriod ?? 0) || '—'}</td>
          </tr></tfoot>`;
        }
      }

      const mergedPrintUserOther = { ...user, ...(detailUser || {}) };
      const printMainBalanceOther = getPerformanceBalanceDisplay(mergedPrintUserOther);
      const mainRowLeadsOther = getPerformanceTotalLeadsDisplay(mergedPrintUserOther);
      const mainRowCallsOther = mergedPrintUserOther.calls?.total ?? 0;
      const mainRowInterestedOther = mergedPrintUserOther.interested ?? 0;
      const mainRowVisitedOther = roleKey === 'PRO' ? (mergedPrintUserOther.visitedCumulative ?? 0) : '—';
      const mainRowConfirmedOther = mergedPrintUserOther.convertedLeads ?? 0;
      const mainRowAdmittedOther = mergedPrintUserOther.admittedLeads ?? mergedPrintUserOther.statusBreakdown?.Admitted ?? 0;

      const summaryTableOtherHtml = `
        <table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:6px;background:#f8fafc;border:1px solid #e2e8f0;">
          <thead>
            <tr style="background:#475569;color:#fff;text-align:center;">
              <th style="padding:4px;border:1px solid #334155;">Total Leads</th>
              <th style="padding:4px;border:1px solid #334155;">Calls/Visits Done</th>
              <th style="padding:4px;border:1px solid #334155;">Balance</th>
              <th style="padding:4px;border:1px solid #334155;">Interested</th>
              <th style="padding:4px;border:1px solid #334155;">Visited</th>
              <th style="padding:4px;border:1px solid #334155;">Confirmed</th>
              <th style="padding:4px;border:1px solid #334155;">Admitted</th>
            </tr>
          </thead>
          <tbody>
            <tr style="text-align:center;font-weight:700;color:#1e293b;">
              <td style="padding:4px;border:1px solid #e2e8f0;">${mainRowLeadsOther}</td>
              <td style="padding:4px;border:1px solid #e2e8f0;">${mainRowCallsOther}</td>
              <td style="padding:4px;border:1px solid #e2e8f0;">${printMainBalanceOther}</td>
              <td style="padding:4px;border:1px solid #e2e8f0;">${mainRowInterestedOther}</td>
              <td style="padding:4px;border:1px solid #e2e8f0;">${mainRowVisitedOther}</td>
              <td style="padding:4px;border:1px solid #e2e8f0;">${mainRowConfirmedOther}</td>
              <td style="padding:4px;border:1px solid #e2e8f0;">${mainRowAdmittedOther}</td>
            </tr>
          </tbody>
        </table>
      `;

      return `
        <section style="margin-bottom:10px; break-inside: avoid;">
          <h3 style="margin:0 0 3px 0;font-size:10px;font-weight:700;">${userName} <span style="font-weight:600;color:#334155;">(${roleName})</span> · ${statusLabel}</h3>
          ${summaryTableOtherHtml}
          ${
            printMode === 'pro'
              ? `<p style="margin:0 0-4px 0;font-size:8px;color:#475569;">PRO — Assignment history by date buckets. Main table summary counts shown above.</p>`
              : `<p style="margin:0 0-4px 0;font-size:8px;color:#475569;">Pipeline Summary — Main table summary counts shown above.</p>`
          }
          <table style="width:100%;border-collapse:collapse;font-size:8.5px;line-height:1.25;">
            <thead>
              <tr>
                <th>Allotted Date</th>
                <th>Target Date</th>
                <th>Student Group Assigned</th>
                <th>Mandal Assigned</th>
                <th>Total Allotted</th>
                ${theadStatusRow}
                <th>Unattended (batch)</th>
              </tr>
            </thead>
            <tbody>${rowHtml}</tbody>
            ${footerRowPro}
          </table>
        </section>
      `;
    }).join('');

    const fullHtml = `
      <!doctype html>
      <html>
        <head>
          <title>User Performance Detailed Report</title>
          <style>
            body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; padding: 6px 8px; font-size: 9px; }
            h1 { margin: 0 0 4px 0; font-size: 13px; line-height: 1.2; }
            p.meta { margin: 0 0 6px 0; font-size: 8px; color: #475569; }
            table, th, td { border: 1px solid #cbd5e1; }
            th, td { padding: 3px 4px; text-align: left; vertical-align: top; }
            th { background: #f1f5f9; font-weight: 600; font-size: 8px; }
            td { font-size: 8.5px; }
            @media print {
              body { padding: 4px 6px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              h1 { font-size: 12px; }
            }
          </style>
        </head>
        <body>
          <h1>User Performance Detailed Report</h1>
          <p class="meta">Generated: ${escapeHtml(generatedAt)}</p>
          ${sections}
        </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.title = 'Print: User performance detailed report';
    iframe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;border:0;margin:0;padding:0;opacity:0;pointer-events:none;visibility:hidden;';
    document.body.appendChild(iframe);
    const w = iframe.contentWindow;
    if (!w) {
      iframe.remove();
      setPerformancePrintOverlay(null);
      showToast.error('Print could not start in this browser.');
      isPrintingPerformanceRef.current = false;
      return;
    }
    const doc = w.document;
    doc.open();
    doc.write(fullHtml);
    doc.close();

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
      setPerformancePrintOverlay(null);
      isPrintingPerformanceRef.current = false;
    };

    w.addEventListener('afterprint', cleanup);
    const runPrint = () => {
      try {
        // Hide overlay before the system print dialog so it is not covered.
        setPerformancePrintOverlay(null);
        requestAnimationFrame(() => {
          try {
            w.focus();
            w.print();
          } catch (err) {
            console.error(err);
            showToast.error('Print failed.');
            cleanup();
          }
        });
      } catch (err) {
        console.error(err);
        showToast.error('Print failed.');
        cleanup();
        return;
      }
      setTimeout(cleanup, 4000);
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(runPrint);
    });
  };

  const handleExportPerformanceSummaryExcel = () => {
    if (performanceTableUsers.length === 0) {
      showToast.error('No data to export');
      return;
    }

    const exportData = performanceTableUsers.map((u, idx) => {
      const role = String(u?.roleName || '').trim();
      return {
        'S.No': idx + 1,
        'User': u.name || u.userName || 'Unknown',
        'Email': u.email || '—',
        'Role': role || '—',
        'Total Leads': getPerformanceTotalLeadsDisplay(u),
        'Calls/Visits Done': u.calls?.total ?? 0,
        'Balance': getPerformanceBalanceDisplay(u),
        'Interested': u.interested ?? 0,
        'Visited': role === 'Student Counselor' ? (u.visitedCumulative ?? 0) : '—',
        'Confirmed': u.convertedLeads ?? 0,
        'Admitted': u.admittedLeads ?? u.statusBreakdown?.Admitted ?? 0,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Performance Summary');

    const cols = Object.keys(exportData[0]).map((key) => ({
      wch: Math.max(key.length, ...exportData.map((r: any) => String(r[key] ?? '').length)) + 2,
    }));
    worksheet['!cols'] = cols;

    XLSX.writeFile(workbook, `user-performance-summary-${filters.startDate}-${filters.endDate}.xlsx`);
  };



  // States for Abstract tab (state → districts → mandals)
  const { data: abstractStates } = useQuery({
    queryKey: ['locations', 'states'],
    queryFn: () => locationsAPI.listStates(),
    enabled: activeTab === 'abstract',
  });

  // Default state to Andhra Pradesh when states load and none selected
  useEffect(() => {
    if (activeTab !== 'abstract' || filters.abstractStateId || !abstractStates) return;
    const arr = Array.isArray(abstractStates) ? abstractStates : [];
    const ap = arr.find((s: { name?: string }) => String(s?.name || '').toLowerCase().includes('andhra pradesh'));
    if (ap?.id) {
      setFilters((prev) => ({ ...prev, abstractStateId: ap.id }));
    }
  }, [activeTab, abstractStates, filters.abstractStateId]);

  const { data: abstractDistricts } = useQuery({
    queryKey: ['locations', 'districts', filters.abstractStateId],
    queryFn: () => locationsAPI.listDistricts({ stateId: filters.abstractStateId }),
    enabled: activeTab === 'abstract' && !!filters.abstractStateId,
  });

  // Leads Abstract: district breakdown refetches only when year / group / state change (not when picking a district).
  const abstractReportParams = {
    academicYear: filters.academicYear ?? 2025,
    studentGroup: filters.studentGroup || undefined,
    stateId: filters.abstractStateId || undefined,
  };
  const {
    data: leadsAbstractDistricts,
    isLoading: isLoadingAbstractDistricts,
    isFetching: isFetchingAbstractDistricts,
  } = useQuery({
    queryKey: ['leadsAbstract', 'districts', filters.academicYear, filters.studentGroup, filters.abstractStateId],
    queryFn: () =>
      reportAPI.getLeadsAbstract({
        ...abstractReportParams,
        districtId: undefined,
      }),
    enabled: activeTab === 'abstract',
    staleTime: 60000,
    retry: 2,
    placeholderData: keepPreviousData,
  });

  const {
    data: leadsAbstractMandals,
    isLoading: isLoadingAbstractMandals,
    isFetching: isFetchingAbstractMandals,
  } = useQuery({
    queryKey: [
      'leadsAbstract',
      'mandals',
      filters.academicYear,
      filters.studentGroup,
      filters.abstractStateId,
      filters.abstractDistrictId,
    ],
    queryFn: () =>
      reportAPI.getLeadsAbstract({
        ...abstractReportParams,
        districtId: filters.abstractDistrictId || undefined,
      }),
    enabled: activeTab === 'abstract' && !!filters.abstractDistrictId,
    staleTime: 60000,
    retry: 2,
  });

  // Export handlers
  const handleExport = (type: 'excel' | 'csv', data: any[], filename: string) => {
    if (!data || data.length === 0) return;

    // Create generic export
    const exportData = data.map((item: any) => {
      const row: any = {};
      Object.keys(item).forEach((key) => {
        if (key !== '_id' && key !== '__v') {
          const value = item[key];
          if (value instanceof Date) {
            row[key] = format(value, 'yyyy-MM-dd HH:mm:ss');
          } else if (typeof value === 'object' && value !== null) {
            row[key] = JSON.stringify(value);
          } else {
            row[key] = value || '';
          }
        }
      });
      return row;
    });

    if (type === 'excel') {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
      XLSX.writeFile(workbook, `${filename}.xlsx`);
    } else {
      const csv = Papa.unparse(exportData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Call reports: build merged data for Excel (User Performance + Daily Report)
  // Dedicated queries for Export Preview to support specific date filtering
  const { data: previewCallReports, isLoading: isPreviewCallsLoading, isFetching: isPreviewCallsFetching } = useQuery({
    queryKey: ['previewCallReports', exportPreviewStartDate, exportPreviewEndDate, filters.userId, exportSelectedDivision, exportSelectedDepartment, exportSelectedGroup, exportSelectedRole],
    queryFn: () => reportAPI.getDailyCallReports({
      startDate: exportPreviewStartDate,
      endDate: exportPreviewEndDate,
      userId: filters.userId || undefined,
      division: exportSelectedDivision.length === 1 ? exportSelectedDivision[0] : undefined,
      department: exportSelectedDepartment.length === 1 ? exportSelectedDepartment[0] : undefined,
      group: exportSelectedGroup.length === 1 ? exportSelectedGroup[0] : undefined,
    }),
    enabled: callReportExportPreviewOpen && (!!exportPreviewStartDate || datePreset === 'overall'),
    staleTime: 0,
  });

  const { data: previewUserAnalytics, isLoading: isPreviewUserLoading, isFetching: isPreviewUserFetching } = useQuery({
    queryKey: ['previewUserAnalytics', exportPreviewStartDate, exportPreviewEndDate, filters.academicYear, filters.userId, exportSelectedDivision, exportSelectedDepartment, exportSelectedGroup, exportSelectedRole],
    queryFn: () => leadAPI.getUserAnalytics({
      startDate: exportPreviewStartDate,
      endDate: exportPreviewEndDate,
      academicYear: filters.academicYear != null ? filters.academicYear : undefined,
      userId: filters.userId || undefined,
      division: exportSelectedDivision.length === 1 ? exportSelectedDivision[0] : undefined,
      department: exportSelectedDepartment.length === 1 ? exportSelectedDepartment[0] : undefined,
      group: exportSelectedGroup.length === 1 ? exportSelectedGroup[0] : undefined,
    }),
    enabled: callReportExportPreviewOpen && (!!exportPreviewStartDate || datePreset === 'overall'),
    staleTime: 0,
  });

  const callReportMergedData = useMemo(() => {
    // If modal is open, use the data fetched for the specific preview date
    const rawAnalyticUsers = previewUserAnalytics?.users || [];
    const daily = previewCallReports?.reports || [];

    // Map for fast user lookup
    const userMetaMap = new Map();
    users.forEach((u: any) => {
      userMetaMap.set(u._id, u);
      userMetaMap.set(u.name, u);
    });

    // Filter analytic users by organizational filters (if multiple selected, we still filter on client)
    const finalUsersToExport = rawAnalyticUsers.filter((u: any) => {
      if (exportSelectedDivision.length === 0 && exportSelectedDepartment.length === 0 && exportSelectedGroup.length === 0 && exportSelectedRole.length === 0 && !filters.userId) return true;
      
      const fullUser = userMetaMap.get(u.userId) || userMetaMap.get(u.name || u.userName);
      
      const matchesDivision = exportSelectedDivision.length === 0 || (fullUser?.division && exportSelectedDivision.includes(fullUser.division));
      const matchesDepartment = exportSelectedDepartment.length === 0 || (fullUser?.department && exportSelectedDepartment.includes(fullUser.department));
      const matchesGroup = exportSelectedGroup.length === 0 || (fullUser?.group && exportSelectedGroup.includes(fullUser.group));
      const matchesRole = exportSelectedRole.length === 0 || (fullUser?.roleName && exportSelectedRole.includes(fullUser.roleName));
      const matchesSpecificUser = filters.userId === '' || u.userId === filters.userId;

      return matchesDivision && matchesDepartment && matchesGroup && matchesRole && matchesSpecificUser;
    });

    const filteredPerformanceUserNames = new Set(finalUsersToExport.map((u: any) => u.name || u.userName));
    const filteredPerformanceUserIds = new Set(finalUsersToExport.map((u: any) => u.userId));

    const performanceRows = finalUsersToExport.map((u: any) => {
      const balance = getPerformanceBalanceDisplay(u);
      const admitted = u.admittedLeads ?? u.statusBreakdown?.Admitted ?? 0;
      
      return {
        User: (u.name || u.userName || '—'),
        'Total Leads': getPerformanceTotalLeadsDisplay(u),
        'Calls/Visits Done': u.calls?.total ?? 0,
        Balance: balance,
        'Interested Leads': u.interested ?? 0,
        Visited: u.visitedCumulative ?? '',
        Confirmed: u.convertedLeads ?? 0,
        Admitted: admitted,
      };
    });

    // Group by userName
    const dailyGrouped: { userName: string; rows: any[]; fullUser: any }[] = [];
    const userIndexMap = new Map<string, number>();

    daily.forEach((r: any) => {
      if (!filteredPerformanceUserNames.has(r.userName) && !filteredPerformanceUserIds.has(r.userId)) return;

      const fullUser = userMetaMap.get(r.userId) || userMetaMap.get(r.userName);
      const existingIdx = userIndexMap.get(r.userName);
      if (existingIdx === undefined) {
        userIndexMap.set(r.userName, dailyGrouped.length);
        dailyGrouped.push({ userName: r.userName, rows: [r], fullUser });
      } else {
        dailyGrouped[existingIdx].rows.push(r);
      }
    });

    dailyGrouped.forEach(g => g.rows.sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()));

    const dailyRows = dailyGrouped.flatMap(g =>
      g.rows.map((r: any) => ({
        User: g.userName || '—',
        Division: g.fullUser?.division || '—',
        Department: g.fullUser?.department || '—',
        Group: g.fullUser?.group || '—',
        Role: g.fullUser?.roleName || '—',
        Date: format(new Date(r.date), 'dd MMM yyyy'),
        'Calls/Visits Done': r.callCount ?? 0,
        'Total Duration': formatSecondsToMMSS(r.totalDuration ?? 0),
        'Avg Duration': formatSecondsToMMSS(r.averageDuration ?? 0),
      }))
    );

    return { performanceRows, dailyRows };
  }, [
    previewUserAnalytics?.users,
    previewCallReports?.reports,
    exportSelectedDivision,
    exportSelectedDepartment,
    exportSelectedGroup,
    filters.userId,
    users,
    getPerformanceBalanceDisplay,
    getPerformanceTotalLeadsDisplay,
  ]);

  const downloadCallReportExcel = () => {
    console.log("Running Enhanced Excel Export with Merges...");
    const { performanceRows, dailyRows } = callReportMergedData;
    if (performanceRows.length === 0 && dailyRows.length === 0) return;
    const workbook = XLSX.utils.book_new();

    if (performanceRows.length > 0 && callSubTab === 'performance') {
      const ws1 = XLSX.utils.json_to_sheet(performanceRows);
      const perfCols = Object.keys(performanceRows[0]).map(key => {
        const maxLen = Math.max(key.length, ...performanceRows.map((r: any) => String(r[key] ?? '').length));
        return { wch: maxLen + 5 };
      });
      ws1['!cols'] = perfCols;
      XLSX.utils.book_append_sheet(workbook, ws1, 'User Performance');
    }

    if (dailyRows.length > 0 && callSubTab === 'daily') {
      // Clear redundant values first to ensure clean look even if merges are finicky
      const displayData = dailyRows.map((row: any, idx: number) => {
        const newRow = { ...row };
        if (idx > 0 && dailyRows[idx - 1].User === row.User) {
          newRow.User = "";
          newRow.Division = "";
          newRow.Department = "";
          newRow.Group = "";
        }
        return newRow;
      });

      const ws2 = XLSX.utils.json_to_sheet(displayData);
      const merges: XLSX.Range[] = [];
      
      let startIdx = 0;
      while (startIdx < dailyRows.length) {
        const userName = dailyRows[startIdx].User;
        let endIdx = startIdx;
        while (endIdx + 1 < dailyRows.length && dailyRows[endIdx + 1].User === userName) {
          endIdx++;
        }
        
        if (endIdx > startIdx) {
          // Merge columns A-D (0-3) from startIdx+1 to endIdx+1 (header is row 0)
          for (let col = 0; col <= 3; col++) {
            merges.push({
              s: { r: startIdx + 1, c: col },
              e: { r: endIdx + 1, c: col }
            });
          }
        }
        startIdx = endIdx + 1;
      }
      ws2['!merges'] = merges;

      const dailyCols = Object.keys(dailyRows[0]).map(key => {
        const maxLen = Math.max(key.length, ...dailyRows.map((r: any) => String(r[key] ?? '').length));
        return { wch: maxLen + 5 };
      });
      ws2['!cols'] = dailyCols;
      XLSX.utils.book_append_sheet(workbook, ws2, 'Daily Call Report');
    }

    const dateRange = exportPreviewStartDate && exportPreviewEndDate
      ? `${exportPreviewStartDate}_to_${exportPreviewEndDate}`
      : exportPreviewStartDate || filters.startDate;
    const filename = `call-report-${dateRange}.xlsx`;
    XLSX.writeFile(workbook, filename);
    setCallReportExportPreviewOpen(false);
  };

  // Prepare chart data
  const conversionChartData = useMemo(() => {
    if (!conversionReports?.reports) return [];
    return conversionReports.reports.map((report: any) => ({
      name: report.userName || 'Unknown',
      leads: report.totalLeads || 0,
      converted: report.convertedLeads || 0,
      rate: report.conversionRate || 0,
    }));
  }, [conversionReports]);

  return (
    <>
      {performancePrintOverlay && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white px-8 py-6 shadow-xl dark:border-slate-600 dark:bg-slate-800">
            <div
              className="h-9 w-9 shrink-0 animate-spin rounded-full border-2 border-orange-500 border-t-transparent"
              aria-hidden
            />
            <p className="text-center text-sm font-medium text-slate-800 dark:text-slate-100">{performancePrintOverlay}</p>
          </div>
        </div>
      )}
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-center md:justify-between dark:border-slate-700">
        {/* Page Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Reports</h1>
          {/* <p className="text-sm text-slate-500 dark:text-slate-400">
          Analyze call performance, conversions, and user activity.
        </p> */}
        </div>

        {/* Tabs */}
        <div>
          <nav className="-mb-4 flex space-x-8 overflow-x-auto md:mb-0">
            {(['calls', 'conversions', 'users', 'activityLogs', 'abstract'] as TabType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setActiveTab(tab);
                  const url = new URL(window.location.href);
                  url.searchParams.set('tab', tab);
                  window.history.replaceState({}, '', url.toString());
                }}
                className={`whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors ${activeTab === tab
                  ? 'border-[#f97316] text-[#ea580c] dark:text-[#fb923c]'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                  }`}
              >
                {tab === 'calls' && 'Call Reports'}
                {tab === 'conversions' && 'Conversion Reports'}
                {tab === 'users' && 'User Analytics'}
                {tab === 'activityLogs' && 'Activity Logs'}
                {tab === 'abstract' && 'Leads Abstract'}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Filters & Date Presets */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {activeTab === 'calls' && (
          <>
            <span className="text-sm font-medium text-[#334155] dark:text-[#cbd5e1]">Academic Year</span>
            <select
              value={filters.academicYear}
              onChange={(e) => setFilters({ ...filters, academicYear: e.target.value === '' ? new Date().getFullYear() : Number(e.target.value) })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 mr-2"
            >
              {[2023, 2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <span className="mx-1 text-slate-400 dark:text-slate-500">|</span>
          </>
        )}

        {activeTab === 'abstract' && (
          <>
            <select
              value={filters.abstractStateId}
              onChange={(e) => setFilters({ ...filters, abstractStateId: e.target.value, abstractDistrictId: '' })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 max-w-[150px]"
            >
              <option value="">State: All</option>
              {(abstractStates || []).map((s: { id: string; name: string }) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <select
              value={filters.abstractDistrictId}
              onChange={(e) => setFilters({ ...filters, abstractDistrictId: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 max-w-[150px]"
              disabled={!filters.abstractStateId}
            >
              <option value="">District: All</option>
              {(abstractDistricts || []).map((d: { id: string; name: string }) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>

            <select
              value={filters.academicYear}
              onChange={(e) => setFilters({ ...filters, academicYear: Number(e.target.value) })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700"
            >
              <option value="">Year</option>
              {[2023, 2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <select
              value={filters.studentGroup}
              onChange={(e) => setFilters({ ...filters, studentGroup: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 max-w-[120px]"
            >
              <option value="">Group: All</option>
              <option value="10th">10th</option>
              <option value="Inter">Inter</option>
              <option value="Inter-MPC">Inter-MPC</option>
              <option value="Inter-BIPC">Inter-BIPC</option>
              <option value="Degree">Degree</option>
              <option value="Diploma">Diploma</option>
            </select>
          </>
        )}

        {/* Activity Logs Specific Filters in Top Bar */}
        {activeTab === 'activityLogs' && (
          <>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => {
                setFilters({ ...filters, startDate: e.target.value });
                setDatePreset('custom');
                setActivityLogPage(1);
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              placeholder="Start Date"
            />
            <span className="text-slate-400">-</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => {
                setFilters({ ...filters, endDate: e.target.value });
                setDatePreset('custom');
                setActivityLogPage(1);
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
              placeholder="End Date"
            />
            <select
              value={filters.userId}
              onChange={(e) => {
                setFilters({ ...filters, userId: e.target.value });
                setActivityLogPage(1);
              }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 max-w-[150px]"
            >
              <option value="">All Users</option>
              {activityLogUsers.map((user: any) => (
                <option key={user._id} value={user._id}>
                  {user.name} ({user.roleName})
                </option>
              ))}
            </select>
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>
          </>
        )}

        {activeTab !== 'abstract' && (
          <>
            <span className="text-sm font-medium text-[#334155] dark:text-[#cbd5e1]">Quick Filters:</span>
            {(['today', 'yesterday', 'last7days', 'last30days', 'thisWeek', 'overall'] as DatePreset[]).map((preset) => (
              <button
                key={preset}
                onClick={() => handleDatePreset(preset)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${datePreset === preset
                  ? 'bg-[#2563eb] text-[#ffffff] shadow-sm'
                  : 'bg-[#f1f5f9] text-[#334155] hover:bg-[#e2e8f0] dark:bg-[#334155] dark:text-[#cbd5e1] dark:hover:bg-[#475569]'
                  }`}
              >
                {preset === 'today' && 'Today'}
                {preset === 'yesterday' && 'Yesterday'}
                {preset === 'last7days' && 'Last 7 Days'}
                {preset === 'last30days' && 'Last 30 Days'}
                {preset === 'thisWeek' && 'This Week'}
                {preset === 'overall' && 'Overall'}
              </button>
            ))}
          </>
        )}

        {activeTab === 'calls' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setExportPreviewStartDate(filters.startDate);
              setExportPreviewEndDate(filters.endDate);
              setCallReportExportPreviewOpen(true);
            }}
            disabled={
              !(
                userAnalyticsForUsersTab?.users?.length ||
                performanceTableUsers.length ||
                callReports?.reports?.length
              )
            }
            className="ml-2"
          >
            {callSubTab === 'daily' ? 'Export Daily Call Report (Excel)' : 'Export User Performance Summary (Excel)'}
          </Button>
        )}
      </div>

      {/* Filters – hidden on Call Reports, User Analytics, Leads Abstract AND Activity Logs (since moved to top) */}
      {activeTab !== 'calls' && activeTab !== 'users' && activeTab !== 'abstract' && activeTab !== 'activityLogs' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-[#334155] dark:text-[#cbd5e1] mb-1">Start Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => {
                setFilters({ ...filters, startDate: e.target.value });
                setDatePreset('custom');
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#334155] dark:text-[#cbd5e1] mb-1">End Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => {
                setFilters({ ...filters, endDate: e.target.value });
                setDatePreset('custom');
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#334155] dark:text-[#cbd5e1] mb-1">User/Counsellor</label>
            <select
              value={filters.userId}
              onChange={(e) => {
                setFilters({ ...filters, userId: e.target.value });
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
            >
              <option value="">All Users</option>
              {users.map((user: any) => (
                <option key={user._id} value={user._id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>

          {/* Since activityLogs is excluded above, we don't need this check anymore */}
          <>
            <div>
              <label className="block text-sm font-medium text-[#334155] dark:text-[#cbd5e1] mb-1">Source</label>
              <select
                value={filters.source}
                onChange={(e) => setFilters({ ...filters, source: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              >
                <option value="">All Sources</option>
                {filterOptions?.sources?.map((source: string) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#334155] dark:text-[#cbd5e1] mb-1">Course</label>
              <select
                value={filters.course}
                onChange={(e) => setFilters({ ...filters, course: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              >
                <option value="">All Courses</option>
                {filterOptions?.courses?.map((course: string) => (
                  <option key={course} value={course}>
                    {course}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#334155] dark:text-[#cbd5e1] mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              >
                <option value="">All Statuses</option>
                {filterOptions?.leadStatuses?.map((status: string) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#334155] dark:text-[#cbd5e1] mb-1">District</label>
              <select
                value={filters.district}
                onChange={(e) => setFilters({ ...filters, district: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              >
                <option value="">All Districts</option>
                {filterOptions?.districts?.map((district: string) => (
                  <option key={district} value={district}>
                    {district}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#334155] dark:text-[#cbd5e1] mb-1">Mandal</label>
              <select
                value={filters.mandal}
                onChange={(e) => setFilters({ ...filters, mandal: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              >
                <option value="">All Mandals</option>
                {filterOptions?.mandals?.map((mandal: string) => (
                  <option key={mandal} value={mandal}>
                    {mandal}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#334155] dark:text-[#cbd5e1] mb-1">Academic Year</label>
              <select
                value={filters.academicYear}
                onChange={(e) => setFilters({ ...filters, academicYear: e.target.value === '' ? 2025 : Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              >
                {[2023, 2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#334155] dark:text-[#cbd5e1] mb-1">Student Group</label>
              <select
                value={filters.studentGroup}
                onChange={(e) => setFilters({ ...filters, studentGroup: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700"
              >
                <option value="">All Groups</option>
                <option value="10th">10th</option>
                <option value="Inter">Inter</option>
                <option value="Inter-MPC">Inter-MPC</option>
                <option value="Inter-BIPC">Inter-BIPC</option>
                <option value="Degree">Degree</option>
                <option value="Diploma">Diploma</option>
              </select>
            </div>
          </>
        </div>
      )}

      {/* User Analytics Tab */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          {isLoadingUserAnalyticsTab ? (
            <ReportDashboardSkeleton />
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-lg border border-[#e2e8f0] dark:border-[#475569]">
                <table className="min-w-full divide-y divide-[#e2e8f0] dark:divide-[#475569]">
                  <thead>
                    <tr className="bg-[#475569] dark:bg-[#334155]">
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">User</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Total Leads</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Calls/Visits Done</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">SMS</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Conversion</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800/50">
                    {userAnalyticsForUsersTab?.users?.map((user: any, rowIdx: number) => (
                      <tr key={user.userId} className={`${rowIdx % 2 === 0 ? 'bg-[#ffffff] dark:bg-[#1e293b]/50' : 'bg-[#f8fafc]/80 dark:bg-[#334155]/30'} hover:bg-slate-100 dark:hover:bg-slate-700/50`}>
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                          <div className="flex flex-col">
                            <span>{user.name || user.userName}</span>
                            <span className="text-xs text-slate-500">{user.roleName || 'User'}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.totalAssigned || 0}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.calls?.total ?? 0}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.sms?.total ?? 0}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-900 dark:text-slate-100">{user.convertedLeads ?? 0}</span>
                            <span className={`text-xs ${(user.conversionRate ?? 0) >= 30 ? 'text-green-600' : 'text-slate-500'}`}>
                              ({user.conversionRate ?? 0}%)
                            </span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={async () => {
                                try {
                                  showToast.loading('Fetching assigned leads...');
                                  const response = await leadAPI.getAll({
                                    assignedTo: user.userId,
                                    limit: 10000,
                                    page: 1
                                  });
                                  const leads = response.data?.leads || response.leads || [];

                                  if (leads.length === 0) {
                                    showToast.error('No assigned leads found');
                                    return;
                                  }

                                  const exportData = leads.map((lead: any) => ({
                                    'Lead Name': lead.name,
                                    'Phone Number': lead.phone,
                                    'Remarks': lead.notes || '',
                                  }));

                                  const worksheet = XLSX.utils.json_to_sheet(exportData);
                                  const workbook = XLSX.utils.book_new();
                                  XLSX.utils.book_append_sheet(workbook, worksheet, 'Assigned Leads');
                                  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                                  XLSX.writeFile(workbook, `Assigned_Leads_${user.name || user.userName}_${timestamp}.xlsx`);
                                  showToast.success('Export successful');
                                } catch (error) {
                                  console.error(error);
                                  showToast.error('Failed to export');
                                }
                              }}
                            >
                              Export Leads
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => window.location.href = `/superadmin/users/${user.userId}/leads`}
                            >
                              View Analytics
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Call Reports Tab */}
      {activeTab === 'calls' && (
        <div className="space-y-6">
          {callSubTab === 'daily' && isLoadingCalls ? (
            <ReportDashboardSkeleton />
          ) : callSubTab === 'daily' && callReportsError ? (
            <Card className="p-8 text-center">
              <p className="text-red-600 dark:text-red-400">
                Failed to load reports. {callReportsError ? 'Call reports error.' : ''} Please try again.
              </p>
            </Card>
          ) : (
            <>
              {/* Stats Cards: Daily uses same fast API as the table (`callReports.summary`). Performance uses full user analytics. */}
              {callSubTab === 'daily' ? (
                isLoadingCalls ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <Skeleton key={`calls-daily-stats-skeleton-${i}`} className="h-20 rounded-xl" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    {[
                      {
                        label: 'Users covered',
                        value: dailyCallSummary.usersCovered,
                        style: CALL_REPORT_CARD_STYLES[0],
                      },
                      {
                        label: 'Total Calls/Visits Done',
                        value: dailyCallSummary.totalCalls,
                        style: CALL_REPORT_CARD_STYLES[1],
                      },
                      {
                        label: 'Total duration',
                        value: formatSecondsToMMSS(dailyCallSummary.totalDuration),
                        style: CALL_REPORT_CARD_STYLES[2],
                      },
                      {
                        label: 'Avg calls / user',
                        value:
                          dailyCallSummary.usersCovered > 0
                            ? (dailyCallSummary.totalCalls / dailyCallSummary.usersCovered).toFixed(1)
                            : '0.0',
                        style: CALL_REPORT_CARD_STYLES[3],
                      },
                    ].map((item, i) => (
                      <div key={i} className={`overflow-hidden rounded-xl border-0 ${item.style} p-4 shadow-lg`}>
                        <p className="text-sm font-semibold uppercase tracking-wider text-white/90">{item.label}</p>
                        <p className="mt-2 text-2xl font-bold text-white drop-shadow-sm">{item.value}</p>
                      </div>
                    ))}
                  </div>
                )
              ) : isLoadingPerformanceUserList ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={`calls-stats-skeleton-${i}`} className="h-20 rounded-xl" />
                  ))}
                </div>
              ) : performanceTableUsers.length > 0 ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                  {[
                    {
                      label: 'Total users',
                      value:
                        performanceSummaryTotals?.userCount ??
                        performanceUserAnalyticsData?.pagination?.total ??
                        performanceTableUsers.length,
                      style: CALL_REPORT_CARD_STYLES[0],
                    },
                    {
                      label: 'Total assigned leads',
                      value:
                        performanceSummaryTotals != null
                          ? performanceSummaryTotals.totalAssignedLeads
                          : performanceTableUsers.reduce((sum: number, u: any) => sum + getPerformanceTotalLeadsDisplay(u), 0),
                      style: CALL_REPORT_CARD_STYLES[1],
                    },
                    {
                      label: 'Total interested',
                      value:
                        performanceSummaryTotals != null
                          ? performanceSummaryTotals.totalInterested
                          : performanceTableUsers.reduce((sum: number, u: any) => sum + Number(u?.interested ?? 0), 0),
                      style: CALL_REPORT_CARD_STYLES[2],
                    },
                    {
                      label: 'Total callbacks / revisits',
                      value: performanceSummaryTotals != null ? performanceSummaryTotals.totalCallbacksRevisits : 0,
                      style: CALL_REPORT_CARD_STYLES[3],
                    },
                    {
                      label: 'Total unattended (reclaimed)',
                      value: performanceSummaryTotals != null ? performanceSummaryTotals.totalUnattended : 0,
                      style: CALL_REPORT_CARD_STYLES[4],
                    },
                  ].map((item, i) => (
                    <div key={i} className={`overflow-hidden rounded-xl border-0 ${item.style} p-4 shadow-lg`}>
                      <p className="text-sm font-semibold uppercase tracking-wider text-white/90">{item.label}</p>
                      <p className="mt-2 text-2xl font-bold text-white drop-shadow-sm">{item.value}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {callSubTab === 'performance' && !isLoadingPerformanceUserList && performanceUserListError && (
                <Card className="p-3">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    User performance stats are still loading. Please refresh if this persists.
                  </p>
                </Card>
              )}

              {/* Inner Sub-Tabs: Daily Call Report | User Performance Summary */}
              <div className="border-b border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between gap-3">
                  <nav className="flex space-x-6">
                    <button
                      onClick={() => {
                        setCallSubTab('daily');
                        handleDatePreset('today');
                      }}
                      className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                        callSubTab === 'daily'
                          ? 'border-[#f97316] text-[#ea580c] dark:text-[#fb923c]'
                          : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                      }`}
                    >
                      Daily Call Report
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCallSubTab('performance');
                        handleDatePreset('overall');
                      }}
                      onMouseEnter={prefetchUserPerformanceSummary}
                      onFocus={prefetchUserPerformanceSummary}
                      className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                        callSubTab === 'performance'
                          ? 'border-[#f97316] text-[#ea580c] dark:text-[#fb923c]'
                          : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
                      }`}
                    >
                      User Performance Summary
                    </button>
                  </nav>

                  {/* Daily sub-tab controls */}
                  {callSubTab === 'daily' && (
                    <div className="flex flex-wrap items-end gap-3 pb-1">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 px-0.5">
                          Division
                        </span>
                        <select
                          value={dailyDivision}
                          onChange={(e) => setDailyDivision(e.target.value)}
                          aria-label="Filter by division"
                          className="h-8 min-w-[8.5rem] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <option value="">All divisions</option>
                          {performanceFilterOptions.divisions.map((d) => (
                            <option key={`daily-div-${d}`} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 px-0.5">
                          Department
                        </span>
                        <select
                          value={dailyDepartment}
                          onChange={(e) => setDailyDepartment(e.target.value)}
                          aria-label="Filter by department"
                          className="h-8 min-w-[8.5rem] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <option value="">All departments</option>
                          {performanceFilterOptions.departments.map((d) => (
                            <option key={`daily-dept-${d}`} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 px-0.5">
                          Student group
                        </span>
                        <select
                          value={dailyStudentGroup}
                          onChange={(e) => setDailyStudentGroup(e.target.value)}
                          aria-label="Filter calls by lead student group (leads.student_group)"
                          className="h-8 min-w-[8.5rem] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <option value="">All student groups</option>
                          {callReportStudentGroupOptions.map((g: string) => (
                            <option key={`daily-sg-${g}`} value={g}>{g}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 px-0.5">
                          Page size
                        </span>
                        <select
                          value={String(dailyLimit)}
                          onChange={(e) => {
                            const nextLimit = Number(e.target.value) || 50;
                            setExpandedDailyUsers(new Set());
                            setDailyLimit(nextLimit);
                            setDailyPage(1);
                          }}
                          aria-label="Rows per page"
                          className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <option value="25">25 / page</option>
                          <option value="50">50 / page</option>
                          <option value="100">100 / page</option>
                        </select>
                      </div>
                      {/* Date range label */}
                      {filters.startDate && filters.endDate && (
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 whitespace-nowrap">
                          {format(new Date(filters.startDate), 'dd MMM yyyy')}
                          <span className="mx-1 text-slate-400">→</span>
                          {format(new Date(filters.endDate), 'dd MMM yyyy')}
                        </span>
                      )}
                      {callReports?.reports && callReports.reports.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const daily = callReports?.reports || [];
                            if (daily.length === 0) return;

                          // Group and sort data
                          const grouped: { userName: string; rows: any[]; fullUser: any }[] = [];
                          const seen = new Map<string, number>();

                          daily.forEach((r: any) => {
                            const fullUser = users.find((u: any) => u._id === r.userId || u.name === r.userName);
                            if (!seen.has(r.userName)) {
                              seen.set(r.userName, grouped.length);
                              grouped.push({ userName: r.userName, rows: [r], fullUser });
                            } else {
                              grouped[seen.get(r.userName)!].rows.push(r);
                            }
                          });
                          grouped.forEach((g) => {
                            g.rows.sort((a: any, b: any) => {
                              if (a?.rangeAggregate || b?.rangeAggregate) return 0;
                              const ta = a?.date ? new Date(a.date).getTime() : 0;
                              const tb = b?.date ? new Date(b.date).getTime() : 0;
                              return ta - tb;
                            });
                          });

                          const dateLabelForDailyExport = (r: any) => {
                            if (r?.rangeAggregate && filters.startDate && filters.endDate) {
                              const a = format(new Date(filters.startDate), 'dd MMM yyyy');
                              const b = format(new Date(filters.endDate), 'dd MMM yyyy');
                              const same = filters.startDate === filters.endDate;
                              const rangeStr = same ? a : `${a} – ${b}`;
                              const dwa = typeof r.daysWithActivity === 'number' && r.daysWithActivity > 0
                                ? ` (${r.daysWithActivity} day${r.daysWithActivity !== 1 ? 's' : ''} with activity)`
                                : '';
                              return `${rangeStr}${dwa}`;
                            }
                            if (!r?.date) return '—';
                            return format(new Date(r.date), 'dd MMM yyyy');
                          };

                          // Build flat data rows
                          const allRows = grouped.flatMap(g =>
                            g.rows.map((r: any) => ({
                              User: g.userName || '—',
                              Division: g.fullUser?.division || '—',
                              Department: g.fullUser?.department || '—',
                              'Employee group (HRMS)': g.fullUser?.group || '—',
                              Role: g.fullUser?.roleName || '—',
                              Date: dateLabelForDailyExport(r),
                              'Calls/Visits Done': r.callCount ?? 0,
                              'Total Duration': formatSecondsToMMSS(r.totalDuration ?? 0),
                              'Avg Duration': formatSecondsToMMSS(r.averageDuration ?? 0),
                            }))
                          );

                          // Prepare display data with cleared redundant cells
                          const displayData = allRows.map((row: any, idx: number) => {
                            const newRow = { ...row };
                            if (idx > 0 && allRows[idx - 1].User === row.User) {
                              newRow.User = "";
                              newRow.Division = "";
                              newRow.Department = "";
                              newRow['Employee group (HRMS)'] = "";
                            }
                            return newRow;
                          });

                          // Generate worksheet & merges
                          const worksheet = XLSX.utils.json_to_sheet(displayData);
                          const merges: XLSX.Range[] = [];
                          let startIdx = 0;
                          while (startIdx < allRows.length) {
                            const userName = allRows[startIdx].User;
                            let endIdx = startIdx;
                            while (endIdx + 1 < allRows.length && allRows[endIdx + 1].User === userName) {
                              endIdx++;
                            }

                            if (endIdx > startIdx) {
                              for (let col = 0; col <= 3; col++) {
                                merges.push({
                                  s: { r: startIdx + 1, c: col },
                                  e: { r: endIdx + 1, c: col }
                                });
                              }
                            }
                            startIdx = endIdx + 1;
                          }
                          worksheet['!merges'] = merges;

                          // Column sizing
                          const cols = Object.keys(allRows[0]).map(key => ({
                            wch: Math.max(key.length, ...allRows.map((r: any) => String(r[key] ?? '').length)) + 5
                          }));
                          worksheet['!cols'] = cols;

                          const workbook = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(workbook, worksheet, 'Daily Call Report');
                          XLSX.writeFile(workbook, `daily-call-reports-${filters.startDate}-${filters.endDate}.xlsx`);
                          }}
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
                          Export Excel
                        </Button>
                      )}
                    </div>
                  )}
                  {callSubTab === 'performance' && (
                    <div className="flex flex-wrap items-end gap-2 pb-1">
                      <div className="relative flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 px-0.5">
                          Search
                        </span>
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={performanceSearch}
                            onChange={(e) => setPerformanceSearch(e.target.value)}
                            placeholder="User name or email"
                            className="h-8 w-40 rounded-md border border-slate-300 bg-white pl-7 pr-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 px-0.5">
                          Role
                        </span>
                        <select
                          value={performanceRole}
                          onChange={(e) => setPerformanceRole(e.target.value)}
                          className="h-8 min-w-[9.5rem] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                          aria-label="Filter by role"
                        >
                          <option value="">All roles</option>
                          {performanceFilterOptions.roles.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 px-0.5">
                          Division
                        </span>
                        <select
                          value={performanceDivision}
                          onChange={(e) => setPerformanceDivision(e.target.value)}
                          aria-label="Filter by division"
                          className="h-8 min-w-[8.5rem] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <option value="">All divisions</option>
                          {performanceFilterOptions.divisions.map((d) => (
                            <option key={`perf-div-${d}`} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 px-0.5">
                          Department
                        </span>
                        <select
                          value={performanceDepartment}
                          onChange={(e) => setPerformanceDepartment(e.target.value)}
                          aria-label="Filter by department"
                          className="h-8 min-w-[8.5rem] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <option value="">All departments</option>
                          {performanceFilterOptions.departments.map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 px-0.5">
                          Student group
                        </span>
                        <select
                          value={performanceStudentGroup}
                          onChange={(e) => setPerformanceStudentGroup(e.target.value)}
                          aria-label="Filter users with portfolio leads in this student group"
                          className="h-8 min-w-[8.5rem] rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                        >
                          <option value="">All student groups</option>
                          {callReportStudentGroupOptions.map((g: string) => (
                            <option key={`perf-sg-${g}`} value={g}>{g}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex self-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handlePrintPerformanceDetails()}
                        >
                          Print Detailed Report
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400"
                          onClick={handleExportPerformanceSummaryExcel}
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" />
                          Export Excel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Daily Call Report Sub-Tab */}
              {callSubTab === 'daily' && (
                callReports?.reports && callReports.reports.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-[#e2e8f0] dark:divide-[#475569]">
                          <thead>
                            <tr className="bg-[#475569] dark:bg-[#334155]">
                              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">User</th>
                              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Department</th>
                              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Group</th>
                              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                                {callReports.reports.some((r: any) => r?.rangeAggregate) ? 'Period' : 'Date'}
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Calls/Visits Done</th>
                              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Total Duration</th>
                              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Avg Duration</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#e2e8f0] dark:divide-[#475569]">
                            {(() => {
                              // Group reports by userName, preserving first-appearance order
                              const grouped: { userName: string; rows: any[]; fu: any }[] = [];
                              const seen = new Map<string, number>();
                              callReports.reports.forEach((r: any) => {
                                const fu = users.find((u: any) => u._id === r.userId || u.name === r.userName);
                                if (!seen.has(r.userName)) {
                                  seen.set(r.userName, grouped.length);
                                  grouped.push({ userName: r.userName, rows: [r], fu });
                                } else {
                                  grouped[seen.get(r.userName)!].rows.push(r);
                                }
                              });

                              const formatDailyDateCell = (r: any) => {
                                if (r?.rangeAggregate && filters.startDate && filters.endDate) {
                                  const a = format(new Date(filters.startDate), 'dd MMM yyyy');
                                  const b = format(new Date(filters.endDate), 'dd MMM yyyy');
                                  const same = filters.startDate === filters.endDate;
                                  return (
                                    <div className="flex flex-col gap-0.5">
                                      <span>{same ? a : `${a} – ${b}`}</span>
                                      {typeof r.daysWithActivity === 'number' && r.daysWithActivity > 0 && (
                                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                          {r.daysWithActivity} day{r.daysWithActivity !== 1 ? 's' : ''} with activity
                                        </span>
                                      )}
                                    </div>
                                  );
                                }
                                if (!r?.date) return <span className="text-slate-400">—</span>;
                                return <span>{format(new Date(r.date), 'dd MMM yyyy')}</span>;
                              };

                              return grouped.flatMap((group, gIdx) => {
                                const isMultiDay = group.rows.length > 1 && !group.rows[0]?.rangeAggregate;
                                const isExpanded = expandedDailyUsers.has(group.userName);
                                const rowBg = gIdx % 2 === 0
                                  ? 'bg-[#ffffff] dark:bg-[#1e293b]/50'
                                  : 'bg-[#f8fafc]/80 dark:bg-[#334155]/30';

                                // ── Single row per user (date filter = cumulative from API, or one calendar day) ──
                                if (!isMultiDay) {
                                  const r = group.rows[0];
                                  return [(
                                    <tr key={group.userName} className={`${rowBg} hover:bg-slate-50 dark:hover:bg-slate-700/50`}>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900 dark:text-slate-100 border-r border-slate-100 dark:border-slate-700">{group.userName}</td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400 border-r border-slate-100 dark:border-slate-700">{group.fu?.department || '—'}</td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400 border-r border-slate-100 dark:border-slate-700">{group.fu?.group || '—'}</td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700 dark:text-slate-300">{formatDailyDateCell(r)}</td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{r.callCount}</td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{formatSecondsToMMSS(Number(r.totalDuration) || 0)}</td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{formatSecondsToMMSS(Number(r.averageDuration) || 0)}</td>
                                    </tr>
                                  )];
                                }

                                // ── Overall mode: multiple calendar rows per user — collapsed summary + expandable per-day ──
                                const totalCalls    = group.rows.reduce((s: number, row: any) => s + (Number(row.callCount)    || 0), 0);
                                const totalDuration = group.rows.reduce((s: number, row: any) => s + (Number(row.totalDuration) || 0), 0);
                                const avgDuration   = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

                                const toggleExpand = () =>
                                  setExpandedDailyUsers(prev => {
                                    const n = new Set(prev);
                                    if (n.has(group.userName)) n.delete(group.userName); else n.add(group.userName);
                                    return n;
                                  });

                                if (!isExpanded) {
                                  return [(
                                    <tr
                                      key={`${group.userName}-summary`}
                                      className={`${rowBg} cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors`}
                                      onClick={toggleExpand}
                                    >
                                      <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900 dark:text-slate-100 border-r border-slate-100 dark:border-slate-700">
                                        <div className="flex items-center gap-2">
                                          <ChevronDown className="w-3.5 h-3.5 -rotate-90 text-orange-400 flex-shrink-0 transition-transform" />
                                          {group.userName}
                                        </div>
                                      </td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400 border-r border-slate-100 dark:border-slate-700">{group.fu?.department || '—'}</td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400 border-r border-slate-100 dark:border-slate-700">{group.fu?.group || '—'}</td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm">
                                        <span className="inline-flex items-center rounded-full bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 text-xs font-medium text-orange-600 dark:text-orange-400">
                                          {group.rows.length} days
                                        </span>
                                      </td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900 dark:text-slate-100">{totalCalls}</td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{formatSecondsToMMSS(totalDuration)}</td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{formatSecondsToMMSS(avgDuration)}</td>
                                    </tr>
                                  )];
                                }

                                return group.rows.map((report: any, rIdx: number) => (
                                  <tr key={`${group.userName}-${rIdx}`} className={`${rowBg} hover:bg-slate-50 dark:hover:bg-slate-700/50`}>
                                    {rIdx === 0 && (
                                      <>
                                        <td
                                          rowSpan={group.rows.length}
                                          className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-slate-900 dark:text-slate-100 align-top border-r border-slate-100 dark:border-slate-700 cursor-pointer"
                                          onClick={toggleExpand}
                                        >
                                          <div className="flex items-center gap-2">
                                            <ChevronDown className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 transition-transform" />
                                            {group.userName}
                                          </div>
                                        </td>
                                        <td rowSpan={group.rows.length} className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400 align-top border-r border-slate-100 dark:border-slate-700">{group.fu?.department || '—'}</td>
                                        <td rowSpan={group.rows.length} className="whitespace-nowrap px-6 py-4 text-sm text-slate-500 dark:text-slate-400 align-top border-r border-slate-100 dark:border-slate-700">{group.fu?.group || '—'}</td>
                                      </>
                                    )}
                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700 dark:text-slate-300">{formatDailyDateCell(report)}</td>
                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{report.callCount}</td>
                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{formatSecondsToMMSS(report.totalDuration)}</td>
                                    <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{formatSecondsToMMSS(report.averageDuration)}</td>
                                  </tr>
                                ));
                              });
                            })()}
                          </tbody>
                        </table>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Showing page {callReports?.pagination?.page || 1} of {callReports?.pagination?.pages || 1}
                        {' '}({callReports?.pagination?.total || 0} rows)
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={(callReports?.pagination?.page || 1) <= 1}
                          onClick={() => {
                            setExpandedDailyUsers(new Set());
                            setDailyPage((prev) => Math.max(prev - 1, 1));
                          }}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={(callReports?.pagination?.page || 1) >= (callReports?.pagination?.pages || 1)}
                          onClick={() => {
                            setExpandedDailyUsers(new Set());
                            setDailyPage((prev) => prev + 1);
                          }}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                    <Card className="p-4 border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Daily Calls Ranking</h4>
                        <span className="text-xs text-slate-500">Top to least by Calls/Visits Done</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-700">
                              <th className="text-left py-2">Rank</th>
                              <th className="text-left py-2">User</th>
                              <th className="text-left py-2">Calls/Visits Done</th>
                              <th className="text-left py-2">Avg Duration</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailyCallSummary.ranking.map((u: any, idx: number) => (
                              <tr key={`${u.userId}-${idx}`} className="border-b border-slate-100 dark:border-slate-800">
                                <td className="py-2">{idx + 1}</td>
                                <td className="py-2">{u.userName}</td>
                                <td className="py-2 font-semibold">{u.calls}</td>
                                <td className="py-2">{formatSecondsToMMSS(u.avgDuration)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  </>
                ) : (
                  <Card className="p-8 text-center">
                    <p className="text-slate-500 dark:text-slate-400">No call reports found for the selected period.</p>
                  </Card>
                )
              )}

              {/* User Performance Summary Sub-Tab */}
              {callSubTab === 'performance' && (
                isLoadingPerformanceUserList || isFetchingPerformanceUserList ? (
                  <Card className="p-10">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">Loading user performance summary...</p>
                    </div>
                  </Card>
                ) : performanceTableUsers.length > 0 ? (
                  <div className="space-y-4">
                    {performanceAnalyticsError && (
                      <Card className="p-3">
                        <p className="text-xs text-red-600 dark:text-red-400">
                          Some expanded user details failed to load. Collapse and expand again to retry.
                        </p>
                      </Card>
                    )}
                    <div className="overflow-x-auto rounded-lg border border-[#e2e8f0] dark:border-[#475569]">
                      <table className="min-w-full divide-y divide-[#e2e8f0] dark:divide-[#475569]">
                        <thead>
                          <tr className="bg-[#475569] dark:bg-[#334155]">
                            <th className="w-52 px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">User</th>
                            <th
                              className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white"
                              title="Student Counselor / PRO: sum of date-wise Total Allotted (same lead may appear in multiple buckets). Other roles: portfolio leads handled."
                            >
                              Total Leads
                            </th>
                            <th
                              className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white"
                              title="Student Counselor / PRO: sum of period-allotted cohort by current call/visit status, excluding Assigned (matches expanded footer). Other roles: distinct leads with any outcome call in the activity window."
                            >
                              {datePreset === 'today' ? 'Today Calls/Visits Done' :
                                datePreset === 'yesterday' ? 'Yesterday Calls/Visits Done' :
                                  datePreset === 'last7days' ? 'Last 7 Days Calls/Visits Done' :
                                    datePreset === 'last30days' ? 'Last 30 Days Calls/Visits Done' :
                                      datePreset === 'thisWeek' ? 'This Week Calls/Visits Done' :
                                        datePreset === 'thisMonth' ? 'This Month Calls/Visits Done' :
                                          datePreset === 'lastMonth' ? 'Last Month Calls/Visits Done' :
                                            datePreset === 'custom' ? 'Custom Range Calls/Visits Done' :
                                              'Calls/Visits Done'}
                            </th>
                            <th
                              className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white"
                              title="Student Counselor / PRO: Total Leads (bucket sum) − Calls/Visits Done, minimum 0. Other roles: portfolio-style pending balance."
                            >
                              Balance
                            </th>
                            <th
                              className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white"
                              title="Student Counselor: Interested + CET Applied on period-allotted cohort (current call_status). PRO: Interested on cohort (current visit_status). Other roles: Interested + CET Applied from pipeline status-change counts in the period."
                            >
                              Interested Leads
                            </th>
                            <th
                              className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white"
                              title="Student Counselor only: leads in the period-allotted cohort whose current call_status is Visited (cumulative bucket count). Other roles: not applicable."
                            >
                              Visited
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Confirmed</th>
                            <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">Admitted</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800/50">
                          {performanceTableUsers.map((user: any, rowIdx: number) => {
                            const fu = users.find((fu: any) => fu._id === user.userId || fu.name === (user.name || user.userName));
                            const baseRowBg = rowIdx % 2 === 0 ? 'bg-[#ffffff] dark:bg-[#1e293b]/50' : 'bg-[#f8fafc]/80 dark:bg-[#334155]/30';
                            const userLabel = user.name || user.userName;
                            const isExpanded = expandedPerformanceUsers.has(user.userId);
                            const detailUser = expandedPerformanceDetailsMap?.[user.userId];
                            const assignmentsByDate = Array.isArray(detailUser?.assignmentsByDate) ? detailUser.assignmentsByDate : [];
                            const expandedMode = getPerformanceExpandedMode(user.roleName, fu?.roleName, detailUser?.roleName);
                            const reclaimedTotal = Number(user.reclaimedUniqueLeads || 0);
                            const canExpand = true;
                            const toggleExpand = () =>
                              setExpandedPerformanceUsers((prev) => {
                                const next = new Set(prev);
                                if (next.has(user.userId)) {
                                  next.delete(user.userId);
                                } else {
                                  next.add(user.userId);
                                }
                                return next;
                              });

                            return (
                              <Fragment key={user.userId}>
                                <tr
                                  className={`${baseRowBg} hover:bg-slate-100 dark:hover:bg-slate-700/50 ${canExpand ? 'cursor-pointer' : ''}`}
                                  onClick={canExpand ? toggleExpand : undefined}
                                >
                                  <td className="w-52 px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                                    <div className="flex items-center gap-2 min-w-0">
                                      {canExpand ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleExpand();
                                          }}
                                          className="inline-flex items-center justify-center rounded p-0.5 hover:bg-slate-200/70 dark:hover:bg-slate-700"
                                          aria-label={isExpanded ? `Collapse ${userLabel}` : `Expand ${userLabel}`}
                                        >
                                          <ChevronDown className={`w-3.5 h-3.5 text-orange-400 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                                        </button>
                                      ) : (
                                        <span className="w-4 h-4 inline-block" />
                                      )}
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="truncate">{userLabel}</span>
                                          <span
                                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                              user.isActive
                                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                                                : 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300'
                                            }`}
                                          >
                                            {user.isActive ? 'Active' : 'Inactive'}
                                          </span>
                                        </div>
                                        <div className="mt-1 text-xs font-normal text-slate-500 dark:text-slate-400">
                                          {(user.department || fu?.department || '—')} | {(user.designation || fu?.designation || '—')} | {(user.group || fu?.group || '—')}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                                    {getPerformanceTotalLeadsDisplay(user)}
                                  </td>
                                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.calls?.total ?? 0}</td>
                                  <td className="whitespace-nowrap px-6 py-4 text-sm">
                                    <div className="flex flex-col items-start gap-1">
                                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                                        {getPerformanceBalanceDisplay(user)}
                                      </span>
                                      {reclaimedTotal > 0 && (
                                        <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                                          Date rows with unattended: {reclaimedTotal}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.interested ?? 0}</td>
                                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">
                                    {String(user.roleName || '').trim() === 'Student Counselor'
                                      ? (user.visitedCumulative ?? 0)
                                      : '—'}
                                  </td>
                                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.convertedLeads ?? 0}</td>
                                  <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{user.admittedLeads ?? user.statusBreakdown?.Admitted ?? 0}</td>
                                </tr>
                                {isExpanded && (
                                  <tr className={`${baseRowBg}`}>
                                    <td colSpan={8} className="px-6 py-4 border-t border-slate-200/70 dark:border-slate-700">
                                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/30 p-4">
                                        {!detailUser ? (
                                          <div className="py-5 text-center text-xs text-slate-500 dark:text-slate-400">
                                            Loading date-wise assignment details...
                                          </div>
                                        ) : (
                                          <>
                                        {expandedMode === 'counsellor'
                                          ? (() => {
                                              const pc = detailUser?.expandedAssignmentDiagnostics?.performanceCohort as
                                                | {
                                                    allottedDistinctLeads?: number;
                                                    allottedByCallStatus?: Record<string, unknown>;
                                                    periodBalanceByPortfolioRule?: number;
                                                  }
                                                | undefined;
                                              const allottedMap = foldOutcomeCallMapToCanonical(pc?.allottedByCallStatus);
                                              const allottedDisplayMap = mergeNotAnsweredIntoCallBackForCounsellorDisplay(allottedMap);
                                              const knownCols = COUNSELLOR_CALL_STATUS_COLUMNS as unknown as string[];
                                              const expandedCols = COUNSELLOR_CALL_STATUS_COLUMNS_EXPANDED as unknown as string[];
                                              const allottedTotal = Number(pc?.allottedDistinctLeads ?? 0);
                                              /** Sum of per–date/target row totals; can exceed allottedTotal when the same lead appears in multiple buckets. */
                                              const sumBucketTotalAllotted = assignmentsByDate.reduce(
                                                (s: number, day: any) => s + Number(day?.totalAssigned ?? 0),
                                                0
                                              );
                                              const otherAllotted = sumDistinctOutcomeCallOutsideKnown(allottedMap, knownCols);
                                              const sumAllottedCols =
                                                expandedCols.reduce(
                                                  (s, col) => s + countDistinctOutcomeCallByStatus(allottedDisplayMap, col),
                                                  0
                                                ) + otherAllotted;
                                              const allottedOk = allottedTotal <= 0 || sumAllottedCols === allottedTotal;
                                              return (
                                                <>
                                                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                                    <div className="min-w-0">
                                                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                                        Date-wise simplified assignment summary
                                                      </h4>
                                                      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                                                        Columns by role: call_status (Student Counselor)
                                                      </p>
                                                    </div>
                                                    <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                                                      {assignmentsByDate.length} row{assignmentsByDate.length !== 1 ? 's' : ''}
                                                      <span className="text-slate-400 dark:text-slate-500">
                                                        {' '}
                                                        — one row per allotted date and target date
                                                      </span>
                                                    </span>
                                                  </div>
                                                  {!pc ? (
                                                    <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">
                                                      Period totals unavailable — collapse and expand again, or refresh. Student Counselor analytics must load
                                                      assignment details.
                                                    </p>
                                                  ) : null}
                                                  <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60">
                                                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs">
                                                      <thead className="bg-slate-100 dark:bg-slate-800">
                                                        <tr>
                                                          <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">
                                                            Allotted Date
                                                          </th>
                                                          <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">
                                                            Target Date
                                                          </th>
                                                          <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">
                                                            Student Group Assigned
                                                          </th>
                                                          <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">
                                                            Mandal Assigned
                                                          </th>
                                                          <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">
                                                            Total Allotted
                                                          </th>
                                                          {COUNSELLOR_CALL_STATUS_COLUMNS_EXPANDED.map((col) => (
                                                            <th
                                                              key={col}
                                                              className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap"
                                                              title="call_status"
                                                            >
                                                              {col}
                                                            </th>
                                                          ))}
                                                          <th
                                                            className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap"
                                                            title="Distinct students in this bucket with call_status Assigned (matches the Assigned column total for this row)"
                                                          >
                                                            Balance
                                                          </th>
                                                          <th
                                                            className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200"
                                                            title="Unattended (reclaimed) — distinct leads in this allotment row later taken back from this user; reclaim time may be outside the report range."
                                                          >
                                                            Unattended
                                                          </th>
                                                        </tr>
                                                      </thead>
                                                      <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                                        {assignmentsByDate.length > 0 ? (
                                                          assignmentsByDate.map((day: any) => {
                                                            const targetDateEntries = Object.entries(day.targetDateCounts || {}).sort((a: any, b: any) =>
                                                              String(a[0]).localeCompare(String(b[0]))
                                                            );
                                                            const targetDateText = targetDateEntries.length
                                                              ? targetDateEntries
                                                                  .map(
                                                                    ([targetDate, count]) =>
                                                                      `${format(new Date(String(targetDate)), 'dd MMM yyyy')} (${Number(count) || 0})`
                                                                  )
                                                                  .join(', ')
                                                              : '—';
                                                            return (
                                                              <tr key={`${user.userId}-${day.detailRowKey || day.date}`}>
                                                                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                                                                  {day.date ? format(new Date(day.date), 'dd MMM yyyy') : 'Unknown'}
                                                                </td>
                                                                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{targetDateText}</td>
                                                                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                                                                  {formatAssignedStudentGroups(day)}
                                                                </td>
                                                                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                                                                  {formatAssignedMandals(day)}
                                                                </td>
                                                                <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                                                                  {Number(day?.totalAssigned || 0)}
                                                                </td>
                                                                {COUNSELLOR_CALL_STATUS_COLUMNS_EXPANDED.map((col) => (
                                                                  <td
                                                                    key={col}
                                                                    className="px-3 py-2 text-slate-900 dark:text-slate-100 tabular-nums"
                                                                  >
                                                                    {getCounsellorCallStatusCountForDisplay(day, col)}
                                                                  </td>
                                                                ))}
                                                                <td className="bg-slate-50/90 px-3 py-2 text-slate-900 tabular-nums dark:bg-slate-900/50 dark:text-slate-100">
                                                                  {getCounsellorAssignmentBalanceForDay(day)}
                                                                </td>
                                                                <td className="px-3 py-2 text-amber-700 dark:text-amber-300">
                                                                  {Number(day?.reclaimedCount || 0)}
                                                                </td>
                                                              </tr>
                                                            );
                                                          })
                                                        ) : (
                                                          <tr>
                                                            <td
                                                              colSpan={counsellorExpandedAssignmentColSpan}
                                                              className="px-3 py-3 text-center text-slate-500 dark:text-slate-400"
                                                            >
                                                              No date-wise assignment history found for the selected filters.
                                                            </td>
                                                          </tr>
                                                        )}
                                                      </tbody>
                                                      {pc ? (
                                                        <tfoot>
                                                          <tr className="border-t-2 border-slate-300 bg-slate-100/95 dark:border-slate-600 dark:bg-slate-800/90">
                                                            <td colSpan={4} className="px-3 py-2 align-top">
                                                              <div className="font-semibold text-slate-900 dark:text-slate-100">Leads allotted (period)</div>
                                                              <div className="mt-0.5 text-[10px] font-normal text-slate-500 dark:text-slate-400">
                                                                Distinct leads with an assignment to you in the selected period; cells use current
                                                                call_status. <strong className="font-medium text-slate-700 dark:text-slate-300">Not Answered</strong> is
                                                                merged into <strong className="font-medium text-slate-700 dark:text-slate-300">Call Back</strong> (no separate
                                                                column).
                                                                {!allottedOk && allottedTotal > 0 && (
                                                                  <span className="text-amber-700 dark:text-amber-300">
                                                                    {' '}
                                                                    (status sum {sumAllottedCols} ≠ distinct total {allottedTotal})
                                                                  </span>
                                                                )}
                                                                {sumBucketTotalAllotted > allottedTotal && allottedTotal > 0 && (
                                                                  <span className="mt-1 block text-slate-600 dark:text-slate-400">
                                                                    Sum of row “Total Allotted” ({sumBucketTotalAllotted}) is higher than {allottedTotal}{' '}
                                                                    because rows are per allotted/target bucket — the same student can be counted in more than
                                                                    one row if they have multiple allotments in the period.
                                                                  </span>
                                                                )}
                                                              </div>
                                                            </td>
                                                            <td className="px-3 py-2 tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                                                              {allottedTotal}
                                                            </td>
                                                            {COUNSELLOR_CALL_STATUS_COLUMNS_EXPANDED.map((col) => (
                                                              <td
                                                                key={`foot-${col}`}
                                                                className="px-3 py-2 tabular-nums font-semibold text-slate-900 dark:text-slate-100"
                                                              >
                                                                {countDistinctOutcomeCallByStatus(allottedDisplayMap, col)}
                                                              </td>
                                                            ))}
                                                            <td
                                                              className="bg-slate-200/90 px-3 py-2 tabular-nums font-semibold text-slate-900 dark:bg-slate-950/60 dark:text-slate-100"
                                                              title="Same formula as main row Balance: bucket-sum allotted − Calls/Visits Done (sum of non-Assigned call_status on distinct cohort)"
                                                            >
                                                              {typeof pc?.periodBalanceByPortfolioRule === 'number' &&
                                                              !Number.isNaN(pc.periodBalanceByPortfolioRule)
                                                                ? pc.periodBalanceByPortfolioRule
                                                                : '—'}
                                                            </td>
                                                            <td className="px-3 py-2 text-slate-400 dark:text-slate-500">—</td>
                                                          </tr>
                                                        </tfoot>
                                                      ) : null}
                                                    </table>
                                                  </div>
                                                </>
                                              );
                                            })()
                                          : (
                                            <>
                                        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                          <div className="min-w-0">
                                            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                                              Date-wise simplified assignment summary
                                            </h4>
                                            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
                                              {expandedMode === 'pro'
                                                ? 'Columns by role: visit_status (PRO)'
                                                : 'Columns by role: pipeline lead_status'}
                                            </p>
                                          </div>
                                          <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">
                                            {assignmentsByDate.length} row{assignmentsByDate.length !== 1 ? 's' : ''}
                                            <span className="text-slate-400 dark:text-slate-500"> — one row per allotted date and target date</span>
                                          </span>
                                        </div>
                                        <p className="mb-3 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                                          {expandedMode === 'pro'
                                            ? 'Visit status columns (PRO): distinct students per group by current visit_status. Main row Calls/Visits Done and Balance match the period footer (bucket-sum allotted minus non-Assigned visit_status counts).'
                                            : 'Pipeline columns: distinct students per group by lead_status. Calls/Visits Done = distinct leads with logged call outcomes in the period (non-counsellor/PRO staff).'}
                                        </p>
                                        {expandedMode === 'pro' &&
                                        !detailUser?.expandedAssignmentDiagnostics?.performanceCohort?.allottedByVisitStatus ? (
                                          <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">
                                            Period totals unavailable — collapse and expand again, or refresh. PRO analytics require assignment details with
                                            visit_status cohort.
                                          </p>
                                        ) : null}
                                        <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60">
                                          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs">
                                            <thead className="bg-slate-100 dark:bg-slate-800">
                                              <tr>
                                                <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Allotted Date</th>
                                                <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Target Date</th>
                                                <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Student Group Assigned</th>
                                                <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Mandal Assigned</th>
                                                <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Total Allotted</th>
                                                {expandedMode === 'pro' ? (
                                                  <>
                                                    {PRO_VISIT_STATUS_COLUMNS.map((col) => (
                                                      <th key={col} className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap" title="visit_status">
                                                        {col}
                                                      </th>
                                                    ))}
                                                    <th
                                                      className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap"
                                                      title="visit_status Assigned (distinct) in this bucket row"
                                                    >
                                                      Balance
                                                    </th>
                                                  </>
                                                ) : (
                                                  <>
                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200" title="Pipeline lead_status">
                                                      Assigned
                                                    </th>
                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Interested</th>
                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Not Interested</th>
                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Wrong Data</th>
                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Call Back</th>
                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Confirmed</th>
                                                  </>
                                                )}
                                                <th
                                                  className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200"
                                                  title="Unattended (reclaimed) — distinct leads in this row later taken back; reclaim time may be outside the report range."
                                                >
                                                  Unattended
                                                </th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                                              {assignmentsByDate.length > 0 ? assignmentsByDate.map((day: any) => {
                                                const targetDateEntries = Object.entries(day.targetDateCounts || {})
                                                  .sort((a: any, b: any) => String(a[0]).localeCompare(String(b[0])));
                                                const targetDateText = targetDateEntries.length
                                                  ? targetDateEntries
                                                    .map(([targetDate, count]) => `${format(new Date(String(targetDate)), 'dd MMM yyyy')} (${Number(count) || 0})`)
                                                    .join(', ')
                                                  : '—';
                                                return (
                                                  <tr key={`${user.userId}-${day.detailRowKey || day.date}`}>
                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{day.date ? format(new Date(day.date), 'dd MMM yyyy') : 'Unknown'}</td>
                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{targetDateText}</td>
                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{formatAssignedStudentGroups(day)}</td>
                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-200">{formatAssignedMandals(day)}</td>
                                                    <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{Number(day?.totalAssigned || 0)}</td>
                                                    {expandedMode === 'pro' ? (
                                                      <>
                                                        {PRO_VISIT_STATUS_COLUMNS.map((col) => (
                                                          <td key={col} className="px-3 py-2 text-slate-900 dark:text-slate-100 tabular-nums">
                                                            {getProVisitStatusCountForDisplay(day, col)}
                                                          </td>
                                                        ))}
                                                        <td className="bg-slate-50/90 px-3 py-2 text-slate-900 tabular-nums dark:bg-slate-900/50 dark:text-slate-100">
                                                          {getProAssignmentBalanceForDay(day)}
                                                        </td>
                                                      </>
                                                    ) : (
                                                      <>
                                                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{getLeadStatusCount(day, 'Assigned')}</td>
                                                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{getLeadStatusCount(day, 'Interested')}</td>
                                                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{getLeadStatusCount(day, 'Not Interested')}</td>
                                                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{getLeadStatusCount(day, 'Wrong Data')}</td>
                                                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{getLeadStatusCount(day, 'Call Back')}</td>
                                                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{getLeadStatusCount(day, 'Confirmed')}</td>
                                                      </>
                                                    )}
                                                    <td className="px-3 py-2 text-amber-700 dark:text-amber-300">{Number(day?.reclaimedCount || 0)}</td>
                                                  </tr>
                                                );
                                              }) : (
                                                <tr>
                                                  <td
                                                    colSpan={expandedMode === 'pro' ? 13 : 12}
                                                    className="px-3 py-3 text-center text-slate-500 dark:text-slate-400"
                                                  >
                                                    No date-wise assignment history found for the selected filters.
                                                  </td>
                                                </tr>
                                              )}
                                            </tbody>
                                            {expandedMode === 'pro' &&
                                              (() => {
                                                const pc = detailUser?.expandedAssignmentDiagnostics?.performanceCohort as
                                                  | {
                                                      allottedDistinctLeads?: number;
                                                      allottedByVisitStatus?: Record<string, unknown>;
                                                      periodBalanceByPortfolioRule?: number;
                                                    }
                                                  | undefined;
                                                if (!pc?.allottedByVisitStatus) return null;
                                                const visitMap = foldOutcomeVisitMapToCanonical(pc.allottedByVisitStatus);
                                                const allottedTotal = Number(pc.allottedDistinctLeads ?? 0);
                                                const knownVisit = PRO_VISIT_STATUS_COLUMNS as unknown as string[];
                                                const sumAllottedCols = knownVisit.reduce(
                                                  (s, col) => s + countDistinctOutcomeCallByStatus(visitMap, col),
                                                  0
                                                );
                                                const allottedOk = allottedTotal <= 0 || sumAllottedCols === allottedTotal;
                                                const sumBucketTotalAllotted = assignmentsByDate.reduce(
                                                  (s: number, day: any) => s + Number(day?.totalAssigned ?? 0),
                                                  0
                                                );
                                                const periodBalanceFoot =
                                                  typeof pc.periodBalanceByPortfolioRule === 'number' &&
                                                  !Number.isNaN(pc.periodBalanceByPortfolioRule)
                                                    ? pc.periodBalanceByPortfolioRule
                                                    : '—';
                                                return (
                                                  <tfoot>
                                                    <tr className="border-t-2 border-slate-300 bg-slate-100/95 dark:border-slate-600 dark:bg-slate-800/90">
                                                      <td colSpan={4} className="px-3 py-2 align-top">
                                                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                                                          Leads allotted (period)
                                                        </div>
                                                        <div className="mt-0.5 text-[10px] font-normal text-slate-500 dark:text-slate-400">
                                                          Distinct leads with an assignment in the period; cells use current visit_status.
                                                          {!allottedOk && allottedTotal > 0 && (
                                                            <span className="text-amber-700 dark:text-amber-300">
                                                              {' '}
                                                              (status sum {sumAllottedCols} ≠ distinct total {allottedTotal})
                                                            </span>
                                                          )}
                                                          {sumBucketTotalAllotted > allottedTotal && allottedTotal > 0 && (
                                                            <span className="mt-1 block text-slate-600 dark:text-slate-400">
                                                              Sum of row “Total Allotted” ({sumBucketTotalAllotted}) can exceed {allottedTotal} when the same
                                                              student appears in more than one allotted/target row.
                                                            </span>
                                                          )}
                                                        </div>
                                                      </td>
                                                      <td className="px-3 py-2 tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                                                        {allottedTotal}
                                                      </td>
                                                      {PRO_VISIT_STATUS_COLUMNS.map((col) => (
                                                        <td
                                                          key={`pro-foot-${col}`}
                                                          className="px-3 py-2 tabular-nums font-semibold text-slate-900 dark:text-slate-100"
                                                        >
                                                          {countDistinctOutcomeCallByStatus(visitMap, col)}
                                                        </td>
                                                      ))}
                                                      <td
                                                        className="bg-slate-200/90 px-3 py-2 tabular-nums font-semibold text-slate-900 dark:bg-slate-950/60 dark:text-slate-100"
                                                        title="Same as main row Balance"
                                                      >
                                                        {periodBalanceFoot}
                                                      </td>
                                                      <td className="px-3 py-2 text-slate-400 dark:text-slate-500">—</td>
                                                    </tr>
                                                  </tfoot>
                                                );
                                              })()}
                                          </table>
                                        </div>
                                            </>
                                          )}
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {performanceUserAnalyticsData?.pagination &&
                      performanceUserAnalyticsData.pagination.total > 0 && (
                        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            Page {performanceUserAnalyticsData.pagination.page} of{' '}
                            {performanceUserAnalyticsData.pagination.pages} —{' '}
                            {performanceUserAnalyticsData.pagination.total} user
                            {performanceUserAnalyticsData.pagination.total === 1 ? '' : 's'} (showing{' '}
                            {performanceTableUsers.length} on this page)
                          </p>
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                              Rows per page
                              <select
                                value={performanceLimit}
                                onChange={(e) => {
                                  setPerformanceLimit(Number(e.target.value));
                                  setPerformancePage(1);
                                }}
                                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800"
                              >
                                {[10, 25, 50, 100].map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              disabled={performanceUserAnalyticsData.pagination.page <= 1}
                              onClick={() => setPerformancePage((p) => Math.max(1, p - 1))}
                            >
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              type="button"
                              disabled={
                                performanceUserAnalyticsData.pagination.page >=
                                performanceUserAnalyticsData.pagination.pages
                              }
                              onClick={() => setPerformancePage((p) => p + 1)}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      )}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
                      <Card className="p-4">
                        <p className="text-xs text-slate-500">Users (this page)</p>
                        <p className="text-xl font-bold">{performanceSummary.usersCovered}</p>
                      </Card>
                      <Card className="p-4">
                        <p className="text-xs text-slate-500">Assigned leads (this page)</p>
                        <p className="text-xl font-bold">{performanceSummary.totalAssigned}</p>
                      </Card>
                      <Card className="p-4">
                        <p className="text-xs text-slate-500">Interested (this page)</p>
                        <p className="text-xl font-bold">{performanceSummary.totalInterested}</p>
                      </Card>
                      <Card className="p-4">
                        <p className="text-xs text-slate-500">Callbacks / revisits (report total)</p>
                        <p className="text-xl font-bold">
                          {Number(performanceSummaryTotals?.totalCallbacksRevisits ?? 0).toLocaleString()}
                        </p>
                      </Card>
                      <Card className="p-4">
                        <p className="text-xs text-slate-500">Unattended (reclaimed)</p>
                        <p className="text-xl font-bold">
                          {Number(performanceSummaryTotals?.totalUnattended ?? 0).toLocaleString()}
                        </p>
                      </Card>
                    </div>
                    <Card className="p-4 border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">User Performance Ranking</h4>
                        <span className="text-xs text-slate-500">Top to least by Calls/Visits Done</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-700">
                              <th className="text-left py-2">Rank</th>
                              <th className="text-left py-2">User</th>
                              <th className="text-left py-2">Calls/Visits Done</th>
                              <th className="text-left py-2">Interested</th>
                              <th className="text-left py-2">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {performanceSummary.ranking.map((u: any, idx: number) => (
                              <tr key={`${u.userId}-${idx}`} className="border-b border-slate-100 dark:border-slate-800">
                                <td className="py-2">{idx + 1}</td>
                                <td className="py-2">{u.name || u.userName}</td>
                                <td className="py-2 font-semibold">{u.calls?.total ?? 0}</td>
                                <td className="py-2">{u.interested ?? 0}</td>
                                <td className="py-2">{getPerformanceBalanceDisplay(u)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  </div>
                ) : (
                  <Card className="p-8 text-center">
                    <p className="text-slate-500 dark:text-slate-400">No performance data found for the selected filters.</p>
                  </Card>
                )
              )}

              {/* Excel export preview modal (portaled so it appears above header) */}
              {callReportExportPreviewOpen && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50" onClick={() => setCallReportExportPreviewOpen(false)}>
                  <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 space-y-4">
                      <div className="flex justify-between items-center">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <FileSpreadsheet className="w-5 h-5 text-green-600" />
                            Excel Export: {callSubTab === 'daily' ? 'Daily Call Report' : 'User Performance Summary'}
                          </h3>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                            Report will contain the <strong>{callSubTab === 'daily' ? 'Daily Call Report' : 'User Performance'}</strong> sheet.
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">From:</span>
                            <input
                              type="date"
                              value={exportPreviewStartDate}
                              onChange={(e) => setExportPreviewStartDate(e.target.value)}
                              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium dark:border-slate-600 dark:bg-slate-700"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">To:</span>
                            <input
                              type="date"
                              value={exportPreviewEndDate}
                              onChange={(e) => setExportPreviewEndDate(e.target.value)}
                              className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs font-medium dark:border-slate-600 dark:bg-slate-700"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                        <MultiSelectDropdown 
                          label="Division"
                          options={exportFilterOptions.divisions}
                          selected={exportSelectedDivision}
                          onChange={setExportSelectedDivision}
                        />

                        <MultiSelectDropdown 
                          label="Department"
                          options={exportFilterOptions.departments}
                          selected={exportSelectedDepartment}
                          onChange={setExportSelectedDepartment}
                        />

                        <MultiSelectDropdown 
                          label="Group"
                          options={exportFilterOptions.groups}
                          selected={exportSelectedGroup}
                          onChange={setExportSelectedGroup}
                        />

                        <MultiSelectDropdown 
                          label="Role"
                          options={exportFilterOptions.roles}
                          selected={exportSelectedRole}
                          onChange={setExportSelectedRole}
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-auto p-6 space-y-6">
                      {(isPreviewCallsLoading || isPreviewUserLoading || isPreviewCallsFetching || isPreviewUserFetching) ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                          <p className="text-slate-500 dark:text-slate-400 font-medium">Fetching report data...</p>
                        </div>
                      ) : (
                        <>
                          {callReportMergedData.performanceRows.length > 0 && callSubTab === 'performance' && (
                            <div>
                              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Sheet: User Performance</h4>
                              <div className="overflow-x-auto rounded-lg border border-[#e2e8f0] dark:border-[#475569]">
                                <table className="min-w-full divide-y divide-[#e2e8f0] dark:divide-[#475569] text-sm">
                                  <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-800">
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">User</th>
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Total Leads</th>
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Calls/Visits Done</th>
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Balance</th>
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Interested Leads</th>
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Visited</th>
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Confirmed</th>
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Admitted</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#e2e8f0] dark:divide-[#475569] bg-[#ffffff] dark:bg-[#1e293b]/50">
                                    {callReportMergedData.performanceRows.map((row: any, idx: number) => (
                                      <tr key={idx} className={idx % 2 === 0 ? 'bg-[#ffffff] dark:bg-[#1e293b]/50' : 'bg-slate-50 dark:bg-slate-700/30'}>
                                        <td className="px-4 py-2 text-slate-900 dark:text-slate-100 font-medium">{row.User}</td>
                                        <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{row['Total Leads']}</td>
                                        <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row['Calls/Visits Done']}</td>
                                        <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row.Balance}</td>
                                        <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row['Interested Leads']}</td>
                                        <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row.Visited === '' || row.Visited == null ? '—' : row.Visited}</td>
                                        <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row.Confirmed}</td>
                                        <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row.Admitted}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          {callReportMergedData.dailyRows.length > 0 && callSubTab === 'daily' && (
                            <div>
                              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Sheet: Daily Call Report</h4>
                              <div className="overflow-x-auto rounded-lg border border-[#e2e8f0] dark:border-[#475569]">
                                <table className="min-w-full divide-y divide-[#e2e8f0] dark:divide-[#475569] text-sm">
                                  <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-800">
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">User</th>
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Role</th>
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Division</th>
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Department</th>
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Group</th>
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Date</th>
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Calls/Visits Done</th>
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Total Duration</th>
                                      <th className="px-4 py-2 text-left font-medium text-slate-700 dark:text-slate-300">Avg Duration</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#e2e8f0] dark:divide-[#475569] bg-[#ffffff] dark:bg-[#1e293b]/50">
                                    {callReportMergedData.dailyRows.map((row: any, idx: number) => (
                                      <tr key={idx} className={idx % 2 === 0 ? 'bg-[#ffffff] dark:bg-[#1e293b]/50' : 'bg-slate-50 dark:bg-slate-700/30'}>
                                        <td className="px-4 py-2 text-slate-900 dark:text-slate-100 font-medium">{row.User}</td>
                                        <td className="px-4 py-2 text-slate-500 dark:text-slate-400 text-xs">{row.Role}</td>
                                        <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{row.Division}</td>
                                        <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{row.Department}</td>
                                        <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{row.Group}</td>
                                        <td className="px-4 py-2 text-slate-700 dark:text-slate-300">{row.Date}</td>
                                        <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row.Calls}</td>
                                        <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row['Total Duration']}</td>
                                        <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row['Avg Duration']}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                          {callReportMergedData.performanceRows.length === 0 && callReportMergedData.dailyRows.length === 0 && (
                            <p className="text-slate-500 dark:text-slate-400 text-center py-12">No data found for the selected range.</p>
                          )}
                        </>
                      )}
                    </div>
                    <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => { 
                        setCallReportExportPreviewOpen(false); 
                        setExportPreviewStartDate(''); 
                        setExportPreviewEndDate(''); 
                        setExportSelectedDivision([]);
                        setExportSelectedDepartment([]);
                        setExportSelectedGroup([]);
                        setExportSelectedRole([]);
                      }}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={downloadCallReportExcel} disabled={(callSubTab === 'performance' && callReportMergedData.performanceRows.length === 0) || (callSubTab === 'daily' && callReportMergedData.dailyRows.length === 0)}>
                        Download {callSubTab === 'daily' ? 'Daily Report' : 'Performance Report'}
                      </Button>
                    </div>
                  </div>
                </div>,
                document.body
              )}
            </>
          )}
        </div>
      )
      }

      {/* Conversion Reports Tab */}
      {
        activeTab === 'conversions' && (
          <div className="space-y-6">
            {isLoadingConversions ? (
              <Skeleton className="h-64" />
            ) : conversionReportsError ? (
              <Card className="p-8 text-center">
                <p className="text-red-600 dark:text-red-400">Failed to load conversion reports. Please try again.</p>
              </Card>
            ) : (
              <>
                {/* Summary Cards */}
                {conversionReports?.summary && (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <Card className="p-4">
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Leads</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{conversionReports.summary.totalLeads}</p>
                    </Card>
                    <Card className="p-4">
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total Admissions</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{conversionReports.summary.totalAdmissions}</p>
                    </Card>
                    <Card className="p-4">
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Conversion Rate</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{conversionReports.summary.overallConversionRate}%</p>
                    </Card>
                    <Card className="p-4">
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Counsellors</p>
                      <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{conversionReports.summary.totalCounsellors}</p>
                    </Card>
                  </div>
                )}

                {/* Status Conversions Summary */}
                {conversionReports?.reports && conversionReports.reports.some((r: any) => r.statusConversions && Object.keys(r.statusConversions).length > 0) && (
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Status Conversions Overview</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {conversionReports.reports.map((report: any) => (
                        report.statusConversions && Object.keys(report.statusConversions).length > 0 && (
                          <div key={report.userId} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">{report.userName}</h4>
                            <div className="space-y-1">
                              {Object.entries(report.statusConversions).map(([conversion, count]: [string, any]) => (
                                <div key={conversion} className="flex justify-between text-xs">
                                  <span className="text-slate-600 dark:text-slate-400">{conversion}</span>
                                  <span className="font-medium text-slate-900 dark:text-slate-100">{count}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  </Card>
                )}

                {/* Charts */}
                {conversionChartData.length > 0 && (
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Conversion by Counsellor</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={conversionChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="leads" fill="#3b82f6" name="Total Leads" />
                        <Bar dataKey="converted" fill="#10b981" name="Converted" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                )}

                {/* Export and Table */}
                <div className="flex justify-end gap-2 mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport('excel', conversionReports?.reports || [], `conversion-reports-${filters.startDate}-${filters.endDate}`)}
                    disabled={!conversionReports?.reports?.length}
                  >
                    Export Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleExport('csv', conversionReports?.reports || [], `conversion-reports-${filters.startDate}-${filters.endDate}`)}
                    disabled={!conversionReports?.reports?.length}
                  >
                    Export CSV
                  </Button>
                </div>

                {/* Table */}
                {conversionReports?.reports && conversionReports.reports.length > 0 ? (
                  <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                        <thead className="bg-[#f8fafc] dark:bg-[#1e293b]">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Counsellor</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Leads</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Confirmed</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Converted</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Status Changes</th>
                            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Conversion Rate</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                          {conversionReports.reports.map((report: any) => (
                            <tr key={report.userId} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">{report.userName}</td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{report.totalLeads}</td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{report.confirmedLeads || 0}</td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{report.convertedLeads}</td>
                              <td className="px-6 py-4 text-sm">
                                {report.statusChangeCount > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    <span className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                      {report.statusChangeCount} changes
                                    </span>
                                    {report.statusConversions && Object.keys(report.statusConversions).length > 0 && (
                                      <span className="text-xs text-slate-500">
                                        ({Object.keys(report.statusConversions).length} types)
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400">0</span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm">
                                <span
                                  className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${report.conversionRate >= 50
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : report.conversionRate >= 30
                                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                    }`}
                                >
                                  {report.conversionRate}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ) : (
                  <Card className="p-8 text-center">
                    <p className="text-slate-500 dark:text-slate-400">No conversion reports found for the selected period.</p>
                  </Card>
                )}
              </>
            )}
          </div>
        )
      }

      {/* User Analytics Tab – per-user call activity (calls, SMS, status changes) like the counsellor Call activity page */}
      {
        activeTab === 'users' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-4 rounded-lg bg-slate-100 dark:bg-slate-800 p-3">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Date range: <strong>{filters.startDate}</strong> to <strong>{filters.endDate}</strong>
              </span>
              {filters.academicYear != null && (
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Academic Year: <strong>{filters.academicYear}</strong> (assigned leads filter)
                </span>
              )}
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Full call activity (day-wise calls, SMS, status changes) per user below.
              </span>
            </div>
            {isLoadingUserAnalyticsTab ? (
              <Skeleton className="h-64" />
            ) : userAnalyticsForUsersTab?.users &&
              Array.isArray(userAnalyticsForUsersTab.users) &&
              userAnalyticsForUsersTab.users.length > 0 ? (
              <>
                {/* Export */}
                <div className="flex justify-end gap-2 mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleExport(
                        'excel',
                        userAnalyticsForUsersTab.users || [],
                        `user-analytics-${filters.startDate}-${filters.endDate}`
                      )
                    }
                    disabled={!userAnalyticsForUsersTab?.users?.length}
                  >
                    Export Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleExport(
                        'csv',
                        userAnalyticsForUsersTab.users || [],
                        `user-analytics-${filters.startDate}-${filters.endDate}`
                      )
                    }
                    disabled={!userAnalyticsForUsersTab?.users?.length}
                  >
                    Export CSV
                  </Button>
                </div>

                {/* Per-user call activity (same structure as user/call-activity page) */}
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-2 mb-2">Call activity by user</h3>
                {userAnalyticsForUsersTab.users.map((user: any) => (
                  <Card key={user.userId} className="p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{user.name || user.userName}</h3>
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${user.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                          }`}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="space-y-6">
                      {/* Day-wise call activity (data from user.calls.dailyCallActivity) */}
                      {user.calls?.dailyCallActivity && user.calls.dailyCallActivity.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                            Day-wise call activity
                          </h4>
                          <div className="space-y-3">
                            {user.calls.dailyCallActivity.map((day: { date: string; callCount: number; leads?: { leadId: string; leadName: string; leadPhone?: string; enquiryNumber?: string; callCount: number }[] }, dayIdx: number) => {
                              const dateLabel = day.date ? format(new Date(day.date + 'T12:00:00'), 'MMM d, yyyy') : day.date;
                              return (
                                <div key={dayIdx} className="rounded-lg border border-[#e2e8f0] dark:border-[#475569] overflow-hidden">
                                  <div className="flex items-center justify-between px-3 py-2 border-b border-[#e2e8f0] dark:border-[#475569]">
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                      {dateLabel}
                                    </span>
                                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                      {day.callCount} call{day.callCount !== 1 ? 's' : ''}
                                    </span>
                                  </div>
                                  {day.leads && day.leads.length > 0 && (
                                    <div className="overflow-x-auto">
                                      <table className="min-w-full text-sm">
                                        <thead className="border-b border-[#e2e8f0] dark:border-[#475569]">
                                          <tr>
                                            <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Lead</th>
                                            <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Phone</th>
                                            <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Enquiry #</th>
                                            <th className="px-3 py-1.5 text-right text-xs font-medium text-slate-600 dark:text-slate-400">Calls</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                                          {day.leads.map((lead: any, lidx: number) => (
                                            <tr key={lidx}>
                                              <td className="px-3 py-1.5 text-slate-900 dark:text-slate-100">{lead.leadName}</td>
                                              <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{lead.leadPhone || '—'}</td>
                                              <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{lead.enquiryNumber || '—'}</td>
                                              <td className="px-3 py-1.5 text-right text-slate-900 dark:text-slate-100">{lead.callCount}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Calls Section */}
                      {user.calls && user.calls.total > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                            Calls Made ({user.calls.total})
                          </h4>
                          <div className="space-y-2">
                            {user.calls.byLead && user.calls.byLead.length > 0 ? (
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                  <thead className="bg-[#f8fafc] dark:bg-[#1e293b]">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Lead</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Phone</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Calls</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Total Duration</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                                    {user.calls.byLead.map((lead: any, idx: number) => (
                                      <tr key={idx}>
                                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{lead.leadName}</td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{lead.leadPhone}</td>
                                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{lead.callCount}</td>
                                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                                          {formatSecondsToMMSS(lead.totalDuration)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <p className="text-sm text-slate-500">No calls made in this period</p>
                            )}
                          </div>
                        </div>
                      )}

                      {/* SMS Section */}
                      {user.sms && user.sms.total > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                            SMS/Texts Sent ({user.sms.total})
                          </h4>

                          {/* Template Usage */}
                          {user.sms.templateUsage && user.sms.templateUsage.length > 0 && (
                            <div className="mb-4">
                              <h5 className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Template Usage</h5>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {user.sms.templateUsage.map((template: any, idx: number) => (
                                  <div key={idx} className="flex items-center justify-between p-2 bg-[#f8fafc] dark:bg-[#1e293b] rounded">
                                    <span className="text-sm text-slate-700 dark:text-slate-300">{template.name}</span>
                                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                      {template.count} times ({template.uniqueLeads} leads)
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* SMS by Lead */}
                          {user.sms.byLead && user.sms.byLead.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead className="bg-[#f8fafc] dark:bg-[#1e293b]">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Lead</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Phone</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">SMS Count</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                                  {user.sms.byLead.map((lead: any, idx: number) => (
                                    <tr key={idx}>
                                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{lead.leadName}</td>
                                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{lead.leadPhone}</td>
                                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{lead.smsCount}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Status Conversions Section */}
                      {user.statusConversions && user.statusConversions.total > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                            Status Conversions ({user.statusConversions.total})
                          </h4>

                          {/* Conversion Breakdown */}
                          {user.statusConversions.breakdown && Object.keys(user.statusConversions.breakdown).length > 0 && (
                            <div className="mb-4">
                              <h5 className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Conversion Types</h5>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(user.statusConversions.breakdown).map(([conversion, count]: [string, any]) => (
                                  <span
                                    key={conversion}
                                    className="inline-flex rounded-full px-3 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                  >
                                    {conversion}: {count}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Conversions by Lead */}
                          {user.statusConversions.byLead && user.statusConversions.byLead.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-sm">
                                <thead className="bg-[#f8fafc] dark:bg-[#1e293b]">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Lead</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Conversions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                                  {user.statusConversions.byLead.map((lead: any, idx: number) => (
                                    <tr key={idx}>
                                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{lead.leadName}</td>
                                      <td className="px-3 py-2">
                                        <div className="flex flex-wrap gap-1">
                                          {lead.conversions.map((conv: any, cIdx: number) => (
                                            <span
                                              key={cIdx}
                                              className="inline-flex rounded px-2 py-0.5 text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                                            >
                                              {conv.from} → {conv.to}
                                            </span>
                                          ))}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Lead Summary */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Lead Summary</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-xs text-slate-600 dark:text-slate-400">Total Assigned</p>
                            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{user.totalAssigned || 0}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-600 dark:text-slate-400">Active Leads</p>
                            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{user.activeLeads || 0}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-600 dark:text-slate-400">Confirmed</p>
                            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">
                              {user.statusBreakdown?.['Confirmed'] || user.statusBreakdown?.['confirmed'] || 0}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-600 dark:text-slate-400">Converted</p>
                            <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{user.convertedLeads || 0}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </>
            ) : (
              <Card className="p-8 text-center">
                <p className="text-slate-500 dark:text-slate-400">No user analytics available.</p>
              </Card>
            )}
          </div>
        )
      }

      {/* Activity Logs Tab – time tracking ON/OFF in tabular format */}
      {
        activeTab === 'activityLogs' && (
          <div className="overflow-hidden rounded-lg border border-[#e2e8f0] dark:border-[#475569] mt-4">
            {isLoadingActivityLogs ? (
              <div className="space-y-0 divide-y divide-slate-100 dark:divide-slate-800">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-6 w-12 shrink-0 rounded-full" />
                    <Skeleton className="h-4 w-24 shrink-0" />
                  </div>
                ))}
              </div>
            ) : activityLogs.length === 0 ? (
              <div className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400 sm:px-5">
                No activity logs found for the selected period. Users turn time tracking ON/OFF from their Settings page.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-[#e2e8f0] dark:divide-[#475569]">
                    <thead>
                      <tr className="bg-[#475569] dark:bg-[#334155]">
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                          User
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                          Role
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                          Sessions
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                          Total Duration
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">
                          Status
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white">
                          First Login
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-white">

                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e2e8f0] dark:divide-[#475569]">
                      {activityLogs.map((log: any, idx: number) => {
                        // Convert duration (ms) to HH:MM
                        const durationMs = log.totalDuration || 0;
                        const hours = Math.floor(durationMs / (1000 * 60 * 60));
                        const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                        const durationStr = `${hours}h ${minutes}m`;
                        const isExpanded = expandedActivityLogId === log.key; // Using composed key (userId_date) from backend

                        return (
                          <Fragment key={log.id}>
                            <tr
                              onClick={() => setExpandedActivityLogId(isExpanded ? null : log.key)}
                              className={`cursor-pointer transition-colors ${idx % 2 === 0 ? 'bg-[#ffffff] dark:bg-[#1e293b]/50 hover:bg-slate-50 dark:hover:bg-slate-700/50' : 'bg-[#f8fafc]/80 dark:bg-[#334155]/30 hover:bg-slate-100 dark:hover:bg-slate-700/50'}`}
                            >
                              <td className="whitespace-nowrap px-6 py-4 sm:px-6">
                                <div>
                                  <div className="font-medium text-slate-900 dark:text-slate-100">{log.userName}</div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400">{log.userEmail}</div>
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400 sm:px-6">
                                {log.userRole}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100 sm:px-6">
                                {format(new Date(log.date), 'MMM d, yyyy')}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-600 dark:text-slate-400 sm:px-6">
                                {log.sessionCount || 0}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 sm:px-6">
                                <span className="font-semibold text-slate-900 dark:text-slate-100">{durationStr}</span>
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 sm:px-6">
                                {log.isActive ? (
                                  <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                                    Active Now
                                  </span>
                                ) : (
                                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                    Completed
                                  </span>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-slate-600 dark:text-slate-400 sm:px-6">
                                {log.firstLogin ? format(new Date(log.firstLogin), 'h:mm a') : '—'}
                              </td>
                              <td className="whitespace-nowrap px-6 py-4 text-right sm:px-6">
                                <span className="text-slate-400">
                                  {isExpanded ? (
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                    </svg>
                                  ) : (
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  )}
                                </span>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr className="bg-[#f8fafc] dark:bg-[#1e293b]/80">
                                <td colSpan={8} className="px-6 py-4 sm:px-6">
                                  <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/50">
                                    <h4 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Detailed Sessions</h4>
                                    <div className="space-y-2">
                                      {log.sessions && log.sessions.length > 0 ? (
                                        log.sessions.map((session: any, sIdx: number) => {
                                          const sDuration = session.duration || 0;
                                          const sHours = Math.floor(sDuration / (1000 * 60 * 60));
                                          const sMinutes = Math.floor((sDuration % (1000 * 60 * 60)) / (1000 * 60));
                                          return (
                                            <div key={sIdx} className="flex items-center text-sm text-slate-600 dark:text-slate-400">
                                              <div className="w-2 h-2 rounded-full bg-orange-400 mr-3"></div>
                                              <span className="font-medium mr-2">Session {sIdx + 1}:</span>
                                              <span className="mr-2">
                                                {format(new Date(session.startTime), 'h:mm a')}
                                              </span>
                                              <span className="mr-2 text-slate-400">→</span>
                                              <span className="mr-4">
                                                {session.endTime ? format(new Date(session.endTime), 'h:mm a') : 'Active Now'}
                                              </span>
                                              <span className="ml-auto font-medium text-slate-700 dark:text-slate-300">
                                                ({sHours}h {sMinutes}m)
                                              </span>
                                            </div>
                                          );
                                        })
                                      ) : (
                                        <p className="text-sm text-slate-500">No detailed sessions recorded.</p>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {activityLogsPagination && activityLogsPagination.pages > 1 && (
                  <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-5">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Page {activityLogsPagination.page} of {activityLogsPagination.pages} · {activityLogsPagination.total} records
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setActivityLogPage((p) => Math.max(1, p - 1))}
                        disabled={activityLogPage <= 1}
                        className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-slate-600"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() =>
                          setActivityLogPage((p) => Math.min(activityLogsPagination.pages, p + 1))
                        }
                        disabled={activityLogPage >= activityLogsPagination.pages}
                        className="rounded border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-slate-600"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )
      }

      {/* Leads Abstract Tab – State → Districts → Mandals filters; 4-column Kanban */}
      {
        activeTab === 'abstract' && (
          <div className="space-y-4">
            {isLoadingAbstractDistricts && !leadsAbstractDistricts ? (
              <LeadsAbstractSkeleton />
            ) : leadsAbstractDistricts ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[calc(100vh-16rem)]">
                {/* Districts table – always shown first */}
                <Card className="flex flex-col overflow-hidden h-full">
                  <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-[#f8fafc] dark:bg-[#1e293b]">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Districts</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Totals per district (counselor assigned vs unassigned) · Select a row for mandals</p>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {isFetchingAbstractDistricts && !leadsAbstractDistricts ? (
                      <div className="p-4 space-y-4">
                        {[...Array(20)].map((_, i) => (
                          <div key={i} className="flex items-center">
                            <Skeleton className="h-8 w-full rounded" />
                          </div>
                        ))}
                      </div>
                    ) : (leadsAbstractDistricts.districtBreakdown || []).length === 0 ? (
                      <p className="p-4 text-sm text-slate-500">No districts</p>
                    ) : (
                      <>
                        <div
                          className="sticky top-0 z-[1] grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem_4.5rem] gap-1.5 items-center border-b border-slate-200 bg-[#f1f5f9] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-600 dark:bg-[#334155] dark:text-slate-300 sm:px-4 sm:text-[11px] md:grid-cols-[minmax(0,1fr)_3rem_4.5rem_5rem]"
                          aria-hidden
                        >
                          <span>District</span>
                          <span className="text-right tabular-nums">Total</span>
                          <span className="text-right tabular-nums leading-tight">Assigned</span>
                          <span className="text-right tabular-nums leading-tight">Unassigned</span>
                        </div>
                        <ul className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                          {(leadsAbstractDistricts.districtBreakdown || []).map((row: { id?: string; name: string; count: number; assignedCount?: number; unassignedCount?: number }, idx: number) => (
                            <li
                              key={row.id ?? `district-${idx}`}
                              onClick={() => {
                                if (row.id) {
                                  setFilters({ ...filters, abstractDistrictId: row.id });
                                }
                              }}
                              className={`grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem_4.5rem] gap-1.5 items-center px-3 py-2.5 text-sm cursor-pointer transition-colors sm:px-4 md:grid-cols-[minmax(0,1fr)_3rem_4.5rem_5rem] ${filters.abstractDistrictId === row.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                            >
                              <span className="min-w-0 text-slate-900 dark:text-slate-100 truncate">
                                {row.name}
                                {row.name === leadsAbstractDistricts.maxDistrict && (
                                  <span className="ml-1 shrink-0 text-amber-600 dark:text-amber-400">(Highest)</span>
                                )}
                              </span>
                              <span className="text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300 sm:text-sm">{Number(row.count)}</span>
                              <span className="text-right text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 sm:text-sm">{Number(row.assignedCount ?? 0)}</span>
                              <span className="text-right text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-400 sm:text-sm">{Number(row.unassignedCount ?? 0)}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                </Card>

                {/* Mandals table – only when a district is selected; loading state isolated here */}
                {filters.abstractDistrictId ? (
                  <Card className="flex flex-col overflow-hidden h-full">
                    <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-[#f8fafc] dark:bg-[#1e293b]">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Mandals</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Assigned vs unassigned per mandal for the selected district</p>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {(isLoadingAbstractMandals || isFetchingAbstractMandals) && !leadsAbstractMandals ? (
                        <div className="p-4 space-y-4">
                          {[...Array(20)].map((_, i) => (
                            <div key={i} className="flex items-center">
                              <Skeleton className="h-8 w-full rounded" />
                            </div>
                          ))}
                        </div>
                      ) : (leadsAbstractMandals?.mandalBreakdown || []).length === 0 ? (
                        <div className="flex items-center justify-center h-full p-4 text-sm text-slate-500">
                          No mandals found for this district
                        </div>
                      ) : (
                        <>
                          <div
                            className="sticky top-0 z-[1] grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem_4.5rem] gap-1.5 items-center border-b border-slate-200 bg-[#f1f5f9] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-600 dark:bg-[#334155] dark:text-slate-300 sm:px-4 sm:text-[11px] md:grid-cols-[minmax(0,1fr)_3rem_4.5rem_5rem]"
                            aria-hidden
                          >
                            <span>Mandal</span>
                            <span className="text-right tabular-nums">Total</span>
                            <span className="text-right tabular-nums leading-tight">Assigned</span>
                            <span className="text-right tabular-nums leading-tight">Unassigned</span>
                          </div>
                          <ul className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                            {(leadsAbstractMandals?.mandalBreakdown || []).map((row: { id?: string; name: string; count: number; assignedCount?: number; unassignedCount?: number }, idx: number) => (
                              <li
                                key={row.id ?? `mandal-${idx}`}
                                className={`grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem_4.5rem] gap-1.5 items-center px-3 py-2.5 text-sm sm:px-4 md:grid-cols-[minmax(0,1fr)_3rem_4.5rem_5rem] ${row.name === leadsAbstractMandals?.maxMandal ? 'bg-amber-50 dark:bg-amber-900/20 font-medium' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                                  }`}
                              >
                                <span className="min-w-0 text-slate-900 dark:text-slate-100 truncate">
                                  {row.name}
                                  {row.name === leadsAbstractMandals?.maxMandal && (
                                    <span className="ml-1 shrink-0 text-amber-600 dark:text-amber-400">(Highest)</span>
                                  )}
                                </span>
                                <span className="text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-300 sm:text-sm">{Number(row.count)}</span>
                                <span className="text-right text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 sm:text-sm">{Number(row.assignedCount ?? 0)}</span>
                                <span className="text-right text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-400 sm:text-sm">{Number(row.unassignedCount ?? 0)}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </Card>
                ) : (
                  <div className="hidden md:flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#cbd5e1] dark:border-[#475569] dark:bg-[#334155]/50 text-slate-400 p-8 text-center">
                    <p>Select a district to view mandal breakdown</p>
                  </div>
                )}
              </div>
              </>
            ) : (
              <Card className="p-8 text-center">
                <p className="text-slate-500 dark:text-slate-400">No abstract data. Select Academic Year and try again.</p>
              </Card>
            )}
          </div>
        )
      }

    </div>
    </>
  );
}
