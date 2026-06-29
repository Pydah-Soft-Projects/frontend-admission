'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hostelAPI, transportAPI } from '@/lib/api';
import {
  isAccommodationChoiceLocked,
  joiningTransportDetailsCompletenessScore,
  normalizeHostelFeesByYear,
} from '@/lib/joiningBusFeeSync';
import { calendarYearToAcademicYearRange } from '@/lib/joiningAcademicYearRegistration';
import { cn } from '@/lib/utils';
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
  /** Step 1 intake calendar year (e.g. 2026) from registrationFormData. */
  joiningAcademicYear?: string | null;
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
  joiningAcademicYear,
}: AdmissionStepThreeBusHostelPanelProps) {
  const canEdit = Boolean(onChange) && !disabled;
  const choiceLocked = isAccommodationChoiceLocked(value);
  const selectedTab: AccommodationTab | null =
    value.accommodationType === 'hostel'
      ? 'hostel'
      : value.accommodationType === 'bus'
        ? 'bus'
        : value.accommodationType === 'none'
          ? 'none'
          : null;
  const [activeTab, setActiveTab] = useState<AccommodationTab>(selectedTab || 'bus');

  useEffect(() => {
    if (selectedTab) {
      setActiveTab(selectedTab);
    }
  }, [selectedTab]);

  const joiningAcademicYearSession = useMemo(
    () => calendarYearToAcademicYearRange(joiningAcademicYear),
    [joiningAcademicYear]
  );

  const effectiveAcademicYear = joiningAcademicYearSession || value.academicYear || '';

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
    enabled: activeTab === 'bus' && Boolean(selectedRouteId),
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

  const filteredHostels = useMemo(() => {
    if (!value.hostelType) return hostels;
    return hostels.filter((hostel) => hostel.type === value.hostelType);
  }, [hostels, value.hostelType]);

  const { data: categoriesResponse, isLoading: isLoadingCategories } = useQuery({
    queryKey: ['hostel', 'categories', value.hostelId],
    queryFn: async () => hostelAPI.listCategories(value.hostelId as string),
    enabled: activeTab === 'hostel' && Boolean(value.hostelId),
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
      activeTab === 'hostel' &&
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

  useEffect(() => {
    if (!canEdit || !onChange || activeTab !== 'hostel') return;
    if (!value.categoryId || resolvedHostelFeesByYear.length === 0) return;

    const nextFirstFee = resolvedHostelFeesByYear[0]?.amount ?? null;
    const currentFeesJson = JSON.stringify(value.hostelFeesByYear || []);
    const nextFeesJson = JSON.stringify(resolvedHostelFeesByYear);
    if (nextFeesJson === currentFeesJson && nextFirstFee === value.hostelFee) return;

    onChange({
      ...value,
      hostelFeesByYear: resolvedHostelFeesByYear,
      hostelFee: nextFirstFee,
    });
  }, [
    activeTab,
    canEdit,
    onChange,
    resolvedHostelFeesByYear,
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
    if (choiceLocked && selectedTab && tab !== selectedTab) return;
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

  const handleHostelTypeChange = (hostelType: HostelType | '') => {
    const matchingHostels = hostelType
      ? hostels.filter((hostel) => hostel.type === hostelType)
      : [];
    const selectedHostel = matchingHostels[0];
    patchValue(
      withHostelAcademicYear({
        hostelType: hostelType || undefined,
        hostelId: selectedHostel?._id,
        hostelName: selectedHostel?.name,
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
    if (!canEdit || !onChange || activeTab !== 'bus') return;
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
    activeTab,
    buses,
    canEdit,
    onChange,
    selectedBusNumber,
    selectedRouteId,
    value,
  ]);
  const displayHostelFees =
    resolvedHostelFeesByYear.length > 0
      ? resolvedHostelFeesByYear
      : value.hostelFeesByYear || [];
  const hasHostelFeeRows = displayHostelFees.some(
    (row) => row.amount != null && !Number.isNaN(Number(row.amount))
  );
  const hasVariableHostelFees =
    displayHostelFees.length > 1 &&
    new Set(displayHostelFees.map((row) => row.amount)).size > 1;
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
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
          Step 3 — Bus &amp; hostel
        </p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
          Accommodation selection
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          Choose exactly one: bus transport, hostel accommodation, or none. Once a bus or hostel fee
          is decided—or you select <span className="font-semibold">None</span>—that choice is final
          and other options are hidden. The selected <span className="font-semibold">Bus Fee</span> or{' '}
          <span className="font-semibold">Hostel Fee</span> is added automatically to Step 4 for every
          program year.
        </p>
      </div>

      {choiceLocked ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          Accommodation choice is final
          {selectedTab === 'none'
            ? ': no bus or hostel fees will be added in Step 4.'
            : selectedTab === 'bus'
              ? ': bus fee will be added in Step 4.'
              : ': hostel fee will be added in Step 4.'}
        </div>
      ) : (
        <p className="rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          Pick <span className="font-semibold">Bus</span> (route and stage),{' '}
          <span className="font-semibold">Hostel</span> (category with configured fee), or{' '}
          <span className="font-semibold">None</span> to continue to Step 4. You can switch options
          until one is decided.
        </p>
      )}

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900/80">
        {(['bus', 'hostel', 'none'] as AccommodationTab[]).map((tab) => {
          const isActive = (selectedTab || activeTab) === tab;
          const tabLocked = choiceLocked && selectedTab != null && tab !== selectedTab;
          if (tabLocked) return null;
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

      {!selectedTab && canEdit ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Select Bus, Hostel, or None above to configure accommodation.
        </p>
      ) : null}

      {selectedTab === 'none' ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white/90 p-5 dark:border-slate-700 dark:bg-slate-900/80">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            No bus or hostel
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This student will not use college bus transport or hostel accommodation. No transport or
            hostel fee rows are added in Step 4.
          </p>
        </div>
      ) : selectedTab === 'bus' ? (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white/90 p-5 dark:border-slate-700 dark:bg-slate-900/80">
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Academic year
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {joiningAcademicYearSession || '—'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Session {joiningAcademicYearSession || '—'} from Step 1 intake year
              {joiningAcademicYear ? ` (${joiningAcademicYear})` : ''}. This is not the fee batch
              year — it is used for bus passenger requests and transport application numbers
              (COLLEGE-COURSE-0001, e.g. PCE-BTECH-0001, per session and course). Fee catalog on
              Step 4 uses the intake year (
              {joiningAcademicYear || 'Step 1'}) as batch.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Bus route
              </label>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                value={selectedRouteId}
                disabled={!canEdit || isLoadingRoutes}
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
                disabled={!canEdit || !selectedRouteId || isLoadingRouteDetail || stages.length === 0}
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
            <div className="grid gap-4 md:grid-cols-3">
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
                    disabled={!canEdit}
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
            </div>
          ) : null}

          {selectedRouteId && routeDetail && stages.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Route stages &amp; fees
              </h3>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-800/60">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Stage
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Fee
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900/50">
                    {stages.map((stage) => {
                      const isSelected = value.stageId === stage._id;
                      return (
                        <tr
                          key={stage._id}
                          className={cn(
                            isSelected && 'bg-amber-50/80 dark:bg-amber-950/20',
                            canEdit && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          )}
                          onClick={() => canEdit && handleStageChange(stage._id)}
                        >
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                            {stage.stageName}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-emerald-700 dark:text-emerald-300">
                            {formatCurrency(stage.fare)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : selectedTab === 'hostel' ? (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white/90 p-5 dark:border-slate-700 dark:bg-slate-900/80">
          <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/40">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Academic year
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {joiningAcademicYearSession || value.academicYear || '—'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Session {joiningAcademicYearSession || value.academicYear || '—'} from Step 1 intake year
              {joiningAcademicYear ? ` (${joiningAcademicYear})` : ''}. Used for hostel room availability
              and fee lookup in HMS.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Hostel type
              </label>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                value={value.hostelType || ''}
                disabled={!canEdit || isLoadingHostels}
                onChange={(event) =>
                  handleHostelTypeChange(event.target.value as HostelType | '')
                }
              >
                <option value="">Select boys or girls hostel</option>
                <option value="boys">Boys Hostel</option>
                <option value="girls">Girls Hostel</option>
              </select>
              {value.hostelName ? (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  Linked hostel: {value.hostelName}
                </p>
              ) : null}
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
                  !value.hostelId ||
                  isLoadingCategories ||
                  categories.length === 0
                }
                onChange={(event) => handleCategoryChange(event.target.value)}
              >
                <option value="">
                  {!value.hostelId
                    ? 'Select hostel type first'
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
                {rooms.map((room) => (
                  <option key={room._id} value={room._id} disabled={!room.isAvailable}>
                    Room {room.roomNumber} · {room.availableBeds}/{room.bedCount} beds free
                  </option>
                ))}
              </select>
              {roomsError ? (
                <p className="mt-2 text-sm text-rose-600 dark:text-rose-300">
                  Could not load rooms from the Hostel database.
                </p>
              ) : null}
            </div>
          </div>

          {value.categoryId && effectiveAcademicYear && (isLoadingRooms || roomsPayload) ? (
            <div className="grid gap-4 md:grid-cols-3">
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
                  Hostel fee
                </p>
                {!hasHostelFeeRows ? (
                  <p className="mt-1 text-sm font-medium text-amber-700 dark:text-amber-300">
                    {isLoadingRooms
                      ? 'Loading hostel fees for this category…'
                      : `No hostel fee configured for ${effectiveAcademicYear || 'this academic year'} in HMS. Configure fee structures for this session in the hostel portal, then reselect the category here.`}
                  </p>
                ) : hasVariableHostelFees || displayHostelFees.length > 1 ? (
                  <div className="mt-2 space-y-1">
                    {displayHostelFees.map((row) => (
                      <div
                        key={row.studentYear}
                        className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200"
                      >
                        <span>Year {row.studentYear}</span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                          {formatCurrency(row.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(displayHostelFees[0]?.amount ?? value.hostelFee)}
                  </p>
                )}
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {courseName ? `Course: ${courseName}` : 'Course fee match from HMS'}
                  {displayHostelFees.length > 0
                    ? ` · ${displayHostelFees.length} program year${displayHostelFees.length === 1 ? '' : 's'}`
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

          {value.categoryId && effectiveAcademicYear && !isLoadingRooms && rooms.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Rooms in category {value.categoryName || ''}
              </h3>
              <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700">
                  <thead className="bg-slate-50 dark:bg-slate-800/60">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Room
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Beds
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Occupied
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Available
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900/50">
                    {rooms.map((room: HostelRoomSummary) => {
                      const isSelected = value.roomId === room._id;
                      return (
                        <tr
                          key={room._id}
                          className={cn(
                            isSelected && 'bg-amber-50/80 dark:bg-amber-950/20',
                            canEdit &&
                              room.isAvailable &&
                              'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40',
                            !room.isAvailable && 'opacity-60'
                          )}
                          onClick={() => canEdit && room.isAvailable && handleRoomChange(room._id)}
                        >
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                            {room.roomNumber}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            {room.bedCount}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            {room.totalOccupancy ?? room.occupiedBeds}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                            {room.availableBeds} free
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
