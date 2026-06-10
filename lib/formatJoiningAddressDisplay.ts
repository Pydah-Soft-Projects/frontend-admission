import type { JoiningCommunicationAddress, JoiningRelativeAddress } from '@/types';

export function formatCommunicationAddressLines(comm?: JoiningCommunicationAddress | null) {
  const c = comm || {};
  const locality = [c.villageOrCity, c.mandal, c.district, c.state]
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter(Boolean)
    .join(', ');

  return {
    doorOrStreet: String(c.doorOrStreet || '').trim() || '—',
    landmark: String(c.landmark || '').trim() ? `Near: ${String(c.landmark).trim()}` : null,
    locality: locality || '—',
    pin: String(c.pinCode || '').trim() ? `PIN: ${String(c.pinCode).trim()}` : null,
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
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter(Boolean)
    .join(', ');

  const mobile = String(rel.phone || '').trim();

  return { header: header || '—', addressLine, mobile };
}
