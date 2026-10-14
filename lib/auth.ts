import Cookies from 'js-cookie';
import { authAPI, CRM_FRONTEND_URL } from './api';
import { User } from '@/types';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';
const SSO_KEY = 'is_sso';
const CRM_PORTAL_KEY = 'crm_portal_url';

export const auth = {
  // Set authentication data
  setAuth: (token: string, user: User, isSSO?: boolean, crmUrl?: string) => {
    Cookies.set(TOKEN_KEY, token, { expires: 7 }); // 7 days
    Cookies.set(USER_KEY, JSON.stringify(user), { expires: 7 });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    const ssoFlag = isSSO ?? user.isSSO ?? false;
    if (ssoFlag) {
      Cookies.set(SSO_KEY, 'true', { expires: 7 });
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SSO_KEY, 'true');
      }
      if (crmUrl) {
        Cookies.set(CRM_PORTAL_KEY, crmUrl, { expires: 7 });
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(CRM_PORTAL_KEY, crmUrl);
        }
      }
    } else {
      Cookies.remove(SSO_KEY, { path: '/' });
      Cookies.remove(CRM_PORTAL_KEY, { path: '/' });
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(SSO_KEY);
        window.localStorage.removeItem(CRM_PORTAL_KEY);
      }
    }
  },

  // Set SSO state explicitly
  setSSO: (isSSO: boolean, crmUrl?: string) => {
    if (isSSO) {
      Cookies.set(SSO_KEY, 'true', { expires: 7 });
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(SSO_KEY, 'true');
      }
      if (crmUrl) {
        Cookies.set(CRM_PORTAL_KEY, crmUrl, { expires: 7 });
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(CRM_PORTAL_KEY, crmUrl);
        }
      }
    } else {
      Cookies.remove(SSO_KEY, { path: '/' });
      Cookies.remove(CRM_PORTAL_KEY, { path: '/' });
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(SSO_KEY);
        window.localStorage.removeItem(CRM_PORTAL_KEY);
      }
    }
  },

  // Check if current session was authenticated via SSO
  isSSO: (): boolean => {
    const ssoCookie = Cookies.get(SSO_KEY);
    if (ssoCookie === 'true') return true;
    if (typeof window !== 'undefined') {
      if (window.localStorage.getItem(SSO_KEY) === 'true') return true;
    }
    const user = auth.getUser();
    if (user && user.isSSO) return true;
    return false;
  },

  // Get CRM portal URL (saved from login/SSO session or default from env)
  getCRMUrl: (): string => {
    const ssoUrlCookie = Cookies.get(CRM_PORTAL_KEY);
    if (ssoUrlCookie) return ssoUrlCookie;
    if (typeof window !== 'undefined') {
      const ssoUrlLocal = window.localStorage.getItem(CRM_PORTAL_KEY);
      if (ssoUrlLocal) return ssoUrlLocal;
    }
    return CRM_FRONTEND_URL;
  },

  // Get token
  getToken: (): string | undefined => {
    return Cookies.get(TOKEN_KEY);
  },

  // Get user
  getUser: (): User | null => {
    const userStr = Cookies.get(USER_KEY);
    if (!userStr) return null;
    try {
      return JSON.parse(userStr) as User;
    } catch {
      return null;
    }
  },

  // Check if user is authenticated
  isAuthenticated: (): boolean => {
    return !!Cookies.get(TOKEN_KEY);
  },

  // Check if user is super admin
  isSuperAdmin: (): boolean => {
    const user = auth.getUser();
    if (!user) return false;

    return user.roleName === 'Super Admin' || user.roleName === 'Sub Super Admin';
  },

  // Update stored user (e.g. after settings change)
  updateUser: (updates: Partial<User>) => {
    const user = auth.getUser();
    if (!user) return;
    const updated = { ...user, ...updates };
    Cookies.set(USER_KEY, JSON.stringify(updated), { expires: 7 });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(USER_KEY, JSON.stringify(updated));
    }
  },

  // Clear authentication
  clearAuth: () => {
    Cookies.remove(TOKEN_KEY, { path: '/' });
    Cookies.remove(USER_KEY, { path: '/' });
    Cookies.remove(SSO_KEY, { path: '/' });
    Cookies.remove(CRM_PORTAL_KEY, { path: '/' });
    Cookies.remove('accessToken', { path: '/' });
    Cookies.remove('refreshToken', { path: '/' });
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
      window.localStorage.removeItem(SSO_KEY);
      window.localStorage.removeItem(CRM_PORTAL_KEY);
      window.localStorage.removeItem('accessToken');
      window.localStorage.removeItem('refreshToken');
      window.localStorage.removeItem('user'); // Also common key
      window.sessionStorage.clear();
    }
  },

  // Logout - calls backend to record logout, then clears auth and redirects to CRM or login
  logout: async () => {
    const isSSOUser = auth.isSSO();
    const crmUrl = auth.getCRMUrl();
    try {
      await authAPI.logout();
    } catch (_) {
      /* ignore - proceed with local logout */
    }
    auth.clearAuth();
    if (typeof window !== 'undefined') {
      if (isSSOUser) {
        window.location.replace(crmUrl);
      } else {
        window.location.replace('/auth/login');
      }
    }
  },

  // Check if time tracking is enabled (default true when undefined)
  isTimeTrackingEnabled: (): boolean => {
    const user = auth.getUser();
    if (!user) return true;
    return user.timeTrackingEnabled !== false;
  },
};

