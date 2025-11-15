'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { leadAPI } from '@/lib/api';
import { Lead } from '@/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useDashboardHeader } from '@/components/layout/DashboardShell';

const ConfirmedLeadsPage = () => {
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');

  const queryKey = useMemo(() => ['confirmed-leads', page, limit, searchTerm], [page, limit, searchTerm]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await leadAPI.getAll({
        page,
        limit,
        search: searchTerm || undefined,
        leadStatus: 'Confirmed',
      });
      return response.data || response;
    },
    placeholderData: (previousData) => previousData,
  });

  const headerContent = useMemo(
    () => (
      <div className="flex flex-col items-end gap-2 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Confirmed Leads</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Leads marked as confirmed and ready for the joining process.
        </p>
      </div>
    ),
    []
  );

  useEffect(() => {
    setHeaderContent(headerContent);
    return () => clearHeaderContent();
  }, [headerContent, setHeaderContent, clearHeaderContent]);

  const leads = (data?.leads ?? []) as Lead[];
  const pagination = data?.pagination ?? { page: 1, pages: 1, total: 0, limit };
  const isEmpty = !isLoading && leads.length === 0;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            placeholder="Search by enquiry number, name, or phone…"
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setPage(1);
            }}
          />
          <Link href="/superadmin/joining/new">
            <Button variant="primary" className="whitespace-nowrap">
              Add Joining Form
            </Button>
          </Link>
        </div>
      </Card>

      <Card className="overflow-hidden border border-white/60 shadow-lg shadow-blue-100/30 dark:border-slate-800/70 dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200/80 dark:divide-slate-800/80">
            <thead className="bg-slate-50/80 backdrop-blur-sm dark:bg-slate-900/70">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Enquiry #
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Student
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Phone
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Mandal
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Updated
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white/80 backdrop-blur-sm dark:divide-slate-800 dark:bg-slate-900/60">
              {isLoading || isFetching ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-slate-500">
                    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-400 border-t-transparent" />
                    <p className="mt-4 text-xs uppercase tracking-[0.3em] text-slate-400">Loading leads…</p>
                  </td>
                </tr>
              ) : isEmpty ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-slate-500">
                    <p className="font-medium text-slate-600 dark:text-slate-400">No confirmed leads found.</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.3em] text-slate-400">
                      Update lead status to "Confirmed" to start the joining workflow.
                    </p>
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead._id} className="transition hover:bg-blue-50/60 dark:hover:bg-slate-800/60">
                    <td className="px-6 py-4 text-sm font-semibold text-blue-600 dark:text-blue-300">
                      {lead.enquiryNumber || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-900 dark:text-slate-100">{lead.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{lead.phone}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{lead.mandal || '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {lead.updatedAt ? new Date(lead.updatedAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/superadmin/joining/${lead._id}/detail`}>
                        <Button variant="primary" size="sm">
                          View Details
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 && (
          <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-200 pt-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
            <div>
              Page {pagination.page} of {pagination.pages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={pagination.page === 1 || isFetching}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((prev) => Math.min(prev + 1, pagination.pages))}
                disabled={pagination.page === pagination.pages || isFetching}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ConfirmedLeadsPage;
