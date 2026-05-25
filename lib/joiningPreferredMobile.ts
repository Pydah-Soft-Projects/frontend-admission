export type PreferredMobileOption = {
  label: string;
  value: string;
};

export function normalizeJoiningMobileDigits(value?: string): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .slice(-10);
}

/** Dropdown options from student / father / mother mobiles on the joining form. */
export function buildPreferredMobileOptions(input: {
  studentPhone?: string;
  fatherPhone?: string;
  motherPhone?: string;
}): PreferredMobileOption[] {
  const seen = new Set<string>();
  const options: PreferredMobileOption[] = [];

  const push = (label: string, raw?: string) => {
    const digits = normalizeJoiningMobileDigits(raw);
    if (digits.length !== 10 || seen.has(digits)) return;
    seen.add(digits);
    options.push({ label: `${label} (${digits})`, value: digits });
  };

  push('Student mobile', input.studentPhone);
  push('Father mobile', input.fatherPhone);
  push('Mother mobile', input.motherPhone);

  return options;
}
