'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, managerAPI } from '@/lib/api';
import type { User, ModulePermission, RoleName } from '@/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { showToast } from '@/lib/toast';
import { useDashboardHeader, useModulePermission } from '@/components/layout/DashboardShell';
import { useRouter } from 'next/navigation';
import { PERMISSION_MODULES, PermissionModuleKey } from '@/constants/permissions';

const UserManagementPage = () => {
  const queryClient = useQueryClient();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const router = useRouter();
  const { hasAccess: canAccessUsers, canWrite: canManageUsers } = useModulePermission('users');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    password: '',
    roleName: 'User' as RoleName,
    designation: '',
  });
  const createEmptyPermissions = () =>
    PERMISSION_MODULES.reduce(
      (acc, module) => ({
        ...acc,
        [module.key]: {
          access: false,
          permission: 'read' as ModulePermission['permission'],
        },
      }),
      {} as Record<PermissionModuleKey, ModulePermission>
    );
  const [permissionState, setPermissionState] = useState<Record<PermissionModuleKey, ModulePermission>>(
    createEmptyPermissions()
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [showTeamAssignmentModal, setShowTeamAssignmentModal] = useState(false);
  const [selectedUserForAssignment, setSelectedUserForAssignment] = useState<User | null>(null);
  const [selectedManagerId, setSelectedManagerId] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await userAPI.getAll();
      return response.data || response;
    },
    staleTime: 60000,
  });

  const users = (data?.data || data || []) as User[];

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const term = searchTerm.toLowerCase();
    return users.filter((user) =>
      [user.name, user.email, user.roleName, user.designation].some((field) =>
        field?.toLowerCase().includes(term)
      )
    );
  }, [users, searchTerm]);

  const headerContent = useMemo(
    () => (
      <div className="flex flex-col items-end gap-2 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">User Management</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Maintain super admin and counsellor access, manage activation, and onboard your team quickly.
        </p>
      </div>
    ),
    []
  );

  useEffect(() => {
    setHeaderContent(headerContent);
    return () => clearHeaderContent();
  }, [headerContent, setHeaderContent, clearHeaderContent]);

  useEffect(() => {
    if (!canAccessUsers) {
      router.replace('/superadmin/dashboard');
    }
  }, [canAccessUsers, router]);

  const createMutation = useMutation({
    mutationFn: async (payload: Parameters<typeof userAPI.create>[0]) => userAPI.create(payload),
    onSuccess: () => {
      showToast.success('User created successfully');
      setFormState({ name: '', email: '', password: '', roleName: 'User', designation: '' });
      setPermissionState(createEmptyPermissions());
      setShowCreateUser(false);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to create user');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (user: User) =>
      userAPI.update(user._id, { isActive: !user.isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => {
      showToast.error('Unable to update user status');
    },
  });

  const assignTeamMemberMutation = useMutation({
    mutationFn: async ({ userId, managerId }: { userId: string; managerId: string | null }) =>
      userAPI.update(userId, { managedBy: managerId }),
    onSuccess: () => {
      showToast.success('Team assignment updated successfully');
      setShowTeamAssignmentModal(false);
      setSelectedUserForAssignment(null);
      setSelectedManagerId('');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to update team assignment');
    },
  });

  const toggleManagerRoleMutation = useMutation({
    mutationFn: async (user: User) => {
      // Toggle isManager boolean - this preserves the original roleName
      // Backend will handle clearing team members' managedBy when revoking
      const newIsManager = !user.isManager;
      return userAPI.update(user._id, { isManager: newIsManager });
    },
    onSuccess: (_, user) => {
      const action = user.isManager ? 'promoted to' : 'revoked';
      showToast.success(`User ${action} Manager successfully`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to update user role');
    },
  });

  const managers = useMemo(() => {
    return users.filter((u) => u.isManager === true);
  }, [users]);

  const handleOpenTeamAssignment = (user: User, event: React.MouseEvent) => {
    event.stopPropagation();
    setSelectedUserForAssignment(user);
    // Safely get manager ID - handle null, object, or string
    let managerId = '';
    if (user.managedBy) {
      if (typeof user.managedBy === 'object' && user.managedBy._id) {
        managerId = user.managedBy._id;
      } else if (typeof user.managedBy === 'string') {
        managerId = user.managedBy;
      }
    }
    setSelectedManagerId(managerId);
    setShowTeamAssignmentModal(true);
  };

  const handleAssignTeamMember = () => {
    if (!selectedUserForAssignment) return;
    const managerId = selectedManagerId || null;
    assignTeamMemberMutation.mutate({
      userId: selectedUserForAssignment._id,
      managerId,
    });
  };

  const handleCreateUser = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManageUsers) {
      showToast.error('You do not have permission to create users');
      return;
    }
    if (!formState.name || !formState.email || !formState.password) {
      showToast.error('Please fill in name, email, and password');
      return;
    }

    const payload = {
      name: formState.name.trim(),
      email: formState.email.trim(),
      password: formState.password,
      roleName: formState.roleName,
    } as Parameters<typeof userAPI.create>[0];

    if (formState.roleName === 'User') {
      if (!formState.designation.trim()) {
        showToast.error('Please provide a designation for this user');
        return;
      }
      payload.designation = formState.designation.trim();
    }

    if (formState.roleName === 'Sub Super Admin') {
      const selectedPermissions = Object.entries(permissionState).reduce((acc, [key, value]) => {
        if (value.access) {
          acc[key as PermissionModuleKey] = {
            access: true,
            permission: value.permission === 'read' ? 'read' : 'write',
          };
        }
        return acc;
      }, {} as Record<PermissionModuleKey, ModulePermission>);

      if (Object.keys(selectedPermissions).length === 0) {
        showToast.error('Select at least one module to grant access');
        return;
      }

      payload.permissions = selectedPermissions;
    }

    createMutation.mutate(payload);
  };

  const handleRoleChange = (roleName: string) => {
    setFormState((prev) => ({
      ...prev,
      roleName: roleName as RoleName,
      designation: roleName === 'User' ? prev.designation : '',
    }));
    if (roleName === 'Sub Super Admin') {
      setPermissionState(createEmptyPermissions());
    }
    // Note: Manager is now handled via isManager boolean, not roleName
  };

  const toggleModuleAccess = (moduleKey: PermissionModuleKey) => {
    setPermissionState((prev) => ({
      ...prev,
      [moduleKey]: {
        access: !prev[moduleKey].access,
        permission: prev[moduleKey].access ? prev[moduleKey].permission : 'read',
      },
    }));
  };

  const updateModulePermissionLevel = (moduleKey: PermissionModuleKey, level: ModulePermission['permission']) => {
    setPermissionState((prev) => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        permission: level,
      },
    }));
  };

  const displayRole = (user: User) => {
    if (user.isManager) {
      return `${user.roleName} (Manager)`;
    }
    if (user.roleName === 'User') {
      return user.designation || 'User';
    }
    return user.roleName;
  };

  if (!canAccessUsers) {
    return null;
  }

  const isSubSuperAdmin = formState.roleName === 'Sub Super Admin';

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <Card className="p-6 shadow-lg shadow-blue-100/40 dark:shadow-none">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Input
              placeholder="Search users by name, email, or role…"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="md:w-96"
            />
          </div>
          <Button
            variant="primary"
            onClick={() => setShowCreateUser(true)}
            disabled={!canManageUsers}
          >
            Create User
          </Button>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/70 shadow-inner shadow-blue-100/40 dark:border-slate-800/70 dark:shadow-none">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200/80 dark:divide-slate-800/80">
              <thead className="bg-slate-50/70 backdrop-blur-sm dark:bg-slate-900/70">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Name
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Email
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Role
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Manager
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white/80 backdrop-blur-sm dark:divide-slate-800 dark:bg-slate-900/50">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                      Loading users…
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                      No users match the current search.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    // Safely get manager - handle null, object, or string
                    let manager: User | undefined = undefined;
                    if (user.managedBy) {
                      if (typeof user.managedBy === 'object') {
                        manager = user.managedBy;
                      } else if (typeof user.managedBy === 'string') {
                        manager = users.find((u) => u._id === user.managedBy);
                      }
                    }
                    return (
                      <tr
                        key={user._id}
                        className="cursor-pointer transition hover:bg-blue-50/60 dark:hover:bg-slate-800/60"
                        onClick={() => router.push(`/superadmin/users/${user._id}/leads`)}
                      >
                        <td className="px-6 py-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                          {user.name}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {user.email}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {displayRole(user)}
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                              user.isActive
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200'
                            }`}
                          >
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                          {manager ? (
                            <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200">
                              {manager.name}
                            </span>
                          ) : (
                            <span className="text-slate-400">No Manager</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {(user.roleName === 'User' || user.roleName === 'Sub Super Admin') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(event) => handleOpenTeamAssignment(user, event)}
                                disabled={!canManageUsers}
                              >
                                {manager ? 'Change Manager' : 'Assign Manager'}
                              </Button>
                            )}
                            {/* Manager Role Toggle - Show for User and Sub Super Admin (not Super Admin) */}
                            {(user.roleName === 'User' || user.roleName === 'Sub Super Admin') && (
                              <Button
                                variant={user.isManager ? 'primary' : 'outline'}
                                size="sm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (user.isManager) {
                                    if (window.confirm(`Are you sure you want to revoke Manager privileges from ${user.name}? This will remove them as manager of their team.`)) {
                                      toggleManagerRoleMutation.mutate(user);
                                    }
                                  } else {
                                    if (window.confirm(`Are you sure you want to grant Manager privileges to ${user.name}?`)) {
                                      toggleManagerRoleMutation.mutate(user);
                                    }
                                  }
                                }}
                                disabled={toggleManagerRoleMutation.isPending || !canManageUsers}
                              >
                                {user.isManager ? 'Revoke Manager' : 'Make Manager'}
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleActiveMutation.mutate(user);
                              }}
                              disabled={toggleActiveMutation.isPending || !canManageUsers}
                            >
                              {user.isActive ? 'Deactivate' : 'Activate'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {showCreateUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <Card className="w-full max-w-4xl space-y-6 p-6 shadow-xl shadow-blue-100/40 dark:shadow-none">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Create New User</h2>
              <button
                type="button"
                className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                onClick={() => setShowCreateUser(false)}
              >
                Close
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-6">
              <div
                className={isSubSuperAdmin ? 'grid gap-6 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,0.45fr)]' : 'space-y-4'}
              >
                <div className={isSubSuperAdmin ? 'space-y-4' : 'space-y-4'}>
                  <Input
                    label="Full Name"
                    name="name"
                    value={formState.name}
                    onChange={(event) => setFormState((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Counsellor name"
                  />
                  <Input
                    label="Email Address"
                    name="email"
                    type="email"
                    value={formState.email}
                    onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                    placeholder="name@college.com"
                  />
                  <Input
                    label="Password"
                    name="password"
                    type="password"
                    value={formState.password}
                    onChange={(event) => setFormState((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder="Temporary password"
                  />
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Role</label>
                    <select
                      value={formState.roleName}
                      onChange={(event) => handleRoleChange(event.target.value)}
                      className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                    >
                    <option value="User">User</option>
                    <option value="Sub Super Admin">Sub Super Admin</option>
                    <option value="Super Admin">Super Admin</option>
                    </select>
                  </div>

                  {formState.roleName === 'User' && (
                    <Input
                      label="Role Name / Designation"
                      name="designation"
                      value={formState.designation}
                      onChange={(event) => setFormState((prev) => ({ ...prev, designation: event.target.value }))}
                      placeholder="e.g. Senior Counsellor"
                    />
                  )}
                </div>

                {isSubSuperAdmin && (
                  <div className="flex h-full flex-col gap-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-900/20">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                        Module Permissions
                      </h3>
                      <p className="text-xs text-blue-700/80 dark:text-blue-200/70">
                        Select which super admin modules this sub super admin can access, and whether they can edit them.
                      </p>
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto pr-1 max-h-[60vh]">
                      {PERMISSION_MODULES.map((module) => {
                        const moduleState = permissionState[module.key];
                        return (
                          <div
                            key={module.key}
                            className="flex flex-col justify-between rounded-2xl border border-white/70 bg-white p-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/80"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                  {module.label}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{module.description}</p>
                              </div>
                              <label className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  checked={moduleState.access}
                                  onChange={() => toggleModuleAccess(module.key)}
                                />
                                Access
                              </label>
                            </div>
                            {moduleState.access ? (
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-blue-200/70 bg-blue-50/70 p-2 dark:border-blue-900/50 dark:bg-blue-900/30">
                                <p className="text-[10px] font-medium uppercase tracking-[0.3em] text-blue-600 dark:text-blue-200">
                                  Permission Level
                                </p>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={moduleState.permission === 'read' ? 'primary' : 'outline'}
                                    onClick={() => updateModulePermissionLevel(module.key, 'read')}
                                  >
                                    Read Only
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={moduleState.permission === 'write' ? 'primary' : 'outline'}
                                    onClick={() => updateModulePermissionLevel(module.key, 'write')}
                                  >
                                    Read &amp; Write
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-2 text-center text-[10px] font-medium uppercase text-slate-400 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-500">
                                Access disabled
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowCreateUser(false);
                    setPermissionState(createEmptyPermissions());
                    setFormState({ name: '', email: '', password: '', roleName: 'User', designation: '' });
                  }}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={createMutation.isPending || !canManageUsers}>
                  {createMutation.isPending ? 'Creating…' : 'Create User'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Team Assignment Modal */}
      {showTeamAssignmentModal && selectedUserForAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <Card className="w-full max-w-md space-y-6 p-6 shadow-xl shadow-blue-100/40 dark:shadow-none">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Assign Team Member
              </h2>
              <button
                type="button"
                className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                onClick={() => {
                  setShowTeamAssignmentModal(false);
                  setSelectedUserForAssignment(null);
                  setSelectedManagerId('');
                }}
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  User
                </label>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {selectedUserForAssignment.name} ({selectedUserForAssignment.email})
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                  Assign to Manager
                </label>
                {managers.length === 0 ? (
                  <div className="rounded-xl border-2 border-amber-200 bg-amber-50/80 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                      No managers available. Please create a manager first by creating a user with the "Manager" role.
                    </p>
                  </div>
                ) : (
                  <select
                    value={selectedManagerId}
                    onChange={(e) => setSelectedManagerId(e.target.value)}
                    className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                  >
                    <option value="">No Manager (Remove Assignment)</option>
                    {managers.map((manager) => (
                      <option key={manager._id} value={manager._id}>
                        {manager.name} ({manager.email})
                        {manager.isActive ? '' : ' - Inactive'}
                      </option>
                    ))}
                  </select>
                )}
                {managers.length > 0 && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Select a manager to assign this user to their team, or select "No Manager" to remove the assignment.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowTeamAssignmentModal(false);
                  setSelectedUserForAssignment(null);
                  setSelectedManagerId('');
                }}
                disabled={assignTeamMemberMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleAssignTeamMember}
                disabled={assignTeamMemberMutation.isPending || !canManageUsers || managers.length === 0}
              >
                {assignTeamMemberMutation.isPending ? 'Updating…' : 'Update Assignment'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Team Cards Section - Show team metrics for managers */}
      {managers.length > 0 && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-6">
            Manager Teams
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {managers.map((manager) => (
              <ManagerTeamCard key={manager._id} manager={manager} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

// Manager Team Card Component
const ManagerTeamCard = ({ manager }: { manager: User }) => {
  const { data: teamData, isLoading: isLoadingTeam } = useQuery({
    queryKey: ['manager-team', manager._id],
    queryFn: async () => {
      // We need to fetch team data - but managerAPI requires manager authentication
      // So we'll calculate from users list instead
      return null;
    },
    enabled: false, // Disable for now, we'll calculate from users
  });

  const { data: allUsers } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const response = await userAPI.getAll();
      return response.data || response;
    },
  });

  const teamMembers = useMemo(() => {
    if (!allUsers) return [];
    const users = Array.isArray(allUsers) ? allUsers : allUsers.data || [];
    return users.filter((user: User) => {
      if (typeof user.managedBy === 'object') {
        return user.managedBy?._id === manager._id;
      }
      return user.managedBy === manager._id;
    });
  }, [allUsers, manager._id]);

  const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

  return (
    <Card className="p-4 border-2 border-blue-200 dark:border-blue-800">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {manager.name}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">{manager.email}</p>
        </div>
        <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200">
          Manager
        </span>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600 dark:text-slate-400">Team Members</span>
          <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {isLoadingTeam ? '...' : formatNumber(teamMembers.length)}
          </span>
        </div>

        {teamMembers.length > 0 && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
              Team Members:
            </p>
            <div className="space-y-1">
              {teamMembers.slice(0, 3).map((member: User) => (
                <div
                  key={member._id}
                  className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2"
                >
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  {member.name} ({member.roleName})
                </div>
              ))}
              {teamMembers.length > 3 && (
                <div className="text-xs text-slate-500 dark:text-slate-500">
                  +{teamMembers.length - 3} more
                </div>
              )}
            </div>
          </div>
        )}

        {teamMembers.length === 0 && (
          <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No team members assigned yet
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};

export default UserManagementPage;
