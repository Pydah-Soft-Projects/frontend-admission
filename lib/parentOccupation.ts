/** Built-in parent occupation options (shared by father & mother). */
export const PARENT_OCCUPATION_SHARED_OPTIONS = [
  'Business',
  'Govt employee',
  'PVT employee',
  'Farmer',
  'Daily worker',
] as const;

/** Mother-only built-in occupation options. */
export const MOTHER_OCCUPATION_EXTRA_OPTIONS = ['House wife', 'Home maker'] as const;

export const PARENT_OCCUPATION_OTHERS_VALUE = '__others__';

const CUSTOM_OCCUPATIONS_STORAGE_KEY = 'admissions-crm.parent-occupation.custom';

export type ParentOccupationRole = 'father' | 'mother';

function normalizeOccupationLabel(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function loadCustomParentOccupations(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_OCCUPATIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of parsed) {
      const label = normalizeOccupationLabel(String(item ?? ''));
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
    return out;
  } catch {
    return [];
  }
}

export function saveCustomParentOccupation(value: string): string | null {
  const label = normalizeOccupationLabel(value);
  if (!label) return null;
  const existing = loadCustomParentOccupations();
  const key = label.toLowerCase();
  if (existing.some((item) => item.toLowerCase() === key)) {
    return existing.find((item) => item.toLowerCase() === key) || label;
  }
  const next = [...existing, label];
  try {
    window.localStorage.setItem(CUSTOM_OCCUPATIONS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota / private-mode failures; option still works for this session.
  }
  return label;
}

export function getParentOccupationOptions(
  role: ParentOccupationRole,
  customOptions: string[] = [],
  currentValue?: string | null
): string[] {
  const builtIn: string[] = [...PARENT_OCCUPATION_SHARED_OPTIONS];
  if (role === 'mother') {
    builtIn.push(...MOTHER_OCCUPATION_EXTRA_OPTIONS);
  }
  const seen = new Set(builtIn.map((item) => item.toLowerCase()));
  const merged = [...builtIn];
  for (const item of customOptions) {
    const label = normalizeOccupationLabel(item);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(label);
  }
  const current = normalizeOccupationLabel(String(currentValue ?? ''));
  if (current && !seen.has(current.toLowerCase())) {
    merged.push(current);
  }
  return merged;
}
