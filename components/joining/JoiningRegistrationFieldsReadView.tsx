'use client';

import {
  formatRegistrationFieldLabel,
  isRegistrationImageDataUrl,
  sortCleanRegistrationFieldEntries,
  type CleanRegistrationFieldEntry,
} from '@/lib/registrationFieldsDisplay';

function normKey(key: string): string {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function isAadhaarFieldKey(key: string): boolean {
  const n = normKey(key);
  return n.includes('aadhaar') || n.includes('aadhar');
}

function maskAadhaarValue(value?: string): string {
  if (!value) return '—';
  if (value.length <= 4) return value;
  return `${value.slice(0, 4)} ${'•'.repeat(4)} ${value.slice(-4)}`;
}

type Props = {
  entries: CleanRegistrationFieldEntry[];
  className?: string;
  /** When false, masks values for registration keys that look like Aadhaar. */
  revealAadhaar?: boolean;
};

/** Read-only registration grid — same field order as the joining edit form. */
export function JoiningRegistrationFieldsReadView({
  entries,
  className,
  revealAadhaar = false,
}: Props) {
  const sorted = sortCleanRegistrationFieldEntries(entries);
  if (!sorted.length) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">No additional registration fields recorded.</p>
    );
  }

  return (
    <div className={className ?? 'grid gap-4 md:grid-cols-3'}>
      {sorted.map(([key, raw]) => {
        const label = formatRegistrationFieldLabel(key);
        const text =
          typeof raw === 'object' && raw !== null && !Array.isArray(raw)
            ? JSON.stringify(raw)
            : String(raw ?? '');
        const showMaskedAadhaar =
          !revealAadhaar && isAadhaarFieldKey(key) && text && text !== '—';
        return (
          <div
            key={key}
            className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/30"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {label}
            </p>
            {isRegistrationImageDataUrl(raw) ? (
              <img
                src={raw}
                alt={label}
                className="mt-2 h-24 w-24 rounded-lg border border-slate-300 object-cover dark:border-slate-600"
              />
            ) : (
              <p className="mt-1 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">
                {showMaskedAadhaar ? maskAadhaarValue(text) : text || '—'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
