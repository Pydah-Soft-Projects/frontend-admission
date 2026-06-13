import type { CoursePaymentSettings } from '@/types';

function norm(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/** Program length in years from secondary DB (branch preferred, then course). */
export function resolveTotalYearsFromCourseSettings(
  settings: CoursePaymentSettings[],
  courseId?: string,
  branchId?: string
): number | null {
  if (!courseId || !settings?.length) return null;
  // Coerce both sides to trimmed strings: legacy rows occasionally carry the
  // FK as a JS number and `===` would silently miss matches.
  const courseTarget = String(courseId).trim();
  if (!courseTarget) return null;
  const entry = settings.find((s) => String(s.course._id ?? '').trim() === courseTarget);
  if (!entry) return null;
  if (branchId) {
    const branchTarget = String(branchId).trim();
    const b = branchTarget
      ? entry.branches.find((br) => String(br._id ?? '').trim() === branchTarget)
      : undefined;
    const ty = b != null && (b as { totalYears?: number | null }).totalYears;
    if (ty != null && Number.isFinite(Number(ty)) && Number(ty) > 0) {
      return Math.round(Number(ty));
    }
  }
  const cy = (entry.course as { totalYears?: number | null }).totalYears;
  if (cy != null && Number.isFinite(Number(cy)) && Number(cy) > 0) {
    return Math.round(Number(cy));
  }
  return null;
}

export function clampApplicationCalendarYear(y: number): number {
  if (!Number.isFinite(y)) return new Date().getFullYear();
  return Math.min(2100, Math.max(1990, Math.round(y)));
}

/** B.Tech when intake = current academic year (regular). */
export const BTECH_REGULAR_INTAKE_SEMESTER = '1-1';
/** B.Tech when intake = prior year (lateral entry). */
export const BTECH_LATERAL_INTAKE_SEMESTER = '2-1';
/** @deprecated Use {@link BTECH_LATERAL_INTAKE_SEMESTER} (lateral) or {@link BTECH_REGULAR_INTAKE_SEMESTER} (current year). */
export const BTECH_JOINING_SEMESTER = BTECH_LATERAL_INTAKE_SEMESTER;

export function resolveBtechSemesterFromLateral(lateral: boolean): string {
  return lateral ? BTECH_LATERAL_INTAKE_SEMESTER : BTECH_REGULAR_INTAKE_SEMESTER;
}

/**
 * True when the managed course name/code refers to an undergraduate B.Tech program
 * (not M.Tech alone).
 */
export function isBtechCourseFromCatalog(name?: string | null, code?: string | null): boolean {
  for (const raw of [name, code]) {
    const s = String(raw || '').trim();
    if (!s) continue;
    const low = s.toLowerCase();
    if (/\bm\.?\s*tech\b/i.test(low)) return false;
    if (/\bb\.?\s*tech\b/i.test(low)) return true;
    const compact = low.replace(/\s+/g, '');
    if (/\bbtech\b/i.test(compact)) return true;
  }
  return false;
}

export const deriveAdmissionSeriesYear = (admissionNumber?: string | null): string | null => {
  const m = String(admissionNumber ?? '').trim().match(/^(20\d{2})/);
  return m ? m[1] : null;
};

/** True when registration extras indicate B.Tech lateral entry (2-1 / prior intake year). */
export function isLateralRegistrationExtras(
  registrationExtras?: Record<string, unknown> | null,
  admissionNumber?: string | null
): boolean {
  if (!registrationExtras || typeof registrationExtras !== 'object') return false;

  const seriesYear = deriveAdmissionSeriesYear(admissionNumber);
  const seriesNum = Number(seriesYear);

  const status = String(
    registrationExtras.student_status ?? registrationExtras.studentStatus ?? ''
  ).trim();
  if (/lateral/i.test(status)) return true;

  const sem = String(
    registrationExtras.semester ??
      registrationExtras.current_semester ??
      registrationExtras.currentSemester ??
      registrationExtras.semister ??
      ''
  ).trim();
  if (sem === '2-1') return true;

  const intake = Number(
    String(
      registrationExtras.current_year ??
        registrationExtras.currentYear ??
        registrationExtras.academic_year ??
        registrationExtras.academicYear ??
        ''
    ).trim()
  );
  if (Number.isFinite(seriesNum) && Number.isFinite(intake) && intake === seriesNum - 1) {
    return true;
  }

  return false;
}

/** Display label for B.Tech lateral batch (idempotent if suffix already present). */
export function formatBtechCourseDisplayLabel(courseName: string, isLateral: boolean): string {
  const base = String(courseName ?? '').trim();
  if (!base || !isLateral) return base;
  if (/\(lateral\)/i.test(base)) return base;
  return `${base} (LATERAL)`;
}

export type JoiningRegistrationFixedGate = {
  isBtech: boolean;
  /** Calendar intake anchor (server clock, clamped). */
  calendarYear: number;
  /** Non–B.Tech: locked intake year string. */
  standardIntakeYear: string;
  standardSemester: string;
  btechRegularSemester: string;
  btechLateralSemester: string;
};

export function buildJoiningRegistrationFixedGate(args: {
  courseName?: string | null;
  courseCode?: string | null;
  calendarYear?: number;
}): JoiningRegistrationFixedGate {
  const cy = clampApplicationCalendarYear(args.calendarYear ?? new Date().getFullYear());
  const isBtech = isBtechCourseFromCatalog(args.courseName, args.courseCode);
  return {
    isBtech,
    calendarYear: cy,
    standardIntakeYear: String(cy),
    standardSemester: '1-1',
    btechRegularSemester: BTECH_REGULAR_INTAKE_SEMESTER,
    btechLateralSemester: BTECH_LATERAL_INTAKE_SEMESTER,
  };
}

/** Current + prior calendar year (B.Tech: current → 1-1, prior → lateral / 2-1). */
export function buildBtechJoiningYearOptions(calendarYear?: number): Array<{ value: string; label: string }> {
  const cy = clampApplicationCalendarYear(calendarYear ?? new Date().getFullYear());
  const past = cy - 1;
  return [
    { value: String(cy), label: `${cy} (current year — regular)` },
    { value: String(past), label: `${past} (prior year — lateral entry)` },
  ];
}

export function normalizeBtechIntakeYearString(
  raw: unknown,
  calendarYear: number
): { year: string; lateral: boolean } {
  const cy = clampApplicationCalendarYear(calendarYear);
  const n = Number(String(raw ?? '').trim());
  if (!Number.isFinite(n)) return { year: String(cy), lateral: false };
  if (n === cy - 1) return { year: String(cy - 1), lateral: true };
  if (n === cy) return { year: String(cy), lateral: false };
  return { year: String(cy), lateral: false };
}

export function buildBtechIntakeAutoRemark(args: {
  lateral: boolean;
  selectedYear: number;
  calendarYear: number;
  semester: string;
}): string {
  const y = clampApplicationCalendarYear(args.selectedYear);
  const cy = clampApplicationCalendarYear(args.calendarYear);
  const sem =
    String(args.semester || '').trim() || resolveBtechSemesterFromLateral(args.lateral);
  if (args.lateral) {
    return `B.Tech lateral entry — academic year ${y}, semester ${sem} (reference cycle ${cy}).`;
  }
  return `B.Tech regular intake — academic year ${y}, semester ${sem}.`;
}

/** Student-DB registration field names that look like free-text remarks (auto-filled for B.Tech intake). */
export function listRegistrationRemarkFieldNames(
  fields: Array<{ fieldName?: string; fieldLabel?: string }>
): string[] {
  const out = new Set<string>();
  for (const f of fields) {
    const raw = String(f.fieldName || '').trim();
    if (!raw) continue;
    const n = norm(raw);
    const lab = norm(String(f.fieldLabel || ''));
    const hay = `${n} ${lab}`;
    if (
      n === 'remark' ||
      n === 'remarks' ||
      (n.includes('remark') && !n.includes('certific')) ||
      (n.includes('remarks') && !n.includes('certific')) ||
      (n.includes('comment') && !n.includes('communication') && !n.includes('certific')) ||
      (hay.includes('remark') && !hay.includes('certific'))
    ) {
      out.add(raw);
    }
  }
  return Array.from(out);
}

/**
 * Admission / intake "batch" fields — must not receive completion-year (`intake + totalYears`)
 * or generic application-year patches (batch uses calendar default in joining UI).
 */
export function isJoiningRegistrationBatchField(fieldName: string, fieldLabel: string): boolean {
  const n = norm(fieldName);
  const l = norm(fieldLabel);
  if (
    n === 'batch' ||
    n === 'batch_year' ||
    n === 'admission_batch' ||
    n === 'joining_batch' ||
    n === 'admission_year'
  ) {
    return true;
  }
  if (
    l === 'batch' ||
    l === 'batch_year' ||
    l === 'admission_batch' ||
    l === 'joining_batch' ||
    l === 'admission_year'
  ) {
    return true;
  }
  // Labels like "Batch *" / "Batch (year)" → norm is `batch_*` — strip non-letters for match.
  const labelLetters = l.replace(/[^a-z]/g, '');
  if (labelLetters === 'batch' || labelLetters === 'batchyear') {
    return true;
  }
  if (labelLetters === 'admissionbatch' || labelLetters === 'joiningbatch' || labelLetters === 'admissionyear') {
    return true;
  }
  return false;
}

/**
 * When a batch field was wrongly filled with program end year (`intake + totalYears`), reset to calendar year.
 */
export function sanitizeJoiningRegistrationBatchFieldValue(
  fieldName: string,
  fieldLabel: string,
  raw: unknown,
  intakeApplicationYear: number,
  totalYears: number | null,
  calendarYear: number,
  /** When catalog totalYears is missing (e.g. course not resolved yet), B.Tech often uses 4 years for this heuristic. */
  fallbackTotalYearsForCompletionGuess?: number | null
): string | null {
  if (!isJoiningRegistrationBatchField(fieldName, fieldLabel)) return null;
  const rawStr = String(raw ?? '').trim();
  const num = Number(rawStr);
  if (!Number.isFinite(num) || num < 1900 || num > 3000) return null;
  const app = clampApplicationCalendarYear(intakeApplicationYear);
  const cy = clampApplicationCalendarYear(calendarYear);
  const ty =
    totalYears != null && totalYears > 0
      ? totalYears
      : fallbackTotalYearsForCompletionGuess != null && fallbackTotalYearsForCompletionGuess > 0
        ? Math.round(fallbackTotalYearsForCompletionGuess)
        : null;
  if (ty != null && num === app + ty) {
    return String(cy);
  }
  return null;
}

/** Plain calendar-year options for joining (avoids student-DB FK ids in `<select value>`). */
export function buildAcademicYearDropdownOptions(): Array<{ value: string; label: string }> {
  const years: Array<{ value: string; label: string }> = [];
  for (let y = 1990; y <= 2100; y += 1) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
}

/** Intake / application year fields (not completion / duration end). */
export function shouldFillApplicationYearValue(fieldName: string, fieldLabel: string): boolean {
  if (isJoiningRegistrationBatchField(fieldName, fieldLabel)) return false;
  if (isCourseDurationEndYearField(fieldName, fieldLabel)) return false;
  const n = norm(fieldName);
  if (n === 'academic_year' || n === 'academicyear' || n === 'academic_year_id') return true;
  if (n.includes('academic_year')) return true;
  return isCurrentAcademicYearField(fieldName, fieldLabel);
}

/** Extra registration fields that mean “intake / application academic year” (not completion). */
export function isCurrentAcademicYearField(fieldName: string, fieldLabel: string): boolean {
  const n = norm(fieldName);
  const l = norm(fieldLabel);
  if (n === 'academic_year' || n === 'academicyear' || n === 'academic_year_id') return false;
  const hay = `${n} ${l}`;
  if (hay.includes('course_duration') || (hay.includes('duration') && hay.includes('year'))) return false;
  if (hay.includes('completion') && hay.includes('year')) return false;
  if (hay.includes('expected') && hay.includes('completion')) return false;
  if (
    (hay.includes('current') || hay.includes('application') || hay.includes('admission')) &&
    hay.includes('academic') &&
    hay.includes('year')
  ) {
    return true;
  }
  if (n === 'current_academic_year' || n === 'application_academic_year' || n === 'admission_academic_year') {
    return true;
  }
  return false;
}

/** Fields that mean calendar / completion year = application year + course duration (years). */
export function isCourseDurationEndYearField(fieldName: string, fieldLabel: string): boolean {
  const n = norm(fieldName);
  const l = norm(fieldLabel);
  if (n === 'academic_year' || n === 'academicyear') return false;
  if (isJoiningRegistrationBatchField(fieldName, fieldLabel)) return false;
  const hay = `${n} ${l}`;
  if (hay.includes('current') && hay.includes('academic') && hay.includes('year')) return false;
  if (hay.includes('application') && hay.includes('academic') && hay.includes('year')) return false;
  if ((hay.includes('duration') && hay.includes('year')) || n.includes('course_duration')) return true;
  if ((hay.includes('completion') || hay.includes('completing')) && hay.includes('year')) return true;
  if (hay.includes('expected') && hay.includes('year') && (hay.includes('complete') || hay.includes('graduat'))) {
    return true;
  }
  if (hay.includes('program') && hay.includes('end') && hay.includes('year')) return true;
  return false;
}

/**
 * Values for `registrationFormData`: canonical keys + any form fields that match
 * current vs completion-year heuristics.
 */
export function computeAcademicYearRegistrationPatches(
  fields: Array<{ fieldName?: string; fieldLabel?: string; fieldType?: string; options?: unknown }>,
  applicationYear: number,
  totalYears: number | null
): Record<string, string> {
  if (!Number.isFinite(applicationYear)) return {};
  const app = clampApplicationCalendarYear(applicationYear);
  const appStr = String(app);
  const out: Record<string, string> = {
    academic_year: appStr,
    academicYear: appStr,
  };

  for (const f of fields) {
    const fn = String(f.fieldName || '').trim();
    if (!fn) continue;
    const label = String(f.fieldLabel || '');
    if (shouldFillApplicationYearValue(fn, label)) {
      // Calendar year strings only — joining coerces dropdowns away from student-DB FK ids (e.g. 1559).
      out[fn] = appStr;
    }
    if (isCourseDurationEndYearField(fn, label) && totalYears != null && totalYears > 0) {
      out[fn] = String(app + totalYears);
    }
  }
  return out;
}

/** Step 1 intake calendar year (e.g. 2026) stored on registrationFormData. */
export function resolveJoiningStepOneAcademicYear(args: {
  registrationExtras: Record<string, unknown>;
  gate: JoiningRegistrationFixedGate;
  leadAcademicYear?: number | string | null;
}): string {
  const { registrationExtras, gate, leadAcademicYear } = args;

  if (gate.isBtech) {
    return normalizeBtechIntakeYearString(
      registrationExtras.academic_year ?? registrationExtras.academicYear,
      gate.calendarYear
    ).year;
  }

  if (leadAcademicYear != null && !Number.isNaN(Number(leadAcademicYear))) {
    return String(clampApplicationCalendarYear(Number(leadAcademicYear)));
  }

  const fromRegistration = String(
    registrationExtras.academic_year ?? registrationExtras.academicYear ?? ''
  ).trim();
  if (fromRegistration) return fromRegistration;

  return gate.standardIntakeYear || String(gate.calendarYear);
}

/** Display / transport session from Step 1 calendar year (2026 → 2026-2027). */
export function calendarYearToAcademicYearRange(year: string | number | null | undefined): string {
  const raw = String(year ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{4}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{4})/);
  if (match) {
    const start = Number(match[1]);
    if (Number.isFinite(start) && start >= 2000) {
      return `${start}-${start + 1}`;
    }
  }
  return raw;
}
