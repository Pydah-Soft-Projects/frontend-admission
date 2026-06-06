'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hostelAPI, transportAPI } from '@/lib/api';
import { normalizeHostelFeesByYear } from '@/lib/joiningBusFeeSync';
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

type AccommodationTab = 'bus' | 'hostel';
type HostelType = 'boys' | 'girls';

type AdmissionStepThreeBusHostelPanelProps = {
  value: JoiningTransportDetails;
  onChange?: (next: JoiningTransportDetails) => void;
  disabled?: boolean;
  className?: string;
  courseName?: string | null;
  programTotalYears?: number;
};

const emptyTransportDetails = (): JoiningTransportDetails => ({
  accommodationType: 'bus',
});

export function parseJoiningTransportDetails(raw: unknown): JoiningTransportDetails {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyTransportDetails();
  }
  const source = raw as Record<string, unknown>;
  const accommodationType = source.accommodationType === 'hostel' ? 'hostel' : 'bus';
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
    academicYear: source.academicYear != null ? String(source.academicYear) : undefined,
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
}: AdmissionStepThreeBusHostelPanelProps) {
  const canEdit = Boolean(onChange) && !disabled;
  const [activeTab, setActiveTab] = useState<AccommodationTab>(value.accommodationType || 'bus');

  useEffect(() => {
    setActiveTab(value.accommodationType || 'bus');
  }, [value.accommodationType]);

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

  const { data: academicYearsResponse, isLoading: isLoadingAcademicYears } = useQuery({
    queryKey: ['hostel', 'academic-years'],
    queryFn: async () => hostelAPI.listAcademicYears(),
    staleTime: 120_000,
  });

  const { data: hostelsResponse, isLoading: isLoadingHostels } = useQuery({
    queryKey: ['hostel', 'hostels'],
    queryFn: async () => hostelAPI.listHostels(),
    staleTime: 120_000,
  });

  const academicYears = useMemo(
    () => unwrapList<string>(academicYearsResponse),
    [academicYearsResponse]
  );
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
      value.academicYear,
      courseName,
      programTotalYears,
    ],
    queryFn: async () =>
      hostelAPI.listRooms({
        hostelId: value.hostelId as string,
        categoryId: value.categoryId as string,
        academicYear: value.academicYear,
        course: courseName || undefined,
        totalYears: programTotalYears,
      }),
    enabled:
      activeTab === 'hostel' &&
      Boolean(value.hostelId) &&
      Boolean(value.categoryId) &&
      Boolean(value.academicYear),
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
  });

  const clearHostelFields = (): Partial<JoiningTransportDetails> => ({
    academicYear: undefined,
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
    onChange({
      ...value,
      accommodationType: tab,
      ...(tab === 'bus' ? clearHostelFields() : clearBusFields()),
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

  const handleAcademicYearChange = (academicYear: string) => {
    patchValue({
      academicYear: academicYear || undefined,
      categoryId: undefined,
      categoryName: undefined,
      roomId: undefined,
      roomNumber: undefined,
      hostelFee: null,
      hostelFeesByYear: undefined,
    });
  };

  const handleHostelTypeChange = (hostelType: HostelType | '') => {
    const matchingHostels = hostelType
      ? hostels.filter((hostel) => hostel.type === hostelType)
      : [];
    const selectedHostel = matchingHostels[0];
    patchValue({
      hostelType: hostelType || undefined,
      hostelId: selectedHostel?._id,
      hostelName: selectedHostel?.name,
      categoryId: undefined,
      categoryName: undefined,
      roomId: undefined,
      roomNumber: undefined,
      hostelFee: null,
      hostelFeesByYear: undefined,
    });
  };

  const handleCategoryChange = (categoryId: string) => {
    const selected = categories.find((category) => category._id === categoryId);
    patchValue({
      categoryId: categoryId || undefined,
      categoryName: selected?.name || undefined,
      roomId: undefined,
      roomNumber: undefined,
      hostelFee: null,
      hostelFeesByYear: undefined,
    });
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
  const resolvedFeeAcademicYear = roomsPayload?.resolvedAcademicYear || value.academicYear;
  const feeUsedFallback =
    roomsPayload?.feeMatchedBy === 'fallback' &&
    resolvedFeeAcademicYear &&
    value.academicYear &&
    resolvedFeeAcademicYear !== value.academicYear;
  const resolvedFeeCourse = roomsPayload?.yearlyFees?.[0]?.course || roomsPayload?.fee?.course || '';
  const feeCourseMismatch =
    Boolean(courseName) &&
    Boolean(resolvedFeeCourse) &&
    resolvedFeeCourse.toLowerCase() !== courseName.toLowerCase();

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
          Choose bus transport or hostel accommodation from the linked databases. The selected{' '}
          <span className="font-semibold">Bus Fee</span> or{' '}
          <span className="font-semibold">Hostel Fee</span> is added automatically to Step 4 for
          every program year.
        </p>
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900/80">
        {(['bus', 'hostel'] as AccommodationTab[]).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              disabled={!canEdit && !isActive}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-semibold capitalize transition',
                isActive
                  ? 'bg-[#ea580c] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
              )}
              onClick={() => handleTabChange(tab)}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {activeTab === 'bus' ? (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white/90 p-5 dark:border-slate-700 dark:bg-slate-900/80">
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
                  Assigned buses
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {buses.length > 0
                    ? buses.map((bus) => bus.busNumber).filter(Boolean).join(', ')
                    : 'No buses assigned'}
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
      ) : (
        <div className="space-y-5 rounded-xl border border-slate-200 bg-white/90 p-5 dark:border-slate-700 dark:bg-slate-900/80">
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Academic year
              </label>
              <select
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                value={value.academicYear || ''}
                disabled={!canEdit || isLoadingAcademicYears}
                onChange={(event) => handleAcademicYearChange(event.target.value)}
              >
                <option value="">
                  {isLoadingAcademicYears ? 'Loading academic years…' : 'Select academic year'}
                </option>
                {academicYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

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
                  !value.academicYear ||
                  isLoadingRooms ||
                  rooms.length === 0
                }
                onChange={(event) => handleRoomChange(event.target.value)}
              >
                <option value="">
                  {!value.categoryId
                    ? 'Select category first'
                    : !value.academicYear
                      ? 'Select academic year first'
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

          {value.categoryId && roomsPayload ? (
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
                    No hostel fee configured for this hostel, category, and academic year in HMS.
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
                    ? ` · Fee from AY ${resolvedFeeAcademicYear} (no ${value.academicYear} config yet)`
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
                  {roomsPayload.availableCount} of {roomsPayload.total} rooms have free beds
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  {value.roomNumber ? `Selected room ${value.roomNumber}` : 'Select a room'}
                </p>
              </div>
            </div>
          ) : null}

          {value.categoryId && rooms.length > 0 ? (
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
      )}
    </section>
  );
}
