import {
  isCurrentAcademicYearField,
  isJoiningRegistrationBatchField,
} from '@/lib/joiningAcademicYearRegistration';
import { isScholarshipStatusField } from '@/lib/joiningScholarshipQuotaDefault';

export type JoiningRegistrationFieldLike = {
  fieldName?: string;
  fieldLabel?: string;
  fieldType?: string;
};

function normKey(s: string) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/** Previous institution block — fields after this (by display order) pack before photos. */
export function isPreviousCollegeField(field: JoiningRegistrationFieldLike): boolean {
  const n = normKey(field.fieldName || '');
  const l = normKey(field.fieldLabel || '');
  const hay = `${n} ${l}`;
  return (
    n.includes('previous_college') ||
    n.includes('previouscollege') ||
    l.includes('previous_college') ||
    l.includes('previouscollege') ||
    (hay.includes('previous') && hay.includes('college'))
  );
}

/** APAAR / APAR ID field from student-database registration form. */
export function isApaarIdField(field: JoiningRegistrationFieldLike): boolean {
  const n = normKey(field.fieldName || '');
  const l = normKey(field.fieldLabel || '');
  const hay = `${n} ${l}`.replace(/_/g, ' ');
  return (
    n.includes('apaar') ||
    n.includes('apar_id') ||
    n.includes('apaar_id') ||
    hay.includes('apaar') ||
    (hay.includes('apar') && hay.includes('id'))
  );
}

export function isFixedAcademicYearField(field: JoiningRegistrationFieldLike): boolean {
  const n = normKey(field.fieldName || '');
  return n === 'academic_year' || n === 'academicyear' || n === 'current_year' || n === 'currentyear';
}

export function isFixedSemesterField(field: JoiningRegistrationFieldLike): boolean {
  const n = normKey(field.fieldName || '');
  return n === 'current_semester' || n === 'currentsemester' || n === 'semester' || n === 'semister';
}

/**
 * Joining Step 1 student profile order:
 * Name → DOB → Batch → Gender → Admission date → Scholar status → Student status → Previous college → APAAR (+ mobile/Aadhaar row).
 */
export function joiningStudentProfileFieldRank(
  field: JoiningRegistrationFieldLike & { displayOrder?: number }
): number {
  const n = normKey(field.fieldName || '');
  const l = normKey(field.fieldLabel || '');
  const hay = `${n} ${l}`;

  if (n === 'student_name' || n === 'name' || (hay.includes('student') && hay.includes('name'))) {
    return 10;
  }
  if (
    n.includes('date_of_birth') ||
    n === 'dob' ||
    n.includes('birth_date') ||
    n.includes('birthdate') ||
    (hay.includes('date') && hay.includes('birth'))
  ) {
    return 20;
  }
  if (isJoiningRegistrationBatchField(field.fieldName || '', field.fieldLabel || '')) {
    return 30;
  }
  if (n === 'student_gender' || n === 'gender') {
    return 40;
  }
  if (
    (hay.includes('admission') && hay.includes('date')) ||
    n === 'admission_date' ||
    n === 'date_of_admission'
  ) {
    return 50;
  }
  if (isScholarshipStatusField(field)) {
    return 60;
  }
  if (n === 'student_status' || n === 'studentstatus') {
    return 70;
  }
  if (isPreviousCollegeField(field)) {
    return 80;
  }
  if (isApaarIdField(field)) {
    return 90;
  }

  return 500 + (field.displayOrder ?? 0);
}

export function sortJoiningRegistrationProfileFields<
  T extends JoiningRegistrationFieldLike & { displayOrder?: number },
>(fields: T[]): T[] {
  return [...fields].sort((a, b) => {
    const rankA = joiningStudentProfileFieldRank(a);
    const rankB = joiningStudentProfileFieldRank(b);
    if (rankA !== rankB) return rankA - rankB;
    return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
  });
}

/** Intake year / semester fields rendered beside Course & Quota on the joining form. */
export function isJoiningRegistrationIntakeField(field: JoiningRegistrationFieldLike): boolean {
  return (
    isFixedAcademicYearField(field) ||
    isFixedSemesterField(field) ||
    isCurrentAcademicYearField(field.fieldName || '', field.fieldLabel || '')
  );
}

export function splitRegistrationGridFields<
  T extends JoiningRegistrationFieldLike & { fieldName: string },
>(fields: T[], options: { omitApaar?: boolean; omitIntake?: boolean }): {
  beforePreviousCollege: T[];
  previousCollegeFields: T[];
  afterPreviousCollege: T[];
  showPreviousCollegeContactRow: boolean;
} {
  let list = [...fields];
  if (options.omitApaar) {
    list = list.filter((f) => !isApaarIdField(f));
  }
  if (options.omitIntake) {
    list = list.filter((f) => !isJoiningRegistrationIntakeField(f));
  }

  const firstPrevIdx = list.findIndex(isPreviousCollegeField);
  if (firstPrevIdx < 0) {
    return {
      beforePreviousCollege: list,
      previousCollegeFields: [],
      afterPreviousCollege: [],
      showPreviousCollegeContactRow: false,
    };
  }

  const previousCollegeFields = list.filter(isPreviousCollegeField);
  const prevNames = new Set(previousCollegeFields.map((f) => f.fieldName));
  const beforePreviousCollege = list.slice(0, firstPrevIdx);
  const afterPreviousCollege = list.slice(firstPrevIdx).filter((f) => !prevNames.has(f.fieldName));

  return {
    beforePreviousCollege,
    previousCollegeFields,
    afterPreviousCollege,
    showPreviousCollegeContactRow: previousCollegeFields.length > 0,
  };
}
