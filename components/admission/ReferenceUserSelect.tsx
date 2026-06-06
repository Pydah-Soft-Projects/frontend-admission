'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Pencil, Search, Trash2, UserPlus, X } from 'lucide-react';
import { admissionAPI, userAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { QuickAddReferenceUserDialog } from '@/components/admission/QuickAddReferenceUserDialog';
import {
  ReferenceNameManageDialog,
  type ReferenceNameManageMode,
} from '@/components/admission/ReferenceNameManageDialog';
import type { User } from '@/types';

export const REFERENCE_NAMES_QUERY_KEY = ['admissions', 'reference-names'] as const;

type ReferenceUserSelectProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Show a button to enter a custom reference name (not a portal account). */
  showAddUserButton?: boolean;
  /** Show edit/remove on saved reference rows (defaults to showAddUserButton). */
  showManageSavedReferences?: boolean;
};

const normalizeName = (s: string) => s.trim().toLowerCase();

export function ReferenceUserSelect({
  value,
  onChange,
  label = 'Reference',
  id,
  disabled = false,
  className = '',
  showAddUserButton = false,
  showManageSavedReferences,
}: ReferenceUserSelectProps) {
  const canManageSaved = showManageSavedReferences ?? showAddUserButton;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [manageDialog, setManageDialog] = useState<{
    mode: ReferenceNameManageMode;
    name: string;
    localOnly: boolean;
  } | null>(null);
  /** Names added via Add before the record is saved to the server. */
  const [pendingCustomNames, setPendingCustomNames] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['users', 'reference-picker'],
    queryFn: async () => {
      const response = await userAPI.getAll();
      return response.data ?? response;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: savedReferenceNames = [], isLoading: refsLoading } = useQuery({
    queryKey: [...REFERENCE_NAMES_QUERY_KEY],
    queryFn: () => admissionAPI.listReferenceNames(),
    staleTime: 60 * 1000,
  });

  const savedNameKeys = useMemo(
    () => new Set(savedReferenceNames.map((n) => normalizeName(String(n)))),
    [savedReferenceNames]
  );

  const isManaging = Boolean(manageDialog);

  const users = useMemo(() => {
    const list = (Array.isArray(usersData) ? usersData : (usersData as { data?: User[] })?.data ?? []) as User[];
    return list
      .filter((u) => u.isActive !== false)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [usersData]);

  const portalNameKeys = useMemo(
    () => new Set(users.map((u) => normalizeName(u.name))),
    [users]
  );

  const trimmedValue = value.trim();

  /** Names used on past admissions/joinings that are not portal staff accounts. */
  const savedCustomReferences = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (raw: string) => {
      const name = String(raw ?? '').trim();
      if (!name) return;
      const key = normalizeName(name);
      if (portalNameKeys.has(key)) return;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(name);
    };
    for (const raw of savedReferenceNames) add(raw);
    for (const raw of pendingCustomNames) add(raw);
    if (trimmedValue) add(trimmedValue);
    return out.sort((a, b) => a.localeCompare(b));
  }, [savedReferenceNames, portalNameKeys, pendingCustomNames, trimmedValue]);

  const filteredCustomReferences = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return savedCustomReferences;
    return savedCustomReferences.filter((name) => name.toLowerCase().includes(q));
  }, [savedCustomReferences, search]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = `${u.name} ${u.email} ${u.roleName} ${u.designation ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, search]);

  const matchedUser = users.find((u) => normalizeName(u.name) === normalizeName(trimmedValue));
  const isCustomSavedValue = Boolean(
    trimmedValue && !matchedUser && savedCustomReferences.some((n) => normalizeName(n) === normalizeName(trimmedValue))
  );
  const isLegacyValue = Boolean(trimmedValue && !matchedUser && !isCustomSavedValue);

  const triggerLabel = trimmedValue
    ? matchedUser
      ? matchedUser.name
      : trimmedValue
    : '';

  const invalidateReferenceNames = () => {
    void queryClient.invalidateQueries({ queryKey: [...REFERENCE_NAMES_QUERY_KEY] });
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
    setSearch('');
  };

  const handleReferenceAdded = (referenceName: string) => {
    const trimmed = referenceName.trim();
    if (trimmed) {
      setPendingCustomNames((prev) => {
        const key = normalizeName(trimmed);
        if (prev.some((n) => normalizeName(n) === key)) return prev;
        return [...prev, trimmed];
      });
    }
    onChange(trimmed);
    invalidateReferenceNames();
  };

  const openManageDialog = (mode: ReferenceNameManageMode, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const localOnly = !savedNameKeys.has(normalizeName(trimmed));
    setManageDialog({ mode, name: trimmed, localOnly });
  };

  const handleManageRenamed = (oldName: string, newName: string) => {
    const oldTrim = oldName.trim();
    const newTrim = newName.trim();
    if (!oldTrim || !newTrim) return;
    setPendingCustomNames((prev) =>
      prev.map((n) => (normalizeName(n) === normalizeName(oldTrim) ? newTrim : n))
    );
    if (normalizeName(value) === normalizeName(oldTrim)) {
      onChange(newTrim);
    }
    void queryClient.invalidateQueries({ queryKey: [...REFERENCE_NAMES_QUERY_KEY] });
    void queryClient.invalidateQueries({ queryKey: ['admissions'] });
  };

  const handleManageRemoved = (name: string, clearedRecords: boolean) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setPendingCustomNames((prev) =>
      prev.filter((n) => normalizeName(n) !== normalizeName(trimmed))
    );
    if (normalizeName(value) === normalizeName(trimmed) || clearedRecords) {
      onChange('');
    }
    void queryClient.invalidateQueries({ queryKey: [...REFERENCE_NAMES_QUERY_KEY] });
    if (clearedRecords) {
      void queryClient.invalidateQueries({ queryKey: ['admissions'] });
    }
  };

  const isLoading = usersLoading || refsLoading;
  const hasCustomSection = filteredCustomReferences.length > 0;
  const hasStaffSection = filteredUsers.length > 0;
  const listEmpty = !isLoading && !hasCustomSection && !hasStaffSection;

  return (
    <div ref={rootRef} className={className}>
      {label ? (
        <label
          htmlFor={id}
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200"
        >
          {label}
        </label>
      ) : null}
      <div className="relative flex gap-2">
        <button
          id={id}
          type="button"
          disabled={disabled || isManaging}
          onClick={() => !disabled && !isManaging && setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-left text-sm shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={triggerLabel ? 'font-medium text-slate-900 dark:text-slate-100' : 'text-slate-400'}>
            {triggerLabel || 'No reference'}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-slate-400">
            {trimmedValue && !disabled ? (
              <span
                role="button"
                tabIndex={0}
                className="rounded p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={(e) => {
                  e.stopPropagation();
                  pick('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    pick('');
                  }
                }}
                aria-label="Clear reference"
              >
                <X className="h-4 w-4" />
              </span>
            ) : null}
            <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {showAddUserButton && !disabled ? (
          <Button
            type="button"
            variant="outline"
            className="shrink-0 gap-1.5 whitespace-nowrap px-3"
            title="Add a reference name"
            disabled={isManaging}
            onClick={() => setAddUserOpen(true)}
          >
            <UserPlus className="h-4 w-4" aria-hidden />
            Add
          </Button>
        ) : null}

        {open ? (
          <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <div className="border-b border-slate-100 p-2 dark:border-slate-800">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search saved references or staff…"
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                  autoFocus
                />
              </div>
            </div>
            <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
              <li>
                <button
                  type="button"
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
                    !trimmedValue
                      ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                      : 'text-slate-500'
                  }`}
                  onClick={() => pick('')}
                >
                  No reference
                </button>
              </li>
              {isLoading ? (
                <li className="px-3 py-3 text-center text-xs text-slate-500">Loading references…</li>
              ) : listEmpty ? (
                <li className="px-3 py-3 text-center text-xs text-slate-500">No matches. Use Add to enter a new name.</li>
              ) : (
                <>
                  {hasCustomSection ? (
                    <>
                      <li className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Saved references
                      </li>
                      {filteredCustomReferences.map((name) => {
                        const selected = normalizeName(name) === normalizeName(trimmedValue);
                        return (
                          <li key={`ref-${name}`} className="flex items-stretch">
                            <button
                              type="button"
                              className={`min-w-0 flex-1 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
                                selected
                                  ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                  : 'text-slate-800 dark:text-slate-100'
                              }`}
                              onClick={() => pick(name)}
                            >
                              <span className="block truncate font-medium">{name}</span>
                              <span className="block text-xs text-slate-500 dark:text-slate-400">
                                Used on previous admissions
                              </span>
                            </button>
                            {canManageSaved && !disabled ? (
                              <div className="flex shrink-0 items-center gap-0.5 border-l border-slate-100 px-1 dark:border-slate-800">
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-blue-600 disabled:opacity-40 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                                  title="Edit reference name"
                                  disabled={isManaging}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openManageDialog('rename', name);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                  title="Remove from list"
                                  disabled={isManaging}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openManageDialog('remove', name);
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </>
                  ) : null}
                  {hasStaffSection ? (
                    <>
                      <li className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Staff
                      </li>
                      {filteredUsers.map((u) => {
                        const selected = normalizeName(u.name) === normalizeName(trimmedValue);
                        return (
                          <li key={u._id || u.id}>
                            <button
                              type="button"
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
                                selected
                                  ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                                  : 'text-slate-800 dark:text-slate-100'
                              }`}
                              onClick={() => pick(u.name.trim())}
                            >
                              <span className="block font-medium">{u.name}</span>
                              <span className="block text-xs text-slate-500 dark:text-slate-400">
                                {[u.roleName, u.designation, u.email].filter(Boolean).join(' · ')}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </>
                  ) : null}
                </>
              )}
            </ul>
          </div>
        ) : null}
      </div>

      {isLegacyValue ? (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          This reference is stored by name. Pick from Saved references, Staff, or Add a new name.
        </p>
      ) : null}

      <QuickAddReferenceUserDialog
        open={addUserOpen}
        onClose={() => setAddUserOpen(false)}
        onCreated={handleReferenceAdded}
      />

      <ReferenceNameManageDialog
        open={Boolean(manageDialog)}
        mode={manageDialog?.mode ?? 'rename'}
        referenceName={manageDialog?.name ?? ''}
        localOnly={manageDialog?.localOnly ?? false}
        onClose={() => setManageDialog(null)}
        onRenamed={handleManageRenamed}
        onRemoved={handleManageRemoved}
      />
    </div>
  );
}
