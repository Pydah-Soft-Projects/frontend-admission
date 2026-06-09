'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import {
  WorkflowNextStepButton,
  WorkflowStickyActionBar,
} from '@/components/admission/AdmissionWorkflowSteps';
import { joiningAPI, courseAPI } from '@/lib/api';
import { CertificateInformationChecklistBlock } from '@/components/joining/CertificateInformationChecklistPanel';
import { JoiningStepTwoPaymentsPanel } from '@/components/joining/JoiningStepTwoPaymentsPanel';
import { showToast } from '@/lib/toast';
import { useJoiningDeskPermissions } from '@/components/layout/DashboardShell';
import {
  buildCertificateChecklistStoredValue,
  certificateChecklistValuesEqual,
  computeCertificationStatusFromChecklist,
  listCertificateItemOptions,
  parseCertificateChecklistEntry,
  type CertificateChecklistStoredValue,
} from '@/lib/certificateChecklistEntry';
import { stripJoiningRedundantRegistrationExtras } from '@/lib/joiningRegistrationFieldFilter';
import type {
  CertificateGuidance,
  Joining,
  JoiningDocumentStatus,
  PaymentSummary,
  PaymentTransaction,
} from '@/types';

const formatCurrency = (amount?: number | null) => {
  if (amount === undefined || amount === null || Number.isNaN(amount)) {
    return '—';
  }
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return String(amount);
  }
};

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  return new Date(value).toLocaleString();
};

type AdmissionStepTwoPanelProps = {
  joiningId: string;
  admissionId: string;
  course: string;
  branch: string;
  quota: string;
  batch: string | null;
  disabled?: boolean;
  /** View-only admission detail page — no save, no workflow footer, read-only checklist. */
  readOnly?: boolean;
  paymentSummary?: PaymentSummary | null;
  transactions?: PaymentTransaction[];
};

export function AdmissionStepTwoPanel({
  joiningId,
  admissionId,
  course,
  branch,
  quota,
  batch,
  disabled = false,
  readOnly = false,
  paymentSummary = null,
  transactions = [],
}: AdmissionStepTwoPanelProps) {
  const queryClient = useQueryClient();
  const { canEditAdmission } = useJoiningDeskPermissions();
  const canWrite = !readOnly && canEditAdmission && !disabled;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['joining', joiningId],
    queryFn: async () => joiningAPI.getByLeadId(joiningId),
    enabled: Boolean(joiningId),
  });

  const joining = (data?.data?.joining ?? null) as Joining | null;

  const programLevelTrimmed = (joining?.courseInfo?.programLevel || '').trim();

  const { data: certificateGuidanceResponse, isLoading: isLoadingCertificateGuidance } = useQuery({
    queryKey: ['courses', 'certificate-guidance', programLevelTrimmed, 'admission-step-two'],
    enabled: Boolean(programLevelTrimmed),
    queryFn: async () => courseAPI.getCertificateGuidance(programLevelTrimmed),
  });

  const certificateGuidance: CertificateGuidance | null = useMemo(() => {
    const envelope = certificateGuidanceResponse?.data ?? certificateGuidanceResponse;
    const inner =
      envelope && typeof envelope === 'object' && 'data' in envelope
        ? (envelope as { data: unknown }).data
        : envelope;
    if (!inner || typeof inner !== 'object') return null;
    return inner as CertificateGuidance;
  }, [certificateGuidanceResponse]);

  const [registrationExtras, setRegistrationExtras] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!joining) return;
    const rf = joining.registrationFormData;
    setRegistrationExtras(rf && typeof rf === 'object' && !Array.isArray(rf) ? { ...rf } : {});
  }, [joining?._id, joining?.updatedAt]);

  const totalPaid = paymentSummary?.totalPaid ?? 0;
  const effectiveTotalFee = paymentSummary?.totalFee ?? 0;
  const outstandingBalance = Math.max(effectiveTotalFee - totalPaid, 0);
  const inferredPaymentStatus = paymentSummary?.status
    ? paymentSummary.status
    : totalPaid <= 0
      ? 'not_started'
      : outstandingBalance <= 0.5
        ? 'paid'
        : 'partial';
  const paymentStatusLabel = inferredPaymentStatus.replace(/_/g, ' ');
  const paymentStatusBadgeClass =
    inferredPaymentStatus === 'paid'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200'
      : inferredPaymentStatus === 'partial'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200'
        : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  const additionalFeePaid = useMemo(() => {
    return transactions
      .filter((transaction) => transaction.isAdditionalFee && transaction.status === 'success')
      .reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
  }, [transactions]);
  const baseFeeTarget = effectiveTotalFee || 0;
  const normalizedBaseFeePaid = Math.max(totalPaid - additionalFeePaid, 0);
  const baseFeePaid =
    baseFeeTarget > 0 ? Math.min(normalizedBaseFeePaid, baseFeeTarget) : normalizedBaseFeePaid;

  useEffect(() => {
    const items = certificateGuidance?.items;
    if (!items?.length || certificateGuidance?.format !== 'certificate_config') {
      return;
    }
    setRegistrationExtras((prev) => {
      const prevRaw = prev.certificate_checklist;
      const prevMap =
        prevRaw && typeof prevRaw === 'object' && !Array.isArray(prevRaw)
          ? (prevRaw as Record<string, unknown>)
          : {};
      const nextMap: Record<string, CertificateChecklistStoredValue> = {};
      for (const item of items) {
        const id = String(item.id || item.name || '').trim();
        if (!id) continue;
        const opts = listCertificateItemOptions(item);
        const prevEntry = parseCertificateChecklistEntry(prevMap[id]);
        if (opts.length > 0) {
          const valid = new Set(opts.map((o) => o.encoded));
          const option =
            prevEntry.option && valid.has(prevEntry.option)
              ? prevEntry.option
              : opts[0]!.encoded;
          nextMap[id] = { status: prevEntry.status, option };
        } else {
          nextMap[id] = prevEntry.status;
        }
      }
      const prevKeys = Object.keys(prevMap).sort().join(',');
      const nextKeys = Object.keys(nextMap).sort().join(',');
      if (prevKeys === nextKeys) {
        let allMatch = true;
        for (const k of Object.keys(nextMap)) {
          if (!certificateChecklistValuesEqual(prevMap[k], nextMap[k])) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) return prev;
      }
      return { ...prev, certificate_checklist: nextMap };
    });
  }, [certificateGuidance?.format, certificateGuidance?.items]);

  const certificateChecklistParsed = useMemo(() => {
    const raw = registrationExtras.certificate_checklist;
    const out: Record<string, { status: JoiningDocumentStatus; option?: string }> = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return out;
    }
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      out[k] = parseCertificateChecklistEntry(v);
    }
    return out;
  }, [registrationExtras.certificate_checklist]);

  const derivedCertificationStatus = useMemo((): 'Verified' | 'Unverified' | null => {
    if (certificateGuidance?.format !== 'certificate_config' || !certificateGuidance.items?.length) {
      return null;
    }
    return computeCertificationStatusFromChecklist(
      certificateGuidance.items,
      registrationExtras.certificate_checklist
    );
  }, [certificateGuidance, registrationExtras.certificate_checklist]);

  const updateCertificateChecklistStatus = useCallback(
    (itemId: string, value: JoiningDocumentStatus, hasOptions: boolean) => {
      const id = String(itemId || '').trim();
      if (!id) return;
      setRegistrationExtras((prev) => {
        const raw = prev.certificate_checklist;
        const cur =
          raw && typeof raw === 'object' && !Array.isArray(raw)
            ? { ...(raw as Record<string, CertificateChecklistStoredValue>) }
            : {};
        const prevEntry = parseCertificateChecklistEntry(cur[id]);
        cur[id] = buildCertificateChecklistStoredValue(hasOptions, value, prevEntry.option);
        return { ...prev, certificate_checklist: cur };
      });
    },
    []
  );

  const updateCertificateChecklistOption = useCallback((itemId: string, encoded: string) => {
    const id = String(itemId || '').trim();
    if (!id) return;
    setRegistrationExtras((prev) => {
      const raw = prev.certificate_checklist;
      const cur =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? { ...(raw as Record<string, CertificateChecklistStoredValue>) }
          : {};
      const prevEntry = parseCertificateChecklistEntry(cur[id]);
      cur[id] = { status: prevEntry.status, option: encoded.trim() || undefined };
      return { ...prev, certificate_checklist: cur };
    });
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const stripped = stripJoiningRedundantRegistrationExtras({ ...registrationExtras });
      const registrationFormData =
        derivedCertificationStatus !== null
          ? {
              ...stripped,
              certification_status: derivedCertificationStatus,
              certificates_status: derivedCertificationStatus,
            }
          : stripped;
      return joiningAPI.patchStepTwo(joiningId, {
        registrationFormData,
      });
    },
    onSuccess: async () => {
      showToast.success('Certificate checklist saved');
      await queryClient.invalidateQueries({ queryKey: ['joining', joiningId] });
      await queryClient.invalidateQueries({ queryKey: ['admission', admissionId] });
      await queryClient.invalidateQueries({ queryKey: ['joining', 'registration-form-data', joiningId] });
    },
    onError: (error: { response?: { data?: { message?: string } } }) => {
      showToast.error(error.response?.data?.message || 'Failed to save');
    },
  });

  if (!joiningId) return null;

  if (isLoading && !joining) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
        Loading joining data for Step 2…
      </div>
    );
  }

  if (isError || !joining) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-6 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
        Could not load the linked joining record. Open the joining workspace to verify the link.
      </div>
    );
  }

  if (joining.status !== 'approved') {
    const isPendingApproval = joining.status === 'pending_approval';
    return (
      <div
        id="admission-step-two"
        className="scroll-mt-24 rounded-2xl border border-amber-200 bg-amber-50/80 p-6 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
          Step 2 — Certificate checklist &amp; admission fee
        </p>
        <p className="mt-2">
          Step 2 unlocks after the joining is <span className="font-semibold">approved</span>. Current status:{' '}
          <span className="font-mono">{joining.status}</span>.
        </p>
        {isPendingApproval ? (
          <WorkflowStickyActionBar
            id="admission-step-two-pending-actions"
            stepLabel="Step 1 actions required first"
            className="mt-6 border-amber-300/80 bg-amber-50/95 dark:border-amber-800 dark:bg-amber-950/50"
            hint="Save any last edits on the joining form, then approve the application to unlock certificate checklist and fee lines here."
          >
            <Link href={`/superadmin/joining/${joiningId}#joining-wizard-step-3`}>
              <Button type="button" variant="outline" size="sm">
                Save Draft
              </Button>
            </Link>
            <Link href={`/superadmin/joining/${joiningId}#joining-step-one-actions`}>
              <Button type="button" variant="primary" size="sm">
                Approve
              </Button>
            </Link>
          </WorkflowStickyActionBar>
        ) : null}
      </div>
    );
  }

  return (
    <section
      id="admission-step-two"
      className="scroll-mt-24 space-y-8 rounded-2xl border-2 border-indigo-200/80 bg-gradient-to-b from-indigo-50/50 to-white/95 p-6 shadow-lg shadow-indigo-100/30 backdrop-blur dark:border-indigo-900/50 dark:from-indigo-950/25 dark:to-slate-900/70 dark:shadow-none"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            Step 2
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            Certificate checklist &amp; admission fee
          </h2>
        </div>
        {!readOnly ? (
          <Button
            type="button"
            variant="primary"
            disabled={!canWrite || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save certificate checklist'}
          </Button>
        ) : null}
      </div>

      <CertificateInformationChecklistBlock
        variant="admission-step-two"
        radioNameSuffix="-admission-step2"
        derivedCertificationStatus={derivedCertificationStatus}
        programLevelTrimmed={programLevelTrimmed}
        isLoadingCertificateGuidance={isLoadingCertificateGuidance}
        certificateGuidance={certificateGuidance}
        certificateChecklistParsed={certificateChecklistParsed}
        onChecklistOptionChange={updateCertificateChecklistOption}
        onChecklistStatusChange={updateCertificateChecklistStatus}
        readOnly={readOnly}
      />

      <JoiningStepTwoPaymentsPanel
        courseName={course}
        branchName={branch}
        quota={quota}
        paymentSummary={paymentSummary}
        transactions={transactions}
        isLoadingTransactions={false}
        formatCurrency={formatCurrency}
        formatDateTime={formatDateTime}
        baseFeeTarget={baseFeeTarget}
        baseFeePaid={baseFeePaid}
        outstandingBalance={outstandingBalance}
        additionalFeePaid={additionalFeePaid}
        totalAmountPaid={Math.max(totalPaid, 0)}
        configuredFee={effectiveTotalFee > 0 ? effectiveTotalFee : null}
        paymentStatusBadgeClass={paymentStatusBadgeClass}
        paymentStatusLabel={paymentStatusLabel}
        cashfreeConfig={null}
        canAccessPaymentsModule
        canWritePayments={false}
        canUseCashfree={false}
        paymentActionsDisabled
        isAdditionalFeeMode={false}
        shouldShowAdditionalFeeButton={false}
        isProcessingPayment={false}
        onOpenCash={() => {}}
        onOpenOnline={() => {}}
        onToggleAdditionalFeeMode={() => {}}
        paymentAmount=""
        paymentReferenceId=""
        onPaymentAmountChange={() => {}}
        onPaymentReferenceChange={() => {}}
        onRecordCashPayment={() => {}}
        paymentRecordDisabled
        readOnly={readOnly}
      />

      {!readOnly ? (
        <WorkflowStickyActionBar
          id="admission-step-two-actions"
          stepLabel="Step 2 actions"
          className="border-indigo-200/80 dark:border-indigo-900/50"
          hint="Review the admission fee collected above, then continue to Step 3."
        >
          <WorkflowNextStepButton
            fromStep={2}
            surface="admission-detail"
            joiningId={joiningId}
            admissionId={admissionId}
          />
        </WorkflowStickyActionBar>
      ) : null}
    </section>
  );
}
