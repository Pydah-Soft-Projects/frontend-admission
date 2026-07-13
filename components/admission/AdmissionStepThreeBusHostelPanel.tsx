'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hostelAPI, transportAPI } from '@/lib/api';
import {
  joiningTransportDetailsCompletenessScore,
  hasValidHostelFeeAmount,
  normalizeHostelFeesByYear,
  resolveHostelFeeRowForYear,
} from '@/lib/joiningBusFeeSync';
import { calendarYearToAcademicYearRange } from '@/lib/joiningAcademicYearRegistration';
import { cn } from '@/lib/utils';
import { handleExternalPrint } from '@/lib/printHtml';
import type {
  HostelCategorySummary,
  HostelRoomSummary,
  HostelRoomsPayload,
  HostelSummary,
  JoiningTransportDetails,
  TransportRouteDetail,
  TransportRouteSummary,
} from '@/types';

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

type AccommodationTab = 'bus' | 'hostel' | 'none';
type HostelType = 'boys' | 'girls';

type AdmissionStepThreeBusHostelPanelProps = {
  value: JoiningTransportDetails;
  onChange?: (next: JoiningTransportDetails) => void;
  disabled?: boolean;
  className?: string;
  courseName?: string | null;
  programTotalYears?: number;
  /** Program year for hostel fee display (1 = first year, 2 = lateral, etc.). */
  studentYearOfStudy?: number;
  /** Step 1 intake calendar year (e.g. 2026) from registrationFormData. */
  joiningAcademicYear?: string | null;
  collegeId?: number | null;
  managedCourseId?: number | null;
  collegeName?: string | null;
  admissionNumber?: string | null;
  joiningId?: string | null;
  /** Hide bus/hostel pickers after accommodation is saved / awaiting fee approval. */
  selectionUiLocked?: boolean;
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
  onExistingRequestChange,
}: AdmissionStepThreeBusHostelPanelProps & {
  onExistingRequestChange?: (hasExisting: boolean) => void;
}) {
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
  const [activeTab, setActiveTab] = useState<AccommodationTab>(selectedTab || 'bus');
  const tabAutoInitializedRef = useRef(false);

  useEffect(() => {
    if (selectedTab) {
      setActiveTab(selectedTab);
    }
  }, [selectedTab]);

  const displayTab: AccommodationTab = selectedTab ?? activeTab;

  const joiningAcademicYearSession = useMemo(
    () => calendarYearToAcademicYearRange(joiningAcademicYear),
    [joiningAcademicYear]
  );

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

  const existingRequest = existingRequestResponse?.data || null;

  const {
    data: hostelStudentResponse,
    isLoading: isLoadingHostelStudent,
    isFetched: hostelStudentFetched,
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

    let inferredTab: AccommodationTab = 'bus';
    if (hostelStudentDetails?.isAssigned) {
      inferredTab = 'hostel';
    } else if (existingRequest) {
      inferredTab = 'bus';
    } else if (value.accommodationType === 'none') {
      inferredTab = 'none';
    }

    setActiveTab(inferredTab);

    if (canEdit && onChange && !value.accommodationType && inferredTab !== 'none') {
      onChange({
        ...value,
        accommodationType: inferredTab,
        ...(effectiveAcademicYear ? { academicYear: effectiveAcademicYear } : {}),
      });
    }
  }, [
    admissionNumber,
    canEdit,
    effectiveAcademicYear,
    existingRequest,
    hostelStudentDetails?.isAssigned,
    hostelStudentFetched,
    joiningId,
    onChange,
    selectedTab,
    transportRequestFetched,
    value,
  ]);

  useEffect(() => {
    onExistingRequestChange?.(Boolean(existingRequest));
  }, [existingRequest, onExistingRequestChange]);

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

  const { data: roomsResponse, isLoading: isLoadingRooms, isError: roomsError } = useQuery({
    queryKey: [
      'hostel',
      'rooms',
      value.hostelId,
      value.categoryId,
      effectiveAcademicYear,
      courseName,
      programTotalYears,
    ],
    queryFn: async () =>
      hostelAPI.listRooms({
        hostelId: value.hostelId as string,
        categoryId: value.categoryId as string,
        academicYear: effectiveAcademicYear,
        course: courseName || undefined,
        totalYears: programTotalYears,
      }),
    enabled:
      displayTab === 'hostel' &&
      Boolean(value.hostelId) &&
      Boolean(value.categoryId) &&
      Boolean(effectiveAcademicYear),
    staleTime: 60_000,
  });

  const roomsPayload = useMemo(
    () => unwrapData<HostelRoomsPayload>(roomsResponse),
    [roomsResponse]
  );
  const rooms = roomsPayload?.rooms || [];
  const resolvedHostelFeesByYear = useMemo(
    () => normalizeHostelFeesByYear(roomsPayload?.yearlyFees),
    [roomsPayload?.yearlyFees]
  );
  const effectiveStudentYear = Math.max(1, Math.min(studentYearOfStudy, programTotalYears));
  const currentYearHostelFee = useMemo(
    () => resolveHostelFeeRowForYear(resolvedHostelFeesByYear, effectiveStudentYear),
    [resolvedHostelFeesByYear, effectiveStudentYear]
  );

  useEffect(() => {
    if (!canEdit || !onChange || displayTab !== 'hostel') return;
    if (!value.categoryId || !currentYearHostelFee) return;
    if (!value.roomId && !value.roomNumber) return;

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
    value.roomId,
    value.roomNumber,
    value.hostelFee,
    value.hostelFeesByYear,
    value,
  ]);

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
    hostelFee: null,
    hostelFeesByYear: undefined,
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
        : withHostelAcademicYear(clearBusFields())),
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
        hostelFee: null,
        hostelFeesByYear: undefined,
      })
    );
  };

  const handleRoomChange = (roomId: string) => {
    const selected = rooms.find((room) => room._id === roomId);
    patchValue({
      roomId: roomId || undefined,
      roomNumber: selected?.roomNumber || undefined,
    });
  };

  const stages = routeDetail?.stages || [];
  const buses = routeDetail?.buses || [];
  const selectedBusNumber = String(value.busId || value.busNumber || '').trim();

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
  const hasExternalBusApplication = Boolean(existingRequest);
  const hasExternalHostelApplication = Boolean(hostelStudentDetails?.isAssigned);
  const busSelectionLocked = hasExternalBusApplication || selectionUiLocked;
  const hostelSelectionLocked = hasExternalHostelApplication || selectionUiLocked;

  const visibleAccommodationTabs = useMemo(() => {
    if (hasExternalBusApplication && hasExternalHostelApplication) {
      return ['bus', 'hostel'] as AccommodationTab[];
    }
    if (hasExternalBusApplication) return ['bus', 'hostel'] as AccommodationTab[];
    if (hasExternalHostelApplication) return ['hostel'] as AccommodationTab[];
    return ['bus', 'hostel', 'none'] as AccommodationTab[];
  }, [
    hasExternalBusApplication,
    hasExternalHostelApplication,
  ]);
  const resolvedFeeAcademicYear = roomsPayload?.resolvedAcademicYear || effectiveAcademicYear;
  const feeUsedFallback =
    roomsPayload?.feeMatchedBy === 'fallback' &&
    resolvedFeeAcademicYear &&
    effectiveAcademicYear &&
    resolvedFeeAcademicYear !== effectiveAcademicYear;
  const resolvedFeeCourse = roomsPayload?.yearlyFees?.[0]?.course || roomsPayload?.fee?.course || '';
  const feeCourseMismatch =
    Boolean(courseName && resolvedFeeCourse) &&
    resolvedFeeCourse.toLowerCase() !== String(courseName).toLowerCase();

  return (
    <section
      className={cn(
        'scroll-mt-24 space-y-6 rounded-2xl border-2 border-amber-200/80 bg-gradient-to-b from-amber-50/40 to-white/95 p-6 shadow-lg shadow-amber-100/30 backdrop-blur dark:border-amber-900/50 dark:from-amber-950/20 dark:to-slate-900/70 dark:shadow-none',
        className
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
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

        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900/80">
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
          {existingRequest && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/50 dark:bg-blue-950/20 text-slate-800 dark:text-slate-200">
              <h4 className="font-semibold text-blue-800 dark:text-blue-200 text-sm">
                Active Transport Request Found (AY: {existingRequest.academic_year})
              </h4>
              <p className="mt-1 text-xs">
                This student already has a registered request in the transport system:
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 font-medium text-xs sm:grid-cols-4">
                <div>
                  <span className="text-slate-500">Route:</span> {existingRequest.route_name || '—'}
                </div>
                <div>
                  <span className="text-slate-500">Stage:</span> {existingRequest.stage_name || '—'}
                </div>
                <div>
                  <span className="text-slate-500">Fare:</span> {formatCurrency(existingRequest.fare)}
                </div>
                <div>
                  <span className="text-slate-500">Bus Number:</span> {existingRequest.bus_id || 'Not assigned'}
                </div>
                <div>
                  <span className="text-slate-500">Status:</span>{' '}
                  <span className={cn(
                    'font-bold capitalize',
                    existingRequest.status === 'approved' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                  )}>
                    {existingRequest.status}
                  </span>
                </div>
                {existingRequest.application_number && (
                  <div>
                    <span className="text-slate-500">Application ID:</span> {existingRequest.application_number}
                  </div>
                )}
                <div className="col-span-2 sm:col-span-4 mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      void handleExternalPrint('transport', {
                        template: 'transport-admit',
                        admissionNumber: admissionNumber || '',
                        academicYear: existingRequest.academic_year || ''
                      }, undefined, 'Transport Admit Card');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print Transport Admit
                  </button>
                </div>
              </div>
            </div>
          )}


          {!busSelectionLocked ? (
          <>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Bus route
              </label>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                value={selectedRouteId}
                disabled={!canEdit || isLoadingRoutes || busSelectionLocked}
                onChange={(event) => handleRouteChange(event.target.value)}
              >
                <option value="">
                  {isLoadingRoutes ? 'Loading routes…' : 'Select a bus route'}
                </option>
                {routes.map((route) => (
                  <option key={route.routeId} value={route.routeId}>
                    {route.routeName} ({route.routeId})
                  </option>
                ))}
              </select>
              {routesError ? (
                <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">
                  Could not load bus routes from the Transport database.
                </p>
              ) : null}
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Boarding stage
              </label>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                value={value.stageId || ''}
                disabled={!canEdit || !selectedRouteId || isLoadingRouteDetail || stages.length === 0 || busSelectionLocked}
                onChange={(event) => handleStageChange(event.target.value)}
              >
                <option value="">
                  {!selectedRouteId
                    ? 'Select a route first'
                    : isLoadingRouteDetail
                      ? 'Loading stages…'
                      : stages.length === 0
                        ? 'No stages on this route'
                        : 'Select boarding stage'}
                </option>
                {stages.map((stage) => (
                  <option key={stage._id} value={stage._id}>
                    {stage.stageName}
                  </option>
                ))}
              </select>
              {routeDetailError ? (
                <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">
                  Could not load route stages from the Transport database.
                </p>
              ) : null}
            </div>
          </div>

          {selectedRouteId && routeDetail ? (
            <div className="grid gap-4 md:grid-cols-4">
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
                  <span className="text-slate-500">Room &amp; Bed:</span> <strong className="text-slate-900 dark:text-slate-100">Room {hostelStudentDetails.roomNumber || '—'} · Bed {hostelStudentDetails.bedNumber || '—'}</strong>
                </div>
                {hostelStudentDetails.hostelId && (
                  <div>
                    <span className="text-slate-500">Hostel ID:</span> <strong className="text-slate-900 dark:text-slate-100">{hostelStudentDetails.hostelId}</strong>
                  </div>
                )}
                <div>
                  <span className="text-slate-500">Academic Year:</span> <strong className="text-slate-900 dark:text-slate-100">{effectiveAcademicYear}</strong>
                </div>
                <div className="col-span-2 sm:col-span-4 mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (hostelStudentDetails && (hostelStudentDetails as any)._id) {
                        void handleExternalPrint(
                          'hostel',
                          { template: 'hostel-admit' },
                          { template: 'hostel-admit', data: { studentId: (hostelStudentDetails as any)._id } },
                          'Hostel Admit Card'
                        );
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                    Print Hostel Admit
                  </button>
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
                Available room
              </label>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                value={value.roomId || ''}
                disabled={
                  !canEdit ||
                  hostelSelectionLocked ||
                  !value.categoryId ||
                  !effectiveAcademicYear ||
                  isLoadingRooms ||
                  rooms.length === 0
                }
                onChange={(event) => handleRoomChange(event.target.value)}
              >
                <option value="">
                  {!value.categoryId
                    ? 'Select category first'
                    : !effectiveAcademicYear
                      ? 'Academic year not set from Step 1'
                      : isLoadingRooms
                        ? 'Loading rooms…'
                        : rooms.length === 0
                          ? 'No rooms in this category'
                          : 'Select room'}
                </option>
                {rooms.map((room) => {
                  const filledBeds = Math.max(
                    0,
                    room.totalOccupancy ??
                      room.occupiedBeds ??
                      Math.max(0, room.bedCount - room.availableBeds)
                  );
                  return (
                  <option key={room._id} value={room._id} disabled={!room.isAvailable}>
                    Room {room.roomNumber} · {filledBeds}/{room.bedCount} filled
                  </option>
                  );
                })}
              </select>
              {roomsError ? (
                <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">
                  Could not load rooms from the Hostel database.
                </p>
              ) : null}
            </div>
          </div>
          ) : null}

          {value.categoryId && effectiveAcademicYear && (isLoadingRooms || roomsPayload) ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                    {isLoadingRooms
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
                  {feeUsedFallback
                    ? ` · Fee from AY ${resolvedFeeAcademicYear} (no ${effectiveAcademicYear} config yet)`
                    : ''}
                  {feeCourseMismatch
                    ? ` · Using ${resolvedFeeCourse} category fee (no ${courseName} config yet)`
                    : ''}
                </p>
              </div>

              <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Room availability
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {isLoadingRooms
                    ? 'Loading…'
                    : `${roomsPayload?.availableCount ?? 0} of ${roomsPayload?.total ?? 0} rooms have free beds`}
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {effectiveAcademicYear
                    ? `Counts for academic year ${effectiveAcademicYear} from HMS occupancy history`
                    : 'Academic year required for availability'}
                  {value.roomNumber ? ` · Selected room ${value.roomNumber}` : ''}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
