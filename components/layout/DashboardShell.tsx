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
                  'flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 outline-none select-none',
                  isCollapsed && 'justify-center',
                  isActive
                    ? 'bg-blue-50 text-blue-700 font-semibold dark:bg-blue-900/20 dark:text-blue-400'
                    : 'text-slate-600 hover:bg-slate-100/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/40 dark:hover:text-slate-200'
                )}
                title={isCollapsed ? item.label : undefined}
              >
                {Icon && (
                  <Icon
                    className={cn(
                      'h-5 w-5 flex-shrink-0 transition-colors duration-200',
                      isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'
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
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
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
                    "absolute right-1 p-1.5 rounded-md transition-colors",
                    isActive
                      ? "text-blue-600 hover:bg-blue-100/50 dark:text-blue-400"
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
        'relative flex flex-col overflow-hidden border border-slate-100 bg-white/50 backdrop-blur-xl shadow-2xl shadow-blue-900/5 transition-[width] duration-300',
        'dark:border-slate-800 dark:bg-slate-950/50 dark:shadow-none',
        isCollapsed ? 'w-24' : 'w-72',
        variant === 'desktop'
          ? 'sticky top-6 my-6 h-[calc(100vh-3rem)] rounded-4xl ml-6 z-30'
          : 'h-full rounded-3xl'
      )}
    >
      <div className="flex items-center gap-4 px-6 py-6 border-b border-transparent">
        {!isCollapsed && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500/80">Admission</p>
            <p className="text-xl font-bold bg-clip-text text-transparent bg-linear-to-r from-slate-900 via-slate-700 to-slate-900 dark:from-white dark:via-slate-200 dark:to-slate-400">
              Command Center
            </p>
          </div>
        )}
      </div>

      <nav
        className={cn(
          'flex-1 space-y-2 px-4',
          variant === 'desktop' ? 'overflow-y-auto pb-8 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800' : 'pb-6'
        )}
      >
        {renderNavItems(filteredNavItems)}
      </nav>

      <button
        type="button"
        className="absolute top-8 -right-4 hidden h-10 w-10 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-400 shadow-[0_8px_16px_-4px_rgba(0,0,0,0.1)] transition-all hover:scale-110 hover:border-blue-100 hover:text-blue-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500 lg:flex z-10"
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
        <div className="relative min-h-screen bg-slate-50/50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 selection:bg-blue-100 selection:text-blue-700">
          {/* Refined Background Pattern */}
          <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,#e2e8f080_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f080_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] dark:bg-[linear-gradient(to_right,rgba(148,163,184,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.05)_1px,transparent_1px)]" />

          {/* Ambient Glows */}
          <div className="pointer-events-none fixed top-0 left-0 right-0 h-[500px] bg-linear-to-br from-blue-100/40 via-purple-100/20 to-transparent blur-3xl dark:from-blue-900/20 dark:via-purple-900/10" />

          <div className="relative flex min-h-screen">
            <div className="hidden lg:flex">{renderSidebar('desktop')}</div>

            <div
              className={cn(
                'fixed inset-0 z-40 flex lg:hidden',
                isMobileOpen ? 'pointer-events-auto' : 'pointer-events-none'
              )}
            >
              <div
                className={cn('fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300', isMobileOpen ? 'opacity-100' : 'opacity-0')}
                onClick={() => setIsMobileOpen(false)}
              />
              <div
                className={cn(
                  'relative z-50 w-72 max-w-full px-4 py-4 transition-transform duration-300',
                  isMobileOpen ? 'translate-x-0' : '-translate-x-full'
                )}
              >
                {renderSidebar('mobile')}
              </div>
            </div>

            <div className="flex flex-1 flex-col min-w-0">
              <header className="px-4 pt-6 sm:px-6 lg:px-8 pb-4 sticky top-0 z-20">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/60 bg-white/80 px-4 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-xl ring-1 ring-black/5 dark:border-slate-800/60 dark:bg-slate-900/80 dark:shadow-none dark:ring-white/10 sm:px-5 lg:px-6 transition-all duration-300">
                  {/* Left Section: Mobile Menu, Back Icon, Header Content */}
                  <div className="flex items-center gap-3 sm:gap-5 flex-1 min-w-0">
                    <button
                      type="button"
                      className="inline-flex rounded-xl border border-slate-200/60 bg-white p-2.5 text-slate-500 shadow-sm transition hover:border-blue-200 hover:text-blue-600 hover:shadow-md focus:outline-none lg:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
                      onClick={() => setIsMobileOpen(true)}
                      aria-label="Toggle navigation menu"
                    >
                      <MenuIcon className="h-5 w-5" />
                    </button>

                    {/* Back Icon */}
                    <button
                      type="button"
                      onClick={handleBack}
                      className="group relative inline-flex items-center justify-center rounded-xl border border-slate-200/60 bg-white p-2.5 text-slate-500 shadow-sm transition-all hover:scale-105 hover:border-blue-200 hover:text-blue-600 hover:shadow-md focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200 flex-shrink-0"
                      aria-label="Go back"
                      title="Back"
                    >
                      <BackIcon className="h-5 w-5" />
                    </button>

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

                  {/* Right Section: Workspace Logo, Workspace Title, Notification Bell, Logout Icon */}
                  <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
                    {/* Workspace Logo */}
                    <Link href="/" className="flex items-center gap-3 group">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-lg shadow-blue-500/20 transition-transform group-hover:scale-105 ring-2 ring-white dark:ring-slate-800">
                        {(userName || 'SA').slice(0, 2)}
                      </span>
                    </Link>

                    {/* Workspace Title */}
                    <div className="hidden sm:block">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-500/90 dark:text-blue-400">
                        {role ? `${role} Space` : 'Workspace'}
                      </p>
                    </div>

                    <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block" />

                    {/* Notification Bell */}
                    <div className="flex-shrink-0">
                      <NotificationBell />
                    </div>

                    {/* Logout Icon */}
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="group relative inline-flex items-center justify-center rounded-xl border border-slate-200/60 bg-white p-2.5 text-slate-500 shadow-sm transition-all hover:border-red-100 hover:bg-red-50 hover:text-red-600 hover:shadow-md focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-red-900/20 dark:hover:border-red-900/30 dark:hover:text-red-400"
                      aria-label="Logout"
                      title="Logout"
                    >
                      <LogoutIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </header>

              <main className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
                <div className="mx-auto max-w-[1600px] animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {children}
                </div>
              </main>
            </div>
          </div>
        </div>
      </PermissionContext.Provider>
    </DashboardHeaderContext.Provider>
  );
};
