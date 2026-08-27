'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { hostelAPI, transportAPI } from '@/lib/api';
import {
  joiningTransportDetailsCompletenessScore,
  hasValidHostelFeeAmount,
  normalizeHostelFeesByYear,
  resolveHostelFeeRowForYear,
} from '@/lib/joiningBusFeeSync';
import { calendarYearToAcademicYearRange, resolveCurrentAcademicYearSession } from '@/lib/joiningAcademicYearRegistration';
import { showToast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { handleExternalPrint } from '@/lib/printHtml';
import { Button } from '@/components/ui/Button';
import { PrintActionButton } from '@/components/ui/PrintActionButton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import type {
  HostelCategorySummary,
  HostelFeeSummary,
  HostelSummary,
  JoiningTransportDetails,
  TransportRouteDetail,
  TransportRouteSummary,
} from '@/types';

type HostelFeePayload = {
  yearlyFees?: HostelFeeSummary[];
  fee?: HostelFeeSummary | null;
  resolvedAcademicYear?: string;
  feeMatchedBy?: 'exact' | 'fallback' | 'feestructures' | 'none';
};

const formatCurrency = (amount?: number | null) => {
  if (amount === undefined || amount === null || Number.isNaN(amount)) {
    return '—';
  }
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  } catch {
    return String(amount);
  }
};

/** Local calendar date as YYYY-MM-DD (for date inputs). */
const localIsoDate = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

type AccommodationTab = 'bus' | 'hostel' | 'none';
type HostelType = 'boys' | 'girls';

type TransportRequestRow = {
  id?: number;
  admission_number?: string;
  route_name?: string;
  stage_name?: string;
  fare?: number | string | null;
  bus_id?: string | null;
  status?: string | null;
  cancellation_reason?: string | null;
  academic_year?: string | null;
  application_number?: string | null;
};

const isActiveTransportStatus = (status?: string | null) => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'pending' || normalized === 'approved';
};

type AdmissionStepThreeBusHostelPanelProps = {
  value: JoiningTransportDetails;
  onChange?: (next: JoiningTransportDetails) => void;
  disabled?: boolean;
  className?: string;
  courseName?: string | null;
  programTotalYears?: number;
  /** Program year for hostel fee display (1 = first year, 2 = lateral, etc.). */
  studentYearOfStudy?: number;
  /** Current academic session for hostel/bus fees (e.g. 2026 → 2026-2027). Not lateral intake/batch year. */
  joiningAcademicYear?: string | null;
  collegeId?: number | null;
  managedCourseId?: number | null;
  collegeName?: string | null;
  admissionNumber?: string | null;
  joiningId?: string | null;
  /** Hide bus/hostel pickers after accommodation is saved / awaiting fee approval. */
  selectionUiLocked?: boolean;
  /** When true, hides the outer step title (for side-by-side admission layout). */
  embedded?: boolean;
};

const emptyTransportDetails = (): JoiningTransportDetails => ({});

export function parseJoiningTransportDetails(raw: unknown): JoiningTransportDetails {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyTransportDetails();
  }
  const source = raw as Record<string, unknown>;
  const rawType = String(source.accommodationType || '').toLowerCase();
  let accommodationType: JoiningTransportDetails['accommodationType'];
  if (rawType === 'hostel' || source.hostelId != null) {
    accommodationType = 'hostel';
  } else if (rawType === 'none') {
    accommodationType = 'none';
  } else if (rawType === 'bus' || source.routeId != null) {
    accommodationType = 'bus';
  } else {
    accommodationType = undefined;
  }
  const hostelTypeRaw = String(source.hostelType || '').toLowerCase();
  const hostelType =
    hostelTypeRaw === 'boys' || hostelTypeRaw === 'girls'
      ? (hostelTypeRaw as HostelType)
      : undefined;

  return {
    accommodationType,
    routeId: source.routeId != null ? String(source.routeId) : undefined,
    routeName: source.routeName != null ? String(source.routeName) : undefined,
    stageId: source.stageId != null ? String(source.stageId) : undefined,
    stageName: source.stageName != null ? String(source.stageName) : undefined,
    stageFare:
      source.stageFare === null || source.stageFare === undefined
        ? null
        : Number(source.stageFare),
    busId:
      source.busId != null
        ? String(source.busId)
        : source.bus_id != null
          ? String(source.bus_id)
          : source.busNumber != null
            ? String(source.busNumber)
            : undefined,
    busNumber:
      source.busNumber != null
        ? String(source.busNumber)
        : source.busId != null
          ? String(source.busId)
          : source.bus_id != null
            ? String(source.bus_id)
            : undefined,
    academicYear: (() => {
      const raw =
        source.academicYear != null
          ? String(source.academicYear)
          : source.academic_year != null
            ? String(source.academic_year)
            : undefined;
      if (!raw?.trim()) return undefined;
      return calendarYearToAcademicYearRange(raw.trim());
    })(),
    hostelId: source.hostelId != null ? String(source.hostelId) : undefined,
    hostelName: source.hostelName != null ? String(source.hostelName) : undefined,
    hostelType,
    categoryId: source.categoryId != null ? String(source.categoryId) : undefined,
    categoryName: source.categoryName != null ? String(source.categoryName) : undefined,
    roomId: source.roomId != null ? String(source.roomId) : undefined,
    roomNumber: source.roomNumber != null ? String(source.roomNumber) : undefined,
    admitDate: (() => {
      const raw =
        source.admitDate != null
          ? String(source.admitDate)
          : source.admit_date != null
            ? String(source.admit_date)
            : undefined;
      if (!raw?.trim()) return undefined;
      const trimmed = raw.trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) return undefined;
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    })(),
    hostelFee:
      source.hostelFee === null || source.hostelFee === undefined
        ? null
        : Number(source.hostelFee),
    hostelFeesByYear: Array.isArray(source.hostelFeesByYear)
      ? (source.hostelFeesByYear as Array<{ studentYear?: unknown; amount?: unknown }>)
          .map((row) => ({
            studentYear: Number(row.studentYear),
            amount:
              row.amount === null || row.amount === undefined || Number.isNaN(Number(row.amount))
                ? null
                : Number(row.amount),
          }))
          .filter((row) => Number.isFinite(row.studentYear) && row.studentYear > 0)
      : undefined,
  };
}

/** Pick the richest non-empty transport snapshot across joining, admission, and fee-request sources. */
export function mergeJoiningTransportDetails(...sources: unknown[]): JoiningTransportDetails {
  const parsed = sources.map(parseJoiningTransportDetails);
  let best = emptyTransportDetails();
  let bestScore = -1;
  for (const candidate of parsed) {
    const score = joiningTransportDetailsCompletenessScore(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

const unwrapList = <T,>(response: unknown): T[] => {
  const envelope = (response as { data?: unknown })?.data ?? response;
  const rows =
    envelope && typeof envelope === 'object' && 'data' in (envelope as object)
      ? (envelope as { data: T[] }).data
      : envelope;
  return Array.isArray(rows) ? rows : [];
};

const unwrapData = <T,>(response: unknown): T | null => {
  const envelope = (response as { data?: unknown })?.data ?? response;
  const row =
    envelope && typeof envelope === 'object' && 'data' in (envelope as object)
      ? (envelope as { data: T }).data
      : envelope;
  return row && typeof row === 'object' ? (row as T) : null;
};

export function AdmissionStepThreeBusHostelPanel({
  value,
  onChange,
  disabled = false,
  className,
  courseName,
  programTotalYears = 4,
  studentYearOfStudy = 1,
  joiningAcademicYear,
  collegeId = null,
  managedCourseId = null,
  collegeName = null,
  admissionNumber = null,
  joiningId = null,
  selectionUiLocked = false,
  embedded = false,
  onExistingRequestChange,
  onExistingHostelRequestChange,
}: AdmissionStepThreeBusHostelPanelProps & {
  onExistingRequestChange?: (hasExisting: boolean) => void;
  onExistingHostelRequestChange?: (hasExisting: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const canEdit = Boolean(onChange) && !disabled;
  const selectedTab: AccommodationTab | null =
    value.hostelId != null && String(value.hostelId).trim() !== ''
      ? 'hostel'
      : value.routeId != null && String(value.routeId).trim() !== ''
        ? 'bus'
        : value.accommodationType === 'hostel'
          ? 'hostel'
          : value.accommodationType === 'bus'
            ? 'bus'
            : value.accommodationType === 'none'
              ? 'none'
              : null;
  const [activeTab, setActiveTab] = useState<AccommodationTab>(selectedTab || 'none');
  const tabAutoInitializedRef = useRef(false);

  useEffect(() => {
    if (selectedTab) {
      setActiveTab(selectedTab);
    }
  }, [selectedTab]);

  const displayTab: AccommodationTab = selectedTab ?? activeTab;

  const joiningAcademicYearSession = useMemo(() => {
    const fromProp = calendarYearToAcademicYearRange(joiningAcademicYear);
    // Always prefer a real current-session range; fall back to clock year if prop is empty.
    return fromProp || resolveCurrentAcademicYearSession();
  }, [joiningAcademicYear]);

  const effectiveAcademicYear = joiningAcademicYearSession || value.academicYear || '';

  useEffect(() => {
    tabAutoInitializedRef.current = false;
  }, [admissionNumber, joiningId, effectiveAcademicYear]);

  const { data: nextAppNoResponse, isLoading: isLoadingNextAppNo } = useQuery({
    queryKey: [
      'next-transport-app-no',
      effectiveAcademicYear,
      collegeId,
      managedCourseId,
      courseName,
      collegeName,
    ],
    queryFn: async () =>
      transportAPI.getNextApplicationNumberPreview({
        academicYear: effectiveAcademicYear,
        collegeId,
        managedCourseId,
        courseName,
        collegeName,
      }),
    enabled: displayTab === 'bus' && Boolean(effectiveAcademicYear) && (Boolean(collegeId) || Boolean(managedCourseId) || Boolean(courseName) || Boolean(collegeName)),
    staleTime: 60_000,
  });

  const nextAppNo = nextAppNoResponse?.data?.application_number || null;

  const {
    data: existingRequestResponse,
    isFetched: transportRequestFetched,
    isFetching: isFetchingTransportRequest,
  } = useQuery({
    queryKey: ['student-transport-request', admissionNumber, effectiveAcademicYear],
    queryFn: () =>
      transportAPI.getStudentTransportRequest({
        admissionNumber: admissionNumber || '',
        academicYear: effectiveAcademicYear,
      }),
    enabled: Boolean(admissionNumber) && Boolean(effectiveAcademicYear),
    staleTime: 60_000,
  });

  const existingRequest = (existingRequestResponse?.data || null) as TransportRequestRow | null;
  const isActiveTransportRequest = Boolean(existingRequest && isActiveTransportStatus(existingRequest.status));
  const isCancelledTransportRequest =
    Boolean(existingRequest) && String(existingRequest?.status || '').trim().toLowerCase() === 'cancelled';

  const {
    data: hostelStudentResponse,
    isLoading: isLoadingHostelStudent,
    isFetched: hostelStudentFetched,
    isFetching: isFetchingHostelStudent,
  } = useQuery({
    queryKey: [
      'hostel-student-details',
      admissionNumber,
      joiningId,
      value.hostelId,
      effectiveAcademicYear,
    ],
    queryFn: async () =>
      hostelAPI.getStudentHostelDetails({
        admissionNumber: admissionNumber || undefined,
        joiningId: joiningId || undefined,
        hostelId: value.hostelId || undefined,
        academicYear: effectiveAcademicYear || undefined,
      }),
    enabled: Boolean(admissionNumber) || Boolean(joiningId),
    staleTime: 60_000,
  });

  const hostelStudentDetails = hostelStudentResponse?.data || null;
  const isActiveHostelRequest = Boolean(hostelStudentDetails?.isAssigned);
  const hostelPrintStudentId = String(hostelStudentDetails?.studentUserId || '').trim();

  useEffect(() => {
    onExistingHostelRequestChange?.(isActiveHostelRequest);
  }, [isActiveHostelRequest, onExistingHostelRequestChange]);

  useEffect(() => {
    if (tabAutoInitializedRef.current) return;

    const needsTransportProbe = Boolean(admissionNumber) && Boolean(effectiveAcademicYear);
    const needsHostelProbe = Boolean(admissionNumber) || Boolean(joiningId);
    if (needsTransportProbe && !transportRequestFetched) return;
    if (needsHostelProbe && !hostelStudentFetched) return;

    tabAutoInitializedRef.current = true;

    if (selectedTab) {
      setActiveTab(selectedTab);
      return;
    }

    let inferredTab: AccommodationTab = 'none';
    if (isActiveHostelRequest) {
      inferredTab = 'hostel';
    } else if (isActiveTransportRequest) {
      inferredTab = 'bus';
    } else if (value.hostelId != null && String(value.hostelId).trim() !== '') {
      inferredTab = 'hostel';
    } else if (value.routeId != null && String(value.routeId).trim() !== '') {
      inferredTab = 'bus';
    } else if (value.accommodationType === 'hostel') {
      inferredTab = 'hostel';
    } else if (value.accommodationType === 'bus') {
      inferredTab = 'bus';
    } else if (value.accommodationType === 'none') {
      inferredTab = 'none';
    }

    setActiveTab(inferredTab);
    // UI defaults to "None" visually — persist it so Step 3 can advance without re-clicking.
    if (
      inferredTab === 'none' &&
      value.accommodationType !== 'none' &&
      canEdit &&
      onChange
    ) {
      onChange({
        ...value,
        accommodationType: 'none',
      });
    }
  }, [
    admissionNumber,
    canEdit,
    effectiveAcademicYear,
    isActiveTransportRequest,
    isActiveHostelRequest,
    hostelStudentFetched,
    joiningId,
    onChange,
    selectedTab,
    transportRequestFetched,
    value,
  ]);

  useEffect(() => {
    onExistingRequestChange?.(isActiveTransportRequest);
  }, [isActiveTransportRequest, onExistingRequestChange]);

  useEffect(() => {
    if (!canEdit || !onChange || !joiningAcademicYearSession) return;
    if (value.academicYear === joiningAcademicYearSession) return;
    onChange({ ...value, academicYear: joiningAcademicYearSession });
  }, [joiningAcademicYearSession, canEdit, onChange, value]);

  const withHostelAcademicYear = (
    patch: Partial<JoiningTransportDetails>
  ): Partial<JoiningTransportDetails> => ({
    ...patch,
    ...(effectiveAcademicYear ? { academicYear: effectiveAcademicYear } : {}),
  });

  const {
    data: routesResponse,
    isLoading: isLoadingRoutes,
    isError: routesError,
  } = useQuery({
    queryKey: ['transport', 'routes'],
    queryFn: async () => transportAPI.listRoutes(),
    staleTime: 120_000,
  });

  const routes = useMemo(() => unwrapList<TransportRouteSummary>(routesResponse), [routesResponse]);
  const selectedRouteId = value.routeId || '';

  /** Flat list of every stage across all routes — used for the stage search. */
  const allStages = useMemo(() => {
    const result: Array<{
      stageId: string;
      stageName: string;
      fare: number | null;
      routeId: string;
      routeName: string;
      seatsFilled?: number;
      studentRequestCount?: number;
      employeeRequestCount?: number;
      seatsAvailable?: number;
      capacity?: number;
      assignedBusNumbers?: string[];
    }> = [];
    for (const route of routes) {
      for (const stage of route.stages ?? []) {
        if (!stage._id || !stage.stageName) continue;
        result.push({
          stageId: stage._id,
          stageName: stage.stageName,
          fare: stage.fare ?? null,
          routeId: route.routeId,
          routeName: route.routeName,
          seatsFilled: route.seatsFilled,
          studentRequestCount: route.studentRequestCount,
          employeeRequestCount: route.employeeRequestCount,
          seatsAvailable: route.seatsAvailable,
          capacity: route.capacity,
          assignedBusNumbers: route.assignedBusNumbers,
        });
      }
    }
    return result;
  }, [routes]);

  const [stageQuery, setStageQuery] = useState('');
  const [showStageSuggestions, setShowStageSuggestions] = useState(false);
  const stageSearchRef = useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (stageSearchRef.current && !stageSearchRef.current.contains(e.target as Node)) {
        setShowStageSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredStages = useMemo(() => {
    const q = stageQuery.trim().toLowerCase();
    if (!q) return allStages.slice(0, 40);
    return allStages
      .filter(
        (s) =>
          s.stageName.toLowerCase().includes(q) ||
          s.routeName.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [allStages, stageQuery]);

  const handleStageSearchSelect = useCallback(
    (item: typeof allStages[number]) => {
      setStageQuery(item.stageName);
      setShowStageSuggestions(false);
      if (!canEdit || !onChange) return;
      // Auto-fill both route and stage in one go
      onChange({
        ...value,
        accommodationType: 'bus',
        routeId: item.routeId,
        routeName: item.routeName,
        stageId: item.stageId,
        stageName: item.stageName,
        stageFare: item.fare,
        // clear bus if route changed
        ...(value.routeId !== item.routeId ? { busId: undefined, busNumber: undefined } : {}),
      });
    },
    [canEdit, onChange, value]
  );

  // Sync stageQuery display text when value.stageName changes externally
  useEffect(() => {
    setStageQuery(value.stageName ?? '');
  }, [value.stageName]);

  const {
    data: routeDetailResponse,
    isLoading: isLoadingRouteDetail,
    isError: routeDetailError,
  } = useQuery({
    queryKey: ['transport', 'route', selectedRouteId],
    queryFn: async () => transportAPI.getRouteDetail(selectedRouteId),
    enabled: displayTab === 'bus' && Boolean(selectedRouteId),
    staleTime: 120_000,
  });

  const routeDetail = useMemo(
    () => unwrapData<TransportRouteDetail>(routeDetailResponse),
    [routeDetailResponse]
  );

  const { data: hostelsResponse, isLoading: isLoadingHostels } = useQuery({
    queryKey: ['hostel', 'hostels'],
    queryFn: async () => hostelAPI.listHostels(),
    staleTime: 120_000,
  });

  const hostels = useMemo(() => unwrapList<HostelSummary>(hostelsResponse), [hostelsResponse]);



  const { data: categoriesResponse, isLoading: isLoadingCategories } = useQuery({
    queryKey: ['hostel', 'categories', value.hostelId],
    queryFn: async () => hostelAPI.listCategories(value.hostelId as string),
    enabled: displayTab === 'hostel' && Boolean(value.hostelId),
    staleTime: 120_000,
  });

  const categories = useMemo(
    () => unwrapList<HostelCategorySummary>(categoriesResponse),
    [categoriesResponse]
  );

  const { data: feeResponse, isLoading: isLoadingHostelFee, isError: hostelFeeError } = useQuery({
    queryKey: [
      'hostel',
      'fee',
      value.hostelId,
      value.categoryId,
      effectiveAcademicYear,
      courseName,
      programTotalYears,
    ],
    queryFn: async () => {
      try {
        return await hostelAPI.getFee({
          hostelId: value.hostelId as string,
          categoryId: value.categoryId as string,
          academicYear: effectiveAcademicYear,
          course: courseName || undefined,
          totalYears: programTotalYears,
        });
      } catch (error: unknown) {
        const status = (error as { response?: { status?: number } })?.response?.status;
        // 404 = fee not configured for this selection — treat as empty, not a hard failure.
        if (status === 404) {
          return { data: { yearlyFees: [], fee: null, feeMatchedBy: 'none' } };
        }
        throw error;
      }
    },
    enabled:
      displayTab === 'hostel' &&
      Boolean(value.hostelId) &&
      Boolean(value.categoryId) &&
      Boolean(effectiveAcademicYear),
    staleTime: 60_000,
  });

  const feePayload = useMemo(
    () => unwrapData<HostelFeePayload>(feeResponse),
    [feeResponse]
  );
  const resolvedHostelFeesByYear = useMemo(
    () => normalizeHostelFeesByYear(feePayload?.yearlyFees),
    [feePayload?.yearlyFees]
  );
  const effectiveStudentYear = Math.max(1, Math.min(studentYearOfStudy, programTotalYears));
  const currentYearHostelFee = useMemo(
    () => resolveHostelFeeRowForYear(resolvedHostelFeesByYear, effectiveStudentYear),
    [resolvedHostelFeesByYear, effectiveStudentYear]
  );

  useEffect(() => {
    if (!canEdit || !onChange || displayTab !== 'hostel') return;
    if (!value.categoryId || !currentYearHostelFee) return;

    const nextFees = [currentYearHostelFee];
    const nextFirstFee = currentYearHostelFee.amount ?? null;
    const currentFeesJson = JSON.stringify(value.hostelFeesByYear || []);
    const nextFeesJson = JSON.stringify(nextFees);
    if (nextFeesJson === currentFeesJson && nextFirstFee === value.hostelFee) return;

    onChange({
      ...value,
      hostelFeesByYear: nextFees,
      hostelFee: nextFirstFee,
    });
  }, [
    displayTab,
    canEdit,
    onChange,
    currentYearHostelFee,
    value.categoryId,
    value.hostelFee,
    value.hostelFeesByYear,
    value,
  ]);

  // Prefill admit date to today when hostel is selected and no date is set yet.
  useEffect(() => {
    if (!canEdit || !onChange || displayTab !== 'hostel') return;
    if (value.admitDate) return;
    if (value.accommodationType !== 'hostel' && !value.hostelId) return;
    onChange({
      ...value,
      admitDate: localIsoDate(),
    });
  }, [displayTab, canEdit, onChange, value]);

  const patchValue = (patch: Partial<JoiningTransportDetails>) => {
    if (!canEdit || !onChange) return;
    onChange({ ...value, ...patch });
  };

  const clearBusFields = (): Partial<JoiningTransportDetails> => ({
    routeId: undefined,
    routeName: undefined,
    stageId: undefined,
    stageName: undefined,
    stageFare: null,
    busId: undefined,
    busNumber: undefined,
  });

  const clearHostelFields = (): Partial<JoiningTransportDetails> => ({
    hostelId: undefined,
    hostelName: undefined,
    hostelType: undefined,
    categoryId: undefined,
    categoryName: undefined,
    roomId: undefined,
    roomNumber: undefined,
    admitDate: undefined,
    hostelFee: null,
    hostelFeesByYear: undefined,
  });

  const cancelTransportMutation = useMutation({
    mutationFn: async () =>
      transportAPI.cancelTransportRequest({
        admissionNumber: admissionNumber || '',
        academicYear: effectiveAcademicYear,
        requestId: existingRequest?.id,
        joiningId: joiningId || undefined,
        reason: cancelReason.trim(),
      }),
    onSuccess: async () => {
      showToast.success('Transport request cancelled');
      setCancelDialogOpen(false);
      setCancelReason('');
      await queryClient.invalidateQueries({
        queryKey: ['student-transport-request', admissionNumber, effectiveAcademicYear],
      });
      await queryClient.refetchQueries({
        queryKey: ['student-transport-request', admissionNumber, effectiveAcademicYear],
        type: 'active',
      });
      if (canEdit && onChange) {
        onChange({
          accommodationType: undefined,
          ...clearBusFields(),
        });
      }
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      showToast.error(error.response?.data?.message || 'Failed to cancel transport request');
    },
  });

  const handleTabChange = (tab: AccommodationTab) => {
    setActiveTab(tab);
    if (!canEdit || !onChange) return;
    if (tab === 'none') {
      onChange({
        accommodationType: 'none',
        ...clearBusFields(),
        ...clearHostelFields(),
      });
      return;
    }
    onChange({
      ...value,
      accommodationType: tab,
      ...(tab === 'bus'
        ? clearHostelFields()
        : withHostelAcademicYear({
            ...clearBusFields(),
            admitDate: value.admitDate || localIsoDate(),
          })),
    });
  };

  const handleRouteChange = (routeId: string) => {
    const selected = routes.find((route) => route.routeId === routeId);
    patchValue({
      ...clearBusFields(),
      routeId: routeId || undefined,
      routeName: selected?.routeName || undefined,
    });
  };

  const handleStageChange = (stageId: string) => {
    const selectedStage = routeDetail?.stages?.find((stage) => stage._id === stageId);
    patchValue({
      stageId: stageId || undefined,
      stageName: selectedStage?.stageName || undefined,
      stageFare:
        selectedStage?.fare === undefined || selectedStage?.fare === null
          ? null
          : Number(selectedStage.fare),
    });
  };

  const handleBusChange = (busNumber: string) => {
    const trimmed = busNumber.trim();
    patchValue({
      busId: trimmed || undefined,
      busNumber: trimmed || undefined,
    });
  };

  const handleHostelChange = (hostelId: string) => {
    const selectedHostel = hostels.find((hostel) => hostel._id === hostelId);
    patchValue(
      withHostelAcademicYear({
        hostelType: selectedHostel?.type || undefined,
        hostelId: selectedHostel?._id || undefined,
        hostelName: selectedHostel?.name || undefined,
        categoryId: undefined,
        categoryName: undefined,
        roomId: undefined,
        roomNumber: undefined,
        admitDate: value.admitDate || localIsoDate(),
        hostelFee: null,
        hostelFeesByYear: undefined,
      })
    );
  };

  const handleCategoryChange = (categoryId: string) => {
    const selected = categories.find((category) => category._id === categoryId);
    patchValue(
      withHostelAcademicYear({
        categoryId: categoryId || undefined,
        categoryName: selected?.name || undefined,
        roomId: undefined,
        roomNumber: undefined,
        admitDate: value.admitDate || localIsoDate(),
        hostelFee: null,
        hostelFeesByYear: undefined,
      })
    );
  };

  const handleAdmitDateChange = (admitDate: string) => {
    patchValue({
      admitDate: admitDate.trim() || undefined,
    });
  };

  const stages = routeDetail?.stages || [];
  const buses = routeDetail?.buses || [];
  const selectedBusNumber = String(value.busId || value.busNumber || '').trim();
  const selectedBusObj = buses.find((b) => String(b.busNumber || '').trim() === selectedBusNumber) || buses[0];
  const selectedBusSeatsAvailable = selectedBusObj?.seatsAvailable ?? routeDetail?.seatsAvailable ?? 0;
  const selectedBusCapacity = selectedBusObj?.capacity ?? routeDetail?.capacity ?? 40;
  const selectedBusSeatsFilled = selectedBusObj?.seatsFilled ?? routeDetail?.seatsFilled ?? 0;
  const isBusFull = Boolean(selectedRouteId && routeDetail && selectedBusSeatsAvailable <= 0);

  useEffect(() => {
    if (!canEdit || !onChange || displayTab !== 'bus') return;
    if (!selectedRouteId || !routeDetail) return;
    if (value.busSeatsAvailable !== selectedBusSeatsAvailable) {
      onChange({ ...value, busSeatsAvailable: selectedBusSeatsAvailable });
    }
  }, [displayTab, canEdit, onChange, selectedRouteId, routeDetail, selectedBusSeatsAvailable, value]);

  useEffect(() => {
    if (!canEdit || !onChange || displayTab !== 'bus') return;
    if (!selectedRouteId || buses.length === 0) return;

    const numberedBuses = buses
      .map((bus) => String(bus.busNumber || '').trim())
      .filter(Boolean);
    if (numberedBuses.length === 0) return;

    if (selectedBusNumber && numberedBuses.includes(selectedBusNumber)) return;

    const preferredNumber =
      numberedBuses.length === 1
        ? numberedBuses[0]
        : String(
            buses.find((bus) => String(bus.status || '').toLowerCase() === 'active')?.busNumber ||
              buses[0]?.busNumber ||
              ''
          ).trim();

    if (!preferredNumber || preferredNumber === selectedBusNumber) return;
    onChange({ ...value, busId: preferredNumber, busNumber: preferredNumber });
  }, [
    displayTab,
    buses,
    canEdit,
    onChange,
    selectedBusNumber,
    selectedRouteId,
    value,
  ]);
  const displayHostelFeeRow =
    currentYearHostelFee ??
    (value.hostelFeesByYear?.length
      ? resolveHostelFeeRowForYear(value.hostelFeesByYear, effectiveStudentYear)
      : null);
  const hasHostelFeeRows = hasValidHostelFeeAmount(displayHostelFeeRow?.amount);
  const hasExternalBusApplication = isActiveTransportRequest;
  const hasExternalHostelApplication = isActiveHostelRequest;
  const busSelectionLocked = hasExternalBusApplication || selectionUiLocked;
  const hostelSelectionLocked = hasExternalHostelApplication || selectionUiLocked;

  const visibleAccommodationTabs = useMemo(() => {
    if (hasExternalBusApplication && hasExternalHostelApplication) {
      return ['bus', 'hostel'] as AccommodationTab[];
    }
    if (hasExternalBusApplication) return ['bus'] as AccommodationTab[];
    if (hasExternalHostelApplication) return ['hostel'] as AccommodationTab[];
    return ['bus', 'hostel', 'none'] as AccommodationTab[];
  }, [
    hasExternalBusApplication,
    hasExternalHostelApplication,
  ]);
  const resolvedFeeAcademicYear = feePayload?.resolvedAcademicYear || effectiveAcademicYear;
  const feeUsedFallback =
    feePayload?.feeMatchedBy === 'fallback' &&
    resolvedFeeAcademicYear &&
    effectiveAcademicYear &&
    resolvedFeeAcademicYear !== effectiveAcademicYear;
  const resolvedFeeCourse = feePayload?.yearlyFees?.[0]?.course || feePayload?.fee?.course || '';
  // Lateral display labels (e.g. B.Tech (LATERAL)) correctly use base course fees (B.Tech).
  const normalizeHostelCourseForCompare = (value: string) =>
    String(value || '')
      .trim()
      .replace(/\s*\(\s*lateral\s*\)\s*/gi, '')
      .replace(/\s+/g, ' ')
      .toLowerCase();
  const feeCourseMismatch =
    Boolean(courseName && resolvedFeeCourse) &&
    normalizeHostelCourseForCompare(resolvedFeeCourse) !==
      normalizeHostelCourseForCompare(String(courseName)) &&
    // Ignore unresolved Mongo course ids in the warning text.
    !/^[a-f0-9]{24}$/i.test(String(resolvedFeeCourse).trim());

  return (
    <section
      className={cn(
        'relative z-20 scroll-mt-24 space-y-6 rounded-2xl border-2 border-amber-200/80 bg-gradient-to-b from-amber-50/40 to-white/95 p-6 shadow-lg shadow-amber-100/30 backdrop-blur dark:border-amber-900/50 dark:from-amber-950/20 dark:to-slate-900/70 dark:shadow-none',
        className
      )}
    >
      <div
        className={cn(
          'flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between',
          !embedded && 'border-b border-slate-100 pb-4 dark:border-slate-800'
        )}
      >
        {!embedded ? (
          <div className="flex flex-col gap-0.5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Accommodation selection
            </h2>
            {effectiveAcademicYear && (
              <p className="text-xs text-slate-500 font-medium">
                Academic Year: {effectiveAcademicYear}
              </p>
            )}
          </div>
        ) : null}

        <div className={cn('inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900/80', embedded && 'w-full sm:justify-start')}>
          {visibleAccommodationTabs.map((tab) => {
            const isActive = displayTab === tab;
            return (
              <button
                key={tab}
                type="button"
                disabled={!canEdit && !isActive}
                className={cn(
                  'rounded-lg px-4 py-2 text-sm font-semibold capitalize transition',
                  isActive
                    ? 'bg-[#ea580c] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800',
                  !canEdit && !isActive && 'opacity-50'
                )}
                onClick={() => handleTabChange(tab)}
              >
                {tab === 'none' ? 'None' : tab}
              </button>
            );
          })}
        </div>
      </div>

      {!value.accommodationType &&
      !existingRequest &&
      !hostelStudentDetails?.isAssigned &&
      canEdit ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Select Bus, Hostel, or None above to configure accommodation.
        </p>
      ) : null}

      {displayTab === 'none' ? (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            No bus or hostel
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This student will not use college bus transport or hostel accommodation. No transport or
            hostel fee rows are added in Step 4.
          </p>
        </div>
      ) : displayTab === 'bus' ? (
        <div className="space-y-5">
          {selectionUiLocked && isFetchingTransportRequest && !existingRequest ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200">
              Loading transport request details…
            </div>
          ) : null}
          {(existingRequest && (isActiveTransportRequest || isCancelledTransportRequest)) ? (
            <div
              className={cn(
                'rounded-xl border p-4 text-slate-800 dark:text-slate-200',
                isCancelledTransportRequest
                  ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900/50 dark:bg-rose-950/20'
                  : 'border-blue-200 bg-blue-50/70 dark:border-blue-900/50 dark:bg-blue-950/20'
              )}
            >
              <h4
                className={cn(
                  'font-semibold text-sm',
                  isCancelledTransportRequest
                    ? 'text-rose-800 dark:text-rose-200'
                    : 'text-blue-800 dark:text-blue-200'
                )}
              >
                {isCancelledTransportRequest
                  ? `Cancelled Transport Request (AY: ${existingRequest.academic_year})`
                  : `Active Transport Request Found (AY: ${existingRequest.academic_year})`}
              </h4>
              <p className="mt-1 text-xs">
                {isCancelledTransportRequest
                  ? 'This transport request was cancelled. Bus fee rows are inactive in Fee Management.'
                  : 'This student already has a registered request in the transport system:'}
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 font-medium text-xs sm:grid-cols-4">
                <div>
                  <span className="text-slate-500">Route:</span> {existingRequest.route_name || '—'}
                </div>
                <div>
                  <span className="text-slate-500">Stage:</span> {existingRequest.stage_name || '—'}
                </div>
                <div>
                  <span className="text-slate-500">Fare:</span> {formatCurrency(Number(existingRequest.fare))}
                </div>
                <div>
                  <span className="text-slate-500">Bus Number:</span> {existingRequest.bus_id || 'Not assigned'}
                </div>
                <div>
                  <span className="text-slate-500">Status:</span>{' '}
                  <span className={cn(
                    'font-bold capitalize',
                    existingRequest.status === 'approved'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : existingRequest.status === 'cancelled'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-amber-600 dark:text-amber-400'
                  )}>
                    {existingRequest.status}
                  </span>
                </div>
                {existingRequest.application_number && (
                  <div>
                    <span className="text-slate-500">Application ID:</span> {existingRequest.application_number}
                  </div>
                )}
                {isCancelledTransportRequest && existingRequest.cancellation_reason ? (
                  <div className="col-span-2 sm:col-span-4">
                    <span className="text-slate-500">Cancellation reason:</span>{' '}
                    {existingRequest.cancellation_reason}
                  </div>
                ) : null}
                <div className="col-span-2 sm:col-span-4 mt-3 flex justify-end gap-2">
                  {isActiveTransportRequest && canEdit ? (
                    <button
                      type="button"
                      onClick={() => setCancelDialogOpen(true)}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
                    >
                      Cancel transport
                    </button>
                  ) : null}
                  {!isCancelledTransportRequest ? (
                  <PrintActionButton
                    label="Print Transport Admit"
                    onClick={() => {
                      void handleExternalPrint('transport', {
                        template: 'transport-admit',
                        admissionNumber: admissionNumber || '',
                        academicYear: existingRequest.academic_year || ''
                      }, undefined, 'Transport Admit Card');
                    }}
                  />
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}


          {!busSelectionLocked ? (
          <>
          {/* ── Stage search – select a stage and route is auto-filled ── */}
          <div ref={stageSearchRef} className="relative">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Search boarding stage
            </label>
            <div className="relative mt-2">
              <input
                type="text"
                autoComplete="off"
                placeholder={isLoadingRoutes ? 'Loading stages…' : 'Type a stage or route name to search…'}
                disabled={!canEdit || isLoadingRoutes || busSelectionLocked}
                value={stageQuery}
                onChange={(e) => {
                  setStageQuery(e.target.value);
                  setShowStageSuggestions(true);
                  // If the user clears the text, reset both route and stage
                  if (!e.target.value.trim() && canEdit && onChange) {
                    onChange({ ...value, routeId: undefined, routeName: undefined, stageId: undefined, stageName: undefined, stageFare: null, busId: undefined, busNumber: undefined });
                  }
                }}
                onFocus={() => setShowStageSuggestions(true)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-[#ea580c] focus:outline-none focus:ring-2 focus:ring-[#ea580c]/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-orange-500"
              />
              {stageQuery ? (
                <button
                  type="button"
                  aria-label="Clear stage"
                  onClick={() => {
                    setStageQuery('');
                    setShowStageSuggestions(false);
                    if (canEdit && onChange) {
                      onChange({ ...value, routeId: undefined, routeName: undefined, stageId: undefined, stageName: undefined, stageFare: null, busId: undefined, busNumber: undefined });
                    }
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  ✕
                </button>
              ) : (
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
              )}
              {/* Suggestions dropdown */}
              {showStageSuggestions && canEdit && !busSelectionLocked && (
                <div className="absolute left-0 top-full z-[9999] mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
                {isLoadingRoutes ? (
                  <p className="px-4 py-3 text-sm text-slate-500">Loading stages…</p>
                ) : filteredStages.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-500">
                    {stageQuery.trim() ? `No stages matching "${stageQuery}"` : 'No stages available'}
                  </p>
                ) : (
                  <ul className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredStages.map((item) => {
                      const isSelected = item.stageId === value.stageId && item.routeId === value.routeId;
                      const isFull = item.seatsAvailable != null && item.seatsAvailable <= 0;
                      return (
                        <li key={`${item.routeId}:${item.stageId}`}>
                          <button
                            type="button"
                            disabled={isFull}
                            onClick={() => handleStageSearchSelect(item)}
                            className={cn(
                              'w-full text-left px-4 py-2.5 flex items-start justify-between gap-3 transition-colors',
                              isSelected
                                ? 'bg-orange-50 dark:bg-orange-950/30'
                                : isFull
                                  ? 'opacity-50 cursor-not-allowed'
                                  : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                            )}
                          >
                            <span className="flex flex-col gap-0.5 min-w-0">
                              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {item.stageName}
                                {isSelected ? ' ✓' : ''}
                              </span>
                              {/* Row 1: routeId · routeName · bus */}
                              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                <span className="font-mono text-slate-700 dark:text-slate-300">{item.routeId}</span>
                                {' · '}{item.routeName}
                                {item.assignedBusNumbers && item.assignedBusNumbers.length > 0
                                  ? ` · 🚌 ${item.assignedBusNumbers.join(', ')}`
                                  : ''}
                              </span>
                              {/* Row 2: filled/capacity + student & employee breakdown */}
                              <span className="flex items-center gap-2 mt-0.5">
                                {item.seatsFilled != null && item.capacity != null ? (
                                  <span className={cn(
                                    'inline-flex items-center gap-0.5 text-[10px] font-bold',
                                    isFull
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : 'text-slate-700 dark:text-slate-300'
                                  )}>
                                    {item.seatsFilled}/{item.capacity} filled
                                  </span>
                                ) : null}
                                {item.studentRequestCount ? (
                                  <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300">
                                    🎓 {item.studentRequestCount}
                                  </span>
                                ) : null}
                                {item.employeeRequestCount ? (
                                  <span className="text-[10px] font-medium text-violet-700 dark:text-violet-300">
                                    👔 {item.employeeRequestCount}
                                  </span>
                                ) : null}
                                {isFull ? (
                                  <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">● Full</span>
                                ) : null}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs font-semibold">
                              {item.fare != null ? (
                                <span className="text-emerald-700 dark:text-emerald-400">
                                  {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(item.fare)}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
          </div>

          {/* Auto-filled route context — shown after a stage is selected */}
          {selectedRouteId && value.stageName ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs font-semibold text-orange-800 dark:bg-orange-950/30 dark:border-orange-800/50 dark:text-orange-300">
                <span>🚌</span>
                Route: {value.routeName || selectedRouteId}
              </span>
              {value.stageFare != null ? (
                <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-800/50 dark:text-emerald-300">
                  Fare: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(value.stageFare)}
                </span>
              ) : null}
            </div>
          ) : null}

          {routesError ? (
            <p className="text-sm text-rose-600 dark:text-rose-300">
              Could not load stages from the Transport database.
            </p>
          ) : null}

          {isBusFull ? (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-900 shadow-sm dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              <div className="flex items-start gap-3">
                <span className="text-xl">🛑</span>
                <div>
                  <h4 className="font-bold text-sm text-rose-900 dark:text-rose-100">
                    Bus Full — {selectedBusSeatsFilled} Active Requests ({selectedBusCapacity} seat capacity)
                  </h4>
                  <p className="mt-1 text-xs text-rose-800 dark:text-rose-200">
                    This bus route ({routeDetail?.routeName}{selectedBusObj?.busNumber ? ` · Bus ${selectedBusObj.busNumber}` : ''}) has <strong>{selectedBusSeatsFilled} active requests</strong> (pending &amp; approved) against a capacity of {selectedBusCapacity} seats — no free seats remain.
                    New requests cannot be raised for this route. Please select a different bus route.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {selectedRouteId && routeDetail ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Route
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {routeDetail.routeName}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {routeDetail.startPoint || '—'} → {routeDetail.endPoint || '—'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Assigned bus
                </p>
                {buses.length > 1 ? (
                  <select
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    value={selectedBusNumber}
                    disabled={!canEdit || busSelectionLocked}
                    onChange={(event) => handleBusChange(event.target.value)}
                  >
                    <option value="">Select assigned bus</option>
                    {buses.map((bus) => {
                      const number = String(bus.busNumber || '').trim();
                      if (!number) return null;
                      return (
                        <option key={bus._id || number} value={number}>
                          {number}
                          {bus.driverName ? ` · ${bus.driverName}` : ''}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {selectedBusNumber ||
                      (buses[0]?.busNumber ? String(buses[0].busNumber) : 'No bus assigned to this route')}
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Active requests on this bus
                </p>
                <p className={cn(
                  "mt-1 text-lg font-bold",
                  selectedBusSeatsAvailable === 0
                    ? "text-rose-600 dark:text-rose-400"
                    : selectedBusSeatsAvailable <= 5
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-700 dark:text-emerald-300"
                )}>
                  {selectedBusSeatsFilled} Active Requests
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {selectedBusSeatsAvailable} of {selectedBusCapacity} seats free (approved only)
                </p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Selected stage fee
                </p>
                <p className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(value.stageFare)}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {value.stageName || 'Pick a stage to view fare'}
                </p>
              </div>
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {existingRequest?.application_number ? 'Transport ID' : 'Expected Transport ID'}
                </p>
                <p className="mt-1 text-base font-bold font-mono text-indigo-700 dark:text-indigo-300 animate-pulse-subtle">
                  {existingRequest?.application_number
                    ? existingRequest.application_number
                    : (isLoadingNextAppNo ? 'Loading…' : nextAppNo || '—')}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {existingRequest?.application_number
                    ? 'Already assigned'
                    : 'Assigned upon confirmation'}
                </p>
              </div>
            </div>
          ) : null}

          {/* Route stages & fees table removed as boarding stage can be selected from the dropdown above */}
          </>
          ) : null}
        </div>
      ) : displayTab === 'hostel' ? (
        <div className="space-y-5">
          {selectionUiLocked && isFetchingHostelStudent && !hostelStudentDetails?.isAssigned ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-200">
              Loading hostel registration details…
            </div>
          ) : null}
          {hostelStudentDetails && hostelStudentDetails.isAssigned && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/40 dark:bg-blue-950/20">
              <div className="flex items-center justify-between pb-3 border-b border-blue-200/50 dark:border-blue-900/30">
                <h4 className="text-xs font-bold uppercase tracking-wide text-blue-800 dark:text-blue-300">
                  Existing Hostel Registration
                </h4>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-600/10 dark:bg-emerald-950/30 dark:text-emerald-400 dark:ring-emerald-500/20">
                  Active
                </span>
              </div>
              <div className="mt-3 grid gap-x-4 gap-y-2 text-xs text-slate-700 dark:text-slate-300 sm:grid-cols-2 md:grid-cols-4">
                <div>
                  <span className="text-slate-500">Hostel:</span> <strong className="text-slate-900 dark:text-slate-100">{hostelStudentDetails.hostelName || '—'}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Room:</span>{' '}
                  <strong className="text-slate-900 dark:text-slate-100">
                    {hostelStudentDetails.roomNumber
                      ? `Room ${hostelStudentDetails.roomNumber}${hostelStudentDetails.bedNumber ? ` · Bed ${hostelStudentDetails.bedNumber}` : ''}`
                      : 'Pending assignment'}
                  </strong>
                </div>
                {hostelStudentDetails.hostelId && (
                  <div>
                    <span className="text-slate-500">Hostel ID:</span> <strong className="text-slate-900 dark:text-slate-100">{hostelStudentDetails.hostelId}</strong>
                  </div>
                )}
                <div>
                  <span className="text-slate-500">Academic Year:</span> <strong className="text-slate-900 dark:text-slate-100">{effectiveAcademicYear}</strong>
                </div>
                {(hostelStudentDetails as { admitDate?: string }).admitDate ? (
                  <div>
                    <span className="text-slate-500">Admit Date:</span>{' '}
                    <strong className="text-slate-900 dark:text-slate-100">
                      {String((hostelStudentDetails as { admitDate?: string }).admitDate).slice(0, 10)}
                    </strong>
                  </div>
                ) : null}
                <div className="col-span-2 sm:col-span-4 mt-3 flex justify-end">
                  <PrintActionButton
                    label="Print Hostel Admit"
                    disabled={!hostelPrintStudentId}
                    onClick={() => {
                      if (!hostelPrintStudentId) return;
                      void handleExternalPrint(
                        'hostel',
                        { template: 'hostel-admit' },
                        {
                          template: 'hostel-admit',
                          data: {
                            studentId: hostelPrintStudentId,
                            admissionNumber:
                              hostelStudentDetails?.admissionNumber || admissionNumber || '',
                          },
                        },
                        'Hostel Admit Card'
                      );
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {!hostelSelectionLocked ? (
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Hostel
              </label>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                value={value.hostelId || ''}
                disabled={!canEdit || isLoadingHostels || hostelSelectionLocked}
                onChange={(event) => handleHostelChange(event.target.value)}
              >
                <option value="">
                  {isLoadingHostels ? 'Loading hostels…' : 'Select Hostel'}
                </option>
                {hostels.map((hostel) => (
                  <option key={hostel._id} value={hostel._id}>
                    {hostel.name} ({hostel.type === 'boys' ? 'Boys' : hostel.type === 'girls' ? 'Girls' : hostel.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Category
              </label>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                value={value.categoryId || ''}
                disabled={
                  !canEdit ||
                  hostelSelectionLocked ||
                  !value.hostelId ||
                  isLoadingCategories ||
                  categories.length === 0
                }
                onChange={(event) => handleCategoryChange(event.target.value)}
              >
                <option value="">
                  {!value.hostelId
                    ? 'Select hostel first'
                    : isLoadingCategories
                      ? 'Loading categories…'
                      : categories.length === 0
                        ? 'No categories found'
                        : 'Select category'}
                </option>
                {categories.map((category) => (
                  <option key={category._id} value={category._id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Admit date
              </label>
              <input
                type="date"
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                value={value.admitDate || localIsoDate()}
                disabled={!canEdit || hostelSelectionLocked || !value.categoryId}
                onChange={(event) => handleAdmitDateChange(event.target.value)}
              />
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                Defaults to today. Room and joining date are handled later in the hostel portal.
              </p>
            </div>
          </div>
          ) : null}

          {value.categoryId && effectiveAcademicYear && (isLoadingHostelFee || feePayload || hostelFeeError) ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Hostel selection
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {value.hostelName || '—'}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {value.categoryName ? `Category ${value.categoryName}` : 'Pick a category'}
                </p>
                {(value.admitDate || localIsoDate()) ? (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Admit {value.admitDate || localIsoDate()}
                  </p>
                ) : null}
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {hostelStudentDetails?.isAssigned ? 'Hostel ID' : 'Expected Hostel ID'}
                </p>
                <p className="mt-1 text-base font-bold font-mono text-indigo-700 dark:text-indigo-300">
                  {isLoadingHostelStudent
                    ? 'Loading…'
                    : hostelStudentDetails?.hostelId || '—'}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {hostelStudentDetails?.isAssigned
                    ? 'Already assigned'
                    : 'Assigned upon confirmation'}
                </p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Hostel fee
                </p>
                {!hasHostelFeeRows ? (
                  <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">
                    {isLoadingHostelFee
                      ? 'Loading hostel fees for this category…'
                      : `No hostel fee configured for ${effectiveAcademicYear || 'this academic year'} in HMS. Configure fee structures for this session in the hostel portal, then reselect the category here.`}
                  </p>
                ) : (
                  <p className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(displayHostelFeeRow?.amount ?? value.hostelFee)}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {courseName ? `Course: ${courseName}` : 'Course fee match from HMS'}
                  {hasHostelFeeRows
                    ? ` · Year ${displayHostelFeeRow?.studentYear ?? effectiveStudentYear} fee`
                    : ''}
                  {resolvedFeeCourse &&
                  normalizeHostelCourseForCompare(resolvedFeeCourse) ===
                    normalizeHostelCourseForCompare(String(courseName || '')) &&
                  String(resolvedFeeCourse).trim().toLowerCase() !==
                    String(courseName || '')
                      .trim()
                      .toLowerCase()
                    ? ` · Using ${resolvedFeeCourse} hostel fee`
                    : ''}
                  {feeUsedFallback
                    ? ` · Fee from AY ${resolvedFeeAcademicYear} (no ${effectiveAcademicYear} config yet)`
                    : ''}
                  {feeCourseMismatch
                    ? ` · Using ${resolvedFeeCourse} category fee (no ${courseName} config yet)`
                    : ''}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel transport request</DialogTitle>
            <DialogDescription>
              This will mark the transport request as cancelled and set the bus fee row inactive in Fee Management.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Cancellation reason
            </label>
            <textarea
              className="min-h-[96px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Enter reason for cancelling this transport request"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCancelDialogOpen(false)}
              disabled={cancelTransportMutation.isPending}
            >
              Close
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={!cancelReason.trim() || cancelTransportMutation.isPending}
              onClick={() => cancelTransportMutation.mutate()}
            >
              {cancelTransportMutation.isPending ? 'Cancelling…' : 'Confirm cancellation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
