'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import type { PaymentSummary, PaymentTransaction, CashfreeConfigPreview } from '@/types';

type JoiningStepTwoPaymentsPanelProps = {
  courseName?: string;
  branchName?: string;
  quota?: string;
  paymentSummary: PaymentSummary | null;
  transactions: PaymentTransaction[];
  isLoadingTransactions: boolean;
  formatCurrency: (amount?: number | null) => string;
  formatDateTime: (value?: string) => string;
  baseFeeTarget: number;
  baseFeePaid: number;
  outstandingBalance: number;
  additionalFeePaid: number;
  totalAmountPaid: number;
  configuredFee: number | null;
  paymentStatusBadgeClass: string;
  paymentStatusLabel: string;
  cashfreeConfig: CashfreeConfigPreview | null | undefined;
  canAccessPaymentsModule: boolean;
  canWritePayments: boolean;
  canUseCashfree: boolean;
  paymentActionsDisabled: boolean;
  isAdditionalFeeMode: boolean;
  shouldShowAdditionalFeeButton: boolean;
  isProcessingPayment: boolean;
  onOpenCash: () => void;
  onOpenOnline: () => void;
  onToggleAdditionalFeeMode: () => void;
  /** Inline Step 2 cash entry (same fields as Record Cash Payment modal). */
  paymentAmount: string;
  paymentReferenceId: string;
  onPaymentAmountChange: (value: string) => void;
  onPaymentReferenceChange: (value: string) => void;
  onRecordCashPayment: () => void;
  paymentRecordDisabled?: boolean;
  /** View-only admission detail — hide edit copy and configuration warnings. */
  readOnly?: boolean;
};

/** Admission fee collection for Step 2 — inline amount / reference entry (fee-config UI hidden, code retained). */
export function JoiningStepTwoPaymentsPanel({
  courseName,
  branchName,
  quota,
  paymentSummary,
  transactions,
  isLoadingTransactions,
  formatCurrency,
  formatDateTime,
  baseFeeTarget,
  baseFeePaid,
  outstandingBalance,
  additionalFeePaid,
  totalAmountPaid,
  configuredFee,
  paymentStatusBadgeClass,
  paymentStatusLabel,
  cashfreeConfig,
  canAccessPaymentsModule,
  canWritePayments,
  canUseCashfree,
  paymentActionsDisabled,
  isAdditionalFeeMode,
  shouldShowAdditionalFeeButton,
  isProcessingPayment,
  onOpenCash,
  onOpenOnline,
  onToggleAdditionalFeeMode,
  paymentAmount,
  paymentReferenceId,
  onPaymentAmountChange,
  onPaymentReferenceChange,
  onRecordCashPayment,
  paymentRecordDisabled = false,
  readOnly = false,
}: JoiningStepTwoPaymentsPanelProps) {
  return (
    <section
      id="joining-step-two-payments"
      className="scroll-mt-24 space-y-6 rounded-2xl border border-indigo-200/80 bg-white/95 p-6 shadow-md dark:border-indigo-900/50 dark:bg-slate-900/70"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Payments &amp; transactions
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {readOnly
              ? 'Admission fee collected during Step 2 of the workflow.'
              : 'Enter the amount received and transaction / reference ID below, then record the payment. Student details auto-fill on the printable slip when you print from the payment dialog.'}
          </p>
          {/* Legacy fee-configuration copy — kept for rollback, hidden from Step 2 UI */}
          <p className="mt-1 hidden text-sm text-slate-600 dark:text-slate-400">
            Admission fee from{' '}
            <Link
              href="/superadmin/payments/settings"
              className="font-semibold text-indigo-700 underline underline-offset-2 dark:text-indigo-300"
            >
              Payments → Fee Configuration
            </Link>
            . Record cash or pay online — enter amount and transaction / reference ID in the dialog (student
            details auto-fill on the printable slip).
          </p>
          {(courseName || branchName || quota) && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {courseName ? (
                <span className="rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
                  Course: {courseName}
                </span>
              ) : null}
              {branchName ? (
                <span className="rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
                  Branch: {branchName}
                </span>
              ) : null}
              {quota ? (
                <span className="rounded-full bg-indigo-50 px-3 py-1 font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
                  Quota: {quota}
                </span>
              ) : null}
              {configuredFee != null ? (
                <span className="hidden rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                  Configured fee: {formatCurrency(configuredFee)}
                </span>
              ) : null}
            </div>
          )}
          {paymentSummary?.lastPaymentAt && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Last payment:{' '}
              <span className="font-semibold">{formatDateTime(paymentSummary.lastPaymentAt)}</span>
            </p>
          )}
        </div>
        {canAccessPaymentsModule ? (
          <div className="hidden flex-wrap gap-2">
            <Button variant="primary" onClick={onOpenCash} disabled={paymentActionsDisabled}>
              {isAdditionalFeeMode ? 'Record additional cash' : 'Record cash payment'}
            </Button>
            <Button
              variant={isAdditionalFeeMode ? 'secondary' : 'outline'}
              onClick={onOpenOnline}
              disabled={!canUseCashfree || paymentActionsDisabled}
            >
              {isAdditionalFeeMode ? 'Additional fee online' : 'Collect payment online'}
            </Button>
            {shouldShowAdditionalFeeButton && (
              <Button
                variant={isAdditionalFeeMode ? 'secondary' : 'outline'}
                onClick={onToggleAdditionalFeeMode}
                disabled={isProcessingPayment || !canWritePayments}
              >
                {isAdditionalFeeMode ? 'Cancel additional fee' : 'Additional fee'}
              </Button>
            )}
          </div>
        ) : (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            Payments module is read-only for your role.
          </p>
        )}
        {isAdditionalFeeMode && (
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            Additional fee mode
          </div>
        )}
      </div>

      {!readOnly && !canUseCashfree && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/40 dark:text-amber-200">
          Cashfree is not active. Configure credentials under Payment Settings to collect online.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Total paid</span>
              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrency(totalAmountPaid)}
              </span>
            </div>
            <div className="mt-4">
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${paymentStatusBadgeClass}`}
              >
                <span className="inline-block h-2 w-2 rounded-full bg-current opacity-75" />
                {paymentStatusLabel}
              </span>
              {cashfreeConfig && (
                <span className="ml-2 hidden text-[10px] uppercase text-slate-400">Cashfree: production</span>
              )}
            </div>

            {canWritePayments ? (
              <div className="mt-6 space-y-4 border-t border-slate-200 pt-4 dark:border-slate-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Record cash payment
                </p>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Amount (INR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={paymentAmount}
                    onChange={(event) => onPaymentAmountChange(event.target.value)}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                    placeholder="Enter amount"
                    disabled={isProcessingPayment || paymentRecordDisabled}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                    Transaction / reference ID
                    <span className="ml-1 font-normal text-slate-500">(receipt no., UTR, etc.)</span>
                  </label>
                  <input
                    type="text"
                    value={paymentReferenceId}
                    onChange={(event) => onPaymentReferenceChange(event.target.value)}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                    placeholder="Enter receipt or reference number"
                    disabled={isProcessingPayment || paymentRecordDisabled}
                  />
                </div>
                <Button
                  variant="primary"
                  className="w-full sm:w-auto"
                  onClick={onRecordCashPayment}
                  disabled={isProcessingPayment || paymentRecordDisabled}
                >
                  {isProcessingPayment ? 'Processing…' : 'Record payment'}
                </Button>
              </div>
            ) : null}

            {/* Legacy fee-configuration summary rows — hidden, kept for rollback */}
            <div className="hidden">
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Total fee</span>
                <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {formatCurrency(baseFeeTarget)}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Paid</span>
                <span className="text-base font-semibold text-emerald-600 dark:text-emerald-300">
                  {formatCurrency(baseFeePaid)}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Balance</span>
                <span className="text-base font-semibold text-blue-600 dark:text-blue-300">
                  {formatCurrency(outstandingBalance)}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Additional fee paid</span>
                <span className="text-base font-semibold text-amber-600 dark:text-amber-300">
                  {formatCurrency(additionalFeePaid)}
                </span>
              </div>
            </div>
          </div>
          {configuredFee !== null && outstandingBalance > configuredFee && (
            <div className="hidden rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600 dark:border-rose-900/60 dark:bg-rose-900/40 dark:text-rose-200">
              Balance exceeds configured fee — verify course selection and fee setup.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Payment activity</h4>
          {isLoadingTransactions ? (
            <p className="mt-4 text-sm text-slate-500">Loading transactions…</p>
          ) : transactions.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No payments recorded yet.</p>
          ) : (
            <ul className="mt-4 max-h-80 space-y-3 overflow-y-auto">
              {transactions.map((transaction) => {
                const txKey = transaction._id || transaction.id || String(transaction.createdAt);
                const modeLabel =
                  transaction.mode === 'cash'
                    ? 'Cash'
                    : transaction.mode === 'online'
                      ? 'Cashfree'
                      : 'Online';
                const statusClass =
                  transaction.status === 'success'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : transaction.status === 'failed'
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-amber-600 dark:text-amber-400';
                const collectorName =
                  typeof transaction.collectedBy === 'object'
                    ? transaction.collectedBy?.name
                    : undefined;
                const paidAt = transaction.processedAt || transaction.createdAt;
                const amountValue =
                  typeof transaction.amount === 'number' && !Number.isNaN(transaction.amount)
                    ? transaction.amount
                    : Number(transaction.amount) || 0;

                return (
                  <li
                    key={txKey}
                    className="rounded-lg border border-slate-200 px-4 py-3 text-sm dark:border-slate-700"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {modeLabel}
                          </span>
                          <span className={`text-[10px] font-semibold uppercase ${statusClass}`}>
                            {transaction.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {formatDateTime(paidAt)}
                        </p>
                      </div>
                      <span className="shrink-0 text-base font-semibold text-emerald-700 dark:text-emerald-300">
                        {formatCurrency(amountValue)}
                      </span>
                    </div>
                    {(transaction.referenceId || transaction.feeHeadName || collectorName) && (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        {transaction.referenceId ? (
                          <span className="font-mono">
                            Ref: {transaction.referenceId}
                            {transaction.feeHeadName || collectorName ? ' · ' : ''}
                          </span>
                        ) : null}
                        {transaction.feeHeadName ? (
                          <span className="font-medium">{transaction.feeHeadName}</span>
                        ) : null}
                        {collectorName ? (
                          <span>
                            {(transaction.referenceId || transaction.feeHeadName) && ' · '}
                            {collectorName}
                          </span>
                        ) : null}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
