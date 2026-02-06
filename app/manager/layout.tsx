'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell, DashboardNavItem, HomeIcon, ListIcon, UserIcon, ReportIcon } from '@/components/layout/DashboardShell';
import { auth } from '@/lib/auth';
import type { User } from '@/types';

const navItems: DashboardNavItem[] = [
  { href: '/manager/dashboard', label: 'Dashboard', icon: HomeIcon },
  { href: '/manager/leads', label: 'All Leads', icon: ListIcon },
  { href: '/manager/team', label: 'Team', icon: UserIcon },
  { href: '/manager/analytics', label: 'Analytics', icon: ReportIcon },
];

export default function ManagerLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
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
  }, [router]);

  if (!isReady) {
    return <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">Loading workspace…</div>;
  }

  return (
    <DashboardShell
      navItems={navItems}
      title="Manager Workspace"
      description="Manage your team and track performance."
      role="Manager"
      userName={currentUser?.name || 'Manager'}
      useMobileBottomNav
    >
      {children}
    </DashboardShell>
  );
}

