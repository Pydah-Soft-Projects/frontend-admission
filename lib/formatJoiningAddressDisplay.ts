import type { JoiningCommunicationAddress, JoiningRelativeAddress } from '@/types';

const PLACEHOLDER_ADDRESS_VALUES = new Set([
  'not provided',
  'not specified',
  'n/a',
  'na',
  'nil',
  'none',
  '-',
  '—',
]);

export function isPlaceholderAddressValue(value?: string | null): boolean {
  const s = String(value ?? '').trim();
  if (!s) return true;
  return PLACEHOLDER_ADDRESS_VALUES.has(s.toLowerCase());
}

export function normalizeAddressFieldForDisplay(value?: unknown): string {
  const s = String(value ?? '').trim();
  if (!s || isPlaceholderAddressValue(s)) return '';
  return s;
}

export function communicationAddressHasDisplayValues(
  comm?: JoiningCommunicationAddress | null
): boolean {
  const c = comm || {};
  return [
    c.doorOrStreet,
    c.landmark,
    c.villageOrCity,
    c.mandal,
    c.district,
    c.state,
    c.pinCode,
  ].some((part) => !isPlaceholderAddressValue(part == null ? '' : String(part)));
}

export function formatCommunicationAddressLines(comm?: JoiningCommunicationAddress | null) {
  const c = comm || {};
  const locality = [c.villageOrCity, c.mandal, c.district, c.state]
    .map((part) => normalizeAddressFieldForDisplay(part))
    .filter(Boolean)
    .join(', ');

  const doorOrStreet = normalizeAddressFieldForDisplay(c.doorOrStreet);

  return {
    doorOrStreet: doorOrStreet || '—',
    landmark: normalizeAddressFieldForDisplay(c.landmark)
      ? `Near: ${normalizeAddressFieldForDisplay(c.landmark)}`
      : null,
    locality: locality || '—',
    pin: normalizeAddressFieldForDisplay(c.pinCode)
      ? `PIN: ${normalizeAddressFieldForDisplay(c.pinCode)}`
      : null,
  };
}

export function formatRelativeAddressBlock(rel: JoiningRelativeAddress) {
  const header = [rel.name, rel.relationship ? `(${rel.relationship})` : '']
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter(Boolean)
    .join(' ');

  const addressLine = [
    rel.doorOrStreet,
    rel.landmark,
    rel.villageOrCity,
    rel.mandal,
    rel.district,
    rel.state,
    rel.pinCode ? `PIN ${rel.pinCode}` : '',
  ]
    .map((part) => normalizeAddressFieldForDisplay(part))
    .filter(Boolean)
    .join(', ');

  const mobile = String(rel.phone || '').trim();

  return { header: header || '—', addressLine, mobile };
}
