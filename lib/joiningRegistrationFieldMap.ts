/** Normalize various date strings to `YYYY-MM-DD` for joining date inputs. */
export function normalizeJoiningDateOfBirthInput(value?: string): string {
  if (!value) return '';
  const v = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const isoCandidate = new Date(v);
  if (!Number.isNaN(isoCandidate.getTime())) {
    return isoCandidate.toISOString().slice(0, 10);
  }
  const ddMmYyMatch = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddMmYyMatch) {
    return `${ddMmYyMatch[3]}-${ddMmYyMatch[2]}-${ddMmYyMatch[1]}`;
  }
  return '';
}

/** Subset of joining draft state used for registration ↔ joining field sync. */
export type JoiningRegistrationFormStateLike = {
  studentInfo: { name?: string; phone?: string; gender?: string; dateOfBirth?: string };
  parents: {
    father: { name?: string; phone?: string; photo?: string };
    mother: { name?: string; phone?: string; photo?: string };
  };
  address: {
    communication: {
      doorOrStreet?: string;
      landmark?: string;
      villageOrCity?: string;
      mandal?: string;
      district?: string;
      state?: string;
      pinCode?: string;
    };
  };
};

/** Form builder `fieldName` values (lowercase) that map onto the structured joining draft. */
const MAPPED = new Set(
  [
    'student_name',
    'name',
    'student_phone',
    'phone',
    'phonenumber',
    'mobile',
    'mobile_number',
    'phone_number',
    'contact_number',
    'primary_phone',
    'student_contact_number',
    'student_gender',
    'gender',
    'date_of_birth',
    'dateofbirth',
    'dob',
    'student_dob',
    'student_date_of_birth',
    'birth_date',
    'birthdate',
    'father_name',
    'fathername',
    'father_phone',
    'fatherphone',
    'mother_name',
    'mothername',
    'mother_phone',
    'motherphone',
    'address_door_street',
    'door_street',
    'address_landmark',
    'landmark',
    'address_village_city',
    'village',
    'city',
    'address_village',
    'state',
    'address_state',
    'address_district',
    'district',
    'address_mandal',
    'mandal',
    'pincode',
    'pin_code',
    'address_pin_code',
  ].map((s) => s.toLowerCase())
);

export function isJoiningRegistrationFieldMapped(fieldName: string): boolean {
  return MAPPED.has(String(fieldName || '').trim().toLowerCase());
}

function isPhoneMappedFieldName(n: string): boolean {
  return (
    n === 'student_phone' ||
    n === 'phone' ||
    n === 'phonenumber' ||
    n === 'mobile' ||
    n === 'mobile_number' ||
    n === 'phone_number' ||
    n === 'contact_number' ||
    n === 'primary_phone' ||
    n === 'student_contact_number'
  );
}

const REG_EXTRA_PHONE_KEYS = [
  'student_phone',
  'phone',
  'phonenumber',
  'mobile',
  'student_mobile',
  'student_mobileno',
  'mobile_number',
  'phone_number',
  'contact_number',
  'primary_phone',
  'student_contact_number',
] as const;

const REG_EXTRA_DOB_KEYS = [
  'date_of_birth',
  'dateofbirth',
  'dob',
  'student_dob',
  'student_date_of_birth',
  'birth_date',
  'birthdate',
] as const;

function pickRegistrationExtraCI(extras: Record<string, unknown>, keys: readonly string[]): string {
  const want = new Set(keys.map((k) => k.toLowerCase()));
  for (const [k, v] of Object.entries(extras)) {
    if (!want.has(k.toLowerCase())) continue;
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function digitsOnlyLast10(raw: string): string {
  const d = String(raw || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : d;
}

/**
 * Copy student phone / DOB from registration extras into structured `studentInfo` when saving,
 * so the joining row columns stay in sync with the student-database form.
 */
export function mergeJoiningStudentInfoFromExtras(
  studentInfo: JoiningRegistrationFormStateLike['studentInfo'],
  extras: Record<string, unknown>
): JoiningRegistrationFormStateLike['studentInfo'] {
  let p = digitsOnlyLast10(studentInfo.phone || '');
  if (p.length !== 10) {
    const fromReg = digitsOnlyLast10(pickRegistrationExtraCI(extras, [...REG_EXTRA_PHONE_KEYS]));
    if (fromReg.length === 10) p = fromReg;
  }

  let dobRaw = String(studentInfo.dateOfBirth || '').trim();
  if (!dobRaw) {
    dobRaw = pickRegistrationExtraCI(extras, [...REG_EXTRA_DOB_KEYS]);
  }
  const normalizedDob = dobRaw ? normalizeJoiningDateOfBirthInput(dobRaw) : '';

  return {
    ...studentInfo,
    ...(p.length === 10 ? { phone: p } : {}),
    ...(normalizedDob ? { dateOfBirth: normalizedDob } : {}),
  };
}

function normalizeGender(value: string): string {
  const g = String(value ?? '').trim();
  if (!g) return '';
  const lower = g.toLowerCase();
  if (lower === 'male' || lower === 'm') return 'Male';
  if (lower === 'female' || lower === 'f') return 'Female';
  if (lower === 'other' || lower === 'o') return 'Other';
  return g.charAt(0).toUpperCase() + g.slice(1).toLowerCase();
}

/** Read value for a registration field from structured joining form state (mapped fields only). */
export function readMappedRegistrationField(
  formState: JoiningRegistrationFormStateLike,
  fieldName: string
): string {
  const n = String(fieldName || '').trim().toLowerCase();
  const c = formState.address.communication;

  if (n === 'student_name' || n === 'name') return formState.studentInfo.name || '';
  if (isPhoneMappedFieldName(n)) {
    return formState.studentInfo.phone || '';
  }
  if (n === 'student_gender' || n === 'gender') return formState.studentInfo.gender || '';
  if (
    n === 'date_of_birth' ||
    n === 'dateofbirth' ||
    n === 'dob' ||
    n === 'student_dob' ||
    n === 'student_date_of_birth' ||
    n === 'birth_date' ||
    n === 'birthdate'
  ) {
    return normalizeJoiningDateOfBirthInput(formState.studentInfo.dateOfBirth) || '';
  }

  if (n === 'father_name' || n === 'fathername') return formState.parents.father.name || '';
  if (n === 'father_phone' || n === 'fatherphone') return formState.parents.father.phone || '';

  if (n === 'mother_name' || n === 'mothername') return formState.parents.mother.name || '';
  if (n === 'mother_phone' || n === 'motherphone') return formState.parents.mother.phone || '';

  if (n === 'address_door_street' || n === 'door_street') return c.doorOrStreet || '';
  if (n === 'address_landmark' || n === 'landmark') return c.landmark || '';
  if (n === 'address_village_city' || n === 'village' || n === 'city' || n === 'address_village') {
    return c.villageOrCity || '';
  }
  if (n === 'state' || n === 'address_state') return c.state || '';
  if (n === 'address_district' || n === 'district') return c.district || '';
  if (n === 'address_mandal' || n === 'mandal') return c.mandal || '';
  if (n === 'pincode' || n === 'pin_code' || n === 'address_pin_code') return c.pinCode || '';

  return '';
}

/** Apply a registration field value into structured joining form state. */
export function applyMappedRegistrationField<T extends JoiningRegistrationFormStateLike>(
  prev: T,
  fieldName: string,
  value: unknown
): T {
  const raw = value === undefined || value === null ? '' : String(value);
  const n = String(fieldName || '').trim().toLowerCase();

  if (n === 'student_name' || n === 'name') {
    return { ...prev, studentInfo: { ...prev.studentInfo, name: raw } };
  }
  if (isPhoneMappedFieldName(n)) {
    return { ...prev, studentInfo: { ...prev.studentInfo, phone: raw } };
  }
  if (n === 'student_gender' || n === 'gender') {
    return { ...prev, studentInfo: { ...prev.studentInfo, gender: normalizeGender(raw) } };
  }
  if (
    n === 'date_of_birth' ||
    n === 'dateofbirth' ||
    n === 'dob' ||
    n === 'student_dob' ||
    n === 'student_date_of_birth' ||
    n === 'birth_date' ||
    n === 'birthdate'
  ) {
    const dob = normalizeJoiningDateOfBirthInput(raw);
    return { ...prev, studentInfo: { ...prev.studentInfo, dateOfBirth: dob } };
  }

  if (n === 'father_name' || n === 'fathername') {
    return {
      ...prev,
      parents: { ...prev.parents, father: { ...prev.parents.father, name: raw } },
    };
  }
  if (n === 'father_phone' || n === 'fatherphone') {
    return {
      ...prev,
      parents: { ...prev.parents, father: { ...prev.parents.father, phone: raw } },
    };
  }

  if (n === 'mother_name' || n === 'mothername') {
    return {
      ...prev,
      parents: { ...prev.parents, mother: { ...prev.parents.mother, name: raw } },
    };
  }
  if (n === 'mother_phone' || n === 'motherphone') {
    return {
      ...prev,
      parents: { ...prev.parents, mother: { ...prev.parents.mother, phone: raw } },
    };
  }

  const comm = { ...prev.address.communication };
  if (n === 'address_door_street' || n === 'door_street') comm.doorOrStreet = raw;
  else if (n === 'address_landmark' || n === 'landmark') comm.landmark = raw;
  else if (n === 'address_village_city' || n === 'village' || n === 'city' || n === 'address_village') {
    comm.villageOrCity = raw;
  } else if (n === 'state' || n === 'address_state') {
    comm.state = raw;
    comm.district = '';
    comm.mandal = '';
  } else if (n === 'address_district' || n === 'district') {
    comm.district = raw;
    comm.mandal = '';
  } else if (n === 'address_mandal' || n === 'mandal') comm.mandal = raw;
  else if (n === 'pincode' || n === 'pin_code' || n === 'address_pin_code') comm.pinCode = raw;
  else return prev;

  return {
    ...prev,
    address: { ...prev.address, communication: comm },
  };
}
