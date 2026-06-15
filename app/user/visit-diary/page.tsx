'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth } from 'date-fns';
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
import {
  VISIT_DIARY_OUTCOME_OPTIONS_PRO,
  initialVisitDiaryQueueStatus,
  isValidVisitDiaryOutcome,
} from '@/lib/visitDiaryOutcomes';
import { 
  Calendar, 
  Search, 
  ChevronDown, 
  History, 
  Phone,
  FileText
} from 'lucide-react';

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
  const [historyStartDate, setHistoryStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [historyEndDate, setHistoryEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
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

  // Tab 2: History - Fetch visits for the selected date range using analytics API
  const { data: historyAnalytics, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['visit-history-range', historyStartDate, historyEndDate, user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      return await leadAPI.getUserAnalytics({
        startDate: historyStartDate,
        endDate: historyEndDate,
        userId: user.id,
        visitDiaryOnly: true,
      });
    },
    enabled: activeTab === 'history' && !!user?.id,
  });

  const historyData = useMemo(() => {
    const proUser = historyAnalytics?.users?.[0];
    return proUser?.visitDiaryUpdates || [];
  }, [historyAnalytics]);

  const visitStatusOptions = [...VISIT_DIARY_OUTCOME_OPTIONS_PRO];

  const batchSaveMutation = useMutation({
    mutationFn: async () => {
      if (queuedLeads.length === 0) return;
      if (queuedLeads.some((i) => !isValidVisitDiaryOutcome(i.status, visitStatusOptions))) {
        throw new Error('Please select a Visit Outcome for every queued lead.');
      }
      const promises = queuedLeads.map(item => 
        leadAPI.addActivity(item.lead._id, {
          newStatus: item.status,
          statusChannel: 'visit_status',
          type: 'status_change',
          visitDate: selectedDate,
          comment: `Visit outcome recorded via Visit Diary for date: ${format(new Date(selectedDate + 'T12:00:00'), 'MMM d, yyyy')}`
        })
      );
      return await Promise.all(promises);
    },
    onSuccess: () => {
      showToast.success(`Successfully recorded ${queuedLeads.length} outcomes`);
      queryClient.invalidateQueries({ queryKey: ['visit-diary-search'] });
      queryClient.invalidateQueries({ queryKey: ['visit-history'] });
      queryClient.invalidateQueries({ queryKey: ['visit-history-range'] });
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
      return [...prev, { lead, status: initialVisitDiaryQueueStatus(lead.visitStatus, visitStatusOptions) }];
    });
  };

  const updateQueuedStatus = (leadId: string, status: string) => {
    setQueuedLeads(prev => prev.map(item => 
      item.lead._id === leadId ? { ...item, status } : item
    ));
  };

  if (!isMounted || !user) return null;

  return (
    <div className="w-[calc(100%+1.5rem)] -mx-3 sm:mx-auto sm:w-full max-w-2xl pb-24 px-0 sm:px-2">
      {/* Sticky Tab Switcher */}
      <div className="sticky top-0 z-20 bg-gray-50/95 dark:bg-slate-950/95 backdrop-blur-sm py-2 mb-3 px-3 sm:px-0">
        <div className="flex p-1 bg-slate-200/50 dark:bg-slate-800/50 rounded-xl shadow-sm">
          <button
            onClick={() => setActiveTab('record')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs sm:gap-2 sm:py-2.5 sm:text-sm font-bold rounded-lg transition-all",
              activeTab === 'record' 
                ? "bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm" 
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            Record Visit
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 text-xs sm:gap-2 sm:py-2.5 sm:text-sm font-bold rounded-lg transition-all",
              activeTab === 'history' 
                ? "bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm" 
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            History
          </button>
        </div>
      </div>

      {activeTab === 'record' ? (
        <div className="space-y-4 px-3 sm:px-0 animate-in fade-in slide-in-from-left-2 duration-300">
          {/* Date Selection */}
          <Card className="p-3 sm:p-4 shadow-sm border-slate-200 dark:border-slate-800">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">
              Visit Date
            </label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full h-10 sm:h-11 rounded-xl focus:ring-orange-500 border-slate-200 text-sm"
            />
          </Card>

          {/* Search Card */}
          <Card className="p-3 sm:p-4 shadow-sm border-slate-200 dark:border-slate-800">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">
              Search & Add Student
            </label>
            <div className="relative mb-0">
              <Input
                type="text"
                placeholder="Name, phone or enquiry..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-10 sm:h-11 pl-10 rounded-xl focus:ring-orange-500 border-slate-200 text-sm"
              />
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Search className="w-4 h-4" />
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
                      value={item.status || ''}
                      onChange={(e) => updateQueuedStatus(item.lead._id, e.target.value)}
                    >
                      <option value="" disabled>
                        Select visit outcome…
                      </option>
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
          {/* History Filters */}
          <Card className="rounded-none sm:rounded-xl border-x-0 sm:border-x p-3 sm:p-4 shadow-sm border-slate-200 dark:border-slate-800">
            <div className="flex flex-col gap-3">
              <label className="hidden sm:block text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 sm:px-1">
                History Range
              </label>
              <div className="grid grid-cols-2 gap-2 px-3 sm:px-0">
                <div className="space-y-1">
                  <span className="text-[8px] font-bold text-slate-400 ml-1 uppercase tracking-tighter">From</span>
                  <Input
                    type="date"
                    value={historyStartDate}
                    onChange={(e) => setHistoryStartDate(e.target.value)}
                    className="h-9 sm:h-10 rounded-xl border-slate-200 text-xs focus:ring-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] font-bold text-slate-400 ml-1 uppercase tracking-tighter">To</span>
                  <Input
                    type="date"
                    value={historyEndDate}
                    onChange={(e) => setHistoryEndDate(e.target.value)}
                    className="h-9 sm:h-10 rounded-xl border-slate-200 text-xs focus:ring-orange-500"
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* History List - Grouped Style */}
          <div className="space-y-0 sm:space-y-3">
            {isHistoryLoading ? (
              <div className="space-y-0 sm:space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-none sm:rounded-2xl" />)}
              </div>
            ) : historyData && historyData.length > 0 ? (
              <div className="space-y-0 sm:space-y-3 divide-y divide-slate-200 dark:divide-slate-800 sm:divide-y-0">
                {historyData.map((day: any) => {
                  const dayKey = `pro-day-${day.date}`;
                  const isExpanded = expandedRows.has(dayKey);

                  return (
                    <Card key={day.date} className="overflow-hidden rounded-none sm:rounded-xl border-x-0 sm:border-x border-t-0 sm:border-t border-slate-200 dark:border-slate-800 shadow-none sm:shadow-sm">
                      <div 
                        className="bg-white dark:bg-slate-900 px-3 sm:px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                        onClick={() => {
                          const next = new Set(expandedRows);
                          if (next.has(dayKey)) next.delete(dayKey);
                          else next.add(dayKey);
                          setExpandedRows(next);
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                              {format(new Date(day.date + 'T12:00:00'), 'dd MMM yyyy')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4">
                          <div className="sm:hidden">
                             <span className="bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full text-[10px] font-bold">
                               {day.details?.length || 0} Visits
                             </span>
                          </div>
                          <div className="hidden sm:flex flex-wrap justify-end gap-1.5 max-w-[200px]">
                            {Object.entries(day.statusCounts || {}).map(([status, count]) => (
                              <span 
                                key={status}
                                className={cn(
                                  "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border",
                                  status === 'Interested' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                  status === 'Not Interested' ? "bg-red-50 text-red-700 border-red-100" :
                                  "bg-slate-50 text-slate-600 border-slate-100"
                                )}
                              >
                                {status}: {count as number}
                              </span>
                            ))}
                          </div>
                          <ChevronDown className={cn("w-4 h-4 sm:w-5 sm:h-5 text-slate-300 transition-transform", isExpanded && "rotate-180")} />
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30 p-0 sm:p-2 space-y-0 sm:space-y-2 divide-y divide-slate-100 dark:divide-slate-800 sm:divide-y-0">
                          {(day.details || []).map((lead: any, lIdx: number) => (
                            <div 
                              key={lIdx} 
                              className="bg-white dark:bg-slate-900 px-3 py-3 sm:p-3 sm:rounded-xl border-0 sm:border border-slate-100 dark:border-slate-800 shadow-none sm:shadow-sm flex items-center justify-between gap-2 sm:gap-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{lead.name}</p>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                    <Phone className="w-2.5 h-2.5" />
                                    {lead.phone}
                                    <span className="ml-2 text-slate-400">•</span>
                                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                                      {lead.visitStatus}
                                    </span>
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="py-20 text-center px-3 sm:px-0">
                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-8 h-8 text-slate-300" />
                </div>
                <h4 className="text-slate-400 font-medium">No visits found for this period.</h4>
                <p className="text-xs text-slate-500 mt-1">Adjust the dates or record a new visit outcome.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
