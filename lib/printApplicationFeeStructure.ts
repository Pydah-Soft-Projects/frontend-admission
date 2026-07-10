import type { Admission, Course, FeeStructure, Joining, JoiningStudentFeeLineOverride } from '@/types';
import { deriveAdmissionSeriesYear } from '@/lib/joiningAcademicYearRegistration';
import { resolveTotalYearsFromCourseSettings } from '@/lib/joiningAcademicYearRegistration';
import { resolveOverallConcessionPrintAdjustment } from '@/lib/overallConcessions';
import type { CoursePaymentSettings } from '@/types';

type ApplicationData = Joining | Admission;

export type PrintFeeColumn = 'tuition' | 'transport' | 'other';

export interface PrintFeeStructureYearRow {
  year: number;
  tuition: number | null;
  transport: number | null;
  other: number | null;
}

export interface PrintFeeAdjustment {
  feeHeadId?: string | null;
  feeHeadCode?: string;
  feeHeadName?: string;
  studentYear?: number | string;
  /** New storage: raw builder / overall_concessions value. */
  amount?: number | string;
  /** Legacy overall_concessions fields — ignored when `amount` is set. */
  actualAmount?: number | string;
  revisedAmount?: number | string;
  concessionAmount?: number | string;
  concessionType?: 'REVISED_FEE' | 'CONCESSION' | string;
}

export interface PrintFeeStructureColumn {
  key: string;
  label: string;
  code: string;
  adjustmentType?: 'REVISED_FEE' | 'CONCESSION';
}

export interface PrintFeeStructureCell {
  actual: number | null;
  adjustment: number | null;
}

export interface PrintFeeStructureDetailedYearRow {
  year: number;
  cells: Record<string, PrintFeeStructureCell>;
}

export interface PrintFeeStructureDetailedTable {
  columns: PrintFeeStructureColumn[];
  rows: PrintFeeStructureDetailedYearRow[];
}

export function mapQuotaToFeeCategory(quota?: string | null): string {
  if (!quota) return '';
  const key = quota.trim().toLowerCase();
  if (!key) return '';
  if (key.includes('conv')) return 'CONV';
  if (key.includes('mang') || key.includes('management')) return 'MANG';
  if (key.includes('spot')) return 'SPOT';
  return quota.toUpperCase();
}

/** Classify a fee-management row into tuition / transport / other for the print table. */
export function classifyPrintFeeColumn(row: FeeStructure): PrintFeeColumn {
  const code = String(row.feeHeadCode || '').trim().toUpperCase();
  const name = String(row.feeHeadName || '').trim().toLowerCase();
  const desc = String(row.feeHeadDescription || '').trim().toLowerCase();
  const blob = `${code} ${name} ${desc}`;

  if (
    code === 'TRN01' ||
    /\btransport\b/.test(blob) ||
    /\bbus\b/.test(blob) ||
    /^trn/.test(code)
  ) {
    return 'transport';
  }

  if (
    /\btuition\b/.test(blob) ||
    /\bacademic\b/.test(blob) ||
    /\bcourse fee\b/.test(blob) ||
    /\bcollege fee\b/.test(blob) ||
    /\bsemester fee\b/.test(blob) ||
    /^tuit/.test(code) ||
    /^acd/.test(code) ||
    /^acad/.test(code)
  ) {
    return 'tuition';
  }

  return 'other';
}

export function resolvePrintFeeBatch(application: ApplicationData): string {
  const studentFee = (application as Joining).studentFeeDetails;
  const fromStudentFee = String(studentFee?.batch ?? '').trim();
  if (fromStudentFee) return fromStudentFee;

  const reg =
    application.registrationFormData && typeof application.registrationFormData === 'object'
      ? (application.registrationFormData as Record<string, unknown>)
      : {};
  for (const key of ['academic_year', 'academicYear', 'batch', 'admission_batch']) {
    const v = reg[key];
    if (v != null && String(v).trim()) return String(v).trim();
  }

  const lead =
    application.leadData && typeof application.leadData === 'object'
      ? (application.leadData as Record<string, unknown>)
      : {};
  if (lead.academicYear != null && String(lead.academicYear).trim()) {
    return String(lead.academicYear).trim();
  }

  const series = deriveAdmissionSeriesYear((application as Admission).admissionNumber);
  if (series) return series;

  return String(new Date().getFullYear());
}

export function resolveProgramTotalYears(
  courseCatalog: CoursePaymentSettings[],
  courseId?: string | null,
  branchId?: string | null,
  feeStructures: FeeStructure[] = []
): number {
  const fromCatalog = resolveTotalYearsFromCourseSettings(
    courseCatalog,
    courseId ? String(courseId) : undefined,
    branchId ? String(branchId) : undefined
  );
  if (fromCatalog != null && fromCatalog > 0) return fromCatalog;

  const yearsFromFees = feeStructures
    .map((row) => row.studentYear)
    .filter((y): y is number => typeof y === 'number' && Number.isFinite(y) && y > 0);
  if (yearsFromFees.length > 0) {
    return Math.max(...yearsFromFees);
  }

  return 4;
}

export function buildPrintFeeStructureYearRows(
  structures: FeeStructure[],
  totalYears: number
): PrintFeeStructureYearRow[] {
  const yearMap = new Map<number, { tuition: number; transport: number; other: number }>();

  for (const row of structures) {
    const year = row.studentYear;
    if (year == null || !Number.isFinite(year) || year < 1) continue;
    if (!yearMap.has(year)) {
      yearMap.set(year, { tuition: 0, transport: 0, other: 0 });
    }
    const bucket = yearMap.get(year)!;
    const col = classifyPrintFeeColumn(row);
    bucket[col] += Number(row.amount) || 0;
  }

  const maxFromData = yearMap.size > 0 ? Math.max(...yearMap.keys()) : 0;
  const yearCount = Math.max(1, totalYears, maxFromData);
  const rows: PrintFeeStructureYearRow[] = [];

  for (let year = 1; year <= yearCount; year += 1) {
    const bucket = yearMap.get(year);
    rows.push({
      year,
      tuition: bucket && bucket.tuition > 0 ? bucket.tuition : null,
      transport: bucket && bucket.transport > 0 ? bucket.transport : null,
      other: bucket && bucket.other > 0 ? bucket.other : null,
    });
  }

  return rows;
}

const normalizeFeeKeyPart = (value?: string | null) => String(value || '').trim();

const feeColumnKeyForStructure = (row: FeeStructure): string => {
  const id = normalizeFeeKeyPart(row.feeHead);
  if (id) return `id:${id}`;
  const code = normalizeFeeKeyPart(row.feeHeadCode).toUpperCase();
  if (code) return `code:${code}`;
  return `name:${normalizeFeeKeyPart(row.feeHeadName).toUpperCase()}`;
};

const feeColumnKeyForAdjustment = (row: PrintFeeAdjustment): string => {
  const id = normalizeFeeKeyPart(row.feeHeadId);
  if (id) return `id:${id}`;
  const code = normalizeFeeKeyPart(row.feeHeadCode).toUpperCase();
  if (code) return `code:${code}`;
  return '';
};

const normalizeAdjustmentType = (value?: string | null): 'REVISED_FEE' | 'CONCESSION' | undefined => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'CONCESSION') return 'CONCESSION';
  if (raw === 'REVISED_FEE' || raw === 'REVISED') return 'REVISED_FEE';
  return undefined;
};

export function buildPrintFeeAdjustmentsFromStudentFeeDetails(
  lines: JoiningStudentFeeLineOverride[] = [],
  structures: FeeStructure[] = []
): PrintFeeAdjustment[] {
  return lines
    .filter((line) => line.concessionType === 'CONCESSION' || line.concessionType === 'REVISED_FEE')
    .map((line) => {
      const catalog = structures.find((row) => String(row._id) === String(line.structureId));
      return {
        feeHeadId: line.feeHeadId || catalog?.feeHead || null,
        feeHeadCode: line.feeHeadCode || catalog?.feeHeadCode || '',
        feeHeadName: line.feeHeadName || catalog?.feeHeadName || '',
        studentYear: line.studentYear ?? catalog?.studentYear ?? 1,
        amount: line.amount ?? 0,
        concessionType: line.concessionType,
      };
    });
}

export function buildPrintFeeStructureDetailedTable(
  structures: FeeStructure[],
  totalYears: number,
  adjustments: PrintFeeAdjustment[] = []
): PrintFeeStructureDetailedTable {
  const columnMap = new Map<string, PrintFeeStructureColumn>();
  const columnAliasMap = new Map<string, string>();
  const amountMap = new Map<string, number>();
  const adjustmentMap = new Map<string, PrintFeeAdjustment>();
  const adjustmentTypeByColumn = new Map<string, 'REVISED_FEE' | 'CONCESSION'>();

  for (const row of structures) {
    const year = Number(row.studentYear);
    if (!Number.isFinite(year) || year < 1) continue;
    const key = feeColumnKeyForStructure(row);
    const idAlias = normalizeFeeKeyPart(row.feeHead) ? `id:${normalizeFeeKeyPart(row.feeHead)}` : '';
    const codeAlias = normalizeFeeKeyPart(row.feeHeadCode)
      ? `code:${normalizeFeeKeyPart(row.feeHeadCode).toUpperCase()}`
      : '';
    if (!columnMap.has(key)) {
      columnMap.set(key, {
        key,
        label: row.feeHeadName || row.feeHeadCode || 'Fee Head',
        code: row.feeHeadCode || '',
      });
    }
    if (idAlias) columnAliasMap.set(idAlias, key);
    if (codeAlias) columnAliasMap.set(codeAlias, key);
    const mapKey = `${key}::${year}`;
    amountMap.set(mapKey, (amountMap.get(mapKey) || 0) + (Number(row.amount) || 0));
  }

  for (const adjustment of adjustments) {
    const type = normalizeAdjustmentType(adjustment.concessionType);
    const rawKey = feeColumnKeyForAdjustment(adjustment);
    const codeAlias = normalizeFeeKeyPart(adjustment.feeHeadCode)
      ? `code:${normalizeFeeKeyPart(adjustment.feeHeadCode).toUpperCase()}`
      : '';
    const key = columnAliasMap.get(rawKey) || (codeAlias ? columnAliasMap.get(codeAlias) : '') || rawKey;
    const year = Number(adjustment.studentYear) || 1;
    if (!type || !key) continue;

    // Dynamically insert missing builder heads into the columns list so manually added fee heads are printed
    if (!columnMap.has(key)) {
      columnMap.set(key, {
        key,
        label: adjustment.feeHeadName || adjustment.feeHeadCode || 'Fee Head',
        code: adjustment.feeHeadCode || '',
      });
    }
    const adjustmentKey = `${key}::${year}`;
    const existing = adjustmentMap.get(adjustmentKey);
    const existingType = normalizeAdjustmentType(existing?.concessionType);
    if (!existing || existingType !== 'REVISED_FEE' || type === 'REVISED_FEE') {
      adjustmentMap.set(adjustmentKey, {
        ...adjustment,
        concessionType: type,
      });
    }
    const currentType = adjustmentTypeByColumn.get(key);
    adjustmentTypeByColumn.set(
      key,
      currentType === 'REVISED_FEE' || type === 'REVISED_FEE' ? 'REVISED_FEE' : 'CONCESSION'
    );
  }

  for (const [key, type] of adjustmentTypeByColumn.entries()) {
    const col = columnMap.get(key);
    if (col) col.adjustmentType = type;
  }

  const maxFromData = Math.max(
    0,
    ...Array.from(amountMap.keys()).map((key) => Number(key.split('::')[1]) || 0),
    ...Array.from(adjustmentMap.keys()).map((key) => Number(key.split('::')[1]) || 0)
  );
  const yearCount = Math.max(1, totalYears, maxFromData);
  const columns = Array.from(columnMap.values()).filter((col) => {
    const label = String(col.label || '').trim().toLowerCase();
    const code = String(col.code || '').trim().toUpperCase();
    const isDefaultHead = 
      /tuition|tution/i.test(label) || 
      /transport|bus/i.test(label) || 
      /other/i.test(label) ||
      code === 'TRN01' || /^trn/i.test(code);
    return isDefaultHead || adjustmentTypeByColumn.has(col.key);
  });
  const rows: PrintFeeStructureDetailedYearRow[] = [];

  for (let year = 1; year <= yearCount; year += 1) {
    const cells: Record<string, PrintFeeStructureCell> = {};
    for (const column of columns) {
      const actual = amountMap.get(`${column.key}::${year}`) || 0;
      const adjustment = adjustmentMap.get(`${column.key}::${year}`);
      const adjustedValue = resolveOverallConcessionPrintAdjustment(adjustment, actual);
      cells[column.key] = {
        actual: actual > 0 ? actual : null,
        adjustment: adjustedValue > 0 ? adjustedValue : null,
      };
    }
    rows.push({ year, cells });
  }

  return { columns, rows };
}

export function courseCatalogFromCourseList(
  courseList: Array<Course & { branches?: Array<{ _id: string; totalYears?: number | null }> }>
): CoursePaymentSettings[] {
  return courseList.map((course) => ({
    course: {
      _id: String(course._id),
      name: course.name,
      totalYears: course.totalYears ?? null,
    },
    branches: (course.branches || []).map((branch) => ({
      _id: String(branch._id),
      name: String((branch as { name?: string }).name ?? ''),
      totalYears: branch.totalYears ?? null,
    })),
    payment: { defaultFee: null, branchFees: [] },
  }));
}

export function unwrapFeeStructureListPayload(payload: unknown): FeeStructure[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as { data?: unknown };
  const inner = root.data ?? payload;
  if (Array.isArray(inner)) return inner as FeeStructure[];
  if (inner && typeof inner === 'object' && Array.isArray((inner as { data?: unknown }).data)) {
    return (inner as { data: FeeStructure[] }).data;
  }
  return [];
}
