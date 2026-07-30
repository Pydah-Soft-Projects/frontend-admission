import type { JoiningDocuments } from '@/types';
import { isManagementQuotaLabel } from '@/lib/joiningScholarshipQuotaDefault';

/**
 * Docs no longer collected on admissions / joining Step 2 checklists
 * (kept in types/DB for legacy rows only).
 */
export const DOCUMENT_KEYS_RETIRED_FROM_CHECKLIST = new Set<keyof JoiningDocuments>([
  'bankPassBook',
  'rationCard',
  'ugOrPgCmm',
]);

/** Paper checklist items tracked on the certificate checklist (Step 2) instead. */
export const DOCUMENT_KEYS_HIDDEN_FROM_CHECKLIST = new Set<keyof JoiningDocuments>([
  'ssc',
  'inter',
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

/**
 * Shown only when reservation EWS = Yes.
 * Stored as `incomeCertificate` / `document_income_certificate` (legacy column name).
 */
export const DOCUMENT_KEYS_EWS_ONLY = new Set<keyof JoiningDocuments>(['incomeCertificate']);

export type JoiningDocumentChecklistVisibilityOptions = {
  /**
   * When true (default), SSC / Inter / TC / study are omitted — they live on the
   * certificate checklist. Set false for read-only admission views and full application print.
   */
  paperChecklist?: boolean;
  /** Reservation EWS Yes/No — controls EWS Certificate visibility in Other Documents. */
  isEws?: boolean | null;
};

export function isJoiningDocumentChecklistKeyVisible(
  key: keyof JoiningDocuments,
  quota: string | undefined | null,
  options?: JoiningDocumentChecklistVisibilityOptions
): boolean {
  if (DOCUMENT_KEYS_RETIRED_FROM_CHECKLIST.has(key)) return false;
  const paperChecklist = options?.paperChecklist !== false;
  if (paperChecklist && DOCUMENT_KEYS_HIDDEN_FROM_CHECKLIST.has(key)) return false;
  if (
    DOCUMENT_KEYS_HIDDEN_FOR_MANAGEMENT_QUOTA.has(key) &&
    isManagementQuotaLabel(String(quota ?? '').trim())
  ) {
    return false;
  }
  if (DOCUMENT_KEYS_EWS_ONLY.has(key) && options?.isEws !== true) {
    return false;
  }
  return true;
}
