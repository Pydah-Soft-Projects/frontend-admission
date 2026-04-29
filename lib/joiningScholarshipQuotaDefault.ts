/**
 * Default scholarship / eligibility style registration answers from Course & Quota:
 * - Management → prefer "not eligible" (or equivalent) option
 * - Convenor → prefer "eligible" (or equivalent) option
 */

export type RegistrationFieldLike = {
  fieldName?: string;
  fieldLabel?: string;
  fieldType?: string;
  options?: unknown;
};

function normText(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normKey(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function normalizeRegistrationFieldOptions(
  rawOptions: unknown
): Array<{ value: string; label: string }> {
  let parsed: unknown = rawOptions;
  if (typeof parsed === 'string') {
    const trimmed = parsed.trim();
    if (!trimmed) return [];
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = trimmed
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((option: unknown) => {
      if (typeof option === 'string' || typeof option === 'number') {
        const text = String(option).trim();
        return text ? { value: text, label: text } : null;
      }
      if (option && typeof option === 'object') {
        const o = option as Record<string, unknown>;
        const value = String(o.value ?? o.label ?? '').trim();
        const label = String(o.label ?? o.value ?? '').trim();
        if (!value && !label) return null;
        return { value: value || label, label: label || value };
      }
      return null;
    })
    .filter(Boolean) as Array<{ value: string; label: string }>;
}

export function isScholarshipStatusField(field: RegistrationFieldLike): boolean {
  const n = normKey(field.fieldName || '');
  const l = normKey(field.fieldLabel || '');
  const hay = `${n} ${l}`;
  if (hay.includes('research_scholar') || hay.includes('researchscholar')) return false;
  if (hay.includes('scholarship')) return true;
  if (hay.includes('scholar')) return true;
  if (hay.includes('fee') && hay.includes('waiver')) return true;
  return false;
}

function scoreOptionForIntent(
  opt: { value: string; label: string },
  intent: 'eligible' | 'not_eligible'
): number {
  const label = normText(opt.label);
  const value = normText(opt.value);
  const combined = `${label} ${value}`;

  if (intent === 'eligible') {
    if (
      combined.includes('not eligible') ||
      combined.includes('not_eligible') ||
      combined.includes('non eligible') ||
      combined.includes('non_eligible') ||
      combined.includes('ineligible')
    ) {
      return -100;
    }
    if (label === 'eligible' || value === 'eligible') return 100;
    if (combined.includes('eligible')) return 60;
    return 0;
  }

  if (
    combined.includes('not eligible') ||
    combined.includes('not_eligible') ||
    combined.includes('non eligible')
  ) {
    return 100;
  }
  if (combined.includes('ineligible') || combined.includes('non_eligible')) return 95;
  if (combined.includes('not') && combined.includes('eligible')) return 75;
  return 0;
}

function pickOptionValueForIntent(
  options: Array<{ value: string; label: string }>,
  intent: 'eligible' | 'not_eligible'
): string | null {
  let best: { value: string; score: number } | null = null;
  for (const opt of options) {
    const score = scoreOptionForIntent(opt, intent);
    if (score > 0 && (!best || score > best.score)) {
      best = { value: opt.value, score };
    }
  }
  return best?.value ?? null;
}

const TEXT_LIKE_TYPES = new Set([
  'text',
  'textarea',
  'string',
  'input',
  'single_line_text',
  'multiline_text',
  'singlelinetext',
  'multilinetext',
  '',
]);

const CHOICE_TYPES = new Set(['dropdown', 'radio', 'select']);

/** Returns value to store in registration extras, or null if no match / wrong quota. */
export function pickScholarshipRegistrationValueForQuota(
  quotaTrimmed: string,
  field: RegistrationFieldLike
): string | null {
  const q = quotaTrimmed.trim();
  if (q !== 'Management' && q !== 'Convenor') return null;
  if (!isScholarshipStatusField(field)) return null;

  const ft = String(field.fieldType || '').toLowerCase();
  const intent = q === 'Management' ? ('not_eligible' as const) : ('eligible' as const);
  const opts = normalizeRegistrationFieldOptions(field.options);

  if (CHOICE_TYPES.has(ft) && opts.length > 0) {
    return pickOptionValueForIntent(opts, intent);
  }

  // Text / textarea (common for "SCHOLAR STATUS" in student DB forms) or choice with no options list
  if (TEXT_LIKE_TYPES.has(ft) || (CHOICE_TYPES.has(ft) && opts.length === 0)) {
    return intent === 'not_eligible' ? 'Not eligible' : 'Eligible';
  }

  return null;
}

/** All scholarship-style fields → stored values for the given quota (Management / Convenor only). */
export function computeScholarshipRegistrationPatches(
  quotaTrimmed: string,
  fields: RegistrationFieldLike[]
): Record<string, string> {
  const q = quotaTrimmed.trim();
  if (q !== 'Management' && q !== 'Convenor') return {};
  const out: Record<string, string> = {};
  for (const raw of fields) {
    const picked = pickScholarshipRegistrationValueForQuota(q, raw);
    const fn = String(raw.fieldName || '').trim();
    if (!picked || !fn) continue;
    out[fn] = picked;
  }
  return out;
}
