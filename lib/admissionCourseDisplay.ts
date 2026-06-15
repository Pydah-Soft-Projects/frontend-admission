import {
  formatBtechCourseDisplayLabel,
  isBtechCourseFromCatalog,
  isLateralRegistrationExtras,
} from '@/lib/joiningAcademicYearRegistration';

type RegistrationExtrasSource = {
  course?: string | null;
  courseId?: string | null;
  getCourseName?: (courseId?: string | null) => string;
  registrationFormData?: Record<string, unknown> | null;
  leadData?: Record<string, unknown> | null;
  admissionNumber?: string | null;
};

const pickRegistrationExtras = (args: RegistrationExtrasSource): Record<string, unknown> => {
  if (args.registrationFormData && typeof args.registrationFormData === 'object') {
    return args.registrationFormData;
  }
  const fromLead = args.leadData?._joiningRegistrationExtras;
  if (fromLead && typeof fromLead === 'object') {
    return fromLead as Record<string, unknown>;
  }
  return {};
};

/** Course label for admissions/joining UI — appends `(LATERAL)` for B.Tech lateral batch. */
export function resolveAdmissionCourseDisplayLabel(args: RegistrationExtrasSource): string {
  const fromStored = String(args.course || '').trim();
  const fromCatalog = String(args.getCourseName?.(args.courseId) || '').trim();
  const base = fromStored || fromCatalog;
  if (!base) return '';

  if (!isBtechCourseFromCatalog(base, null)) return base;

  const lateral = isLateralRegistrationExtras(
    pickRegistrationExtras(args),
    args.admissionNumber
  );
  return formatBtechCourseDisplayLabel(base, lateral);
}

type JoiningOrAdmissionLike = {
  courseInfo?: { course?: string; courseId?: string | null };
  registrationFormData?: Record<string, unknown> | null;
  leadData?: Record<string, unknown> | null;
  admissionNumber?: string | null;
  lead?: { courseInterested?: string | null };
};

/** Course label for admission stats cards / aggregates (`lateralTrack` from stats API). */
export function resolveAdmissionStatCourseLabel(args: {
  courseId?: string | null;
  courseName?: string | null;
  lateralTrack?: number | string | null;
  getCourseName?: (courseId?: string | null) => string;
}): string {
  const fromApi = String(args.courseName || '').trim();
  const fromCatalog = String(args.getCourseName?.(args.courseId) || '').trim();

  const genericLabels = new Set([
    'degree',
    'diploma',
    'inter',
    '10th',
    '10+2',
    'others',
    'dap-ptv',
  ]);
  const isGeneric = (name: string) => {
    const n = name.trim().toLowerCase();
    return !n || genericLabels.has(n);
  };

  let base =
    fromApi && !isGeneric(fromApi) ? fromApi : fromCatalog || fromApi;
  if (!base) return 'Other';

  base = base.replace(/\s*\(lateral\)\s*/gi, '').trim();
  const hasExplicitTrack = args.lateralTrack != null && args.lateralTrack !== '';
  const isLateral = hasExplicitTrack
    ? Number(args.lateralTrack) === 1
    : /\(lateral\)/i.test(fromApi);

  if (isBtechCourseFromCatalog(base, null)) {
    return formatBtechCourseDisplayLabel(base, isLateral);
  }
  return isLateral && /\(lateral\)/i.test(fromApi) ? fromApi : base;
}

export function resolveJoiningOrAdmissionCourseLabel(
  record: JoiningOrAdmissionLike | null | undefined,
  getCourseName?: (courseId?: string | null) => string
): string {
  if (!record) return '';
  const leadCourse =
    String(record.lead?.courseInterested ?? '').trim() ||
    String((record.leadData as { courseInterested?: string } | undefined)?.courseInterested ?? '').trim();
  return resolveAdmissionCourseDisplayLabel({
    course: record.courseInfo?.course || leadCourse || undefined,
    courseId: record.courseInfo?.courseId,
    getCourseName,
    registrationFormData: record.registrationFormData,
    leadData: record.leadData,
    admissionNumber: record.admissionNumber,
  });
}
