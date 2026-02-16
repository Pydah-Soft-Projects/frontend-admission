'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { authAPI, userSettingsAPI, userAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { showToast } from '@/lib/toast';
import { useDashboardHeader } from '@/components/layout/DashboardShell';

export default function UserSettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(auth.getUser());
  const [timeTrackingEnabled, setTimeTrackingEnabled] = useState<boolean>(true);
  const [autoCallingEnabled, setAutoCallingEnabled] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loginLogs, setLoginLogs] = useState<{ logs: Array<{ id: string; eventType: string; createdAt: string }>; pagination?: { page: number; total: number; pages: number } } | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordExpanded, setIsPasswordExpanded] = useState(false);

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
        setAutoCallingEnabled(settings?.autoCallingEnabled ?? false);
        setLoginLogs(logs ?? null);
      } catch {
        setTimeTrackingEnabled(user.timeTrackingEnabled !== false);
        setAutoCallingEnabled(user.autoCallingEnabled === true);
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

  const handleAutoCallingToggle = async (enabled: boolean) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // Assuming updateMySettings supports autoCallingEnabled
      await userSettingsAPI.updateMySettings({ autoCallingEnabled: enabled } as any);
      setAutoCallingEnabled(enabled);
      auth.updateUser({ autoCallingEnabled: enabled } as any);
      const res = await authAPI.getCurrentUser();
      if (res) auth.updateUser(res);
      showToast.success(`Auto-Calling ${enabled ? 'Enabled' : 'Disabled'}`);
    } catch (error) {
      showToast.error('Failed to update settings');
    } finally {
      setIsSaving(false);
    }
  };

  const updatePasswordMutation = useMutation({
    mutationFn: async (password: string) => {
      if (!user) throw new Error('User not found');
      return userSettingsAPI.updateMyProfile({ password });
    },
    onSuccess: () => {
      showToast.success('Password updated successfully');
      setNewPassword('');
      setConfirmPassword('');
      setIsPasswordExpanded(false);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to update password');
    },
  });

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) {
      showToast.error('Please fill in both password fields');
      return;
    }
    if (newPassword.length < 6) {
      showToast.error('Password must be at least 6 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast.error('Passwords do not match');
      return;
    }

    if (window.confirm('Are you sure you want to update your password?')) {
      updatePasswordMutation.mutate(newPassword);
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

      <Card className="p-4 sm:p-6">
        <h2 className="mb-4 text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">Profile Details</h2>
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
              {user.name}
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
              {user.email}
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Role</label>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
              {user.roleName}
            </div>
          </div>
          {user.designation && (
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Designation</label>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
                {user.designation}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-0 mb-4">
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">Security</h2>
          {!isPasswordExpanded && (
            <Button variant="outline" size="sm" onClick={() => setIsPasswordExpanded(true)} className="w-full sm:w-auto">
              Reset Password
            </Button>
          )}
        </div>

        {isPasswordExpanded && (
          <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-md animate-in fade-in slide-in-from-top-2 duration-300">
            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              autoFocus
            />
            <Input
              label="Confirm New Password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
            />
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
              <Button
                type="submit"
                variant="primary"
                disabled={updatePasswordMutation.isPending}
                className="w-full sm:w-auto"
              >
                {updatePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
              </Button>
              <Button
                type="button"
                variant="light"
                onClick={() => {
                  setIsPasswordExpanded(false);
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </Card>

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
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${timeTrackingEnabled ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${timeTrackingEnabled ? 'translate-x-5' : 'translate-x-1'
                      }`}
                  />
                </button>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {timeTrackingEnabled ? 'Enabled' : 'Disabled'}
                </span>
                {isSaving && <span className="text-xs text-slate-500">Saving…</span>}
              </div>
            </div>

            <hr className="border-slate-100 dark:border-slate-700" />

            <div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
                Auto-Calling Mode
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-3 sm:mb-4 leading-snug">
                When enabled, the system will automatically navigate to the next lead and initiate a call after you save a call log.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoCallingEnabled}
                  disabled={isSaving}
                  onClick={() => handleAutoCallingToggle(!autoCallingEnabled)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${autoCallingEnabled ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${autoCallingEnabled ? 'translate-x-5' : 'translate-x-1'
                      }`}
                  />
                </button>
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {autoCallingEnabled ? 'Enabled' : 'Disabled'}
                </span>
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
