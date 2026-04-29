import type { RegistrationFormField } from '@/components/joining/JoiningDynamicRegistrationFields';
import { buildAcademicYearDropdownOptions, shouldFillApplicationYearValue } from './joiningAcademicYearRegistration';

function norm(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

const DEFAULT_STUDENT_GROUP_OPTIONS = [
  { value: '10th', label: '10th' },
  { value: 'Inter-MPC', label: 'Inter-MPC' },
  { value: 'Inter-BIPC', label: 'Inter-BIPC' },
  { value: 'Degree', label: 'Degree' },
  { value: 'Diploma', label: 'Diploma' },
];

const GENDER_OPTIONS = [
  { value: 'Male', label: 'Male' },
  { value: 'Female', label: 'Female' },
  { value: 'Other', label: 'Other' },
];

const STUDENT_STATUS_OPTIONS = [
  { value: 'Regular', label: 'Regular' },
  { value: 'Transfer', label: 'Transfer' },
  { value: 'Lateral', label: 'Lateral' },
];

function hasGenderLikeOptions(field: RegistrationFormField): boolean {
  const raw = field.options;
  if (!Array.isArray(raw) || raw.length === 0) return false;
  const vals = raw.map((o: unknown) => {
    if (typeof o === 'string') return o.toLowerCase();
    if (o && typeof o === 'object' && 'value' in o) {
      return String((o as { value?: string }).value || '').toLowerCase();
    }
    return '';
  });
  return vals.some((v) => v === 'male' || v === 'female' || v === 'other' || v === 'm' || v === 'f');
}

/**
 * On the joining page, coerce field types from the student DB JSON.
 * - **student_status** → Regular / Transfer / Lateral (not quota). **student_type** is omitted on joining (use Course & Quota).
 */
export function coerceJoiningRegistrationField(field: RegistrationFormField): RegistrationFormField {
  const n = norm(field.fieldName || '');

  if (n === 'student_gender' || n === 'gender') {
    if (field.fieldType !== 'dropdown' || !hasGenderLikeOptions(field)) {
      return {
        ...field,
        fieldType: 'dropdown',
        options: GENDER_OPTIONS,
      };
    }
  }

  if (n === 'student_group' || n === 'studentgroup' || n === 'study_group') {
    const rawOpts = Array.isArray(field.options) ? field.options : [];
    const needCoerce = field.fieldType !== 'dropdown' || rawOpts.length === 0;
    if (needCoerce) {
      return {
        ...field,
        fieldType: 'dropdown',
        options: rawOpts.length ? rawOpts : DEFAULT_STUDENT_GROUP_OPTIONS,
      };
    }
  }

  if (n === 'student_status' || n === 'studentstatus') {
    const opts = Array.isArray(field.options) ? field.options : [];
    return {
      ...field,
      fieldType: 'dropdown',
      options: opts.length ? field.options : STUDENT_STATUS_OPTIONS,
      defaultValue: field.defaultValue != null && String(field.defaultValue) !== '' ? field.defaultValue : 'Regular',
    };
  }

  const dobKeys = new Set([
    'date_of_birth',
    'dateofbirth',
    'dob',
    'student_dob',
    'student_date_of_birth',
    'birth_date',
    'birthdate',
  ]);
  if (dobKeys.has(n) && (field.fieldType === 'text' || field.fieldType === 'textarea')) {
    return { ...field, fieldType: 'date' };
  }

  if (shouldFillApplicationYearValue(n, String(field.fieldLabel || ''))) {
    const ft = String(field.fieldType || '').toLowerCase();
    if (ft === 'dropdown' || ft === 'select' || ft === 'text' || ft === 'number' || !ft) {
      return {
        ...field,
        fieldType: 'dropdown',
        options: buildAcademicYearDropdownOptions(),
      };
    }
  }

  return field;
}
