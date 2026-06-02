/**
 * Channel status outcomes aligned with backend `leadChannelStatus.util.js`.
 * Managers pick from call_status + visit_status mappings only (not legacy pipeline labels).
 */

/** Counsellor `call_status` values that map to merged `lead_status`. */
export const CANONICAL_CALL_STATUS_OUTCOMES = [
  'Interested',
  'Not Interested',
  'Wrong Data',
  'Call Back',
  'Visited',
  'Confirmed',
  'CET Applied',
] as const;

/** PRO `visit_status` field outcomes (excludes workflow placeholder "Assigned"). */
export const CANONICAL_VISIT_STATUS_OUTCOMES = [
  'Interested',
  'Not Interested',
  'Scheduled Revisit',
  'Wrong Data',
  'Confirmed',
] as const;

/** Options for manager status update — union of call + visit channel outcomes. */
export function getManagerStatusUpdateOptions(): string[] {
  return Array.from(
    new Set([...CANONICAL_CALL_STATUS_OUTCOMES, ...CANONICAL_VISIT_STATUS_OUTCOMES])
  ).sort((a, b) => a.localeCompare(b));
}
