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
import { admissionAPI, courseAPI, joiningAPI, paymentAPI } from '@/lib/api';
import {
  Admission,
  CertificateGuidance,
  Joining,
  JoiningDocuments,
  PaymentSummary,
  PaymentTransaction,
} from '@/types';
import { isJoiningDocumentChecklistKeyVisible } from '@/lib/joiningDocumentChecklist';
import { showToast } from '@/lib/toast';
import { useDashboardHeader, useJoiningDeskPermissions } from '@/components/layout/DashboardShell';
import { AdmissionReferenceEditor } from '@/components/admission/AdmissionReferenceEditor';
import { resolveJoiningReference1 } from '@/lib/joiningApplicationViewDisplay';
import { useCourseLookup } from '@/hooks/useCourseLookup';
import { resolveJoiningOrAdmissionCourseLabel } from '@/lib/admissionCourseDisplay';
import {
  communicationAddressHasDisplayValues,
  formatCommunicationAddressLines,
  formatRelativeAddressBlock,
} from '@/lib/formatJoiningAddressDisplay';
import { PrintableStudentApplication } from '@/components/PrintableStudentApplication';
import {
  PrintableAdmitCard,
  buildAdmitCardCertificateChecklistFromRegistration,
  buildAdmitCardDocumentChecklist,
  pickStudentPortraitForAdmitCard,
} from '@/components/joining/PrintableAdmitCard';
import { AdmissionStepTwoPanel } from '@/components/admission/AdmissionStepTwoPanel';
import {
  AdmissionStepThreeBusHostelPanel,
  parseJoiningTransportDetails,
} from '@/components/admission/AdmissionStepThreeBusHostelPanel';
import { AdmissionWorkflowStepButtons } from '@/components/admission/AdmissionWorkflowSteps';
import { ApplicationSectionCard } from '@/components/admission/ApplicationSectionCard';
import { FeeStructureSection } from '@/components/fee/FeeStructureSection';
import { JoiningCourseQuotaReadSection } from '@/components/joining/JoiningCourseQuotaReadSection';
import { JoiningRegistrationFieldsReadView } from '@/components/joining/JoiningRegistrationFieldsReadView';
import {
  pickJoiningCourseQuotaRegistrationEntries,
  pickJoiningStudentProfileRegistrationEntries,
} from '@/lib/joiningApplicationViewDisplay';

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
  const hasCertificateChecklistOnAdmission = Boolean(
    admission?.registrationFormData &&
      typeof admission.registrationFormData === 'object' &&
      admission.registrationFormData.certificate_checklist
  );
  const hasProgramLevelOnAdmission = Boolean(
    String(admission?.courseInfo?.programLevel ?? '').trim()
  );
  const hasCommunicationAddressOnAdmission = communicationAddressHasDisplayValues(
    admission?.address?.communication
  );
  const needsJoiningFallback =
    !!admission?.joiningId &&
    (!hasRegistrationOnAdmission ||
      !hasReferenceOnAdmission ||
      !hasCertificateChecklistOnAdmission ||
      !hasProgramLevelOnAdmission ||
      !hasCommunicationAddressOnAdmission);

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

  const printApplication = useMemo(() => {
    if (!admission) return undefined;
    if (!joiningForReference) return admission;

    const joiningReg =
      joiningForReference.registrationFormData &&
      typeof joiningForReference.registrationFormData === 'object' &&
      !Array.isArray(joiningForReference.registrationFormData)
        ? joiningForReference.registrationFormData
        : {};
    const admissionReg =
      admission.registrationFormData &&
      typeof admission.registrationFormData === 'object' &&
      !Array.isArray(admission.registrationFormData)
        ? admission.registrationFormData
        : {};
    const mergedRegistration =
      Object.keys({ ...joiningReg, ...admissionReg }).length > 0
        ? { ...joiningReg, ...admissionReg }
        : admission.registrationFormData;

    const mergedCommunication = {
      ...(joiningForReference.address?.communication || {}),
      ...(admission.address?.communication || {}),
    };
    const mergedRelatives =
      (admission.address?.relatives?.length ?? 0) > 0
        ? admission.address!.relatives
        : joiningForReference.address?.relatives ?? [];

    return {
      ...admission,
      registrationFormData: mergedRegistration,
      address: {
        communication: mergedCommunication,
        relatives: mergedRelatives,
      },
    };
  }, [admission, joiningForReference]);

  const resolvedReference1 = useMemo(
    () => resolveJoiningReference1(admission, joiningForReference, leadForReference),
    [admission, joiningForReference, leadForReference]
  );

  const joiningStatus =
    (joiningForRegistrationData?.data?.joining?.status as string | undefined) ?? 'approved';

  const registrationSource = useMemo<Record<string, unknown>>(() => {
    const fromJoining = joiningForReference?.registrationFormData;
    const joiningReg =
      fromJoining && typeof fromJoining === 'object' && !Array.isArray(fromJoining)
        ? (fromJoining as Record<string, unknown>)
        : {};
    const fromAdmission = admission?.registrationFormData;
    const admissionReg =
      fromAdmission && typeof fromAdmission === 'object' && Object.keys(fromAdmission).length > 0
        ? fromAdmission
        : null;
    const base = admissionReg ? { ...admissionReg } : { ...joiningReg };
    if (!base.certificate_checklist && joiningReg.certificate_checklist) {
      return { ...base, certificate_checklist: joiningReg.certificate_checklist };
    }
    return base;
  }, [admission?.registrationFormData, joiningForReference?.registrationFormData]);

  const courseQuotaRegistrationEntries = useMemo(
    () => pickJoiningCourseQuotaRegistrationEntries(registrationSource),
    [registrationSource]
  );

  const studentProfileRegistrationEntries = useMemo(
    () => pickJoiningStudentProfileRegistrationEntries(registrationSource),
    [registrationSource]
  );

  const transportDetails = useMemo(
    () => parseJoiningTransportDetails(registrationSource.transport_details),
    [registrationSource]
  );

  const studentFeeDetails = useMemo(() => {
    if (admission?.studentFeeDetails) {
      return admission.studentFeeDetails;
    }
    const joiningFeeDetails = joiningForReference?.studentFeeDetails;
    if (joiningFeeDetails) {
      return joiningFeeDetails;
    }
    return { lines: [], batch: resolveBatch(admission, lead) || '' };
  }, [admission, joiningForReference, lead]);

  const programLevelTrimmed = useMemo(
    () =>
      String(
        admission?.courseInfo?.programLevel || joiningForReference?.courseInfo?.programLevel || ''
      ).trim(),
    [admission?.courseInfo?.programLevel, joiningForReference?.courseInfo?.programLevel]
  );

  const { data: certificateGuidanceResponse } = useQuery({
    queryKey: ['courses', 'certificate-guidance', programLevelTrimmed, 'admit-card-print'],
    enabled: Boolean(programLevelTrimmed),
    queryFn: async () => courseAPI.getCertificateGuidance(programLevelTrimmed),
  });

  const certificateGuidanceForPrint: CertificateGuidance | null = useMemo(() => {
    const envelope = certificateGuidanceResponse?.data ?? certificateGuidanceResponse;
    const inner =
      envelope && typeof envelope === 'object' && 'data' in envelope
        ? (envelope as { data: unknown }).data
        : envelope;
    if (!inner || typeof inner !== 'object') return null;
    return inner as CertificateGuidance;
  }, [certificateGuidanceResponse]);

  const admitCardPrintStudent = useMemo(() => {
    if (!admission) return null;
    const courseName =
      resolveJoiningOrAdmissionCourseLabel(admission, getCourseName) ||
      admission.courseInfo?.course ||
      '—';
    const branchName =
      getBranchName(admission.courseInfo?.branchId) || admission.courseInfo?.branch || '—';
    const admissionDate = admission.admissionDate || admission.createdAt;
    const parsedAdmissionDate = admissionDate ? new Date(admissionDate) : null;
    const dateOfJoining =
      parsedAdmissionDate && !Number.isNaN(parsedAdmissionDate.getTime())
        ? parsedAdmissionDate.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        : '—';
    return {
      courseId: String(admission.courseInfo?.courseId ?? '').trim(),
      studentName: String(admission.studentInfo?.name || lead?.name || '—'),
      admissionNumber: admission.admissionNumber,
      program: courseName,
      branch: branchName,
      quota: admission.courseInfo?.quota || '—',
      dateOfJoining,
      studentPhone: String(admission.studentInfo?.phone || lead?.phone || '—'),
      fatherPhone: String(admission.parents?.father?.phone || lead?.fatherPhone || '—'),
      studentPhotoSrc: pickStudentPortraitForAdmitCard(admission),
      collegeName: getCollegeNameForCourse(admission.courseInfo?.courseId) || undefined,
      documentChecklist: admission.documents
        ? buildAdmitCardDocumentChecklist(admission.documents, admission.courseInfo?.quota)
        : undefined,
      programLevel: programLevelTrimmed || undefined,
      registrationFormData: registrationSource,
      certificateChecklist: buildAdmitCardCertificateChecklistFromRegistration(
        certificateGuidanceForPrint,
        registrationSource
      ),
    };
  }, [
    admission,
    lead,
    getCourseName,
    getBranchName,
    getCollegeNameForCourse,
    certificateGuidanceForPrint,
    registrationSource,
    programLevelTrimmed,
  ]);

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
          {admission && printApplication && (
            <PrintableStudentApplication
              application={printApplication}
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

  const collegeName = getCollegeNameForCourse(admission.courseInfo?.courseId) || undefined;
  const courseName = resolveJoiningOrAdmissionCourseLabel(admission, getCourseName) || undefined;
  const branchName =
    getBranchName(admission.courseInfo?.branchId) || admission.courseInfo?.branch || undefined;

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
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

      <div id="admission-step-one" className="scroll-mt-24 space-y-6">
        <ApplicationSectionCard
          step={1}
          title="Student Information"
          description={
            admission.joiningId
              ? 'Read-only application view — same layout as the joining form and print application.'
              : 'Read-only application view — same layout as the print application.'
          }
        >
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Course &amp; quota
          </h3>
          <div className="mt-4">
            <JoiningCourseQuotaReadSection
              joining={admission as unknown as Joining}
              collegeName={collegeName}
              courseName={courseName}
              branchName={branchName}
              intakeRegistrationEntries={courseQuotaRegistrationEntries}
              referenceSlot={
                <AdmissionReferenceEditor
                  admissionId={String(admission._id)}
                  initialReference1={resolvedReference1}
                  canEdit={canEditReference && !isAdmissionCancelled}
                />
              }
            />
          </div>
          <h3 className="mt-8 border-t border-slate-200/80 pt-6 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
            Student profile
          </h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Registration fields in the same order as the edit form.
          </p>
          <div className="mt-4">
            {studentProfileRegistrationEntries.length > 0 ? (
              <JoiningRegistrationFieldsReadView
                entries={studentProfileRegistrationEntries}
                revealAadhaar={revealedAadhaars.student}
                onToggleAadhaar={() => toggleAadhaar('student')}
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Full name</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {admission.studentInfo?.name || '—'}
                  </p>
                </div>
                <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {admission.studentInfo?.phone || '—'}
                  </p>
                </div>
                <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Preferred mobile
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {admission.studentInfo?.preferredMobileNumber || '—'}
                  </p>
                </div>
                <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Gender</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {admission.studentInfo?.gender || '—'}
                  </p>
                </div>
                <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Date of birth</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {admission.studentInfo?.dateOfBirth || '—'}
                  </p>
                </div>
                <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Aadhaar</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {revealedAadhaars.student
                      ? admission.studentInfo?.aadhaarNumber || '—'
                      : maskAadhaar(admission.studentInfo?.aadhaarNumber)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </ApplicationSectionCard>

      {admission.parents && (
        <ApplicationSectionCard step={2} title="Parents Details">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Father</h3>
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
                        className="rounded-lg p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800"
                        aria-label={revealedAadhaars.father ? 'Hide Aadhaar' : 'Show Aadhaar'}
                      >
                        <svg
                          className={`h-5 w-5 ${revealedAadhaars.father ? 'text-blue-600' : 'text-gray-400'}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Mother</h3>
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
                        className="rounded-lg p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800"
                        aria-label={revealedAadhaars.mother ? 'Hide Aadhaar' : 'Show Aadhaar'}
                      >
                        <svg
                          className={`h-5 w-5 ${revealedAadhaars.mother ? 'text-blue-600' : 'text-gray-400'}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
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
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-slate-300">
                Communication Address
              </h3>
              {(() => {
                const lines = formatCommunicationAddressLines(admission.address.communication);
                return (
                  <div className="space-y-2 text-sm">
                    <p className="text-gray-900 dark:text-slate-100">{lines.doorOrStreet}</p>
                    {lines.landmark ? (
                      <p className="text-gray-600 dark:text-slate-400">{lines.landmark}</p>
                    ) : null}
                    <p className="text-gray-600 dark:text-slate-400">{lines.locality}</p>
                    {lines.pin ? (
                      <p className="text-gray-600 dark:text-slate-400">{lines.pin}</p>
                    ) : null}
                  </div>
                );
              })()}
            </div>
            {admission.address.relatives && admission.address.relatives.length > 0 && (
              <div>
                <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-slate-300">
                  Relatives / Friends
                </h3>
                <div className="space-y-3">
                  {admission.address.relatives.map((relative, idx) => {
                    const block = formatRelativeAddressBlock(relative);
                    return (
                      <div key={idx} className="border-l-2 border-blue-200 pl-3">
                        <p className="font-semibold text-gray-900 dark:text-slate-100">{block.header}</p>
                        {block.addressLine ? (
                          <p className="mt-1 text-xs text-gray-600 dark:text-slate-400">{block.addressLine}</p>
                        ) : null}
                        {block.mobile ? (
                          <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                            Mobile: {block.mobile}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ApplicationSectionCard>
      )}

      {admission.educationHistory && admission.educationHistory.length > 0 && (
        <ApplicationSectionCard step={4} title="Education History">
          <div className="space-y-4">
            {admission.educationHistory.map((edu, idx) => {
              const standardLabel =
                edu.level === 'other' && edu.otherLevelLabel?.trim()
                  ? edu.otherLevelLabel
                  : edu.level?.replace(/_/g, ' ') || '—';
              return (
                <div key={idx} className="border-l-4 border-blue-500 py-2 pl-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold uppercase text-gray-900 dark:text-slate-100">
                        {standardLabel}
                      </p>
                      <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                        {edu.courseOrBranch} • {edu.yearOfPassing}
                      </p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">
                        {edu.institutionName}
                      </p>
                      {(edu.hallTicketNumber || edu.cetRank) && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                          {[edu.hallTicketNumber && `Hall ticket: ${edu.hallTicketNumber}`, edu.cetRank && `CET rank: ${edu.cetRank}`]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                    {edu.totalMarksOrGrade && (
                      <div className="text-right">
                        <p className="text-xs text-gray-500 dark:text-slate-400">Marks/Grade</p>
                        <p className="text-base font-semibold text-gray-900 dark:text-slate-100">
                          {edu.totalMarksOrGrade}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </ApplicationSectionCard>
      )}

      {admission.siblings && admission.siblings.length > 0 && (
        <ApplicationSectionCard step={5} title="Siblings">
          <div className="space-y-4">
            {admission.siblings.map((sibling, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/40"
              >
                <p className="font-semibold text-gray-900 dark:text-slate-100">{sibling.name || '—'}</p>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  {[sibling.relation, sibling.studyingStandard, sibling.institutionName]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </p>
              </div>
            ))}
          </div>
        </ApplicationSectionCard>
      )}

      {admission.documents && (
        <ApplicationSectionCard step={6} title="Documents Checklist">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Object.entries(admission.documents)
              .filter(([key]) =>
                isJoiningDocumentChecklistKeyVisible(
                  key as keyof JoiningDocuments,
                  admission.courseInfo?.quota,
                  { paperChecklist: false }
                )
              )
              .map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <div
                    className={`h-3 w-3 rounded-full ${
                      value === 'received'
                        ? 'bg-green-500'
                        : value === 'pending'
                          ? 'bg-amber-500'
                          : 'bg-gray-300'
                    }`}
                  />
                  <div>
                    <p className="text-xs font-medium capitalize text-gray-700 dark:text-slate-300">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </p>
                    <p className="text-xs capitalize text-gray-500 dark:text-slate-400">{value}</p>
                  </div>
                </div>
              ))}
          </div>
        </ApplicationSectionCard>
      )}

      {admitCardPrintStudent?.courseId ? (
        <div className="flex justify-end">
          <PrintableAdmitCard
            courseId={admitCardPrintStudent.courseId}
            student={admitCardPrintStudent}
            printButtonLabel="Print acknowledgement card"
          />
        </div>
      ) : null}
      </div>

      {admission.joiningId && admission._id && !isAdmissionCancelled ? (
        <AdmissionStepTwoPanel
          joiningId={admission.joiningId}
          admissionId={admission._id}
          course={admission.courseInfo?.course || ''}
          branch={admission.courseInfo?.branch || ''}
          quota={admission.courseInfo?.quota || ''}
          batch={resolveBatch(admission, lead)}
          paymentSummary={paymentSummary}
          transactions={transactions}
          readOnly
        />
      ) : null}

      <section
        id="admission-step-three"
        className="scroll-mt-24 space-y-4 rounded-2xl border border-amber-200/80 bg-gradient-to-b from-amber-50/50 to-white/95 p-6 shadow-lg shadow-amber-100/20 backdrop-blur dark:border-amber-900/50 dark:from-amber-950/25 dark:to-slate-900/70 dark:shadow-none"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Step 3
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
            Bus &amp; hostel
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Read-only view of transport or hostel selection saved on this admission.
          </p>
        </div>
        <AdmissionStepThreeBusHostelPanel
          value={transportDetails}
          disabled
          courseName={courseName}
        />
      </section>

      {/* Fee configuration & payments — Step 4 */}
      <div
        id="admission-step-four"
        className="scroll-mt-24 space-y-8 rounded-2xl border-2 border-emerald-200/80 bg-gradient-to-b from-emerald-50/40 to-white/95 p-6 shadow-lg shadow-emerald-100/30 backdrop-blur dark:border-emerald-900/50 dark:from-emerald-950/20 dark:to-slate-900/70 dark:shadow-none"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            Step 4
          </p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900 dark:text-slate-100">
            Fee configuration
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
            Fee heads from the Fee Management database. Admission fee payments are shown under Step 2.
          </p>
        </div>

        <FeeStructureSection
          title="Fee configuration (Fee Management database)"
          course={admission.courseInfo?.course || ''}
          branch={admission.courseInfo?.branch || ''}
          quota={admission.courseInfo?.quota || ''}
          batch={resolveBatch(admission, lead)}
          studentFeeDetails={studentFeeDetails}
          feeDetailsEditable={false}
          showActualAndRevisedFees
          description="Read-only fee heads and student line items for this admission."
        />
      </div>
    </div>
  );
}

