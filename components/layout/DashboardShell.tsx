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

type DashboardHeaderContextValue = {
  setHeaderContent: (content: ReactNode) => void;
  clearHeaderContent: () => void;
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
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
  children,
  navItems,
  title = 'Workspace',
  description = 'Manage records and track outcomes with confidence.',
  role,
  userName,
  permissions = {},
}) => {
  const pathname = usePathname() || '';
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [headerContent, setHeaderContent] = useState<ReactNode>(null);

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

  const headerContextValue = useMemo(
    () => ({
      setHeaderContent: setHeader,
      clearHeaderContent: clearHeader,
    }),
    [setHeader, clearHeader]
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
      auth.logout();
      router.push('/auth/login');
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
        const paddingLeft = isCollapsed ? undefined : 12 + level * 14;

        return (
          <div key={item.href} className="space-y-1">
            <div
              className={cn(
                'group flex items-center rounded-2xl py-2 pr-2 text-sm font-medium transition-all',
                isCollapsed ? 'justify-center px-2' : 'px-0',
                isActive
                  ? 'bg-gradient-to-r from-blue-500/10 via-blue-500/15 to-transparent text-blue-600 dark:text-blue-300'
                  : 'text-slate-500 hover:bg-blue-50/70 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
              )}
              style={paddingLeft ? { paddingLeft } : undefined}
            >
              <Link
                href={item.href}
                className={cn('flex flex-1 items-center gap-3 rounded-xl px-3 py-2 transition', isCollapsed && 'justify-center')}
                title={isCollapsed ? item.label : undefined}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-xl border border-transparent bg-white shadow-sm transition-all',
                    isActive
                      ? 'border-blue-100 bg-white text-blue-600 shadow-blue-100/80 dark:border-blue-500/40 dark:bg-slate-900 dark:text-blue-300'
                      : 'border-slate-200 bg-white/70 text-slate-400 shadow-slate-100/70 dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-400'
                  )}
                >
                  {Icon ? <Icon className="h-4 w-4" /> : null}
                </span>
                <div
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-3',
                    isCollapsed ? 'justify-center' : 'pl-1'
                  )}
                >
                  {isCollapsed ? (
                    hasChildren ? (
                      <ChevronDownIcon
                        className={cn(
                          'h-3 w-3 text-slate-400 transition-transform',
                          isGroupOpen ? 'rotate-180' : 'rotate-0'
                        )}
                      />
                    ) : null
                  ) : null}
                  {!isCollapsed && (
                  <>
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="ml-auto inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:bg-blue-900/60 dark:text-blue-200">
                        {item.badge}
                      </span>
                    )}
                  </>
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
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-transparent text-slate-400 transition hover:border-blue-200 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:text-slate-300 dark:hover:text-slate-100"
                >
                  <ChevronDownIcon className={cn('h-4 w-4 transition-transform', isGroupOpen ? 'rotate-180' : 'rotate-0')} />
                </button>
              )}
            </div>
            {hasChildren && isGroupOpen && (
              <div className={cn('space-y-1', isCollapsed ? 'pl-0' : 'pl-4')}>
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
        'relative flex flex-col overflow-hidden border border-slate-200 bg-white shadow-lg shadow-blue-100/40 transition-[width] duration-300',
        'dark:border-slate-800 dark:bg-slate-950 dark:shadow-none',
        isCollapsed ? 'w-20' : 'w-64',
        variant === 'desktop'
          ? 'my-4 h-[calc(100vh-2rem)] rounded-tr-[28px] rounded-br-[28px] lg:sticky lg:top-4'
          : 'h-full rounded-3xl'
      )}
    >
      <div className="flex items-center gap-3 px-4 py-4">
        {!isCollapsed && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">Admission</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Command Center</p>
          </div>
        )}
      </div>

      <nav
        className={cn(
          'flex-1 space-y-1 px-2.5',
          variant === 'desktop' ? 'overflow-y-auto pb-6 pr-3' : 'pb-6'
        )}
      >
        {renderNavItems(filteredNavItems)}
      </nav>

      <button
        type="button"
              className="absolute top-1/2 -right-4 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-lg transition hover:border-blue-200 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500 lg:flex z-10"
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
        <div className="relative min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
          <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f01f_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f01f_1px,transparent_1px)] bg-[size:28px_28px] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.12)_1px,transparent_1px)]" />
          <div className="pointer-events-none fixed inset-0 bg-gradient-to-br from-blue-50/40 via-indigo-50/35 to-transparent dark:from-slate-900/60 dark:via-slate-900/65 dark:to-slate-900/80" />

          <div className="relative flex min-h-screen">
            <div className="hidden lg:flex">{renderSidebar('desktop')}</div>

            <div
              className={cn(
                'fixed inset-0 z-40 flex lg:hidden',
                isMobileOpen ? 'pointer-events-auto' : 'pointer-events-none'
              )}
            >
              <div
                className={cn('fixed inset-0 bg-slate-900/60 transition-opacity', isMobileOpen ? 'opacity-100' : 'opacity-0')}
                onClick={() => setIsMobileOpen(false)}
              />
              <div
                className={cn(
                  'relative z-50 w-72 max-w-full px-3 py-4 transition-transform duration-300',
                  isMobileOpen ? 'translate-x-0' : '-translate-x-full'
                )}
              >
                {renderSidebar('mobile')}
              </div>
            </div>

            <div className="flex flex-1 flex-col">
              <header className="px-4 pt-4 sm:px-6 lg:px-10">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_8px_26px_rgba(30,64,175,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 dark:shadow-none sm:px-5 lg:px-6">
                  {/* Left Section: Mobile Menu, Back Icon, Header Content */}
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <button
                      type="button"
                      className="inline-flex rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:border-blue-200 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500"
                      onClick={() => setIsMobileOpen(true)}
                      aria-label="Toggle navigation menu"
                    >
                      <MenuIcon className="h-5 w-5" />
                    </button>
                    
                    {/* Back Icon */}
                    <button
                      type="button"
                      onClick={handleBack}
                      className="group relative inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:border-blue-200 hover:text-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500 flex-shrink-0"
                      aria-label="Go back"
                      title="Back"
                    >
                      <BackIcon className="h-5 w-5" />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-hover:block dark:bg-slate-700">
                        Back
                      </span>
                    </button>

                    {/* Header Content (Lead Details, etc.) */}
                    <div className="flex flex-col gap-2 text-left min-w-0 flex-1">
                      {headerContent ? (
                        headerContent
                      ) : (
                        <>
                          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
                          {description && (
                            <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Section: Workspace Logo, Workspace Title, Notification Bell, Logout Icon */}
                  <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                    {/* Workspace Logo */}
                    <Link href="/" className="flex items-center gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-500 to-indigo-500 text-xs font-semibold uppercase text-white shadow-sm">
                        {(userName || 'SA').slice(0, 2)}
                      </span>
                    </Link>

                    {/* Workspace Title */}
                    <div className="hidden sm:block">
                      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-blue-500 dark:text-blue-300">
                        {role ? `${role} Space` : 'Workspace'}
                      </p>
                    </div>
                    
                    {/* Notification Bell */}
                    <div className="flex-shrink-0">
                      <NotificationBell />
                    </div>

                    {/* Logout Icon */}
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="group relative inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:border-red-200 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-red-500"
                      aria-label="Logout"
                      title="Logout"
                    >
                      <LogoutIcon className="h-5 w-5" />
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-hover:block dark:bg-slate-700">
                        Logout
                      </span>
                    </button>
                  </div>
                </div>
              </header>

              <main className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden">
                <div className="w-full px-1 py-8 sm:px-2 lg:px-3">{children}</div>
              </main>
            </div>
          </div>
        </div>
      </PermissionContext.Provider>
    </DashboardHeaderContext.Provider>
  );
};


