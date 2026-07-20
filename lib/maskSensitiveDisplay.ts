export function maskPhone(value?: string): string {
  const digits = String(value ?? '').replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return String(value ?? '').trim() || '—';
  return `xxxxxxx${digits.slice(-3)}`;
}

export function isPhoneFieldKey(key: string): boolean {
  const n = String(key || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return (
    n.includes('phone') ||
    n.includes('mobile') ||
    n.includes('whatsapp') ||
    n === 'contact_number' ||
    n === 'contact'
  );
}
