'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  DashboardShell,
  DashboardNavItem,
  HomeIcon,
  ListIcon,
  UploadIcon,
  TemplateIcon,
  AcademicIcon,
  UserIcon,
  CurrencyIcon,
  SettingsIcon,
  ReportIcon,
} from '@/components/layout/DashboardShell';
import { auth } from '@/lib/auth';
import type { ModulePermission, User } from '@/types';
import {
  PERMISSION_MODULES,
  DASHBOARD_PERMISSION_KEY,
  PermissionModuleKey,
} from '@/constants/permissions';
import { TestNotificationsButton } from '@/components/TestNotificationsButton';

const BASE_NAV_ITEMS: DashboardNavItem[] = [
  { href: '/superadmin/dashboard', label: 'Overview', icon: HomeIcon, permissionKey: DASHBOARD_PERMISSION_KEY },
  {
    href: '/superadmin/leads',
    label: 'Leads',
    icon: ListIcon,
    permissionKey: 'leads',
  },
  {
    href: '/superadmin/joining',
    label: 'Joining Desk',
    icon: AcademicIcon,
    permissionKey: 'joining',
    children: [
      { href: '/superadmin/joining', label: 'Joining Pipeline', icon: AcademicIcon, permissionKey: 'joining' },
      { href: '/superadmin/joining/confirmed', label: 'Confirmed Leads', icon: ListIcon, permissionKey: 'joining' },
      { href: '/superadmin/joining/completed', label: 'Admissions', icon: AcademicIcon, permissionKey: 'joining' },
    ],
  },
  {
    href: '/superadmin/payments',
    label: 'Payments',
    icon: CurrencyIcon,
    permissionKey: 'payments',
    children: [
      { href: '/superadmin/payments/courses', label: 'Courses & Branches', icon: ListIcon, permissionKey: 'payments' },
      { href: '/superadmin/payments/settings', label: 'Fee Configuration', icon: SettingsIcon, permissionKey: 'payments' },
      { href: '/superadmin/payments/transactions', label: 'Transactions', icon: TemplateIcon, permissionKey: 'payments' },
    ],
  },
  { href: '/superadmin/users', label: 'User Management', icon: UserIcon, permissionKey: 'users' },
  { href: '/superadmin/communications/templates', label: 'SMS Templates', icon: TemplateIcon, permissionKey: 'communications' },
  { href: '/superadmin/form-builder', label: 'Lead Form Builder', icon: TemplateIcon, permissionKey: 'formBuilder' },
  { href: '/superadmin/master-data', label: 'Districts & Mandals', icon: AcademicIcon, permissionKey: 'masterData' },
  { href: '/superadmin/utm-builder', label: 'UTM Builder', icon: TemplateIcon, permissionKey: 'leads' },
  { href: '/superadmin/visitors', label: 'Visitors', icon: UserIcon, permissionKey: 'leads' },
  { href: '/superadmin/reports', label: 'Reports', icon: ReportIcon, permissionKey: 'reports' },
  { href: '/superadmin/profile', label: 'Profile & Settings', icon: UserIcon, permissionKey: 'dashboard' },
];

/** Data Entry User sees only this: Create Individual Lead */
const DATA_ENTRY_NAV_ITEMS: DashboardNavItem[] = [
  { href: '/superadmin/leads/individual', label: 'Create Lead', icon: ListIcon, permissionKey: 'leads' },
];

const buildFullAccessPermissions = (): Record<PermissionModuleKey, ModulePermission> => {
  const permissions: Record<PermissionModuleKey, ModulePermission> = {} as Record<
    PermissionModuleKey,
    ModulePermission
  >;

  PERMISSION_MODULES.forEach((module) => {
    permissions[module.key] = {
      access: true,
      permission: 'write',
    };
  });

  return permissions;
};

const sanitizeSubAdminPermissions = (
  permissions?: Record<string, ModulePermission>
): Record<PermissionModuleKey, ModulePermission> => {
  const sanitized: Record<PermissionModuleKey, ModulePermission> = {} as Record<
    PermissionModuleKey,
    ModulePermission
  >;

  PERMISSION_MODULES.forEach((module) => {
    const entry = permissions?.[module.key];
    if (entry?.access) {
      sanitized[module.key] = {
        access: true,
        permission: entry.permission === 'read' ? 'read' : 'write',
      };
    } else {
      sanitized[module.key] = {
        access: false,
        permission: 'read',
      };
    }
  });

  return sanitized;
};

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || '';
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthorised, setIsAuthorised] = useState(false);

  useEffect(() => {
    const user = auth.getUser();
    if (!user) {
      router.replace('/auth/login');
      return;
    }

    if (user.roleName !== 'Super Admin' && user.roleName !== 'Sub Super Admin' && user.roleName !== 'Data Entry User') {
      router.replace('/user/dashboard');
      return;
    }

    setCurrentUser(user);
    setIsAuthorised(true);
  }, [router]);

  // Data Entry User may only access the create individual lead page
  useEffect(() => {
    if (!currentUser || currentUser.roleName !== 'Data Entry User') return;
    if (pathname !== '/superadmin/leads/individual') {
      router.replace('/superadmin/leads/individual');
    }
  }, [currentUser, pathname, router]);

  const permissionConfig = useMemo(() => {
    if (!currentUser) {
      return buildFullAccessPermissions();
    }

    if (currentUser.roleName === 'Super Admin') {
      return buildFullAccessPermissions();
    }

    if (currentUser.roleName === 'Sub Super Admin') {
      return sanitizeSubAdminPermissions(currentUser.permissions || {});
    }

    if (currentUser.roleName === 'Data Entry User') {
      const dataEntryPerms: Record<PermissionModuleKey, ModulePermission> = {} as Record<
        PermissionModuleKey,
        ModulePermission
      >;
      PERMISSION_MODULES.forEach((module) => {
        dataEntryPerms[module.key] = {
          access: module.key === 'leads',
          permission: 'write',
        };
      });
      return dataEntryPerms;
    }

    return {};
  }, [currentUser]);

  const navItems = useMemo(() => {
    if (currentUser?.roleName === 'Data Entry User') return DATA_ENTRY_NAV_ITEMS;
    return BASE_NAV_ITEMS;
  }, [currentUser]);

  const roleLabel = currentUser?.roleName ?? 'Super Admin';
  const userName = currentUser?.name ?? 'Super Admin';

  const description =
    roleLabel === 'Data Entry User'
      ? 'Create a single prospect manually and add them to the admissions workflow.'
      : roleLabel === 'Sub Super Admin'
        ? 'Access the modules delegated to you by the super admin team.'
        : '';

  const title =
    roleLabel === 'Data Entry User'
      ? 'Data Entry'
      : roleLabel === 'Super Admin'
        ? ''
        : 'Command Center';

  if (!isAuthorised) {
    return <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-950">Preparing workspace…</div>;
  }

  return (
    <DashboardShell
      navItems={navItems}
      title={title}
      description={description}
      role={roleLabel}
      userName={userName}
      permissions={permissionConfig}
    >
      {children}
      {/* Floating Test Notifications Button - Only for Super Admin */}
      {currentUser?.roleName === 'Super Admin' && <TestNotificationsButton />}
    </DashboardShell>
  );
}

