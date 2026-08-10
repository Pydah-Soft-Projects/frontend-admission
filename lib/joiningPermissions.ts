import type { ModulePermission } from '@/types';

export const JOINING_PERMISSION_KEY = 'joining';

export type JoiningPermissionExtras = Pick<
  ModulePermission,
  'editReference' | 'editAdmission' | 'approveFeeRequest' | 'requireStudentPhoto'
>;

export type JoiningDeskPageKey =
  | 'confirmed'
  | 'self-registration'
  | 'pipeline'
  | 'fee-requests'
  | 'admissions';

export type AdmissionTabKey =
  | 'abstract'
  | 'student-info'
  | 'reference-list'
  | 'source-list'
  | 'date-wise';

/** Labels match Joining Desk sidebar pages. */
export const JOINING_DESK_PAGES: { key: JoiningDeskPageKey; label: string }[] = [
  { key: 'confirmed', label: 'Confirmed Leads' },
  { key: 'self-registration', label: 'Self Registration' },
  { key: 'pipeline', label: 'Joining Pipeline' },
  { key: 'fee-requests', label: 'Fee Requests' },
  { key: 'admissions', label: 'Admissions' },
];

const JOINING_PAGE_FLAG_KEYS = {
  confirmed: 'pageConfirmedLeads',
  'self-registration': 'pageSelfRegistration',
  pipeline: 'pageJoiningPipeline',
  'fee-requests': 'pageFeeRequests',
  admissions: 'pageAdmissions',
} as const satisfies Record<JoiningDeskPageKey, keyof ModulePermission>;

export type JoiningDeskPagePermissionExtras = Pick<
  ModulePermission,
  | 'pageConfirmedLeads'
  | 'pageSelfRegistration'
  | 'pageJoiningPipeline'
  | 'pageFeeRequests'
  | 'pageAdmissions'
>;

export function joiningPagePermissionKey(page: JoiningDeskPageKey): keyof ModulePermission {
  return JOINING_PAGE_FLAG_KEYS[page];
}

/** Labels match the Admissions page (`/superadmin/joining/completed`) tab bar. */
export const ADMISSION_PAGE_TABS: { key: AdmissionTabKey; label: string }[] = [
  { key: 'abstract', label: 'Abstract' },
  { key: 'student-info', label: 'Student Info' },
  { key: 'reference-list', label: 'Reference' },
  { key: 'source-list', label: 'Source' },
  { key: 'date-wise', label: 'Date-wise' },
];

const ADMISSION_TAB_FLAG_KEYS = {
  abstract: 'admissionTabAbstract',
  'student-info': 'admissionTabStudentInfo',
  'reference-list': 'admissionTabReference',
  'source-list': 'admissionTabSource',
  'date-wise': 'admissionTabDateWise',
} as const satisfies Record<AdmissionTabKey, keyof ModulePermission>;

export type AdmissionTabPermissionExtras = Pick<
  ModulePermission,
  | 'admissionTabAbstract'
  | 'admissionTabStudentInfo'
  | 'admissionTabReference'
  | 'admissionTabSource'
  | 'admissionTabDateWise'
>;

export function admissionTabPermissionKey(tab: AdmissionTabKey): keyof ModulePermission {
  return ADMISSION_TAB_FLAG_KEYS[tab];
}

/** Default joining extras for new Sub Super Admin users. */
export function defaultJoiningPermissionExtras(): JoiningPermissionExtras {
  return {
    editReference: false,
    editAdmission: false,
    approveFeeRequest: false,
    requireStudentPhoto: false,
  };
}

/** Default joining desk page flags (none selected). */
export function defaultJoiningPageExtras(): JoiningDeskPagePermissionExtras {
  return {
    pageConfirmedLeads: false,
    pageSelfRegistration: false,
    pageJoiningPipeline: false,
    pageFeeRequests: false,
    pageAdmissions: false,
  };
}

/** Default admissions page tab flags (none selected). */
export function defaultAdmissionTabExtras(): AdmissionTabPermissionExtras {
  return {
    admissionTabAbstract: false,
    admissionTabStudentInfo: false,
    admissionTabReference: false,
    admissionTabSource: false,
    admissionTabDateWise: false,
  };
}

/** Legacy joining access without per-page flags: all desk pages allowed. */
export function isLegacyJoiningPages(entry?: ModulePermission): boolean {
  if (!entry?.access) return false;
  return JOINING_DESK_PAGES.every(({ key }) => entry[joiningPagePermissionKey(key)] === undefined);
}

/** Legacy joining access without per-tab flags: all admissions tabs allowed. */
export function isLegacyAdmissionTabs(entry?: ModulePermission): boolean {
  if (!entry?.access) return false;
  return ADMISSION_PAGE_TABS.every(({ key }) => entry[admissionTabPermissionKey(key)] === undefined);
}

export function resolveJoiningPageAccess(
  page: JoiningDeskPageKey,
  entry?: ModulePermission,
  isSuperAdmin = false
): boolean {
  if (isSuperAdmin) return true;
  if (!entry?.access) return false;
  if (isLegacyJoiningPages(entry)) return true;
  if (page === 'fee-requests' && resolveApproveFeeRequest(entry, isSuperAdmin)) return true;
  return Boolean(entry[joiningPagePermissionKey(page)]);
}

export function joiningPagesFromStored(entry?: ModulePermission): JoiningDeskPagePermissionExtras {
  const defaults = defaultJoiningPageExtras();
  if (!entry?.access) return defaults;
  if (isLegacyJoiningPages(entry)) {
    return {
      pageConfirmedLeads: true,
      pageSelfRegistration: true,
      pageJoiningPipeline: true,
      pageFeeRequests: true,
      pageAdmissions: true,
    };
  }
  return {
    pageConfirmedLeads: Boolean(entry.pageConfirmedLeads),
    pageSelfRegistration: Boolean(entry.pageSelfRegistration),
    pageJoiningPipeline: Boolean(entry.pageJoiningPipeline),
    pageFeeRequests: Boolean(entry.pageFeeRequests) || Boolean(entry.approveFeeRequest),
    pageAdmissions: Boolean(entry.pageAdmissions),
  };
}

export function enabledJoiningPageLabels(entry?: ModulePermission): string[] {
  const flags = joiningPagesFromStored(entry);
  return JOINING_DESK_PAGES.filter(
    ({ key }) => flags[joiningPagePermissionKey(key) as keyof JoiningDeskPagePermissionExtras]
  ).map(({ label }) => label);
}

function joiningPageFlagsForSave(value: ModulePermission): JoiningDeskPagePermissionExtras {
  return {
    pageConfirmedLeads: Boolean(value.pageConfirmedLeads),
    pageSelfRegistration: Boolean(value.pageSelfRegistration),
    pageJoiningPipeline: Boolean(value.pageJoiningPipeline),
    pageFeeRequests: Boolean(value.pageFeeRequests),
    pageAdmissions: Boolean(value.pageAdmissions),
  };
}

export function resolveAdmissionTabAccess(
  tab: AdmissionTabKey,
  entry?: ModulePermission,
  isSuperAdmin = false
): boolean {
  if (isSuperAdmin) return true;
  if (!entry?.access) return false;
  if (isLegacyAdmissionTabs(entry)) return true;
  return Boolean(entry[admissionTabPermissionKey(tab)]);
}

export function allowedAdmissionTabs(entry?: ModulePermission, isSuperAdmin = false): AdmissionTabKey[] {
  return ADMISSION_PAGE_TABS.filter(({ key }) => resolveAdmissionTabAccess(key, entry, isSuperAdmin)).map(
    ({ key }) => key
  );
}

export function admissionTabsFromStored(entry?: ModulePermission): AdmissionTabPermissionExtras {
  const defaults = defaultAdmissionTabExtras();
  if (!entry?.access) return defaults;
  if (isLegacyAdmissionTabs(entry)) {
    return {
      admissionTabAbstract: true,
      admissionTabStudentInfo: true,
      admissionTabReference: true,
      admissionTabSource: true,
      admissionTabDateWise: true,
    };
  }
  return {
    admissionTabAbstract: Boolean(entry.admissionTabAbstract),
    admissionTabStudentInfo: Boolean(entry.admissionTabStudentInfo),
    admissionTabReference: Boolean(entry.admissionTabReference),
    admissionTabSource: Boolean(entry.admissionTabSource),
    admissionTabDateWise: Boolean(entry.admissionTabDateWise),
  };
}

export function enabledAdmissionTabLabels(entry?: ModulePermission): string[] {
  const flags = admissionTabsFromStored(entry);
  return ADMISSION_PAGE_TABS.filter(
    ({ key }) => flags[admissionTabPermissionKey(key) as keyof AdmissionTabPermissionExtras]
  ).map(({ label }) => label);
}

function admissionTabFlagsForSave(value: ModulePermission): AdmissionTabPermissionExtras {
  return {
    admissionTabAbstract: Boolean(value.admissionTabAbstract),
    admissionTabStudentInfo: Boolean(value.admissionTabStudentInfo),
    admissionTabReference: Boolean(value.admissionTabReference),
    admissionTabSource: Boolean(value.admissionTabSource),
    admissionTabDateWise: Boolean(value.admissionTabDateWise),
  };
}

/** Super Admin / legacy write without flags: both edits allowed. */
export function isLegacyJoiningWrite(entry?: ModulePermission): boolean {
  if (!entry?.access || entry.permission !== 'write') return false;
  return (
    entry.editReference === undefined &&
    entry.editAdmission === undefined &&
    entry.approveFeeRequest === undefined
  );
}

/** Any joining desk Read & Write user may submit revised fee requests (no separate flag). */
export function resolveSubmitFeeRequest(entry?: ModulePermission, isSuperAdmin = false): boolean {
  if (isSuperAdmin) return true;
  return Boolean(entry?.access && entry.permission === 'write');
}

export function resolveJoiningEditReference(entry?: ModulePermission, isSuperAdmin = false): boolean {
  if (isSuperAdmin) return true;
  if (!entry?.access || entry.permission !== 'write') return false;
  if (isLegacyJoiningWrite(entry)) return true;
  return Boolean(entry.editReference);
}

export function resolveJoiningEditAdmission(entry?: ModulePermission, isSuperAdmin = false): boolean {
  if (isSuperAdmin) return true;
  if (!entry?.access || entry.permission !== 'write') return false;
  if (isLegacyJoiningWrite(entry)) return true;
  return Boolean(entry.editAdmission);
}

export function resolveApproveFeeRequest(entry?: ModulePermission, isSuperAdmin = false): boolean {
  if (isSuperAdmin) return true;
  if (!entry?.access || entry.permission !== 'write') return false;
  if (isLegacyJoiningWrite(entry)) return true;
  return Boolean(entry.approveFeeRequest);
}

/** Map stored permissions into form state when editing a user. */
export function joiningExtrasFromStored(entry?: ModulePermission): JoiningPermissionExtras {
  if (!entry?.access || entry.permission !== 'write') {
    return defaultJoiningPermissionExtras();
  }
  if (isLegacyJoiningWrite(entry)) {
    return {
      editReference: true,
      editAdmission: true,
      approveFeeRequest: true,
      requireStudentPhoto: false,
    };
  }
  return {
    editReference: Boolean(entry.editReference),
    editAdmission: Boolean(entry.editAdmission),
    approveFeeRequest: Boolean(entry.approveFeeRequest),
    requireStudentPhoto: Boolean(entry.requireStudentPhoto),
  };
}

/** Build joining slice for API save (Sub Super Admin). */
export function joiningPermissionForSave(value: ModulePermission): ModulePermission {
  const permission = value.permission === 'write' ? 'write' : 'read';
  const pageFlags = joiningPageFlagsForSave(value);
  const tabFlags = admissionTabFlagsForSave(value);
  const collegeScope = Array.isArray(value.allowedColleges) ? value.allowedColleges.filter((id) => typeof id === 'string') : [];
  // Approving fee requests implies Fee Requests page access.
  if (permission === 'write' && value.approveFeeRequest) {
    pageFlags.pageFeeRequests = true;
  }
  if (permission === 'read') {
    return { access: true, permission: 'read', allowedColleges: collegeScope, ...pageFlags, ...tabFlags };
  }
  return {
    access: true,
    permission: 'write',
    editReference: Boolean(value.editReference),
    editAdmission: Boolean(value.editAdmission),
    approveFeeRequest: Boolean(value.approveFeeRequest),
    requireStudentPhoto: Boolean(value.requireStudentPhoto),
    allowedColleges: collegeScope,
    ...pageFlags,
    ...tabFlags,
  };
}

export function modulePermissionForSave(
  key: string,
  value: ModulePermission
): ModulePermission {
  if (key === JOINING_PERMISSION_KEY) {
    return joiningPermissionForSave(value);
  }
  return {
    access: true,
    permission: value.permission === 'read' ? 'read' : 'write',
  };
}
