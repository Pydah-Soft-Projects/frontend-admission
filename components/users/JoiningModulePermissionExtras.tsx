'use client';

import type { ModulePermission } from '@/types';
import {
  ADMISSION_PAGE_TABS,
  admissionTabPermissionKey,
  type AdmissionTabKey,
} from '@/lib/joiningPermissions';

type JoiningModulePermissionExtrasProps = {
  moduleState: ModulePermission;
  onChange: (
    patch: Partial<
      Pick<ModulePermission, 'editAdmission' | 'approveFeeRequest'> &
        Record<ReturnType<typeof admissionTabPermissionKey>, boolean>
    >
  ) => void;
};

export function JoiningModulePermissionExtras({ moduleState, onChange }: JoiningModulePermissionExtrasProps) {
  return (
    <>
      {moduleState.permission === 'write' ? (
        <div className="mt-3 w-full border-t border-blue-100 pt-3 dark:border-blue-900/30">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-blue-600 dark:text-blue-200">
            Joining desk edit options
          </p>
          <p className="mb-2 text-[11px] text-slate-600 dark:text-slate-400">
            Only users with Read &amp; Write can be granted these actions. Read-only access cannot edit.
            Revised fee requests can be submitted by any joining desk user with Read &amp; Write.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-blue-100/80 bg-white/80 p-2 text-[11px] font-medium text-slate-700 dark:border-blue-900/40 dark:bg-slate-900/60 dark:text-slate-200">
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={Boolean(moduleState.editAdmission)}
                onChange={(e) => onChange({ editAdmission: e.target.checked })}
              />
              <span>
                Edit admission
                <span className="mt-0.5 block font-normal text-slate-500 dark:text-slate-400">
                  Open and edit joining / admission forms
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-blue-100/80 bg-white/80 p-2 text-[11px] font-medium text-slate-700 dark:border-blue-900/40 dark:bg-slate-900/60 dark:text-slate-200 sm:col-span-2">
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={Boolean(moduleState.approveFeeRequest)}
                onChange={(e) => onChange({ approveFeeRequest: e.target.checked })}
              />
              <span>
                Approve fee requests
                <span className="mt-0.5 block font-normal text-slate-500 dark:text-slate-400">
                  Review and approve pending revised fees on the Fee Requests desk
                </span>
              </span>
            </label>
          </div>
        </div>
      ) : null}

      <div className="mt-3 w-full border-t border-blue-100 pt-3 dark:border-blue-900/30">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-blue-600 dark:text-blue-200">
          Admissions page tabs
        </p>
        <p className="mb-2 text-[11px] text-slate-600 dark:text-slate-400">
          Choose which tabs appear on the Joining Desk → Admissions page (Abstract, Detailed, Student
          Info, and others).
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ADMISSION_PAGE_TABS.map(({ key, label }) => {
            const flagKey = admissionTabPermissionKey(key as AdmissionTabKey);
            return (
              <label
                key={key}
                className="flex cursor-pointer items-start gap-2 rounded-lg border border-blue-100/80 bg-white/80 p-2 text-[11px] font-medium text-slate-700 dark:border-blue-900/40 dark:bg-slate-900/60 dark:text-slate-200"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={Boolean(moduleState[flagKey])}
                  onChange={(e) => onChange({ [flagKey]: e.target.checked })}
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </>
  );
}
