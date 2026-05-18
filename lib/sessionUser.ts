import { authAPI } from '@/lib/api';
import { auth } from '@/lib/auth';
import type { User } from '@/types';

/** Load the logged-in user from the API and merge into the session cookie. */
export async function refreshSessionUser(): Promise<User | null> {
  const cached = auth.getUser();
  if (!cached) return null;

  try {
    const fresh = (await authAPI.getCurrentUser()) as User | null;
    if (!fresh || (!fresh.id && !fresh._id)) {
      return cached;
    }

    const merged: User = {
      ...cached,
      ...fresh,
      permissions: fresh.permissions ?? cached.permissions,
    };
    auth.updateUser(merged);
    return merged;
  } catch {
    return cached;
  }
}
