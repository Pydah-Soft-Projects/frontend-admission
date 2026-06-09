import { joiningStudentProfileFieldRank } from '@/lib/joiningRegistrationFieldLayout';

/**
 * Helpers for cleaning up the dynamic "Registration Form Fields" rendered on
 * the admission and joining detail dialogs. The raw `registrationFormData`
 * payload often contains:
 *   - Noisy internal keys ("_internal", "certificate_checklist", ...)
 *   - Empty values
 *   - Both a human-readable field and its raw id companion (e.g. `batch` =
 *     "2026" and `batch_id` = "<uuid>"), which previously surfaced as two
 *     separate rows on the detail page
 *   - Standalone raw ids (e.g. `upload_batch_id`) whose value is just a UUID
 *     and has no human-readable counterpart
 *
 * The functions here collapse these aliases and prefer human-readable values
 * so the detail page shows clean, meaningful labels.
 */

/** Pretty-print a snake_case / camelCase / kebab-case key as Title Case. */
export const formatRegistrationFieldLabel = (key: string): string =>
  String(key || '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Convert a key to a normalized snake_case form used for alias lookup. */
const toSnakeKey = (key: string): string =>
  String(key || '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
    .trim();

/**
 * Map alias keys (raw + snake_case + camelCase variants are all handled by
 * normalizing first) onto a single canonical key so that name/id pairs
 * collapse into one row.
 */
const aliasToCanonical: Record<string, string> = {
  // Semester aliases
  semister: 'current_semester',
  semester: 'current_semester',
  current_semester: 'current_semester',

  // Academic year aliases
  academic_year: 'current_year',
  current_year: 'current_year',

  // Certificate status
  certification_status: 'certificates_status',
  certificates_status: 'certificates_status',

  // College / school
  college: 'college',
  college_id: 'college',
  college_name: 'college',
  school_or_college: 'college',
  school_or_college_id: 'college',
  school_or_college_name: 'college',
  previous_college: 'previous_college',
  previous_college_id: 'previous_college',
  previous_college_name: 'previous_college',

  // Batch (academic batch)
  batch: 'batch',
  batch_id: 'batch',
  batch_name: 'batch',

  // Upload batch (admin/import batch reference)
  upload_batch: 'upload_batch',
  upload_batch_id: 'upload_batch',
  upload_batch_name: 'upload_batch',

  // Student group / class
  student_group: 'student_group',
  student_group_id: 'student_group',
  student_group_name: 'student_group',
  group: 'student_group',
  group_id: 'student_group',
  group_name: 'student_group',

  // Course / branch (rare here, but mirror the convention)
  course_id: 'course',
  course_name: 'course',
  branch_id: 'branch',
  branch_name: 'branch',
};

/** Canonicalize an incoming registration field key. */
export const normalizeRegistrationFieldKey = (key: string): string => {
  const normalized = toSnakeKey(key);
  return aliasToCanonical[normalized] || normalized;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONGO_OBJECT_ID_REGEX = /^[a-f0-9]{24}$/i;
const NUMERIC_ID_REGEX = /^\d+$/;

/**
 * Return true if the value looks like a machine-only identifier (UUID,
 * MongoDB ObjectId, or pure number). We prefer human-readable values when
 * both are available, and we drop bare-id values entirely if no readable
 * counterpart was captured.
 */
const looksLikeBareId = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  return UUID_REGEX.test(v) || MONGO_OBJECT_ID_REGEX.test(v) || NUMERIC_ID_REGEX.test(v);
};

/** True when the value is an image data URL (kept verbatim for preview). */
export const isRegistrationImageDataUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value.trim());

export interface CleanRegistrationFieldOptions {
  /**
   * When true (default), entries whose remaining value is only a bare id
   * (UUID / ObjectId / pure number) are dropped from the output because they
   * are meaningless to staff reading the dialog.
   */
  dropBareIds?: boolean;
}

/**
 * Clean the registration field source dictionary for display:
 *   1. Strip internal / blank entries.
 *   2. Collapse alias keys (batch / batch_id / batch_name -> "batch", etc.).
 *   3. When two entries collapse, prefer the human-readable value over a
 *      raw id / numeric value.
 *   4. Optionally drop entries whose final value is still a bare id.
 */
export function cleanRegistrationFieldEntries(
  source: Record<string, unknown> | undefined | null,
  { dropBareIds = true }: CleanRegistrationFieldOptions = {}
): Array<[string, unknown]> {
  if (!source) return [];
  const deduped = new Map<string, unknown>();

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const lk = String(rawKey || '').toLowerCase();
    if (lk === 'certificate_checklist') continue;
    if (lk.startsWith('_')) continue;
    if (rawValue === undefined || rawValue === null) continue;
    if (typeof rawValue === 'string' && rawValue.trim() === '') continue;

    const canonical = normalizeRegistrationFieldKey(rawKey);
    const existing = deduped.get(canonical);
    if (existing === undefined) {
      deduped.set(canonical, rawValue);
      continue;
    }

    // Already have a value for this canonical key — prefer the more
    // human-readable one (i.e. NOT a UUID / ObjectId / pure number).
    const existingIsId = looksLikeBareId(existing);
    const incomingIsId = looksLikeBareId(rawValue);
    if (existingIsId && !incomingIsId) {
      deduped.set(canonical, rawValue);
    }
    // If both are ids or both are names, keep the earlier one (stable order).
  }

  let entries = Array.from(deduped.entries());
  if (dropBareIds) {
    entries = entries.filter(([, value]) => !looksLikeBareId(value));
  }
  return entries;
}

export type CleanRegistrationFieldEntry = [string, unknown];

function normRegistrationKey(key: string): string {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function looksLikeDateFieldKey(key: string): boolean {
  const n = normRegistrationKey(key);
  return n.includes('date') || n.includes('dob') || n.includes('birth');
}

function formatDateLikeValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Human-readable value for registration extras on detail / read-only views. */
export function formatRegistrationFieldDisplayValue(key: string, raw: unknown): string {
  if (raw === undefined || raw === null) return '—';
  if (typeof raw === 'boolean') return raw ? 'Yes' : 'No';
  if (typeof raw === 'number') return String(raw);

  if (typeof raw === 'object') {
    if (Array.isArray(raw)) {
      return raw.map((item) => formatRegistrationFieldDisplayValue(key, item)).filter(Boolean).join(', ') || '—';
    }
    const obj = raw as Record<string, unknown>;
    if (obj.accommodationType != null) {
      const type = obj.accommodationType === 'hostel' ? 'Hostel' : 'Bus';
      const parts = [type];
      if (obj.routeName) parts.push(String(obj.routeName));
      if (obj.stageName) parts.push(String(obj.stageName));
      if (obj.hostelName) parts.push(String(obj.hostelName));
      if (obj.roomNumber) parts.push(`Room ${obj.roomNumber}`);
      return parts.join(' · ');
    }
    if (obj.label != null && String(obj.label).trim()) return String(obj.label).trim();
    if (obj.name != null && String(obj.name).trim()) return String(obj.name).trim();
    if (obj.value != null && String(obj.value).trim()) return String(obj.value).trim();
    if (obj.routeName != null && String(obj.routeName).trim()) return String(obj.routeName).trim();
    try {
      return JSON.stringify(obj);
    } catch {
      return '—';
    }
  }

  const text = String(raw).trim();
  if (!text) return '—';
  if (looksLikeDateFieldKey(key) || /^\d{4}-\d{2}-\d{2}/.test(text) || /GMT|IST/.test(text)) {
    return formatDateLikeValue(text) || text;
  }
  return text;
}

/** Same profile field order as `JoiningDynamicRegistrationFields` on the edit form. */
export function sortCleanRegistrationFieldEntries(
  entries: CleanRegistrationFieldEntry[]
): CleanRegistrationFieldEntry[] {
  return [...entries].sort((a, b) => {
    const rankA = joiningStudentProfileFieldRank({
      fieldName: a[0],
      fieldLabel: formatRegistrationFieldLabel(a[0]),
    });
    const rankB = joiningStudentProfileFieldRank({
      fieldName: b[0],
      fieldLabel: formatRegistrationFieldLabel(b[0]),
    });
    if (rankA !== rankB) return rankA - rankB;
    return a[0].localeCompare(b[0]);
  });
}
