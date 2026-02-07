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

const defaultStart = format(subDays(new Date(), 30), 'yyyy-MM-dd');
const defaultEnd = format(new Date(), 'yyyy-MM-dd');

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
      <div className="flex flex-col items-end gap-2 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">My call activity</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Calls, SMS, and status changes for the selected date range.
        </p>
        <Button size="sm" variant="outline" onClick={() => router.push('/user/dashboard')}>
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
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <Card className="p-8 text-center">
          <p className="text-red-600 dark:text-red-400">Failed to load call activity. Please try again.</p>
          <Button className="mt-4" variant="outline" onClick={() => router.push('/user/dashboard')}>
            Back to dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Date range */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Start date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">End date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
      </Card>

      {!report ? (
        <Card className="p-8 text-center">
          <p className="text-slate-500 dark:text-slate-400">No data for this period.</p>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card className="p-4">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total calls</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{report.calls?.total ?? 0}</p>
              {report.calls?.averageDuration > 0 && (
                <p className="text-xs text-slate-500 mt-0.5">
                  Avg {Math.floor(report.calls.averageDuration / 60)}m {report.calls.averageDuration % 60}s
                </p>
              )}
            </Card>
            <Card className="p-4">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Total SMS</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{report.sms?.total ?? 0}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Status changes</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{report.statusConversions?.total ?? 0}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Assigned leads</p>
              <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{report.totalAssigned ?? 0}</p>
            </Card>
          </div>

          {/* Day-wise call activity */}
          {report.calls?.dailyCallActivity && report.calls.dailyCallActivity.length > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Day-wise call activity</h2>
              <div className="space-y-3">
                {report.calls.dailyCallActivity.map((day: { date: string; callCount: number; leads?: { leadName: string; leadPhone?: string; enquiryNumber?: string; callCount: number }[] }, idx: number) => (
                  <div key={idx} className="rounded-lg border border-slate-200 dark:border-slate-600 overflow-hidden">
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 px-3 py-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{day.date}</span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {day.callCount} call{day.callCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {day.leads && day.leads.length > 0 && (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-100 dark:bg-slate-700/50">
                            <tr>
                              <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Lead</th>
                              <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Phone</th>
                              <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Enquiry #</th>
                              <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Calls</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                            {day.leads.map((lead: any, lidx: number) => (
                              <tr key={lidx}>
                                <td className="px-3 py-1.5 text-slate-900 dark:text-slate-100">{lead.leadName}</td>
                                <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{lead.leadPhone || '—'}</td>
                                <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{lead.enquiryNumber || '—'}</td>
                                <td className="px-3 py-1.5 text-slate-900 dark:text-slate-100">{lead.callCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Calls by lead */}
          {report.calls && report.calls.total > 0 && report.calls.byLead?.length > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Calls by lead</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Lead</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Phone</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Calls</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Total duration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {report.calls.byLead.map((lead: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{lead.leadName}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{lead.leadPhone}</td>
                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{lead.callCount}</td>
                        <td className="px-3 py-2 text-slate-900 dark:text-slate-100">
                          {Math.floor(lead.totalDuration / 60)}m {lead.totalDuration % 60}s
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* SMS */}
          {report.sms && report.sms.total > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">SMS sent ({report.sms.total})</h2>
              {report.sms.templateUsage?.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">By template</h3>
                  <div className="flex flex-wrap gap-2">
                    {report.sms.templateUsage.map((t: any, i: number) => (
                      <span key={i} className="rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-1 text-xs">
                        {t.name}: {t.count} ({t.uniqueLeads} leads)
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {report.sms.byLead?.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Lead</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">Phone</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400">SMS count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                      {report.sms.byLead.map((lead: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{lead.leadName}</td>
                          <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{lead.leadPhone}</td>
                          <td className="px-3 py-2 text-slate-900 dark:text-slate-100">{lead.smsCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {/* Status conversions */}
          {report.statusConversions && report.statusConversions.total > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Status changes ({report.statusConversions.total})</h2>
              {report.statusConversions.breakdown && Object.keys(report.statusConversions.breakdown).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {Object.entries(report.statusConversions.breakdown).map(([conversion, count]: [string, unknown]) => (
                    <span key={conversion} className="inline-flex rounded-full px-3 py-1 text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                      {conversion}: {String(count)}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )}

          {!report.calls?.total && !report.sms?.total && !report.statusConversions?.total && (
            <Card className="p-8 text-center">
              <p className="text-slate-500 dark:text-slate-400">No calls, SMS, or status changes in this date range.</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
