import Cookies from 'js-cookie';
import { authAPI } from './api';
import { User } from '@/types';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export const auth = {
  // Set authentication data
  setAuth: (token: string, user: User) => {
    Cookies.set(TOKEN_KEY, token, { expires: 7 }); // 7 days
    Cookies.set(USER_KEY, JSON.stringify(user), { expires: 7 });
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
  },

  // Clear authentication
  clearAuth: () => {
    Cookies.remove(TOKEN_KEY, { path: '/' });
    Cookies.remove(USER_KEY, { path: '/' });
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
      window.sessionStorage.clear();
    }
  },

  // Logout - calls backend to record logout, then clears auth and redirects
  logout: async () => {
    try {
      await authAPI.logout();
    } catch (_) {
      /* ignore - proceed with local logout */
    }
    auth.clearAuth();
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/login';
    }
  },

  // Check if time tracking is enabled (default true when undefined)
  isTimeTrackingEnabled: (): boolean => {
    const user = auth.getUser();
    if (!user) return true;
    return user.timeTrackingEnabled !== false;
  },
};

