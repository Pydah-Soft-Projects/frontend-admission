/**
 * Registration forms from the student DB often include course / branch / quota.
 * Batch and academic year fields stay visible when the form defines them — the joining page prefills those from the lead.
 * On the joining edit page those are already captured in **Course & Quota** or the structured
 * student/parent blocks (e.g. Aadhaar, reservation / caste, communication address on joining), so we hide them from
 * the dynamic registration block.
 */

function norm(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/** Exact `fieldName` / JSON `key` values (after norm) to omit on joining. */
const HIDDEN_EXACT = new Set(
  [
    'course',
    'courses',
    'course_name',
    'coursename',
    'course_id',
    'courseid',
    'managed_course',
    'select_course',
    'selected_course',
    'preferred_course',
    'interested_course',
    'admission_course',
    'branch',
    'branches',
    'branch_name',
    'branchname',
    'branch_id',
    'branchid',
    'managed_branch',
    'select_branch',
    'selected_branch',
    'preferred_branch',
    'admission_branch',
    'quota',
    'student_type',
    'studenttype',
    'admission_quota',
    'quota_type',
    'seat_quota',
    'course_interested',
    'courseinterested',
    'college_preference',
    'first_preference',
    'second_preference',
    'campus',
    'campus_id',
    'campus_name',
    'interested_branch',
    'option_1_branch',
    'option_2_branch',
    'option_1_course',
    'option_2_course',
    'aadhaar',
    'aadhar',
    'aadhaar_number',
    'aadhar_number',
    'aadhaarnumber',
    'aadharnumber',
    'student_aadhaar',
    'student_aadhaar_number',
    'student_aadharnumber',
    'uid',
    'uid_number',
    'unique_id',
    'caste',
    'castes',
    'student_caste',
    'caste_name',
    'castename',
    'caste_category',
    'category_caste',
    'religion_caste',
    'social_category',
    'socialcategory',
    // Communication / postal address (structured block on joining page)
    'address',
    'address_door_street',
    'door_street',
    'door_no',
    'door_number',
    'd_no',
    'dno',
    'house_no',
    'house_number',
    'houseno',
    'plot_no',
    'plot_number',
    'street',
    'street_name',
    'road',
    'area',
    'locality',
    'sector',
    'colony',
    'address_line1',
    'address_line2',
    'address_line_1',
    'address_line_2',
    'addressline1',
    'addressline2',
    'address_landmark',
    'landmark',
    'nearest_landmark',
    'address_village_city',
    'address_village',
    'village',
    'village_name',
    'city',
    'city_name',
    'city_village',
    'cityvillage',
    'town',
    'town_name',
    'mandal',
    'mandal_name',
    'taluka',
    'tehsil',
    'address_mandal',
    'district',
    'district_name',
    'address_district',
    'state',
    'state_name',
    'address_state',
    'pincode',
    'pin_code',
    'pin_number',
    'pinnumber',
    'postal_pin',
    'zipcode',
    'zip_code',
    'postal_code',
    'postcode',
    'address_pin_code',
    'communication_address',
    'correspondence_address',
    'mailing_address',
    'permanent_address',
    'present_address',
    'current_address',
    'residential_address',
    'student_address',
    'local_address',
    'country',
    'country_name',
    'father_name',
    'fathername',
    'reference',
    'reference1',
    'reference_name',
    'referencename',
    'reference_1',
  ].map((x) => norm(x))
);

/**
 * True when normalized key/label is in the hidden set, or clearly refers to Aadhaar / caste / address
 * (covers opaque `fieldName` from embedded JSON where only `fieldLabel` is human-readable).
 */
function looksLikeAddressNorm(n: string): boolean {
  if (!n) return false;
  // Physical / postal address (avoid broad `city` / `state` substrings — false positives like "velocity").
  if (n === 'address' || n.startsWith('address_')) return true;
  if ((n.endsWith('_address') || n.includes('_address_')) && !n.includes('email')) return true;
  if (
    n.includes('pincode') ||
    n.includes('pin_code') ||
    n.includes('pin_number') ||
    n.includes('postal_code') ||
    n.includes('postcode')
  ) {
    return true;
  }
  if (n.includes('zipcode') || n.includes('zip_code')) return true;
  if (n.includes('door_no') || n.includes('door_number') || n.includes('house_no') || n.includes('house_number')) {
    return true;
  }
  if (n.includes('landmark')) return true;
  if (n.includes('mandal') || n.includes('taluka') || n.includes('tehsil')) return true;
  if (n.includes('village') || n.includes('city_village') || n.includes('cityvillage')) return true;
  return false;
}

function isHiddenNorm(n: string): boolean {
  if (!n) return false;
  if (HIDDEN_EXACT.has(n)) return true;
  if (n.includes('aadhar') || n.includes('aadhaar')) return true;
  if (n.includes('caste')) return true;
  if (looksLikeAddressNorm(n)) return true;

  // Extra student / applicant mobile fields (student phone is captured on the structured joining form).
  if (
    (n.startsWith('student_') || n.startsWith('applicant_') || n.startsWith('candidate_')) &&
    (n.includes('mobile') || n.includes('mobileno') || n.includes('cell') || n.includes('whatsapp') || n.includes('sms'))
  ) {
    return true;
  }
  if (
    n.startsWith('student_phone') ||
    n === 'studentphone' ||
    n === 'studentphonenumber' ||
    n === 'student_mobile' ||
    n === 'student_mobileno' ||
    n === 'student_cell' ||
    n === 'student_cellphone' ||
    n === 'applicant_mobile' ||
    n === 'candidate_mobile'
  ) {
    return true;
  }

  // Parent / guardian "mobile number 1" and "mobile number 2" style slots from registration JSON.
  if (
    (n.includes('parent') || n.includes('guardian')) &&
    (n.includes('mobile') || n.includes('mobileno') || n.includes('mob_no') || n.includes('phoneno') || n.includes('phone')) &&
    (n.includes('_1') || n.includes('_2') || /number[_\s]*[12]\b/.test(n) || /[_\s][12]$/.test(n) || /[12]_(mobile|phone)/.test(n))
  ) {
    return true;
  }
  if (/parent[_\s]*(mobile|phone|mobileno)[_\s]*(no|num|number)?[_\s]*(1|2)\b/.test(n)) return true;
  if (/(mobile|phone|mobileno)[_\s]*(no|num|number)?[_\s]*(1|2)\b.*parent|parent.*(mobile|phone).*(1|2)\b/.test(n)) {
    return true;
  }

  return false;
}

/** Hide by persisted registration JSON key (extras). */
export function isJoiningRegistrationFieldHiddenFromForm(fieldName: string): boolean {
  return isHiddenNorm(norm(fieldName));
}

/** Hide a field from the joining dynamic block using technical name and/or display label. */
export function isJoiningRegistrationFieldHidden(field: {
  fieldName?: string;
  fieldLabel?: string;
}): boolean {
  return isHiddenNorm(norm(field.fieldName || '')) || isHiddenNorm(norm(field.fieldLabel || ''));
}

const CERTIFICATION_STATUS_FORM_KEYS = new Set(
  [
    'certification',
    'certification_status',
    'certificationstatus',
    'certificate_status',
    'certificatestatus',
    /** Common in form builder: label "CERTIFICATES STATUS" / fieldName certificatesStatus */
    'certificates_status',
    'certificatesstatus',
  ].map((x) => norm(x))
);

/**
 * Default registration form fields for aggregate certification / verification status.
 * Shown on the joining page as read-only; the parent passes values derived from the certificate checklist.
 */
export function isJoiningRegistrationCertificationStatusField(field: {
  fieldName?: string;
  fieldLabel?: string;
}): boolean {
  return (
    CERTIFICATION_STATUS_FORM_KEYS.has(norm(String(field.fieldName || ''))) ||
    CERTIFICATION_STATUS_FORM_KEYS.has(norm(String(field.fieldLabel || '')))
  );
}

/**
 * Same technical `fieldName` twice (common in embedded `form_fields` JSON) would render duplicate rows.
 * Keeps the first occurrence in array order (caller should sort by `displayOrder` first).
 */
export function dedupeJoiningRegistrationDisplayFields<
  T extends { fieldName?: string; fieldLabel?: string; _id?: string; id?: string },
>(fields: T[]): T[] {
  if (!fields.length) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (let i = 0; i < fields.length; i += 1) {
    const f = fields[i];
    const nameKey = norm(String(f.fieldName || ''));
    const idPart = String((f as { _id?: string })._id || (f as { id?: string }).id || '').trim();
    const key = nameKey || (idPart ? `__id:${idPart}` : `__anon:${i}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export function filterJoiningRegistrationDisplayFields<T extends { fieldName?: string; fieldLabel?: string }>(
  fields: T[] | undefined | null
): T[] {
  if (!fields?.length) return [];
  const filtered = fields.filter(
    (f) =>
      !isJoiningRegistrationFieldHidden(f) && !isJoiningRegistrationCertificationStatusField(f)
  );
  return dedupeJoiningRegistrationDisplayFields(filtered);
}

/** Remove redundant keys before persisting `registrationFormData` or when hydrating extras. */
export function stripJoiningRedundantRegistrationExtras(
  obj: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return {};
  const next: Record<string, unknown> = { ...obj };
  for (const k of Object.keys(next)) {
    if (isJoiningRegistrationFieldHiddenFromForm(k)) {
      delete next[k];
    }
  }
  return next;
}
