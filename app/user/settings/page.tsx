'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { auth } from '@/lib/auth';
import { authAPI, userSettingsAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDashboardHeader } from '@/components/layout/DashboardShell';

export default function UserSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(auth.getUser());
  const [timeTrackingEnabled, setTimeTrackingEnabled] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loginLogs, setLoginLogs] = useState<{ logs: Array<{ id: string; eventType: string; createdAt: string }>; pagination?: { page: number; total: number; pages: number } } | null>(null);

  const { setMobileTopBar, clearMobileTopBar } = useDashboardHeader();

  useEffect(() => {
    setMobileTopBar({ title: 'Settings', iconKey: 'dashboard' });
    return () => clearMobileTopBar();
  }, [setMobileTopBar, clearMobileTopBar]);

  useEffect(() => {
    const u = auth.getUser();
    if (!u) {
      router.replace('/auth/login');
      return;
    }
    if (u.roleName === 'Super Admin' || u.roleName === 'Sub Super Admin') {
      router.replace('/superadmin/dashboard');
      return;
    }
    if (u.roleName === 'Data Entry User') {
      router.replace('/superadmin/leads/individual');
      return;
    }
    setUser(u);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const [settings, logs] = await Promise.all([
          userSettingsAPI.getMySettings(),
          userSettingsAPI.getMyLoginLogs({ page: 1, limit: 20 }),
        ]);
        setTimeTrackingEnabled(settings?.timeTrackingEnabled ?? true);
        setLoginLogs(logs ?? null);
      } catch {
        setTimeTrackingEnabled(user.timeTrackingEnabled !== false);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [user?._id]);

  const handleToggle = async (enabled: boolean) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await userSettingsAPI.updateMySettings({ timeTrackingEnabled: enabled });
      setTimeTrackingEnabled(enabled);
      auth.updateUser({ timeTrackingEnabled: enabled });
      const res = await authAPI.getCurrentUser();
      if (res) auth.updateUser(res);
      // Refresh activity list to show the new tracking ON/OFF event
      const logs = await userSettingsAPI.getMyLoginLogs({ page: 1, limit: 20 });
      setLoginLogs(logs ?? null);
      if (enabled) {
        router.push('/user/dashboard');
      }
    } catch {
      // Keep current state on error
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 sm:space-y-6 px-0 sm:px-2 pb-20 sm:pb-0">
      <div className="space-y-0.5 sm:space-y-1">
        <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">Settings</h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Manage your account preferences and time tracking.
        </p>
      </div>

      {isLoading ? (
        <Card className="p-4 sm:p-6">
          <Skeleton className="h-4 sm:h-5 w-3/4 max-w-[200px] sm:max-w-[240px] mb-3 sm:mb-4 rounded" />
          <Skeleton className="h-3 sm:h-4 w-full rounded mb-1.5 sm:mb-2" />
          <Skeleton className="h-3 sm:h-4 w-full rounded mb-1.5 sm:mb-2" />
          <Skeleton className="h-3 sm:h-4 w-4/5 rounded mb-3 sm:mb-4" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-7 w-12 shrink-0 rounded-full" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
        </Card>
      ) : (
        <Card className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                Time Tracking (ON/OFF)
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-3 sm:mb-4 leading-snug">
                When ON, the time you enable it is recorded as your start. When you turn it OFF, that time is recorded as your end. Working hours are calculated by end of day.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={timeTrackingEnabled}
                  disabled={isSaving}
                  onClick={() => handleToggle(!timeTrackingEnabled)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                    timeTrackingEnabled ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      timeTrackingEnabled ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {timeTrackingEnabled ? 'Enabled' : 'Disabled'}
                </span>
                {isSaving && <span className="text-xs text-slate-500">Saving…</span>}
              </div>
            </div>
          </div>
        </Card>
      )}

      {loginLogs && loginLogs.logs?.length > 0 && (() => {
        const trackingLogs = loginLogs.logs.filter(
          (log) => log.eventType === 'tracking_enabled' || log.eventType === 'tracking_disabled'
        );
        if (trackingLogs.length === 0) return null;
        return (
          <Card className="p-4 sm:p-6">
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 mb-3 sm:mb-4">
              Tracking Activity
            </h2>
            <ul className="space-y-1.5 sm:space-y-2">
              {trackingLogs.map((log) => {
                const label = log.eventType === 'tracking_enabled' ? 'ON' : 'OFF';
                const badgeClass = log.eventType === 'tracking_enabled'
                  ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
                return (
                  <li
                    key={log.id}
                    className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 min-w-0"
                  >
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${badgeClass}`}>
                      {label}
                    </span>
                    <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 truncate">
                      {format(new Date(log.createdAt), 'MMM d, yyyy · h:mm a')}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })()}

      {timeTrackingEnabled && (
        <div className="hidden sm:flex justify-start">
          <Button variant="outline" size="sm" onClick={() => router.push('/user/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      )}
    </div>
  );
}
