export type PreferredMobileRole = 'student' | 'father' | 'mother';

export type PreferredMobileOption = {
  label: string;
  value: string;
  role: PreferredMobileRole;
  digits: string;
};

export function normalizeJoiningMobileDigits(value?: string): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(-10);
}

/** True when both values normalize to the same 10-digit mobile. */
export function phonesAreSame(a?: string, b?: string): boolean {
  const da = normalizeJoiningMobileDigits(a);
  const db = normalizeJoiningMobileDigits(b);
  return da.length === 10 && db.length === 10 && da === db;
}

export function encodePreferredMobileValue(role: PreferredMobileRole, digits: string): string {
  const d = normalizeJoiningMobileDigits(digits);
  if (d.length !== 10) return '';
  return `${role}:${d}`;
}

export function decodePreferredMobileValue(value?: string): {
  role?: PreferredMobileRole;
  digits: string;
} {
  const raw = String(value ?? '').trim();
  const match = /^(student|father|mother):(\d{10})$/.exec(raw);
  if (match) {
    return { role: match[1] as PreferredMobileRole, digits: match[2] };
  }
  const digits = normalizeJoiningMobileDigits(raw);
  return { digits };
}

/** Extract 10-digit mobile for DB / API from stored or UI value. */
export function normalizePreferredMobileDigits(value?: string): string {
  const { digits } = decodePreferredMobileValue(value);
  return digits.length === 10 ? digits : '';
}

function pickPhone(...candidates: Array<string | undefined | null>): string {
  for (const raw of candidates) {
    const digits = normalizeJoiningMobileDigits(raw);
    if (digits.length === 10) return digits;
  }
  return '';
}

/**
 * Merge structured joining/admission parent phones with lead snapshot numbers so the
 * preferred-mobile dropdown can offer student / father / mother (including lead alternate)
 * before parent fields are filled on the form.
 */
export function resolvePreferredMobileSourcePhones(input: {
  studentPhone?: string;
  fatherPhone?: string;
  motherPhone?: string;
  leadPhone?: string;
  leadFatherPhone?: string;
  leadMotherPhone?: string;
  leadAlternateMobile?: string;
}): { studentPhone: string; fatherPhone: string; motherPhone: string } {
  return {
    studentPhone: pickPhone(input.studentPhone, input.leadPhone),
    fatherPhone: pickPhone(input.fatherPhone, input.leadFatherPhone),
    motherPhone: pickPhone(
      input.motherPhone,
      input.leadMotherPhone,
      input.leadAlternateMobile
    ),
  };
}

const ROLE_PRIORITY: PreferredMobileRole[] = ['father', 'mother', 'student'];

/**
 * Build one option per role that has a valid phone — even when student and parent
 * numbers are identical (each role stays selectable in the dropdown).
 */
export function buildPreferredMobileOptions(input: {
  studentPhone?: string;
  fatherPhone?: string;
  motherPhone?: string;
}): PreferredMobileOption[] {
  const options: PreferredMobileOption[] = [];

  const push = (label: string, role: PreferredMobileRole, raw?: string) => {
    const digits = normalizeJoiningMobileDigits(raw);
    if (digits.length !== 10) return;
    options.push({
      label: `${label} (${digits})`,
      value: encodePreferredMobileValue(role, digits),
      role,
      digits,
    });
  };

  push('Student mobile', 'student', input.studentPhone);
  push('Father mobile', 'father', input.fatherPhone);
  push('Mother mobile', 'mother', input.motherPhone);

  return options;
}

/** Map stored preferred digits to the best matching role-based option value. */
export function resolvePreferredMobileSelectValue(
  storedValue: string | undefined,
  options: PreferredMobileOption[]
): string {
  if (!options.length) return '';
  const storedDigits = normalizePreferredMobileDigits(storedValue);
  if (storedDigits.length !== 10) return '';

  const matching = options.filter((o) => o.digits === storedDigits);
  if (matching.length === 0) return '';
  if (matching.length === 1) return matching[0].value;

  for (const role of ROLE_PRIORITY) {
    const hit = matching.find((o) => o.role === role);
    if (hit) return hit.value;
  }
  return matching[0].value;
}

/**
 * Default preferred contact: parent mobile when it differs from student, otherwise
 * father, then mother, then student.
 */
export function suggestDefaultPreferredMobileDigits(input: {
  studentPhone?: string;
  fatherPhone?: string;
  motherPhone?: string;
}): string {
  const student = normalizeJoiningMobileDigits(input.studentPhone);
  const father = normalizeJoiningMobileDigits(input.fatherPhone);
  const mother = normalizeJoiningMobileDigits(input.motherPhone);

  if (father.length === 10 && !phonesAreSame(father, student)) return father;
  if (mother.length === 10 && !phonesAreSame(mother, student)) return mother;
  if (father.length === 10) return father;
  if (mother.length === 10) return mother;
  if (student.length === 10) return student;
  return '';
}
