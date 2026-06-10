import type { Admission, Course, FeeStructure, Joining } from '@/types';
import { deriveAdmissionSeriesYear } from '@/lib/joiningAcademicYearRegistration';
import { resolveTotalYearsFromCourseSettings } from '@/lib/joiningAcademicYearRegistration';
import type { CoursePaymentSettings } from '@/types';

type ApplicationData = Joining | Admission;

export type PrintFeeColumn = 'tuition' | 'transport' | 'other';

export interface PrintFeeStructureYearRow {
  year: number;
  tuition: number | null;
  transport: number | null;
  other: number | null;
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
