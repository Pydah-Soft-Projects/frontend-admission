'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { NotificationBell } from '../NotificationBell';
import type { DashboardNavItem } from './DashboardShell';
import { flattenNavItemsForMobile } from './MobileBottomNav';

interface MobileMenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
  navItems: DashboardNavItem[];
  userName?: string;
  role?: string;
  onLogout: () => void;
}

export function MobileMenuSheet({
  isOpen,
  onClose,
  navItems,
  userName,
  role,
  onLogout,
}: MobileMenuSheetProps) {
  const pathname = usePathname() || '';
  const flatItems = flattenNavItemsForMobile(navItems);

  const isActive = (href: string) =>
    pathname === href || (href !== '/' && pathname.startsWith(href));

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 cursor-pointer bg-slate-900/50 transition-opacity lg:hidden"
        aria-hidden
        onClick={onClose}
      />
      {/* Sheet */}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-out',
          isOpen ? 'translate-y-0' : 'translate-y-full'
        )}
        role="dialog"
        aria-label="Menu"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="h-1 w-12 rounded-full bg-slate-300" />
        </div>

        <div className="px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          {/* Nav links */}
          <nav className="space-y-1 py-2">
            {flatItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors',
                    active
                      ? 'bg-orange-50 text-orange-700 font-semibold'
                      : 'text-slate-700 hover:bg-slate-100'
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  {Icon && <Icon className="h-5 w-5 shrink-0" />}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="my-4 border-t border-slate-200" />

          {/* User row + Notifications + Logout */}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 text-sm font-bold text-white">
                {(userName || 'U').slice(0, 2)}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{userName || 'User'}</p>
                <p className="text-xs text-slate-500">{role || 'Counsellor'}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <NotificationBell />
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
                className="cursor-pointer rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
