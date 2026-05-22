import type { JoiningDocuments } from '@/types';
import { isManagementQuotaLabel } from '@/lib/joiningScholarshipQuotaDefault';

/** Paper checklist items tracked on the certificate checklist (Step 2) instead. */
export const DOCUMENT_KEYS_HIDDEN_FROM_CHECKLIST = new Set<keyof JoiningDocuments>([
  'ssc',
  'inter',
  'ugOrPgCmm',
  'transferCertificate',
  'studyCertificate',
]);

/** CET / allotment documents — not required for Management quota admissions. */
export const DOCUMENT_KEYS_HIDDEN_FOR_MANAGEMENT_QUOTA = new Set<keyof JoiningDocuments>([
  'cetRankCard',
  'cetHallTicket',
  'allotmentLetter',
  'joiningReport',
]);

export type JoiningDocumentChecklistVisibilityOptions = {
  /**
   * When true (default), SSC / Inter / TC / study / UG CMM are omitted — they live on the
   * certificate checklist. Set false for read-only admission views and full application print.
   */
  paperChecklist?: boolean;
};

export function isJoiningDocumentChecklistKeyVisible(
  key: keyof JoiningDocuments,
  quota: string | undefined | null,
  options?: JoiningDocumentChecklistVisibilityOptions
): boolean {
  const paperChecklist = options?.paperChecklist !== false;
  if (paperChecklist && DOCUMENT_KEYS_HIDDEN_FROM_CHECKLIST.has(key)) return false;
  if (
    DOCUMENT_KEYS_HIDDEN_FOR_MANAGEMENT_QUOTA.has(key) &&
    isManagementQuotaLabel(String(quota ?? '').trim())
  ) {
    return false;
  }
  return true;
}
