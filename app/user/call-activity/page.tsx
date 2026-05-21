'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download } from 'lucide-react';
import { auth } from '@/lib/auth';
import { leadAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/Dialog';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import { formatSecondsToMMSS, cn } from '@/lib/utils';

const defaultStart = format(subDays(new Date(), 30), 'yyyy-MM-dd');
const defaultEnd = format(new Date(), 'yyyy-MM-dd');

const STATS_CARD_STYLES = [
  'from-emerald-500 to-teal-600 shadow-emerald-500/25',   // Total calls
  'from-violet-500 to-purple-600 shadow-violet-500/25',   // Total SMS
  'from-orange-500 to-amber-600 shadow-orange-500/25',     // Status changes
  'from-blue-500 to-indigo-600 shadow-blue-500/25',       // Assigned leads
];

const setQuickRange = (days: number): [string, string] => {
  const end = new Date();
  const start = subDays(end, days - 1);
  return [format(start, 'yyyy-MM-dd'), format(end, 'yyyy-MM-dd')];
};

export default function UserCallActivityPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);

  const { setHeaderContent, clearHeaderContent, setMobileTopBar, clearMobileTopBar } = useDashboardHeader();

  useEffect(() => {
    const currentUser = auth.getUser();
    setUser(currentUser);
    setMobileTopBar({ title: currentUser?.roleName === 'PRO' ? 'Activity' : 'My call activity', iconKey: 'analytics' });
    return () => clearMobileTopBar();
  }, [setMobileTopBar, clearMobileTopBar]);

  useEffect(() => {
    const user = auth.getUser();
    if (!user) {
      router.replace('/auth/login');
      return;
    }
    if (user.roleName === 'Super Admin' || user.roleName === 'Sub Super Admin') {
      router.replace('/superadmin/dashboard');
      return;
    }
  }, [router]);

  useEffect(() => {
    setHeaderContent(
      <div className="flex flex-col items-end gap-1 sm:gap-2 text-right">
        <h1 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">
          {user?.roleName === 'PRO' ? 'Activity' : 'My call activity'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          {user?.roleName === 'PRO'
            ? 'Summary of leads and status changes.'
            : 'Calls, SMS, and status changes for the selected date range.'}
        </p>
        <div className="flex items-center gap-2 mt-1 sm:mt-2">
          <Button size="sm" variant="outline" onClick={() => router.push('/user/dashboard')} className="!text-[10px] !py-1 !px-2 !min-h-7 sm:!min-h-0 sm:!text-xs sm:!py-1.5 sm:!px-2.5">
            Back to dashboard
          </Button>
        </div>
      </div>
    );
    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent, router, user?.roleName]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['my-call-analytics', startDate, endDate],
    queryFn: () => leadAPI.getMyCallAnalytics({ startDate, endDate }),
    staleTime: 60_000,
  });

  const report = data;

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-3 sm:space-y-6 px-0 sm:px-2 pb-20 sm:pb-0">
        {/* Date filters row */}
        <div className="flex flex-wrap items-end gap-2 sm:gap-4">
          <div className="min-w-0 flex-1 sm:flex-initial sm:w-40">
            <Skeleton className="h-3 w-14 mb-1.5 rounded" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          <div className="min-w-0 flex-1 sm:flex-initial sm:w-40">
            <Skeleton className="h-3 w-12 mb-1.5 rounded" />
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
        </div>
        {/* Quick filters row */}
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-3 w-10 rounded" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
        {/* Stats cards - 4 cards in grid */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="min-h-[72px] sm:min-h-[80px] rounded-xl" />
          ))}
        </div>
        {/* Day-wise section placeholder */}
        <div className="space-y-3">
          <Skeleton className="h-5 w-48 rounded" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-4xl px-0 sm:px-2 pb-20 sm:pb-0">
        <Card className="p-4 sm:p-8 text-center">
          <p className="text-sm sm:text-base text-red-600 dark:text-red-400">Failed to load call activity. Please try again.</p>
          <Button className="mt-3 sm:mt-4 !text-xs !py-1.5 !px-2.5 sm:!text-sm sm:!py-2 sm:!px-3" variant="outline" onClick={() => router.push('/user/dashboard')}>
            Back to dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-3 sm:space-y-6 px-0 sm:px-2 pb-20 sm:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Row 1: Start and End date */}
        <div className="flex flex-wrap items-end gap-2 sm:gap-4">
          <div className="min-w-0 flex-1 sm:flex-initial sm:w-40">
            <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-0.5">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 min-h-9"
            />
          </div>
          <div className="min-w-0 flex-1 sm:flex-initial sm:w-40">
            <label className="block text-[10px] sm:text-xs font-medium text-slate-500 mb-0.5">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 min-h-9"
            />
          </div>
        </div>

        {/* Print Button - Highly Visible */}
        <Button 
          onClick={() => setIsAssignmentModalOpen(true)}
          className="bg-orange-600 hover:bg-orange-700 text-white font-semibold flex items-center gap-2 !h-10 !px-4 shadow-lg shadow-orange-500/20"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
          Print Assignment History
        </Button>
      </div>
      {/* Row 2: Quick filters */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] sm:text-xs font-medium text-slate-500 shrink-0">Quick:</span>
        <button
          type="button"
          onClick={() => { const today = format(new Date(), 'yyyy-MM-dd'); setStartDate(today); setEndDate(today); }}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => { const [s, e] = setQuickRange(7); setStartDate(s); setEndDate(e); }}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Last 7 days
        </button>
        <button
          type="button"
          onClick={() => { const [s, e] = setQuickRange(30); setStartDate(s); setEndDate(e); }}
          className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Last 30 days
        </button>
      </div>

      {!report ? (
        <Card className="p-4 sm:p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">No data for this period.</p>
        </Card>
      ) : (
        <>
          {/* Summary cards - colored gradients like dashboard */}
          <div className={`grid gap-2 sm:gap-4 ${user?.roleName === 'PRO' ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-4'}`}>
            {user?.roleName !== 'PRO' && (
              <>
                <div className={`overflow-hidden rounded-xl border-0 bg-gradient-to-br ${STATS_CARD_STYLES[0]} p-3 sm:p-4 shadow-md flex flex-col justify-center min-h-[72px] sm:min-h-[80px]`}>
                  <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-white/85">Leads called (with outcome)</p>
                  <p className="mt-0.5 sm:mt-1 text-lg sm:text-2xl font-bold text-white drop-shadow-sm">{report.calls?.total ?? 0}</p>
                  {typeof report.calls?.totalAttempts === 'number' && report.calls.totalAttempts > (report.calls?.total ?? 0) && (
                    <p className="mt-0.5 text-[10px] sm:text-xs text-white/75">
                      {report.calls.totalAttempts} logged call{report.calls.totalAttempts !== 1 ? 's' : ''}
                    </p>
                  )}
                  {report.calls?.averageDuration > 0 && (
                    <p className="mt-0.5 text-[10px] sm:text-xs text-white/75">
                      Avg / attempt {formatSecondsToMMSS(report.calls.averageDuration)}
                    </p>
                  )}
                </div>
                <div className={`overflow-hidden rounded-xl border-0 bg-gradient-to-br ${STATS_CARD_STYLES[1]} p-3 sm:p-4 shadow-md flex flex-col justify-center min-h-[72px] sm:min-h-[80px]`}>
                  <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-white/85">Total SMS</p>
                  <p className="mt-0.5 sm:mt-1 text-lg sm:text-2xl font-bold text-white drop-shadow-sm">{report.sms?.total ?? 0}</p>
                </div>
              </>
            )}
            <div className={`overflow-hidden rounded-xl border-0 bg-gradient-to-br ${user?.roleName === 'PRO' ? STATS_CARD_STYLES[0] : STATS_CARD_STYLES[2]} p-3 sm:p-4 shadow-md flex flex-col justify-center min-h-[72px] sm:min-h-[80px]`}>
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-white/85">Status changes</p>
              <p className="mt-0.5 sm:mt-1 text-lg sm:text-2xl font-bold text-white drop-shadow-sm">{report.statusConversions?.total ?? 0}</p>
            </div>
            <div className={`overflow-hidden rounded-xl border-0 bg-gradient-to-br ${user?.roleName === 'PRO' ? STATS_CARD_STYLES[1] : STATS_CARD_STYLES[3]} p-3 sm:p-4 shadow-md flex flex-col justify-center min-h-[72px] sm:min-h-[80px]`}>
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-white/85">Assigned leads</p>
              <p className="mt-0.5 sm:mt-1 text-lg sm:text-2xl font-bold text-white drop-shadow-sm">{report.totalAssigned ?? 0}</p>
            </div>
          </div>

          {/* Day-wise call activity - latest date first, date formatted as "Feb 23, 2026" */}
          {user?.roleName !== 'PRO' && report.calls?.dailyCallActivity && report.calls.dailyCallActivity.length > 0 && (
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 sm:mb-4">Day-wise call activity</h2>
              <div className="space-y-3 sm:space-y-4">
                {[...report.calls.dailyCallActivity]
                  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                  .map((day: {
                    date: string;
                    callCount?: number;
                    distinctLeads?: number;
                    attempts?: number;
                    leads?: { leadName: string; leadPhone?: string; enquiryNumber?: string; callCount: number }[];
                  }) => {
                    const dateLabel = day.date ? format(new Date(day.date + 'T12:00:00'), 'MMM d, yyyy') : day.date;
                    const distinct = day.distinctLeads ?? day.leads?.length ?? day.callCount ?? 0;
                    const attempts = day.attempts ?? day.callCount ?? 0;
                    return (
                      <div key={day.date || dateLabel} className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-2.5 border-b border-slate-200 dark:border-slate-600">
                          <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">{dateLabel}</span>
                          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 text-right">
                            <span className="block">{distinct} lead{distinct !== 1 ? 's' : ''}</span>
                            {attempts > distinct ? (
                              <span className="block text-[10px] font-normal text-slate-500 dark:text-slate-400">{attempts} logged calls</span>
                            ) : null}
                          </span>
                        </div>
                        {day.leads && day.leads.length > 0 && (
                          <>
                            <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-700/50">
                              {day.leads.map((lead: any, lidx: number) => (
                                <div key={lidx} className="px-3 py-2 flex justify-between items-center gap-3 min-w-0">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{lead.leadName}</p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{lead.leadPhone || '—'}</p>
                                  </div>
                                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 shrink-0 tabular-nums">{lead.callCount}</span>
                                </div>
                              ))}
                            </div>
                            <div className="hidden sm:block w-full overflow-x-auto -mx-px">
                              <table className="w-full min-w-0 text-sm border-collapse">
                                <thead>
                                  <tr className="border-b border-slate-200 dark:border-slate-600">
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Lead</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">Phone</th>
                                    <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">Enquiry #</th>
                                    <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 w-16">Calls</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                  {day.leads.map((lead: any, lidx: number) => (
                                    <tr key={lidx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                      <td className="px-3 py-2 text-slate-900 dark:text-slate-100 max-w-[140px] sm:max-w-[200px] truncate" title={lead.leadName}>{lead.leadName}</td>
                                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{lead.leadPhone || '—'}</td>
                                      <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{lead.enquiryNumber || '—'}</td>
                                      <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100 font-medium tabular-nums">{lead.callCount}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Calls by lead - organised table, responsive */}
          {user?.roleName !== 'PRO' && report.calls && report.calls.total > 0 && report.calls.byLead?.length > 0 && (
            <Card className="p-4 sm:p-6 overflow-hidden">
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 sm:mb-4">Calls by lead</h2>
              <div className="sm:hidden space-y-2">
                {report.calls.byLead.map((lead: any, idx: number) => (
                  <div key={idx} className="rounded-xl border border-slate-200 dark:border-slate-600 p-3 flex justify-between items-center gap-3 bg-white dark:bg-slate-900/30">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{lead.leadName}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{lead.leadPhone}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{lead.callCount}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{formatSecondsToMMSS(lead.totalDuration)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden sm:block w-full overflow-x-auto -mx-px">
                <table className="w-full min-w-0 text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/50">
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600">Lead</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600 whitespace-nowrap">Phone</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600 w-16">Calls</th>
                      <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600 w-24 whitespace-nowrap">Duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                    {report.calls.byLead.map((lead: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100 max-w-[140px] sm:max-w-[200px] truncate" title={lead.leadName}>{lead.leadName}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{lead.leadPhone}</td>
                        <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100 font-medium tabular-nums">{lead.callCount}</td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-400 whitespace-nowrap tabular-nums">{formatSecondsToMMSS(lead.totalDuration)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* SMS - organised table, responsive */}
          {user?.roleName !== 'PRO' && report.sms && report.sms.total > 0 && (
            <Card className="p-4 sm:p-6 overflow-hidden">
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 sm:mb-4">SMS sent ({report.sms.total})</h2>
              {report.sms.templateUsage?.length > 0 && (
                <div className="mb-3 sm:mb-4">
                  <h3 className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400 mb-1.5 sm:mb-2">By template</h3>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {report.sms.templateUsage.map((t: any, i: number) => (
                      <span key={i} className="rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] sm:px-3 sm:py-1 sm:text-xs">
                        {t.name}: {t.count} ({t.uniqueLeads} leads)
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {report.sms.byLead?.length > 0 && (
                <>
                  <div className="sm:hidden space-y-2">
                    {report.sms.byLead.map((lead: any, idx: number) => (
                      <div key={idx} className="rounded-xl border border-slate-200 dark:border-slate-600 p-3 flex justify-between items-center gap-3 bg-white dark:bg-slate-900/30">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{lead.leadName}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{lead.leadPhone}</p>
                        </div>
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 shrink-0 tabular-nums">{lead.smsCount}</span>
                      </div>
                    ))}
                  </div>
                  <div className="hidden sm:block w-full overflow-x-auto -mx-px">
                    <table className="w-full min-w-0 text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50">
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600">Lead</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600 whitespace-nowrap">Phone</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600 w-20">SMS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                        {report.sms.byLead.map((lead: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                            <td className="px-3 py-2 text-slate-900 dark:text-slate-100 max-w-[140px] sm:max-w-[200px] truncate" title={lead.leadName}>{lead.leadName}</td>
                            <td className="px-3 py-2 text-slate-600 dark:text-slate-400 whitespace-nowrap">{lead.leadPhone}</td>
                            <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100 font-medium tabular-nums">{lead.smsCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          )}

          {/* Status conversions - compact on mobile */}
          {report.statusConversions && report.statusConversions.total > 0 && (
            <Card className="p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 sm:mb-4">Status changes ({report.statusConversions.total})</h2>
              {report.statusConversions.breakdown && Object.keys(report.statusConversions.breakdown).length > 0 && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {Object.entries(report.statusConversions.breakdown).map(([conversion, count]: [string, unknown]) => (
                    <span key={conversion} className="inline-flex rounded-full px-2 py-0.5 text-[11px] sm:px-3 sm:py-1 sm:text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                      {conversion}: {String(count)}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )}

          {user?.roleName !== 'PRO' && !report.calls?.total && !report.sms?.total && !report.statusConversions?.total && (
            <Card className="p-4 sm:p-8 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">No calls, SMS, or status changes in this date range.</p>
            </Card>
          )}

          {user?.roleName === 'PRO' && !report.statusConversions?.total && !report.totalAssigned && (
            <Card className="p-4 sm:p-8 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">No activity or assignments in this date range.</p>
            </Card>
          )}
        </>
      )}

      {user && (
        <PrintAssignmentModal 
          isOpen={isAssignmentModalOpen} 
          onClose={() => setIsAssignmentModalOpen(false)} 
          roleName={user.roleName}
        />
      )}
    </div>
  );
}

function PrintAssignmentModal({ isOpen, onClose, roleName }: { isOpen: boolean; onClose: () => void; roleName: string }) {
  const [history, setHistory] = useState<{ date: string; count: number }[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [isColumnModalOpen, setIsColumnModalOpen] = useState(false);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<Record<string, boolean>>({
    name: true,
    phone: true,
    enquiry_number: true,
    district: true,
    mandal: true,
    village: true
  });

  const excludedFields = [
    'id', 'assigned_at', 'assigned_to', 'pro_assigned_at', 'assigned_to_pro', 
    'created_at', 'updated_at', 'needs_manual_update', 'is_active', 'is_deleted',
    'status', 'last_called_at', 'last_called_by', 'interested_course'
  ];

  const formatHeader = (key: string) => {
    return key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    } else {
      setSelectedDate(null);
      setLeads([]);
      setAvailableColumns([]);
    }
  }, [isOpen]);

  const loadHistory = async () => {
    setIsHistoryLoading(true);
    try {
      const data = await leadAPI.getMyAssignmentHistory();
      setHistory(data || []);
    } catch (err) {
      console.error('Failed to load assignment history', err);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleSelectDate = async (date: string) => {
    setSelectedDate(date);
    setIsLoading(true);

    try {
      console.log(`Fetching assignments for date: ${date}`);
      const response = await leadAPI.getAssignmentDetailsByDate(date);
      console.log('Assignment API Response:', response);

      // Handle all possible structures safely
      const leadsData =
        Array.isArray(response)
          ? response
          : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.leads)
          ? response.leads
          : [];

      console.log('Parsed Leads:', leadsData);
      setLeads(leadsData);

      // Dynamically detect available columns with preferred order
      if (leadsData.length > 0) {
        const keys = Object.keys(leadsData[0]).filter(k => !excludedFields.includes(k));
        
        const preferredOrder = ['name', 'phone', 'enquiry_number', 'district', 'mandal', 'village', 'address'];
        const sortedKeys = [
          ...preferredOrder.filter(k => keys.includes(k)),
          ...keys.filter(k => !preferredOrder.includes(k))
        ];
        
        setAvailableColumns(sortedKeys);
        
        // Ensure standard columns are checked by default if they exist
        const initialSelection: Record<string, boolean> = {};
        sortedKeys.forEach(k => {
          initialSelection[k] = ['name', 'phone', 'enquiry_number', 'district', 'mandal', 'village', 'address'].includes(k);
        });
        setSelectedColumns(initialSelection);
      }
    } catch (err) {
      console.error('Failed to load assignment details', err);
      setLeads([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrintClick = () => {
    if (leads.length === 0) return;
    setIsColumnModalOpen(true);
  };

  const handleDownloadPdf = () => {
    if (leads.length === 0) return;
    setIsColumnModalOpen(false);

    const activeColumns = availableColumns.filter((k) => selectedColumns[k]);
    const includeRemarks = Boolean(selectedColumns.remarks);
    const dateLabel = selectedDate
      ? format(new Date(selectedDate + 'T12:00:00'), 'MMMM d, yyyy')
      : 'N/A';

    const doc = new jsPDF({
      orientation: activeColumns.length + (includeRemarks ? 1 : 0) > 5 ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    doc.setFontSize(16);
    doc.text('Leads Assignment Report', 14, 15);
    doc.setFontSize(10);
    doc.text(`Date: ${dateLabel}`, 14, 22);
    doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}`, 14, 28);
    doc.text(`Total Leads: ${leads.length}`, 14, 34);

    const tableHead = [
      'S.No',
      ...activeColumns.map((k) => formatHeader(k)),
      ...(includeRemarks ? ['Remarks'] : []),
    ];
    const tableBody = leads.map((lead, idx) => [
      String(idx + 1),
      ...activeColumns.map((k) => (lead[k] != null && lead[k] !== '' ? String(lead[k]) : '—')),
      ...(includeRemarks ? [''] : []),
    ]);

    autoTable(doc, {
      startY: 40,
      head: [tableHead],
      body: tableBody,
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: 'bold' },
      theme: 'grid',
      margin: { left: 14, right: 14 },
    });

    const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text('* This is a system-generated report.', 14, finalY + 12);

    const dateStr = selectedDate
      ? format(new Date(selectedDate + 'T12:00:00'), 'yyyy-MM-dd')
      : format(new Date(), 'yyyy-MM-dd');
    doc.save(`Assignment_Report_${dateStr}.pdf`);
  };

  const handleFinalPrint = () => {
    setIsColumnModalOpen(false);
    
    // Prevent multiple clicks/executions
    if ((window as any)._isPrintingNow) return;
    (window as any)._isPrintingNow = true;

    const printContent = document.getElementById('printable-assignment-area');
    if (!printContent) {
      (window as any)._isPrintingNow = false;
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      (window as any)._isPrintingNow = false;
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Leads Assignment Report</title>
          <style>
            @page { size: auto; margin: 10mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 20px; color: #000; background: #fff; }
            .header { border-bottom: 2px solid #000; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
            .header h1 { margin: 0; font-size: 24px; text-transform: uppercase; }
            .header p { margin: 5px 0 0 0; font-size: 14px; color: #333; }
            .header .right { text-align: right; }
            .header .right p { font-size: 10px; color: #666; }
            .header .right .total { font-size: 14px; font-weight: bold; color: #000; margin-top: 5px; }
            
            h2 { font-size: 18px; margin: 20px 0 10px 0; }
            
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #000; padding: 6px 4px; text-align: left; font-size: 9px; }
            th { background-color: #f5f5f5; font-weight: bold; }
            tr { page-break-inside: avoid; }
            
            .footer { margin-top: 50px; display: flex; justify-content: space-between; align-items: flex-end; border-top: 1px solid #eee; pt: 10px; }
            .footer-text { font-size: 10px; color: #999; }
            .signature { border-top: 1px solid #000; width: 200px; text-align: center; padding-top: 5px; font-size: 12px; font-weight: bold; }
            
            .print-hidden, .screen-only, button, .print\\:hidden { display: none !important; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>Leads Assignment Report</h1>
              <p>Date: ${selectedDate ? format(new Date(selectedDate + 'T12:00:00'), 'MMMM d, yyyy') : 'N/A'}</p>
            </div>
            <div class="right">
              <p>Generated: ${format(new Date(), 'MMM d, yyyy HH:mm')}</p>
              <div class="total">Total Leads: ${leads.length}</div>
            </div>
          </div>

          <h2>Assignments for ${selectedDate ? format(new Date(selectedDate + 'T12:00:00'), 'MMM d, yyyy') : 'N/A'}</h2>

          <table>
            <thead>
              <tr>
                <th style="width: 30px">S.No</th>
                ${availableColumns.filter(k => selectedColumns[k]).map(k => `<th>${formatHeader(k)}</th>`).join('')}
                ${selectedColumns.remarks ? '<th style="width: 120px">Remarks</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${leads.map((lead, idx) => `
                <tr>
                  <td style="text-align: center">${idx + 1}</td>
                  ${availableColumns.filter(k => selectedColumns[k]).map(k => `<td>${lead[k] || '—'}</td>`).join('')}
                  ${selectedColumns.remarks ? '<td></td>' : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            <div class="footer-text">* This is a system-generated report.</div>
            <div class="signature">Authorized Signature</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    
    // Focus and print after resources load
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      printWindow.close();
      (window as any)._isPrintingNow = false;
    }, 500);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[96vw] sm:max-w-4xl max-h-[85vh] sm:max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-xl sm:rounded-lg shadow-2xl">
        <DialogHeader className="p-4 border-b dark:border-slate-700">
          <DialogTitle className="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
            Print Assignments
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col sm:flex-row">
          {/* History Sidebar */}
          <div className="w-full sm:w-64 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3 sm:p-4 overflow-y-auto sm:max-h-none print:hidden flex-1 sm:flex-initial">
            <h3 className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 sm:mb-3">Select Date</h3>
            {isHistoryLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : history.length > 0 ? (
              <div className="space-y-1">
                {history.map((item) => (
                  <button
                    key={item.date}
                    onClick={() => handleSelectDate(item.date)}
                    className={cn(
                      "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex justify-between items-center",
                      selectedDate === item.date 
                        ? "bg-orange-500 text-white font-medium" 
                        : "hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                    )}
                  >
                    <span>{format(new Date(item.date + 'T12:00:00'), 'MMM d, yyyy')}</span>
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full", selectedDate === item.date ? "bg-white/20 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-500")}>
                      {item.count}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No assignments found.</p>
            )}

            {/* Information Only Area */}
            <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
              <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20">
                <p className="text-[10px] leading-relaxed text-orange-800 dark:text-orange-300">
                  Select a date from the list above to preview and prepare the assignment report. 
                  You will be able to customize the printed columns after clicking "Print List".
                </p>
              </div>
            </div>
          </div>

          {/* Details Preview - Hidden on mobile as per user request */}
          <div className="hidden sm:flex flex-1 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 overflow-y-auto min-w-0 flex-col">
            {!selectedDate ? (
              <div className="h-full flex items-center justify-center text-slate-400 flex-col gap-2 p-8 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-20"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                <p className="text-sm">Select a date from the left to preview assignments.</p>
              </div>
            ) : isLoading ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : (
              <div className="p-4 sm:p-6 print:p-0">
                <div id="printable-assignment-area" className="w-full">
                  {/* Print Header (Visible only when printing) */}
                  <div className="hidden print:block mb-8 border-b-2 border-slate-900 pb-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h1 className="text-2xl font-bold text-slate-900 uppercase">Leads Assignment Report</h1>
                        <p className="text-sm text-slate-700 font-medium mt-1">Date: {format(new Date(selectedDate + 'T12:00:00'), 'MMMM d, yyyy')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500">Generated: {format(new Date(), 'MMM d, yyyy HH:mm')}</p>
                        <p className="text-sm font-bold text-slate-800">Total Leads: {leads.length}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mb-4 flex items-center justify-between print:mb-2">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                      Assignments for {format(new Date(selectedDate + 'T12:00:00'), 'MMM d, yyyy')}
                    </h2>
                    <span className="text-sm text-slate-500 print:hidden">{leads.length} leads</span>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                    <table className="w-full text-[10px] border-collapse border border-slate-300 dark:border-slate-700">
                      <thead>
                        <tr className="bg-slate-100 dark:bg-slate-800">
                          <th className="border border-slate-300 dark:border-slate-700 p-1.5 text-left w-8">S.No</th>
                          {availableColumns.filter(k => selectedColumns[k]).map(k => (
                            <th key={k} className="border border-slate-300 dark:border-slate-700 p-1.5 text-left font-semibold">
                              {formatHeader(k)}
                            </th>
                          ))}
                          {selectedColumns.remarks && <th className="border border-slate-300 dark:border-slate-700 p-1.5 text-left w-20">Remarks</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.isArray(leads) && leads.map((lead, idx) => (
                          <tr key={lead.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                            <td className="border border-slate-300 dark:border-slate-700 p-1.5 text-center">{idx + 1}</td>
                            {availableColumns.filter(k => selectedColumns[k]).map(k => (
                              <td key={k} className="border border-slate-300 dark:border-slate-700 p-1.5 whitespace-normal break-words max-w-[150px]">
                                {String(lead[k] || '—')}
                              </td>
                            ))}
                            {selectedColumns.remarks && <td className="border border-slate-300 dark:border-slate-700 p-1.5"></td>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {leads.length === 0 && (
                    <div className="text-center py-12 border border-t-0 border-slate-300 bg-slate-50/30">
                      <p className="text-sm text-slate-500 italic">No lead details found for this date.</p>
                    </div>
                  )}

                  <div className="hidden print:flex mt-12 justify-between items-end border-t border-slate-200 pt-6">
                    <div className="text-xs text-slate-400">
                      * This is a system-generated report.
                    </div>
                    <div className="text-center border-t border-slate-900 pt-1 w-48">
                      <p className="text-xs font-bold text-slate-900">Authorized Signature</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="p-4 pb-16 sm:pb-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 sm:justify-between items-center print:hidden">
          <p className="text-[10px] sm:text-xs text-slate-500 hidden sm:block italic">
            * Assignments are based on the original assignment date.
          </p>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="outline" onClick={onClose} className="flex-1 sm:flex-initial !text-xs sm:!text-sm">
              Close
            </Button>
            <Button 
              onClick={handlePrintClick} 
              disabled={!selectedDate || leads.length === 0}
              className="flex-1 sm:flex-initial !text-xs sm:!text-sm bg-orange-600 hover:bg-orange-700 text-white flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
              Print List
            </Button>
          </div>
        </DialogFooter>

        {/* Column Selection Secondary Modal */}
        <Dialog open={isColumnModalOpen} onOpenChange={setIsColumnModalOpen}>
          <DialogContent className="w-[92vw] sm:max-w-md max-h-[85vh] sm:max-h-[90vh] p-0 overflow-hidden rounded-xl sm:rounded-lg shadow-2xl flex flex-col">
            <DialogHeader className="p-4 sm:p-6 pb-2 shrink-0">
              <DialogTitle className="text-lg sm:text-xl">Customize Report Columns</DialogTitle>
              <p className="text-[10px] sm:text-sm text-slate-500">Select information to include in the report.</p>
            </DialogHeader>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              <div className="flex items-center justify-between mb-3 pb-2 border-b dark:border-slate-700">
                <span className="text-xs sm:text-sm font-medium">Available Fields</span>
                <button 
                  onClick={() => {
                    const allChecked = Object.values(selectedColumns).every(v => v);
                    const newSelection = { ...selectedColumns };
                    availableColumns.forEach(k => newSelection[k] = !allChecked);
                    setSelectedColumns(newSelection);
                  }}
                  className="text-[10px] sm:text-xs text-orange-600 hover:underline font-semibold"
                >
                  Toggle All
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableColumns.map((colKey) => (
                  <label 
                    key={colKey} 
                    className="flex items-center gap-3 cursor-pointer group p-3 sm:p-2 rounded-lg border border-slate-100 sm:border-transparent dark:border-slate-800/50 sm:dark:border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <input 
                      type="checkbox" 
                      checked={selectedColumns[colKey] || false}
                      onChange={(e) => setSelectedColumns(prev => ({ ...prev, [colKey]: e.target.checked }))}
                      className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 h-5 w-5 sm:h-4.5 sm:w-4.5 transition-all"
                    />
                    <span className="text-sm font-medium sm:font-normal text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors truncate">
                      {formatHeader(colKey)}
                    </span>
                  </label>
                ))}
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <input 
                    type="checkbox" 
                    checked={selectedColumns.remarks || false}
                    onChange={(e) => setSelectedColumns(prev => ({ ...prev, remarks: e.target.checked }))}
                    className="rounded border-slate-300 text-orange-600 focus:ring-orange-500 h-4.5 w-4.5"
                  />
                  <div>
                    <p className="text-sm font-medium">Include Remarks Column</p>
                    <p className="text-[10px] text-slate-500">Adds an empty column for manual notes on the printed sheet.</p>
                  </div>
                </label>
              </div>
            </div>

            <DialogFooter className="p-3 sm:p-4 pb-16 sm:pb-4 bg-slate-50 dark:bg-slate-800/50 border-t dark:border-slate-700 flex flex-col sm:flex-row gap-2 shrink-0">
              <Button variant="ghost" onClick={() => setIsColumnModalOpen(false)} className="flex-1 sm:flex-initial">
                Back
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadPdf}
                disabled={leads.length === 0 || !availableColumns.some((k) => selectedColumns[k])}
                className="flex-1 sm:flex-initial gap-2"
              >
                <Download className="h-4 w-4" />
                Download PDF
              </Button>
              <Button onClick={handleFinalPrint} className="flex-1 sm:flex-initial bg-orange-600 hover:bg-orange-700 text-white gap-2 shadow-lg shadow-orange-600/20">
                Confirm & Print
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
      <style jsx global>{`
        /* Minimal Screen Tweaks */
        @media screen {
          .print\:block, .print\:flex { display: none !important; }
        }
      `}</style>
    </Dialog>
  );
}
