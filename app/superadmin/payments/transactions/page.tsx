'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { paymentAPI } from '@/lib/api';
import { PaymentMode, PaymentStatus, PaymentTransaction } from '@/types';
import { showToast } from '@/lib/toast';
import { useCourseLookup } from '@/hooks/useCourseLookup';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(amount);

const formatDateTime = (value?: string) =>
  value ? new Date(value).toLocaleString() : '—';

export default function PaymentTransactionsPage() {
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const { getCourseName, getBranchName } = useCourseLookup();

  useEffect(() => {
    setHeaderContent(
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Payment Transactions
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Track all cash and online payments recorded across courses and admissions.
        </p>
      </div>
    );
    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent]);

  const { data: transactionsResponse, isLoading, refetch } = useQuery({
    queryKey: ['payments', 'transactions', 'all'],
    queryFn: async () => {
      const response = await paymentAPI.listTransactions();
      return response;
    },
  });

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      return await paymentAPI.reconcilePendingTransactions();
    },
    onSuccess: (data) => {
      const result = data?.data || data;
      showToast.success(
        `Reconciled ${result.checked || 0} transactions. ${result.updated || 0} updated, ${result.failed || 0} failed.`
      );
      refetch();
    },
    onError: (error: any) => {
      showToast.error(error?.response?.data?.message || 'Failed to reconcile transactions');
    },
  });

  const transactions: PaymentTransaction[] = useMemo(() => {
    const payload = transactionsResponse?.data;
    if (Array.isArray(payload)) {
      return payload as PaymentTransaction[];
    }
    if (payload && Array.isArray((payload as any).data)) {
      return (payload as any).data as PaymentTransaction[];
    }
    return [];
  }, [transactionsResponse]);

  const [modeFilter, setModeFilter] = useState<'all' | PaymentMode>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | PaymentStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction: any) => {
      if (modeFilter !== 'all' && transaction.mode !== modeFilter) return false;
      if (statusFilter !== 'all' && transaction.status !== statusFilter) return false;
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const admission = transaction.admissionId;
        const joining = transaction.joiningId;
        const isApproved = !!admission;
        const leadData = isApproved 
          ? (admission?.leadData || {})
          : (joining?.leadData || {});
        const enquiryNumber = isApproved 
          ? (admission?.enquiryNumber || '')
          : (leadData?.enquiryNumber || '');
        const admissionNumber = isApproved ? (admission?.admissionNumber || '') : '';
        const studentName = leadData?.name || '';
        
        const matches =
          transaction.leadId?.toLowerCase().includes(term) ||
          transaction.cashfreeOrderId?.toLowerCase().includes(term) ||
          transaction.referenceId?.toLowerCase().includes(term) ||
          admissionNumber.toLowerCase().includes(term) ||
          enquiryNumber.toLowerCase().includes(term) ||
          studentName.toLowerCase().includes(term);
        if (!matches) return false;
      }
      return true;
    });
  }, [transactions, modeFilter, statusFilter, searchTerm]);

  const summary = useMemo(() => {
    let totalCollected = 0;
    let totalPending = 0;
    let totalFailed = 0;

    transactions.forEach((transaction) => {
      if (transaction.status === 'success') {
        totalCollected += transaction.amount;
      } else if (transaction.status === 'pending') {
        totalPending += transaction.amount;
      } else if (transaction.status === 'failed') {
        totalFailed += transaction.amount;
      }
    });

    return {
      totalCollected,
      totalPending,
      totalFailed,
      count: transactions.length,
    };
  }, [transactions]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-5 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-900/40">
          <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-200">
            Total Collected
          </p>
          <p className="mt-2 text-xl font-semibold text-emerald-800 dark:text-emerald-100">
            {formatCurrency(summary.totalCollected)}
          </p>
        </div>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 px-4 py-5 shadow-sm dark:border-amber-900/60 dark:bg-amber-900/40">
          <p className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-200">
            Pending Verification
          </p>
          <p className="mt-2 text-xl font-semibold text-amber-700 dark:text-amber-100">
            {formatCurrency(summary.totalPending)}
          </p>
        </div>
        <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-900/40">
          <p className="text-xs uppercase tracking-wide text-rose-700 dark:text-rose-200">
            Failed Payments
          </p>
          <p className="mt-2 text-xl font-semibold text-rose-700 dark:text-rose-100">
            {formatCurrency(summary.totalFailed)}
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white/95 px-4 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Transactions Recorded
          </p>
          <p className="mt-2 text-xl font-semibold text-slate-800 dark:text-slate-100">
            {summary.count}
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end lg:gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Payment Mode
              </label>
              <select
                value={modeFilter}
                onChange={(event) => setModeFilter(event.target.value as 'all' | PaymentMode)}
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
              >
                <option value="all">All</option>
                <option value="cash">Cash</option>
                <option value="online">Online (Cashfree)</option>
                <option value="upi_qr">UPI QR</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Payment Status
              </label>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | PaymentStatus)}
                className="w-full rounded-xl border-2 border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
              >
                <option value="all">All</option>
                <option value="success">Success</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="sm:col-span-2 lg:flex-1">
              <Input
                label="Search by Admission # / Enquiry # / Order ID / Reference"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Type to filter transactions"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => reconcileMutation.mutate()}
              disabled={reconcileMutation.isPending || isLoading}
            >
              {reconcileMutation.isPending ? 'Reconciling...' : 'Reconcile Pending'}
            </Button>
            <Button variant="secondary" onClick={() => refetch()} disabled={isLoading}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
          <table className="min-w-full divide-y divide-slate-200 bg-white/95 dark:divide-slate-700 dark:bg-slate-900/60">
            <thead className="bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Student / Reference</th>
                <th className="px-4 py-3 text-left">Course / Branch / Quota</th>
                <th className="px-4 py-3 text-left">Mode</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Collector / Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm dark:divide-slate-700">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    Loading transactions…
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    No transactions match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((transaction: any) => {
                  // Get data from admission if approved, otherwise from joining
                  const admission = transaction.admissionId;
                  const joining = transaction.joiningId;
                  
                  // If approved, use admission data
                  const isApproved = !!admission;
                  const leadData = isApproved 
                    ? (admission?.leadData || {})
                    : (joining?.leadData || {});
                  
                  const studentName = leadData?.name || '—';
                  const enquiryNumber = isApproved 
                    ? (admission?.enquiryNumber || '—')
                    : (leadData?.enquiryNumber || '—');
                  const admissionNumber = isApproved ? (admission?.admissionNumber || '—') : null;
                  
                  // Course, branch, quota from admission or joining
                  const courseInfo = isApproved 
                    ? admission?.courseInfo 
                    : joining?.courseInfo;
                  // Use managed course/branch from IDs, fallback to stored names
                  const courseName = getCourseName(courseInfo?.courseId || transaction.courseId) || 
                    courseInfo?.course || '—';
                  const branchName = getBranchName(courseInfo?.branchId || transaction.branchId) || 
                    courseInfo?.branch || '';
                  const quota = courseInfo?.quota || '—';
                  
                  const modeLabel =
                    transaction.mode === 'cash'
                      ? 'Cash'
                      : transaction.mode === 'online'
                      ? 'Online (Cashfree)'
                      : 'UPI QR';
                  const statusClass =
                    transaction.status === 'success'
                      ? 'text-emerald-600 dark:text-emerald-300'
                      : transaction.status === 'failed'
                      ? 'text-rose-600 dark:text-rose-300'
                      : 'text-amber-600 dark:text-amber-300';
                  const collectorName =
                    typeof transaction.collectedBy === 'object'
                      ? transaction.collectedBy?.name
                      : undefined;
                  
                  return (
                    <tr key={transaction._id} className="hover:bg-blue-50/30 dark:hover:bg-slate-800/60">
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {formatDateTime(transaction.processedAt || transaction.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div className="flex flex-col gap-0.5">
                          {isApproved && admissionNumber ? (
                            <span className="font-semibold text-slate-800 dark:text-slate-100">
                              {admissionNumber}
                            </span>
                          ) : (
                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                              {enquiryNumber}
                            </span>
                          )}
                          <span className="text-xs text-slate-500 dark:text-slate-400">{studentName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div className="flex flex-col gap-0.5">
                          <span>{courseName}</span>
                          {branchName && <span className="text-xs text-slate-500 dark:text-slate-400">{branchName}</span>}
                          {quota && quota !== '—' && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">Quota: {quota}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {modeLabel}
                      </td>
                      <td className={`px-4 py-3 text-sm font-semibold capitalize ${statusClass}`}>
                        {transaction.status}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {formatCurrency(transaction.amount)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {collectorName && <span>By {collectorName}</span>}
                        {transaction.referenceId && (
                          <span className="ml-2 font-mono">Ref: {transaction.referenceId}</span>
                        )}
                        {transaction.cashfreeOrderId && (
                          <span className="ml-2 font-mono">Order: {transaction.cashfreeOrderId}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}


