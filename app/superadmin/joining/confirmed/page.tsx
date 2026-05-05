'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { leadAPI, joiningAPI } from '@/lib/api';
import { parseJoiningPublicLinkFromApiResponse } from '@/lib/joiningInviteLink';
import { JoiningDraftSmsModal } from '@/components/joining/JoiningDraftSmsModal';
import { Lead } from '@/types';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useDashboardHeader, useModulePermission } from '@/components/layout/DashboardShell';
import { showToast } from '@/lib/toast';
import { History, MessageSquare, FileCheck } from 'lucide-react';

const ConfirmedLeadsPage = () => {
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const { canWrite: canWriteJoining } = useModulePermission('joining');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [smsSession, setSmsSession] = useState<{
    leadId: string;
    admissionPublicLink: { url: string; expiresAt?: string; pathToken: string };
    joiningOnlineAdmissionMode: true;
  } | null>(null);

  const sendAdmissionSmsMutation = useMutation({
    mutationFn: (leadId: string) => joiningAPI.createPublicEditLink(leadId),
    onSuccess: (res, leadId) => {
      const parsed = parseJoiningPublicLinkFromApiResponse(res);
      if (!parsed?.url) {
        showToast.error('Link was created but the URL could not be resolved.');
        return;
      }
      void navigator.clipboard?.writeText(parsed.url).catch(() => {});
      setSmsSession({
        leadId,
        admissionPublicLink: {
          url: parsed.url,
          expiresAt: parsed.expiresAt,
          pathToken: parsed.pathToken,
        },
        joiningOnlineAdmissionMode: true,
      });
      showToast.success('Public link created (copied). Review the SMS, then send.');
    },
    onError: (e: unknown) => {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      showToast.error(err?.response?.data?.message || err?.message || 'Could not create link');
    },
  });

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
    <div className="w-full space-y-6">
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
          <Link href="/superadmin/joining/new" className="sm:ml-auto sm:shrink-0">
            <Button variant="outline" className="whitespace-nowrap">
              Add Joining Form (staff)
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
                  Enquiry number
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Student name
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Student Group
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Course interested
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  User name & Dept details
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Updated Date & time
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white/80 backdrop-blur-sm dark:divide-slate-800 dark:bg-slate-900/60">
              {isLoading || isFetching ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-sm text-slate-500">
                    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-400 border-t-transparent" />
                    <p className="mt-4 text-xs uppercase tracking-[0.3em] text-slate-400">Loading leads…</p>
                  </td>
                </tr>
              ) : isEmpty ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-sm text-slate-500">
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
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{lead.studentGroup || '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">{lead.courseInterested || '—'}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 dark:text-slate-300">
                      {lead.assignedTo && typeof lead.assignedTo === 'object' ? (
                        <div>
                          <div>{lead.assignedTo.name || '—'}</div>
                          <div className="text-xs text-slate-500">{lead.assignedTo.department || '—'}</div>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {lead.updatedAt ? new Date(lead.updatedAt).toLocaleString() : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex flex-nowrap items-center justify-end gap-2">
                        <Link href={`/superadmin/leads/${lead._id}`} title="Check lead history">
                          <Button variant="outline" size="sm" className="gap-2 flex items-center whitespace-nowrap">
                            <History className="h-4 w-4" />
                            History
                          </Button>
                        </Link>
                        {canWriteJoining && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 flex items-center whitespace-nowrap"
                            disabled={sendAdmissionSmsMutation.isPending}
                            onClick={() => sendAdmissionSmsMutation.mutate(lead._id)}
                            title="Send sms/whatsapp"
                          >
                            <MessageSquare className="h-4 w-4" />
                            {sendAdmissionSmsMutation.isPending ? '...' : 'Message'}
                          </Button>
                        )}
                        <Link href={`/superadmin/joining/${lead._id}`} title="Submit application form">
                          <Button variant="primary" size="sm" className="gap-2 flex items-center whitespace-nowrap">
                            <FileCheck className="h-4 w-4" />
                            Apply
                          </Button>
                        </Link>
                      </div>
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

      <JoiningDraftSmsModal
        open={Boolean(smsSession)}
        leadId={smsSession?.leadId}
        admissionPublicLink={smsSession?.admissionPublicLink}
        joiningOnlineAdmissionMode={Boolean(smsSession?.joiningOnlineAdmissionMode)}
        onClose={() => setSmsSession(null)}
      />
    </div>
  );
};

export default ConfirmedLeadsPage;
