/** Field visit outcomes for Visit Diary (excludes assignment workflow "Assigned"). */

export const VISIT_DIARY_OUTCOME_OPTIONS_PRO = [
  'Interested',
  'Not Interested',
  'Scheduled Revisit',
  'Wrong Data',
  'Confirmed',
] as const;

export const VISIT_DIARY_OUTCOME_OPTIONS_ADMIN = [
  'Interested',
  'Not Interested',
  'Not Available',
  'Scheduled Revisit',
  'Wrong Data',
  'Confirmed',
] as const;

function norm(s: string) {
  return String(s ?? '').trim().toLowerCase();
}

/** True when visit_status is the assignment placeholder, not a diary outcome. */
export function isAssignmentVisitStatus(status: string | null | undefined): boolean {
  const s = norm(status);
  return !s || s === 'assigned' || s === 'not set';
}

/** Initial queue value: only reuse visit_status if it is a valid diary outcome. */
export function initialVisitDiaryQueueStatus(
  visitStatus: string | null | undefined,
  allowedOptions: readonly string[]
): string {
  const raw = String(visitStatus ?? '').trim();
  if (isAssignmentVisitStatus(raw)) return '';
  return allowedOptions.includes(raw) ? raw : '';
}

export function isValidVisitDiaryOutcome(
  status: string | null | undefined,
  allowedOptions: readonly string[]
): boolean {
  const s = String(status ?? '').trim();
  return !!s && allowedOptions.includes(s) && !isAssignmentVisitStatus(s);
}
