import type { CertificateConfigItem } from '@/types';

export type CertificateChecklistStatus = 'pending' | 'received';

/** Stored per certificate id: plain status, or status + chosen variant when the rule has options. */
export type CertificateChecklistStoredValue =
  | CertificateChecklistStatus
  | { status: CertificateChecklistStatus; option?: string };

const SEP = '\u0001';

export function encodeCertificateOptionChoice(
  opt: string | { value?: string; type?: string }
): string {
  if (typeof opt === 'string') {
    return opt.trim();
  }
  const v = (opt.value ?? '').trim();
  const t = (opt.type ?? '').trim();
  if (v && t) return `${v}${SEP}${t}`;
  return v || t || '';
}

export function labelForCertificateOption(
  opt: string | { value?: string; type?: string }
): string {
  if (typeof opt === 'string') {
    return opt.trim();
  }
  const v = (opt.value ?? '').trim();
  const t = (opt.type ?? '').trim();
  if (v && t) return `${v} - ${t}`;
  return v || t || '';
}

export function listCertificateItemOptions(
  item: CertificateConfigItem
): { encoded: string; label: string }[] {
  const raw = item.options;
  if (!raw?.length) return [];
  const out: { encoded: string; label: string }[] = [];
  for (const opt of raw) {
    const encoded = encodeCertificateOptionChoice(opt);
    if (!encoded) continue;
    out.push({ encoded, label: labelForCertificateOption(opt) });
  }
  return out;
}

export function parseCertificateChecklistEntry(
  raw: unknown
): { status: CertificateChecklistStatus; option?: string } {
  if (raw === 'received' || raw === 'pending') {
    return { status: raw };
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    const st = o.status === 'received' || o.status === 'pending' ? o.status : 'pending';
    const opt = typeof o.option === 'string' && o.option.trim() ? o.option.trim() : undefined;
    return { status: st, option: opt };
  }
  return { status: 'pending' };
}

export function buildCertificateChecklistStoredValue(
  hasOptions: boolean,
  status: CertificateChecklistStatus,
  option?: string
): CertificateChecklistStoredValue {
  if (!hasOptions) {
    return status;
  }
  return { status, option: option?.trim() || undefined };
}

export function certificateChecklistValuesEqual(a: unknown, b: unknown): boolean {
  const pa = parseCertificateChecklistEntry(a);
  const pb = parseCertificateChecklistEntry(b);
  return pa.status === pb.status && (pa.option || '') === (pb.option || '');
}

/**
 * Derives a single certification status from the settings-driven checklist.
 * Only rows with `required: true` must be "received" for Verified.
 * If there are no required rows, all items are treated as required for the aggregate status.
 */
export function computeCertificationStatusFromChecklist(
  items: Pick<CertificateConfigItem, 'id' | 'name' | 'required'>[] | undefined,
  certificateChecklistRaw: unknown
): 'Verified' | 'Unverified' {
  if (!items?.length) {
    return 'Unverified';
  }
  const map =
    certificateChecklistRaw && typeof certificateChecklistRaw === 'object' && !Array.isArray(certificateChecklistRaw)
      ? (certificateChecklistRaw as Record<string, unknown>)
      : {};
  const withIds = items
    .map((it) => ({ id: String(it.id || it.name || '').trim(), required: it.required === true }))
    .filter((x) => x.id);
  const requiredIds = withIds.filter((x) => x.required).map((x) => x.id);
  if (requiredIds.length === 0) {
    return 'Verified';
  }
  const idsToCheck = requiredIds;
  for (const id of idsToCheck) {
    if (parseCertificateChecklistEntry(map[id]).status !== 'received') {
      return 'Unverified';
    }
  }
  return 'Verified';
}
