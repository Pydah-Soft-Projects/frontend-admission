const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export type JoiningPublicBootstrapData = {
  joining: unknown;
  lead: unknown | null;
  routeKey: string;
  expiresAt: string;
  ttlSeconds: number;
  courseSettings: unknown[];
  programLevels: string[];
  registrationForms: unknown[];
  registrationForm: unknown | null;
  certificateGuidance: unknown | null;
  selfRegistration?: boolean;
};

async function parseJsonResponse(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { message?: string })?.message || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return body as { success?: boolean; data?: JoiningPublicBootstrapData; message?: string };
}

const publicJoiningQuery = (token: string) =>
  `t=${encodeURIComponent(token)}`;

export const joiningPublicApi = {
  getBootstrap: async (token: string) => {
    const res = await fetch(`${API_BASE_URL}/joinings/public?${publicJoiningQuery(token)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return parseJsonResponse(res);
  },

  saveDraft: async (token: string, data: unknown) => {
    const res = await fetch(`${API_BASE_URL}/joinings/public?${publicJoiningQuery(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data ?? {}),
    });
    return parseJsonResponse(res);
  },

  submit: async (token: string, routeKey?: string) => {
    const res = await fetch(`${API_BASE_URL}/joinings/public/submit?${publicJoiningQuery(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(routeKey ? { routeKey } : {}),
    });
    return parseJsonResponse(res);
  },
};
