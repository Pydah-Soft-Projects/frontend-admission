'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { DashboardShell, DashboardNavItem, HomeIcon, ListIcon, ChartBarIcon, SettingsIcon } from '@/components/layout/DashboardShell';
import { auth } from '@/lib/auth';
import type { User } from '@/types';

const navItems: DashboardNavItem[] = [
  { href: '/user/dashboard', label: 'Dashboard', icon: HomeIcon },
  { href: '/user/leads', label: 'My Leads', icon: ListIcon },
  { href: '/user/call-activity', label: 'Call activity', icon: ChartBarIcon },
  { href: '/user/settings', label: 'Settings', icon: SettingsIcon },
];

export default function UserLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '';
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const user = auth.getUser();
    if (!user) {
      router.replace('/auth/login');
      return;
    }

    if (user.roleName === 'Super Admin' || user.roleName === 'Sub Super Admin') {
      router.replace('/superadmin/dashboard');
      return;
    }
    if (user.roleName === 'Data Entry User') {
      router.replace('/superadmin/leads/individual');
      return;
    }

    setCurrentUser(user);
    setIsReady(true);
  }, [router, pathname]);

  // When time tracking is disabled, restrict access to Settings only
  useEffect(() => {
    if (!currentUser || !isReady) return;
    const timeTrackingEnabled = currentUser.timeTrackingEnabled !== false;
    if (!timeTrackingEnabled && pathname !== '/user/settings') {
      router.replace('/user/settings');
    }
  }, [currentUser, isReady, pathname, router]);

  if (!isReady) {
    return <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">Loading workspace…</div>;
  }

  const timeTrackingEnabled = currentUser?.timeTrackingEnabled !== false;

  return (
    <DashboardShell
      navItems={navItems}
      title=""
      description=""
      role={currentUser?.designation || 'Counsellor'}
      userName={currentUser?.name || 'Team Member'}
      useMobileBottomNav
    >
      {!timeTrackingEnabled && (
        <div className="mb-3 sm:mb-4 rounded-lg sm:rounded-xl border-2 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 sm:p-5">
          <p className="text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-200 mb-1">
            Access restricted
          </p>
          <p className="text-xs sm:text-sm text-amber-700 dark:text-amber-300 leading-snug">
            Turn ON the time tracking below to access all pages. Working hours are calculated by end of day from when you turn it ON and OFF.
          </p>
        </div>
      )}
      {children}
    </DashboardShell>
  );
}


