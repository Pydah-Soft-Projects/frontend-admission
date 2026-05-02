/**
 * Normalizes POST /joinings/:leadId/public-edit-link responses for UI (clipboard, SMS prefill).
 */
export type JoiningPublicInviteLink = {
  url: string;
  expiresAt?: string;
  ttlSeconds?: number;
  /**
   * Opaque segment after `/joining/public/` (same as API `token`). For DLT templates, keep the base URL
   * fixed in the template body and map this value to the variable after `public/`.
   */
  pathToken: string;
};

/**
 * Value for DLT variable: query `t` / `token`, else legacy path segment after `/joining/public/`.
 * API `token` field is always the raw secret (preferred).
 */
export function extractJoiningPublicPathToken(fullUrl: string, apiToken?: string | null): string {
  const t = apiToken != null ? String(apiToken).trim() : '';
  if (t) return t;
  try {
    const u = new URL(String(fullUrl || '').trim(), 'https://example.invalid');
    const q = u.searchParams.get('t') || u.searchParams.get('token');
    if (q && q.trim()) return q.trim();
  } catch {
    /* relative URL or invalid */
  }
  const m = String(fullUrl || '').match(/\/joining\/public\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : '';
}

export function parseJoiningPublicLinkFromApiResponse(res: unknown): JoiningPublicInviteLink | null {
  const body = res as {
    data?: {
      publicUrl?: string;
      path?: string;
      token?: string;
      expiresAt?: string;
      ttlSeconds?: number;
    };
  };
  const d = body?.data;
  if (!d) return null;
  const pathOnly =
    d.path ||
    (d.token ? `/joining/public?t=${encodeURIComponent(String(d.token))}` : '');
  const url =
    d.publicUrl ||
    (typeof window !== 'undefined' && pathOnly ? `${window.location.origin}${pathOnly}` : pathOnly) ||
    null;
  if (!url) return null;
  const pathToken = extractJoiningPublicPathToken(url, d.token ?? null);
  return { url, expiresAt: d.expiresAt, ttlSeconds: d.ttlSeconds, pathToken };
}
