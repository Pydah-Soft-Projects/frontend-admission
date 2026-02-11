'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { showToast } from '@/lib/toast';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import { auth } from '@/lib/auth';
import type { User } from '@/types';

export default function ProfilePage() {
    const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
    const queryClient = useQueryClient();
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isPasswordExpanded, setIsPasswordExpanded] = useState(false);

    useEffect(() => {
        setCurrentUser(auth.getUser());
    }, []);

    const headerContent = useMemo(
        () => (
            <div className="flex flex-col items-end gap-2 text-right">
                <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Profile &amp; Settings
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    Manage your account details and update your password.
                </p>
            </div>
        ),
        []
    );

    useEffect(() => {
        setHeaderContent(headerContent);
        return () => clearHeaderContent();
    }, [headerContent, setHeaderContent, clearHeaderContent]);

    const updatePasswordMutation = useMutation({
        mutationFn: async (password: string) => {
            if (!currentUser) throw new Error('User not found');
            return userAPI.update(currentUser._id, { password });
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

    if (!currentUser) {
        return <div className="p-8 text-center text-slate-600 dark:text-slate-400">Loading user profile...</div>;
    }

    return (
        <div className="max-w-3xl space-y-6">
            <Card className="p-6">
                <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-slate-100">Profile Details</h2>
                <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Name</label>
                        <div className="rounded-lg bg-slate-50 px-4 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
                            {currentUser.name}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Email</label>
                        <div className="rounded-lg bg-slate-50 px-4 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
                            {currentUser.email}
                        </div>
                    </div>
                    <div className="space-y-1">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Role</label>
                        <div className="rounded-lg bg-slate-50 px-4 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700">
                            {currentUser.roleName}
                        </div>
                    </div>
                </div>
            </Card>

            <Card className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-0 mb-4">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Security</h2>
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
    );
}
