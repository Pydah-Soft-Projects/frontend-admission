'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell, DashboardNavItem, HomeIcon, ListIcon } from '@/components/layout/DashboardShell';
import { auth } from '@/lib/auth';
import type { User } from '@/types';

const navItems: DashboardNavItem[] = [
  { href: '/user/dashboard', label: 'Dashboard', icon: HomeIcon },
  { href: '/user/leads', label: 'My Leads', icon: ListIcon },
];

export default function UserLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
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
  }, [router]);

  if (!isReady) {
    return <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">Loading workspace…</div>;
  }

  return (
    <DashboardShell
      navItems={navItems}
      title="Admissions Team"
      description="Stay on top of your leads, follow-ups, and conversions."
      role={currentUser?.designation || 'Counsellor'}
      userName={currentUser?.name || 'Team Member'}
    >
      {children}
    </DashboardShell>
  );
}


