'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  DashboardShell,
  DashboardNavItem,
  HomeIcon,
  ListIcon,
  BookIcon,
  TemplateIcon,
  CommunicationsIcon,
  AcademicIcon,
  UserIcon,
  CurrencyIcon,
  SettingsIcon,
  ReportIcon,
} from '@/components/layout/DashboardShell';
import { auth } from '@/lib/auth';
import { refreshSessionUser } from '@/lib/sessionUser';
import type { ModulePermission, User } from '@/types';
import {
  PERMISSION_MODULES,
  DASHBOARD_PERMISSION_KEY,
  PermissionModuleKey,
} from '@/constants/permissions';
import { admissionTabsFromStored, joiningExtrasFromStored } from '@/lib/joiningPermissions';
import { TestNotificationsButton } from '@/components/TestNotificationsButton';
import { Loading } from '@/components/Loading';

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
      { href: '/superadmin/joining/confirmed', label: 'Confirmed Leads', icon: ListIcon, permissionKey: 'joining' },
      { href: '/superadmin/joining/self-registration', label: 'Self Registration', icon: TemplateIcon, permissionKey: 'joining' },
      { href: '/superadmin/joining', label: 'Joining Pipeline', icon: AcademicIcon, permissionKey: 'joining' },
      { href: '/superadmin/joining/fee-requests', label: 'Fee Requests', icon: CurrencyIcon, permissionKey: 'joining', joiningCapability: 'approveFeeRequest' },
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
  { href: '/superadmin/whatsapp/chat', label: 'WhatsApp Chat', icon: CommunicationsIcon, permissionKey: 'communications' },
  { href: '/superadmin/communications/templates', label: 'Communications', icon: CommunicationsIcon, permissionKey: 'communications' },
  { href: '/superadmin/form-builder', label: 'Lead Form Builder', icon: TemplateIcon, permissionKey: 'formBuilder' },
  { href: '/superadmin/master-data', label: 'Districts & Mandals', icon: AcademicIcon, permissionKey: 'masterData' },
  { href: '/superadmin/utm-builder', label: 'UTM Builder', icon: TemplateIcon, permissionKey: 'utmBuilder' },
  { href: '/superadmin/visitors', label: 'Visitors', icon: UserIcon, permissionKey: 'visitors' },
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
    permissions[module.key] =
      module.key === 'joining'
        ? {
            access: true,
            permission: 'write',
            editReference: true,
            editAdmission: true,
            approveFeeRequest: true,
            admissionTabAbstract: true,
            admissionTabDetailed: true,
            admissionTabStudentInfo: true,
            admissionTabReference: true,
            admissionTabSource: true,
            admissionTabDateWise: true,
          }
        : {
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
      const permission = entry.permission === 'write' ? 'write' : 'read';
      if (module.key === 'joining') {
        const typedEntry = entry as import('@/types').ModulePermission;
        const joiningExtras = joiningExtrasFromStored(typedEntry);
        const allowedColleges = Array.isArray(typedEntry.allowedColleges)
          ? typedEntry.allowedColleges.filter((id) => typeof id === 'string')
          : undefined;
        sanitized[module.key] = {
          access: true,
          permission,
          ...admissionTabsFromStored(typedEntry),
          ...(permission === 'write'
            ? {
                editReference: false,
                editAdmission: joiningExtras.editAdmission,
                approveFeeRequest: joiningExtras.approveFeeRequest,
              }
            : {}),
          ...(allowedColleges ? { allowedColleges } : {}),
        };
      } else {
        sanitized[module.key] = {
          access: true,
          permission,
        };
      }
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
    let cancelled = false;

    const bootstrap = async () => {
      const cached = auth.getUser();
      if (!cached) {
        router.replace('/auth/login');
        return;
      }

      if (
        cached.roleName !== 'Super Admin' &&
        cached.roleName !== 'Sub Super Admin' &&
        cached.roleName !== 'Data Entry User'
      ) {
        router.replace('/user/dashboard');
        return;
      }

      let user = cached;
      if (cached.roleName === 'Sub Super Admin') {
        const fresh = await refreshSessionUser();
        if (!cancelled && fresh) {
          user = fresh;
        }
      }

      if (!cancelled) {
        setCurrentUser(user);
        setIsAuthorised(true);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!currentUser || currentUser.roleName !== 'Sub Super Admin') return;

    const applyFreshUser = (fresh: User | null) => {
      if (fresh) {
        setCurrentUser((prev) => (prev ? { ...prev, ...fresh, permissions: fresh.permissions } : fresh));
      }
    };

    const syncPermissions = () => {
      void refreshSessionUser().then(applyFreshUser);
    };

    const onPermissionsChanged = (event: Event) => {
      const userId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
      if (!userId || userId === currentUser._id) {
        syncPermissions();
      }
    };

    window.addEventListener('focus', syncPermissions);
    window.addEventListener('crm-session-permissions-changed', onPermissionsChanged);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncPermissions();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('focus', syncPermissions);
      window.removeEventListener('crm-session-permissions-changed', onPermissionsChanged);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [currentUser?._id, currentUser?.roleName]);

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

  const useMobileBottomNav = useMemo(() => {
    if (currentUser?.roleName !== 'Sub Super Admin') return false;
    if (!pathname) return false;
    if (pathname === '/superadmin/leads') return true;
    const leadSubRoutes = new Set(['upload', 'assign', 'individual', 'group-update']);
    const match = pathname.match(/^\/superadmin\/leads\/([^/]+)$/);
    if (match && !leadSubRoutes.has(match[1])) return true;
    return false;
  }, [pathname, currentUser?.roleName]);

  const description =
    roleLabel === 'Data Entry User'
      ? 'Create a single prospect manually and add them to the admissions workflow.'
      : '';

  const title =
    roleLabel === 'Data Entry User'
      ? 'Data Entry'
      : '';

  if (!isAuthorised) {
    return <Loading />;
  }

  return (
    <DashboardShell
      navItems={navItems}
      title={title}
      description={description}
      role={roleLabel}
      roleName={roleLabel}
      userName={userName}
      permissions={permissionConfig}
      useMobileBottomNav={useMobileBottomNav}
    >
      {children}
      {/* Floating Test Notifications Button - Only for Super Admin */}
      {currentUser?.roleName === 'Super Admin' && <TestNotificationsButton />}
    </DashboardShell>
  );
}

