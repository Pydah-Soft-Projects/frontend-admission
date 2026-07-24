'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { admissionAPI, courseAPI, leadAPI } from '@/lib/api';
import { Admission, AdmissionListResponse } from '@/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ReferenceUserSelect } from '@/components/admission/ReferenceUserSelect';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { showToast } from '@/lib/toast';
import { auth } from '@/lib/auth';
import {
  useAdmissionTabPermissions,
  useDashboardHeader,
  useJoiningDeskPermissions,
  useModulePermissionRaw,
} from '@/components/layout/DashboardShell';
import { ADMISSION_PAGE_TABS, type AdmissionTabKey } from '@/lib/joiningPermissions';
import { useCourseLookup } from '@/hooks/useCourseLookup';
import { useInstitutions } from '@/lib/useInstitutions';
import {
  resolveAdmissionStatCourseLabel,
  resolveJoiningOrAdmissionCourseLabel,
} from '@/lib/admissionCourseDisplay';
import { buildImportantDocumentTabItems } from '@/lib/joiningDocumentsDisplay';
import { LayoutGrid, Calendar, Filter, Download, UserCircle, CalendarDays, Pencil, X, Megaphone, Printer, Settings2 } from 'lucide-react';
import { escapePrintHtml, printHtmlDocument } from '@/lib/printHtml';
import { cn } from '@/lib/utils';
import { PendingAdmissionsDownloadModal } from '@/components/admission/PendingAdmissionsDownloadModal';
import {
  parseStudentQuotasResponse,
  quotaLabelsFromCatalog,
} from '@/lib/studentQuotaCatalog';
import {
  MinimumFeeConfigDialog,
  type MinimumFeeConfigEntry,
} from '@/components/admission/MinimumFeeConfigDialog';

type AdmissionStatusFilter = 'all' | 'active' | 'withdrawn' | 'Admission Cancelled';
type FeeEntryFilter = 'all' | 'no_entry' | 'has_entry';

const ADMISSION_CANCELLED_STATUS = 'Admission Cancelled';

const statusOptions: Array<{ label: string; value: AdmissionStatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Withdrawn', value: 'withdrawn' },
  { label: 'Admission Cancelled', value: ADMISSION_CANCELLED_STATUS },
];

const feeEntryOptions: Array<{ label: string; value: FeeEntryFilter }> = [
  { label: 'All Fee Entries', value: 'all' },
  { label: 'No Fee Entry', value: 'no_entry' },
  { label: 'Has Fee Entry', value: 'has_entry' },
];

type AdmissionCourseStat = {
  courseId?: string;
  courseName?: string;
  /** 1 = B.Tech lateral entry track (show `(LATERAL)` on course label). */
  lateralTrack?: number;
  totalAdmissions: number;
  totalCancelled?: number;
};

/** Local calendar date as YYYY-MM-DD (for stats “through today”). */
const formatLocalDateIso = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const ABSTRACT_COLUMN_COUNT = 15;

const abstractBlockOutline = 'border-2 border-slate-300 dark:border-slate-600';
const abstractBlockCellStart = 'border-l-2 border-slate-300 dark:border-slate-600';
const abstractBlockCellEnd = 'border-r-2 border-slate-300 dark:border-slate-600';
const abstractGroupHeaderClass =
  'px-1.5 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider sm:px-3 sm:py-2.5 sm:text-[11px]';
const abstractSubHeaderClass =
  'px-1.5 py-1.5 text-center text-[9px] font-bold uppercase tracking-wider sm:px-3 sm:py-2 sm:text-[10px]';

type AbstractIntakeEditRow = {
  courseId: string;
  branchId: string;
  courseName: string;
  branchName: string;
  /** 0 = regular B.Tech; 1 = B.Tech lateral entry (separate abstract row). */
  lateralTrack?: number;
  cqIntake: number | null;
  mqIntake: number | null;
};

/** Course column metadata from admissions pivot APIs (`/stats/by-reference`, `/stats/by-source`, `/stats/by-date`). */
type AdmissionStatsPivotCourse = {
  courseId: string;
  courseName: string;
  /** 0 = regular B.Tech; 1 = B.Tech lateral entry (separate pivot column). */
  lateralTrack?: number;
  /** Counts map key (`courseId::lateralTrack`); falls back when API omits it. */
  pivotKey?: string;
};

type AdmissionReferenceStatsRow = {
  referenceKey?: string | null;
  name: string;
  department?: string | null;
  designation?: string | null;
  counts?: Record<string, number>;
  total?: number;
};

type ReferenceAdmissionDrilldownRow = {
  id: string;
  admissionNumber: string;
  studentName: string;
  status: string;
  courseId?: string | null;
  course: string;
  branch: string;
};

const REFERENCE_META_BLANK = '__blank__';

const normalizeReferenceMetaValue = (value?: string | null) => {
  const trimmed = String(value ?? '').trim();
  return trimmed || REFERENCE_META_BLANK;
};

const referenceMetaFilterLabel = (value: string) =>
  value === REFERENCE_META_BLANK ? '(Not set)' : value;

const sortReferenceMetaOptions = (values: string[]) =>
  [...values].sort((a, b) => {
    if (a === REFERENCE_META_BLANK) return 1;
    if (b === REFERENCE_META_BLANK) return -1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });

const admissionPivotCountsKey = (c: AdmissionStatsPivotCourse) =>
  c.pivotKey ?? `${c.courseId}::${c.lateralTrack ?? 0}`;

const admissionPivotColumnReactKey = (c: AdmissionStatsPivotCourse) =>
  `${admissionPivotCountsKey(c)}-${c.courseName}`;

const formatAbstractIntake = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : String(value);

/** Split long college (or label) names across two stat-card title rows. */
const splitStatCardLabelTwoLines = (label: string): [string, string | null] => {
  const text = String(label || '').trim();
  if (!text) return ['', null];
  if (text.length <= 16) return [text, null];

  const breakPatterns = [
    /\s+COLLEGE\s+OF\s+/i,
    /\s+COLLEGE\s+/i,
    /\s+INSTITUTE\s+OF\s+/i,
    /\s+OF\s+/i,
    /\s+&\s+/i,
    /\s*[-–]\s*/,
  ];
  for (const pattern of breakPatterns) {
    const match = text.match(pattern);
    if (match && match.index != null && match.index > 0) {
      const splitAt = match.index + match[0].length;
      const line1 = text.slice(0, splitAt).trim();
      const line2 = text.slice(splitAt).trim();
      if (line1 && line2) return [line1, line2];
    }
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return [text, null];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
};

const StatCardTwoLineLabel = ({
  label,
  className,
}: {
  label: string;
  className: string;
}) => {
  const [line1, line2] = splitStatCardLabelTwoLines(label);
  const lineClass = `line-clamp-1 text-[9px] font-bold uppercase leading-[1.15] tracking-wide sm:text-[10px] md:text-[11px] ${className}`;
  return (
    <div className="flex min-h-[1.75rem] shrink-0 flex-col justify-center gap-px sm:min-h-[2.4rem]">
      <p className={lineClass}>{line1}</p>
      {line2 ? <p className={lineClass}>{line2}</p> : <p className={`${lineClass} invisible`} aria-hidden>.</p>}
    </div>
  );
};

const getAdmissionStatusBadge = (status?: string) => {
  if (status === 'active') {
    return {
      label: 'Active',
      className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200',
    };
  }
  if (status === ADMISSION_CANCELLED_STATUS) {
    return {
      label: ADMISSION_CANCELLED_STATUS,
      className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200',
    };
  }
  return {
    label: 'Withdrawn',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  };
};

type ApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

/** EWS Yes/No from `reservation.isEws` (with legacy fallbacks). */
const formatReservationEws = (reservation?: Admission['reservation']) => {
  if (reservation?.isEws === true) return 'Yes';
  if (reservation?.isEws === false) return 'No';
  if (reservation?.general === 'ews' || reservation?.other?.includes('EWS')) return 'Yes';
  return 'No';
};

/** Merit Yes/No from joining/admission qualifications. */
const formatQualificationMerit = (qualifications?: { merit?: boolean | null }) => {
  if (qualifications?.merit === true) return 'Yes';
  if (qualifications?.merit === false) return 'No';
  return '—';
};

/** Reference 1 from admission list row (lead_data.reference1 or list API referenceName). */
const resolveAdmissionReference1 = (record: Admission) => {
  const anyRecord = record as unknown as Record<string, unknown>;
  const fromList =
    (typeof record.referenceName === 'string' ? record.referenceName : '') ||
    (typeof anyRecord.reference_name === 'string' ? (anyRecord.reference_name as string) : '') ||
    (typeof anyRecord.reference1 === 'string' ? (anyRecord.reference1 as string) : '') ||
    (typeof anyRecord.reference === 'string' ? (anyRecord.reference as string) : '');
  const direct = String(fromList ?? '').trim();
  if (direct) return direct;
  const ld = (record.leadData as Record<string, unknown> | undefined) ?? undefined;
  return String(ld?.reference1 ?? ld?.referenceName ?? ld?.reference_name ?? '').trim();
};

/** Student list source (list API leadSource with safe fallbacks). */
const resolveAdmissionSource = (record: Admission) => {
  const isQuotaLike = (raw: string) => {
    const s = raw.trim().toLowerCase();
    if (!s) return false;
    // Quota labels sometimes leak into "source" fields — ignore these.
    return (
      s === 'conv' ||
      s === 'convenor' ||
      s === 'convener' ||
      s === 'cq' ||
      s === 'mq' ||
      s === 'management' ||
      s === 'mang' ||
      s.includes('management quota') ||
      s.includes('convenor quota') ||
      s.includes('spot') ||
      s === 'lateral entry' ||
      s.includes('lateral')
    );
  };

  const fromList = (record.leadSource || '').trim();
  if (fromList && !isQuotaLike(fromList)) return fromList;

  const ld = record.leadData as Record<string, unknown> | undefined;
  const fromLeadData = String(ld?.source ?? ld?.utmSource ?? ld?.leadSource ?? '').trim();
  if (fromLeadData && !isQuotaLike(fromLeadData)) return fromLeadData;

  // If backend hasn't derived it (or older cached rows), default like the leads UI.
  return 'Manual Form';
};

const ADMISSION_TAB_ICONS: Record<AdmissionTabKey, typeof LayoutGrid> = {
  abstract: LayoutGrid,
  'student-info': Filter,
  'reference-list': UserCircle,
  'source-list': Megaphone,
  'date-wise': CalendarDays,
};

function isAdmissionTabKey(value: string | null | undefined): value is AdmissionTabKey {
  return ADMISSION_PAGE_TABS.some(({ key }) => key === value);
}

const INR_CURRENCY_FORMAT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

/** Update ?tab= without App Router navigation (avoids full-page re-render lag). */
function replaceAdmissionsTabInUrl(tab: AdmissionTabKey) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (url.searchParams.get('tab') === tab) return;
  url.searchParams.set('tab', tab);
  const next = `${url.pathname}?${url.searchParams.toString()}`;
  window.history.replaceState(window.history.state, '', next);
}

type StudentInfoRowProps = {
  record: Admission;
  showSourceReferenceColumns: boolean;
  canEditReference: boolean;
  tableTdClass: string;
  onOpenDetails: (record: Admission) => void;
  onEditReference: (record: Admission) => void;
  onEditApplication: (joiningId: string) => void;
};

const StudentInfoRow = memo(function StudentInfoRow({
  record,
  showSourceReferenceColumns,
  canEditReference,
  tableTdClass,
  onOpenDetails,
  onEditReference,
  onEditApplication,
}: StudentInfoRowProps) {
  const hasNoFeeEntry =
    (record as Admission & { feeStatus?: string }).feeStatus === 'no_entry' ||
    record.paymentSummary?.feeStatus === 'no_entry';
  const ewsLabel = formatReservationEws(record.reservation);
  const meritLabel = formatQualificationMerit(record.qualifications);
  const docs = record.documents || {};
  const docValues = Object.values(docs);
  const receivedDocs = docValues.filter((v) => v === 'received').length;
  const totalDocs = docValues.length;

  return (
    <tr
      className={
        hasNoFeeEntry
          ? 'cursor-pointer bg-pink-50/90 transition hover:bg-pink-100/90 dark:bg-pink-950/30 dark:hover:bg-pink-950/45'
          : 'cursor-pointer transition hover:bg-blue-50/60 dark:hover:bg-slate-800/60'
      }
      onClick={(event) => {
        event.stopPropagation();
        onOpenDetails(record);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenDetails(record);
        }
      }}
      role="button"
      tabIndex={0}
      title={
        hasNoFeeEntry
          ? 'Lateral course with non-lateral quota and no TUI01/OTH1 ledger'
          : 'View admission details'
      }
    >
      <td className={`${tableTdClass} font-bold text-blue-600 dark:text-blue-400`}>
        {record.admissionNumber}
      </td>
      <td className={`${tableTdClass} hidden text-xs text-slate-500 md:table-cell`}>
        {record.createdAt ? new Date(record.createdAt).toLocaleString() : '—'}
      </td>
      <td className={tableTdClass}>
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-slate-900 sm:text-sm dark:text-slate-100">
            {record.courseInfo?.course || '—'}
          </span>
          <span className="text-[10px] text-slate-500">{record.courseInfo?.branch || '—'}</span>
        </div>
      </td>
      <td className={`${tableTdClass} font-medium text-slate-900 dark:text-slate-100`}>
        {record.studentInfo?.name ?? '—'}
      </td>
      <td className={`${tableTdClass} hidden text-slate-600 sm:table-cell dark:text-slate-400`}>
        {record.studentInfo?.phone ?? '—'}
      </td>
      <td className={`${tableTdClass} text-center`}>
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-600 sm:px-2 sm:py-1 sm:text-[10px] dark:bg-slate-800 dark:text-slate-400">
          {record.courseInfo?.quota || '—'}
        </span>
      </td>
      <td className={`${tableTdClass} hidden text-center lg:table-cell`}>
        <span className="text-[10px] font-semibold uppercase text-slate-700 sm:text-xs dark:text-slate-300">
          {record.reservation?.general || 'OC'}
        </span>
      </td>
      <td className={`${tableTdClass} hidden text-center lg:table-cell`}>
        <span
          className={`text-[10px] font-semibold sm:text-xs ${
            ewsLabel === 'Yes'
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          {ewsLabel}
        </span>
      </td>
      <td className={`${tableTdClass} hidden text-center lg:table-cell`}>
        <span
          className={`text-[10px] font-semibold sm:text-xs ${
            meritLabel === 'Yes'
              ? 'text-emerald-700 dark:text-emerald-400'
              : meritLabel === 'No'
                ? 'text-slate-600 dark:text-slate-400'
                : 'text-slate-500 dark:text-slate-500'
          }`}
        >
          {meritLabel}
        </span>
      </td>
      <td className={`${tableTdClass} hidden text-center xl:table-cell`}>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[10px] font-bold text-slate-700 sm:text-xs dark:text-slate-300">
            {receivedDocs}/{totalDocs}
          </span>
          <div className="h-1 w-10 overflow-hidden rounded-full bg-slate-100 sm:w-12 dark:bg-slate-800">
            <div
              className="h-full bg-blue-500"
              style={{ width: `${(receivedDocs / (totalDocs || 1)) * 100}%` }}
            />
          </div>
        </div>
      </td>
      <td className={`${tableTdClass} text-right`}>
        <span className="text-xs font-bold text-slate-900 sm:text-sm dark:text-slate-100">
          {INR_CURRENCY_FORMAT.format(record.paymentSummary?.yearOnePaid ?? 0)}
        </span>
      </td>
      {showSourceReferenceColumns ? (
        <>
          <td className={`${tableTdClass} hidden text-right text-xs text-slate-600 md:table-cell dark:text-slate-400`}>
            {resolveAdmissionSource(record) || '—'}
          </td>
          <td className={`${tableTdClass} hidden text-right text-xs text-slate-600 lg:table-cell dark:text-slate-400`}>
            <div className="flex items-center justify-end gap-1">
              <span>{resolveAdmissionReference1(record) || '—'}</span>
              {canEditReference && record.status !== ADMISSION_CANCELLED_STATUS ? (
                <button
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                  title="Edit reference"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditReference(record);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </td>
        </>
      ) : null}
      <td className={`${tableTdClass} text-right`}>
        {record.joiningId ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEditApplication(String(record.joiningId));
            }}
            className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
          >
            Edit Application
          </button>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
});

const CompletedAdmissionsPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const { canEditReference, canEditAdmission } = useJoiningDeskPermissions();
  const isSuperAdmin = auth.getUser()?.roleName === 'Super Admin';
  const showSourceReferenceColumns = isSuperAdmin;
  const tableColumnCount = showSourceReferenceColumns ? 14 : 12;
  const { allowedTabs, canAccessTab, hasAccess: hasJoiningAccess } = useAdmissionTabPermissions();
  const allowedTabsKey = allowedTabs.join('|');
  const visibleAdmissionTabs = useMemo(
    () => ADMISSION_PAGE_TABS.filter(({ key }) => allowedTabs.includes(key)),
    // allowedTabsKey keeps this stable when the array identity churns but contents match
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allowedTabsKey]
  );
  const queryClient = useQueryClient();
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTabState] = useState<AdmissionTabKey>(() =>
    isAdmissionTabKey(tabFromUrl) ? tabFromUrl : 'abstract'
  );

  const setActiveTab = useCallback((key: AdmissionTabKey) => {
    setActiveTabState((prev) => (prev === key ? prev : key));
    replaceAdmissionsTabInUrl(key);
  }, []);

  // Restore tab when App Router navigates here with ?tab= (e.g. back from edit)
  useEffect(() => {
    const nextTab = searchParams.get('tab');
    if (isAdmissionTabKey(nextTab)) {
      setActiveTabState((prev) => (prev === nextTab ? prev : nextTab));
    }
  }, [searchParams]);

  useEffect(() => {
    if (visibleAdmissionTabs.length === 0) return;
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab(visibleAdmissionTabs[0].key);
    }
  }, [activeTab, allowedTabs, visibleAdmissionTabs, setActiveTab]);

  // Seed ?tab= once on mount so back navigation can restore the active tab
  useEffect(() => {
    replaceAdmissionsTabInUrl(activeTab);
    // intentionally mount-only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const admissionsEditQuery = `from=admissions&tab=${encodeURIComponent(activeTab)}`;
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdmissionStatusFilter>('active');
  const [feeEntryFilter, setFeeEntryFilter] = useState<FeeEntryFilter>('all');
  const [quotaFilter, setQuotaFilter] = useState<string>('');
  const [collegeFilter, setCollegeFilter] = useState<string>('');
  const [courseFilter, setCourseFilter] = useState<string>('');
  const [branchFilter, setBranchFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [dateRange, setDateRange] = useState({
    from: '',
    to: '',
  });
  
  const [cancelTarget, setCancelTarget] = useState<Admission | null>(null);
  const [cancelForm, setCancelForm] = useState({
    reason: '',
    approvedBy: '',
  });
  const [intakeEditTarget, setIntakeEditTarget] = useState<AbstractIntakeEditRow | null>(null);
  const [intakeForm, setIntakeForm] = useState({ cqIntake: '', mqIntake: '' });
  const [studentInfoViewRecord, setStudentInfoViewRecord] = useState<Admission | null>(null);
  const [referenceEditTarget, setReferenceEditTarget] = useState<Admission | null>(null);
  const [referenceEditValue, setReferenceEditValue] = useState('');
  const [referenceDepartmentFilter, setReferenceDepartmentFilter] = useState('');
  const [referenceDesignationFilter, setReferenceDesignationFilter] = useState('');
  const [referenceSearchQuery, setReferenceSearchQuery] = useState('');
  const [referenceDrilldownTarget, setReferenceDrilldownTarget] =
    useState<AdmissionReferenceStatsRow | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [pendingAdmissionsOpen, setPendingAdmissionsOpen] = useState(false);
  const [minimumConfigOpen, setMinimumConfigOpen] = useState(false);
  const [showDocumentSmsDialog, setShowDocumentSmsDialog] = useState(false);

  const {
    data: minimumFeeConfigs = [],
    refetch: refetchMinimumFeeConfigs,
  } = useQuery({
    queryKey: ['admissions', 'minimum-fee-configs'],
    queryFn: async () => {
      const response = await admissionAPI.listMinimumFeeConfigs();
      return (response?.configs || []) as MinimumFeeConfigEntry[];
    },
    staleTime: 30_000,
  });
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 350);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearchTerm]);

  useEffect(() => {
    const term = debouncedSearchTerm.trim();
    if (term.length > 0 && activeTab !== 'student-info' && allowedTabs.includes('student-info')) {
      setActiveTab('student-info');
    }
  }, [debouncedSearchTerm, activeTab, allowedTabs, setActiveTab]);

  const listTabsActive = activeTab === 'student-info';

  const { getCourseName, getBranchName, getCollegeNameForCourse } = useCourseLookup();
  const { colleges, isLoading: collegesLoading } = useInstitutions();
  // Derive college access scope from the joining module permission (mirrors JoiningLeadFormWorkspace logic).
  const joiningPermData = useModulePermissionRaw('joining');
  const joiningAllowedCollegeIds = useMemo(() => {
    // undefined or null → no restriction (show all colleges)
    if (!joiningPermData?.allowedColleges) return undefined;
    const ids = (joiningPermData.allowedColleges as string[])
      .filter((id): id is string => typeof id === 'string')
      .map((id) => String(id).trim())
      .filter(Boolean);
    // Empty array also means no restriction — user has all-college access
    // (an empty allowedColleges list is stored when no specific colleges are scoped)
    return ids.length ? ids : undefined;
  }, [joiningPermData?.allowedColleges]);

  /** Colleges visible in the filter dropdown — restricted to the user's scope when set. */
  const visibleColleges = useMemo(() => {
    if (!Array.isArray(joiningAllowedCollegeIds)) return colleges;
    const allowedSet = new Set(joiningAllowedCollegeIds);
    return colleges.filter((c) => allowedSet.has(c.id));
  }, [colleges, joiningAllowedCollegeIds]);

  /**
   * Effective college scope for API calls: the explicit filter the user picked, OR (when the
   * user has exactly one allowed college and no filter selected) that college automatically.
   * This ensures scoped users never inadvertently fetch data outside their allowed colleges.
   */
  const effectiveCollegeFilter = useMemo(() => {
    if (collegeFilter) return collegeFilter;
    if (Array.isArray(joiningAllowedCollegeIds) && joiningAllowedCollegeIds.length === 1) {
      return joiningAllowedCollegeIds[0];
    }
    return '';
  }, [collegeFilter, joiningAllowedCollegeIds]);

  // Fetch courses for dropdown (scoped by college when selected)
  const { data: coursesData } = useQuery({
    queryKey: ['courses', 'list', effectiveCollegeFilter],
    queryFn: async () => {
      const response = await courseAPI.list({
        showInactive: false,
        collegeId: effectiveCollegeFilter || undefined,
      });
      return response.data || response;
    },
    staleTime: 120_000,
  });
  const courses = Array.isArray(coursesData) ? coursesData : (coursesData as any)?.data || [];

  const coursesForCollegeFilter = useMemo(() => {
    if (!effectiveCollegeFilter) return courses;
    return courses.filter(
      (c: { collegeId?: string | null }) =>
        c.collegeId != null && String(c.collegeId).trim() === effectiveCollegeFilter
    );
  }, [courses, effectiveCollegeFilter]);

  // Fetch branches for dropdown
  const { data: branchesData } = useQuery({
    queryKey: ['branches', 'list', courseFilter],
    queryFn: async () => {
      if (!courseFilter) return [];
      const response = await courseAPI.listBranches({ courseId: courseFilter });
      return response.data || response;
    },
    enabled: !!courseFilter,
    staleTime: 120_000,
  });
  const branches = Array.isArray(branchesData) ? branchesData : (branchesData as any)?.data || [];

  const [isExporting, setIsExporting] = useState(false);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (collegeFilter) count += 1;
    if (courseFilter) count += 1;
    if (branchFilter) count += 1;
    if (sourceFilter) count += 1;
    if (quotaFilter) count += 1;
    if (statusFilter !== 'active') count += 1;
    if (feeEntryFilter !== 'all') count += 1;
    if (dateRange.from) count += 1;
    if (dateRange.to) count += 1;
    return count;
  }, [
    collegeFilter,
    courseFilter,
    branchFilter,
    sourceFilter,
    quotaFilter,
    statusFilter,
    feeEntryFilter,
    dateRange.from,
    dateRange.to,
  ]);

  const clearFilters = () => {
    setCollegeFilter('');
    setCourseFilter('');
    setBranchFilter('');
    setSourceFilter('');
    setQuotaFilter('');
    setStatusFilter('active');
    setFeeEntryFilter('all');
    setDateRange({ from: '', to: '' });
    setSearchTerm('');
    setPage(1);
  };

  /** Distinct lead sources for the source filter dropdown (shared leads filter options API). */
  const { data: leadFilterOptionsRes } = useQuery({
    queryKey: ['filterOptions', 'admissions-completed'],
    queryFn: async () => {
      const res = await leadAPI.getFilterOptions();
      const payload = (res as { data?: Record<string, unknown> })?.data ?? res;
      return payload && typeof payload === 'object' ? payload : {};
    },
    staleTime: 300_000,
  });

  const sourceOptions = useMemo(() => {
    const raw = (leadFilterOptionsRes as { sources?: string[] } | undefined)?.sources;
    const values = new Set<string>(
      (Array.isArray(raw) ? raw : []).map((s) => String(s).trim()).filter(Boolean)
    );
    values.add('Self Registration');
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [leadFilterOptionsRes]);

  const { data: studentQuotasResponse } = useQuery({
    queryKey: ['courses', 'student-quotas', 'student-info-filters'],
    queryFn: async () => courseAPI.listStudentQuotas(),
    staleTime: 300_000,
  });

  const quotaOptions = useMemo(
    () => quotaLabelsFromCatalog(parseStudentQuotasResponse(studentQuotasResponse)),
    [studentQuotasResponse]
  );

  const statsThroughDate = dateRange.to || formatLocalDateIso(new Date());

  // Stats Query (course cards — only needed on Abstract tab)
  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: [
      'admissions',
      'stats',
      dateRange.from,
      statsThroughDate,
      effectiveCollegeFilter,
      courseFilter,
      branchFilter,
    ],
    queryFn: () =>
      admissionAPI.getStats({
        startDate: dateRange.from || undefined,
        endDate: statsThroughDate,
        collegeId: effectiveCollegeFilter || undefined,
        courseId: courseFilter || undefined,
        branchId: branchFilter || undefined,
        courseName: getCourseName(courseFilter) || undefined,
        branchName: getBranchName(branchFilter) || undefined,
      }),
    enabled: activeTab === 'abstract',
    staleTime: 120_000,
  });

  const stats: AdmissionCourseStat[] = statsData?.stats || [];

  const courseStatsForCards = useMemo(() => {
    return stats
      .filter((row) => {
        const active = Number(row.totalAdmissions) || 0;
        const cancelled = Number(row.totalCancelled) || 0;
        return active + cancelled > 0;
      })
      .sort((a, b) => (Number(b.totalAdmissions) || 0) - (Number(a.totalAdmissions) || 0));
  }, [stats]);

  const courseIdToCollegeId = useMemo(() => {
    const map = new Map<string, string>();
    courses.forEach((c: { _id?: string; collegeId?: string | null }) => {
      const id = String(c._id ?? '').trim();
      const collegeId =
        c.collegeId != null && String(c.collegeId).trim() !== '' ? String(c.collegeId).trim() : '';
      if (id && collegeId) map.set(id, collegeId);
    });
    return map;
  }, [courses]);

  const collegeNameById = useMemo(() => {
    const map = new Map<string, string>();
    colleges.forEach((c) => {
      const id = String(c.id ?? '').trim();
      if (id) map.set(id, String(c.name ?? '').trim());
    });
    return map;
  }, [colleges]);

  const resolveStatCourseLabel = (
    row: Pick<AdmissionCourseStat, 'courseId' | 'courseName' | 'lateralTrack'>
  ) =>
    resolveAdmissionStatCourseLabel({
      courseId: row.courseId,
      courseName: row.courseName,
      lateralTrack: row.lateralTrack,
      getCourseName,
    });

  const resolvePivotCourseLabel = (c: AdmissionStatsPivotCourse) =>
    resolveAdmissionStatCourseLabel({
      courseId: c.courseId.split('|')[0] || c.courseId,
      courseName: c.courseName,
      lateralTrack: c.lateralTrack,
      getCourseName,
    });

  const resolveStatCollegeName = (row: AdmissionCourseStat) => {
    const courseId = String(row.courseId ?? '').trim();
    const collegeId = courseId ? courseIdToCollegeId.get(courseId) : undefined;
    if (collegeId) {
      return (
        collegeNameById.get(collegeId) ||
        getCollegeNameForCourse(row.courseId) ||
        'Unknown college'
      );
    }
    return getCollegeNameForCourse(row.courseId) || 'Other';
  };

  const resolveReferenceAdmissionCollege = (row: ReferenceAdmissionDrilldownRow) => {
    const courseId = String(row.courseId ?? '').trim();
    const collegeId = courseId ? courseIdToCollegeId.get(courseId) : undefined;
    if (collegeId) {
      return collegeNameById.get(collegeId) || getCollegeNameForCourse(courseId) || '—';
    }
    return getCollegeNameForCourse(courseId) || '—';
  };

  useEffect(() => {
    if (!collegeFilter) return;
    if (courseFilter) {
      const courseCollege = courseIdToCollegeId.get(courseFilter);
      if (courseCollege && courseCollege !== collegeFilter) {
        setCourseFilter('');
        setBranchFilter('');
      }
    }
  }, [collegeFilter, courseFilter, courseIdToCollegeId]);

  const saveBranchIntakeMutation = useMutation({
    mutationFn: (payload: AbstractIntakeEditRow & { cqIntake: number | null; mqIntake: number | null }) =>
      admissionAPI.upsertBranchIntake({
        courseId: payload.courseId,
        branchId: payload.branchId,
        courseName: payload.courseName,
        branchName: payload.branchName,
        lateralTrack: payload.lateralTrack ?? 0,
        cqIntake: payload.cqIntake,
        mqIntake: payload.mqIntake,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admissions', 'stats'] });
      showToast.success('Intake saved');
      setIntakeEditTarget(null);
    },
    onError: (error: ApiError) => {
      showToast.error(error.response?.data?.message || 'Failed to save intake');
    },
  });

  const openIntakeEditor = (row: AbstractIntakeEditRow) => {
    setIntakeEditTarget(row);
    setIntakeForm({
      cqIntake: row.cqIntake != null ? String(row.cqIntake) : '',
      mqIntake: row.mqIntake != null ? String(row.mqIntake) : '',
    });
  };

  const submitIntakeEdit = () => {
    if (!intakeEditTarget) return;
    const parseField = (raw: string): number | null => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return NaN;
      return n;
    };
    const cqIntake = parseField(intakeForm.cqIntake);
    const mqIntake = parseField(intakeForm.mqIntake);
    if (Number.isNaN(cqIntake) || Number.isNaN(mqIntake)) {
      showToast.error('Intake must be a whole number ≥ 0, or leave blank');
      return;
    }
    saveBranchIntakeMutation.mutate({
      ...intakeEditTarget,
      cqIntake,
      mqIntake,
    });
  };

  const pivotReportParams = useMemo(
    () => ({
      startDate: dateRange.from || undefined,
      endDate: statsThroughDate,
      collegeId: effectiveCollegeFilter || undefined,
      courseId: courseFilter || undefined,
      branchId: branchFilter || undefined,
      courseName: getCourseName(courseFilter) || undefined,
      branchName: getBranchName(branchFilter) || undefined,
      status: statusFilter === 'all' ? undefined : statusFilter,
    }),
    [
      dateRange.from,
      statsThroughDate,
      effectiveCollegeFilter,
      courseFilter,
      branchFilter,
      statusFilter,
      getCourseName,
      getBranchName,
    ]
  );

  const { data: referenceStatsData, isLoading: referenceStatsLoading } = useQuery({
    queryKey: ['admissions', 'stats', 'by-reference', pivotReportParams],
    queryFn: async () => admissionAPI.getStatsByReference(pivotReportParams),
    enabled: activeTab === 'reference-list',
    staleTime: 120_000,
  });

  const { data: sourceStatsData, isLoading: sourceStatsLoading } = useQuery({
    queryKey: ['admissions', 'stats', 'by-source', pivotReportParams],
    queryFn: async () => admissionAPI.getStatsBySource(pivotReportParams),
    enabled: activeTab === 'source-list',
    staleTime: 120_000,
  });

  const { data: dateWiseStatsData, isLoading: dateWiseStatsLoading } = useQuery({
    queryKey: ['admissions', 'stats', 'by-date', pivotReportParams],
    queryFn: async () => admissionAPI.getStatsByDate(pivotReportParams),
    enabled: activeTab === 'date-wise',
    staleTime: 120_000,
  });

  const referenceCourses = (referenceStatsData?.courses ?? []) as AdmissionStatsPivotCourse[];
  const referenceRows = (referenceStatsData?.rows ?? []) as AdmissionReferenceStatsRow[];

  const referenceDepartmentOptions = useMemo(() => {
    const values = new Set<string>();
    referenceRows.forEach((row) => {
      values.add(normalizeReferenceMetaValue(row.department));
    });
    return sortReferenceMetaOptions(Array.from(values));
  }, [referenceRows]);

  const referenceDesignationOptions = useMemo(() => {
    const values = new Set<string>();
    referenceRows.forEach((row) => {
      if (
        referenceDepartmentFilter &&
        normalizeReferenceMetaValue(row.department) !== referenceDepartmentFilter
      ) {
        return;
      }
      values.add(normalizeReferenceMetaValue(row.designation));
    });
    return sortReferenceMetaOptions(Array.from(values));
  }, [referenceRows, referenceDepartmentFilter]);

  const filteredReferenceRows = useMemo(
    () =>
      referenceRows.filter((row) => {
        if (
          referenceDepartmentFilter &&
          normalizeReferenceMetaValue(row.department) !== referenceDepartmentFilter
        ) {
          return false;
        }
        if (
          referenceDesignationFilter &&
          normalizeReferenceMetaValue(row.designation) !== referenceDesignationFilter
        ) {
          return false;
        }
        if (
          referenceSearchQuery &&
          !String(row.name || '').toLowerCase().includes(referenceSearchQuery.toLowerCase())
        ) {
          return false;
        }
        return true;
      }),
    [referenceRows, referenceDepartmentFilter, referenceDesignationFilter, referenceSearchQuery]
  );

  useEffect(() => {
    if (!referenceDesignationFilter) return;
    if (!referenceDesignationOptions.includes(referenceDesignationFilter)) {
      setReferenceDesignationFilter('');
    }
  }, [referenceDesignationFilter, referenceDesignationOptions]);

  const referenceDrilldownUnspecified = useMemo(() => {
    if (!referenceDrilldownTarget) return false;
    return (
      !referenceDrilldownTarget.referenceKey &&
      referenceDrilldownTarget.name.trim().toLowerCase() === '(not specified)'
    );
  }, [referenceDrilldownTarget]);

  const referenceDrilldownParams = useMemo(
    () => ({
      ...pivotReportParams,
      referenceKey: referenceDrilldownUnspecified
        ? undefined
        : referenceDrilldownTarget?.referenceKey ?? referenceDrilldownTarget?.name,
      name: referenceDrilldownTarget?.name,
      unspecified: referenceDrilldownUnspecified ? true : undefined,
    }),
    [
      pivotReportParams,
      referenceDrilldownTarget?.name,
      referenceDrilldownTarget?.referenceKey,
      referenceDrilldownUnspecified,
    ]
  );

  const {
    data: referenceDrilldownData,
    isLoading: referenceDrilldownLoading,
    isError: referenceDrilldownError,
  } = useQuery({
    queryKey: ['admissions', 'stats', 'by-reference', 'admissions', referenceDrilldownParams],
    queryFn: async () => admissionAPI.getReferenceAdmissions(referenceDrilldownParams),
    enabled: !!referenceDrilldownTarget,
    staleTime: 60_000,
  });

  const referenceDrilldownAdmissions = (referenceDrilldownData?.admissions ??
    []) as ReferenceAdmissionDrilldownRow[];

  const sourceCourses = (sourceStatsData?.courses ?? []) as AdmissionStatsPivotCourse[];
  const sourceRows = sourceStatsData?.rows ?? [];
  const dateWiseCourses = (dateWiseStatsData?.courses ?? []) as AdmissionStatsPivotCourse[];
  const dateWiseRows = dateWiseStatsData?.rows ?? [];

  // Detailed List Query
  const queryKey = useMemo(
    () => [
      'admissions',
      page,
      limit,
      debouncedSearchTerm,
      statusFilter,
      feeEntryFilter,
      quotaFilter,
      effectiveCollegeFilter,
      courseFilter,
      branchFilter,
      sourceFilter,
      dateRange,
    ],
    [
      page,
      limit,
      debouncedSearchTerm,
      statusFilter,
      feeEntryFilter,
      quotaFilter,
      effectiveCollegeFilter,
      courseFilter,
      branchFilter,
      sourceFilter,
      dateRange,
    ]
  );

  const { data, isLoading, isFetching } = useQuery<AdmissionListResponse>({
    queryKey,
    enabled: listTabsActive,
    queryFn: async () => {
      const response = await admissionAPI.list({
        page,
        limit,
        search: debouncedSearchTerm || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        collegeId: effectiveCollegeFilter || undefined,
        courseId: courseFilter || undefined,
        branchId: branchFilter || undefined,
        courseName: getCourseName(courseFilter) || undefined,
        branchName: getBranchName(branchFilter) || undefined,
        source: sourceFilter || undefined,
        feeEntry: feeEntryFilter === 'all' ? undefined : feeEntryFilter,
        quota: quotaFilter || undefined,
        startDate: dateRange.from || undefined,
        endDate: statsThroughDate,
      });
      return response.data || response;
    },
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });

  const admissions = data?.admissions ?? [];
  const pagination = data?.pagination ?? { page: 1, pages: 1, limit: 20, total: 0 };
  const showListSpinner = isLoading && admissions.length === 0;
  const isEmpty = !showListSpinner && admissions.length === 0;

  const PAGE_BLOCK_SIZE = 5;
  const paginationBlock = useMemo(() => {
    const totalPages = Math.max(1, pagination.pages || 1);
    const currentPage = Math.min(Math.max(1, pagination.page || 1), totalPages);
    const blockIndex = Math.floor((currentPage - 1) / PAGE_BLOCK_SIZE);
    const blockStart = blockIndex * PAGE_BLOCK_SIZE + 1;
    const blockEnd = Math.min(blockStart + PAGE_BLOCK_SIZE - 1, totalPages);
    const pageNumbers = Array.from(
      { length: blockEnd - blockStart + 1 },
      (_, i) => blockStart + i
    );
    return {
      pageNumbers,
      hasPrevBlock: blockStart > 1,
      hasNextBlock: blockEnd < totalPages,
      prevBlockPage: Math.max(1, blockStart - PAGE_BLOCK_SIZE),
      nextBlockPage: Math.min(totalPages, blockEnd + 1),
    };
  }, [pagination.page, pagination.pages]);

  const cancelAdmissionMutation = useMutation({
    mutationFn: async () => {
      if (!cancelTarget?._id) {
        throw new Error('Select an admission to cancel');
      }
      return admissionAPI.cancelById(cancelTarget._id, {
        reason: cancelForm.reason.trim(),
        approvedBy: cancelForm.approvedBy.trim(),
      });
    },
    onSuccess: async () => {
      showToast.success('Admission cancelled successfully');
      setCancelTarget(null);
      setCancelForm({ reason: '', approvedBy: '' });
      await queryClient.invalidateQueries({ queryKey: ['admissions'] });
    },
    onError: (error: ApiError) => {
      showToast.error(error.response?.data?.message || 'Failed to cancel admission');
    },
  });

  const sendDocumentSmsMutation = useMutation({
    mutationFn: async ({ admissionId, selectedDocuments }: { admissionId: string; selectedDocuments?: string[] }) => {
      return admissionAPI.sendDocumentNotificationSms(admissionId, selectedDocuments);
    },
    onSuccess: () => {
      showToast.success('Pending documents SMS sent successfully');
      setShowDocumentSmsDialog(false);
    },
    onError: (error: ApiError) => {
      showToast.error(error.response?.data?.message || 'Failed to send SMS');
    },
  });

  const openCancelDialog = (record: Admission) => {
    setCancelTarget(record);
    setCancelForm({ reason: '', approvedBy: '' });
  };

  const submitCancellation = () => {
    if (!cancelForm.reason.trim()) {
      showToast.error('Reason for cancellation is required');
      return;
    }
    if (!cancelForm.approvedBy.trim()) {
      showToast.error('Approved by is required');
      return;
    }
    cancelAdmissionMutation.mutate();
  };

  const saveReferenceMutation = useMutation({
    mutationFn: async () => {
      if (!referenceEditTarget?._id) {
        throw new Error('Select an admission to update');
      }
      return admissionAPI.patchReferenceById(referenceEditTarget._id, referenceEditValue.trim());
    },
    onSuccess: async () => {
      showToast.success('Reference updated');
      setReferenceEditTarget(null);
      setReferenceEditValue('');
      await queryClient.invalidateQueries({ queryKey: ['admissions'] });
      await queryClient.invalidateQueries({ queryKey: ['admissions', 'stats', 'by-reference'] });
      await queryClient.invalidateQueries({ queryKey: ['admissions', 'reference-names'] });
    },
    onError: (error: ApiError) => {
      showToast.error(error.response?.data?.message || 'Failed to update reference');
    },
  });

  const openReferenceEditor = useCallback(
    (record: Admission) => {
      if (!canEditReference) return;
      setReferenceEditTarget(record);
      setReferenceEditValue(resolveAdmissionReference1(record));
    },
    [canEditReference]
  );

  const handleOpenStudentInfoDetails = useCallback((record: Admission) => {
    setStudentInfoViewRecord(record);
  }, []);

  const handleEditApplicationFromList = useCallback(
    (joiningId: string) => {
      router.push(`/superadmin/joining/${joiningId}?${admissionsEditQuery}`);
    },
    [router, admissionsEditQuery]
  );

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const blob = await admissionAPI.exportAdmissions({
        search: searchTerm || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
        collegeId: effectiveCollegeFilter || undefined,
        courseId: courseFilter || undefined,
        branchId: branchFilter || undefined,
        courseName: getCourseName(courseFilter) || undefined,
        branchName: getBranchName(branchFilter) || undefined,
        source: sourceFilter || undefined,
        quota: quotaFilter || undefined,
        startDate: dateRange.from || undefined,
        endDate: statsThroughDate,
      });

      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      const date = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `admissions_export_${date}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast.success('Excel export started successfully');
    } catch (error) {
      console.error('Error exporting admissions:', error);
      showToast.error('Failed to export admissions. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrintAbstract = () => {
    const flatRows = stats.flatMap((c: any) => {
      const branchRows =
        Array.isArray(c.branches) && c.branches.length > 0
          ? c.branches
          : [
              {
                branchId: '',
                branchName: '—',
                cqIntake: null,
                mqIntake: null,
                cqAdmitted: 0,
                cqCancelled: 0,
                mqAdmitted: 0,
                mqCancelled: 0,
                spotAdmitted: 0,
                spotCancelled: 0,
                meritYes: 0,
                meritNo: 0,
                totalAdmissions: Number(c.totalAdmissions) || 0,
                totalCancelled: Number(c.totalCancelled) || 0,
              },
            ];
      return branchRows.map((b: any) => ({
        courseName: resolveStatCourseLabel({ courseId: c.courseId, courseName: c.courseName, lateralTrack: c.lateralTrack ?? b.lateralTrack }),
        branchName: getBranchName(b.branchId) || b.branchName || '—',
        totalAdmissions: b.totalAdmissions ?? 0,
        totalCancelled: b.totalCancelled ?? 0,
        cqIntake: b.cqIntake,
        cqAdmitted: b.cqAdmitted ?? 0,
        cqCancelled: b.cqCancelled ?? 0,
        mqIntake: b.mqIntake,
        mqAdmitted: b.mqAdmitted ?? 0,
        mqCancelled: b.mqCancelled ?? 0,
        spotAdmitted: b.spotAdmitted ?? 0,
        spotCancelled: b.spotCancelled ?? 0,
        meritYes: b.meritYes ?? 0,
        meritNo: b.meritNo ?? 0,
      }));
    });

    const dateLabel = dateRange.from
      ? `${dateRange.from} → ${statsThroughDate}`
      : `Through ${statsThroughDate}`;

    const esc = escapePrintHtml;
    const fmtIntake = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v));

    const bodyRows = flatRows
      .map(
        (row) => `
      <tr>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;font-weight:700;font-size:12px;white-space:nowrap;">${esc(row.courseName)}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;font-size:11px;background:#f8fafc;white-space:nowrap;">${esc(row.branchName)}</td>
        <td style="padding:8px 10px;border:2px solid #cbd5e1;font-weight:700;color:#2563eb;text-align:center;">${esc(String(row.totalAdmissions))}</td>
        <td style="padding:8px 10px;border:2px solid #cbd5e1;border-left:1px solid #e2e8f0;font-weight:700;color:#dc2626;text-align:center;">${esc(String(row.totalCancelled))}</td>
        <td style="padding:8px 10px;border:2px solid #cbd5e1;font-weight:600;color:#475569;text-align:center;">${esc(fmtIntake(row.cqIntake))}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;border-left:none;font-weight:700;color:#2563eb;text-align:center;">${esc(String(row.cqAdmitted))}</td>
        <td style="padding:8px 10px;border:2px solid #cbd5e1;border-left:1px solid #e2e8f0;font-weight:700;color:#dc2626;text-align:center;">${esc(String(row.cqCancelled))}</td>
        <td style="padding:8px 10px;border:2px solid #cbd5e1;font-weight:600;color:#475569;text-align:center;">${esc(fmtIntake(row.mqIntake))}</td>
        <td style="padding:8px 10px;border:1px solid #e2e8f0;border-left:none;font-weight:700;color:#d97706;text-align:center;">${esc(String(row.mqAdmitted))}</td>
        <td style="padding:8px 10px;border:2px solid #cbd5e1;border-left:1px solid #e2e8f0;font-weight:700;color:#dc2626;text-align:center;">${esc(String(row.mqCancelled))}</td>
        <td style="padding:8px 10px;border:2px solid #cbd5e1;font-weight:700;color:#7c3aed;text-align:center;">${esc(String(row.spotAdmitted))}</td>
        <td style="padding:8px 10px;border:2px solid #cbd5e1;border-left:1px solid #e2e8f0;font-weight:700;color:#dc2626;text-align:center;">${esc(String(row.spotCancelled))}</td>
        <td style="padding:8px 10px;border:2px solid #cbd5e1;font-weight:700;color:#059669;text-align:center;">${esc(String(row.meritYes))}</td>
        <td style="padding:8px 10px;border:2px solid #cbd5e1;border-left:1px solid #e2e8f0;font-weight:700;color:#475569;text-align:center;">${esc(String(row.meritNo))}</td>
      </tr>`
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Admission Abstract</title>
  <style>
    @page { size: A3 landscape; margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; color: #0f172a; }

    /* ── Page header ── */
    .page-header {
      text-align: center;
      margin-bottom: 18px;
      padding-bottom: 14px;
      border-bottom: 3px solid #0f172a;
    }
    .page-header .doc-title {
      margin: 0 0 4px;
      font-size: 28px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #0f172a;
    }
    .page-header .doc-subtitle {
      margin: 0;
      font-size: 13px;
      color: #475569;
      font-weight: 500;
    }
    .page-header .doc-meta {
      margin: 6px 0 0;
      font-size: 11px;
      color: #94a3b8;
    }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; font-size: 13px; }

    /* Group header row */
    .th-group {
      padding: 10px 12px;
      border: 2px solid #cbd5e1;
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      text-align: center;
      white-space: nowrap;
    }
    /* Sub-header row */
    .th-sub {
      padding: 9px 10px;
      border: 1px solid #e2e8f0;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      text-align: center;
      white-space: nowrap;
    }
    /* Row/label cells */
    .th-label {
      padding: 10px 12px;
      border: 2px solid #cbd5e1;
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      text-align: left;
      background: #f1f5f9;
      white-space: nowrap;
    }

    tbody tr:nth-child(even) { background: #f8fafc; }

    /* Group colours */
    .group-total      { background: #e2e8f0 !important; border: 2px solid #94a3b8 !important; color: #1e293b; }
    .group-convenor   { background: #dbeafe !important; border: 2px solid #93c5fd !important; color: #1e40af; }
    .group-management { background: #fef3c7 !important; border: 2px solid #fcd34d !important; color: #92400e; }
    .group-spot       { background: #ede9fe !important; border: 2px solid #c4b5fd !important; color: #5b21b6; }
    .group-merit      { background: #d1fae5 !important; border: 2px solid #6ee7b7 !important; color: #065f46; }

    /* Sub-header colours */
    .sub-blue   { color: #2563eb; border-color: #93c5fd !important; }
    .sub-red    { color: #dc2626; border-color: #fca5a5 !important; }
    .sub-slate  { color: #475569; }
    .sub-amber  { color: #d97706; border-color: #fcd34d !important; }
    .sub-violet { color: #7c3aed; border-color: #c4b5fd !important; }
    .sub-green  { color: #059669; border-color: #6ee7b7 !important; }

    .footer { margin-top: 14px; font-size: 10px; color: #94a3b8; text-align: right; }
  </style>
</head>
<body>

  <!-- ══ PAGE HEADER ══ -->
  <div class="page-header">
    <h1 class="doc-title">Abstract</h1>
    <p class="doc-subtitle">Admissions Desk &mdash; Course &amp; Branch Summary</p>
    <p class="doc-meta">Date range: ${esc(dateLabel)} &nbsp;&bull;&nbsp; Printed on ${esc(new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))}</p>
  </div>

  <!-- ══ ABSTRACT TABLE ══ -->
  <table>
    <thead>
      <!-- Group header row -->
      <tr>
        <th rowspan="2" class="th-label">Course</th>
        <th rowspan="2" class="th-label">Branch</th>
        <th colspan="2" class="th-group group-total">Total Admissions</th>
        <th colspan="3" class="th-group group-convenor">Convenor</th>
        <th colspan="3" class="th-group group-management">Management</th>
        <th colspan="2" class="th-group group-spot">Spot</th>
        <th colspan="2" class="th-group group-merit">Merit</th>
      </tr>
      <!-- Sub-header row -->
      <tr>
        <th class="th-sub sub-blue">Active</th>
        <th class="th-sub sub-red">Cancelled</th>
        <th class="th-sub sub-slate">Intake</th>
        <th class="th-sub sub-blue">Admitted</th>
        <th class="th-sub sub-red">Cancelled</th>
        <th class="th-sub sub-slate">Intake</th>
        <th class="th-sub sub-amber">Admitted</th>
        <th class="th-sub sub-red">Cancelled</th>
        <th class="th-sub sub-violet">Admitted</th>
        <th class="th-sub sub-red">Cancelled</th>
        <th class="th-sub sub-green">Yes</th>
        <th class="th-sub sub-slate">No</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || `<tr><td colspan="14" style="text-align:center;padding:40px;color:#94a3b8;font-size:13px;">No data available.</td></tr>`}
    </tbody>
  </table>

  <div class="footer">Generated from Admissions CRM &mdash; for office records only.</div>
</body>
</html>`;

    printHtmlDocument(html, 'Admission Abstract');
  };

  const totalAdmissionsCount = useMemo(() => {
    return stats.reduce((acc, curr) => acc + (Number(curr.totalAdmissions) || 0), 0);
  }, [stats]);

  const totalCancelledCount = useMemo(() => {
    return stats.reduce((acc, curr) => acc + (Number(curr.totalCancelled) || 0), 0);
  }, [stats]);

  const statsThroughLabel = useMemo(() => {
    try {
      return new Date(`${statsThroughDate}T12:00:00`).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return statsThroughDate;
    }
  }, [statsThroughDate]);

  const headerContent = useMemo(
    () => (
      <div className="flex flex-col items-end gap-0.5 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Admissions Desk</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Through {statsThroughLabel}
          {dateRange.from ? ` · from ${dateRange.from}` : ''} ·{' '}
          <span className="font-medium text-blue-600">A</span> active ·{' '}
          <span className="font-medium text-red-600">C</span> cancelled
        </p>
      </div>
    ),
    [statsThroughLabel, dateRange.from]
  );

  useEffect(() => {
    setHeaderContent(headerContent);
    return () => clearHeaderContent();
  }, [headerContent, setHeaderContent, clearHeaderContent]);

  const statCardsGridClass =
    'grid w-full grid-cols-3 gap-1.5 sm:grid-cols-3 sm:gap-2 md:grid-cols-5 md:gap-2 xl:grid-cols-10';

  const statCardShell =
    'flex h-[3.75rem] w-full min-w-0 flex-col !rounded-md border border-slate-200/90 bg-white !p-0 !shadow-sm transition-shadow hover:!scale-100 hover:!shadow-md sm:h-[5rem] sm:!rounded-lg dark:border-slate-700 dark:bg-slate-900';

  const statCardInner =
    'flex h-full min-w-0 flex-col justify-center px-1.5 py-1.5 sm:px-2 sm:py-2 md:px-2.5 md:py-2.5';

  const renderStatCounts = (active: number, cancelled: number) => (
    <div className="mt-1 grid grid-cols-2 divide-x divide-slate-200/90 sm:mt-1.5 dark:divide-slate-600">
      <div className="flex items-baseline justify-center gap-px pr-0.5">
        <span className="text-sm font-bold leading-none tabular-nums text-slate-900 sm:text-lg md:text-xl lg:text-2xl dark:text-slate-100">
          {active}
        </span>
        <span className="text-[9px] font-bold text-blue-600 sm:text-[10px] md:text-xs dark:text-blue-400">A</span>
      </div>
      <div className="flex items-baseline justify-center gap-px pl-0.5">
        <span className="text-sm font-bold leading-none tabular-nums text-slate-900 sm:text-lg md:text-xl lg:text-2xl dark:text-slate-100">
          {cancelled}
        </span>
        <span className="text-[9px] font-bold text-red-600 sm:text-[10px] md:text-xs dark:text-red-400">C</span>
      </div>
    </div>
  );

  const tableThClass =
    'px-2 py-2 text-left text-[9px] font-semibold uppercase tracking-wider text-slate-500 sm:px-4 sm:py-3 sm:text-[10px] md:px-6 md:py-4 md:text-xs dark:text-slate-400';
  const tableTdClass = 'px-2 py-2 text-sm sm:px-4 sm:py-3 md:px-6 md:py-4';
  const abstractThClass =
    'border-r border-slate-200 px-2 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 sm:px-3 sm:py-2.5 sm:text-[10px] dark:border-slate-700';
  const abstractTdClass = 'px-2 py-2 text-center text-xs sm:px-3 sm:py-3 sm:text-sm';
  const pivotThClass =
    'px-2 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-slate-500 sm:px-3 sm:py-3 sm:text-[10px]';
  const pivotTheadStickyTopClass = 'sticky top-0 z-20 bg-white dark:bg-slate-900';
  const pivotTheadStickyCornerClass =
    'sticky top-0 z-30 bg-white shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)] dark:bg-slate-900 dark:shadow-[2px_0_4px_-2px_rgba(0,0,0,0.35)]';
  const pivotTableScrollClass = 'max-h-[min(70vh,calc(100dvh-17rem))] overflow-auto';
  const pivotTdClass = 'px-2 py-2 text-center text-xs font-semibold sm:px-3 sm:py-3 sm:text-sm';
  const pivotMetaTdClass =
    'px-2 py-2 text-left text-xs text-slate-600 sm:px-3 sm:py-3 sm:text-sm dark:text-slate-300';
  const referencePivotHeaderSelectClass =
    'mt-1 h-7 w-full min-w-[5.5rem] max-w-[9rem] rounded-md border border-slate-300 bg-white px-1.5 text-[10px] font-normal normal-case tracking-normal text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200';
  const referencePivotFixedColCount = 5;

  if (!hasJoiningAccess) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        You do not have access to the Joining Desk.
      </div>
    );
  }

  if (visibleAdmissionTabs.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        No Admissions page tabs are assigned to your account. Ask a Super Admin to enable tabs under User
        Management → Joining Desk.
      </div>
    );
  }

  return (
    <div className="w-full space-y-4 pb-8 sm:space-y-6 sm:pb-12">
      <Dialog
        open={!!referenceEditTarget}
        onOpenChange={(open) => {
          if (!open) {
            setReferenceEditTarget(null);
            setReferenceEditValue('');
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Reference 1</DialogTitle>
            <DialogDescription>
              Stored on the admission, joining form, and CRM lead (when linked). Used by the Reference list
              report.
            </DialogDescription>
          </DialogHeader>
          {referenceEditTarget && (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {referenceEditTarget.studentInfo?.name || 'Student'}
                </p>
                <p className="text-xs text-slate-500">{referenceEditTarget.admissionNumber}</p>
              </div>
              <ReferenceUserSelect
                id="admission-reference1"
                label="Reference"
                value={referenceEditValue}
                onChange={setReferenceEditValue}
                disabled={saveReferenceMutation.isPending}
                showAddUserButton={!saveReferenceMutation.isPending}
              />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setReferenceEditTarget(null);
                setReferenceEditValue('');
              }}
              disabled={saveReferenceMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              isLoading={saveReferenceMutation.isPending}
              onClick={() => saveReferenceMutation.mutate()}
            >
              Save Reference
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!referenceDrilldownTarget}
        onOpenChange={(open) => {
          if (!open) setReferenceDrilldownTarget(null);
        }}
      >
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-4xl overflow-hidden p-0">
          <DialogHeader className="border-b border-slate-200 px-4 py-4 sm:px-6 dark:border-slate-800">
            <DialogTitle>Admissions for reference</DialogTitle>
            <DialogDescription>
              {referenceDrilldownTarget?.name ?? 'Reference'}
              {referenceDrilldownLoading ? (
                <> · loading admissions…</>
              ) : referenceDrilldownError ? (
                <> · could not load admissions</>
              ) : (
                <>
                  {' '}
                  · {referenceDrilldownData?.total ?? 0} admission
                  {(referenceDrilldownData?.total ?? 0) === 1 ? '' : 's'} matching the filters above
                  {referenceDrilldownData?.truncated ? ' (showing first 500)' : ''}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(60vh,520px)] overflow-auto px-4 py-3 sm:px-6">
            {referenceDrilldownLoading ? (
              <div className="py-16 text-center text-slate-500">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-400">Loading admissions…</p>
              </div>
            ) : referenceDrilldownError ? (
              <p className="py-12 text-center text-sm text-red-600 dark:text-red-400">
                Could not load admissions for this reference. Please try again.
              </p>
            ) : referenceDrilldownAdmissions.length === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500">No admissions found for this reference.</p>
            ) : (
              <table className="min-w-[720px] w-full divide-y divide-slate-200 dark:divide-slate-800">
                <thead className="sticky top-0 z-10 bg-white dark:bg-slate-950">
                  <tr>
                    <th className={tableThClass}>Admission #</th>
                    <th className={tableThClass}>Student</th>
                    <th className={tableThClass}>College</th>
                    <th className={tableThClass}>Course</th>
                    <th className={tableThClass}>Branch</th>
                    <th className={`${tableThClass} text-right`}>Open</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {referenceDrilldownAdmissions.map((admission) => (
                    <tr
                      key={admission.id || admission.admissionNumber}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/30"
                    >
                      <td className={`${tableTdClass} font-mono text-xs font-semibold text-blue-600 dark:text-blue-400`}>
                        {admission.admissionNumber}
                      </td>
                      <td className={`${tableTdClass} font-medium text-slate-900 dark:text-slate-100`}>
                        {admission.studentName}
                      </td>
                      <td className={`${tableTdClass} text-slate-700 dark:text-slate-300`}>
                        {resolveReferenceAdmissionCollege(admission)}
                      </td>
                      <td className={tableTdClass}>
                        {resolveJoiningOrAdmissionCourseLabel(
                          { courseInfo: { courseId: admission.courseId, course: admission.course } },
                          getCourseName
                        ) || admission.course}
                      </td>
                      <td className={tableTdClass}>{admission.branch || '—'}</td>
                      <td className={`${tableTdClass} text-right`}>
                        {admission.id ? (
                          <Link
                            href={`/superadmin/admission/${admission.id}/detail?${admissionsEditQuery}`}
                            className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                            onClick={() => setReferenceDrilldownTarget(null)}
                          >
                            View
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter className="border-t border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800">
            <Button type="button" variant="outline" onClick={() => setReferenceDrilldownTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <DialogContent className="w-[95vw] max-w-lg">
          <DialogHeader>
            <DialogTitle>Cancel Admission</DialogTitle>
            <DialogDescription>
              Capture the approval details before changing this student status to Admission Cancelled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {cancelTarget?.studentInfo?.name || 'Selected student'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {cancelTarget?.admissionNumber || ''}
              </p>
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor="list-cancel-reason"
                className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
              >
                Reason for cancellation
              </label>
              <textarea
                id="list-cancel-reason"
                rows={4}
                value={cancelForm.reason}
                onChange={(event) =>
                  setCancelForm((prev) => ({ ...prev, reason: event.target.value }))
                }
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 hover:bg-white focus:border-orange-500/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:focus:border-orange-500/50 dark:focus:bg-slate-950 dark:focus:ring-orange-900/20"
                placeholder="Enter cancellation reason"
                required
              />
            </div>
            <Input
              id="list-cancel-approved-by"
              label="Approved by"
              value={cancelForm.approvedBy}
              onChange={(event) =>
                setCancelForm((prev) => ({ ...prev, approvedBy: event.target.value }))
              }
              placeholder="Enter approver name"
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelTarget(null)}
              disabled={cancelAdmissionMutation.isPending}
            >
              Close
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={cancelAdmissionMutation.isPending}
              onClick={submitCancellation}
            >
              Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!studentInfoViewRecord}
        onOpenChange={(open) => {
          if (!open) setStudentInfoViewRecord(null);
        }}
      >
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Student information</DialogTitle>
            <DialogDescription>
              Quick view for this admission. Use Edit joining form to change joining data, or open the full admission
              page for payments, documents, and Step 2.
            </DialogDescription>
          </DialogHeader>
          {studentInfoViewRecord && (
            <div className="grid gap-4 text-sm">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Admission</p>
                <p className="mt-1 font-mono text-base font-semibold text-blue-600 dark:text-blue-400">
                  {studentInfoViewRecord.admissionNumber}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Recorded:{' '}
                  {studentInfoViewRecord.createdAt
                    ? new Date(studentInfoViewRecord.createdAt).toLocaleString()
                    : '—'}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student</p>
                  <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {studentInfoViewRecord.studentInfo?.name ?? '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Contact</p>
                  <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {studentInfoViewRecord.studentInfo?.phone ?? '—'}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Course / branch</p>
                  <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {resolveJoiningOrAdmissionCourseLabel(studentInfoViewRecord, getCourseName) || '—'}{' '}
                    <span className="text-slate-500">·</span>{' '}
                    {studentInfoViewRecord.courseInfo?.branch ||
                      getBranchName(studentInfoViewRecord.courseInfo?.branchId) ||
                      '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Quota</p>
                  <p className="mt-0.5 font-medium uppercase text-slate-900 dark:text-slate-100">
                    {studentInfoViewRecord.courseInfo?.quota || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Caste</p>
                  <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {(studentInfoViewRecord.reservation?.general || 'OC').toUpperCase()}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">EWS</p>
                  <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {formatReservationEws(studentInfoViewRecord.reservation)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Merit</p>
                  <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                    {formatQualificationMerit(studentInfoViewRecord.qualifications)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Paid</p>
                  <p className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {INR_CURRENCY_FORMAT.format(studentInfoViewRecord.paymentSummary?.yearOnePaid ?? 0)}
                  </p>
                </div>
                {isSuperAdmin ? (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Reference</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {resolveAdmissionReference1(studentInfoViewRecord) || '—'}
                      </p>
                      {canEditReference &&
                      studentInfoViewRecord.status !== ADMISSION_CANCELLED_STATUS ? (
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                          title="Edit reference"
                          onClick={() => openReferenceEditor(studentInfoViewRecord)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {isSuperAdmin ? (
                  <div className="sm:col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Source</p>
                    <p className="mt-0.5 font-medium text-slate-900 dark:text-slate-100">
                      {resolveAdmissionSource(studentInfoViewRecord) || '—'}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            {studentInfoViewRecord?._id && (
              <Button
                type="button"
                className="w-full gap-2 sm:w-auto"
                onClick={() => {
                  // Important Documents only (certificate checklist / paper important cols)
                  const importantItems = buildImportantDocumentTabItems(
                    studentInfoViewRecord.documents,
                    studentInfoViewRecord.courseInfo?.quota,
                    studentInfoViewRecord.registrationFormData
                  );
                  const pendingDocs = importantItems
                    .filter((item) => String(item.status || '').toLowerCase() !== 'received')
                    .map((item) => item.label);
                  setSelectedDocuments(pendingDocs);
                  setShowDocumentSmsDialog(true);
                }}
              >
                Send Pending Documents SMS
              </Button>
            )}
            {canEditReference &&
            studentInfoViewRecord &&
            studentInfoViewRecord.status !== ADMISSION_CANCELLED_STATUS ? (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 sm:w-auto"
                onClick={() => openReferenceEditor(studentInfoViewRecord)}
              >
                <Pencil className="h-4 w-4" />
                Edit reference
              </Button>
            ) : null}
            {canEditAdmission && studentInfoViewRecord?.joiningId ? (
              <Link
                href={`/superadmin/joining/${studentInfoViewRecord.joiningId}?${admissionsEditQuery}`}
                className="w-full sm:w-auto"
              >
                <Button type="button" className="w-full gap-2 sm:w-auto">
                  <Pencil className="h-4 w-4" />
                  Edit joining form
                </Button>
              </Link>
            ) : null}
            {studentInfoViewRecord?._id ? (
              <Link
                href={`/superadmin/admission/${studentInfoViewRecord._id}/detail?${admissionsEditQuery}`}
                className="w-full sm:w-auto"
              >
                <Button type="button" variant="outline" className="w-full sm:w-auto">
                  Full admission page
                </Button>
              </Link>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!intakeEditTarget} onOpenChange={(open) => !open && setIntakeEditTarget(null)}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Edit branch intake</DialogTitle>
            <DialogDescription>
              Set convenor (CQ) and management (MQ) seat intake for this course and branch on the abstract
              report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                {intakeEditTarget
                  ? resolveStatCourseLabel({
                      courseId: intakeEditTarget.courseId,
                      courseName: intakeEditTarget.courseName,
                      lateralTrack: intakeEditTarget.lateralTrack,
                    })
                  : '—'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {intakeEditTarget?.branchName || '—'}
              </p>
            </div>
            <Input
              id="abstract-cq-intake"
              label="CQ - Intake"
              type="number"
              min={0}
              step={1}
              value={intakeForm.cqIntake}
              onChange={(e) => setIntakeForm((prev) => ({ ...prev, cqIntake: e.target.value }))}
              placeholder="Convenor seats"
            />
            <Input
              id="abstract-mq-intake"
              label="MQ - Intake"
              type="number"
              min={0}
              step={1}
              value={intakeForm.mqIntake}
              onChange={(e) => setIntakeForm((prev) => ({ ...prev, mqIntake: e.target.value }))}
              placeholder="Management seats"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIntakeEditTarget(null)}
              disabled={saveBranchIntakeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={submitIntakeEdit}
              isLoading={saveBranchIntakeMutation.isPending}
              disabled={!intakeEditTarget?.courseId || !intakeEditTarget?.branchId}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PendingAdmissionsDownloadModal
        open={pendingAdmissionsOpen}
        onOpenChange={setPendingAdmissionsOpen}
        colleges={visibleColleges.map((c) => ({ id: c.id, name: c.name }))}
        initialCollegeId={effectiveCollegeFilter}
        minimumFeeConfigs={minimumFeeConfigs}
        deskFilters={{
          collegeId: effectiveCollegeFilter || undefined,
          courseId: courseFilter || undefined,
          courseName: getCourseName(courseFilter) || undefined,
          branchId: branchFilter || undefined,
          branchName: getBranchName(branchFilter) || undefined,
          startDate: dateRange.from || undefined,
          endDate: statsThroughDate,
        }}
      />

      <MinimumFeeConfigDialog
        open={minimumConfigOpen}
        onOpenChange={setMinimumConfigOpen}
        colleges={visibleColleges.map((c) => ({ id: c.id, name: c.name }))}
        initialCollegeId={effectiveCollegeFilter}
        configs={minimumFeeConfigs}
        onConfigsChanged={() => refetchMinimumFeeConfigs()}
      />

      {/* Send Pending Documents SMS Dialog — Important Documents only */}
      <Dialog
        open={showDocumentSmsDialog}
        onOpenChange={(open) => {
          if (!open) setShowDocumentSmsDialog(false);
        }}
      >
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send Pending Documents SMS</DialogTitle>
            <DialogDescription>
              Select which pending Important Documents to include in the SMS. Other documents are
              not sent.
            </DialogDescription>
          </DialogHeader>

          {studentInfoViewRecord && (
            <div className="space-y-3">
              {/* Display student info */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {studentInfoViewRecord.studentInfo?.name || 'Student'}
                </p>
                <p className="text-xs text-slate-500">
                  {studentInfoViewRecord.studentInfo?.phone || 'No phone number'}
                </p>
              </div>

              {/* Important Documents checkboxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(() => {
                  const importantItems = buildImportantDocumentTabItems(
                    studentInfoViewRecord.documents,
                    studentInfoViewRecord.courseInfo?.quota,
                    studentInfoViewRecord.registrationFormData
                  ).filter((item) => String(item.status || '').toLowerCase() !== 'received');

                  if (importantItems.length === 0) {
                    return (
                      <p className="col-span-full text-sm text-slate-500">
                        No pending Important Documents for this student.
                      </p>
                    );
                  }

                  return importantItems.map((item) => (
                    <label
                      key={item.key}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700"
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={selectedDocuments.includes(item.label)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDocuments([...selectedDocuments, item.label]);
                          } else {
                            setSelectedDocuments(selectedDocuments.filter((d) => d !== item.label));
                          }
                        }}
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-200">
                        {item.label}
                      </span>
                    </label>
                  ));
                })()}
              </div>
            </div>
          )}

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDocumentSmsDialog(false)}
              disabled={sendDocumentSmsMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              isLoading={sendDocumentSmsMutation.isPending}
              disabled={!studentInfoViewRecord?._id || selectedDocuments.length === 0}
              onClick={() => {
                if (studentInfoViewRecord?._id) {
                  sendDocumentSmsMutation.mutate({
                    admissionId: studentInfoViewRecord._id,
                    selectedDocuments,
                  });
                }
              }}
            >
              Send SMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {activeTab === 'abstract' && canAccessTab('abstract') ? (
        <div className="space-y-3">
          {statsLoading || collegesLoading ? (
            <div className={statCardsGridClass}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={`stats-skeleton-${i}`}
                  className="h-[3.75rem] w-full min-w-0 animate-pulse rounded-md bg-slate-100 sm:h-[5rem] sm:rounded-lg dark:bg-slate-800"
                />
              ))}
            </div>
          ) : courseStatsForCards.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No course admissions in this date range.</p>
          ) : (
            <div className={statCardsGridClass}>
              <Card
                noPadding
                className={`${statCardShell} border-l-4 border-l-blue-500 bg-gradient-to-br from-blue-50/95 to-white dark:from-blue-950/40 dark:to-slate-900`}
              >
                <div className={statCardInner} title="All colleges combined">
                  <p className="truncate text-[10px] font-bold uppercase tracking-wide text-blue-800 sm:text-xs md:text-sm dark:text-blue-200">
                    Total
                  </p>
                  {renderStatCounts(totalAdmissionsCount, totalCancelledCount)}
                </div>
              </Card>
              {courseStatsForCards.map((s) => {
                const key = `${s.courseId || s.courseName || 'unknown'}-${String(s.lateralTrack ?? 0)}`;
                const active = Number(s.totalAdmissions) || 0;
                const cancelled = Number(s.totalCancelled) || 0;
                const label = resolveStatCourseLabel(s);
                const collegeName = resolveStatCollegeName(s);
                return (
                  <Card key={key} noPadding className={`${statCardShell} group`}>
                    <div className={statCardInner} title={`${label} · ${collegeName}`}>
                      <div className="relative min-h-[1.75rem] shrink-0 sm:min-h-[2.4rem]">
                        <p className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-700 transition-opacity duration-150 sm:text-xs md:text-sm group-hover:opacity-0 dark:text-slate-200">
                          {label}
                        </p>
                        <div className="pointer-events-none absolute inset-0 flex flex-col justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                          <StatCardTwoLineLabel
                            label={collegeName}
                            className="text-slate-500 dark:text-slate-400"
                          />
                        </div>
                      </div>
                      {renderStatCounts(active, cancelled)}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* Combined Filters & Tabs Bar */}
      <Card className="bg-slate-50/50 p-3 sm:p-4 dark:bg-slate-900/50">
        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-3">
            <div className="-mx-1 flex items-center gap-1 overflow-x-auto rounded-2xl bg-slate-200/50 p-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden dark:bg-slate-800/50">
              {visibleAdmissionTabs.map(({ key, label }) => {
                const TabIcon = ADMISSION_TAB_ICONS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-200 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm ${
                      activeTab === key
                        ? 'bg-white text-blue-600 shadow-sm dark:bg-slate-700 dark:text-blue-300'
                        : 'text-slate-500 hover:bg-white/50 dark:text-slate-400 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <TabIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="whitespace-nowrap">{label}</span>
                  </button>
                );
              })}
            </div>

            <div className="min-w-0 flex-1 lg:max-w-sm xl:max-w-md">
              <Input
                placeholder="Search student, admission #, phone..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                className="h-[38px]"
                aria-label="Search student, admission number, or phone"
              />
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
              {activeTab === 'abstract' && !statsLoading && stats.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 sm:w-auto"
                  onClick={handlePrintAbstract}
                >
                  <Printer className="h-4 w-4" />
                  <span className="sm:hidden">Print</span>
                  <span className="hidden sm:inline">Print PDF</span>
                </Button>
              )}
              {activeTab === 'student-info' ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 sm:w-auto"
                    onClick={() => setPendingAdmissionsOpen(true)}
                  >
                    <Download className="h-4 w-4" />
                    <span className="sm:hidden">Pending</span>
                    <span className="hidden sm:inline">Pending Fee & Docs</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 sm:w-auto"
                    onClick={() => setMinimumConfigOpen(true)}
                  >
                    <Settings2 className="h-4 w-4" />
                    <span className="sm:hidden">Config</span>
                    <span className="hidden sm:inline">
                      {minimumFeeConfigs.length > 0
                        ? `Config (${minimumFeeConfigs.length})`
                        : 'Config'}
                    </span>
                  </Button>
                </>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-2 sm:w-auto"
                onClick={handleExportExcel}
                isLoading={isExporting}
              >
                <Download className="h-4 w-4" />
                <span className="sm:hidden">Export</span>
                <span className="hidden sm:inline">Export XLSX</span>
              </Button>
            </div>
          </div>

          <>
              <div className="flex flex-wrap items-center gap-2 md:hidden">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowFilters((prev) => !prev)}
                >
                  <Filter className="h-4 w-4" />
                  {showFilters ? 'Hide' : 'Show'} Filters
                  {activeFilterCount > 0 ? (
                    <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {activeFilterCount}
                    </span>
                  ) : null}
                </Button>
                {activeFilterCount > 0 || searchTerm.trim() ? (
                  <Button type="button" variant="outline" size="sm" className="gap-1" onClick={clearFilters}>
                    <X className="h-3.5 w-3.5" />
                    Clear
                  </Button>
                ) : null}
              </div>

              <div
                className={`grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-9 ${
                  showFilters ? 'grid' : 'hidden md:grid'
                }`}
              >
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    College
                  </label>
                  <select
                    value={collegeFilter}
                    onChange={(e) => {
                      const next = e.target.value;
                      setCollegeFilter(next);
                      setCourseFilter('');
                      setBranchFilter('');
                      setPage(1);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                  >
                    <option value="">All Colleges</option>
                    {visibleColleges.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Course</label>
                  <select
                    value={courseFilter}
                    onChange={(e) => {
                      setCourseFilter(e.target.value);
                      setBranchFilter('');
                      setPage(1);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                  >
                    <option value="">
                      {collegeFilter ? 'All Courses in College' : 'All Courses'}
                    </option>
                    {coursesForCollegeFilter.map((c: { _id: string; name: string }) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Branch</label>
                  <select
                    value={branchFilter}
                    onChange={(e) => {
                      setBranchFilter(e.target.value);
                      setPage(1);
                    }}
                    disabled={!courseFilter}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <option value="">{courseFilter ? 'All Branches' : 'Select Course First'}</option>
                    {branches.map((b: any) => (
                      <option key={b._id} value={b._id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Quota
                  </label>
                  <select
                    value={quotaFilter}
                    onChange={(e) => {
                      setQuotaFilter(e.target.value);
                      setPage(1);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                  >
                    <option value="">All Quotas</option>
                    {quotaOptions.map((quota) => (
                      <option key={quota} value={quota}>
                        {quota}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value as AdmissionStatusFilter);
                      setPage(1);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                  >
                    {statusOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Fee Entry
                  </label>
                  <select
                    value={feeEntryFilter}
                    onChange={(e) => {
                      setFeeEntryFilter(e.target.value as FeeEntryFilter);
                      setPage(1);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                  >
                    {feeEntryOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Source</label>
                  <select
                    value={sourceFilter}
                    onChange={(e) => {
                      setSourceFilter(e.target.value);
                      setPage(1);
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                  >
                    <option value="">All Sources</option>
                    {sourceOptions.map((src) => (
                      <option key={src} value={src}>{src}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Admission From</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="date"
                      value={dateRange.from}
                      onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Admission To</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="date"
                      value={dateRange.to}
                      onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900"
                    />
                  </div>
                </div>
              </div>
            </>
        </div>
      </Card>

      {activeTab === 'abstract' ? (
        <div className="space-y-3">
          <Card className="overflow-hidden border-none p-0 shadow-lg dark:shadow-none">
            <div className="-mx-1 overflow-x-auto sm:mx-0">
              <table className="min-w-[720px] w-full divide-y divide-slate-200 dark:divide-slate-800">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80">
                    <th rowSpan={2} className={abstractThClass}>
                      Course
                    </th>
                    <th rowSpan={2} className={abstractThClass}>
                      Branch
                    </th>
                    <th
                      colSpan={2}
                      className={`${abstractGroupHeaderClass} ${abstractBlockOutline} bg-slate-200/60 text-slate-800 dark:bg-slate-700/50 dark:text-slate-100`}
                    >
                      Total Admissions
                    </th>
                    <th
                      colSpan={3}
                      className={`${abstractGroupHeaderClass} ${abstractBlockOutline} bg-blue-50/80 text-blue-800 dark:bg-blue-950/30 dark:text-blue-200`}
                    >
                      Convenor
                    </th>
                    <th
                      colSpan={3}
                      className={`${abstractGroupHeaderClass} ${abstractBlockOutline} bg-amber-50/80 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200`}
                    >
                      Management
                    </th>
                    <th
                      colSpan={2}
                      className={`${abstractGroupHeaderClass} ${abstractBlockOutline} bg-violet-50/80 text-violet-900 dark:bg-violet-950/30 dark:text-violet-200`}
                    >
                      Spot
                    </th>
                    <th
                      colSpan={2}
                      className={`${abstractGroupHeaderClass} ${abstractBlockOutline} bg-emerald-50/80 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200`}
                    >
                      Merit
                    </th>
                    <th rowSpan={2} className={abstractThClass}>Edit</th>
                  </tr>
                  <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
                    <th className={`${abstractSubHeaderClass} ${abstractBlockCellStart} text-blue-600 dark:text-blue-400`}>Active</th>
                    <th className={`${abstractSubHeaderClass} ${abstractBlockCellEnd} text-red-600 dark:text-red-400`}>Cancelled</th>
                    <th className={`${abstractSubHeaderClass} ${abstractBlockCellStart} text-slate-500`}>Intake</th>
                    <th className={`${abstractSubHeaderClass} text-blue-600 dark:text-blue-400`}>Admitted</th>
                    <th className={`${abstractSubHeaderClass} ${abstractBlockCellEnd} text-red-600 dark:text-red-400`}>Cancelled</th>
                    <th className={`${abstractSubHeaderClass} ${abstractBlockCellStart} text-slate-500`}>Intake</th>
                    <th className={`${abstractSubHeaderClass} text-amber-600 dark:text-amber-400`}>Admitted</th>
                    <th className={`${abstractSubHeaderClass} ${abstractBlockCellEnd} text-red-600 dark:text-red-400`}>Cancelled</th>
                    <th className={`${abstractSubHeaderClass} ${abstractBlockCellStart} text-violet-600 dark:text-violet-400`}>Admitted</th>
                    <th className={`${abstractSubHeaderClass} ${abstractBlockCellEnd} text-red-600 dark:text-red-400`}>Cancelled</th>
                    <th className={`${abstractSubHeaderClass} ${abstractBlockCellStart} text-emerald-600 dark:text-emerald-400`}>Yes</th>
                    <th className={`${abstractSubHeaderClass} ${abstractBlockCellEnd} text-slate-600 dark:text-slate-400`}>No</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                  {statsLoading ? (
                    <tr>
                      <td colSpan={ABSTRACT_COLUMN_COUNT} className="py-20 text-center">
                        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                      </td>
                    </tr>
                  ) : stats.length === 0 ? (
                    <tr>
                      <td colSpan={ABSTRACT_COLUMN_COUNT} className="py-20 text-center text-slate-500">No data available for the selected filters.</td>
                    </tr>
                  ) : (
                    stats.flatMap((c: any) => {
                      const branchRows =
                        Array.isArray(c.branches) && c.branches.length > 0
                          ? c.branches
                          : [
                              {
                                branchId: '',
                                branchName: '—',
                                cqIntake: null,
                                mqIntake: null,
                                cqAdmitted: 0,
                                cqCancelled: 0,
                                mqAdmitted: 0,
                                mqCancelled: 0,
                                spotAdmitted: 0,
                                spotCancelled: 0,
                                meritYes: 0,
                                meritNo: 0,
                                totalAdmissions: Number(c.totalAdmissions) || 0,
                                totalCancelled: Number(c.totalCancelled) || 0,
                              },
                            ];
                      return branchRows.map((b: any) => ({
                        courseId: c.courseId,
                        courseName: c.courseName,
                        lateralTrack: c.lateralTrack ?? b.lateralTrack,
                        branchId: b.branchId,
                        branchName: b.branchName,
                        cqIntake: b.cqIntake,
                        cqAdmitted: b.cqAdmitted,
                        cqCancelled: b.cqCancelled,
                        mqAdmitted: b.mqAdmitted,
                        mqIntake: b.mqIntake,
                        mqCancelled: b.mqCancelled,
                        spotAdmitted: b.spotAdmitted,
                        spotCancelled: b.spotCancelled,
                        meritYes: b.meritYes,
                        meritNo: b.meritNo,
                        totalAdmissions: b.totalAdmissions,
                        totalCancelled: b.totalCancelled,
                      }));
                    })
                    .map((row: any, idx: number) => (
                      <tr
                        key={`${row.courseId || row.courseName}-${row.branchId || row.branchName}-${String(row.lateralTrack ?? 0)}-${idx}`}
                        className="group transition hover:bg-slate-50 dark:hover:bg-slate-800/30"
                      >
                        <td className={`${abstractTdClass} text-left`}>
                          <span className="text-xs font-bold text-slate-900 sm:text-sm dark:text-slate-100">
                            {resolveStatCourseLabel({
                              courseId: row.courseId,
                              courseName: row.courseName,
                              lateralTrack: row.lateralTrack,
                            })}
                          </span>
                        </td>
                        <td className={`${abstractTdClass} text-left`}>
                          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 sm:px-2 sm:text-xs dark:bg-slate-800 dark:text-slate-400">
                            {getBranchName(row.branchId) || row.branchName || '—'}
                          </span>
                        </td>
                        <td className={`${abstractTdClass} font-bold text-blue-600 dark:text-blue-400 ${abstractBlockCellStart}`}>
                          {row.totalAdmissions ?? 0}
                        </td>
                        <td className={`${abstractTdClass} font-bold text-red-600 dark:text-red-400 ${abstractBlockCellEnd}`}>
                          {row.totalCancelled ?? 0}
                        </td>
                        <td className={`${abstractTdClass} font-semibold text-slate-700 dark:text-slate-300 ${abstractBlockCellStart}`}>
                          {formatAbstractIntake(row.cqIntake)}
                        </td>
                        <td className={`${abstractTdClass} font-bold text-blue-600 dark:text-blue-400`}>
                          {row.cqAdmitted ?? 0}
                        </td>
                        <td className={`${abstractTdClass} font-bold text-red-600 dark:text-red-400 ${abstractBlockCellEnd}`}>
                          {row.cqCancelled ?? 0}
                        </td>
                        <td className={`${abstractTdClass} font-semibold text-slate-700 dark:text-slate-300 ${abstractBlockCellStart}`}>
                          {formatAbstractIntake(row.mqIntake)}
                        </td>
                        <td className={`${abstractTdClass} font-bold text-amber-600 dark:text-amber-400`}>
                          {row.mqAdmitted ?? 0}
                        </td>
                        <td className={`${abstractTdClass} font-bold text-red-600 dark:text-red-400 ${abstractBlockCellEnd}`}>
                          {row.mqCancelled ?? 0}
                        </td>
                        <td className={`${abstractTdClass} font-bold text-violet-600 dark:text-violet-400 ${abstractBlockCellStart}`}>
                          {row.spotAdmitted ?? 0}
                        </td>
                        <td className={`${abstractTdClass} font-bold text-red-600 dark:text-red-400 ${abstractBlockCellEnd}`}>
                          {row.spotCancelled ?? 0}
                        </td>
                        <td className={`${abstractTdClass} font-bold text-emerald-600 dark:text-emerald-400 ${abstractBlockCellStart}`}>
                          {row.meritYes ?? 0}
                        </td>
                        <td className={`${abstractTdClass} font-bold text-slate-700 dark:text-slate-300 ${abstractBlockCellEnd}`}>
                          {row.meritNo ?? 0}
                        </td>
                        <td className={abstractTdClass}>
                          <button
                            type="button"
                            onClick={() => openIntakeEditor(row)}
                            disabled={!canEditAdmission || !row.courseId || !row.branchId}
                            title={
                              row.courseId && row.branchId
                                ? 'Edit CQ and MQ intake'
                                : 'Course and branch id required to set intake'
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === 'student-info' ? (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="min-w-[1200px] w-full divide-y divide-slate-200/80 dark:divide-slate-800/80">
              <thead className="bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/70">
                <tr>
                  <th className={tableThClass}>Admission #</th>
                  <th className={`${tableThClass} hidden md:table-cell`}>Timestamp</th>
                  <th className={tableThClass}>Course / Branch</th>
                  <th className={tableThClass}>Student Name</th>
                  <th className={`${tableThClass} hidden sm:table-cell`}>Contact No</th>
                  <th className={`${tableThClass} text-center`}>Quota</th>
                  <th className={`${tableThClass} text-center hidden lg:table-cell`}>Caste</th>
                  <th className={`${tableThClass} text-center hidden lg:table-cell`}>EWS</th>
                  <th className={`${tableThClass} text-center hidden lg:table-cell`}>Merit</th>
                  <th className={`${tableThClass} text-center hidden xl:table-cell`}>Certificates</th>
                  <th className={`${tableThClass} text-right`}>Paid</th>
                  {showSourceReferenceColumns ? (
                    <>
                      <th className={`${tableThClass} text-right hidden md:table-cell`}>Source</th>
                      <th className={`${tableThClass} text-right hidden lg:table-cell`}>Reference</th>
                    </>
                  ) : null}
                  <th className={`${tableThClass} text-right`}>Action</th>
                </tr>
              </thead>
              <tbody
                className={`divide-y divide-slate-100 bg-white/80 backdrop-blur-sm dark:divide-slate-800 dark:bg-slate-900/60 ${
                  isFetching && admissions.length > 0 ? 'opacity-70' : ''
                }`}
              >
                {showListSpinner ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-3 py-10 text-center text-sm text-slate-500 sm:px-6 sm:py-16">
                      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-400 border-t-transparent sm:h-12 sm:w-12" />
                      <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-400 sm:mt-4">Loading admissions…</p>
                    </td>
                  </tr>
                ) : isEmpty ? (
                  <tr>
                    <td colSpan={tableColumnCount} className="px-3 py-10 text-center text-sm text-slate-500 sm:px-6 sm:py-16">
                      <p className="font-medium text-slate-600 dark:text-slate-400">No admissions found.</p>
                    </td>
                  </tr>
                ) : (
                  admissions.map((record: Admission) => (
                    <StudentInfoRow
                      key={record._id}
                      record={record}
                      showSourceReferenceColumns={showSourceReferenceColumns}
                      canEditReference={canEditReference}
                      tableTdClass={tableTdClass}
                      onOpenDetails={handleOpenStudentInfoDetails}
                      onEditReference={openReferenceEditor}
                      onEditApplication={handleEditApplicationFromList}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {pagination.pages > 1 && (
            <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4 dark:border-slate-700 dark:text-slate-300">
              <div className="text-center sm:text-left">
                Page {pagination.page} of {pagination.pages}
                {pagination.total > 0 ? (
                  <span className="text-slate-400 dark:text-slate-500">
                    {' '}
                    · {pagination.total} total
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-center gap-1.5">
                {paginationBlock.hasPrevBlock ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 min-w-[36px] px-2.5"
                    onClick={() => setPage(paginationBlock.prevBlockPage)}
                    disabled={isFetching}
                    title="Previous pages"
                  >
                    <span aria-hidden="true">&lt;&lt;</span>
                  </Button>
                ) : null}
                {paginationBlock.pageNumbers.map((pageNum) => {
                  const isActive = pagination.page === pageNum;
                  return (
                    <Button
                      key={pageNum}
                      type="button"
                      variant={isActive ? 'primary' : 'outline'}
                      size="sm"
                      className={cn(
                        'h-9 min-w-[36px] px-2',
                        isActive && '!bg-blue-600 !border-blue-600 hover:!bg-blue-700'
                      )}
                      onClick={() => setPage(pageNum)}
                      disabled={isFetching}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                {paginationBlock.hasNextBlock ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 min-w-[36px] px-2.5"
                    onClick={() => setPage(paginationBlock.nextBlockPage)}
                    disabled={isFetching}
                    title="Next pages"
                  >
                    <span aria-hidden="true">&gt;&gt;</span>
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'reference-list' ? (
        <Card className="border-none p-0 shadow-lg dark:shadow-none">
          <div className={cn('-mx-1 sm:mx-0', pivotTableScrollClass)}>
            <table className="min-w-[480px] w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead>
                <tr className="bg-white shadow-[0_1px_0_0_rgba(15,23,42,0.08)] dark:bg-slate-900 dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
                  <th
                    className={cn(
                      'sticky left-0',
                      pivotTheadStickyCornerClass,
                      pivotThClass
                    )}
                  >
                    S. No.
                  </th>
                  <th
                    className={cn(
                      'sticky left-10 sm:left-14',
                      pivotTheadStickyCornerClass,
                      pivotThClass
                    )}
                  >
                    <div className="flex flex-col gap-0.5 min-w-[10rem]">
                      <span>Reference</span>
                      <input
                        type="text"
                        placeholder="Search name..."
                        value={referenceSearchQuery}
                        onChange={(e) => setReferenceSearchQuery(e.target.value)}
                        className={cn(referencePivotHeaderSelectClass, 'max-w-[12rem] border-blue-400 dark:border-blue-500')}
                      />
                    </div>
                  </th>
                  <th className={cn(pivotTheadStickyTopClass, pivotThClass)}>
                    <div className="flex min-w-[5.5rem] flex-col gap-0.5">
                      <span>Dept</span>
                      <select
                        value={referenceDepartmentFilter}
                        onChange={(e) => {
                          setReferenceDepartmentFilter(e.target.value);
                          setReferenceDesignationFilter('');
                        }}
                        aria-label="Filter by department"
                        className={referencePivotHeaderSelectClass}
                      >
                        <option value="">All</option>
                        {referenceDepartmentOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {referenceMetaFilterLabel(opt)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </th>
                  <th className={cn(pivotTheadStickyTopClass, pivotThClass)}>
                    <div className="flex min-w-[5.5rem] flex-col gap-0.5">
                      <span>Designation</span>
                      <select
                        value={referenceDesignationFilter}
                        onChange={(e) => setReferenceDesignationFilter(e.target.value)}
                        aria-label="Filter by designation"
                        className={referencePivotHeaderSelectClass}
                      >
                        <option value="">All</option>
                        {referenceDesignationOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {referenceMetaFilterLabel(opt)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </th>
                  {referenceCourses.map((c) => (
                    <th
                      key={admissionPivotColumnReactKey(c)}
                      title={resolvePivotCourseLabel(c)}
                      className={cn(
                        'max-w-[100px] text-center sm:max-w-[160px]',
                        pivotTheadStickyTopClass,
                        pivotThClass
                      )}
                    >
                      <span className="line-clamp-2">{resolvePivotCourseLabel(c)}</span>
                    </th>
                  ))}
                  <th
                    className={cn(
                      pivotTheadStickyTopClass,
                      pivotThClass,
                      'text-center text-slate-600 dark:text-slate-300'
                    )}
                  >
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {referenceStatsLoading ? (
                  <tr>
                    <td
                      colSpan={Math.max(referencePivotFixedColCount + referenceCourses.length, referencePivotFixedColCount)}
                      className="py-16 text-center text-slate-500"
                    >
                      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                      <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-400">Loading reference stats…</p>
                    </td>
                  </tr>
                ) : referenceRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(referencePivotFixedColCount + referenceCourses.length, referencePivotFixedColCount)}
                      className="py-16 text-center text-slate-500"
                    >
                      No data for the selected filters.
                    </td>
                  </tr>
                ) : filteredReferenceRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(referencePivotFixedColCount + referenceCourses.length, referencePivotFixedColCount)}
                      className="py-16 text-center text-slate-500"
                    >
                      No references match the Dept / Designation filters.
                    </td>
                  </tr>
                ) : (
                  filteredReferenceRows.map((row, idx: number) => {
                    const rowTotal =
                      Number(row.total) ||
                      referenceCourses.reduce(
                        (acc, c) => acc + (Number(row.counts?.[admissionPivotCountsKey(c)]) || 0),
                        0
                      );
                    return (
                      <tr
                        key={row.referenceKey ?? `ref-${idx}`}
                        onClick={() => {
                          if (rowTotal > 0) setReferenceDrilldownTarget(row);
                        }}
                        className={`transition ${
                          rowTotal > 0
                            ? 'cursor-pointer hover:bg-blue-50/70 dark:hover:bg-slate-800/40'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/30'
                        }`}
                        title={rowTotal > 0 ? 'View admissions for this reference' : undefined}
                      >
                        <td className={`sticky left-0 z-10 bg-white ${pivotTdClass} font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-300`}>
                          {idx + 1}
                        </td>
                        <td className={`sticky left-10 z-10 bg-white sm:left-14 ${pivotTdClass} font-semibold text-slate-900 dark:bg-slate-900 dark:text-slate-100`}>
                          {row.name}
                        </td>
                        <td className={pivotMetaTdClass}>{row.department?.trim() || '—'}</td>
                        <td className={pivotMetaTdClass}>{row.designation?.trim() || '—'}</td>
                        {referenceCourses.map((c) => (
                          <td
                            key={admissionPivotColumnReactKey(c)}
                            className={`${pivotTdClass} text-blue-600 dark:text-blue-400`}
                          >
                            {Number(row.counts?.[admissionPivotCountsKey(c)]) || 0}
                          </td>
                        ))}
                        <td className={`${pivotTdClass} font-bold text-slate-900 dark:text-slate-100`}>
                          {rowTotal}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : activeTab === 'source-list' ? (
        <Card className="overflow-hidden border-none p-0 shadow-lg dark:shadow-none">
          <div className="bg-slate-50 px-3 py-3 sm:px-6 sm:py-4 dark:bg-slate-800/50">
            <h3 className="text-sm font-semibold text-slate-900 sm:text-base dark:text-slate-100">Source list</h3>
            <p className="mt-1 text-[11px] text-slate-500 sm:text-xs dark:text-slate-400">
              Admissions grouped by lead source. <strong>Direct</strong> = Reference 1 is Direct.{' '}
              <strong>Joining Form</strong> = all joining-desk and token/SMS public-link admissions
              (staff Add Joining Form and student link submissions) when reference is not Direct.
              Other sources (Bulk Upload, Manual Form, etc.) are unchanged. Uses the filters above.
            </p>
          </div>
          <div className="-mx-1 overflow-x-auto sm:mx-0">
            <table className="min-w-[480px] w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead>
                <tr className="bg-white dark:bg-slate-900">
                  <th className={`sticky left-0 z-10 bg-white ${pivotThClass} dark:bg-slate-900`}>
                    S. No.
                  </th>
                  <th className={`sticky left-10 z-10 bg-white sm:left-14 ${pivotThClass} dark:bg-slate-900`}>
                    Source
                  </th>
                  {sourceCourses.map((c) => (
                    <th
                      key={admissionPivotColumnReactKey(c)}
                      title={resolvePivotCourseLabel(c)}
                      className={`max-w-[100px] text-center sm:max-w-[160px] ${pivotThClass}`}
                    >
                      <span className="line-clamp-2">{resolvePivotCourseLabel(c)}</span>
                    </th>
                  ))}
                  <th className={`${pivotThClass} text-center text-slate-600 dark:text-slate-300`}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {sourceStatsLoading ? (
                  <tr>
                    <td
                      colSpan={Math.max(3 + sourceCourses.length, 3)}
                      className="py-16 text-center text-slate-500"
                    >
                      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                      <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-400">Loading source stats…</p>
                    </td>
                  </tr>
                ) : sourceRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(3 + sourceCourses.length, 3)}
                      className="py-16 text-center text-slate-500"
                    >
                      No data for the selected filters.
                    </td>
                  </tr>
                ) : (
                  sourceRows.map((row: any, idx: number) => {
                    const rowTotal =
                      Number(row.total) ||
                      sourceCourses.reduce(
                        (acc, c) => acc + (Number(row.counts?.[admissionPivotCountsKey(c)]) || 0),
                        0
                      );
                    return (
                      <tr
                        key={row.sourceKey ?? `src-${idx}`}
                        className="transition hover:bg-slate-50 dark:hover:bg-slate-800/30"
                      >
                        <td className={`sticky left-0 z-10 bg-white ${pivotTdClass} font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-300`}>
                          {idx + 1}
                        </td>
                        <td className={`sticky left-10 z-10 bg-white sm:left-14 ${pivotTdClass} font-semibold text-slate-900 dark:bg-slate-900 dark:text-slate-100`}>
                          {row.name}
                        </td>
                        {sourceCourses.map((c) => (
                          <td
                            key={admissionPivotColumnReactKey(c)}
                            className={`${pivotTdClass} text-blue-600 dark:text-blue-400`}
                          >
                            {Number(row.counts?.[admissionPivotCountsKey(c)]) || 0}
                          </td>
                        ))}
                        <td className={`${pivotTdClass} font-bold text-slate-900 dark:text-slate-100`}>
                          {rowTotal}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : activeTab === 'date-wise' ? (
        <Card className="overflow-hidden border-none p-0 shadow-lg dark:shadow-none">
          <div className="bg-slate-50 px-3 py-3 sm:px-6 sm:py-4 dark:bg-slate-800/50">
            <h3 className="text-sm font-semibold text-slate-900 sm:text-base dark:text-slate-100">Date-wise admissions</h3>
            <p className="mt-1 text-[11px] text-slate-500 sm:text-xs dark:text-slate-400">
              Count of admissions on each calendar day by course, using each student&apos;s admission date (not last updated). Uses the same filters as above.
            </p>
          </div>
          <div className="-mx-1 overflow-x-auto sm:mx-0">
            <table className="min-w-[480px] w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead>
                <tr className="bg-white dark:bg-slate-900">
                  <th className={`sticky left-0 z-10 bg-white ${pivotThClass} dark:bg-slate-900`}>
                    Date
                  </th>
                  {dateWiseCourses.map((c) => (
                    <th
                      key={admissionPivotColumnReactKey(c)}
                      title={resolvePivotCourseLabel(c)}
                      className={`max-w-[100px] text-center sm:max-w-[160px] ${pivotThClass}`}
                    >
                      <span className="line-clamp-2">{resolvePivotCourseLabel(c)}</span>
                    </th>
                  ))}
                  <th className={`${pivotThClass} text-center text-slate-600 dark:text-slate-300`}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
                {dateWiseStatsLoading ? (
                  <tr>
                    <td
                      colSpan={Math.max(3 + dateWiseCourses.length, 3)}
                      className="py-16 text-center text-slate-500"
                    >
                      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                      <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-400">Loading date-wise stats…</p>
                    </td>
                  </tr>
                ) : dateWiseRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(3 + dateWiseCourses.length, 3)}
                      className="py-16 text-center text-slate-500"
                    >
                      No data for the selected filters.
                    </td>
                  </tr>
                ) : (
                  dateWiseRows.map((row: any) => {
                    const rowTotal =
                      Number(row.total) ||
                      dateWiseCourses.reduce(
                        (acc, c) => acc + (Number(row.counts?.[admissionPivotCountsKey(c)]) || 0),
                        0
                      );
                    let displayDate = row.date;
                    try {
                      displayDate = new Date(row.date + 'T12:00:00').toLocaleDateString(undefined, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      });
                    } catch {
                      displayDate = row.date;
                    }
                    return (
                      <tr
                        key={row.date}
                        className="transition hover:bg-slate-50 dark:hover:bg-slate-800/30"
                      >
                        <td className={`sticky left-0 z-10 whitespace-nowrap bg-white ${pivotTdClass} font-semibold text-slate-900 dark:bg-slate-900 dark:text-slate-100`}>
                          {displayDate}
                        </td>
                        {dateWiseCourses.map((c) => (
                          <td
                            key={admissionPivotColumnReactKey(c)}
                            className={`${pivotTdClass} text-blue-600 dark:text-blue-400`}
                          >
                            {Number(row.counts?.[admissionPivotCountsKey(c)]) || 0}
                          </td>
                        ))}
                        <td className={`${pivotTdClass} font-bold text-slate-900 dark:text-slate-100`}>
                          {rowTotal}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
};

export default CompletedAdmissionsPage;


