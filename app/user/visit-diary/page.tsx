'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { auth } from '@/lib/auth';
import { leadAPI } from '@/lib/api';
import { Lead } from '@/types';
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

export default function VisitDiaryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(auth.getUser());
  const [activeTab, setActiveTab] = useState<TabType>('record');
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [queuedLeads, setQueuedLeads] = useState<QueuedLead[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  
  const { setHeaderContent, clearHeaderContent, setMobileTopBar, clearMobileTopBar } = useDashboardHeader();

  useEffect(() => {
    setIsMounted(true);
    const currentUser = auth.getUser();
    if (!currentUser) {
      router.push('/auth/login');
      return;
    }
    if (currentUser.roleName !== 'PRO' && currentUser.roleName !== 'Super Admin') {
      router.push('/user/dashboard');
      return;
    }
    setUser(currentUser);
  }, [router]);

  useEffect(() => {
    setHeaderContent(
      <div className="flex flex-col items-end gap-1 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Visit Diary</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Manage field visits and history
        </p>
      </div>
    );
    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent]);

  useEffect(() => {
    setMobileTopBar({ title: 'Visit Diary', iconKey: 'book' });
    return () => clearMobileTopBar();
  }, [setMobileTopBar, clearMobileTopBar]);

  // Tab 1: Record Visit - Search for leads
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ['visit-diary-search', search],
    queryFn: async () => {
      if (!search.trim() || search.trim().length < 2) return [];
      const response = await leadAPI.getAll({
        search: search.trim(),
        limit: 8,
        page: 1
      });
      return response.data?.leads || response.leads || [];
    },
    enabled: activeTab === 'record' && search.trim().length >= 2,
  });

  // Tab 2: History - Fetch visits for the selected date
  const { data: historyLeads, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['visit-history', selectedDate],
    queryFn: async () => {
      // Using the recently optimized assignment details API which returns leads for a specific date
      const response = await leadAPI.getAssignmentDetailsByDate(selectedDate);
      return response || [];
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
          comment: `Visit outcome recorded via Visit Diary for date: ${format(new Date(selectedDate + 'T12:00:00'), 'MMM d, yyyy')}`
        })
      );
      return await Promise.all(promises);
    },
    onSuccess: () => {
      showToast.success(`Successfully recorded ${queuedLeads.length} outcomes`);
      queryClient.invalidateQueries({ queryKey: ['visit-diary-search'] });
      queryClient.invalidateQueries({ queryKey: ['visit-history'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setQueuedLeads([]);
      setSearch('');
      setActiveTab('history'); // Switch to history to see the updates
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

  if (!isMounted || !user) return null;

  return (
    <div className="mx-auto w-full max-w-2xl pb-24 px-0 sm:px-2">
      {/* Sticky Tab Switcher */}
      <div className="sticky top-0 z-20 bg-gray-50/95 dark:bg-slate-950/95 backdrop-blur-sm py-2 mb-4">
        <div className="flex p-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl">
          <button
            onClick={() => setActiveTab('record')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all",
              activeTab === 'record' 
                ? "bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm" 
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Record Visit
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all",
              activeTab === 'history' 
                ? "bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm" 
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/></svg>
            History
          </button>
        </div>
      </div>

      {activeTab === 'record' ? (
        <div className="space-y-4 animate-in fade-in slide-in-from-left-2 duration-300">
          {/* Date Selection */}
          <Card className="p-4 shadow-sm border-slate-200 dark:border-slate-800">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Visit Date
            </label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full h-11 rounded-xl focus:ring-orange-500 border-slate-200"
            />
          </Card>

          {/* Search Card */}
          <Card className="p-4 shadow-sm border-slate-200 dark:border-slate-800">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              Search & Add Student
            </label>
            <div className="relative mb-4">
              <Input
                type="text"
                placeholder="Name, phone or enquiry..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-11 pl-10 rounded-xl focus:ring-orange-500 border-slate-200"
              />
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              </div>
            </div>

            {isSearching ? (
              <div className="space-y-2">
                {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
              </div>
            ) : search.trim().length >= 2 && searchResults && searchResults.length > 0 ? (
              <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                {searchResults.map((lead: Lead) => {
                  const isQueued = queuedLeads.some(item => item.lead._id === lead._id);
                  return (
                    <button
                      key={lead._id}
                      onClick={() => handleToggleLead(lead)}
                      className={cn(
                        "w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3",
                        isQueued ? "border-orange-500 bg-orange-50 dark:bg-orange-900/10 shadow-sm" : "border-slate-100 dark:border-slate-800"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{lead.name}</p>
                        <p className="text-[10px] text-slate-500 truncate">{lead.phone} • {lead.village}</p>
                      </div>
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0",
                        isQueued ? "bg-orange-500 border-orange-500 text-white" : "border-slate-200 dark:border-slate-700"
                      )}>
                        {isQueued && <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : search.trim().length >= 2 ? (
              <p className="text-center py-4 text-xs text-slate-400 italic">No students found.</p>
            ) : null}
          </Card>

          {/* Queue Section */}
          {queuedLeads.length > 0 && (
            <Card className="p-4 shadow-xl border-orange-200 dark:border-orange-900/30 bg-orange-50/20 dark:bg-orange-900/5 animate-in slide-in-from-bottom-4 duration-300">
              <div className="flex items-center justify-between mb-4 border-b border-orange-100 dark:border-orange-900/20 pb-2">
                <h3 className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest">
                  Visit Queue ({queuedLeads.length})
                </h3>
                <button onClick={() => setQueuedLeads([])} className="text-[10px] text-slate-400 underline">Clear</button>
              </div>
              
              <div className="space-y-3 mb-6 max-h-[350px] overflow-y-auto pr-1">
                {queuedLeads.map((item) => (
                  <div key={item.lead._id} className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden">
                    <div className="flex justify-between items-start mb-2 pr-6">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.lead.name}</p>
                        <p className="text-[10px] text-slate-500">{item.lead.phone}</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleToggleLead(item.lead)}
                      className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-red-400"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                    <select
                      className="w-full h-10 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-xs px-2 focus:ring-1 focus:ring-orange-500 border-none"
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

              <Button 
                onClick={() => batchSaveMutation.mutate()}
                disabled={batchSaveMutation.isPending}
                className="w-full h-14 bg-orange-600 hover:bg-orange-700 text-white rounded-2xl font-bold shadow-lg shadow-orange-600/30 text-base"
              >
                {batchSaveMutation.isPending ? 'Saving...' : `Save ${queuedLeads.length} Visit Outcomes`}
              </Button>
            </Card>
          )}

          {queuedLeads.length === 0 && (
            <div className="py-12 text-center opacity-60">
              <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </div>
              <p className="text-xs text-slate-500">Search students to start recording visits.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
          {/* History Filter */}
          <Card className="p-4 shadow-sm border-slate-200 dark:border-slate-800">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
              View Visits for Date
            </label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full h-11 rounded-xl border-slate-200 focus:ring-orange-500"
            />
          </Card>

          {/* History List */}
          <div className="space-y-3">
            {isHistoryLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
              </div>
            ) : historyLeads && historyLeads.length > 0 ? (
              <div className="grid gap-3">
                {historyLeads.map((lead: Lead) => (
                  <Card key={lead._id} className="p-4 border-slate-100 dark:border-slate-800 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-orange-500/50 group-hover:bg-orange-500 transition-colors" />
                    <div className="flex justify-between items-start mb-3 pl-1">
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 dark:text-white truncate">{lead.name}</h4>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 mt-1">
                          <span className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            {lead.phone}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                            {lead.village}
                          </span>
                        </div>
                      </div>
                      <div className={cn(
                        "px-2 py-1 rounded text-[10px] font-bold uppercase",
                        lead.visitStatus === 'Interested' ? "bg-emerald-100 text-emerald-700" :
                        lead.visitStatus === 'Not Interested' ? "bg-red-100 text-red-700" :
                        "bg-slate-100 text-slate-600"
                      )}>
                        {lead.visitStatus || 'Assigned'}
                      </div>
                    </div>
                    
                    {/* Quick update option directly in history if needed */}
                    <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50 dark:border-slate-800">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 h-8 text-[10px] rounded-lg"
                        onClick={() => {
                          handleToggleLead(lead);
                          setActiveTab('record');
                        }}
                      >
                        Edit Outcome
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="flex-1 h-8 text-[10px] rounded-lg"
                        onClick={() => router.push(`/user/leads/${lead._id}`)}
                      >
                        View Profile
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center">
                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-300"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
                </div>
                <h4 className="text-slate-400 font-medium">No visits found for this date.</h4>
                <p className="text-xs text-slate-500 mt-1">Record a visit outcome to see it in history.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
