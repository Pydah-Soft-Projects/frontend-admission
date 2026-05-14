/**
 * Registration form file fields for applicant / parent portraits on the joining page.
 * Used by `JoiningDynamicRegistrationFields` and submit validation in `JoiningLeadFormWorkspace`.
 */

export type JoiningRegistrationPhotoFieldLike = {
  fieldType?: string;
  fieldName?: string;
  fieldLabel?: string;
};

function normKey(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function isJoiningFatherPortraitFileField(field: JoiningRegistrationPhotoFieldLike): boolean {
  if (field.fieldType !== 'file') return false;
  const name = normKey(field.fieldName || '');
  const label = normKey(field.fieldLabel || '');
  const hay = `${name} ${label}`;
  const mentionsFather = name.includes('father') || label.includes('father') || name.includes('fatherphoto');
  if (!mentionsFather) return false;
  if (hay.includes('aadhaar') || hay.includes('marksheet') || hay.includes('certificate') || hay.includes('signature')) {
    return false;
  }
  return (
    hay.includes('photo') ||
    hay.includes('picture') ||
    hay.includes('image') ||
    name.includes('photo') ||
    name.includes('picture')
  );
}

export function isJoiningMotherPortraitFileField(field: JoiningRegistrationPhotoFieldLike): boolean {
  if (field.fieldType !== 'file') return false;
  const name = normKey(field.fieldName || '');
  const label = normKey(field.fieldLabel || '');
  const hay = `${name} ${label}`;
  const mentionsMother = name.includes('mother') || label.includes('mother') || name.includes('motherphoto');
  if (!mentionsMother) return false;
  if (hay.includes('aadhaar') || hay.includes('marksheet') || hay.includes('certificate') || hay.includes('signature')) {
    return false;
  }
  return (
    hay.includes('photo') ||
    hay.includes('picture') ||
    hay.includes('image') ||
    name.includes('photo') ||
    name.includes('picture')
  );
}

/** Student / applicant portrait — not parent portraits or generic certificates. */
export function isJoiningStudentPortraitUploadField(field: JoiningRegistrationPhotoFieldLike): boolean {
  if (field.fieldType !== 'file') return false;
  if (isJoiningFatherPortraitFileField(field) || isJoiningMotherPortraitFileField(field)) {
    return false;
  }
  const name = normKey(field.fieldName || '');
  const label = normKey(field.fieldLabel || '');
  if (
    name.includes('father') ||
    name.includes('mother') ||
    name.includes('parent') ||
    name.includes('guardian') ||
    label.includes('father') ||
    label.includes('mother') ||
    label.includes('parent') ||
    label.includes('guardian')
  ) {
    return false;
  }
  const hay = `${name} ${label}`;
  if (hay.includes('aadhaar') || hay.includes('marksheet') || hay.includes('certificate')) return false;
  if (name.includes('student_photo') || name.includes('studentphoto')) return true;
  if (hay.includes('student') && (hay.includes('photo') || hay.includes('picture') || hay.includes('image'))) {
    return true;
  }
  if (hay.includes('applicant') && (hay.includes('photo') || hay.includes('picture'))) return true;
  if (hay.includes('passport') && hay.includes('photo')) return true;
  if (hay.includes('profile') && hay.includes('photo')) return true;
  return false;
}
