'use client';

import {
  buildPreferredMobileOptions,
  normalizeJoiningMobileDigits,
  type PreferredMobileOption,
} from '@/lib/joiningPreferredMobile';

type Props = {
  value?: string;
  onChange: (value: string) => void;
  studentPhone?: string;
  fatherPhone?: string;
  motherPhone?: string;
  disabled?: boolean;
  className?: string;
};

export function PreferredMobileNumberSelect({
  value,
  onChange,
  studentPhone,
  fatherPhone,
  motherPhone,
  disabled = false,
  className = '',
}: Props) {
  const options: PreferredMobileOption[] = buildPreferredMobileOptions({
    studentPhone,
    fatherPhone,
    motherPhone,
  });

  const normalizedValue = normalizeJoiningMobileDigits(value);
  const selectValue =
    normalizedValue.length === 10 && options.some((o) => o.value === normalizedValue)
      ? normalizedValue
      : '';

  return (
    <div className={className}>
      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
        Preferred mobile number
      </label>
      <select
        value={selectValue}
        disabled={disabled || options.length === 0}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
      >
        <option value="">
          {options.length === 0 ? 'Enter a mobile number above' : 'Select preferred mobile'}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
        Used for admission SMS and as the primary contact number where applicable.
      </p>
    </div>
  );
}
