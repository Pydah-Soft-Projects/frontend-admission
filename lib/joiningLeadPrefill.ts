import type { Joining } from '@/types';

export type LeadLike = {
  phone?: string;
  fatherPhone?: string;
  motherPhone?: string;
  gender?: string;
  address?: string;
  village?: string;
  district?: string;
  mandal?: string;
  state?: string;
  academicYear?: number;
  studentGroup?: string;
  /** Excel / bulk upload batch (UUID) on the lead — mirrors into registration “batch” fields when empty. */
  uploadBatchId?: string;
};

export type JoiningFormStateLike = {
  studentInfo: Joining['studentInfo'];
  parents: Joining['parents'];
  address: Joining['address'];
};

function isBlank(s?: string | null): boolean {
  return s === undefined || s === null || String(s).trim() === '';
}

/** Last 10 digits for Indian mobile; otherwise keep cleaned digits if any. */
function toLeadPhoneDigits(raw?: string | null): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  if (digits.length > 0) return digits;
  return '';
}

/** Normalize lead gender to joining select values (Male / Female / Other). */
export function normalizeLeadGenderForJoining(raw?: string): string {
  const g = String(raw ?? '').trim();
  if (!g || g === 'Not Specified') return '';
  const low = g.toLowerCase();
  if (low === 'male' || low === 'm') return 'Male';
  if (low === 'female' || low === 'f') return 'Female';
  if (low === 'other' || low === 'o') return 'Other';
  if (g === 'Male' || g === 'Female' || g === 'Other') return g;
  return g.charAt(0).toUpperCase() + g.slice(1).toLowerCase();
}

/**
 * Fill empty student phone, parent phones, gender, and communication address from the lead snapshot.
 * Full `address` string from the lead is placed in door/street when that line is empty.
 */
export function mergeLeadIntoJoiningFormState<T extends JoiningFormStateLike>(
  state: T,
  lead: LeadLike | null | undefined
): T {
  if (!lead) return state;

  const si = { ...state.studentInfo };
  if (isBlank(si.phone) && !isBlank(lead.phone)) {
    const digits = toLeadPhoneDigits(lead.phone);
    if (digits) si.phone = digits;
  }
  if (isBlank(si.gender)) {
    const g = normalizeLeadGenderForJoining(lead.gender);
    if (g) si.gender = g;
  }

  const father = { ...state.parents.father };
  if (isBlank(father.phone) && !isBlank(lead.fatherPhone)) {
    const digits = toLeadPhoneDigits(lead.fatherPhone);
    if (digits) father.phone = digits;
  }

  const mother = { ...state.parents.mother };
  if (isBlank(mother.phone) && !isBlank(lead.motherPhone)) {
    const digits = toLeadPhoneDigits(lead.motherPhone);
    if (digits) mother.phone = digits;
  }

  const comm = { ...state.address.communication };
  const hasStructured =
    !isBlank(comm.villageOrCity) ||
    !isBlank(comm.district) ||
    !isBlank(comm.mandal) ||
    !isBlank(comm.state);
  if (!hasStructured) {
    if (!isBlank(lead.village)) comm.villageOrCity = String(lead.village).trim();
    if (!isBlank(lead.district)) comm.district = String(lead.district).trim();
    if (!isBlank(lead.mandal)) comm.mandal = String(lead.mandal).trim();
    if (!isBlank(lead.state)) comm.state = String(lead.state).trim();
  }
  if (isBlank(comm.doorOrStreet) && !isBlank(lead.address)) {
    comm.doorOrStreet = String(lead.address).trim();
  }

  return {
    ...state,
    studentInfo: si,
    parents: { father, mother },
    address: {
      ...state.address,
      communication: comm,
    },
  };
}
