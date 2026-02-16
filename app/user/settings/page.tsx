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

      <div className="flex flex-col gap-4 sm:gap-6">
        {/* Profile Card */}
        <div className="order-2 sm:order-1">
          <Card className="p-4 sm:p-6 overflow-hidden relative">
            <h2 className="mb-4 text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 hidden sm:block">Profile Details</h2>

            {/* Mobile View: Compact Banner Style */}
            <div className="block sm:hidden -mx-4 -mt-4 bg-gradient-to-r from-orange-500 to-amber-500 p-6 text-white mb-4">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl font-bold border-2 border-white/50">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-xl font-bold leading-tight">{user.name}</h3>
                  <p className="text-orange-100 text-sm font-medium">{user.roleName}</p>
                </div>
              </div>
            </div>

            {/* Mobile View: Simple List for Details */}
            <div className="block sm:hidden space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 flex justify-center text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <div className="flex-1 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <p className="text-slate-500 text-xs">Email</p>
                  <p className="text-slate-900 dark:text-slate-100 font-medium">{user.email}</p>
                </div>
              </div>

              {user.designation && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-8 flex justify-center text-slate-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  </div>
                  <div className="flex-1 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <p className="text-slate-500 text-xs">Designation</p>
                    <p className="text-slate-900 dark:text-slate-100 font-medium">{user.designation}</p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 flex justify-center text-slate-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                </div>
                <div className="flex-1 pb-1">
                  <p className="text-slate-500 text-xs">Role</p>
                  <p className="text-slate-900 dark:text-slate-100 font-medium">{user.roleName}</p>
                </div>
              </div>
            </div>

            {/* Desktop View: Grid */}
            <div className="hidden sm:grid gap-4 sm:gap-6 md:grid-cols-2">
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
        </div>

        {/* Security Card */}
        <div className="order-3 sm:order-2">
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
        </div>

        {/* Settings (Toggles) Card - First on Mobile */}
        <div className="order-1 sm:order-3">
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
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">
                      Time Tracking
                    </h2>

                    {/* Integrated Toggle for Mobile */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={timeTrackingEnabled}
                        disabled={isSaving}
                        onClick={() => handleToggle(!timeTrackingEnabled)}
                        className={`relative inline-flex h-6 w-11 sm:h-7 sm:w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${timeTrackingEnabled ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 sm:h-6 sm:w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${timeTrackingEnabled ? 'translate-x-5' : 'translate-x-0.5 sm:translate-x-1'
                            }`}
                        />
                      </button>
                      <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 w-14 sm:w-auto">
                        {timeTrackingEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-0 leading-snug pr-0 sm:pr-8">
                    When ON, your start time is recorded. Working hours calculated daily.
                  </p>

                  {isSaving && <div className="text-xs text-orange-500 mt-1">Saving changes...</div>}
                </div>

                <hr className="border-slate-100 dark:border-slate-700" />

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-slate-100">
                      Auto-Calling Mode
                    </h2>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={autoCallingEnabled}
                        disabled={isSaving}
                        onClick={() => handleAutoCallingToggle(!autoCallingEnabled)}
                        className={`relative inline-flex h-6 w-11 sm:h-7 sm:w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${autoCallingEnabled ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 sm:h-6 sm:w-6 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${autoCallingEnabled ? 'translate-x-5' : 'translate-x-0.5 sm:translate-x-1'
                            }`}
                        />
                      </button>
                      <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 w-14 sm:w-auto">
                        {autoCallingEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-0 leading-snug pr-0 sm:pr-8">
                    Automatically navigates to the next lead after saving a call log.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Logs Card */}
        <div className="order-4 sm:order-4">
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
        </div>
      </div>

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
