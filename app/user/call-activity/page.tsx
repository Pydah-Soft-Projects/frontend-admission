'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { auth } from '@/lib/auth';
import { leadAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import { formatSecondsToMMSS } from '@/lib/utils';

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
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  const { setHeaderContent, clearHeaderContent, setMobileTopBar, clearMobileTopBar } = useDashboardHeader();

  useEffect(() => {
    setMobileTopBar({ title: 'My call activity', iconKey: 'analytics' });
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
        <h1 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100">My call activity</h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          Calls, SMS, and status changes for the selected date range.
        </p>
        <Button size="sm" variant="outline" onClick={() => router.push('/user/dashboard')} className="!text-xs !py-1.5 !px-2.5 !min-h-8 sm:!min-h-0 sm:!text-sm sm:!py-2 sm:!px-3">
          Back to dashboard
        </Button>
      </div>
    );
    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent, router]);

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
          <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
            <div className={`overflow-hidden rounded-xl border-0 bg-gradient-to-br ${STATS_CARD_STYLES[0]} p-3 sm:p-4 shadow-md flex flex-col justify-center min-h-[72px] sm:min-h-[80px]`}>
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-white/85">Total calls</p>
              <p className="mt-0.5 sm:mt-1 text-lg sm:text-2xl font-bold text-white drop-shadow-sm">{report.calls?.total ?? 0}</p>
              {report.calls?.averageDuration > 0 && (
                <p className="mt-0.5 text-[10px] sm:text-xs text-white/75">
                  Avg {formatSecondsToMMSS(report.calls.averageDuration)}
                </p>
              )}
            </div>
            <div className={`overflow-hidden rounded-xl border-0 bg-gradient-to-br ${STATS_CARD_STYLES[1]} p-3 sm:p-4 shadow-md flex flex-col justify-center min-h-[72px] sm:min-h-[80px]`}>
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-white/85">Total SMS</p>
              <p className="mt-0.5 sm:mt-1 text-lg sm:text-2xl font-bold text-white drop-shadow-sm">{report.sms?.total ?? 0}</p>
            </div>
            <div className={`overflow-hidden rounded-xl border-0 bg-gradient-to-br ${STATS_CARD_STYLES[2]} p-3 sm:p-4 shadow-md flex flex-col justify-center min-h-[72px] sm:min-h-[80px]`}>
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-white/85">Status changes</p>
              <p className="mt-0.5 sm:mt-1 text-lg sm:text-2xl font-bold text-white drop-shadow-sm">{report.statusConversions?.total ?? 0}</p>
            </div>
            <div className={`overflow-hidden rounded-xl border-0 bg-gradient-to-br ${STATS_CARD_STYLES[3]} p-3 sm:p-4 shadow-md flex flex-col justify-center min-h-[72px] sm:min-h-[80px]`}>
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-white/85">Assigned leads</p>
              <p className="mt-0.5 sm:mt-1 text-lg sm:text-2xl font-bold text-white drop-shadow-sm">{report.totalAssigned ?? 0}</p>
            </div>
          </div>

          {/* Day-wise call activity - latest date first, date formatted as "Feb 23, 2026" */}
          {report.calls?.dailyCallActivity && report.calls.dailyCallActivity.length > 0 && (
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-3 sm:mb-4">Day-wise call activity</h2>
              <div className="space-y-3 sm:space-y-4">
                {[...report.calls.dailyCallActivity]
                  .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                  .map((day: { date: string; callCount: number; leads?: { leadName: string; leadPhone?: string; enquiryNumber?: string; callCount: number }[] }) => {
                    const dateLabel = day.date ? format(new Date(day.date + 'T12:00:00'), 'MMM d, yyyy') : day.date;
                    return (
                      <div key={day.date || dateLabel} className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-2.5 border-b border-slate-200 dark:border-slate-600">
                          <span className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300">{dateLabel}</span>
                          <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                            {day.callCount} call{day.callCount !== 1 ? 's' : ''}
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
          {report.calls && report.calls.total > 0 && report.calls.byLead?.length > 0 && (
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
          {report.sms && report.sms.total > 0 && (
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

          {!report.calls?.total && !report.sms?.total && !report.statusConversions?.total && (
            <Card className="p-4 sm:p-8 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">No calls, SMS, or status changes in this date range.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
