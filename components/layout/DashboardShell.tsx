'use client';

import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  createContext,
  useContext,
  ReactNode,
  ReactElement,
} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '../ui/Button';
import { auth } from '@/lib/auth';
import type { ModulePermission } from '@/types';
import {
  JOINING_PERMISSION_KEY,
  allowedAdmissionTabs,
  resolveAdmissionTabAccess,
  resolveJoiningEditAdmission,
  resolveJoiningEditReference,
  resolveSubmitFeeRequest,
  resolveApproveFeeRequest,
  type AdmissionTabKey,
} from '@/lib/joiningPermissions';
import { NotificationBell } from '../NotificationBell';
import { MobileBottomNav, flattenNavItemsForMobile } from './MobileBottomNav';
import { MobileMenuSheet } from './MobileMenuSheet';

type IconProps = React.SVGProps<SVGSVGElement>;
type IconComponent = React.FC<IconProps>;

const createIcon = (path: string) => {
  const Icon: IconComponent = ({ className, ...props }) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-5 w-5', className)}
      {...props}
    >
      <path d={path} />
    </svg>
  );
  Icon.displayName = 'DashboardIcon';
  return Icon;
};

export const HomeIcon = createIcon('M3 11.25l9-8.25 9 8.25V20a1 1 0 0 1-1 1h-5.5v-5.5h-5V21H4a1 1 0 0 1-1-1z');
export const ListIcon = createIcon('M4 6h16M4 12h16M4 18h10');
export const UploadIcon = createIcon('M12 4v12m0 0 4-4m-4 4-4-4M4 20h16');
export const PhoneIcon = createIcon('M5 4h3l2 5-2 1a11.05 11.05 0 0 0 7 7l1-2 5 2v3a1 1 0 0 1-1 1A17 17 0 0 1 4 5a1 1 0 0 1 1-1z');
/** Chat bubble — SMS / communications */
export const CommunicationsIcon = createIcon(
  'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z'
);
export const AcademicIcon = createIcon('M3 6.75 12 3l9 3.75-9 3.75L3 6.75zm18 6L12 17.5 3 12.75m18 0v4.5M3 12.75v4.5');
export const TemplateIcon = createIcon('M6 4h8l4 4v12H6zM14 4v4h4');
export const UserIcon = createIcon('M5.5 20a6.5 6.5 0 0 1 13 0m-6.5-8a4 4 0 1 1 0-8 4 4 0 0 1 0 8z');
export const MenuIcon = createIcon('M4 7h16M4 12h16M4 17h16');
export const CollapseIcon = createIcon('M9 18l-3-3 3-3M15 6l3 3-3 3');
export const ChevronDownIcon = createIcon('M6 9l6 6 6-6');
export const CurrencyIcon = createIcon('M7 5h10M7 9h7a3 3 0 1 1-3 3m3 7-5-5');
export const SettingsIcon = createIcon(
  'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0-5.5v2m0 15v2m8-9h-2m-15 0H3m14.07-7.07-1.41 1.41M7.34 16.66l-1.41 1.41m0-12.73 1.41 1.41m9.32 9.32 1.41 1.41'
);
export const LogoutIcon = createIcon('M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1');
export const BackIcon = createIcon('M10 19l-7-7m0 0l7-7m-7 7h18');
export const ReportIcon = createIcon(
  'M3 3h18v18H3V3zm2 2v14h14V5H5zm2 2h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z'
);
export const BookIcon = createIcon(
  'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'
);
export const BellIcon = createIcon(
  'M10 2a6 6 0 0 0-6 6v3.586l-.707.707A1 1 0 0 0 4 14h12a1 1 0 0 0 .707-1.707L16 11.586V8a6 6 0 0 0-6-6zM10 18a3 3 0 0 1-3-3h6a3 3 0 0 1-3 3z'
);

export const DashboardGridIcon = createIcon(
  'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 8.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 018.25 20.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z'
);
export const UsersIcon = createIcon(
  'M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.116-2.029 3.75 3.75 0 00-6.767-3.848 12.067 12.067 0 01-1.996-2.124 7.125 7.125 0 0114.25 0z'
);
export const UserCircleIcon = createIcon(
  'M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z'
);
export const ChartBarIcon = createIcon(
  'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z'
);
export const PlusIcon = createIcon('M12 4.5v15m7.5-7.5h-15');
export const UserPlusIcon = createIcon('M19 21v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8zM16 11h6m-3-3v6');


const MOBILE_TOP_BAR_ICONS: Record<string, IconComponent> = {
  dashboard: DashboardGridIcon,
  leads: UsersIcon,
  'lead-details': UserCircleIcon,
  team: UsersIcon,
  'team-member': UserCircleIcon,
  analytics: ChartBarIcon,
  'team-leads': ListIcon,
  activity: ChartBarIcon,
  book: BookIcon,
};

export type MobileTopBarOptions = {
  title: string;
  /** Optional secondary line shown beside the title on desktop (e.g. lead totals). */
  titleMeta?: string;
  showBack?: boolean;
  backHref?: string;
  /** Icon key for mobile top bar: dashboard | leads | lead-details | team | team-member | analytics | team-leads */
  iconKey?: keyof typeof MOBILE_TOP_BAR_ICONS;
  rightAction?: {
    iconKey: keyof typeof MOBILE_TOP_BAR_ICONS;
    onClick: () => void;
  };
};

type DashboardHeaderContextValue = {
  setHeaderContent: (content: ReactNode) => void;
  clearHeaderContent: () => void;
  setMobileTopBar: (options: MobileTopBarOptions | null) => void;
  clearMobileTopBar: () => void;
};

const DashboardHeaderContext = createContext<DashboardHeaderContextValue | null>(null);

const noopHeaderContext: DashboardHeaderContextValue = {
  setHeaderContent: () => {},
  clearHeaderContent: () => {},
  setMobileTopBar: () => {},
  clearMobileTopBar: () => {},
};

export const useDashboardHeader = () => {
  const ctx = useContext(DashboardHeaderContext);
  return ctx ?? noopHeaderContext;
};

type PermissionContextValue = {
  permissions: Record<string, ModulePermission>;
  hasAccess: (moduleKey: string) => boolean;
  canWrite: (moduleKey: string) => boolean;
  getModulePermission: (moduleKey: string) => ModulePermission | undefined;
  canJoiningEditReference: () => boolean;
  canJoiningEditAdmission: () => boolean;
  canSubmitFeeRequest: () => boolean;
  canApproveFeeRequest: () => boolean;
  canAccessAdmissionTab: (tab: AdmissionTabKey) => boolean;
  getAllowedAdmissionTabs: () => AdmissionTabKey[];
};

const PermissionContext = createContext<PermissionContextValue | null>(null);

export const useModulePermission = (moduleKey: string) => {
  const ctx = useContext(PermissionContext);
  const fallback = {
    hasAccess: true,
    canWrite: true,
  };

  if (!ctx) {
    return fallback;
  }

  return {
    hasAccess: ctx.hasAccess(moduleKey),
    canWrite: ctx.canWrite(moduleKey),
  };
};

export const useModulePermissionRaw = (moduleKey: string) => {
  const ctx = useContext(PermissionContext);
  return ctx?.getModulePermission(moduleKey);
};

export const useAdmissionTabPermissions = () => {
  const ctx = useContext(PermissionContext);
  const base = useModulePermission(JOINING_PERMISSION_KEY);
  const allTabs: AdmissionTabKey[] = [
    'abstract',
    'student-info',
    'reference-list',
    'source-list',
    'date-wise',
  ];
  const allowedTabs = useMemo(
    () => (ctx ? ctx.getAllowedAdmissionTabs() : allTabs),
    // Permission context value is memoized; recompute when it changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx]
  );
  const canAccessTab = useCallback(
    (tab: AdmissionTabKey) => (ctx ? ctx.canAccessAdmissionTab(tab) : true),
    [ctx]
  );
  return {
    ...base,
    allowedTabs: ctx ? allowedTabs : allTabs,
    canAccessTab,
  };
};

export const useJoiningDeskPermissions = () => {
  const ctx = useContext(PermissionContext);
  const base = useModulePermission(JOINING_PERMISSION_KEY);
  const denyEdits = {
    ...base,
    canEditReference: false,
    canEditAdmission: false,
    canSubmitFeeRequest: false,
    canApproveFeeRequest: false,
  };
  if (!ctx) {
    return denyEdits;
  }
  return {
    ...base,
    canEditReference: ctx.canJoiningEditReference(),
    canEditAdmission: ctx.canJoiningEditAdmission(),
    canSubmitFeeRequest: ctx.canSubmitFeeRequest(),
    canApproveFeeRequest: ctx.canApproveFeeRequest(),
  };
};

export type DashboardNavItem = {
  href: string;
  label: string;
  icon?: IconComponent;
  badge?: string;
  children?: DashboardNavItem[];
  permissionKey?: string;
  /** Hide unless the user has this joining-desk capability (in addition to module access). */
  joiningCapability?: 'approveFeeRequest';
  hideInBottomNav?: boolean;
};

/** Exact route or nested path under `href` (avoids `/joining` matching `/joining/confirmed`). */
function pathMatchesNav(href: string, currentPath: string): boolean {
  if (currentPath === href) return true;
  if (href === '/') return currentPath === '/';
  return currentPath.startsWith(`${href}/`);
}

/** `/superadmin/leads/:id` (dynamic lead), not the list or static sub-routes */
function isSuperadminLeadDetailPath(pathname: string): boolean {
  const m = pathname.match(/^\/superadmin\/leads\/([^/]+)$/);
  if (!m) return false;
  const segment = m[1];
  return !['assign', 'individual', 'group-update', 'upload'].includes(segment);
}

/** Joining Desk list tabs (not a lead/joining workspace). */
const JOINING_LIST_SEGMENTS = [
  'confirmed',
  'completed',
  'in-progress',
  'self-registration',
  'fee-requests',
] as const;

function isJoiningListPath(pathname: string): boolean {
  if (pathname === '/superadmin/joining') return true;
  const m = pathname.match(/^\/superadmin\/joining\/([^/]+)\/?$/);
  return !!m && (JOINING_LIST_SEGMENTS as readonly string[]).includes(m[1]);
}

/** `/superadmin/joining/:leadId` edit workspace — not list sub-routes or detail. */
function isJoiningWorkspaceEditPath(pathname: string): boolean {
  const m = pathname.match(/^\/superadmin\/joining\/([^/]+)$/);
  if (!m) return false;
  return !(JOINING_LIST_SEGMENTS as readonly string[]).includes(m[1]);
}

/** `/superadmin/joining/:leadId/detail` read-only joining form view. */
function isJoiningDetailPath(pathname: string): boolean {
  return /^\/superadmin\/joining\/[^/]+\/detail$/.test(pathname);
}

/** `/superadmin/admission/:admissionId/detail` — full-width read-only profile view. */
function isAdmissionDetailPath(pathname: string): boolean {
  return /^\/superadmin\/admission\/[^/]+\/detail$/.test(pathname);
}

interface DashboardShellProps {
  children: React.ReactNode;
  navItems: DashboardNavItem[];
  title?: string;
  description?: string;
  /** Workspace subtitle (e.g. designation) shown as "{role} Space" when distinct from roleName */
  role?: string;
  /** System role (e.g. Student Counselor, PRO, Super Admin) — shown in the sidebar footer */
  roleName?: string;
  userName?: string;
  permissions?: Record<string, ModulePermission>;
  /** When true, on mobile (< lg) hide top header and show bottom nav instead. Use for user/manager dashboards. */
  useMobileBottomNav?: boolean;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  children,
  navItems,
  title = 'Workspace',
  description = 'Manage records and track outcomes with confidence.',
  role,
  roleName,
  userName,
  permissions = {},
  useMobileBottomNav = false,
}) => {
  const pathname = usePathname() || '';
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [headerContent, setHeaderContent] = useState<ReactNode>(null);
  const [mobileTopBar, setMobileTopBarState] = useState<MobileTopBarOptions | null>(null);

  const isSuperadminLeadDetail = isSuperadminLeadDetailPath(pathname);
  const isJoiningWorkspaceEdit = isJoiningWorkspaceEditPath(pathname);
  const isAdmissionDetail = isAdmissionDetailPath(pathname);
  const isEdgeToEdgeWorkspace =
    isJoiningWorkspaceEdit || isAdmissionDetail;

  // Pages where we want minimal top spacing (compact header)
  const isCompactPage =
    ['/superadmin/dashboard', '/superadmin/leads', '/superadmin/reports', '/superadmin/leads/assign'].includes(pathname) ||
    pathname.startsWith('/superadmin/joining') ||
    isSuperadminLeadDetail ||
    isAdmissionDetail;

  // Pages where we want full width (no max-width constraint on main content wrapper)
  const isFullWidthPage =
    ['/superadmin/leads/assign', '/superadmin/communications/templates'].includes(pathname) ||
    pathname.startsWith('/superadmin/joining') ||
    isSuperadminLeadDetail ||
    isAdmissionDetail;

  // Pages where we want reduced vertical spacing but keep header visible
  const isReducedSpacingPage = ['/superadmin/users'].includes(pathname);

  const hideMainTopHeader =
    pathname === '/superadmin/communications/templates' ||
    pathname === '/superadmin/form-builder' ||
    pathname === '/superadmin/utm-builder' ||
    pathname === '/superadmin/leads/assign' ||
    isSuperadminLeadDetail;

  const minimalMobileHeaderTitle =
    pathname === '/superadmin/form-builder'
      ? 'Lead Form Builder'
      : pathname === '/superadmin/communications/templates'
        ? 'Communications'
        : pathname === '/superadmin/utm-builder'
          ? 'UTM URL Builder'
          : pathname === '/superadmin/leads/assign'
            ? 'Assign Leads'
          : isSuperadminLeadDetail
            ? 'Lead details'
            : 'Menu';

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('sidebar-collapsed') : null;
    if (saved === 'true') {
      setIsCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('sidebar-collapsed', isCollapsed ? 'true' : 'false');
    }
  }, [isCollapsed]);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  const setHeader = useCallback((content: ReactNode) => {
    setHeaderContent(content);
  }, []);

  const clearHeader = useCallback(() => {
    setHeaderContent(null);
  }, []);

  const setMobileTopBar = useCallback((options: MobileTopBarOptions | null) => {
    setMobileTopBarState(options);
  }, []);
  const clearMobileTopBar = useCallback(() => {
    setMobileTopBarState(null);
  }, []);

  const headerContextValue = useMemo(
    () => ({
      setHeaderContent: setHeader,
      clearHeaderContent: clearHeader,
      setMobileTopBar,
      clearMobileTopBar,
    }),
    [setHeader, clearHeader, setMobileTopBar, clearMobileTopBar]
  );

  const normalizedPermissions = useMemo(() => permissions || {}, [permissions]);

  const hasAccessForKey = useCallback(
    (moduleKey?: string) => {
      if (!moduleKey || moduleKey === 'dashboard') {
        return true;
      }
      const entry = normalizedPermissions[moduleKey];
      return Boolean(entry?.access);
    },
    [normalizedPermissions]
  );

  const canWriteForKey = useCallback(
    (moduleKey: string) => {
      if (!moduleKey || moduleKey === 'dashboard') {
        return true;
      }
      const entry = normalizedPermissions[moduleKey];
      if (!entry?.access) {
        return false;
      }
      return entry.permission !== 'read';
    },
    [normalizedPermissions]
  );

  const joiningPermissionEntry = normalizedPermissions[JOINING_PERMISSION_KEY] as ModulePermission | undefined;
  const isSuperAdminRole = roleName === 'Super Admin';

  const canJoiningEditReference = useCallback(
    () => resolveJoiningEditReference(joiningPermissionEntry, isSuperAdminRole),
    [joiningPermissionEntry, isSuperAdminRole]
  );

  const canJoiningEditAdmission = useCallback(
    () => resolveJoiningEditAdmission(joiningPermissionEntry, isSuperAdminRole),
    [joiningPermissionEntry, isSuperAdminRole]
  );

  const canSubmitFeeRequest = useCallback(
    () => resolveSubmitFeeRequest(joiningPermissionEntry, isSuperAdminRole),
    [joiningPermissionEntry, isSuperAdminRole]
  );

  const canApproveFeeRequest = useCallback(
    () => resolveApproveFeeRequest(joiningPermissionEntry, isSuperAdminRole),
    [joiningPermissionEntry, isSuperAdminRole]
  );

  const canAccessAdmissionTab = useCallback(
    (tab: AdmissionTabKey) =>
      resolveAdmissionTabAccess(tab, joiningPermissionEntry, isSuperAdminRole),
    [joiningPermissionEntry, isSuperAdminRole]
  );

  const getModulePermission = useCallback(
    (moduleKey: string) => normalizedPermissions[moduleKey],
    [normalizedPermissions]
  );

  const getAllowedAdmissionTabs = useCallback(
    () => allowedAdmissionTabs(joiningPermissionEntry, isSuperAdminRole),
    [joiningPermissionEntry, isSuperAdminRole]
  );

  const filterNavItems = useCallback(
    (items: DashboardNavItem[]): DashboardNavItem[] =>
      items
        .map((item) => {
          const children = item.children ? filterNavItems(item.children) : [];
          const moduleAccessible = hasAccessForKey(item.permissionKey);
          const joiningCapabilityOk =
            !item.joiningCapability ||
            (item.joiningCapability === 'approveFeeRequest' ? canApproveFeeRequest() : true);
          const accessible = moduleAccessible && joiningCapabilityOk;

          if (!accessible && children.length === 0) {
            return null;
          }

          return {
            ...item,
            children,
          };
        })
        .filter(Boolean) as DashboardNavItem[],
    [hasAccessForKey, canApproveFeeRequest, canSubmitFeeRequest]
  );

  const filteredNavItems = useMemo(() => filterNavItems(navItems), [filterNavItems, navItems]);

  const findActiveParents = useCallback((items: DashboardNavItem[], currentPath: string, acc: Set<string>) => {
    items.forEach((item) => {
      if (item.children && item.children.length > 0) {
        const childActive = item.children.some((child) => pathMatchesNav(child.href, currentPath));
        if (childActive) {
          acc.add(item.href);
        }
        findActiveParents(item.children, currentPath, acc);
      }
    });
    return acc;
  }, []);

  const activeParents = useMemo(
    () => Array.from(findActiveParents(filteredNavItems, pathname, new Set<string>())),
    [findActiveParents, filteredNavItems, pathname]
  );

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(activeParents));

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = new Set(activeParents);
      if (prev.size === next.size) {
        let isSame = true;
        prev.forEach((value) => {
          if (!next.has(value)) {
            isSame = false;
          }
        });
        if (isSame) {
          return prev;
        }
      }
      return next;
    });
  }, [activeParents]);

  const toggleGroup = useCallback((href: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      return next;
    });
  }, []);

  const handleLogout = () => {
    if (typeof window !== 'undefined' && window.confirm('Are you sure you want to logout?')) {
      auth.logout(); // async - calls backend for logout tracking, then redirects
    }
  };

  const handleBack = () => {
    // Smart back navigation based on current route
    if (pathname.includes('/superadmin/leads/')) {
      // If on lead detail page, go to leads list
      router.push('/superadmin/leads');
    } else if (pathname.includes('/user/leads/')) {
      // If on user lead detail page, go to user leads list
      router.push('/user/leads');
    } else if (isAdmissionDetailPath(pathname)) {
      // Full admission page — return to Admissions Student Info (or ?tab= from URL)
      const tab =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('tab')
          : null;
      const admissionsTab =
        tab &&
        ['abstract', 'student-info', 'reference-list', 'source-list', 'date-wise'].includes(tab)
          ? tab
          : 'student-info';
      router.push(`/superadmin/joining/completed?tab=${encodeURIComponent(admissionsTab)}`);
    } else if (isJoiningWorkspaceEditPath(pathname) || isJoiningDetailPath(pathname)) {
      // Prefer explicit Admissions return (?from=admissions&tab=...) then browser history
      const fromParams =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search)
          : null;
      if (fromParams?.get('from') === 'admissions') {
        const tab = fromParams.get('tab');
        const admissionsTab =
          tab &&
          ['abstract', 'student-info', 'reference-list', 'source-list', 'date-wise'].includes(tab)
            ? tab
            : 'student-info';
        router.push(`/superadmin/joining/completed?tab=${encodeURIComponent(admissionsTab)}`);
      } else if (typeof window !== 'undefined' && window.history.length > 1) {
        router.back();
      } else {
        router.push('/superadmin/joining');
      }
    } else if (pathname.includes('/superadmin/payments/')) {
      // If on payments detail page, go to payments list
      router.push('/superadmin/payments');
    } else if (pathname.includes('/superadmin/users/')) {
      // If on user detail page, go to users list
      router.push('/superadmin/users');
    } else if (pathname.includes('/manager/leads/')) {
      // If on manager lead detail page, go to manager leads list
      router.push('/manager/leads');
    } else if (pathname.startsWith('/manager/')) {
      // If on any manager page, go to manager dashboard
      router.push('/manager/dashboard');
    } else {
      // Default: go back in history (includes Joining Desk list tabs)
      router.back();
    }
  };

  const hideShellBackButton = [
    '/superadmin/dashboard',
    '/superadmin/leads',
    '/superadmin/reports',
    '/superadmin/users',
    '/superadmin/visitors',
  ].includes(pathname) || isJoiningListPath(pathname);

  const renderNavItems = useCallback(
    (items: DashboardNavItem[], level = 0): ReactNode =>
      items.map((item) => {
        const hasChildren = !!(item.children && item.children.length > 0);
        const Icon = item.icon;
        const isActive = hasChildren
          ? item.children!.some((child) => pathMatchesNav(child.href, pathname))
          : pathMatchesNav(item.href, pathname);
        const isGroupOpen = openGroups.has(item.href);
        const paddingLeft = isCollapsed ? undefined : level * 16;
        const rowClassName = cn(
          'flex w-full min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-left transition-all duration-200 outline-none select-none cursor-pointer',
          isCollapsed && 'justify-center',
          isActive
            ? cn(
                'bg-[#ffedd5] text-[#c2410c] font-semibold dark:bg-[#7c2d12]/30 dark:text-[#fb923c]',
                !isCollapsed && 'border-l-2 border-[#f97316] dark:border-[#fb923c]'
              )
            : 'text-[#000000] hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
        );
        const labelWrapClass = cn(
          'flex min-w-0 flex-1 items-center gap-3',
          isCollapsed ? 'hidden' : 'flex'
        );

        return (
          <div key={item.href} className="space-y-0.5">
            <div
              className={cn(
                'group relative flex w-full items-center',
                isCollapsed ? 'justify-center px-2' : 'px-0'
              )}
              style={paddingLeft ? { paddingLeft } : undefined}
            >
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => {
                    if (isCollapsed) {
                      setIsCollapsed(false);
                      setOpenGroups((prev) => new Set(prev).add(item.href));
                      return;
                    }
                    toggleGroup(item.href);
                  }}
                  className={rowClassName}
                  title={isCollapsed ? item.label : undefined}
                  aria-expanded={isGroupOpen}
                >
                  {Icon && (
                    <Icon
                      className={cn(
                        'h-5 w-5 shrink-0 transition-colors duration-200',
                        isActive
                          ? 'text-[#ea580c] dark:text-[#fb923c]'
                          : 'text-slate-500 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'
                      )}
                    />
                  )}

                  <div className={labelWrapClass}>
                    <span className="truncate">{item.label}</span>
                    {item.badge && (
                      <span
                        className={cn(
                          'ml-auto inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full',
                          isActive
                            ? 'bg-[#ffedd5] text-[#c2410c] dark:bg-[#7c2d12]/40 dark:text-[#fdba74]'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>

                  {!isCollapsed && (
                    <ChevronDownIcon
                      className={cn(
                        'ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200',
                        isActive
                          ? 'text-[#ea580c] dark:text-[#fb923c]'
                          : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300',
                        isGroupOpen ? 'rotate-180' : 'rotate-0'
                      )}
                    />
                  )}
                </button>
              ) : (
                <Link
                  href={item.href}
                  className={rowClassName}
                  title={isCollapsed ? item.label : undefined}
                >
                  {Icon && (
                    <Icon
                      className={cn(
                        'h-5 w-5 shrink-0 transition-colors duration-200',
                        isActive
                          ? 'text-[#ea580c] dark:text-[#fb923c]'
                          : 'text-slate-500 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'
                      )}
                    />
                  )}

                  <div className={labelWrapClass}>
                    <span className="truncate">{item.label}</span>
                    {item.badge && (
                      <span
                        className={cn(
                          'ml-auto inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full',
                          isActive
                            ? 'bg-[#ffedd5] text-[#c2410c] dark:bg-[#7c2d12]/40 dark:text-[#fdba74]'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        )}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                </Link>
              )}
            </div>
            {hasChildren && isGroupOpen && (
              <div className={cn('space-y-0.5 relative', isCollapsed ? 'hidden' : 'pl-4')}>
                {/* Connection line for nested items */}
                <div className="absolute left-[26px] top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-800" />
                {renderNavItems(item.children!, level + 1)}
              </div>
            )}
          </div>
        );
      }),
    [isCollapsed, openGroups, pathname, toggleGroup]
  );

  const renderSidebar = (variant: 'desktop' | 'mobile' = 'desktop') => {
    const workspaceLine =
      role && roleName !== role ? `${role} Space` : !roleName && role ? `${role} Space` : null;
    const collapsedProfileTitle = [userName, roleName].filter(Boolean).join(' · ') || userName || 'User';

    return (
    <aside
      className={cn(
        'relative flex flex-col overflow-hidden transition-[width] duration-300',
        'bg-white border-r border-slate-200 dark:border-slate-800 dark:bg-slate-900',
        'shadow-[4px_0_24px_-8px_#ea580c1f] dark:shadow-[4px_0_24px_-8px_rgba(0,0,0,0.25)]',
        isCollapsed ? 'w-[72px]' : 'w-64',
        variant === 'desktop'
          ? 'h-screen flex-shrink-0 z-10'
          : 'h-full rounded-2xl border border-slate-200 dark:border-slate-700'
      )}
    >
      {/* Theme color at top */}
      <div className="flex flex-shrink-0 flex-col border-b border-[#fdba74] dark:border-slate-800 bg-[#fed7aa] dark:bg-slate-900">
        <div className="flex items-center justify-between px-4 py-5">
          {!isCollapsed && (
            <>
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-[#fed7aa] text-[#ea580c] dark:bg-[#431407] dark:text-[#f97316] shadow-sm overflow-hidden">
                  <Image
                    src="/Lead Tracker.png"
                    alt="Logo"
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="space-y-0.5 min-w-0">
                  {/* <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600 dark:text-orange-500">Admission</p> */}
                  <p className="text-lg font-bold text-slate-900 dark:text-white truncate">
                    Lead Tracker
                  </p>
                </div>
              </div>
              {/* Notification Bell in Sidebar Header */}
              <div className="flex-shrink-0">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl text-[#ea580c] dark:bg-[#431407] dark:text-[#f97316]">
                  <NotificationBell />
                </div>
              </div>
            </>
          )}
          {isCollapsed && variant === 'desktop' && (
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl text-[#ea580c] dark:bg-[#431407] dark:text-[#f97316]">
                <AcademicIcon className="w-6 h-6" />
              </div>
              {/* Notification Bell in Collapsed Sidebar */}
              <div className="flex h-10 w-10 items-center justify-center rounded-xl text-[#ea580c] dark:bg-[#431407] dark:text-[#f97316]">
                <NotificationBell />
              </div>
            </div>
          )}
        </div>
      </div>

      <nav
        className={cn(
          'flex-1 min-h-0 space-y-0.5 px-3 py-3',
          variant === 'desktop' ? 'overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700' : 'overflow-y-auto pb-4'
        )}
      >
        {renderNavItems(filteredNavItems)}
      </nav>

      {/* Profile and Logout at bottom of sidebar */}
      <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 px-3 py-3">
        {!isCollapsed ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#ea580c] text-white text-sm font-bold shadow-sm">
                {(userName || 'SA').slice(0, 1).toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0 gap-0.5">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100" title={userName || 'Super Admin'}>
                  {userName || 'Super Admin'}
                </p>
                {roleName ? (
                  <p
                    className="truncate text-xs font-medium text-slate-600 dark:text-slate-300"
                    title={roleName}
                  >
                    {roleName}
                  </p>
                ) : null}
                {workspaceLine ? (
                  <p
                    className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400"
                    title={workspaceLine}
                  >
                    {workspaceLine}
                  </p>
                ) : !roleName && !role ? (
                  <p className="truncate text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                    Workspace
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="group flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-[#fef2f2] dark:hover:bg-[#450a0a]/30"
              aria-label="Logout"
              title="Logout"
            >
              <LogoutIcon className="h-5 w-5 text-slate-500 transition-colors group-hover:text-[#dc2626] dark:text-slate-400 dark:group-hover:text-[#f87171]" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ea580c] text-white text-sm font-bold shadow-sm"
              title={collapsedProfileTitle}
            >
              {(userName || 'SA').slice(0, 1).toUpperCase()}
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="group flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-[#fef2f2] dark:hover:bg-[#450a0a]/30"
              aria-label="Logout"
              title="Logout"
            >
              <LogoutIcon className="h-5 w-5 text-slate-500 transition-colors group-hover:text-[#dc2626] dark:text-slate-400 dark:group-hover:text-[#f87171]" />
            </button>
          </div>
        )}
      </div>

      <button
        type="button"
        className="absolute top-[4.25rem] -right-3 hidden h-8 w-8 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-slate-500 shadow-md transition-all hover:scale-105 hover:border-[#fdba74] hover:bg-[#fff7ed] hover:text-[#ea580c] focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-[#ea580c] dark:hover:bg-[#431407]/50 dark:hover:text-[#fb923c] lg:flex z-10 cursor-pointer"
        onClick={() => setIsCollapsed((prev) => !prev)}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <CollapseIcon className={cn('h-4 w-4 transition-transform', isCollapsed ? 'rotate-180' : 'rotate-0')} />
      </button>
    </aside>
    );
  };

  const permissionContextValue = useMemo<PermissionContextValue>(
    () => ({
      permissions: normalizedPermissions,
      hasAccess: hasAccessForKey,
      canWrite: canWriteForKey,
      getModulePermission,
      canJoiningEditReference,
      canJoiningEditAdmission,
      canSubmitFeeRequest,
      canApproveFeeRequest,
      canAccessAdmissionTab,
      getAllowedAdmissionTabs,
    }),
    [
      normalizedPermissions,
      hasAccessForKey,
      canWriteForKey,
      canJoiningEditReference,
      canJoiningEditAdmission,
      canSubmitFeeRequest,
      canApproveFeeRequest,
      canAccessAdmissionTab,
      getAllowedAdmissionTabs,
    ]
  );

  return (
    <DashboardHeaderContext.Provider value={headerContextValue}>
      <PermissionContext.Provider value={permissionContextValue}>
        <div className="relative min-h-screen bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 selection:bg-[#ffedd5] selection:text-[#9a3412]">

          <div className="relative flex h-screen w-full overflow-hidden">
            <div className="hidden lg:block flex-shrink-0">{renderSidebar('desktop')}</div>

            {/* Mobile: sidebar overlay (superadmin etc) */}
            {!useMobileBottomNav && (
              <div
                className={cn(
                  'fixed inset-0 z-40 flex lg:hidden',
                  isMobileOpen ? 'pointer-events-auto' : 'pointer-events-none'
                )}
              >
                <div
                  className={cn('fixed inset-0 cursor-pointer bg-slate-900/50 transition-opacity duration-300', isMobileOpen ? 'opacity-100' : 'opacity-0')}
                  onClick={() => setIsMobileOpen(false)}
                  aria-hidden
                />
                <div
                  className={cn(
                    'relative z-50 w-72 max-w-[85vw] px-4 py-4 transition-transform duration-300',
                    isMobileOpen ? 'translate-x-0' : '-translate-x-full'
                  )}
                >
                  {renderSidebar('mobile')}
                </div>
              </div>
            )}

            {/* Mobile: bottom sheet menu (user / manager) */}
            {useMobileBottomNav && (
              <MobileMenuSheet
                isOpen={isMobileOpen}
                onClose={() => setIsMobileOpen(false)}
                navItems={filteredNavItems}
                userName={userName}
                role={role}
                roleName={roleName}
                onLogout={handleLogout}
              />
            )}

            <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
              {hideMainTopHeader ? (
                <div
                  className={cn(
                    'flex-shrink-0 z-10 flex lg:hidden items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900',
                    useMobileBottomNav && 'hidden'
                  )}
                >
                  <button
                    type="button"
                    className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl border border-slate-200/60 bg-white p-2.5 text-slate-500 shadow-sm transition hover:border-[#fed7aa] hover:text-[#ea580c] hover:shadow-md focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
                    onClick={() => setIsMobileOpen(true)}
                    aria-label="Toggle navigation menu"
                  >
                    <MenuIcon className="h-5 w-5" />
                  </button>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{minimalMobileHeaderTitle}</span>
                </div>
              ) : (
                <header
                  className={cn(
                    'flex-shrink-0 z-10',
                    isEdgeToEdgeWorkspace ? 'px-2 pt-2 pb-0 sm:px-3 lg:px-3' : 'px-4 sm:px-6 lg:px-8',
                    !isEdgeToEdgeWorkspace && (isCompactPage ? 'pt-2 pb-0' : (isReducedSpacingPage ? 'pt-6 pb-0' : 'pt-6 pb-4')),
                    useMobileBottomNav && 'hidden'
                  )}
                >
                  <div
                    className={cn(
                      'flex flex-wrap items-center justify-between gap-4 transition-all duration-300',
                      isEdgeToEdgeWorkspace ? 'px-1 py-2 sm:px-2 lg:px-2' : 'px-4 py-3 sm:px-5 lg:px-6'
                    )}
                  >
                    {/* Left Section: Mobile Menu, Back Icon, Header Content */}
                    <div className="flex items-center gap-3 sm:gap-5 flex-1 min-w-0">
                      <button
                        type="button"
                        className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl border border-slate-200/60 bg-white p-2.5 text-slate-500 shadow-sm transition hover:border-[#fed7aa] hover:text-[#ea580c] hover:shadow-md focus:outline-none lg:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
                        onClick={() => setIsMobileOpen(true)}
                        aria-label="Toggle navigation menu"
                      >
                        <MenuIcon className="h-5 w-5" />
                      </button>

                      {/* Back Icon - Hide on Dashboard, Leads, and Joining Desk list tabs */}
                      {!hideShellBackButton && (
                        <button
                          type="button"
                          onClick={handleBack}
                          className="group relative inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl border border-slate-200/60 bg-white p-2.5 text-slate-500 shadow-sm transition-all hover:scale-105 hover:border-[#fed7aa] hover:text-[#ea580c] hover:shadow-md focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200 flex-shrink-0"
                          aria-label="Go back"
                          title="Back"
                        >
                          <BackIcon className="h-5 w-5" />
                        </button>
                      )}

                      {/* Header Content (Lead Details, etc.) */}
                      <div className="flex flex-col gap-1 text-left min-w-0 flex-1 ml-1">
                        {headerContent ? (
                          headerContent
                        ) : (
                          <>
                            <h1 className="text-xl font-bold text-[#1e293b] dark:text-white truncate">
                              {title}
                            </h1>
                            {description && (
                              <p className="text-sm font-medium text-slate-500/90 dark:text-slate-400 truncate">{description}</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </header>
              )}

              <main
                className={cn(
                  'relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden',
                  isEdgeToEdgeWorkspace
                    ? 'px-1 py-2 sm:px-2 sm:pt-2 lg:px-2 lg:pt-3'
                    : isCompactPage
                      ? 'p-3 sm:px-6 sm:pt-2 lg:px-8 lg:pt-4'
                      : (isReducedSpacingPage ? 'p-3 sm:p-6 lg:px-8 lg:pb-8 lg:pt-2' : 'p-3 sm:p-6 lg:p-8'),
                  useMobileBottomNav && 'pb-20 pt-[calc(2.75rem+env(safe-area-inset-top))] lg:pt-6 lg:pb-8'
                )}
              >
                {/* Desktop heading for user / manager (custom headerContent or title) */}
                {useMobileBottomNav && (
                  <div className="mb-8 hidden px-1 lg:flex lg:flex-wrap lg:items-baseline lg:gap-x-3 lg:gap-y-1">
                    {headerContent ? (
                      headerContent
                    ) : (
                      <>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                          {mobileTopBar?.title || title}
                        </h1>
                        {mobileTopBar?.titleMeta ? (
                          <span className="text-sm font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                            {mobileTopBar.titleMeta}
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                )}
                <div className={cn(
                  "mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-full flex flex-col",
                  isFullWidthPage ? "w-full" : "max-w-[1600px]"
                )}>
                  {children}
                </div>
              </main>

              {/* Mobile top bar (user / manager): three-column layout for centered title + safe area */}
              {useMobileBottomNav && (
                <div
                  className={cn(
                    'lg:hidden fixed top-0 left-0 right-0 z-10',
                    'pt-[env(safe-area-inset-top)]',
                    'bg-gradient-to-r from-[#f97316] via-[#ea580c] to-[#d97706] shadow-md',
                    'dark:from-[#ea580c] dark:via-[#c2410c] dark:to-[#b45309]'
                  )}
                >
                  <div className="flex h-11 min-h-11 items-center px-3">
                    {/* Left: back or spacer (fixed width for symmetry) */}
                    <div className="flex w-10 flex-shrink-0 items-center justify-start">
                      {(mobileTopBar?.showBack ?? false) ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (mobileTopBar?.backHref) {
                              router.push(mobileTopBar.backHref);
                            } else {
                              handleBack();
                            }
                          }}
                          className="flex cursor-pointer items-center justify-center w-9 h-9 rounded-lg text-white hover:bg-[#ea580c]/80 dark:hover:bg-[#c2410c]/80"
                          aria-label="Back"
                        >
                          <BackIcon className="h-5 w-5" />
                        </button>
                      ) : null}
                    </div>
                    {/* Center: title (visually centered) */}
                    <h1 className="flex flex-1 items-center justify-center gap-2 min-w-0 text-center">
                      {mobileTopBar?.iconKey && (() => {
                        const Icon = MOBILE_TOP_BAR_ICONS[mobileTopBar.iconKey];
                        return Icon ? <Icon className="h-5 w-5 shrink-0 text-white" aria-hidden /> : null;
                      })()}
                      <span className="truncate text-sm font-semibold text-white">
                        {mobileTopBar?.title ?? title}
                      </span>
                    </h1>
                    {/* Right: action or spacer (same width as left) */}
                    <div className="flex w-10 flex-shrink-0 items-center justify-end">
                      {mobileTopBar?.rightAction ? (() => {
                        const ActionIcon = MOBILE_TOP_BAR_ICONS[mobileTopBar.rightAction.iconKey];
                        return (
                          <button
                            type="button"
                            onClick={mobileTopBar.rightAction.onClick}
                            className="flex cursor-pointer items-center justify-center w-9 h-9 rounded-lg text-white hover:bg-[#ea580c]/80 dark:hover:bg-[#c2410c]/80"
                            aria-label="Action"
                          >
                            {ActionIcon && <ActionIcon className="h-5 w-5" />}
                          </button>
                        );
                      })() : null}
                    </div>
                  </div>
                </div>
              )}

              {/* Mobile bottom nav (user / manager only) */}
              {useMobileBottomNav && (
                <div className="lg:hidden">
                  <MobileBottomNav
                    items={flattenNavItemsForMobile(filteredNavItems, { filterBottomNav: true })}
                    onMenuPress={() => setIsMobileOpen(true)}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </PermissionContext.Provider>
    </DashboardHeaderContext.Provider>
  );
};
