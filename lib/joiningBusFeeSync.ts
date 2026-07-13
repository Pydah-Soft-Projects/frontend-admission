import type {
  FeeStructure,
  JoiningStudentFeeDetails,
  JoiningStudentFeeLineOverride,
  JoiningTransportDetails,
} from '@/types';

export const BUS_FEE_STRUCTURE_ID_PREFIX = 'joining-bus-fee-year-';
export const HOSTEL_FEE_STRUCTURE_ID_PREFIX = 'joining-hostel-fee-year-';
export const BUS_FEE_HEAD = {
  id: '6996e24c2e1678e39883918a',
  name: 'Bus Fee',
  code: 'TRN01',
  description: 'Bus / transport fee linked from the Transport database route stage.',
} as const;

/** Fee Management `feeheads` row for hostel (HST01). */
export const HOSTEL_FEE_HEAD = {
  id: '6996e24d2e1678e398839196',
  name: 'Hostel Fee',
  code: 'HST01',
  description: 'Hostel accommodation fee linked from the Hostel database.',
} as const;

export function isBusFeeStructureId(structureId: string | undefined | null): boolean {
  return String(structureId || '').startsWith(BUS_FEE_STRUCTURE_ID_PREFIX);
}

export function isHostelFeeStructureId(structureId: string | undefined | null): boolean {
  return String(structureId || '').startsWith(HOSTEL_FEE_STRUCTURE_ID_PREFIX);
}

export function isSyntheticAccommodationFeeStructureId(structureId: string | undefined | null): boolean {
  return isBusFeeStructureId(structureId) || isHostelFeeStructureId(structureId);
}

export function busFeeStructureIdForYear(studentYear: number): string {
  return `${BUS_FEE_STRUCTURE_ID_PREFIX}${studentYear}`;
}

export function hostelFeeStructureIdForYear(studentYear: number): string {
  return `${HOSTEL_FEE_STRUCTURE_ID_PREFIX}${studentYear}`;
}

const mapQuotaToCategory = (quota?: string | null): string => {
  if (!quota) return '';
  const key = quota.trim().toLowerCase();
  if (!key) return '';
  if (key.includes('lateral') && key.includes('entry')) return 'LATER';
  if (key === 'lateral spot' || (key.includes('lateral') && key.includes('spot'))) return 'LSPOT';
  if (key.includes('conv')) return 'CONV';
  if (key.includes('mang') || key.includes('management')) return 'MANG';
  if (key.includes('spot')) return 'SPOT';
  return quota.toUpperCase();
};

export function buildBusFeeRemarks(transport: JoiningTransportDetails): string {
  return [
    transport.busNumber || transport.busId
      ? `Bus: ${transport.busNumber || transport.busId}`
      : '',
    transport.routeName ? `Route: ${transport.routeName}` : '',
    transport.stageName ? `Stage: ${transport.stageName}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function buildHostelFeeRemarks(transport: JoiningTransportDetails): string {
  return [
    transport.academicYear ? `AY: ${transport.academicYear}` : '',
    transport.hostelName ? `Hostel: ${transport.hostelName}` : '',
    transport.categoryName ? `Category: ${transport.categoryName}` : '',
    transport.roomNumber ? `Room: ${transport.roomNumber}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function normalizeHostelFeesByYear(
  yearlyFees: Array<{ studentYear?: number | null; amount?: number | null }> | undefined | null
): Array<{ studentYear: number; amount: number | null }> {
  if (!yearlyFees?.length) return [];
  return yearlyFees
    .map((row) => ({
      studentYear: Number(row.studentYear),
      amount:
        row.amount === undefined || row.amount === null || Number.isNaN(Number(row.amount))
          ? null
          : Number(row.amount),
    }))
    .filter((row) => Number.isFinite(row.studentYear) && row.studentYear > 0);
}

export function resolveHostelFeeRowForYear(
  fees: Array<{ studentYear: number; amount: number | null }>,
  studentYear: number
): { studentYear: number; amount: number | null } | null {
  if (!fees.length) return null;
  const targetYear = Math.max(1, Math.trunc(studentYear) || 1);
  const exact = fees.find((row) => row.studentYear === targetYear);
  if (exact) return exact;
  const sorted = [...fees].sort((a, b) => a.studentYear - b.studentYear);
  return sorted.find((row) => row.studentYear >= targetYear) ?? sorted[sorted.length - 1] ?? null;
}

export function getHostelFeeAmountForYear(
  transport: JoiningTransportDetails,
  studentYear: number
): number | null {
  const byYear = transport.hostelFeesByYear;
  if (byYear?.length) {
    const row = byYear.find((fee) => fee.studentYear === studentYear);
    if (row && row.amount != null && Number.isFinite(Number(row.amount))) {
      return Number(row.amount);
    }
  }
  if (transport.hostelFee != null && Number.isFinite(Number(transport.hostelFee))) {
    return Number(transport.hostelFee);
  }
  return null;
}

export function hasValidHostelFeeAmount(amount: number | null | undefined): amount is number {
  return amount != null && Number.isFinite(Number(amount)) && Number(amount) >= 0;
}

export function shouldApplyBusFee(transport: JoiningTransportDetails): boolean {
  return (
    transport.accommodationType === 'bus' &&
    Boolean(transport.academicYear) &&
    Boolean(transport.routeId) &&
    Boolean(transport.stageId) &&
    transport.stageFare != null &&
    Number.isFinite(Number(transport.stageFare)) &&
    Number(transport.stageFare) >= 0
  );
}

export function shouldApplyHostelFee(transport: JoiningTransportDetails): boolean {
  if (transport.accommodationType !== 'hostel') return false;
  if (!transport.academicYear || !transport.hostelId || !transport.categoryId) return false;
  if (!transport.roomId && !transport.roomNumber) return false;

  const byYear = transport.hostelFeesByYear;
  if (byYear?.length) {
    return byYear.some((row) => hasValidHostelFeeAmount(row.amount));
  }

  return hasValidHostelFeeAmount(transport.hostelFee);
}

/** True once bus fee, hostel fee, or explicit "none" is decided — other options must stay hidden. */
export function isAccommodationChoiceLocked(transport: JoiningTransportDetails): boolean {
  if (transport.accommodationType === 'none') return true;
  if (shouldApplyBusFee(transport)) return true;
  if (shouldApplyHostelFee(transport)) return true;
  return false;
}

/** Step 3 can advance when accommodation is explicitly none or a fee-bearing choice is complete. */
export function canProceedFromAccommodationStep(transport: JoiningTransportDetails): boolean {
  return isAccommodationChoiceLocked(transport);
}

/** Higher score = more complete persisted bus/hostel selection. */
export function joiningTransportDetailsCompletenessScore(
  transport: JoiningTransportDetails
): number {
  if (!isAccommodationChoiceLocked(transport)) return 0;
  let score = 10;
  if (transport.accommodationType === 'bus') {
    if (transport.routeId) score += 2;
    if (transport.stageId) score += 2;
    if (transport.busNumber || transport.busId) score += 1;
  } else if (transport.accommodationType === 'hostel') {
    if (transport.hostelId) score += 2;
    if (transport.categoryId) score += 2;
    if (transport.roomId || transport.roomNumber) score += 1;
  }
  return score;
}

function buildSyntheticFeeStructureRows(params: {
  prefix: typeof BUS_FEE_STRUCTURE_ID_PREFIX | typeof HOSTEL_FEE_STRUCTURE_ID_PREFIX;
  feeHead: typeof BUS_FEE_HEAD | typeof HOSTEL_FEE_HEAD;
  totalYears: number;
  batch: string;
  course: string;
  branch: string;
  quota?: string | null;
  amount: number;
}): FeeStructure[] {
  const years = Math.max(1, Math.trunc(params.totalYears) || 4);
  const category = mapQuotaToCategory(params.quota);
  const rows: FeeStructure[] = [];

  for (let studentYear = 1; studentYear <= years; studentYear += 1) {
    const structureId =
      params.prefix === BUS_FEE_STRUCTURE_ID_PREFIX
        ? busFeeStructureIdForYear(studentYear)
        : hostelFeeStructureIdForYear(studentYear);
    rows.push({
      _id: structureId,
      id: structureId,
      category,
      course: params.course,
      branch: params.branch,
      college: '',
      studentYear,
      semester: null,
      batch: params.batch,
      amount: params.amount,
      isScholarshipApplicable: false,
      feeHead: params.feeHead.id,
      feeHeadName: params.feeHead.name,
      feeHeadCode: params.feeHead.code,
      feeHeadDescription: params.feeHead.description,
      terms: [],
      createdAt: null,
      updatedAt: null,
    });
  }

  return rows;
}

export function buildBusFeeStructureRows(params: {
  totalYears: number;
  batch: string;
  course: string;
  branch: string;
  quota?: string | null;
  amount: number;
}): FeeStructure[] {
  return buildSyntheticFeeStructureRows({
    ...params,
    prefix: BUS_FEE_STRUCTURE_ID_PREFIX,
    feeHead: BUS_FEE_HEAD,
  });
}

export function buildHostelFeeStructureRows(params: {
  totalYears: number;
  batch: string;
  course: string;
  branch: string;
  quota?: string | null;
  amount?: number;
  amountForYear?: (studentYear: number) => number | null;
}): FeeStructure[] {
  const years = Math.max(1, Math.trunc(params.totalYears) || 4);
  const category = mapQuotaToCategory(params.quota);
  const rows: FeeStructure[] = [];

  for (let studentYear = 1; studentYear <= years; studentYear += 1) {
    const amount =
      params.amountForYear != null
        ? params.amountForYear(studentYear)
        : params.amount != null
          ? Number(params.amount)
          : null;
    if (!hasValidHostelFeeAmount(amount)) continue;

    const structureId = hostelFeeStructureIdForYear(studentYear);
    rows.push({
      _id: structureId,
      id: structureId,
      category,
      course: params.course,
      branch: params.branch,
      college: '',
      studentYear,
      semester: null,
      batch: params.batch,
      amount,
      isScholarshipApplicable: false,
      feeHead: HOSTEL_FEE_HEAD.id,
      feeHeadName: HOSTEL_FEE_HEAD.name,
      feeHeadCode: HOSTEL_FEE_HEAD.code,
      feeHeadDescription: HOSTEL_FEE_HEAD.description,
      terms: [],
      createdAt: null,
      updatedAt: null,
    });
  }

  return rows;
}

function buildHostelYearlyOverrideLines(
  transport: JoiningTransportDetails,
  totalYears: number,
  remarks: string
): JoiningStudentFeeLineOverride[] {
  const years = Math.max(1, Math.trunc(totalYears) || 4);
  const lines: JoiningStudentFeeLineOverride[] = [];
  for (let studentYear = 1; studentYear <= years; studentYear += 1) {
    const amount = getHostelFeeAmountForYear(transport, studentYear);
    if (!hasValidHostelFeeAmount(amount)) continue;
    lines.push({
      structureId: hostelFeeStructureIdForYear(studentYear),
      remarks,
    });
  }
  return lines;
}

export function applyAccommodationFeesToStudentFeeDetails(
  current: JoiningStudentFeeDetails,
  transport: JoiningTransportDetails,
  totalYears: number,
  batch: string
): JoiningStudentFeeDetails {
  const nonSyntheticLines = (current.lines || []).filter(
    (line) => !isSyntheticAccommodationFeeStructureId(line.structureId)
  );

  const extraLines: JoiningStudentFeeLineOverride[] = [];

  if (shouldApplyBusFee(transport)) {
    const years = Math.max(1, Math.trunc(totalYears) || 4);
    for (let studentYear = 1; studentYear <= years; studentYear += 1) {
      extraLines.push({
        structureId: busFeeStructureIdForYear(studentYear),
        remarks: buildBusFeeRemarks(transport),
      });
    }
  } else if (shouldApplyHostelFee(transport)) {
    extraLines.push(
      ...buildHostelYearlyOverrideLines(transport, totalYears, buildHostelFeeRemarks(transport))
    );
  }

  if (extraLines.length === 0) {
    if (nonSyntheticLines.length === (current.lines || []).length) {
      return current;
    }
    return { ...current, lines: nonSyntheticLines };
  }

  return {
    batch: batch || current.batch,
    lines: [...nonSyntheticLines, ...extraLines],
  };
}

/** @deprecated Use applyAccommodationFeesToStudentFeeDetails */
export function applyBusFeeToStudentFeeDetails(
  current: JoiningStudentFeeDetails,
  transport: JoiningTransportDetails,
  totalYears: number,
  batch: string
): JoiningStudentFeeDetails {
  return applyAccommodationFeesToStudentFeeDetails(current, transport, totalYears, batch);
}

export function buildAccommodationInjectedRows(
  transport: JoiningTransportDetails,
  params: {
    totalYears: number;
    batch: string;
    course: string;
    branch: string;
    quota?: string | null;
  }
): FeeStructure[] {
  if (shouldApplyBusFee(transport)) {
    return buildBusFeeStructureRows({
      ...params,
      amount: Number(transport.stageFare),
    });
  }
  if (shouldApplyHostelFee(transport)) {
    return buildHostelFeeStructureRows({
      ...params,
      amountForYear: (studentYear) => getHostelFeeAmountForYear(transport, studentYear),
    });
  }
  return [];
}

export function buildBusFeeInjectedRows(
  transport: JoiningTransportDetails,
  params: {
    totalYears: number;
    batch: string;
    course: string;
    branch: string;
    quota?: string | null;
  }
): FeeStructure[] {
  return buildAccommodationInjectedRows(
    transport.accommodationType === 'bus' ? transport : { ...transport, accommodationType: 'bus' },
    params
  );
}

type CatalogFeeRow = Pick<FeeStructure, '_id' | 'id' | 'amount'>;

/**
 * True when any fee line overrides the catalog amount (Step 4 "Changed" rows).
 * Bus/hostel rows at catalog fare do not count as revised.
 */
export function hasRevisedStudentFeeLineOverrides(
  lines: JoiningStudentFeeLineOverride[] | undefined | null,
  catalogRows: CatalogFeeRow[]
): boolean {
  const catalogById = new Map<string, number>();
  for (const row of catalogRows) {
    const id = String(row._id ?? row.id ?? '').trim();
    if (id) catalogById.set(id, Number(row.amount) || 0);
  }

  for (const line of lines || []) {
    const sid = String(line.structureId || '').trim();
    if (!sid) continue;
    if (
      line.amount === undefined ||
      line.amount === null ||
      !Number.isFinite(Number(line.amount))
    ) {
      continue;
    }
    const overrideAmount = Number(line.amount);
    const catalogAmount = catalogById.get(sid);
    if (catalogAmount === undefined) {
      if (!isSyntheticAccommodationFeeStructureId(sid)) {
        return true;
      }
      continue;
    }
    if (overrideAmount !== catalogAmount) {
      return true;
    }
  }
  return false;
}
