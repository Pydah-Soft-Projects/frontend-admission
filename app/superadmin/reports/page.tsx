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
import { Input } from '@/components/ui/Input';
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
import { Check, ChevronDown, Download, Filter, FileSpreadsheet, Calendar, Search, Printer, Edit3, XCircle, Users, MessageSquare, PhoneCall, History, RefreshCw, ChevronRight, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import PrintVisitDiaryReport from '@/components/superadmin/PrintVisitDiaryReport';

type TabType = 'calls' | 'conversions' | 'users' | 'abstract' | 'activityLogs' | 'visitDiary';

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
  const [visitSubTab, setVisitSubTab] = useState<'record' | 'history' | 'edit' | 'leave'>('history');
  const [expandedDailyUsers, setExpandedDailyUsers] = useState<Set<string>>(new Set());
  const [performanceSearch, setPerformanceSearch] = useState('');
  const [visitSearch, setVisitSearch] = useState('');
  const [expandedVisitDiaryRows, setExpandedVisitDiaryRows] = useState<Set<string>>(new Set());
  const [queuedVisitLeads, setQueuedVisitLeads] = useState<{ lead: Lead; status: string }[]>([]);
  const [selectedVisitDate, setSelectedVisitDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [visitEdits, setVisitEdits] = useState<Record<string, { status: string; comment: string }>>({});
  const [isSavingVisits, setIsSavingVisits] = useState(false);

  const PRO_VISIT_STATUSES = [
    'Interested',
    'Not Interested',
    'Visited',
    'Wrong Data',
    'Confirmed',
    'Scheduled Revisit',
    'Assigned'
  ];

  const normalizeVisitStatus = (status: string) => {
    const s = String(status || '').trim();
    if (!s || /^not\s*set$/i.test(s)) return 'Assigned';
    const hit = PRO_VISIT_STATUSES.find(known => known.toLowerCase() === s.toLowerCase());
    return hit || 'Assigned';
  };




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
    if (tabFromUrl && ['calls', 'conversions', 'users', 'abstract', 'activityLogs', 'visitDiary'].includes(tabFromUrl)) {
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
  const [isPrintingVisitDiary, setIsPrintingVisitDiary] = useState(false);
  const printIframeRef = useRef<HTMLIFrameElement>(null);

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
    abstractMandalId: '',
  });

  const { data: proLeaves, isLoading: isLoadingProLeaves } = useQuery({
    queryKey: ['proLeaves', filters.userId, filters.startDate, filters.endDate],
    queryFn: () => reportAPI.getProLeaves({
      userId: filters.userId || undefined,
      startDate: filters.startDate,
      endDate: filters.endDate,
    }),
    enabled: activeTab === 'visitDiary' && (visitSubTab === 'history' || visitSubTab === 'leave'),
  });

  const handlePrintVisitDiary = useCallback(() => {
    if (!printIframeRef.current) return;
    
    const iframe = printIframeRef.current;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) return;

    // Use a small delay to ensure React has rendered the portal content into the iframe
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 500);
  }, []);


  const { data: visitDiarySearchResults, isLoading: isVisitSearching } = useQuery({
    queryKey: ['visit-diary-superadmin-search', visitSearch, filters.userId],
    queryFn: async () => {
      if (!visitSearch.trim() || visitSearch.trim().length < 2 || !filters.userId) return [];
      const response = await leadAPI.getAll({
        search: visitSearch.trim(),
        assignedTo: filters.userId, // Search only leads assigned to the selected PRO
        limit: 10,
        page: 1
      });
      return response.data?.leads || response.leads || [];
    },
    enabled: activeTab === 'visitDiary' && visitSubTab === 'record' && !!filters.userId && visitSearch.trim().length >= 2,
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

  /** Dedicated endpoint: one DISTINCT on `leads.student_group` + long server cache â€” not blocked by full filter-options bundle. */
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
   * Heavy endpoint â€” full user list for User Analytics tab only.
   * Call Reports â†’ Performance uses a separate paginated query so the table loads quickly.
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
      'portfolio',
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
        academicYear: filters.academicYear != null ? filters.academicYear : undefined,
        currentPortfolioOnly: true,
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

  const { data: visitDiaryAnalytics, isLoading: isLoadingVisitDiaryAnalytics } = useQuery({
    queryKey: ['userAnalyticsVisitDiary', filters.startDate, filters.endDate, filters.userId],
    queryFn: () =>
      leadAPI.getUserAnalytics({
        startDate: filters.startDate,
        endDate: filters.endDate,
        userId: filters.userId || undefined,
        includeAssignmentDetails: true,
      }),
    enabled: activeTab === 'visitDiary' && (visitSubTab === 'history' || visitSubTab === 'edit'),
    staleTime: 300_000,
  });

  const printableVisitData = useMemo(() => {
    if (!visitDiaryAnalytics?.users) return [];
    return visitDiaryAnalytics.users.flatMap((u: any) => {
      const masterUser = users.find((mu: any) => (mu._id || mu.id) === (u.id || u.userId));
      const empNo = u.emp_no || masterUser?.emp_no || '-';
      const dept = u.department || masterUser?.department || '-';

      return (u.visitDiaryUpdates || []).flatMap((day: any) => {
        if (day.isOnLeave) {
          return [{
            date: day.date,
            proName: u.name || u.userName,
            empNo: empNo,
            department: dept,
            isOnLeave: true,
            leaveReason: day.leaveReason,
            visitStatus: 'On Leave'
          }];
        }
        return (day.details || []).map((a: any) => ({
          date: day.date,
          proName: u.name || u.userName,
          empNo: empNo,
          department: dept,
          studentName: a.name,
          phone: a.phone,
          mandal: a.mandal || '-',
          village: a.village,
          visitStatus: a.visitStatus || 'Assigned',
          visitNumber: a.visitNumber || 1,
          logId: a.logId
        }));
      });
    });
  }, [visitDiaryAnalytics, users]);

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

  /** Warm first page before opening Performance (paginated â€” smaller cohort SQL). */
  const prefetchUserPerformanceSummary = useCallback(() => {
    if (activeTab !== 'calls') return;
    void queryClient.prefetchQuery({
      queryKey: [
        'userAnalyticsSummary',
        'performancePaged',
        'portfolio',
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
          academicYear: filters.academicYear != null ? filters.academicYear : undefined,
          currentPortfolioOnly: true,
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

  /** Performance â€œTotal Leadsâ€: Student Counselor / PRO show sum of date-wise bucket totals (matches expanded rows); others use portfolio total_assigned. */
  const getPerformanceTotalLeadsDisplay = useCallback((u: any): number => {
    const role = String(u?.roleName || '').trim();
    if (role === 'Student Counselor' || role === 'PRO') {
      const b = u?.allottedBucketSumTotal;
      if (b != null && !Number.isNaN(Number(b))) return Number(b);
    }
    return Number(u?.totalAssigned ?? 0);
  }, []);

  /**
   * Student Counselor / PRO: Total Leads (bucket sum) âˆ’ Calls/Visits Done (cohort status sum excluding Assigned).
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
      .sort(
        (a: any, b: any) =>
          Number(b?.totalAssigned || 0) - Number(a?.totalAssigned || 0) ||
          String(a?.name || a?.userName || '').localeCompare(String(b?.name || b?.userName || ''))
      );
    let totalInterested = 0;
    let totalAssignedStatus = 0;
    rows.forEach((u: any) => {
      const map = u?.statusBreakdown || {};
      Object.entries(map).forEach(([status, count]) => {
        const n = Number(count) || 0;
        if (String(status).toLowerCase() === 'interested') totalInterested += n;
        if (String(status).toLowerCase() === 'assigned') totalAssignedStatus += n;
      });
    });
    return {
      usersCovered: rows.length,
      totalPortfolio: rows.reduce((s: number, u: any) => s + Number(u?.totalAssigned || 0), 0),
      totalAssignedStatus,
      totalInterested,
      ranking,
    };
  }, [performanceTableUsers]);

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
   * PRO visit_status keys â†’ same labels as `PRO_VISIT_STATUS_COLUMNS`, then merge blank / Not set / unknown into Assigned
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
   * Display-only â€” API/DB unchanged; column totals still sum to the same cohort.
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

  /** Expanded assignment table: pick columns by real role (analytics â†’ users API â†’ detail payload). */
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

  const getPortfolioStatusColumnsForRole = (roleName: unknown): string[] => {
    const mode = getPerformanceExpandedMode(roleName, roleName, roleName);
    if (mode === 'pro') return [...PRO_VISIT_STATUS_COLUMNS];
    if (mode === 'counsellor') return [...COUNSELLOR_CALL_STATUS_COLUMNS_EXPANDED];
    return ['Assigned', 'Interested', 'Not Interested', 'Wrong Data', 'Call Back', 'Confirmed'];
  };

  /** Canonical portfolio status counts for main table (matches former expanded Portfolio Breakdown). */
  const buildPortfolioStatusBreakdown = (user: any, fu?: { roleName?: string }) => {
    const breakdown = user?.statusBreakdown || {};
    const totalLeads = Number(user?.totalAssigned || 0);
    const roleKey = String(user?.roleName || fu?.roleName || '').toLowerCase();
    const isPro = roleKey === 'pro' || (roleKey.includes('pro') && !roleKey.includes('counsel'));
    const isCounsellor = roleKey.includes('counselor') || roleKey.includes('counsellor');
    const allowedStatuses = isPro
      ? (PRO_VISIT_STATUS_COLUMNS as unknown as string[])
      : isCounsellor
        ? (COUNSELLOR_CALL_STATUS_COLUMNS_EXPANDED as unknown as string[])
        : [];

    const counts: Record<string, number> = {};
    allowedStatuses.forEach((s) => {
      counts[s] = 0;
    });

    Object.entries(breakdown).forEach(([status, count]) => {
      let targetStatus = status;
      if (isCounsellor && status.toLowerCase() === 'not answered') {
        targetStatus = 'Call Back';
      }
      const match = allowedStatuses.find((s) => s.toLowerCase() === targetStatus.toLowerCase());
      if (match) {
        counts[match] += Number(count);
      } else if (
        allowedStatuses.length === 0 &&
        targetStatus.toLowerCase() !== 'not set' &&
        targetStatus.toLowerCase() !== 'unknown' &&
        Number(count) > 0
      ) {
        counts[targetStatus] = (counts[targetStatus] || 0) + Number(count);
      }
    });

    const columns =
      allowedStatuses.length > 0
        ? [...allowedStatuses]
        : Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));

    return { totalLeads, counts, columns, statusLabel: isPro ? 'Visit Status' : isCounsellor ? 'Call Status' : 'Lead Status' };
  };

  const performancePortfolioColumns = useMemo((): string[] => {
    const r = performanceRole.trim();
    if (r === 'PRO') return [...PRO_VISIT_STATUS_COLUMNS];
    if (r === 'Student Counselor') return [...COUNSELLOR_CALL_STATUS_COLUMNS_EXPANDED];
    const ordered = new Set<string>();
    performanceTableUsers.forEach((u: any) => {
      getPortfolioStatusColumnsForRole(u.roleName).forEach((c) => ordered.add(c));
    });
    if (ordered.size > 0) return Array.from(ordered);
    return [...COUNSELLOR_CALL_STATUS_COLUMNS_EXPANDED];
  }, [performanceRole, performanceTableUsers]);

  const performancePortfolioPageTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    performancePortfolioColumns.forEach((col) => {
      totals[col] = 0;
    });
    let totalPortfolio = 0;
    performanceTableUsers.forEach((u: any) => {
      const fu = users.find((x: any) => x._id === u.userId || x.name === (u.name || u.userName));
      const { totalLeads, counts } = buildPortfolioStatusBreakdown(u, fu);
      totalPortfolio += totalLeads;
      performancePortfolioColumns.forEach((col) => {
        totals[col] += Number(counts[col] ?? 0);
      });
    });
    return { totalPortfolio, statusTotals: totals };
  }, [performanceTableUsers, performancePortfolioColumns, users]);

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
    if (!entries.length) return 'â€”';
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
    setPerformancePrintOverlay('Loading all matching users for printâ€¦');

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

    setPerformancePrintOverlay('Preparing detailed report for printâ€¦');

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

    setPerformancePrintOverlay('Building print layoutâ€¦');
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
      const roleName = escapeHtml(roleKey || 'â€”');
      const statusLabel = user.isActive ? 'Active' : 'Inactive';
      const printMode = getPerformanceExpandedMode(user.roleName, fullUser?.roleName, detailUser?.roleName);
      const printColSpan = printMode === 'pro' ? 13 : 12;
      const headerStatusPro = `${PRO_VISIT_STATUS_COLUMNS.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}<th>Balance</th>`;
      const headerStatusPipeline = `<th>Assigned</th><th>Interested</th><th>Not Interested</th><th>Wrong Data</th><th>Call Back</th><th>Confirmed</th>`;

      if (printMode === 'counsellor') {
        // CALCULATE TRUE CUMULATIVE SUMS FOR FOOTER (matches user expectation of "adding up")
        const sumRowsTotalAllotted = rows.reduce((s: number, day: any) => s + Number(day.totalAssigned || 0), 0);
        const sumRowsBalance = rows.reduce((s: number, day: any) => s + Number(getCounsellorAssignmentBalanceForDay(day)), 0);
        const sumRowsReclaimed = rows.reduce((s: number, day: any) => s + Number(day.reclaimedCount || 0), 0);
        const sumRowsManual = rows.reduce((s: number, day: any) => s + Number(day.manualUnassignedCount || 0), 0);
        const sumRowsMoved = rows.reduce((s: number, day: any) => s + Number(day.movedToOtherUserCount || 0), 0);
        const totalRowsUnattended = sumRowsReclaimed + sumRowsManual + sumRowsMoved;
        
        const sumRowsStatusMap: Record<string, number> = {};
        COUNSELLOR_CALL_STATUS_COLUMNS_EXPANDED.forEach(col => {
          sumRowsStatusMap[col] = rows.reduce((s: number, day: any) => s + Number(getCounsellorCallStatusCountForDisplay(day, col)), 0);
        });

        const allottedFooterCells = COUNSELLOR_CALL_STATUS_COLUMNS_EXPANDED.map(
          (c) => `<td>${sumRowsStatusMap[c]}</td>`
        ).join('');

        const footerRowCounsellor = `
          <tr style="font-weight:700;background:#f1f5f9;">
            <td colspan="4">Cumulative Total (Sum of rows)</td>
            <td>${sumRowsTotalAllotted}</td>
            ${allottedFooterCells}
            <td>${sumRowsBalance}</td>
            <td>${totalRowsUnattended}${totalRowsUnattended > 0 ? ` <span style="font-size:7.5px; opacity:0.8;">(${sumRowsReclaimed}R, ${sumRowsManual}M, ${sumRowsMoved}T)</span>` : ''}</td>
          </tr>`;

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
                : 'â€”';
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
        
        // Ensure Interested includes CET Applied for Counselors in the Summary Table
        const rawInterested = Number(mergedPrintUser.interested || 0);
        const rawCetApplied = roleKey === 'Student Counselor' 
          ? Number(mergedPrintUser.statusBreakdown?.['CET Applied'] || mergedPrintUser.statusBreakdown?.['cet applied'] || 0)
          : 0;
        const mainRowInterested = roleKey === 'Student Counselor' ? (rawInterested + rawCetApplied) : rawInterested;

        const mainRowVisited = roleKey === 'Student Counselor' ? (mergedPrintUser.visitedCumulative ?? 0) : 'â€”';
        const mainRowConfirmed = mergedPrintUser.convertedLeads ?? 0;
        const mainRowAdmitted = mergedPrintUser.admittedLeads ?? mergedPrintUser.statusBreakdown?.Admitted ?? mergedPrintUser.statusBreakdown?.admitted ?? 0;

        const summaryTableHtml = `
          <table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:6px;background:#f8fafc;border:1px solid #e2e8f0;">
            <thead>
              <tr style="background:#f1f5f9;color:#0f172a;text-align:center;">
                <th style="padding:4px;border:1px solid #334155;">Total Leads</th>
                <th style="padding:4px;border:1px solid #334155;">Calls/Visits Done</th>
                <th style="padding:4px;border:1px solid #334155;">Balance</th>
                <th style="padding:4px;border:1px solid #334155;">Interested Leads</th>
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
          <h3 style="margin:0 0 3px 0;font-size:10px;font-weight:700;">${userName} <span style="font-weight:600;color:#334155;">(${roleName})</span> Â· ${statusLabel}</h3>
          ${summaryTableHtml}
          <p style="margin:0 0 4px 0;font-size:8px;color:#475569;">Student Counselor â€” Assignment history by date buckets. Main table summary counts shown above.</p>
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
              : 'â€”';
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
                <td>${Number(day?.reclaimedCount || 0) + Number(day?.manualUnassignedCount || 0) + Number(day?.movedToOtherUserCount || 0)}${ (Number(day?.reclaimedCount || 0) + Number(day?.manualUnassignedCount || 0) + Number(day?.movedToOtherUserCount || 0)) > 0 ? ` <span style="font-size:7px;">(${day.reclaimedCount || 0}R, ${day.manualUnassignedCount || 0}M, ${day.movedToOtherUserCount || 0}T)</span>` : ''}</td>
              </tr>
            `;
          }).join('')
        : `<tr><td colspan="${printColSpan}">No date-wise assignment history found.</td></tr>`;

      // CALCULATE TRUE CUMULATIVE SUMS FOR FOOTER (PRO / Pipeline)
      const sumRowsTotalAllottedOther = rows.reduce((s: number, day: any) => s + Number(day.totalAssigned || 0), 0);
      const sumRowsReclaimedOther = rows.reduce((s: number, day: any) => s + Number(day.reclaimedCount || 0), 0);
      const sumRowsManualOther = rows.reduce((s: number, day: any) => s + Number(day.manualUnassignedCount || 0), 0);
      const sumRowsMovedOther = rows.reduce((s: number, day: any) => s + Number(day.movedToOtherUserCount || 0), 0);
      const totalRowsUnattendedOther = sumRowsReclaimedOther + sumRowsManualOther + sumRowsMovedOther;
      
      let footerRowPro = '';
      if (printMode === 'pro') {
        const sumRowsBalancePro = rows.reduce((s: number, day: any) => s + Number(getProAssignmentBalanceForDay(day)), 0);
        const sumRowsStatusMapPro: Record<string, number> = {};
        PRO_VISIT_STATUS_COLUMNS.forEach(col => {
          sumRowsStatusMapPro[col] = rows.reduce((s: number, day: any) => s + Number(getProVisitStatusCountForDisplay(day, col)), 0);
        });

        const visitCells = PRO_VISIT_STATUS_COLUMNS.map(
          (c) => `<td>${sumRowsStatusMapPro[c]}</td>`
        ).join('');

        footerRowPro = `<tfoot><tr style="font-weight:700;background:#f1f5f9;">
          <td colspan="4">Cumulative Total (Sum of rows)</td>
          <td>${sumRowsTotalAllottedOther}</td>
          ${visitCells}
          <td>${sumRowsBalancePro}</td>
          <td>${totalRowsUnattendedOther}${totalRowsUnattendedOther > 0 ? ` <span style="font-size:7.5px; opacity:0.8;">(${sumRowsReclaimedOther}R, ${sumRowsManualOther}M, ${sumRowsMovedOther}T)</span>` : ''}</td>
        </tr></tfoot>`;
      } else {
        // Pipeline mode footer
        const sumAssigned = rows.reduce((s: number, day: any) => s + Number(getLeadStatusCount(day, 'Assigned')), 0);
        const sumInterested = rows.reduce((s: number, day: any) => s + Number(getLeadStatusCount(day, 'Interested')), 0);
        const sumNotInterested = rows.reduce((s: number, day: any) => s + Number(getLeadStatusCount(day, 'Not Interested')), 0);
        const sumWrongData = rows.reduce((s: number, day: any) => s + Number(getLeadStatusCount(day, 'Wrong Data')), 0);
        const sumCallBack = rows.reduce((s: number, day: any) => s + Number(getLeadStatusCount(day, 'Call Back')), 0);
        const sumConfirmed = rows.reduce((s: number, day: any) => s + Number(getLeadStatusCount(day, 'Confirmed')), 0);

        footerRowPro = `<tfoot><tr style="font-weight:700;background:#f1f5f9;">
          <td colspan="4">Cumulative Total (Sum of rows)</td>
          <td>${sumRowsTotalAllottedOther}</td>
          <td>${sumAssigned}</td>
          <td>${sumInterested}</td>
          <td>${sumNotInterested}</td>
          <td>${sumWrongData}</td>
          <td>${sumCallBack}</td>
          <td>${sumConfirmed}</td>
          <td>${totalRowsUnattendedOther}${totalRowsUnattendedOther > 0 ? ` <span style="font-size:7.5px; opacity:0.8;">(${sumRowsReclaimedOther}R, ${sumRowsManualOther}M, ${sumRowsMovedOther}T)</span>` : ''}</td>
        </tr></tfoot>`;
      }

      const mergedPrintUserOther = { ...user, ...(detailUser || {}) };
      const printMainBalanceOther = getPerformanceBalanceDisplay(mergedPrintUserOther);
      const mainRowLeadsOther = getPerformanceTotalLeadsDisplay(mergedPrintUserOther);
      const mainRowCallsOther = mergedPrintUserOther.calls?.total ?? 0;
      
      // Ensure Interested includes CET Applied for Pipeline roles
      const rawInterestedOther = Number(mergedPrintUserOther.interested || 0);
      const rawCetAppliedOther = Number(mergedPrintUserOther.statusBreakdown?.['CET Applied'] || mergedPrintUserOther.statusBreakdown?.['cet applied'] || 0);
      const mainRowInterestedOther = (rawInterestedOther + rawCetAppliedOther);

      const mainRowVisitedOther = roleKey === 'PRO' ? (mergedPrintUserOther.visitedCumulative ?? 0) : 'â€”';
      const mainRowConfirmedOther = mergedPrintUserOther.convertedLeads ?? 0;
      const mainRowAdmittedOther = mergedPrintUserOther.admittedLeads ?? mergedPrintUserOther.statusBreakdown?.Admitted ?? mergedPrintUserOther.statusBreakdown?.admitted ?? 0;

      const summaryTableOtherHtml = `
        <table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:6px;background:#f8fafc;border:1px solid #e2e8f0;">
          <thead>
            <tr style="background:#f1f5f9;color:#0f172a;text-align:center;">
              <th style="padding:4px;border:1px solid #334155;">Total Leads</th>
              <th style="padding:4px;border:1px solid #334155;">Calls/Visits Done</th>
              <th style="padding:4px;border:1px solid #334155;">Balance</th>
              <th style="padding:4px;border:1px solid #334155;">Interested Leads</th>
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
          <h3 style="margin:0 0 3px 0;font-size:10px;font-weight:700;">${userName} <span style="font-weight:600;color:#334155;">(${roleName})</span> Â· ${statusLabel}</h3>
          ${summaryTableOtherHtml}
          ${
            printMode === 'pro'
              ? `<p style="margin:0 0-4px 0;font-size:8px;color:#475569;">PRO â€” Assignment history by date buckets. Main table summary counts shown above.</p>`
              : `<p style="margin:0 0-4px 0;font-size:8px;color:#475569;">Pipeline Summary â€” Main table summary counts shown above.</p>`
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
        'Email': u.email || 'â€”',
        'Role': role || 'â€”',
        'Total Leads': getPerformanceTotalLeadsDisplay(u),
        'Calls/Visits Done': u.calls?.total ?? 0,
        'Balance': getPerformanceBalanceDisplay(u),
        'Interested': u.interested ?? 0,
        'Visited': role === 'Student Counselor' ? (u.visitedCumulative ?? 0) : 'â€”',
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



  // States for Abstract tab (state â†’ districts â†’ mandals)
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

  const {
    data: leadsAbstractVillages,
    isLoading: isLoadingAbstractVillages,
    isFetching: isFetchingAbstractVillages,
  } = useQuery({
    queryKey: [
      'leadsAbstract',
      'villages',
      filters.academicYear,
      filters.studentGroup,
      filters.abstractStateId,
      filters.abstractDistrictId,
      filters.abstractMandalId,
    ],
    queryFn: () =>
      reportAPI.getLeadsAbstract({
        ...abstractReportParams,
        districtId: filters.abstractDistrictId || undefined,
        mandalId: filters.abstractMandalId || undefined,
      }),
    enabled: activeTab === 'abstract' && !!filters.abstractMandalId,
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
        User: (u.name || u.userName || 'â€”'),
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
        User: g.userName || 'â€”',
        Division: g.fullUser?.division || 'â€”',
        Department: g.fullUser?.department || 'â€”',
        Group: g.fullUser?.group || 'â€”',
        Role: g.fullUser?.roleName || 'â€”',
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
            {(['calls', 'conversions', 'users', 'activityLogs', 'visitDiary', 'abstract'] as TabType[]).map((tab) => (
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
                {tab === 'visitDiary' && 'Visit Diary'}
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

        {activeTab !== 'abstract' && activeTab !== 'visitDiary' && (
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

      {/* Filters â€“ hidden on Call Reports, User Analytics, Leads Abstract, Activity Logs AND Visit Diary (customized below) */}
      {activeTab !== 'calls' && activeTab !== 'users' && activeTab !== 'abstract' && activeTab !== 'activityLogs' && activeTab !== 'visitDiary' && (
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

      {activeTab === 'visitDiary' && (
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mt-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Start Date</label>
              <Input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="h-9 rounded-lg border-slate-200 dark:border-slate-700 focus:ring-blue-500 w-40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">End Date</label>
              <Input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="h-9 rounded-lg border-slate-200 dark:border-slate-700 focus:ring-blue-500 w-40"
              />
            </div>
            <div className="flex flex-col gap-1">
               <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Filter by PRO (Optional)</label>
               <select
                 value={filters.userId}
                 onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
                 className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm focus:ring-blue-500 min-w-[200px]"
               >
                 <option value="">All PRO Officers</option>
                 {users.filter(u => u.roleName === 'PRO').map((user: any) => (
                   <option key={user._id} value={user._id}>{user.name}</option>
                 ))}
               </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {visitSubTab === 'history' && (
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-9 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 dark:hover:bg-orange-900/10 dark:hover:text-orange-400 dark:hover:border-orange-900/50 transition-all duration-200"
                  onClick={handlePrintVisitDiary}
                >
                  <Printer className="w-3.5 h-3.5 mr-2" />
                  Print
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-9 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 dark:hover:bg-orange-900/10 dark:hover:text-orange-400 dark:hover:border-orange-900/50 transition-all duration-200"
                  onClick={() => {
                    const csvData = (visitDiaryAnalytics?.users || []).flatMap((u: any) => 
                      (u.visitDiaryUpdates || []).flatMap((day: any) => 
                        day.details.map((a: any) => ({
                          'Update Date': day.date,
                          'PRO Name': u.name || u.userName,
                          'Student Name': a.name,
                          'Phone': a.phone,
                          'Village': a.village,
                          'Visit Status': a.visitStatus || 'Assigned'
                        }))
                      )
                    );
                    handleExport('excel', csvData, `visit-diary-report-${filters.startDate}`);
                  }}
                >
                  <Download className="w-3.5 h-3.5 mr-2" />
                  Export
                </Button>
              </div>
            )}

            <div className="flex p-1 bg-slate-200/50 dark:bg-slate-700/50 rounded-xl">
              <button
                onClick={() => setVisitSubTab('history')}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                  visitSubTab === 'history' 
                    ? "bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                <Calendar className="w-3.5 h-3.5" />
                History
              </button>
              <button
                onClick={() => setVisitSubTab('record')}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                  visitSubTab === 'record' 
                    ? "bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                <Search className="w-3.5 h-3.5" />
                Record
              </button>
              <button
                onClick={() => setVisitSubTab('edit')}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                  visitSubTab === 'edit' 
                    ? "bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                <Edit3 className="w-3.5 h-3.5" />
                Edit
              </button>
              <button
                onClick={() => setVisitSubTab('leave')}
                className={cn(
                  "flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                  visitSubTab === 'leave' 
                    ? "bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm" 
                    : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                )}
              >
                <Calendar className="w-3.5 h-3.5" />
                Leave
              </button>
            </div>
          </div>
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
          {/* Inner sub-tabs: Daily Call Report | User Performance Summary */}
          <div className="space-y-3">
            <div
              className="grid w-full grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-800/50"
              role="tablist"
              aria-label="Call report views"
            >
              <button
                type="button"
                role="tab"
                aria-selected={callSubTab === 'daily'}
                onClick={() => {
                  setCallSubTab('daily');
                  handleDatePreset('today');
                }}
                className={cn(
                  'border-b-2 px-4 py-3 text-center text-sm font-semibold transition-all',
                  callSubTab === 'daily'
                    ? 'border-[#f97316] bg-[#f97316] text-white'
                    : 'border-transparent text-slate-500 hover:bg-white/70 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-300'
                )}
              >
                Daily Call Report
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={callSubTab === 'performance'}
                onClick={() => {
                  setCallSubTab('performance');
                  handleDatePreset('overall');
                }}
                onMouseEnter={prefetchUserPerformanceSummary}
                onFocus={prefetchUserPerformanceSummary}
                className={cn(
                  'border-b-2 border-l border-slate-200 px-4 py-3 text-center text-sm font-semibold transition-all dark:border-slate-600',
                  callSubTab === 'performance'
                    ? 'border-[#f97316] bg-[#f97316] text-white'
                    : 'border-transparent text-slate-500 hover:bg-white/70 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-300'
                )}
              >
                User Performance Summary
              </button>
            </div>

            {callSubTab === 'daily' && (
              <div className="flex flex-nowrap items-end gap-2 overflow-x-auto pb-1">
                <div className="flex w-[9.25rem] shrink-0 flex-col gap-0.5">
                  <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Division
                  </span>
                  <select
                    value={dailyDivision}
                    onChange={(e) => setDailyDivision(e.target.value)}
                    aria-label="Filter by division"
                    className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="">All divisions</option>
                    {performanceFilterOptions.divisions.map((d) => (
                      <option key={`daily-div-${d}`} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="flex w-[9.25rem] shrink-0 flex-col gap-0.5">
                  <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Department
                  </span>
                  <select
                    value={dailyDepartment}
                    onChange={(e) => setDailyDepartment(e.target.value)}
                    aria-label="Filter by department"
                    className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="">All departments</option>
                    {performanceFilterOptions.departments.map((d) => (
                      <option key={`daily-dept-${d}`} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="flex w-[9.25rem] shrink-0 flex-col gap-0.5">
                  <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Student group
                  </span>
                  <select
                    value={dailyStudentGroup}
                    onChange={(e) => setDailyStudentGroup(e.target.value)}
                    aria-label="Filter calls by lead student group (leads.student_group)"
                    className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="">All student groups</option>
                    {callReportStudentGroupOptions.map((g: string) => (
                      <option key={`daily-sg-${g}`} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="flex shrink-0 flex-col gap-0.5">
                  <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
                {filters.startDate && filters.endDate && (
                  <span className="whitespace-nowrap rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {format(new Date(filters.startDate), 'dd MMM yyyy')}
                    <span className="mx-1 text-slate-400">â†’</span>
                    {format(new Date(filters.endDate), 'dd MMM yyyy')}
                  </span>
                )}
                {callReports?.reports && callReports.reports.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      const daily = callReports?.reports || [];
                      if (daily.length === 0) return;

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
                          const rangeStr = same ? a : `${a} â€“ ${b}`;
                          const dwa = typeof r.daysWithActivity === 'number' && r.daysWithActivity > 0
                            ? ` (${r.daysWithActivity} day${r.daysWithActivity !== 1 ? 's' : ''} with activity)`
                            : '';
                          return `${rangeStr}${dwa}`;
                        }
                        if (!r?.date) return 'â€”';
                        return format(new Date(r.date), 'dd MMM yyyy');
                      };

                      const allRows = grouped.flatMap(g =>
                        g.rows.map((r: any) => ({
                          User: g.userName || 'â€”',
                          Division: g.fullUser?.division || 'â€”',
                          Department: g.fullUser?.department || 'â€”',
                          'Employee group (HRMS)': g.fullUser?.group || 'â€”',
                          Role: g.fullUser?.roleName || 'â€”',
                          Date: dateLabelForDailyExport(r),
                          'Calls/Visits Done': r.callCount ?? 0,
                          'Total Duration': formatSecondsToMMSS(r.totalDuration ?? 0),
                          'Avg Duration': formatSecondsToMMSS(r.averageDuration ?? 0),
                        }))
                      );

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

                      const cols = Object.keys(allRows[0]).map(key => ({
                        wch: Math.max(key.length, ...allRows.map((r: any) => String(r[key] ?? '').length)) + 5
                      }));
                      worksheet['!cols'] = cols;

                      const workbook = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(workbook, worksheet, 'Daily Call Report');
                      XLSX.writeFile(workbook, `daily-call-reports-${filters.startDate}-${filters.endDate}.xlsx`);
                    }}
                  >
                    <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                    Export Excel
                  </Button>
                )}
              </div>
            )}
            {callSubTab === 'performance' && (
              <div className="flex flex-nowrap items-end gap-2 overflow-x-auto pb-1">
                <div className="relative flex w-[11rem] shrink-0 flex-col gap-0.5">
                  <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Search
                  </span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={performanceSearch}
                      onChange={(e) => setPerformanceSearch(e.target.value)}
                      placeholder="User name or email"
                      className="h-8 w-full rounded-md border border-slate-300 bg-white pl-7 pr-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                    />
                  </div>
                </div>
                <div className="flex w-[9.25rem] shrink-0 flex-col gap-0.5">
                  <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Role
                  </span>
                  <select
                    value={performanceRole}
                    onChange={(e) => setPerformanceRole(e.target.value)}
                    className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
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
                <div className="flex w-[9.25rem] shrink-0 flex-col gap-0.5">
                  <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Division
                  </span>
                  <select
                    value={performanceDivision}
                    onChange={(e) => setPerformanceDivision(e.target.value)}
                    aria-label="Filter by division"
                    className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="">All divisions</option>
                    {performanceFilterOptions.divisions.map((d) => (
                      <option key={`perf-div-${d}`} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="flex w-[9.25rem] shrink-0 flex-col gap-0.5">
                  <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Department
                  </span>
                  <select
                    value={performanceDepartment}
                    onChange={(e) => setPerformanceDepartment(e.target.value)}
                    aria-label="Filter by department"
                    className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="">All departments</option>
                    {performanceFilterOptions.departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="flex w-[9.25rem] shrink-0 flex-col gap-0.5">
                  <span className="px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Student group
                  </span>
                  <select
                    value={performanceStudentGroup}
                    onChange={(e) => setPerformanceStudentGroup(e.target.value)}
                    aria-label="Filter users with portfolio leads in this student group"
                    className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <option value="">All student groups</option>
                    {callReportStudentGroupOptions.map((g: string) => (
                      <option key={`perf-sg-${g}`} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2 self-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 whitespace-nowrap"
                    onClick={() => void handlePrintPerformanceDetails()}
                  >
                    Print Detailed Report
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 whitespace-nowrap bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400"
                    onClick={handleExportPerformanceSummaryExcel}
                  >
                    <FileSpreadsheet className="mr-1.5 h-3.5 w-3.5" />
                    Export Excel
                  </Button>
                </div>
              </div>
            )}
          </div>

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
                      label: 'Total portfolio leads',
                      value:
                        performanceSummaryTotals != null
                          ? performanceSummaryTotals.totalAssignedLeads
                          : performanceSummary.totalPortfolio,
                      style: CALL_REPORT_CARD_STYLES[1],
                    },
                    {
                      label: 'Assigned (portfolio)',
                      value: Number(performancePortfolioPageTotals.statusTotals['Assigned'] ?? 0).toLocaleString(),
                      style: CALL_REPORT_CARD_STYLES[2],
                    },
                    {
                      label: 'Interested (portfolio)',
                      value:
                        performanceSummaryTotals != null
                          ? performanceSummaryTotals.totalInterested
                          : performanceSummary.totalInterested,
                      style: CALL_REPORT_CARD_STYLES[3],
                    },
                    {
                      label: 'Users on this page',
                      value: performanceSummary.usersCovered,
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

              {/* Daily Call Report Sub-Tab */}
              {callSubTab === 'daily' && (
                callReports?.reports && callReports.reports.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-[#e2e8f0] dark:divide-[#475569]">
                          <thead>
                            <tr className="bg-[#475569] dark:bg-[#334155]">
                              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white">User Info</th>
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
                                      <span>{same ? a : `${a} â€“ ${b}`}</span>
                                      {typeof r.daysWithActivity === 'number' && r.daysWithActivity > 0 && (
                                        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                                          {r.daysWithActivity} day{r.daysWithActivity !== 1 ? 's' : ''} with activity
                                        </span>
                                      )}
                                    </div>
                                  );
                                }
                                if (!r?.date) return <span className="text-slate-400">â€”</span>;
                                return <span>{format(new Date(r.date), 'dd MMM yyyy')}</span>;
                              };

                              return grouped.flatMap((group, gIdx) => {
                                const isMultiDay = group.rows.length > 1 && !group.rows[0]?.rangeAggregate;
                                const isExpanded = expandedDailyUsers.has(group.userName);
                                const rowBg = gIdx % 2 === 0
                                  ? 'bg-[#ffffff] dark:bg-[#1e293b]/50'
                                  : 'bg-[#f8fafc]/80 dark:bg-[#334155]/30';

                                // â”€â”€ Single row per user (date filter = cumulative from API, or one calendar day) â”€â”€
                                if (!isMultiDay) {
                                  const r = group.rows[0];
                                  return [(
                                    <tr key={group.userName} className={`${rowBg} hover:bg-slate-50 dark:hover:bg-slate-700/50`}>
                                      <td className="px-6 py-4 border-r border-slate-100 dark:border-slate-700">
                                        <div className="flex flex-col">
                                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{group.userName}</span>
                                          <span className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                                            {group.fu?.department || 'â€”'} Â· {group.fu?.group || 'â€”'}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-700 dark:text-slate-300">{formatDailyDateCell(r)}</td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{r.callCount}</td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{formatSecondsToMMSS(Number(r.totalDuration) || 0)}</td>
                                      <td className="whitespace-nowrap px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{formatSecondsToMMSS(Number(r.averageDuration) || 0)}</td>
                                    </tr>
                                  )];
                                }

                                // â”€â”€ Overall mode: multiple calendar rows per user â€” collapsed summary + expandable per-day â”€â”€
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
                                      <td className="px-6 py-4 border-r border-slate-100 dark:border-slate-700">
                                        <div className="flex items-center gap-2">
                                          <ChevronDown className="w-3.5 h-3.5 -rotate-90 text-orange-400 flex-shrink-0 transition-transform" />
                                          <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{group.userName}</span>
                                            <span className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                                              {group.fu?.department || 'â€”'} Â· {group.fu?.group || 'â€”'}
                                            </span>
                                          </div>
                                        </div>
                                      </td>
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
                                            <div className="flex flex-col">
                                              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{group.userName}</span>
                                              <span className="text-[10px] leading-tight text-slate-500 dark:text-slate-400">
                                                {group.fu?.department || 'â€”'} Â· {group.fu?.group || 'â€”'}
                                              </span>
                                            </div>
                                          </div>
                                        </td>
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
                isLoadingPerformanceUserList && !performanceUserAnalyticsData ? (
                  <Card className="p-10">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">Loading portfolio summary...</p>
                    </div>
                  </Card>
                ) : performanceTableUsers.length > 0 ? (
                  <div className="space-y-4">
                    {isFetchingPerformanceUserList && performanceUserAnalyticsData && (
                      <p className="text-xs text-orange-600 dark:text-orange-400">Updating portfolio dataâ€¦</p>
                    )}
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Current portfolio snapshot â€” lead counts by status for each user&apos;s assigned leads
                      {performanceRole.trim() === 'Student Counselor'
                        ? ' (call_status)'
                        : performanceRole.trim() === 'PRO'
                          ? ' (visit_status)'
                          : ''}
                      .
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-800/50">
                            <th className="w-52 px-6 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">User</th>
                            <th
                              className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 whitespace-nowrap"
                              title="Total leads currently assigned to this user (portfolio)"
                            >
                              Total Portfolio
                            </th>
                            {performancePortfolioColumns.map((col) => (
                              <th
                                key={col}
                                className="px-3 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 whitespace-nowrap"
                                title="Count in current portfolio"
                              >
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800/50">
                          {performanceTableUsers.map((user: any, rowIdx: number) => {
                            const fu = users.find((fu: any) => fu._id === user.userId || fu.name === (user.name || user.userName));
                            const baseRowBg = rowIdx % 2 === 0 ? 'bg-[#ffffff] dark:bg-[#1e293b]/50' : 'bg-[#f8fafc]/80 dark:bg-[#334155]/30';
                            const userLabel = user.name || user.userName;
                            const portfolioRow = buildPortfolioStatusBreakdown(user, fu);

                            return (
                              <tr key={user.userId} className={`${baseRowBg} hover:bg-slate-100 dark:hover:bg-slate-700/50`}>
                                <td className="w-52 px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">
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
                                      {(user.department || fu?.department || 'â€”')} | {(user.designation || fu?.designation || 'â€”')} | {(user.group || fu?.group || 'â€”')}
                                    </div>
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-orange-700 dark:text-orange-300 tabular-nums">
                                  {portfolioRow.totalLeads.toLocaleString()}
                                </td>
                                {performancePortfolioColumns.map((col) => (
                                  <td
                                    key={`${user.userId}-${col}`}
                                    className="whitespace-nowrap px-3 py-4 text-sm text-slate-900 dark:text-slate-100 tabular-nums"
                                  >
                                    {Number(portfolioRow.counts[col] ?? 0).toLocaleString()}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-slate-300 bg-slate-100/95 dark:border-slate-600 dark:bg-slate-800/90">
                            <td className="px-6 py-3 text-xs font-semibold text-slate-900 dark:text-slate-100">
                              Page total
                            </td>
                            <td className="px-4 py-3 text-sm font-bold tabular-nums text-orange-700 dark:text-orange-300">
                              {performancePortfolioPageTotals.totalPortfolio.toLocaleString()}
                            </td>
                            {performancePortfolioColumns.map((col) => (
                              <td
                                key={`foot-${col}`}
                                className="px-3 py-3 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100"
                              >
                                {Number(performancePortfolioPageTotals.statusTotals[col] ?? 0).toLocaleString()}
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    {performanceUserAnalyticsData?.pagination &&
                      performanceUserAnalyticsData.pagination.total > 0 && (
                        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            Page {performanceUserAnalyticsData.pagination.page} of{' '}
                            {performanceUserAnalyticsData.pagination.pages} â€”{' '}
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
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      <Card className="p-4 bg-slate-50/50 dark:bg-slate-800/30">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Users (This Page)</p>
                        <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{performanceSummary.usersCovered}</p>
                      </Card>
                      <Card className="p-4 bg-slate-50/50 dark:bg-slate-800/30">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Portfolio Leads (This Page)</p>
                        <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{performanceSummary.totalPortfolio.toLocaleString()}</p>
                      </Card>
                      <Card className="p-4 bg-slate-50/50 dark:bg-slate-800/30">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Assigned (This Page)</p>
                        <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
                          {Number(performancePortfolioPageTotals.statusTotals['Assigned'] ?? 0).toLocaleString()}
                        </p>
                      </Card>
                      <Card className="p-4 bg-slate-50/50 dark:bg-slate-800/30">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Interested (This Page)</p>
                        <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{performanceSummary.totalInterested.toLocaleString()}</p>
                      </Card>
                    </div>
                    <Card className="p-4 border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Portfolio Ranking (This Page)</h4>
                        <span className="text-xs text-slate-500">Top to least by total portfolio</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-700">
                              <th className="text-left py-2">Rank</th>
                              <th className="text-left py-2">User</th>
                              <th className="text-left py-2">Total Portfolio</th>
                              <th className="text-left py-2">Assigned</th>
                              <th className="text-left py-2">Interested</th>
                            </tr>
                          </thead>
                          <tbody>
                            {performanceSummary.ranking.map((u: any, idx: number) => {
                              const fu = users.find((x: any) => x._id === u.userId || x.name === (u.name || u.userName));
                              const { totalLeads, counts } = buildPortfolioStatusBreakdown(u, fu);
                              return (
                                <tr key={`${u.userId}-${idx}`} className="border-b border-slate-100 dark:border-slate-800">
                                  <td className="py-2">{idx + 1}</td>
                                  <td className="py-2">{u.name || u.userName}</td>
                                  <td className="py-2 font-semibold tabular-nums">{totalLeads.toLocaleString()}</td>
                                  <td className="py-2 tabular-nums">{Number(counts['Assigned'] ?? 0).toLocaleString()}</td>
                                  <td className="py-2 tabular-nums">{Number(counts['Interested'] ?? 0).toLocaleString()}</td>
                                </tr>
                              );
                            })}
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
                                        <td className="px-4 py-2 text-slate-900 dark:text-slate-100">{row.Visited === '' || row.Visited == null ? 'â€”' : row.Visited}</td>
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

      {/* User Analytics Tab â€“ per-user call activity (calls, SMS, status changes) like the counsellor Call activity page */}
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
                                              <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{lead.leadPhone || 'â€”'}</td>
                                              <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{lead.enquiryNumber || 'â€”'}</td>
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
                                              {conv.from} â†’ {conv.to}
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

      {
        activeTab === 'visitDiary' && (
          <div className="space-y-6 mt-4 animate-in fade-in duration-500">
            {/* Main content area */}

            {visitSubTab === 'history' ? (
              <>
                <div className="grid grid-cols-1 gap-4">
                  {isLoadingVisitDiaryAnalytics ? (
                    <ReportDashboardSkeleton />
                  ) : visitDiaryAnalytics?.users && visitDiaryAnalytics.users.some((u: any) => (u.visitDiaryUpdates?.length ?? 0) > 0) ? (
                    <div className="space-y-4">
                      {visitDiaryAnalytics.users.filter((u: any) => (u.visitDiaryUpdates?.length ?? 0) > 0).map((u: any) => (
                        <div key={u.userId} className="overflow-hidden bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                          <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                  <span className="text-xs font-bold text-blue-600 uppercase">{u.name?.slice(0, 1)}</span>
                                </div>
                                <div>
                                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{u.name || u.userName}</h4>
                                  <p className="text-[10px] text-slate-500 uppercase tracking-widest">{u.roleName}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Updates</p>
                                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                                    {(u.visitDiaryUpdates || []).reduce((acc: number, day: any) => acc + (day.details?.length || 0), 0)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
                              <thead className="bg-slate-50/50 dark:bg-slate-900/50">
                                <tr>
                                  <th className="w-10 px-4 py-2"></th>
                                  <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Update Date</th>
                                  <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Outcomes Breakdown</th>
                                  <th className="px-4 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Leads</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {(u.visitDiaryUpdates || []).map((day: any) => {
                                  const rowKey = `${u.userId}-${day.date}`;
                                  const isExpanded = expandedVisitDiaryRows.has(rowKey);
                                  
                                  return (
                                    <React.Fragment key={rowKey}>
                                      <tr 
                                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                                        onClick={() => {
                                          const next = new Set(expandedVisitDiaryRows);
                                          if (next.has(rowKey)) next.delete(rowKey);
                                          else next.add(rowKey);
                                          setExpandedVisitDiaryRows(next);
                                        }}
                                      >
                                        <td className="px-4 py-3 text-center">
                                          <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", isExpanded && "rotate-180")} />
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                            {format(new Date(day.date + 'T12:00:00'), 'dd MMM yyyy')}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3">
                                          <div className="flex flex-wrap gap-1.5">
                                            {Object.entries(day.statusCounts || {}).map(([status, count]) => (
                                              <span 
                                                key={status}
                                                className={cn(
                                                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border",
                                                  status === 'Interested' || status === 'Visited' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                                  status === 'Not Interested' || status === 'Not Available' ? "bg-red-50 text-red-700 border-red-100" :
                                                  status === 'Confirmed' ? "bg-blue-50 text-blue-700 border-blue-100" :
                                                  status === 'Scheduled Revisit' ? "bg-orange-50 text-orange-700 border-orange-100" :
                                                  "bg-slate-50 text-slate-600 border-slate-100"
                                                )}
                                              >
                                                {status}: {count as number}
                                              </span>
                                            ))}
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                          <span className="text-xs font-bold text-slate-900 dark:text-white">{day.details?.length || 0}</span>
                                        </td>
                                      </tr>
                                      {isExpanded && (
                                        <tr className="bg-slate-50/30 dark:bg-slate-900/30">
                                          <td colSpan={4} className="px-6 py-4">
                                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
                                              <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
                                                <thead className="bg-slate-50 dark:bg-slate-900">
                                                  <tr>
                                                    <th className="px-4 py-2 text-left text-[9px] font-bold uppercase text-slate-400">Student Name</th>
                                                    <th className="px-4 py-2 text-left text-[9px] font-bold uppercase text-slate-400">Visit No</th>
                                                    <th className="px-4 py-2 text-left text-[9px] font-bold uppercase text-slate-400">Phone</th>
                                                    <th className="px-4 py-2 text-left text-[9px] font-bold uppercase text-slate-400">Location</th>
                                                    <th className="px-4 py-2 text-right text-[9px] font-bold uppercase text-slate-400">Outcome</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                                                  {(day.details || []).map((lead: any, lIdx: number) => (
                                                    <tr key={lIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                                                      <td className="px-4 py-2 text-xs font-medium text-slate-900 dark:text-slate-100">{lead.name}</td>
                                                      <td className="px-4 py-2 text-xs font-bold text-blue-600 dark:text-blue-400">V-{lead.visitNumber}</td>
                                                      <td className="px-4 py-2 text-xs text-slate-500">{lead.phone}</td>
                                                      <td className="px-4 py-2 text-xs text-slate-400">{lead.village}</td>
                                                      <td className="px-4 py-2 text-right">
                                                        <span className={cn(
                                                          "text-[9px] font-bold px-1.5 py-0.5 rounded",
                                                          normalizeVisitStatus(lead.visitStatus) === 'Interested' || normalizeVisitStatus(lead.visitStatus) === 'Visited' ? "text-emerald-600 bg-emerald-50" :
                                                          normalizeVisitStatus(lead.visitStatus) === 'Not Interested' || normalizeVisitStatus(lead.visitStatus) === 'Wrong Data' ? "text-red-600 bg-red-50" :
                                                          normalizeVisitStatus(lead.visitStatus) === 'Confirmed' ? "text-blue-600 bg-blue-50" :
                                                          normalizeVisitStatus(lead.visitStatus) === 'Scheduled Revisit' ? "text-orange-600 bg-orange-50" :
                                                          "text-slate-500 bg-slate-50"
                                                        )}>
                                                          {normalizeVisitStatus(lead.visitStatus)}
                                                        </span>
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-24 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                      <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
                      </div>
                      <h4 className="text-slate-900 dark:text-white font-bold">No Visit Records Found</h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-[280px] mx-auto">No PRO officers have recorded field visit outcomes for the selected date range.</p>
                    </div>
                  )}
                </div>
              </>
            ) : visitSubTab === 'edit' ? (
              <div className="space-y-4">
                {isLoadingVisitDiaryAnalytics ? (
                  <ReportDashboardSkeleton />
                ) : visitDiaryAnalytics?.users && visitDiaryAnalytics.users.some((u: any) => (u.visitDiaryUpdates?.length ?? 0) > 0) ? (
                  <div className="space-y-4">
                    {visitDiaryAnalytics.users.filter((u: any) => (u.visitDiaryUpdates?.length ?? 0) > 0).map((u: any) => (
                      <div key={`edit-${u.userId}`} className="overflow-hidden bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                                <span className="text-xs font-bold text-orange-600 uppercase">{u.name?.slice(0, 1)}</span>
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{u.name || u.userName}</h4>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest">{u.roleName}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {(u.visitDiaryUpdates || []).map((day: any) => {
                            const rowKey = `edit-${u.userId}-${day.date}`;
                            const isExpanded = expandedVisitDiaryRows.has(rowKey);
                            const hasChanges = day.details.some((lead: any) => visitEdits[`${lead.leadId}`]);

                            return (
                              <div key={rowKey} className="flex flex-col">
                                <div 
                                  className="flex items-center justify-between px-4 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                                  onClick={() => {
                                    const next = new Set(expandedVisitDiaryRows);
                                    if (next.has(rowKey)) next.delete(rowKey);
                                    else next.add(rowKey);
                                    setExpandedVisitDiaryRows(next);
                                  }}
                                >
                                  <div className="flex items-center gap-3">
                                    <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", isExpanded && "rotate-180")} />
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                      {format(new Date(day.date + 'T12:00:00'), 'dd MMM yyyy')}
                                    </span>
                                    {hasChanges && (
                                      <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold animate-pulse">
                                        Pending Changes
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{day.details?.length || 0} Leads</span>
                                    {isExpanded && hasChanges && (
                                      <Button 
                                        size="xs" 
                                        className="h-7 px-3 bg-orange-500 hover:bg-orange-600 text-white border-0"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          try {
                                            setIsSavingVisits(true);
                                            showToast.loading(`Saving changes for ${day.date}...`);
                                            
                                            const changesToSave = day.details
                                              .filter((lead: any) => visitEdits[`${lead.leadId}`])
                                              .map((lead: any) => ({
                                                leadId: lead.leadId,
                                                status: visitEdits[`${lead.leadId}`].status,
                                                comment: visitEdits[`${lead.leadId}`].comment,
                                                visitDate: day.date
                                              }));

                                            const promises = changesToSave.map((change: any) => 
                                              leadAPI.addActivity(change.leadId, {
                                                newStatus: change.status,
                                                statusChannel: 'visit_status',
                                                type: 'status_change',
                                                comment: change.comment || `Visit status updated by Super Admin (Audit Edit) for ${format(new Date(day.date + 'T12:00:00'), 'MMM d, yyyy')}. Original update by ${u.name}.`
                                              })
                                            );

                                            await Promise.all(promises);
                                            showToast.success('Changes saved successfully');
                                            
                                            // Clear edits for these logs
                                            const nextEdits = { ...visitEdits };
                                            day.details.forEach((lead: any) => delete nextEdits[`${lead.leadId}`]);
                                            setVisitEdits(nextEdits);
                                            
                                            queryClient.invalidateQueries({ queryKey: ['userAnalyticsVisitDiary'] });
                                          } catch (err) {
                                            showToast.error('Failed to save changes');
                                          } finally {
                                            setIsSavingVisits(false);
                                          }
                                        }}
                                        disabled={isSavingVisits}
                                      >
                                        Save Changes
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                
                                {isExpanded && (
                                  <div className="px-4 pb-4 bg-slate-50/30 dark:bg-slate-900/30">
                                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800 shadow-sm">
                                      <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
                                        <thead className="bg-slate-50 dark:bg-slate-900">
                                          <tr>
                                            <th className="px-4 py-2 text-left text-[9px] font-bold uppercase text-slate-400">Student Name</th>
                                            <th className="px-4 py-2 text-left text-[9px] font-bold uppercase text-slate-400 w-32">Visit Status</th>
                                            <th className="px-4 py-2 text-left text-[9px] font-bold uppercase text-slate-400">Audit Comment</th>
                                            <th className="px-4 py-2 text-right text-[9px] font-bold uppercase text-slate-400 w-20">Actions</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-slate-700/50">
                                          {(day.details || []).map((lead: any, lIdx: number) => {
                                            const edit = visitEdits[`${lead.leadId}`];
                                            const currentStatus = normalizeVisitStatus(edit?.status || lead.visitStatus);
                                            
                                            return (
                                              <tr key={lead.logId || lead.leadId || lIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30">
                                                <td className="px-4 py-2">
                                                  <div className="flex flex-col">
                                                    <span className="text-xs font-medium text-slate-900 dark:text-slate-100">{lead.name}</span>
                                                    <span className="text-[10px] text-slate-400">{lead.phone}</span>
                                                  </div>
                                                </td>
                                                <td className="px-4 py-2">
                                                  <select
                                                    value={currentStatus}
                                                    onChange={(e) => {
                                                      setVisitEdits(prev => ({
                                                        ...prev,
                                                        [`${lead.leadId}`]: { 
                                                          status: e.target.value, 
                                                          comment: prev[`${lead.leadId}`]?.comment || '' 
                                                        }
                                                      }));
                                                    }}
                                                    className={cn(
                                                      "text-[10px] font-bold px-1.5 py-1 rounded border-0 focus:ring-1 focus:ring-blue-500 bg-slate-50 dark:bg-slate-900",
                                                      currentStatus === 'Interested' || currentStatus === 'Visited' ? "text-emerald-600" :
                                                      currentStatus === 'Not Interested' || currentStatus === 'Not Available' ? "text-red-600" :
                                                      currentStatus === 'Confirmed' ? "text-blue-600" :
                                                      currentStatus === 'Scheduled Revisit' ? "text-orange-600" :
                                                      "text-slate-500"
                                                    )}
                                                  >
                                                    {PRO_VISIT_STATUSES.map(s => (
                                                      <option key={s} value={s}>{s}</option>
                                                    ))}
                                                  </select>
                                                </td>
                                                <td className="px-4 py-2">
                                                  <Input 
                                                    placeholder="Add audit note..."
                                                    value={edit?.comment || ''}
                                                    onChange={(e) => {
                                                      setVisitEdits(prev => ({
                                                        ...prev,
                                                        [`${lead.leadId}`]: { 
                                                          status: currentStatus, 
                                                          comment: e.target.value 
                                                        }
                                                      }));
                                                    }}
                                                    className="h-7 text-[10px] bg-transparent border-slate-100 dark:border-slate-700 focus:border-blue-400"
                                                  />
                                                </td>
                                                <td className="px-4 py-2 text-right">
                                                  {edit && (
                                                    <Button 
                                                      size="xs" 
                                                      variant="ghost" 
                                                      className="h-6 w-6 p-0 text-slate-400 hover:text-red-500"
                                                      onClick={() => {
                                                        const next = { ...visitEdits };
                                                        delete next[`${lead.leadId}`];
                                                        setVisitEdits(next);
                                                      }}
                                                    >
                                                      <XCircle className="w-3.5 h-3.5" />
                                                    </Button>
                                                  )}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-24 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Edit3 className="w-8 h-8 text-slate-300" />
                    </div>
                    <h4 className="text-slate-900 dark:text-white font-bold">No Records to Edit</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-[280px] mx-auto">Select a date range or PRO officer with visit history to begin editing outcomes.</p>
                  </div>
                )}
              </div>
            ) : visitSubTab === 'leave' ? (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Mark Leave Form */}
                  <Card className="p-6 h-fit border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                        <Calendar className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Mark Leave</h3>
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest">PRO Attendance</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block px-1">Select PRO</label>
                        <select
                          className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          value={filters.userId || ''}
                          onChange={(e) => setFilters(prev => ({ ...prev, userId: e.target.value }))}
                        >
                          <option value="">Select an Officer</option>
                          {users.filter((u: any) => String(u.roleName || u.role_name).toUpperCase() === 'PRO').map((u: any) => (
                            <option key={u.id || u._id} value={u.id || u._id}>{u.name || u.user_name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block px-1">Leave Date</label>
                        <Input
                          type="date"
                          value={selectedVisitDate}
                          onChange={(e) => setSelectedVisitDate(e.target.value)}
                          className="h-10 text-xs"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 block px-1">Reason (Optional)</label>
                        <Input
                          placeholder="Ex: Medical, Personal..."
                          value={visitEdits['leave-reason']?.comment || ''}
                          onChange={(e) => setVisitEdits(prev => ({ ...prev, 'leave-reason': { status: '', comment: e.target.value } }))}
                          className="h-10 text-xs"
                        />
                      </div>

                      <Button
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold h-10 mt-2"
                        disabled={!filters.userId || !selectedVisitDate || isSavingVisits}
                        onClick={async () => {
                          try {
                            setIsSavingVisits(true);
                            showToast.loading('Marking leave...');
                            await reportAPI.markProLeave({
                              userId: filters.userId,
                              date: selectedVisitDate,
                              reason: visitEdits['leave-reason']?.comment || ''
                            });
                            showToast.success('Leave marked successfully');
                            setVisitEdits(prev => {
                              const next = { ...prev };
                              delete next['leave-reason'];
                              return next;
                            });
                            queryClient.invalidateQueries({ queryKey: ['proLeaves'] });
                            queryClient.invalidateQueries({ queryKey: ['userAnalyticsVisitDiary'] });
                          } catch (err) {
                            showToast.error('Failed to mark leave');
                          } finally {
                            setIsSavingVisits(false);
                          }
                        }}
                      >
                        {isSavingVisits ? 'Processing...' : 'Mark as On Leave'}
                      </Button>
                    </div>
                  </Card>

                  {/* Leave History Table */}
                  <div className="lg:col-span-2">
                    <Card className="border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                      <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Recent Leave Records</h3>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Showing Last 30 Days</span>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
                          <thead className="bg-slate-50/50 dark:bg-slate-900/50">
                            <tr>
                              <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Officer</th>
                              <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Date</th>
                              <th className="px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Reason</th>
                              <th className="px-6 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                            {isLoadingProLeaves ? (
                              <tr>
                                <td colSpan={4} className="px-6 py-8 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                                    <span className="text-xs text-slate-500 font-medium">Loading records...</span>
                                  </div>
                                </td>
                              </tr>
                            ) : proLeaves?.length > 0 ? (
                              proLeaves.map((leave: any) => (
                                <tr key={leave.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      <div className="h-7 w-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-600">
                                        {leave.user_name?.slice(0, 1)}
                                      </div>
                                      <span className="text-xs font-bold text-slate-900 dark:text-white">{leave.user_name}</span>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                      {format(new Date(String(leave.leave_date).substring(0, 10) + 'T12:00:00'), 'dd MMM yyyy')}
                                    </span>
                                  </td>
                                  <td className="px-6 py-4">
                                    <span className="text-xs text-slate-500 italic">{leave.reason || 'No reason specified'}</span>
                                  </td>
                                  <td className="px-6 py-4 text-right">
                                    <Button
                                      size="xs"
                                      variant="ghost"
                                      className="h-8 w-8 p-0 text-slate-400 hover:text-red-500 hover:bg-red-50"
                                      onClick={async () => {
                                        if (!confirm('Are you sure you want to remove this leave record?')) return;
                                        try {
                                          showToast.loading('Deleting record...');
                                          await reportAPI.deleteProLeave(leave.id);
                                          showToast.success('Record deleted');
                                          queryClient.invalidateQueries({ queryKey: ['proLeaves'] });
                                          queryClient.invalidateQueries({ queryKey: ['userAnalyticsVisitDiary'] });
                                        } catch (err) {
                                          showToast.error('Failed to delete');
                                        }
                                      }}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={4} className="px-6 py-12 text-center">
                                  <p className="text-xs text-slate-500">No leave records found for the selected period.</p>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                {!filters.userId ? (
                  <Card className="p-12 text-center border-dashed border-2 border-slate-200 dark:border-slate-800">
                    <div className="w-16 h-16 bg-orange-50 dark:bg-orange-900/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Filter className="w-8 h-8 text-orange-400" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Select PRO Officer First</h3>
                    <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">
                      Please select a PRO officer from the filters above to record visit outcomes on their behalf.
                    </p>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Search Section */}
                    <div className="space-y-4">
                      <Card className="p-4 shadow-sm border-slate-200 dark:border-slate-800">
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                          Record Date
                        </label>
                        <Input
                          type="date"
                          value={selectedVisitDate}
                          onChange={(e) => setSelectedVisitDate(e.target.value)}
                          className="w-full h-10 rounded-lg focus:ring-orange-500 border-slate-200"
                        />
                        
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4 mb-2">
                          Search Student
                        </label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            placeholder="Name, phone or enquiry..."
                            value={visitSearch}
                            onChange={(e) => setVisitSearch(e.target.value)}
                            className="pl-9 h-10 rounded-lg border-slate-200"
                          />
                        </div>

                        {/* Search Results */}
                        <div className="mt-4 space-y-2 max-h-[400px] overflow-y-auto pr-2">
                           {isVisitSearching ? (
                             <div className="space-y-2">
                               {[1, 2].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                             </div>
                           ) : visitSearch.length >= 2 ? (
                             visitDiarySearchResults && visitDiarySearchResults.length > 0 ? (
                               visitDiarySearchResults.map((lead: Lead) => {
                                 const isQueued = queuedVisitLeads.some(q => q.lead._id === lead._id);
                                 return (
                                   <button
                                     key={lead._id}
                                     onClick={() => {
                                       if (isQueued) {
                                         setQueuedVisitLeads(prev => prev.filter(q => q.lead._id !== lead._id));
                                       } else {
                                         setQueuedVisitLeads(prev => [...prev, { lead, status: lead.visitStatus || 'Assigned' }]);
                                       }
                                     }}
                                     className={cn(
                                       "w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between gap-3",
                                       isQueued ? "border-orange-500 bg-orange-50 dark:bg-orange-900/10 shadow-sm" : "border-slate-100 dark:border-slate-800"
                                     )}
                                   >
                                     <div className="min-w-0">
                                       <p className="font-bold text-xs text-slate-900 dark:text-white truncate">{lead.name}</p>
                                       <p className="text-[10px] text-slate-500 truncate">{lead.phone} â€¢ {lead.village}</p>
                                     </div>
                                     <div className={cn(
                                       "w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
                                       isQueued ? "bg-orange-500 border-orange-500 text-white" : "border-slate-200 dark:border-slate-700"
                                     )}>
                                       {isQueued && <Check className="w-2.5 h-2.5" />}
                                     </div>
                                   </button>
                                 );
                               })
                             ) : (
                               <p className="text-xs text-slate-400 italic text-center py-4">No matching leads found for this PRO.</p>
                             )
                           ) : (
                             <p className="text-xs text-slate-400 text-center py-4">Enter 2+ characters to search leads assigned to {users.find(u => u._id === filters.userId)?.name}</p>
                           )}
                        </div>
                      </Card>
                    </div>

                    {/* Queue Section */}
                    <Card className="p-4 bg-orange-50/10 border-orange-100 dark:bg-orange-900/5 dark:border-orange-900/20">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest">
                          Outcome Queue ({queuedVisitLeads.length})
                        </h3>
                        {queuedVisitLeads.length > 0 && (
                          <button onClick={() => setQueuedVisitLeads([])} className="text-[10px] text-slate-400 underline">Clear All</button>
                        )}
                      </div>
                      
                      {queuedVisitLeads.length === 0 ? (
                        <div className="py-20 text-center">
                          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Check className="w-6 h-6 text-slate-300" />
                          </div>
                          <p className="text-xs text-slate-400">Add leads from the search results to record their visit status.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="max-h-[500px] overflow-y-auto pr-1 space-y-3">
                            {queuedVisitLeads.map((item) => (
                              <div key={item.lead._id} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.lead.name}</p>
                                    <p className="text-[10px] text-slate-500">{item.lead.phone}</p>
                                  </div>
                                  <button 
                                    onClick={() => setQueuedVisitLeads(prev => prev.filter(q => q.lead._id !== item.lead._id))}
                                    className="p-1 text-slate-300 hover:text-red-400"
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                  </button>
                                </div>
                                <select
                                  className="w-full h-8 rounded bg-slate-50 dark:bg-slate-800/50 text-[10px] font-bold px-2 focus:ring-1 focus:ring-orange-500 border-none"
                                  value={item.status}
                                  onChange={(e) => {
                                    setQueuedVisitLeads(prev => prev.map(q => q.lead._id === item.lead._id ? { ...q, status: e.target.value } : q));
                                  }}
                                >
                                  {['Assigned', 'Interested', 'Not Interested', 'Not Available', 'Scheduled Revisit', 'Wrong Data', 'Confirmed'].map(status => (
                                    <option key={status} value={status}>{status}</option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                          
                          <Button 
                            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold h-12 mt-2"
                            onClick={async () => {
                              try {
                                showToast.loading(`Saving ${queuedVisitLeads.length} outcomes...`);
                                const promises = queuedVisitLeads.map(item => 
                                  leadAPI.addActivity(item.lead._id, {
                                    newStatus: item.status,
                                    statusChannel: 'visit_status',
                                    type: 'status_change',
                                    comment: `Visit outcome recorded by Super Admin on behalf of ${users.find(u => u._id === filters.userId)?.name} for date: ${format(new Date(selectedVisitDate + 'T12:00:00'), 'MMM d, yyyy')}`
                                  })
                                );
                                await Promise.all(promises);
                                showToast.success(`Successfully updated ${queuedVisitLeads.length} records`);
                                setQueuedVisitLeads([]);
                                setVisitSearch('');
                                setVisitSubTab('history');
                                queryClient.invalidateQueries({ queryKey: ['userAnalytics'] });
                              } catch (err) {
                                showToast.error('Failed to save some outcomes');
                              }
                            }}
                          >
                            Save {queuedVisitLeads.length} Outcomes
                          </Button>
                        </div>
                      )}
                    </Card>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      }

      {/* Activity Logs Tab â€“ time tracking ON/OFF in tabular format */}
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
                                {log.firstLogin ? format(new Date(log.firstLogin), 'h:mm a') : 'â€”'}
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
                                              <span className="mr-2 text-slate-400">â†’</span>
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
                      Page {activityLogsPagination.page} of {activityLogsPagination.pages} Â· {activityLogsPagination.total} records
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

      {/* Leads Abstract Tab â€“ State â†’ Districts â†’ Mandals filters; 4-column Kanban */}
      {
        activeTab === 'abstract' && (
          <div className="space-y-4">
            {isLoadingAbstractDistricts && !leadsAbstractDistricts ? (
              <LeadsAbstractSkeleton />
            ) : leadsAbstractDistricts ? (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-16rem)]">
                {/* Districts table â€“ always shown first */}
                <Card noPadding className="flex flex-col overflow-hidden h-full">
                  <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-[#f8fafc] dark:bg-[#1e293b]">
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Districts</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Totals per district Â· Select row for mandals</p>
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
                                  setFilters({ ...filters, abstractDistrictId: row.id, abstractMandalId: '' });
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

                {/* Mandals table â€“ only when a district is selected */}
                {filters.abstractDistrictId ? (
                  <Card noPadding className="flex flex-col overflow-hidden h-full">
                    <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-[#f8fafc] dark:bg-[#1e293b]">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Mandals</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Assigned vs unassigned Â· Select row for villages</p>
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
                          No mandals found
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
                                onClick={() => {
                                  if (row.id) {
                                    setFilters({ ...filters, abstractMandalId: row.id });
                                  }
                                }}
                                className={`grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem_4.5rem] gap-1.5 items-center px-3 py-2.5 text-sm cursor-pointer transition-colors sm:px-4 md:grid-cols-[minmax(0,1fr)_3rem_4.5rem_5rem] ${filters.abstractMandalId === row.id ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
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
                  <div className="hidden lg:flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#cbd5e1] dark:border-[#475569] dark:bg-[#334155]/50 text-slate-400 p-8 text-center h-full">
                    <p>Select a district to view mandals</p>
                  </div>
                )}

                {/* Villages table â€“ only when a mandal is selected */}
                {filters.abstractMandalId ? (
                  <Card noPadding className="flex flex-col overflow-hidden h-full">
                    <div className="shrink-0 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-[#f8fafc] dark:bg-[#1e293b]">
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Villages</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Aggregated from leads for the selected mandal</p>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {(isLoadingAbstractVillages || isFetchingAbstractVillages) && !leadsAbstractVillages ? (
                        <div className="p-4 space-y-4">
                          {[...Array(20)].map((_, i) => (
                            <div key={i} className="flex items-center">
                              <Skeleton className="h-8 w-full rounded" />
                            </div>
                          ))}
                        </div>
                      ) : (leadsAbstractVillages?.villageBreakdown || []).length === 0 ? (
                        <div className="flex items-center justify-center h-full p-4 text-sm text-slate-500">
                          No villages found
                        </div>
                      ) : (
                        <>
                          <div
                            className="sticky top-0 z-[1] grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem_4.5rem] gap-1.5 items-center border-b border-slate-200 bg-[#f1f5f9] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:border-slate-600 dark:bg-[#334155] dark:text-slate-300 sm:px-4 sm:text-[11px] md:grid-cols-[minmax(0,1fr)_3rem_4.5rem_5rem]"
                            aria-hidden
                          >
                            <span>Village</span>
                            <span className="text-right tabular-nums">Total</span>
                            <span className="text-right tabular-nums leading-tight">Assigned</span>
                            <span className="text-right tabular-nums leading-tight">Unassigned</span>
                          </div>
                          <ul className="divide-y divide-[#e2e8f0] dark:divide-[#334155]">
                            {(leadsAbstractVillages?.villageBreakdown || []).map((row: { name: string; count: number; assignedCount?: number; unassignedCount?: number }, idx: number) => (
                              <li
                                key={`village-${idx}`}
                                className={`grid grid-cols-[minmax(0,1fr)_2.75rem_4.25rem_4.5rem] gap-1.5 items-center px-3 py-2.5 text-sm sm:px-4 md:grid-cols-[minmax(0,1fr)_3rem_4.5rem_5rem] ${row.name === leadsAbstractVillages?.maxVillage ? 'bg-amber-50 dark:bg-amber-900/20 font-medium' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
                              >
                                <span className="min-w-0 text-slate-900 dark:text-slate-100 truncate">
                                  {row.name}
                                  {row.name === leadsAbstractVillages?.maxVillage && (
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
                  <div className="hidden lg:flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#cbd5e1] dark:border-[#475569] dark:bg-[#334155]/50 text-slate-400 p-8 text-center h-full">
                    <p>Select a mandal to view villages</p>
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
    {/* Isolated Print Iframe for Visit Diary */}
    <iframe
      ref={printIframeRef}
      style={{ position: 'absolute', width: 0, height: 0, border: 'none', visibility: 'hidden' }}
      title="Print Visit Diary"
    >
      {printIframeRef.current?.contentDocument?.body && createPortal(
        <PrintVisitDiaryReport 
          generatedAt={format(new Date(), 'dd MMM yyyy, hh:mm a')}
          filters={{
            startDate: filters.startDate,
            endDate: filters.endDate,
            proName: filters.userId ? users.find((u: any) => u._id === filters.userId)?.name : undefined
          }}
          data={printableVisitData}
        />,
        printIframeRef.current.contentDocument.body
      )}
    </iframe>
    </>
  );
}
