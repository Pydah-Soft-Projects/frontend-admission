'use client';

import { useEffect, useState, useMemo } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { admissionAPI, joiningAPI, paymentAPI } from '@/lib/api';
import { Admission, JoiningDocuments, PaymentSummary, PaymentTransaction } from '@/types';
import { isJoiningDocumentChecklistKeyVisible } from '@/lib/joiningDocumentChecklist';
import { showToast } from '@/lib/toast';
import { useDashboardHeader, useJoiningDeskPermissions } from '@/components/layout/DashboardShell';
import { AdmissionReferenceEditor } from '@/components/admission/AdmissionReferenceEditor';
import { resolveJoiningReference1 } from '@/lib/joiningApplicationViewDisplay';
import { useCourseLookup } from '@/hooks/useCourseLookup';
import { resolveJoiningOrAdmissionCourseLabel } from '@/lib/admissionCourseDisplay';
import { PrintableStudentApplication } from '@/components/PrintableStudentApplication';
import {
  PrintableAdmitCard,
  pickStudentPortraitForAdmitCard,
} from '@/components/joining/PrintableAdmitCard';
import { AdmissionStepTwoPanel } from '@/components/admission/AdmissionStepTwoPanel';
import {
  AdmissionWorkflowStepButtons,
  WorkflowNextStepButton,
  WorkflowStickyActionBar,
} from '@/components/admission/AdmissionWorkflowSteps';
import {
  cleanRegistrationFieldEntries,
  formatRegistrationFieldLabel,
  isRegistrationImageDataUrl,
} from '@/lib/registrationFieldsDisplay';
import { ApplicationSectionCard } from '@/components/admission/ApplicationSectionCard';

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
    return amount.toString();
  }
};

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  return new Date(value).toLocaleString();
};

const maskAadhaar = (value?: string) => {
  if (!value) return '—';
  if (value.length <= 4) return value;
  return `${value.slice(0, 4)} ${'•'.repeat(4)} ${value.slice(-4)}`;
};

const ADMISSION_CANCELLED_STATUS = 'Admission Cancelled';

const MEDIUM_OPTIONS: Array<{ value: 'english' | 'telugu' | 'other'; label: string }> = [
  { value: 'english', label: 'English' },
  { value: 'telugu', label: 'Telugu' },
  { value: 'other', label: 'Others' },
];

type AdmissionCancellationDetails = {
  reason?: string;
  approvedBy?: string;
  cancelledAt?: string;
};

type AdmissionLeadData = Record<string, unknown> & {
  enquiryNumber?: string;
  academicYear?: number | string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  _admissionCancellation?: AdmissionCancellationDetails;
};

const resolveBatch = (
  admission?: Admission,
  lead?: AdmissionLeadData
): string | null => {
  const rawAcademicYear = lead?.academicYear;
  if (rawAcademicYear !== undefined && rawAcademicYear !== null && String(rawAcademicYear).trim() !== '') {
    return String(rawAcademicYear).trim();
  }
  const admissionDate = admission?.admissionDate || admission?.createdAt;
  if (admissionDate) {
    const parsed = new Date(admissionDate);
    if (!Number.isNaN(parsed.getTime())) {
      return String(parsed.getFullYear());
    }
  }
  return null;
};

type NestedPaymentPayload = {
  data?: PaymentTransaction[];
};

type StudentInfoWithNotes = Admission['studentInfo'] & {
  notes?: string;
};

type ApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

const formatAdmissionStatus = (status?: string) => {
  if (status === 'active') return 'Active';
  if (status === 'withdrawn') return 'Withdrawn';
  if (status === ADMISSION_CANCELLED_STATUS) return ADMISSION_CANCELLED_STATUS;
  return status || '—';
};

export default function AdmissionDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const admissionId = Array.isArray(params?.admissionId) ? params.admissionId[0] : params?.admissionId;
  const { getCourseName, getBranchName, getCollegeNameForCourse } = useCourseLookup();
  const { canEditReference } = useJoiningDeskPermissions();

  const [revealedAadhaars, setRevealedAadhaars] = useState<{
    student: boolean;
    father: boolean;
    mother: boolean;
  }>({
    student: false,
    father: false,
    mother: false,
  });
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelForm, setCancelForm] = useState({
    reason: '',
    approvedBy: '',
  });
  const [isSendSmsDialogOpen, setIsSendSmsDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['admission', admissionId],
    enabled: !!admissionId,
    queryFn: async () => {
      const response = await admissionAPI.getById(admissionId as string);
      return response;
    },
    staleTime: 60_000,
  });

  const admission = data?.data?.admission as Admission | undefined;
  const lead =
    (admission?.leadData as AdmissionLeadData | undefined) ||
    (data?.data?.lead as AdmissionLeadData | undefined);
  const cancellationDetails = admission?.leadData?._admissionCancellation as
    | AdmissionCancellationDetails
    | undefined;
  const isAdmissionCancelled = admission?.status === ADMISSION_CANCELLED_STATUS;

  const cancelAdmissionMutation = useMutation({
    mutationFn: async () => {
      if (!admission?._id) {
        throw new Error('Admission record is not loaded');
      }
      return admissionAPI.cancelById(admission._id, {
        reason: cancelForm.reason.trim(),
        approvedBy: cancelForm.approvedBy.trim(),
      });
    },
    onSuccess: async () => {
      showToast.success('Admission cancelled successfully');
      setIsCancelDialogOpen(false);
      setCancelForm({ reason: '', approvedBy: '' });
      await queryClient.invalidateQueries({ queryKey: ['admission', admissionId] });
      await queryClient.invalidateQueries({ queryKey: ['admissions'] });
    },
    onError: (error: ApiError) => {
      showToast.error(error.response?.data?.message || 'Failed to cancel admission');
    },
  });

  const sendAdmissionSmsMutation = useMutation({
    mutationFn: async () => {
      if (!admission?._id) {
        throw new Error('Admission record is not loaded');
      }
      return admissionAPI.sendConfirmationSms(admission._id);
    },
    onSuccess: (response: { data?: { sentTo?: string; admissionNumber?: string } } | undefined) => {
      const sentTo = response?.data?.sentTo;
      showToast.success(
        sentTo
          ? `Admission confirmation SMS sent to ${sentTo}.`
          : 'Admission confirmation SMS sent.'
      );
      setIsSendSmsDialogOpen(false);
    },
    onError: (error: ApiError) => {
      showToast.error(
        error.response?.data?.message || 'Failed to send admission confirmation SMS'
      );
    },
  });

  // Fetch payment information - use paymentSummary from admission if available
  const paymentSummary: PaymentSummary | null = useMemo(() => {
    if (admission?.paymentSummary) {
      return admission.paymentSummary;
    }
    return null;
  }, [admission]);

  const hasRegistrationOnAdmission = Boolean(
    admission?.registrationFormData &&
      Object.keys(admission.registrationFormData).length > 0
  );
  const hasReferenceOnAdmission = Boolean(
    admission?.referenceName ||
      String(
        (admission?.leadData as Record<string, unknown> | undefined)?.reference1 ?? ''
      ).trim()
  );
  const needsJoiningFallback =
    !!admission?.joiningId && (!hasRegistrationOnAdmission || !hasReferenceOnAdmission);

  const { data: transactionsData } = useQuery({
    queryKey: ['transactions', admission?._id],
    enabled: !!admission?._id,
    queryFn: async () => {
      if (!admission?._id) return null;
      try {
        const response = await paymentAPI.listTransactions({
          admissionId: admission._id,
          leadId: admission.leadId,
        });
        return response;
      } catch {
        return null;
      }
    },
  });

  const transactions: PaymentTransaction[] = useMemo(() => {
    const payload = transactionsData?.data;
    if (Array.isArray(payload)) {
      return payload as PaymentTransaction[];
    }
    if (payload && Array.isArray((payload as NestedPaymentPayload).data)) {
      return (payload as NestedPaymentPayload).data || [];
    }
    return [];
  }, [transactionsData]);

  const { data: joiningForRegistrationData } = useQuery({
    queryKey: ['joining', 'admission-detail', admission?.joiningId],
    enabled: needsJoiningFallback,
    queryFn: async () => {
      if (!admission?.joiningId) return null;
      try {
        const response = await joiningAPI.getByLeadId(admission.joiningId);
        return response;
      } catch {
        return null;
      }
    },
  });

  const joiningForReference = joiningForRegistrationData?.data?.joining;
  const leadForReference =
    (joiningForRegistrationData?.data?.lead as AdmissionLeadData | undefined) || lead;

  const resolvedReference1 = useMemo(
    () => resolveJoiningReference1(admission, joiningForReference, leadForReference),
    [admission, joiningForReference, leadForReference]
  );

  const joiningStatus =
    (joiningForRegistrationData?.data?.joining?.status as string | undefined) ?? 'approved';

  const registrationFieldEntries = useMemo<Array<[string, unknown]>>(() => {
    const registrationFieldSource =
      admission?.registrationFormData && Object.keys(admission.registrationFormData).length > 0
        ? admission.registrationFormData
        : ((joiningForRegistrationData?.data?.joining?.registrationFormData as
            | Record<string, unknown>
            | undefined) || {});
    return cleanRegistrationFieldEntries(registrationFieldSource);
  }, [admission?.registrationFormData, joiningForRegistrationData]);

  const admitCardPrintStudent = useMemo(() => {
    if (!admission) return null;
    const courseName =
      resolveJoiningOrAdmissionCourseLabel(admission, getCourseName) ||
      admission.courseInfo?.course ||
      '—';
    const branchName =
      getBranchName(admission.courseInfo?.branchId) || admission.courseInfo?.branch || '—';
    return {
      courseId: String(admission.courseInfo?.courseId ?? '').trim(),
      studentName: admission.studentInfo?.name || lead?.name || '—',
      admissionNumber: admission.admissionNumber,
      program: courseName,
      branch: branchName,
      studentPhone: admission.studentInfo?.phone || lead?.phone || '—',
      fatherPhone: admission.parents?.father?.phone || lead?.fatherPhone || '—',
      studentPhotoSrc: pickStudentPortraitForAdmitCard(admission),
      collegeName: getCollegeNameForCourse(admission.courseInfo?.courseId) || undefined,
    };
  }, [admission, lead, getCourseName, getBranchName, getCollegeNameForCourse]);

  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Admission Details
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {admission?.admissionNumber && `Admission #${admission.admissionNumber}`}
            {lead?.enquiryNumber && ` • Enquiry #${lead.enquiryNumber}`}
            {admission?.status && ` • ${formatAdmissionStatus(admission.status)}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          {admission ? (
            <AdmissionWorkflowStepButtons
              activeStep={2}
              surface="admission-detail"
              joiningId={admission.joiningId}
              admissionId={admission._id}
              joiningStatus={joiningStatus}
              isAdmissionCancelled={isAdmissionCancelled}
            />
          ) : null}
          {admission && (
            <PrintableStudentApplication
              application={admission}
              enquiryNumber={lead?.enquiryNumber ?? admission?.enquiryNumber}
              admissionNumber={admission.admissionNumber}
              courseName={resolveJoiningOrAdmissionCourseLabel(admission, getCourseName) || undefined}
              branchName={getBranchName(admission.courseInfo?.branchId) || admission.courseInfo?.branch || undefined}
              collegeName={getCollegeNameForCourse(admission.courseInfo?.courseId) || undefined}
              paymentSummary={paymentSummary ?? undefined}
              transactions={transactions}
              title="Student Application"
              printButtonLabel="Print application"
            />
          )}
          {admission && !isAdmissionCancelled && admission.admissionNumber && admission.studentInfo?.phone ? (
            <Button
              variant="outline"
              onClick={() => setIsSendSmsDialogOpen(true)}
              title={`Send the DLT-approved admission confirmation SMS to ${admission.studentInfo.phone}`}
            >
              Send Admission SMS
            </Button>
          ) : null}
          {admission?.joiningId && (
            <Link href={`/superadmin/joining/${admission.joiningId}/detail`}>
              <Button variant="outline">
                View Joining Form
              </Button>
            </Link>
          )}
          {admission && !isAdmissionCancelled && (
            <Button variant="danger" onClick={() => setIsCancelDialogOpen(true)}>
              Cancel Admission
            </Button>
          )}
          <Link href="/superadmin/joining/completed">
            <Button variant="outline">Back to List</Button>
          </Link>
        </div>
      </div>
    );
    return () => clearHeaderContent();
  }, [
    admission,
    lead,
    isAdmissionCancelled,
    paymentSummary,
    transactions,
    getCollegeNameForCourse,
    joiningStatus,
    setHeaderContent,
    clearHeaderContent,
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-400 border-t-transparent" />
      </div>
    );
  }

  if (!admission) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-lg text-slate-600 dark:text-slate-400">Admission not found</p>
        <Link href="/superadmin/joining/completed" className="mt-4">
          <Button variant="outline">Back to List</Button>
        </Link>
      </div>
    );
  }

  const toggleAadhaar = (type: 'student' | 'father' | 'mother') => {
    setRevealedAadhaars((prev) => ({
      ...prev,
      [type]: !prev[type],
    }));
  };

  const handleCancelAdmissionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cancelForm.reason.trim()) {
      showToast.error('Reason for cancellation is required');
      return;
    }
    if (!cancelForm.approvedBy.trim()) {
      showToast.error('Approved by is required');
      return;
    }
    cancelAdmissionMutation.mutate();
  };

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Lead/Enquiry Details - Top Section */}
      {lead && (
        <div className="rounded-2xl border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-white p-6 shadow-lg dark:border-purple-800 dark:from-purple-900/30 dark:to-slate-900/70">
          <h2 className="text-lg font-bold text-purple-700 dark:text-purple-300 mb-6 flex items-center gap-2">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Lead / Enquiry Information
          </h2>
          <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-4">
            <div className="rounded-lg bg-white/60 dark:bg-slate-800/50 p-4 border border-purple-100 dark:border-purple-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-300">Enquiry No</p>
              <p className="text-base font-bold text-purple-700 dark:text-purple-200 mt-2">{lead?.enquiryNumber || '—'}</p>
            </div>
            <div className="rounded-lg bg-white/60 dark:bg-slate-800/50 p-4 border border-purple-100 dark:border-purple-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-300">Lead Source</p>
              <p className="text-sm font-semibold text-purple-700 dark:text-purple-200 mt-2 capitalize">{lead?.source || '—'}</p>
            </div>
            <div className="rounded-lg bg-white/60 dark:bg-slate-800/50 p-4 border border-purple-100 dark:border-purple-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-300">Created On</p>
              <p className="text-sm font-semibold text-purple-700 dark:text-purple-200 mt-2">{formatDateTime(lead?.createdAt) || '—'}</p>
            </div>
            <div className="rounded-lg bg-white/60 dark:bg-slate-800/50 p-4 border border-purple-100 dark:border-purple-900">
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-300">Last Updated</p>
              <p className="text-sm font-semibold text-purple-700 dark:text-purple-200 mt-2">{formatDateTime(lead?.updatedAt) || '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Top Metadata Boxes */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border-2 border-red-600 bg-white p-4 shadow-md dark:bg-slate-900/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Application No
          </p>
          <p className="mt-2 text-lg font-bold text-red-600">{lead?.enquiryNumber || '—'}</p>
        </div>
        <div className="rounded-lg border-2 border-gray-400 bg-white p-4 shadow-md dark:bg-slate-900/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Admission No
          </p>
          <p className="mt-2 text-lg font-bold text-gray-700">{admission?.admissionNumber || '—'}</p>
        </div>
        <div className="rounded-lg border-2 border-gray-400 bg-white p-4 shadow-md dark:bg-slate-900/70">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            PIN No
          </p>
          <p className="mt-2 text-lg font-bold text-gray-700">—</p>
        </div>
      </div>

      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="w-[95vw] max-w-lg">
          <form onSubmit={handleCancelAdmissionSubmit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>Cancel Admission</DialogTitle>
              <DialogDescription>
                Capture the approval details before changing this student status to Admission Cancelled.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="cancel-reason"
                  className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                >
                  Reason for cancellation
                </label>
                <textarea
                  id="cancel-reason"
                  rows={4}
                  value={cancelForm.reason}
                  onChange={(event) =>
                    setCancelForm((prev) => ({ ...prev, reason: event.target.value }))
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 transition-all duration-200 placeholder:text-slate-400 hover:border-slate-300 hover:bg-white focus:border-orange-500/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-orange-500/10 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-100 dark:placeholder:text-slate-500 dark:hover:border-slate-700 dark:hover:bg-slate-900 dark:focus:border-orange-500/50 dark:focus:bg-slate-950 dark:focus:ring-orange-900/20"
                  placeholder="Enter cancellation reason"
                  required
                />
              </div>
              <Input
                id="cancel-approved-by"
                label="Approved by"
                value={cancelForm.approvedBy}
                onChange={(event) =>
                  setCancelForm((prev) => ({ ...prev, approvedBy: event.target.value }))
                }
                placeholder="Enter approver name"
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCancelDialogOpen(false)}
                disabled={cancelAdmissionMutation.isPending}
              >
                Close
              </Button>
              <Button type="submit" variant="danger" isLoading={cancelAdmissionMutation.isPending}>
                Submit
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isSendSmsDialogOpen} onOpenChange={setIsSendSmsDialogOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>Send Admission SMS</DialogTitle>
            <DialogDescription>
              Send the DLT-approved admission confirmation SMS to the student.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/40">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Recipient
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {admission?.studentInfo?.name || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Phone
              </span>
              <span className="font-mono text-slate-900 dark:text-slate-100">
                {admission?.studentInfo?.phone || '—'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Admission #
              </span>
              <span className="font-mono text-slate-900 dark:text-slate-100">
                {admission?.admissionNumber || '—'}
              </span>
            </div>
            <p className="border-t border-slate-200 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
              Template: <span className="font-mono">Admission · confirmation on approval</span> (DLT id is read live from{' '}
              <span className="font-mono">message_templates</span>). The student name and admission number are filled into the
              two <span className="font-mono">{'{#var#}'}</span> slots.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsSendSmsDialogOpen(false)}
              disabled={sendAdmissionSmsMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => sendAdmissionSmsMutation.mutate()}
              isLoading={sendAdmissionSmsMutation.isPending}
            >
              Send SMS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isAdmissionCancelled && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/30">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-300">
                Admission Cancelled
              </p>
              <p className="mt-2 text-sm font-medium text-rose-950 dark:text-rose-100">
                {cancellationDetails?.reason || 'Cancellation reason not available'}
              </p>
            </div>
            <div className="grid gap-2 text-sm text-rose-900 dark:text-rose-100 sm:grid-cols-2 md:text-right">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-500 dark:text-rose-300">
                  Approved by
                </p>
                <p className="font-semibold">{cancellationDetails?.approvedBy || '-'}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-500 dark:text-rose-300">
                  Cancelled at
                </p>
                <p className="font-semibold">{formatDateTime(cancellationDetails?.cancelledAt)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 1 — application data captured on the joining form */}
      <div id="admission-step-one" className="scroll-mt-24 space-y-6">
        <div className="rounded-xl border border-blue-200/80 bg-blue-50/60 px-5 py-4 dark:border-blue-900/50 dark:bg-blue-950/20">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">
            Step 1 — Online application
          </p>
          <p className="mt-1 text-sm text-blue-900/80 dark:text-blue-200/80">
            Read-only view of the approved joining form.{' '}
            {admission.joiningId ? (
              <Link
                href={`/superadmin/joining/${admission.joiningId}`}
                className="font-semibold text-blue-800 underline underline-offset-2 dark:text-blue-200"
              >
                Edit on joining workspace
              </Link>
            ) : null}
          </p>
        </div>

        <ApplicationSectionCard step={1} title="Student Information">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Course &amp; quota
          </h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400">College</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">
                {getCollegeNameForCourse(admission.courseInfo?.courseId) || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Course</p>
              <p className="mt-1 text-sm font-semibold text-blue-700 dark:text-blue-300">
                {resolveJoiningOrAdmissionCourseLabel(admission, getCourseName) || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Branch</p>
              <p className="mt-1 text-sm font-semibold text-blue-700 dark:text-blue-300">
                {getBranchName(admission.courseInfo?.branchId) || admission.courseInfo?.branch || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Quota</p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">
                {admission.courseInfo?.quota || '—'}
              </p>
            </div>
            {admission.courseInfo?.programLevel ? (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Program level</p>
                <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">
                  {admission.courseInfo.programLevel}
                </p>
              </div>
            ) : null}
          </div>
          <div className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-200/80 pt-6 md:grid-cols-2 md:gap-x-6 dark:border-slate-700">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">
                Merit
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-slate-100">
                {admission.qualifications?.merit === true
                  ? 'Yes'
                  : admission.qualifications?.merit === false
                    ? 'No'
                    : '—'}
              </p>
            </div>
            <AdmissionReferenceEditor
              admissionId={String(admission._id)}
              initialReference1={resolvedReference1}
              canEdit={canEditReference && !isAdmissionCancelled}
            />
          </div>
          <h3 className="mt-8 border-t border-slate-200/80 pt-6 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Student profile
          </h3>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Full Name</p>
                <p className="text-lg font-bold text-gray-900 dark:text-slate-100 mt-1">
                  {admission.studentInfo?.name || '—'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Phone</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">
                    {admission.studentInfo?.phone || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
                    Preferred mobile
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">
                    {admission.studentInfo?.preferredMobileNumber || '—'}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Gender</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">
                  {admission.studentInfo?.gender || '—'}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Date of Birth</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">
                  {admission.studentInfo?.dateOfBirth || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Aadhaar Number</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                    {revealedAadhaars.student
                      ? admission.studentInfo?.aadhaarNumber || '—'
                      : maskAadhaar(admission.studentInfo?.aadhaarNumber)}
                  </p>
                  {admission.studentInfo?.aadhaarNumber && (
                    <button
                      type="button"
                      onClick={() => toggleAadhaar('student')}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                      aria-label={revealedAadhaars.student ? 'Hide Aadhaar' : 'Show Aadhaar'}
                    >
                      <svg
                        className={`h-5 w-5 ${revealedAadhaars.student ? 'text-blue-600' : 'text-gray-400'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        {revealedAadhaars.student ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        ) : (
                          <>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </>
                        )}
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Notes</p>
                <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1 break-words">
                  {(admission.studentInfo as StudentInfoWithNotes)?.notes || '—'}
                </p>
              </div>
            </div>
          </div>
        </ApplicationSectionCard>

      {admission.parents && (
        <ApplicationSectionCard step={2} title="Parents Details">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-md font-semibold text-gray-800 dark:text-slate-200 mb-4">
                Father Information
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Name</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">
                    {admission.parents.father?.name || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Phone</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">
                    {admission.parents.father?.phone || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Aadhaar Number</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      {revealedAadhaars.father
                        ? admission.parents.father?.aadhaarNumber || '—'
                        : maskAadhaar(admission.parents.father?.aadhaarNumber)}
                    </p>
                    {admission.parents.father?.aadhaarNumber && (
                      <button
                        type="button"
                        onClick={() => toggleAadhaar('father')}
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {revealedAadhaars.father ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          )}
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-md font-semibold text-gray-800 dark:text-slate-200 mb-4">
                Mother Information
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Name</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">
                    {admission.parents.mother?.name || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Phone</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">
                    {admission.parents.mother?.phone || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Aadhaar Number</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      {revealedAadhaars.mother
                        ? admission.parents.mother?.aadhaarNumber || '—'
                        : maskAadhaar(admission.parents.mother?.aadhaarNumber)}
                    </p>
                    {admission.parents.mother?.aadhaarNumber && (
                      <button
                        type="button"
                        onClick={() => toggleAadhaar('mother')}
                        className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {revealedAadhaars.mother ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          )}
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ApplicationSectionCard>
      )}

      {admission.address && (
        <ApplicationSectionCard step={3} title="Address Details">
          <div className="space-y-6">
            {admission.address.communication && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">
                  Communication address
                </h3>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Door No / Street Name</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                    {admission.address.communication.doorOrStreet || '—'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Landmark</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      {admission.address.communication.landmark || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Village / City / Town</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      {admission.address.communication.villageOrCity || '—'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Mandal</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      {admission.address.communication.mandal || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">District</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      {admission.address.communication.district || '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Pin Code</p>
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                      {admission.address.communication.pinCode || '—'}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {admission.address.relatives && admission.address.relatives.length > 0 && (
              <div className="border-t border-slate-200/80 pt-6 dark:border-slate-700">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">
                  Relatives / friends
                </h3>
                <div className="space-y-3">
                  {admission.address.relatives.map((relative, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/40"
                    >
                      <p className="font-semibold text-gray-900 dark:text-slate-100">
                        {relative.name || '—'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        {relative.relationship || '—'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ApplicationSectionCard>
      )}

      {admission.reservation && (
        <ApplicationSectionCard step={4} title="Reservation Category">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">General Category</p>
              <div className="flex flex-wrap gap-3">
                {['OC', 'EWS', 'BC-A', 'BC-B', 'BC-C', 'BC-D', 'BC-E', 'SC', 'ST'].map((cat) => (
                  <span
                    key={cat}
                    className={`px-3 py-2 rounded-lg text-sm font-medium ${
                      admission.reservation.general?.toUpperCase() === cat ||
                      (cat === 'EWS' && admission.reservation.isEws)
                        ? 'bg-blue-100 text-blue-700 border-2 border-blue-500 dark:bg-blue-900/50 dark:text-blue-200 dark:border-blue-500'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    {cat}
                  </span>
                ))}
              </div>
            </div>
            {admission.reservation.other && admission.reservation.other.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-2">Other Reservation</p>
                <div className="flex flex-wrap gap-2">
                  {['NCC', 'SPORTS', 'EX-SERVICEMAN', 'PH', 'OTHERS'].map((cat) => (
                    <span
                      key={cat}
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        admission.reservation.other?.includes(cat)
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-200'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ApplicationSectionCard>
      )}

      {admission.qualifications && (
        <ApplicationSectionCard step={5} title="Qualified Examinations">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Qualified Examinations</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <div className={`h-3 w-3 rounded-full ${admission.qualifications.ssc ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="text-sm text-gray-700 dark:text-slate-300">SSC</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <div className={`h-3 w-3 rounded-full ${admission.qualifications.interOrDiploma ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="text-sm text-gray-700 dark:text-slate-300">Intermediate / Diploma</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <div className={`h-3 w-3 rounded-full ${admission.qualifications.ug ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="text-sm text-gray-700 dark:text-slate-300">UG</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
                  <span className="text-sm text-gray-700 dark:text-slate-300">Merit</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                    {admission.qualifications.merit === true ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>
            {admission.qualifications.mediums && admission.qualifications.mediums.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Medium of Education</h3>
                <div className="flex flex-wrap gap-2">
                  {MEDIUM_OPTIONS.map(({ value, label }) => (
                    <span
                      key={value}
                      className={`px-3 py-1 rounded text-sm font-medium ${
                        admission.qualifications.mediums?.includes(value)
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ApplicationSectionCard>
      )}

      {admission.educationHistory && admission.educationHistory.length > 0 && (
        <ApplicationSectionCard step={6} title="Education History">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-300 dark:border-slate-600">
                  <th className="text-left py-3 px-3 font-semibold text-gray-700 dark:text-slate-300">Standard</th>
                  <th className="text-left py-3 px-3 font-semibold text-gray-700 dark:text-slate-300">Course / Branch</th>
                  <th className="text-left py-3 px-3 font-semibold text-gray-700 dark:text-slate-300">Year Passed</th>
                  <th className="text-left py-3 px-3 font-semibold text-gray-700 dark:text-slate-300">Institution Name &amp; Address</th>
                  <th className="text-left py-3 px-3 font-semibold text-gray-700 dark:text-slate-300">Hall Ticket No.</th>
                  <th className="text-left py-3 px-3 font-semibold text-gray-700 dark:text-slate-300">Total Marks / Grade</th>
                  <th className="text-left py-3 px-3 font-semibold text-gray-700 dark:text-slate-300">CET Rank</th>
                </tr>
              </thead>
              <tbody>
                {admission.educationHistory.map((edu, idx) => {
                  const standardLabel =
                    (edu.level === 'other' && edu.otherLevelLabel?.trim())
                      ? edu.otherLevelLabel
                      : edu.level?.replace(/_/g, ' ').toUpperCase() || '—';
                  const institutionText = [edu.institutionName, edu.institutionAddress]
                    .filter((part) => part && String(part).trim() !== '')
                    .join(', ');
                  return (
                    <tr key={idx} className="border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 px-3 text-gray-900 dark:text-slate-100">{standardLabel}</td>
                      <td className="py-3 px-3 text-gray-900 dark:text-slate-100">{edu.courseOrBranch || '—'}</td>
                      <td className="py-3 px-3 text-gray-900 dark:text-slate-100">{edu.yearOfPassing || '—'}</td>
                      <td className="py-3 px-3 text-gray-900 dark:text-slate-100 text-xs">{institutionText || '—'}</td>
                      <td className="py-3 px-3 text-gray-900 dark:text-slate-100">{edu.hallTicketNumber || '—'}</td>
                      <td className="py-3 px-3 text-gray-900 dark:text-slate-100">{edu.totalMarksOrGrade || '—'}</td>
                      <td className="py-3 px-3 text-gray-900 dark:text-slate-100">{edu.cetRank || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ApplicationSectionCard>
      )}

      {admission.siblings && admission.siblings.length > 0 && (
        <ApplicationSectionCard step={7} title="Siblings">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-gray-300 dark:border-slate-600">
                  <th className="text-left py-3 px-3 font-semibold text-gray-700 dark:text-slate-300 w-24">Relation</th>
                  <th className="text-left py-3 px-3 font-semibold text-gray-700 dark:text-slate-300">Name</th>
                  <th className="text-left py-3 px-3 font-semibold text-gray-700 dark:text-slate-300">Standard</th>
                  <th className="text-left py-3 px-3 font-semibold text-gray-700 dark:text-slate-300">Institution Name</th>
                </tr>
              </thead>
              <tbody>
                {admission.siblings.map((sibling, idx) => (
                  <tr key={idx} className="border-b border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-3 text-gray-900 dark:text-slate-100">Brother/Sister</td>
                    <td className="py-3 px-3 text-gray-900 dark:text-slate-100">{sibling.name || '—'}</td>
                    <td className="py-3 px-3 text-gray-900 dark:text-slate-100">{sibling.studyingStandard || '—'}</td>
                    <td className="py-3 px-3 text-gray-900 dark:text-slate-100">{sibling.institutionName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ApplicationSectionCard>
      )}

      {admission.documents && (
        <ApplicationSectionCard step={8} title="Documents Checklist">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              { id: 'ssc', label: 'S.S.C' },
              { id: 'casteCertificate', label: 'Caste Certificate' },
              { id: 'inter', label: 'Inter' },
              { id: 'cetRankCard', label: 'CET Rank Card' },
              { id: 'ugOrPgCmm', label: 'U.G - P.C / C.M.M' },
              { id: 'cetHallTicket', label: 'CET Hall Ticket' },
              { id: 'transferCertificate', label: 'TC' },
              { id: 'allotmentLetter', label: 'Allotment Letter' },
              { id: 'studyCertificate', label: 'Study Certificate' },
              { id: 'joiningReport', label: 'Joining Report' },
              { id: 'aadhaarCard', label: 'Aadhaar Card' },
              { id: 'bankPassBook', label: 'Bank Pass Book' },
              { id: 'photos', label: 'Photos(5)' },
              { id: 'rationCard', label: 'Ration Card' },
              { id: 'incomeCertificate', label: 'Income Certificate' },
            ]
              .filter((doc) =>
                isJoiningDocumentChecklistKeyVisible(
                  doc.id as keyof JoiningDocuments,
                  admission.courseInfo?.quota,
                  { paperChecklist: false }
                )
              )
              .map((doc: { id: string; label: string }) => (
              <div
                key={doc.id}
                className={`p-4 rounded-lg border-2 flex items-center gap-3 ${
                  (admission.documents as any)?.[doc.id] === 'received'
                    ? 'bg-green-50 border-green-300 dark:bg-green-900/20 dark:border-green-700'
                    : 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700'
                }`}
              >
                <div
                  className={`h-4 w-4 rounded border-2 flex items-center justify-center ${
                    (admission.documents as any)?.[doc.id] === 'received'
                      ? 'bg-green-500 border-green-500'
                      : 'border-gray-400'
                  }`}
                >
                  {(admission.documents as any)?.[doc.id] === 'received' && (
                    <span className="text-white text-xs font-bold">✓</span>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-slate-100">{doc.label}</span>
              </div>
            ))}
          </div>
        </ApplicationSectionCard>
      )}

      {registrationFieldEntries.length > 0 && (
        <ApplicationSectionCard title="Registration Form Fields">
          <div className="grid gap-4 md:grid-cols-2">
            {registrationFieldEntries.map(([key, raw]) => (
              <div key={key} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {formatRegistrationFieldLabel(key)}
                </p>
                {isRegistrationImageDataUrl(raw) ? (
                  <img
                    src={raw}
                    alt={formatRegistrationFieldLabel(key)}
                    className="mt-2 h-24 w-24 rounded-lg border border-slate-300 object-cover dark:border-slate-600"
                  />
                ) : (
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100 break-words">
                    {typeof raw === 'object' ? JSON.stringify(raw) : String(raw)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </ApplicationSectionCard>
      )}

      <WorkflowStickyActionBar
        id="admission-step-one-actions"
        stepLabel="Step 1 actions"
        className="border-blue-200/80 dark:border-blue-900/50"
      >
        {admitCardPrintStudent?.courseId ? (
          <PrintableAdmitCard
            courseId={admitCardPrintStudent.courseId}
            student={admitCardPrintStudent}
            printButtonLabel="Print acknowledgement card"
          />
        ) : null}
        <WorkflowNextStepButton
          fromStep={1}
          surface="admission-detail"
          joiningId={admission.joiningId}
          admissionId={admission._id}
        />
      </WorkflowStickyActionBar>
      </div>

      {/* Payment Information */}
      {paymentSummary && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900/70">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-6 flex items-center gap-2">
            <svg className="h-6 w-6 text-lime-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Payment Information
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Total Fee
                  </span>
                  <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {formatCurrency(paymentSummary.totalFee)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Paid Fee
                  </span>
                  <span className="text-base font-semibold text-emerald-600 dark:text-emerald-300">
                    {formatCurrency(paymentSummary.totalPaid)}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Balance
                  </span>
                  <span className="text-base font-semibold text-blue-600 dark:text-blue-300">
                    {formatCurrency(paymentSummary.balance)}
                  </span>
                </div>
                <div className="mt-4">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                      paymentSummary.status === 'paid'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200'
                        : paymentSummary.status === 'partial'
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    <span className="inline-block h-2 w-2 rounded-full bg-current opacity-75" />
                    {paymentSummary.status === 'paid'
                      ? 'Paid'
                      : paymentSummary.status === 'partial'
                      ? 'Partial'
                      : 'Pending'}
                  </span>
                </div>
              </div>
            </div>

            {transactions.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">
                  Payment History
                </h3>
                <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                  {transactions.map((transaction) => (
                    <div
                      key={transaction._id}
                      className="rounded-lg border border-gray-200 bg-gray-50 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/50"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider ${
                            transaction.status === 'success'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200'
                              : transaction.status === 'pending'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200'
                          }`}
                        >
                          {transaction.status}
                        </span>
                        <p className="text-lg font-bold text-gray-900 dark:text-slate-100">
                          {formatCurrency(transaction.amount)}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-0.5">Receipt No</p>
                          <p className="font-semibold text-gray-900 dark:text-slate-200">
                            {transaction.referenceId || transaction.cashfreeOrderId || '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-0.5">Payment Mode</p>
                          <p className="font-semibold text-gray-900 dark:text-slate-200 capitalize">
                            {transaction.mode || '—'}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-0.5">Date & Time</p>
                          <p className="font-medium text-gray-900 dark:text-slate-200">
                            {formatDateTime(transaction.createdAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {admission.joiningId && admission._id && !isAdmissionCancelled ? (
        <AdmissionStepTwoPanel
          joiningId={admission.joiningId}
          admissionId={admission._id}
          course={admission.courseInfo?.course || ''}
          branch={admission.courseInfo?.branch || ''}
          quota={admission.courseInfo?.quota || ''}
          batch={resolveBatch(admission, lead)}
        />
      ) : null}
    </div>
  );
}

