'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { leadAPI, userAPI } from '@/lib/api';
import { User, FilterOptions } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { showToast } from '@/lib/toast';
import { useDashboardHeader } from '@/components/layout/DashboardShell';

export default function AssignLeadsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [filters, setFilters] = useState<FilterOptions | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [mandal, setMandal] = useState('');
  const [state, setState] = useState('');
  const [count, setCount] = useState(1000);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const user = auth.getUser();
    if (!user) {
      router.push('/auth/login');
      return;
    }
    if (user.roleName !== 'Super Admin' && user.roleName !== 'Sub Super Admin') {
      router.push('/user/dashboard');
      return;
    }
    setCurrentUser(user);
    setIsReady(true);
  }, [router]);

  useEffect(() => {
    if (!currentUser) return;

    const load = async () => {
      try {
        const [usersResponse, filtersResponse] = await Promise.all([
          userAPI.getAll(),
          leadAPI.getFilterOptions(),
        ]);
        setUsers(usersResponse.data || usersResponse);
        setFilters(filtersResponse.data || filtersResponse);
      } catch (error) {
        console.error('Failed to load assign-leads data:', error);
        showToast.error('Unable to load counsellors or filters.');
      }
    };

    load();
  }, [currentUser]);

  const assignMutation = useMutation({
    mutationFn: async (payload: { userId: string; mandal?: string; state?: string; count: number }) =>
      leadAPI.assignLeads(payload),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      const assignedCount = response.data?.assigned || response.assigned || 0;
      const userName = response.data?.userName || 'user';
      showToast.success(`Assigned ${assignedCount} leads to ${userName}`);
      setSelectedUserId('');
      setMandal('');
      setState('');
      setCount(1000);
    },
    onError: (error: any) => {
      console.error('Assign leads error:', error);
      showToast.error(error.response?.data?.message || 'Failed to assign leads');
    },
  });

  const handleAssign = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedUserId) {
      showToast.error('Select a user to assign leads.');
      return;
    }
    if (count <= 0) {
      showToast.error('Count must be greater than zero.');
      return;
    }

    assignMutation.mutate({
      userId: selectedUserId,
      mandal: mandal || undefined,
      state: state || undefined,
      count,
    });
  };

  const header = useMemo(
    () => (
      <div className="flex flex-col items-end gap-2 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Assign Leads</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Distribute unassigned leads to counsellors using mandal and state filters.
        </p>
      </div>
    ),
    []
  );

  useEffect(() => {
    setHeaderContent(header);
    return () => clearHeaderContent();
  }, [header, setHeaderContent, clearHeaderContent]);

  if (!isReady || !currentUser) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-sm text-gray-600 dark:text-slate-300">Loading…</p>
        </div>
      </div>
    );
  }

  const counsellors = users.filter((u) => u.roleName === 'User' && u.isActive);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Card>
        <h2 className="mb-6 text-xl font-semibold dark:text-slate-100">Assign Leads</h2>
        <form onSubmit={handleAssign} className="space-y-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Select User *</label>
            <select
              className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              required
            >
              <option value="">Choose a user…</option>
              {counsellors.map((user) => (
                <option key={user._id} value={user._id}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Mandal (optional)</label>
              <select
                className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                value={mandal}
                onChange={(event) => setMandal(event.target.value)}
              >
                <option value="">All Mandals</option>
                {filters?.mandals?.map((mandalOption) => (
                  <option key={mandalOption} value={mandalOption}>
                    {mandalOption}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Leave blank to assign from every mandal.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">State (optional)</label>
              <select
                className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                value={state}
                onChange={(event) => setState(event.target.value)}
              >
                <option value="">All States</option>
                {filters?.states?.map((stateOption) => (
                  <option key={stateOption} value={stateOption}>
                    {stateOption}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">Number of leads *</label>
            <Input
              type="number"
              min={1}
              max={5000}
              value={count}
              onChange={(event) => setCount(Number(event.target.value))}
              required
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={assignMutation.isPending || !selectedUserId}>
              {assignMutation.isPending ? 'Assigning…' : 'Assign Leads'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSelectedUserId('');
                setMandal('');
                setState('');
                setCount(1000);
              }}
              disabled={assignMutation.isPending}
            >
              Reset
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

