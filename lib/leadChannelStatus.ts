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

export type LeadStatusChannel = 'call_status' | 'visit_status' | 'lead_status';

const VISIT_ONLY_OUTCOMES = new Set(['scheduled revisit', 're-visit', 'revisit']);

/** Which channel to write when a manager picks an outcome (must match backend default). */
export function resolveManagerStatusChannel(outcome: string): 'call_status' | 'visit_status' {
  const key = String(outcome ?? '').trim().toLowerCase();
  if (VISIT_ONLY_OUTCOMES.has(key)) return 'visit_status';
  return 'call_status';
}

/** Prefill manager status modal from call/visit channel (not stale pipeline lead_status). */
export function managerCurrentOutcomePrefill(lead: {
  callStatus?: string | null;
  visitStatus?: string | null;
}): string {
  const options = new Set(getManagerStatusUpdateOptions());
  const call = String(lead.callStatus ?? '').trim();
  const visit = String(lead.visitStatus ?? '').trim();
  if (call && call.toLowerCase() !== 'assigned' && options.has(call)) return call;
  if (visit && visit.toLowerCase() !== 'assigned' && options.has(visit)) return visit;
  return '';
}
