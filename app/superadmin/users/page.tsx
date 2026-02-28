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
import Link from 'next/link';
import { PERMISSION_MODULES, PermissionModuleKey } from '@/constants/permissions';
import { auth } from '@/lib/auth';

// Action icons for table (Heroicons-style outline)
const IconPencil = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);
const IconTrash = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);
const IconList = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);
const IconCards = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
  </svg>
);
const IconUserGroup = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);
const IconBadge = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);
const IconCheck = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);
const IconX = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const UserManagementPage = () => {
  const queryClient = useQueryClient();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const router = useRouter();
  const { hasAccess: canAccessUsers, canWrite: canManageUsers } = useModulePermission('users');
  const currentUser = auth.getUser();
  const canDeleteUsers = canManageUsers && currentUser?.roleName !== 'Sub Super Admin';
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formState, setFormState] = useState({
    name: '',
    email: '',
    mobileNumber: '',
    password: '',
    roleName: 'Student Counselor' as RoleName,
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
  const [editFormState, setEditFormState] = useState<{
    name: string;
    email: string;
    mobileNumber?: string;
    roleName: RoleName;
    designation: string;
    password?: string;
  }>({
    name: '',
    email: '',
    mobileNumber: '',
    roleName: 'Student Counselor',
    designation: '',
    password: '',
  });
  const [editPermissionState, setEditPermissionState] = useState<
    Record<PermissionModuleKey, ModulePermission>
  >(createEmptyPermissions());
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

  const stats = useMemo(() => {
    return {
      total: users.length,
      subAdmins: users.filter(u => u.roleName === 'Sub Super Admin').length,
      counselors: users.filter(u => u.roleName === 'Student Counselor').length,
      dataEntry: users.filter(u => u.roleName === 'Data Entry User').length,
      pro: users.filter(u => u.roleName === 'PRO').length,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const term = searchTerm.toLowerCase();
    return users.filter((user) =>
      [user.name, user.email, user.mobileNumber, user.roleName, user.designation].some((field) =>
        field?.toLowerCase().includes(term)
      )
    );
  }, [users, searchTerm]);

  const headerContent = useMemo(
    () => (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between w-full">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">User Management</h1>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full xl:w-64"
            />
          </div>
          <div className="flex shrink-0 items-center rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-1 shadow-sm dark:border-[#334155] dark:bg-[#0f172a]">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all ${viewMode === 'list'
                ? 'bg-[#ffffff] text-[#334155] shadow dark:bg-[#1e293b] dark:text-[#f1f5f9]'
                : 'text-[#64748b] hover:text-[#334155] dark:text-[#94a3b8] dark:hover:text-[#f1f5f9]'
                }`}
              title="List View"
            >
              <IconList className="w-4 h-4 mr-1.5" /> List
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all ${viewMode === 'card'
                ? 'bg-[#ffffff] text-[#334155] shadow dark:bg-[#1e293b] dark:text-[#f1f5f9]'
                : 'text-[#64748b] hover:text-[#334155] dark:text-[#94a3b8] dark:hover:text-[#f1f5f9]'
                }`}
              title="Card View"
            >
              <IconCards className="w-4 h-4 mr-1.5" /> Cards
            </button>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setShowCreateUser(true)}
            disabled={!canManageUsers}
            className="h-9 shrink-0 px-4 font-medium"
          >
            Create User
          </Button>
        </div>
      </div>
    ),
    [searchTerm, viewMode, canManageUsers]
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
      setFormState({ name: '', email: '', mobileNumber: '', password: '', roleName: 'Student Counselor', designation: '' });
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
      // Update selected user detail if open
      if (selectedUserDetail) {
        setSelectedUserDetail(prev => prev ? ({ ...prev, isActive: !prev.isActive }) : null);
      }
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
      setShowUserDetail(false); // Close detail modal after assignment to refresh context or start fresh
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
      if (selectedUserDetail && selectedUserDetail._id === user._id) {
        setSelectedUserDetail(prev => prev ? ({ ...prev, isManager: !prev.isManager }) : null);
      }
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to update user role');
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: Parameters<typeof userAPI.update>[1] }) =>
      userAPI.update(userId, data),
    onSuccess: () => {
      showToast.success('User updated successfully');
      setShowEditUser(false);
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowUserDetail(false);
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to update user');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => userAPI.delete(userId),
    onSuccess: () => {
      showToast.success('User deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowUserDetail(false);
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to delete user');
    },
  });

  const managers = useMemo(() => {
    return users.filter((u) => u.isManager === true);
  }, [users]);

  // New state for user detail modal
  const [showUserDetail, setShowUserDetail] = useState(false);
  const [selectedUserDetail, setSelectedUserDetail] = useState<User | null>(null);

  const handleRowClick = (user: User) => {
    setSelectedUserDetail(user);
    setShowUserDetail(true);
  };

  const handleOpenTeamAssignment = (user: User, event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
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

    if (formState.password.length < 6) {
      showToast.error('Password must be at least 6 characters long');
      return;
    }

    const payload = {
      name: formState.name.trim(),
      email: formState.email.trim(),
      mobileNumber: formState.mobileNumber.trim() || undefined,
      password: formState.password,
      roleName: formState.roleName,
    } as Parameters<typeof userAPI.create>[0];

    // Designation logic removed
    if (formState.roleName === 'Student Counselor' || formState.roleName === 'Data Entry User') {
      // Designation logic removed
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
      designation: '',
    }));
    if (roleName === 'Sub Super Admin') {
      setPermissionState(createEmptyPermissions());
    }
    // Note: Manager is now handled via isManager boolean, not roleName
  };

  const handleEditRoleChange = (roleName: string) => {
    setEditFormState((prev) => ({
      ...prev,
      roleName: roleName as RoleName,
      designation: '',
    }));
    if (roleName === 'Sub Super Admin') {
      setEditPermissionState(createEmptyPermissions());
    }
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
    if (user.roleName === 'Student Counselor' || user.roleName === 'Data Entry User') {
      return user.designation || user.roleName;
    }
    return user.roleName;
  };

  if (!canAccessUsers) {
    return null;
  }

  const isSubSuperAdmin = formState.roleName === 'Sub Super Admin';

  const actionBtnClass = 'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition disabled:opacity-50 disabled:pointer-events-none shrink-0';
  const actionBtnBase = `${actionBtnClass} border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100`;

  return (
    <div className="w-full space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Card className="p-4 bg-[#3b82f6] text-[#ffffff] border-none shadow-md dark:bg-[#2563eb]">
          <div className="text-xs font-medium text-[#f1f5f9] uppercase tracking-wider">Total Users</div>
          <div className="mt-1 text-2xl font-bold text-[#ffffff]">{stats.total}</div>
        </Card>
        <Card className="p-4 bg-[#8b5cf6] text-[#ffffff] border-none shadow-md dark:bg-[#7c3aed]">
          <div className="text-xs font-medium text-[#f1f5f9] uppercase tracking-wider">Sub Super Admins</div>
          <div className="mt-1 text-2xl font-bold text-[#ffffff]">{stats.subAdmins}</div>
        </Card>
        <Card className="p-4 bg-[#10b981] text-[#ffffff] border-none shadow-md dark:bg-[#059669]">
          <div className="text-xs font-medium text-[#f1f5f9] uppercase tracking-wider">Counselors</div>
          <div className="mt-1 text-2xl font-bold text-[#ffffff]">{stats.counselors}</div>
        </Card>
        <Card className="p-4 bg-[#f97316] text-[#ffffff] border-none shadow-md dark:bg-[#ea580c]">
          <div className="text-xs font-medium text-[#f1f5f9] uppercase tracking-wider">Data Entry Users</div>
          <div className="mt-1 text-2xl font-bold text-[#ffffff]">{stats.dataEntry}</div>
        </Card>
        <Card className="p-4 bg-[#0ea5e9] text-[#ffffff] border-none shadow-md dark:bg-[#0284c7]">
          <div className="text-xs font-medium text-[#f1f5f9] uppercase tracking-wider">PRO</div>
          <div className="mt-1 text-2xl font-bold text-[#ffffff]">{stats.pro}</div>
        </Card>
      </div>

      {viewMode === 'list' ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
              <thead className="bg-slate-50 dark:bg-slate-800/80">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Name
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Email
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Mobile
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Role
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Manager
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-300 min-w-[120px]">

                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-900/40">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      Loading users…
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      No users match the current search.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
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
                        className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        onClick={() => handleRowClick(user)}
                      >
                        <td className="px-3 py-2.5 align-middle text-sm font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                          {user.name}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-sm text-slate-600 dark:text-slate-300">
                          <span className="truncate max-w-[180px] inline-block" title={user.email}>{user.email}</span>
                        </td>
                        <td className="px-3 py-2.5 align-middle text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {user.mobileNumber || '-'}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {displayRole(user)}
                        </td>
                        <td className="px-3 py-2.5 align-middle whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${user.isActive
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200'
                              : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200'
                              }`}
                          >
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 align-middle text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
                          {manager ? (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">
                              {manager.name}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 align-middle text-right whitespace-nowrap">
                          <IconPencil className="inline-block w-4 h-4 text-slate-400" />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isLoading ? (
            <div className="col-span-full py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Loading users…
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="col-span-full py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              No users match the current search.
            </div>
          ) : (
            filteredUsers.map((user) => {
              let manager: User | undefined = undefined;
              if (user.managedBy) {
                if (typeof user.managedBy === 'object') {
                  manager = user.managedBy;
                } else if (typeof user.managedBy === 'string') {
                  manager = users.find((u) => u._id === user.managedBy);
                }
              }
              return (
                <Card
                  key={user._id}
                  className="group flex cursor-pointer flex-col justify-between p-5 transition-all hover:border-blue-200 hover:shadow-md dark:hover:border-blue-900/50"
                  onClick={() => handleRowClick(user)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {user.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900 dark:text-slate-100">
                          {user.name}
                        </div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {displayRole(user)}
                        </div>
                      </div>
                    </div>
                    <button className="rounded-full p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-900 group-hover:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-100">
                      <IconPencil className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                    <div className="flex items-center gap-2 truncate">
                      <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <span className="truncate">{user.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {user.mobileNumber || '-'}
                    </div>
                    {manager && (
                      <div className="flex items-center gap-2">
                        <IconUserGroup className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate">Manager: {manager.name}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${user.isActive
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200'
                        }`}
                    >
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      ID: {user._id.slice(-4)}
                    </span>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* User Detail Modal */}
      {showUserDetail && selectedUserDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <Card className="w-full max-w-md space-y-6 p-6 shadow-lg border border-slate-200 dark:border-slate-800 dark:shadow-none animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-lg font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                  {selectedUserDetail.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {selectedUserDetail.name}
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {selectedUserDetail.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="rounded-full bg-slate-100 p-1.5 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                onClick={() => setShowUserDetail(false)}
              >
                <IconX className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 dark:bg-slate-900/50 text-sm">
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Role</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-200">{displayRole(selectedUserDetail)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status</p>
                  <span
                    className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${selectedUserDetail.isActive
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200'
                      }`}
                  >
                    {selectedUserDetail.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Mobile</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-200">{selectedUserDetail.mobileNumber || '-'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Manager</p>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-200">
                    {selectedUserDetail.managedBy && typeof selectedUserDetail.managedBy !== 'string'
                      ? selectedUserDetail.managedBy.name
                      : selectedUserDetail.managedBy
                        ? (users.find(u => u._id === selectedUserDetail.managedBy) as User)?.name || 'Unknown'
                        : '-'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Actions</h3>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleOpenTeamAssignment(selectedUserDetail)}
                    disabled={!canManageUsers}
                    className="justify-start"
                  >
                    <IconUserGroup className="w-4 h-4 mr-2" />
                    Assign Manager
                  </Button>

                  {canManageUsers && (selectedUserDetail.roleName === 'Super Admin' || selectedUserDetail.roleName === 'Sub Super Admin' ? false : true) && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (selectedUserDetail.isManager) {
                          if (window.confirm(`Revoke Manager privileges from ${selectedUserDetail.name}?`)) {
                            toggleManagerRoleMutation.mutate(selectedUserDetail);
                          }
                        } else {
                          if (window.confirm(`Grant Manager privileges to ${selectedUserDetail.name}?`)) {
                            toggleManagerRoleMutation.mutate(selectedUserDetail);
                          }
                        }
                      }}
                      className={selectedUserDetail.isManager ? "justify-start border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" : "justify-start"}
                    >
                      <IconBadge className="w-4 h-4 mr-2" />
                      {selectedUserDetail.isManager ? 'Revoke Manager' : 'Make Manager'}
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    onClick={() => toggleActiveMutation.mutate(selectedUserDetail)}
                    disabled={!canManageUsers}
                    className={selectedUserDetail.isActive ? "justify-start text-rose-600 hover:bg-rose-50 border-rose-200" : "justify-start text-emerald-600 hover:bg-emerald-50 border-emerald-200"}
                  >
                    {selectedUserDetail.isActive ? <IconX className="w-4 h-4 mr-2" /> : <IconCheck className="w-4 h-4 mr-2" />}
                    {selectedUserDetail.isActive ? 'Deactivate' : 'Activate'}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingUser(selectedUserDetail);
                      setEditFormState({
                        name: selectedUserDetail.name,
                        email: selectedUserDetail.email,
                        mobileNumber: selectedUserDetail.mobileNumber || '',
                        roleName: selectedUserDetail.roleName,
                        designation: selectedUserDetail.designation || '',
                        password: '',
                      });
                      if (selectedUserDetail.roleName === 'Sub Super Admin') {
                        const base = createEmptyPermissions();
                        const userPerms = selectedUserDetail.permissions || {};
                        const seeded: Record<PermissionModuleKey, ModulePermission> = { ...base };
                        PERMISSION_MODULES.forEach((module) => {
                          const entry = userPerms[module.key];
                          if (entry?.access) {
                            seeded[module.key] = {
                              access: true,
                              permission: entry.permission === 'read' ? 'read' : 'write',
                            };
                          }
                        });
                        setEditPermissionState(seeded);
                      } else {
                        setEditPermissionState(createEmptyPermissions());
                      }
                      setShowEditUser(true);
                      // Keep detail modal open or close it? 
                      // User might want to see updated details. Let's keep it open, but edit modal is on top.
                    }}
                    disabled={!canManageUsers}
                    className="justify-start"
                  >
                    <IconPencil className="w-4 h-4 mr-2" />
                    Edit Details
                  </Button>
                </div>

                {canDeleteUsers && (
                  <Button
                    variant="outline" // Changed to outline but with red styling to match design system better for destructive in a list
                    onClick={() => {
                      if (window.confirm(`Delete ${selectedUserDetail.name}? This cannot be undone.`)) {
                        deleteUserMutation.mutate(selectedUserDetail._id);
                      }
                    }}
                    disabled={!canManageUsers}
                    className="justify-start border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 w-full mt-2"
                  >
                    <IconTrash className="w-4 h-4 mr-2" />
                    Delete User Permanently
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {showCreateUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <Card className="w-full max-w-4xl space-y-6 p-6 shadow-lg border border-slate-200 dark:border-slate-800 dark:shadow-none">
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
                <div className={isSubSuperAdmin ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : 'grid grid-cols-1 gap-4 sm:grid-cols-2'}>
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
                    label="Mobile Number"
                    name="mobileNumber"
                    type="tel"
                    value={formState.mobileNumber}
                    onChange={(event) => setFormState((prev) => ({ ...prev, mobileNumber: event.target.value }))}
                    placeholder="9876543210 (Optional)"
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
                      <option value="Student Counselor">Student Counselor</option>
                      <option value="Data Entry User">Data Entry User</option>
                      <option value="PRO">PRO</option>
                      <option value="Sub Super Admin">Sub Super Admin</option>
                      <option value="Super Admin">Super Admin</option>
                    </select>
                  </div>

                  {/* Designation field removed as per requirement */}
                </div>

                {isSubSuperAdmin && (
                  <div className="flex h-full flex-col gap-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-900/20 sm:col-span-2 lg:col-span-1">
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
                    setFormState({ name: '', email: '', mobileNumber: '', password: '', roleName: 'Student Counselor', designation: '' });
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

      {/* Edit User Modal */}
      {showEditUser && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <Card className="w-full max-w-4xl space-y-6 p-6 shadow-lg border border-slate-200 dark:border-slate-800 dark:shadow-none">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Edit User
              </h2>
              <button
                type="button"
                className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-500 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                onClick={() => {
                  setShowEditUser(false);
                  setEditingUser(null);
                }}
              >
                Close
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!canManageUsers || !editingUser) return;
                if (!editFormState.name || !editFormState.email) {
                  showToast.error('Please fill in name and email');
                  return;
                }

                const payload: Parameters<typeof userAPI.update>[1] = {
                  name: editFormState.name.trim(),
                  email: editFormState.email.trim(),
                  mobileNumber: editFormState.mobileNumber?.trim() || undefined,
                  roleName: editFormState.roleName,
                };

                if (editFormState.password) {
                  payload.password = editFormState.password;
                }

                // Designation logic removed
                if (editFormState.roleName === 'Student Counselor' || editFormState.roleName === 'Data Entry User') {
                  payload.designation = editFormState.designation?.trim() || undefined;
                }

                if (editFormState.roleName === 'Sub Super Admin') {
                  const selectedPermissions = Object.entries(editPermissionState).reduce(
                    (acc, [key, value]) => {
                      if (value.access) {
                        acc[key as PermissionModuleKey] = {
                          access: true,
                          permission: value.permission === 'read' ? 'read' : 'write',
                        };
                      }
                      return acc;
                    },
                    {} as Record<PermissionModuleKey, ModulePermission>
                  );

                  if (Object.keys(selectedPermissions).length === 0) {
                    showToast.error('Select at least one module to grant access');
                    return;
                  }

                  payload.permissions = selectedPermissions;
                }

                updateUserMutation.mutate({ userId: editingUser._id, data: payload });
              }}
              className="space-y-6"
            >
              <div
                className={
                  editFormState.roleName === 'Sub Super Admin'
                    ? 'grid gap-6 lg:grid-cols-[minmax(0,0.55fr)_minmax(0,0.45fr)]'
                    : 'space-y-4'
                }
              >
                <div
                  className={
                    editFormState.roleName === 'Sub Super Admin' ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : 'grid grid-cols-1 gap-4 sm:grid-cols-2'
                  }
                >
                  <Input
                    label="Full Name"
                    name="name"
                    value={editFormState.name}
                    onChange={(event) =>
                      setEditFormState((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder="Counsellor name"
                  />
                  <Input
                    label="Email Address"
                    name="email"
                    type="email"
                    value={editFormState.email}
                    onChange={(event) =>
                      setEditFormState((prev) => ({ ...prev, email: event.target.value }))
                    }
                    placeholder="name@college.com"
                  />
                  <Input
                    label="Mobile Number"
                    name="mobileNumber"
                    type="tel"
                    value={editFormState.mobileNumber || ''}
                    onChange={(event) =>
                      setEditFormState((prev) => ({ ...prev, mobileNumber: event.target.value }))
                    }
                    placeholder="mobile number"
                  />
                  <Input
                    label="New Password"
                    name="password"
                    type="password"
                    value={editFormState.password || ''}
                    onChange={(event) =>
                      setEditFormState((prev) => ({ ...prev, password: event.target.value }))
                    }
                    placeholder="Leave blank to keep current"
                  />
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                      Role
                    </label>
                    <select
                      value={editFormState.roleName}
                      onChange={(event) => handleEditRoleChange(event.target.value)}
                      className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                    >
                      <option value="Student Counselor">Student Counselor</option>
                      <option value="Data Entry User">Data Entry User</option>
                      <option value="PRO">PRO</option>
                      <option value="Sub Super Admin">Sub Super Admin</option>
                      <option value="Super Admin">Super Admin</option>
                    </select>
                  </div>

                  {/* Designation field removed as per requirement */}
                </div>

                {editFormState.roleName === 'Sub Super Admin' && (
                  <div className="flex h-full flex-col gap-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-900/20 sm:col-span-2 lg:col-span-1">
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                        Module Permissions
                      </h3>
                      <p className="text-xs text-blue-700/80 dark:text-blue-200/70">
                        Select which super admin modules this sub super admin can access, and
                        whether they can edit them.
                      </p>
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto pr-1 max-h-[60vh]">
                      {PERMISSION_MODULES.map((module) => {
                        const moduleState = editPermissionState[module.key];
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
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {module.description}
                                </p>
                              </div>
                              <label className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                  checked={moduleState.access}
                                  onChange={() =>
                                    setEditPermissionState((prev) => ({
                                      ...prev,
                                      [module.key]: {
                                        access: !prev[module.key].access,
                                        permission: prev[module.key].access
                                          ? prev[module.key].permission
                                          : 'read',
                                      },
                                    }))
                                  }
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
                                    onClick={() =>
                                      setEditPermissionState((prev) => ({
                                        ...prev,
                                        [module.key]: {
                                          ...prev[module.key],
                                          permission: 'read',
                                        },
                                      }))
                                    }
                                  >
                                    Read Only
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={moduleState.permission === 'write' ? 'primary' : 'outline'}
                                    onClick={() =>
                                      setEditPermissionState((prev) => ({
                                        ...prev,
                                        [module.key]: {
                                          ...prev[module.key],
                                          permission: 'write',
                                        },
                                      }))
                                    }
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
                    setShowEditUser(false);
                    setEditingUser(null);
                  }}
                  disabled={updateUserMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={updateUserMutation.isPending || !canManageUsers}
                >
                  {updateUserMutation.isPending ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Team Assignment Modal */}
      {showTeamAssignmentModal && selectedUserForAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
          <Card className="w-full max-w-md space-y-6 p-6 shadow-lg border border-slate-200 dark:border-slate-800 dark:shadow-none">
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
    <Link href={`/superadmin/users/team/${manager._id}`}>
      <Card className="p-4 border-2 border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600 transition-colors cursor-pointer">
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
        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium text-center">
            Click to view team analytics →
          </p>
        </div>
      </Card>
    </Link>
  );
};

export default UserManagementPage;
