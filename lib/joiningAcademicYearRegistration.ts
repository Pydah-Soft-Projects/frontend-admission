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
  const entry = settings.find((s) => s.course._id === courseId);
  if (!entry) return null;
  if (branchId) {
    const b = entry.branches.find((br) => br._id === branchId);
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
