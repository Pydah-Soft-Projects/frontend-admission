import type { CertificateGuidance, JoiningDocuments, JoiningDocumentStatus } from '@/types';
import { buildAdmitCardCertificateChecklistFromRegistration } from '@/components/joining/PrintableAdmitCard';
import {
  DOCUMENT_KEYS_HIDDEN_FROM_CHECKLIST,
  DOCUMENT_KEYS_RETIRED_FROM_CHECKLIST,
  isJoiningDocumentChecklistKeyVisible,
} from '@/lib/joiningDocumentChecklist';
import { normalizeJoiningDocumentsFromApi } from '@/lib/joiningDocumentsNormalize';

export const JOINING_DOCUMENT_LABELS: Record<keyof JoiningDocuments, string> = {
  ssc: 'SSC',
  inter: 'Intermediate',
  ugOrPgCmm: 'UG / PG CMM',
  transferCertificate: 'Transfer Certificate',
  studyCertificate: 'Study Certificate',
  aadhaarCard: 'Aadhaar Card',
  photos: 'Photos (5)',
  incomeCertificate: 'Income Certificate',
  casteCertificate: 'Caste Certificate',
  cetRankCard: 'CET Rank Card',
  cetHallTicket: 'CET Hall Ticket',
  allotmentLetter: 'Allotment Letter',
  joiningReport: 'Joining Report',
  bankPassBook: 'Bank Pass Book',
  rationCard: 'Ration Card',
};

export type DocumentChecklistTabItem = {
  key: string;
  label: string;
  status: JoiningDocumentStatus | 'Received' | 'Pending' | string;
  subtitle?: string;
};

export function formatJoiningDocumentLabel(key: string): string {
  return (
    JOINING_DOCUMENT_LABELS[key as keyof JoiningDocuments] ||
    key.replace(/([A-Z])/g, ' $1').trim()
  );
}

export function buildImportantDocumentTabItems(
  documents: JoiningDocuments | undefined | null,
  quota: string | undefined | null,
  registrationFormData?: Record<string, unknown> | null,
  certificateGuidance?: CertificateGuidance | null
): DocumentChecklistTabItem[] {
  const certChecklist = buildAdmitCardCertificateChecklistFromRegistration(
    certificateGuidance,
    registrationFormData
  );
  if (certChecklist?.rows?.length) {
    return certChecklist.rows.map((row, idx) => ({
      key: `cert-${idx}-${row.name}`,
      label: row.name,
      status: row.status,
      subtitle: row.optionLabel,
    }));
  }

  if (!documents) return [];
  const normalized = normalizeJoiningDocumentsFromApi(documents);
  return (Object.entries(normalized) as [keyof JoiningDocuments, JoiningDocumentStatus][])
    .filter(
      ([key]) =>
        DOCUMENT_KEYS_HIDDEN_FROM_CHECKLIST.has(key) &&
        !DOCUMENT_KEYS_RETIRED_FROM_CHECKLIST.has(key)
    )
    .map(([key, value]) => ({
      key,
      label: formatJoiningDocumentLabel(key),
      status: value || 'pending',
    }));
}

export function buildOtherDocumentTabItems(
  documents: JoiningDocuments | undefined | null,
  quota: string | undefined | null
): DocumentChecklistTabItem[] {
  if (!documents) return [];
  const normalized = normalizeJoiningDocumentsFromApi(documents);
  return (Object.entries(normalized) as [keyof JoiningDocuments, JoiningDocumentStatus][])
    .filter(([key]) =>
      isJoiningDocumentChecklistKeyVisible(key, quota, {
        paperChecklist: true,
      })
    )
    .map(([key, value]) => ({
      key,
      label: formatJoiningDocumentLabel(key),
      status: value || 'pending',
    }));
}
