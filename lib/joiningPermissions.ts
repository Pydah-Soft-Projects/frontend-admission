import type { ModulePermission } from '@/types';

export const JOINING_PERMISSION_KEY = 'joining';

export type JoiningPermissionExtras = Pick<
  ModulePermission,
  'editReference' | 'editAdmission' | 'approveFeeRequest'
>;

/** Default joining extras for new Sub Super Admin users. */
export function defaultJoiningPermissionExtras(): JoiningPermissionExtras {
  return {
    editReference: false,
    editAdmission: false,
    approveFeeRequest: false,
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
    };
  }
  return {
    editReference: Boolean(entry.editReference),
    editAdmission: Boolean(entry.editAdmission),
    approveFeeRequest: Boolean(entry.approveFeeRequest),
  };
}

/** Build joining slice for API save (Sub Super Admin). */
export function joiningPermissionForSave(value: ModulePermission): ModulePermission {
  const permission = value.permission === 'write' ? 'write' : 'read';
  if (permission === 'read') {
    return { access: true, permission: 'read' };
  }
  return {
    access: true,
    permission: 'write',
    editReference: Boolean(value.editReference),
    editAdmission: Boolean(value.editAdmission),
    approveFeeRequest: Boolean(value.approveFeeRequest),
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
