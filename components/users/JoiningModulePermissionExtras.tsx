'use client';

import type { ModulePermission } from '@/types';

type JoiningModulePermissionExtrasProps = {
  moduleState: ModulePermission;
  onChange: (patch: Partial<Pick<ModulePermission, 'editReference' | 'editAdmission'>>) => void;
};

export function JoiningModulePermissionExtras({ moduleState, onChange }: JoiningModulePermissionExtrasProps) {
  if (moduleState.permission !== 'write') {
    return null;
  }

  return (
    <div className="mt-3 w-full border-t border-blue-100 pt-3 dark:border-blue-900/30">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.3em] text-blue-600 dark:text-blue-200">
        Joining desk edit options
      </p>
      <p className="mb-2 text-[11px] text-slate-600 dark:text-slate-400">
        Only users with Read &amp; Write can be granted these actions. Read-only access cannot edit.
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-blue-100/80 bg-white/80 p-2 text-[11px] font-medium text-slate-700 dark:border-blue-900/40 dark:bg-slate-900/60 dark:text-slate-200">
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            checked={Boolean(moduleState.editReference)}
            onChange={(e) => onChange({ editReference: e.target.checked })}
          />
          <span>
            Edit reference
            <span className="mt-0.5 block font-normal text-slate-500 dark:text-slate-400">
              Update Reference 1 on admissions
            </span>
          </span>
        </label>
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
      </div>
    </div>
  );
}
