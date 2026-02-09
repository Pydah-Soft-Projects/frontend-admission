'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { DashboardShell, DashboardNavItem, HomeIcon, ListIcon, UserIcon, ReportIcon, SettingsIcon } from '@/components/layout/DashboardShell';
import { auth } from '@/lib/auth';
import type { User } from '@/types';

const navItems: DashboardNavItem[] = [
  { href: '/manager/dashboard', label: 'Dashboard', icon: HomeIcon },
  { href: '/manager/leads', label: 'All Leads', icon: ListIcon },
  { href: '/manager/team', label: 'Team', icon: UserIcon },
  { href: '/manager/analytics', label: 'Analytics', icon: ReportIcon },
  { href: '/manager/settings', label: 'Settings', icon: SettingsIcon },
];

export default function ManagerLayout({ children }: { children: ReactNode }) {
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

    if (!user.isManager) {
      if (user.roleName === 'Super Admin' || user.roleName === 'Sub Super Admin') {
        router.replace('/superadmin/dashboard');
      } else {
        router.replace('/user/dashboard');
      }
      return;
    }

    setCurrentUser(user);
    setIsReady(true);
  }, [router, pathname]);

  // When time tracking is disabled, restrict access to Settings only
  useEffect(() => {
    if (!currentUser || !isReady) return;
    const timeTrackingEnabled = currentUser.timeTrackingEnabled !== false;
    if (!timeTrackingEnabled && pathname !== '/manager/settings') {
      router.replace('/manager/settings');
    }
  }, [currentUser, isReady, pathname, router]);

  if (!isReady) {
    return <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">Loading workspace…</div>;
  }

  const timeTrackingEnabled = currentUser?.timeTrackingEnabled !== false;

  return (
    <DashboardShell
      navItems={navItems}
      title="Manager Workspace"
      description="Manage your team and track performance."
      role="Manager"
      userName={currentUser?.name || 'Manager'}
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

