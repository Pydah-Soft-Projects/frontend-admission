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
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '../ui/Button';
import { auth } from '@/lib/auth';
import type { ModulePermission } from '@/types';
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

const MOBILE_TOP_BAR_ICONS: Record<string, IconComponent> = {
  dashboard: DashboardGridIcon,
  leads: UsersIcon,
  'lead-details': UserCircleIcon,
  team: UsersIcon,
  'team-member': UserCircleIcon,
  analytics: ChartBarIcon,
  'team-leads': ListIcon,
};

export type MobileTopBarOptions = {
  title: string;
  showBack?: boolean;
  backHref?: string;
  /** Icon key for mobile top bar: dashboard | leads | lead-details | team | team-member | analytics | team-leads */
  iconKey?: keyof typeof MOBILE_TOP_BAR_ICONS;
};

type DashboardHeaderContextValue = {
  setHeaderContent: (content: ReactNode) => void;
  clearHeaderContent: () => void;
  setMobileTopBar: (options: MobileTopBarOptions | null) => void;
  clearMobileTopBar: () => void;
};

const DashboardHeaderContext = createContext<DashboardHeaderContextValue | null>(null);

export const useDashboardHeader = () => {
  const ctx = useContext(DashboardHeaderContext);
  if (!ctx) {
    throw new Error('useDashboardHeader must be used within DashboardShell');
  }
  return ctx;
};

type PermissionContextValue = {
  permissions: Record<string, ModulePermission>;
  hasAccess: (moduleKey: string) => boolean;
  canWrite: (moduleKey: string) => boolean;
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

export type DashboardNavItem = {
  href: string;
  label: string;
  icon?: IconComponent;
  badge?: string;
  children?: DashboardNavItem[];
  permissionKey?: string;
};

interface DashboardShellProps {
  children: React.ReactNode;
  navItems: DashboardNavItem[];
  title?: string;
  description?: string;
  role?: string;
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

  // Pages where we want minimal top spacing (compact header)
  const isCompactPage = ['/superadmin/dashboard', '/superadmin/leads', '/superadmin/reports', '/superadmin/leads/assign', '/user/dashboard', '/user/leads'].includes(pathname);

  // Pages where we want full width (no max-width constraint)
  const isFullWidthPage = ['/superadmin/leads/assign'].includes(pathname);

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

  const filterNavItems = useCallback(
    (items: DashboardNavItem[]): DashboardNavItem[] =>
      items
        .map((item) => {
          const children = item.children ? filterNavItems(item.children) : [];
          const accessible = hasAccessForKey(item.permissionKey);

          if (!accessible && children.length === 0) {
            return null;
          }

          return {
            ...item,
            children,
          };
        })
        .filter(Boolean) as DashboardNavItem[],
    [hasAccessForKey]
  );

  const filteredNavItems = useMemo(() => filterNavItems(navItems), [filterNavItems, navItems]);

  const findActiveParents = useCallback((items: DashboardNavItem[], currentPath: string, acc: Set<string>) => {
    items.forEach((item) => {
      if (item.children && item.children.length > 0) {
        if (currentPath.startsWith(item.href)) {
          acc.add(item.href);
          findActiveParents(item.children, currentPath, acc);
        } else {
          findActiveParents(item.children, currentPath, acc);
        }
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
    } else if (pathname.includes('/superadmin/joining/')) {
      // If on joining detail page, go to joining list
      router.push('/superadmin/joining');
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
      // Default: go back in history
      router.back();
    }
  };

  const renderNavItems = useCallback(
    (items: DashboardNavItem[], level = 0): ReactNode =>
      items.map((item) => {
        const hasChildren = !!(item.children && item.children.length > 0);
        const Icon = item.icon;
        const isActive = pathname.startsWith(item.href);
        const isGroupOpen = openGroups.has(item.href);
        const paddingLeft = isCollapsed ? undefined : level * 16;

        return (
          <div key={item.href} className="space-y-1">
            <div
              className={cn(
                'group relative flex items-center',
                isCollapsed ? 'justify-center px-2' : 'px-0'
              )}
              style={paddingLeft ? { paddingLeft } : undefined}
            >
              <Link
                href={item.href}
                className={cn(
                  'flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 outline-none select-none cursor-pointer',
                  isCollapsed && 'justify-center',
                  isActive
                    ? cn('bg-orange-100 text-orange-700 font-semibold dark:bg-orange-900/30 dark:text-orange-400', !isCollapsed && 'border-l-2 border-orange-500 dark:border-orange-400')
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200'
                )}
                title={isCollapsed ? item.label : undefined}
              >
                {Icon && (
                  <Icon
                    className={cn(
                      'h-5 w-5 flex-shrink-0 transition-colors duration-200',
                      isActive ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'
                    )}
                  />
                )}

                <div
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-3',
                    isCollapsed ? 'hidden' : 'block'
                  )}
                >
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span
                      className={cn(
                        'ml-auto inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full',
                        isActive
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </div>
              </Link>

              {hasChildren && !isCollapsed && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleGroup(item.href);
                  }}
                  className={cn(
                    "absolute right-1 p-1.5 rounded-md transition-colors cursor-pointer",
                    isActive
                      ? "text-orange-600 hover:bg-orange-100/50 dark:text-orange-400"
                      : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800"
                  )}
                >
                  <ChevronDownIcon className={cn('h-3.5 w-3.5 transition-transform duration-200', isGroupOpen ? 'rotate-180' : 'rotate-0')} />
                </button>
              )}
            </div>
            {hasChildren && isGroupOpen && (
              <div className={cn('space-y-1 relative', isCollapsed ? 'hidden' : 'pl-4')}>
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

  const renderSidebar = (variant: 'desktop' | 'mobile' = 'desktop') => (
    <aside
      className={cn(
        'relative flex flex-col overflow-hidden transition-[width] duration-300',
        'bg-white border-r border-slate-200 dark:border-slate-800 dark:bg-slate-900',
        'shadow-[4px_0_24px_-8px_rgba(249,115,22,0.12)] dark:shadow-[4px_0_24px_-8px_rgba(0,0,0,0.25)]',
        isCollapsed ? 'w-[72px]' : 'w-64',
        variant === 'desktop'
          ? 'h-screen flex-shrink-0 z-30'
          : 'h-full rounded-2xl border border-slate-200 dark:border-slate-700'
      )}
    >
      {/* Theme color at top */}
      <div className="flex flex-shrink-0 flex-col border-b border-orange-200/50 dark:border-slate-800 bg-orange-50/50 dark:bg-slate-900">
        <div className="flex items-center justify-between px-4 py-5">
          {!isCollapsed && (
            <>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-500 shadow-sm">
                  <DashboardGridIcon className="w-6 h-6" />
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
                <div className="flex items-center justify-center w-10 h-10 rounded-xl text-orange-600 dark:bg-orange-500/10 dark:text-orange-500">
                  <NotificationBell />
                </div>
              </div>
            </>
          )}
          {isCollapsed && variant === 'desktop' && (
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl text-orange-600 dark:bg-orange-500/10 dark:text-orange-500">
                <AcademicIcon className="w-6 h-6" />
              </div>
              {/* Notification Bell in Collapsed Sidebar */}
              <div className="flex h-10 w-10 items-center justify-center rounded-xl text-orange-600 dark:bg-orange-500/10 dark:text-orange-500">
                <NotificationBell />
              </div>
            </div>
          )}
        </div>
      </div>

      <nav
        className={cn(
          'flex-1 min-h-0 space-y-1 px-3 py-4',
          variant === 'desktop' ? 'overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700' : 'overflow-y-auto pb-4'
        )}
      >
        {renderNavItems(filteredNavItems)}
      </nav>

      {/* Logout at bottom of sidebar */}
      <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-700 px-3 py-3">
        {!isCollapsed && (
          <div className="mb-2 px-3 flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100/50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-xs font-bold ring-1 ring-orange-200 dark:ring-orange-800">
              {(userName || 'SA').slice(0, 2).toUpperCase()}
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-500/90 dark:text-orange-400">
              {role ? `${role} Space` : 'Workspace'}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className={cn(
            'flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
            'text-slate-600 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/30 dark:hover:text-red-400'
          )}
          aria-label="Logout"
          title="Logout"
        >
          <LogoutIcon className="h-5 w-5 shrink-0" />
          {!isCollapsed && <span className="truncate text-sm font-medium">Logout</span>}
        </button>
      </div>

      <button
        type="button"
        className="absolute top-[4.25rem] -right-3 hidden h-8 w-8 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-slate-500 shadow-md transition-all hover:scale-105 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-orange-600 dark:hover:bg-orange-950/50 dark:hover:text-orange-400 lg:flex z-10 cursor-pointer"
        onClick={() => setIsCollapsed((prev) => !prev)}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <CollapseIcon className={cn('h-4 w-4 transition-transform', isCollapsed ? 'rotate-180' : 'rotate-0')} />
      </button>
    </aside>
  );

  const permissionContextValue = useMemo<PermissionContextValue>(
    () => ({
      permissions: normalizedPermissions,
      hasAccess: hasAccessForKey,
      canWrite: canWriteForKey,
    }),
    [normalizedPermissions, hasAccessForKey, canWriteForKey]
  );

  return (
    <DashboardHeaderContext.Provider value={headerContextValue}>
      <PermissionContext.Provider value={permissionContextValue}>
        <div className="relative min-h-screen bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 selection:bg-orange-100 selection:text-orange-800">

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
                onLogout={handleLogout}
              />
            )}

            <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
              <header
                className={cn(
                  'flex-shrink-0 px-4 z-10 sm:px-6 lg:px-8',
                  isCompactPage ? 'pt-2 pb-0 lg:hidden' : 'pt-6 pb-4',
                  useMobileBottomNav ? (isCompactPage ? 'hidden' : 'hidden lg:block') : ''
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-5 lg:px-6 transition-all duration-300">
                  {/* Left Section: Mobile Menu, Back Icon, Header Content */}
                  <div className="flex items-center gap-3 sm:gap-5 flex-1 min-w-0">
                    <button
                      type="button"
                      className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl border border-slate-200/60 bg-white p-2.5 text-slate-500 shadow-sm transition hover:border-orange-200 hover:text-orange-600 hover:shadow-md focus:outline-none lg:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
                      onClick={() => setIsMobileOpen(true)}
                      aria-label="Toggle navigation menu"
                    >
                      <MenuIcon className="h-5 w-5" />
                    </button>

                    {/* Back Icon - Hide on Dashboard and Leads root pages and User Lead Details */}
                    {!['/superadmin/dashboard', '/superadmin/leads', '/superadmin/reports'].includes(pathname) && !pathname.startsWith('/user/leads/') && (
                      <button
                        type="button"
                        onClick={handleBack}
                        className="group relative inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl border border-slate-200/60 bg-white p-2.5 text-slate-500 shadow-sm transition-all hover:scale-105 hover:border-orange-200 hover:text-orange-600 hover:shadow-md focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200 flex-shrink-0"
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
                          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-linear-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 truncate">
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

              <main
                className={cn(
                  'relative z-10 flex-1 min-h-0 overflow-y-auto overflow-x-hidden',
                  isCompactPage
                    ? 'p-3 sm:px-6 sm:pt-2 lg:px-8 lg:pt-4'
                    : 'p-3 sm:p-6 lg:p-8',
                  useMobileBottomNav && 'pb-20 pt-[calc(2.75rem+env(safe-area-inset-top))] lg:pt-6 lg:pb-8'
                )}
              >
                <div className={cn(
                  "mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500",
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
                    'bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 shadow-md',
                    'dark:from-orange-600 dark:via-orange-700 dark:to-amber-700'
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
                          className="flex cursor-pointer items-center justify-center w-9 h-9 rounded-lg text-white hover:bg-orange-600/80 dark:hover:bg-orange-700/80"
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
                    {/* Right: spacer (same width as left) */}
                    <div className="w-10 flex-shrink-0" aria-hidden />
                  </div>
                </div>
              )}

              {/* Mobile bottom nav (user / manager only) */}
              {useMobileBottomNav && (
                <div className="lg:hidden">
                  <MobileBottomNav
                    items={flattenNavItemsForMobile(filteredNavItems)}
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
