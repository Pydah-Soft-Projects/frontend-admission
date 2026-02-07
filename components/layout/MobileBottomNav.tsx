'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { DashboardNavItem } from './DashboardShell';

export type MobileBottomNavItem = Pick<DashboardNavItem, 'href' | 'label' | 'icon'>;

interface MobileBottomNavProps {
  items: MobileBottomNavItem[];
  onMenuPress: () => void;
}

/** Flatten nav items: take top-level and first level of children for display. */
export function flattenNavItemsForMobile(navItems: DashboardNavItem[]): MobileBottomNavItem[] {
  const flat: MobileBottomNavItem[] = [];
  for (const item of navItems) {
    if (item.children && item.children.length > 0) {
      flat.push({ href: item.href, label: item.label, icon: item.icon });
      for (const child of item.children) {
        flat.push({ href: child.href, label: child.label, icon: child.icon });
      }
    } else {
      flat.push({ href: item.href, label: item.label, icon: item.icon });
    }
  }
  return flat;
}

export function MobileBottomNav({ items, onMenuPress }: MobileBottomNavProps) {
  const pathname = usePathname() || '';
  const navCount = items.length + 1;
  const isActive = (href: string) => pathname === href || (href !== '/' && pathname.startsWith(href));

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]"
      aria-label="Bottom navigation"
    >
      <div
        className="grid h-16 w-full max-w-lg mx-auto place-items-center gap-0"
        style={{ gridTemplateColumns: `repeat(${navCount}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-11 w-full cursor-pointer flex-col items-center justify-center gap-0.5 py-1.5 transition-colors',
                active ? 'text-orange-600' : 'text-slate-500 hover:text-slate-800'
              )}
              aria-current={active ? 'page' : undefined}
            >
              {Icon && <Icon className="h-6 w-6 shrink-0" />}
              <span className="text-[10px] font-medium truncate w-full text-center px-0.5">{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onMenuPress}
          className="flex min-h-11 w-full cursor-pointer flex-col items-center justify-center gap-0.5 py-1.5 text-slate-500 transition-colors hover:text-slate-800"
          aria-label="Open menu"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-6 w-6 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <span className="text-[10px] font-medium">Menu</span>
        </button>
      </div>
    </nav>
  );
}
