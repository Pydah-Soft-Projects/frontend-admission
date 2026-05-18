'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Search, X } from 'lucide-react';
import { userAPI } from '@/lib/api';
import type { User } from '@/types';

type ReferenceUserSelectProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
};

const normalizeName = (s: string) => s.trim().toLowerCase();

export function ReferenceUserSelect({
  value,
  onChange,
  label = 'Reference',
  id,
  disabled = false,
  className = '',
}: ReferenceUserSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users', 'reference-picker'],
    queryFn: async () => {
      const response = await userAPI.getAll();
      return response.data ?? response;
    },
    staleTime: 5 * 60 * 1000,
  });

  const users = useMemo(() => {
    const list = (Array.isArray(data) ? data : (data as { data?: User[] })?.data ?? []) as User[];
    return list
      .filter((u) => u.isActive !== false)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [data]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = `${u.name} ${u.email} ${u.roleName} ${u.designation ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, search]);

  const trimmedValue = value.trim();
  const matchedUser = users.find((u) => normalizeName(u.name) === normalizeName(trimmedValue));
  const isLegacyValue = Boolean(trimmedValue && !matchedUser);

  const triggerLabel = trimmedValue
    ? matchedUser
      ? matchedUser.name
      : trimmedValue
    : '';

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

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label ? (
        <label
          htmlFor={id}
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200"
        >
          {label}
        </label>
      ) : null}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-left text-sm shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
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

      {isLegacyValue ? (
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          Current value is not in the user list. Pick a user below or clear to leave empty.
        </p>
      ) : null}

      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, or role…"
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
                  !trimmedValue ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'text-slate-500'
                }`}
                onClick={() => pick('')}
              >
                No reference
              </button>
            </li>
            {isLoading ? (
              <li className="px-3 py-3 text-center text-xs text-slate-500">Loading users…</li>
            ) : filteredUsers.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-slate-500">No users match your search.</li>
            ) : (
              filteredUsers.map((u) => {
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
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

