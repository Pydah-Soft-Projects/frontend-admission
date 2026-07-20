'use client';

import {
  formatRegistrationFieldDisplayValue,
  formatRegistrationFieldLabel,
  isRegistrationImageDataUrl,
  sortCleanRegistrationFieldEntries,
  type CleanRegistrationFieldEntry,
} from '@/lib/registrationFieldsDisplay';
import { isPhoneFieldKey, maskPhone } from '@/lib/maskSensitiveDisplay';

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
  /** When set, renders Show/Hide on the Aadhaar field card instead of a detached page-level link. */
  onToggleAadhaar?: () => void;
  /** Keys of registration phone/mobile fields currently revealed. */
  revealedPhoneKeys?: Record<string, boolean>;
  onTogglePhone?: (key: string) => void;
};

/** Read-only registration grid — same field order as the joining edit form. */
export function JoiningRegistrationFieldsReadView({
  entries,
  className,
  revealAadhaar = false,
  onToggleAadhaar,
  revealedPhoneKeys = {},
  onTogglePhone,
}: Props) {
  const sorted = sortCleanRegistrationFieldEntries(entries);
  if (!sorted.length) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">No additional registration fields recorded.</p>
    );
  }

  const hasAadhaarField = sorted.some(([key]) => isAadhaarFieldKey(key));

  return (
    <div className={className ?? 'grid gap-4 md:grid-cols-3'}>
      {sorted.map(([key, raw]) => {
        const label = formatRegistrationFieldLabel(key);
        const text = formatRegistrationFieldDisplayValue(key, raw);
        const isAadhaarField = isAadhaarFieldKey(key);
        const isPhoneField = isPhoneFieldKey(key);
        const showMaskedAadhaar = !revealAadhaar && isAadhaarField && text && text !== '—';
        const showMaskedPhone =
          !revealedPhoneKeys[key] && isPhoneField && text && text !== '—' && onTogglePhone;
        const showToggle =
          (isAadhaarField && hasAadhaarField && onToggleAadhaar) ||
          (isPhoneField && text && text !== '—' && onTogglePhone);
        return (
          <div
            key={key}
            className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/30"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {label}
              </p>
              {showToggle ? (
                <button
                  type="button"
                  onClick={() => {
                    if (isAadhaarField && onToggleAadhaar) onToggleAadhaar();
                    else if (isPhoneField && onTogglePhone) onTogglePhone(key);
                  }}
                  className="shrink-0 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                >
                  {isAadhaarField
                    ? revealAadhaar
                      ? 'Hide'
                      : 'Show'
                    : revealedPhoneKeys[key]
                      ? 'Hide'
                      : 'Show'}
                </button>
              ) : null}
            </div>
            {isRegistrationImageDataUrl(raw) ? (
              <img
                src={raw}
                alt={label}
                className="mt-2 h-24 w-24 rounded-lg border border-slate-300 object-cover dark:border-slate-600"
              />
            ) : (
              <p className="mt-1 break-words text-sm font-semibold text-slate-900 dark:text-slate-100">
                {showMaskedAadhaar
                  ? maskAadhaarValue(text)
                  : showMaskedPhone
                    ? maskPhone(text)
                    : text || '—'}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
