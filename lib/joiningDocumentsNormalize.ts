import type { JoiningDocumentStatus, JoiningDocuments } from '@/types';

/** API / SQL formatted joining uses these keys; the UI form uses camelCase aliases. */
const API_KEY_ALIASES: Record<string, keyof JoiningDocuments> = {
  ugPgCmm: 'ugOrPgCmm',
  bankPassbook: 'bankPassBook',
};

const UI_TO_API_KEY: Partial<Record<keyof JoiningDocuments, string>> = {
  ugOrPgCmm: 'ugPgCmm',
  bankPassBook: 'bankPassbook',
};

export const defaultJoiningDocuments = (): JoiningDocuments => ({
  ssc: 'pending',
  inter: 'pending',
  ugOrPgCmm: 'pending',
  transferCertificate: 'pending',
  studyCertificate: 'pending',
  aadhaarCard: 'pending',
  photos: 'pending',
  incomeCertificate: 'pending',
  casteCertificate: 'pending',
  cetRankCard: 'pending',
  cetHallTicket: 'pending',
  allotmentLetter: 'pending',
  joiningReport: 'pending',
  bankPassBook: 'pending',
  rationCard: 'pending',
});

const normalizeDocumentStatus = (value: unknown): JoiningDocumentStatus =>
  String(value ?? '').trim().toLowerCase() === 'received' ? 'received' : 'pending';

/** Merge API document keys into the UI `JoiningDocuments` shape. */
export function normalizeJoiningDocumentsFromApi(
  raw?: Partial<JoiningDocuments> & Record<string, JoiningDocumentStatus | undefined> | null
): JoiningDocuments {
  const out = defaultJoiningDocuments();
  if (!raw || typeof raw !== 'object') return out;

  for (const [key, value] of Object.entries(raw)) {
    const uiKey = (API_KEY_ALIASES[key] ?? key) as keyof JoiningDocuments;
    if (!(uiKey in out)) continue;
    out[uiKey] = normalizeDocumentStatus(value);
  }
  return out;
}

/** Serialize UI documents for API save (uses backend key names). */
export function serializeJoiningDocumentsForApi(
  docs: JoiningDocuments
): Record<string, JoiningDocumentStatus> {
  const out: Record<string, JoiningDocumentStatus> = {};
  for (const [key, value] of Object.entries(docs) as [keyof JoiningDocuments, JoiningDocumentStatus][]) {
    const status = normalizeDocumentStatus(value);
    const apiKey = UI_TO_API_KEY[key] ?? key;
    out[apiKey] = status;
  }
  return out;
}
