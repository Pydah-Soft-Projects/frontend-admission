import {
  cleanRegistrationFieldEntries,
  type CleanRegistrationFieldEntry,
} from '@/lib/registrationFieldsDisplay';
import { isJoiningRegistrationFieldHiddenFromForm } from '@/lib/joiningRegistrationFieldFilter';
import { isJoiningRegistrationIntakeField } from '@/lib/joiningRegistrationFieldLayout';
import type { Admission, Joining } from '@/types';

/** Reference 1 — admission/joining lead_data, or lead dynamic_fields.reference1. */
export function resolveJoiningReference1(
  admission?: Admission | null,
  joining?: Joining | null,
  lead?: Record<string, unknown> | null
): string {
  const admLd = admission?.leadData as Record<string, unknown> | undefined;
  const fromAdm = String(admLd?.reference1 ?? admission?.referenceName ?? '').trim();
  if (fromAdm) return fromAdm;
  const joinLd = joining?.leadData as Record<string, unknown> | undefined;
  const fromJoin = String(joinLd?.reference1 ?? '').trim();
  if (fromJoin) return fromJoin;
  const leadAny = lead;
  const dyn = leadAny?.dynamicFields ?? leadAny?.dynamic_fields;
  if (dyn && typeof dyn === 'object') {
    const fromDyn = String((dyn as Record<string, unknown>).reference1 ?? '').trim();
    if (fromDyn) return fromDyn;
  }
  return String(leadAny?.reference1 ?? '').trim();
}

const COURSE_QUOTA_REGISTRATION_KEYS = new Set(
  [
    'academic_year',
    'academicyear',
    'current_year',
    'currentyear',
    'current_academic_year',
    'application_academic_year',
    'admission_academic_year',
    'current_semester',
    'currentsemester',
    'semester',
    'semister',
  ].map((k) => k.toLowerCase())
);

function normKey(key: string): string {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/** Registration rows shown under Course & quota on the read-only view (intake year / semester). */
export function pickJoiningCourseQuotaRegistrationEntries(
  source: Record<string, unknown> | undefined | null
): CleanRegistrationFieldEntry[] {
  return cleanRegistrationFieldEntries(source).filter(([key]) => {
    const n = normKey(key);
    return COURSE_QUOTA_REGISTRATION_KEYS.has(n) || isJoiningRegistrationIntakeField({ fieldName: key });
  });
}

/** Registration rows for Student profile (excludes course-quota intake + hidden joining duplicates). */
export function pickJoiningStudentProfileRegistrationEntries(
  source: Record<string, unknown> | undefined | null
): CleanRegistrationFieldEntry[] {
  const intakeKeys = new Set(
    pickJoiningCourseQuotaRegistrationEntries(source).map(([key]) => normKey(key))
  );
  return cleanRegistrationFieldEntries(source).filter(([key]) => {
    const n = normKey(key);
    if (intakeKeys.has(n)) return false;
    if (isJoiningRegistrationFieldHiddenFromForm(key)) return false;
    return true;
  });
}

export function formatJoiningReservationGeneral(value?: string): string {
  const v = String(value || '').trim();
  if (!v) return '—';
  return v.toUpperCase();
}

export function formatJoiningQualificationMediums(
  mediums?: Array<'english' | 'telugu' | 'other'> | null,
  otherLabel?: string | null
): string {
  if (!mediums?.length) return '—';
  const labels = mediums.map((m) => {
    if (m === 'other' && otherLabel?.trim()) return otherLabel.trim();
    if (m === 'telugu') return 'Telugu';
    if (m === 'english') return 'English';
    return m;
  });
  return labels.join(', ');
}

export function formatJoiningQualifiedExams(qualifications?: Joining['qualifications']): string {
  if (!qualifications) return '—';
  const parts: string[] = [];
  if (qualifications.ssc) parts.push('SSC');
  if (qualifications.interOrDiploma) parts.push('Inter / Diploma');
  if (qualifications.ug) parts.push('UG');
  return parts.length ? parts.join(', ') : '—';
}
