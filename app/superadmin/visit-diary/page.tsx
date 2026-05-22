'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { auth } from '@/lib/auth';
import { leadAPI, userAPI } from '@/lib/api';
import { Lead, User } from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { showToast } from '@/lib/toast';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import { cn } from '@/lib/utils';

interface QueuedLead {
  lead: Lead;
  status: string;
}

type TabType = 'record' | 'history';

export default function SuperAdminVisitDiaryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('record');
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedProId, setSelectedProId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [queuedLeads, setQueuedLeads] = useState<QueuedLead[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  
  const { setHeaderContent, clearHeaderContent, setMobileTopBar, clearMobileTopBar } = useDashboardHeader();

  useEffect(() => {
    setIsMounted(true);
    const user = auth.getUser();
    if (!user || (user.roleName !== 'Super Admin' && user.roleName !== 'Sub Super Admin')) {
      router.push('/user/dashboard');
    }
  }, [router]);

  useEffect(() => {
    setHeaderContent(
      <div className="flex flex-col items-end gap-1 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Visit Diary Management</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Record and track field visits for PROs
        </p>
      </div>
    );
    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent]);

  useEffect(() => {
    setMobileTopBar({ title: 'Visit Diary', iconKey: 'book' });
    return () => clearMobileTopBar();
  }, [setMobileTopBar, clearMobileTopBar]);

  // Fetch all PROs
  const { data: pros, isLoading: isProsLoading } = useQuery({
    queryKey: ['pros'],
    queryFn: async () => {
      const response = await userAPI.getAll();
      const users = Array.isArray(response) ? response : (response.data || []);
      return users.filter((u: User) => u.roleName === 'PRO');
    },
  });

  // Search for leads - Filter by selected PRO if recording
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['visit-diary-search', search, selectedProId],
    queryFn: async () => {
      if (!search.trim() || search.trim().length < 2) return [];
      const params: any = {
        search: search.trim(),
        limit: 10,
        page: 1
      };
      if (selectedProId) {
        params.assignedTo = selectedProId;
      }
      const response = await leadAPI.getAll(params);
      return response.data?.leads || response.leads || [];
    },
    enabled: activeTab === 'record' && search.trim().length >= 2,
  });

  // Fetch history for selected date and PRO
  const { data: historyLeads, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['visit-history-admin', selectedDate, selectedProId],
    queryFn: async () => {
      // If we have a selectedProId, we might want to filter assignment details
      // Note: getAssignmentDetailsByDate currently returns current user's history in backend.
      // We might need a Super Admin version or pass userId to it.
      // Let's assume we can pass userId or have a separate endpoint.
      // For now, I'll use a generic analytics query if needed, but the user said "history" like in user dashboard.
      const response = await leadAPI.getUserAnalytics({
        startDate: selectedDate,
        endDate: selectedDate,
        userId: selectedProId || undefined,
        visitDiaryOnly: true,
      });
      
      const users = response?.users || [];
      if (selectedProId) {
        const proData = users.find((u: any) => (u.id || u.userId) === selectedProId);
        return proData?.visitDiaryUpdates || [];
      }
      
      return users.flatMap((u: any) =>
        (u.visitDiaryUpdates || []).map((day: any) => ({
          ...day,
          proName: u.name || u.userName,
        }))
      );
    },
    enabled: activeTab === 'history',
  });

  const visitStatusOptions = [
    'Assigned',
    'Interested',
    'Not Interested',
    'Not Available',
    'Scheduled Revisit',
    'Wrong Data',
    'Confirmed',
  ];

  const batchSaveMutation = useMutation({
    mutationFn: async () => {
      if (queuedLeads.length === 0) return;
      const promises = queuedLeads.map(item => 
        leadAPI.addActivity(item.lead._id, {
          newStatus: item.status,
          type: 'status_change',
          visitDate: selectedDate,
          comment: `Visit outcome recorded by Admin via Visit Diary for date: ${format(new Date(selectedDate + 'T12:00:00'), 'MMM d, yyyy')}`
        })
      );
      return await Promise.all(promises);
    },
    onSuccess: () => {
      showToast.success(`Successfully recorded ${queuedLeads.length} outcomes`);
      queryClient.invalidateQueries({ queryKey: ['visit-diary-search'] });
      queryClient.invalidateQueries({ queryKey: ['visit-history-admin'] });
      setQueuedLeads([]);
      setSearch('');
    },
    onError: (error: any) => {
      showToast.error(error.response?.data?.message || 'Failed to save visit outcomes');
    }
  });

  const handleToggleLead = (lead: Lead) => {
    setQueuedLeads(prev => {
      const exists = prev.find(item => item.lead._id === lead._id);
      if (exists) return prev.filter(item => item.lead._id !== lead._id);
      return [...prev, { lead, status: lead.visitStatus || 'Assigned' }];
    });
  };

  const updateQueuedStatus = (leadId: string, status: string) => {
    setQueuedLeads(prev => prev.map(item => 
      item.lead._id === leadId ? { ...item, status } : item
    ));
  };

  if (!isMounted) return null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 pb-24 px-0 sm:px-2">
      {/* Tabs */}
      <div className="sticky top-0 z-20 bg-gray-50/95 dark:bg-slate-950/95 backdrop-blur-sm py-2">
        <div className="flex p-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl">
          <button
            onClick={() => { setActiveTab('record'); setQueuedLeads([]); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all",
              activeTab === 'record' 
                ? "bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm" 
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            Record Visit
          </button>
          <button
            onClick={() => { setActiveTab('history'); setQueuedLeads([]); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all",
              activeTab === 'history' 
                ? "bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm" 
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            History & Reports
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Sidebar - Pro Selection */}
        <div className="md:col-span-1 space-y-4">
          <Card className="p-4 shadow-sm border-slate-200 dark:border-slate-800">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
              Select PRO
            </label>
            <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
              <button
                onClick={() => setSelectedProId('')}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-lg text-sm transition-all",
                  selectedProId === '' 
                    ? "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-bold" 
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                )}
              >
                All PROs
              </button>
              {isProsLoading ? (
                Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg mb-1" />)
              ) : pros?.map((pro: User) => (
                <button
                  key={pro._id}
                  onClick={() => setSelectedProId(pro._id)}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-lg text-sm transition-all",
                    selectedProId === pro._id 
                      ? "bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-bold border-l-2 border-orange-500" 
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  )}
                >
                  <p className="truncate">{pro.name}</p>
                  <p className="text-[10px] opacity-60 truncate">{pro.email}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4 shadow-sm border-slate-200 dark:border-slate-800">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Visit Date
            </label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full h-10 rounded-xl"
            />
          </Card>
        </div>

        {/* Main Content Area */}
        <div className="md:col-span-2 space-y-4">
          {activeTab === 'record' ? (
            <div className="space-y-4">
              {!selectedProId ? (
                <div className="py-20 text-center bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800">
                  <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                  <h3 className="text-slate-900 dark:text-white font-bold">No PRO Selected</h3>
                  <p className="text-xs text-slate-500 mt-1">Please select a PRO from the sidebar to record visits on their behalf.</p>
                </div>
              ) : (
                <>
                  <Card className="p-4 shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center text-orange-600 font-bold">
                        {pros?.find((p: any) => p._id === selectedProId)?.name?.slice(0, 1)}
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Recording visits for:</p>
                        <p className="text-sm font-bold">{pros?.find((p: any) => p._id === selectedProId)?.name}</p>
                      </div>
                    </div>

                    <div className="relative">
                      <Input
                        type="text"
                        placeholder="Search student assigned to this PRO..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full h-11 pl-10 rounded-xl"
                      />
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                      </div>
                    </div>

                    {isSearching ? (
                      <div className="space-y-2 mt-4">
                        {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                      </div>
                    ) : search.trim().length >= 2 && searchResults && searchResults.length > 0 ? (
                      <div className="space-y-2 mt-4 max-h-[300px] overflow-y-auto pr-1">
                        {searchResults.map((lead: Lead) => {
                          const isQueued = queuedLeads.some(item => item.lead._id === lead._id);
                          return (
                            <button
                              key={lead._id}
                              onClick={() => handleToggleLead(lead)}
                              className={cn(
                                "w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3",
                                isQueued ? "border-orange-500 bg-orange-50 dark:bg-orange-900/10" : "border-slate-100 dark:border-slate-800"
                              )}
                            >
                              <div className="min-w-0">
                                <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{lead.name}</p>
                                <p className="text-[10px] text-slate-500 truncate">{lead.phone} • {lead.village}</p>
                              </div>
                              <div className={cn(
                                "w-5 h-5 rounded-full border-2 flex items-center justify-center",
                                isQueued ? "bg-orange-500 border-orange-500 text-white" : "border-slate-200 dark:border-slate-700"
                              )}>
                                {isQueued && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </Card>

                  {queuedLeads.length > 0 && (
                    <Card className="p-4 shadow-xl border-orange-200 bg-orange-50/20 animate-in slide-in-from-bottom-4">
                      <h3 className="text-xs font-bold text-orange-600 uppercase tracking-widest mb-4">Queue ({queuedLeads.length})</h3>
                      <div className="space-y-3 mb-6">
                        {queuedLeads.map((item) => (
                          <div key={item.lead._id} className="p-3 rounded-xl bg-white border border-slate-100 shadow-sm flex flex-col gap-2">
                            <div className="flex justify-between">
                              <p className="text-sm font-bold truncate">{item.lead.name}</p>
                              <button onClick={() => handleToggleLead(item.lead)} className="text-slate-300 hover:text-red-500">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                              </button>
                            </div>
                            <select
                              className="w-full h-10 rounded-lg bg-slate-50 text-xs px-2 border-none"
                              value={item.status}
                              onChange={(e) => updateQueuedStatus(item.lead._id, e.target.value)}
                            >
                              {visitStatusOptions.map(status => (
                                <option key={status} value={status}>{status}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                      <Button onClick={() => batchSaveMutation.mutate()} disabled={batchSaveMutation.isPending} className="w-full h-12 bg-orange-600 text-white rounded-xl font-bold">
                        {batchSaveMutation.isPending ? 'Saving...' : `Save ${queuedLeads.length} Outcomes`}
                      </Button>
                    </Card>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {isHistoryLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
                </div>
              ) : historyLeads && historyLeads.length > 0 ? (
                <div className="grid gap-3">
                  {historyLeads.map((lead: any) => (
                    <Card key={lead._id} className="p-4 border-slate-100 shadow-sm flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-slate-900 truncate">{lead.name}</h4>
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
                            lead.visitStatus === 'Interested' ? "bg-emerald-100 text-emerald-700" :
                            lead.visitStatus === 'Not Interested' ? "bg-red-100 text-red-700" :
                            "bg-slate-100 text-slate-600"
                          )}>
                            {lead.visitStatus || 'Assigned'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500">{lead.phone} • {lead.village}</p>
                        {!selectedProId && (
                          <p className="text-[10px] text-orange-600 font-medium mt-1">PRO: {lead.proName}</p>
                        )}
                      </div>
                      <Button variant="ghost" size="sm" className="h-8 text-[10px]" onClick={() => router.push(`/superadmin/leads/${lead._id}`)}>
                        Details
                      </Button>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center text-slate-400 italic bg-slate-50 rounded-2xl">
                  No visits recorded for this selection.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
