'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { joiningAPI, paymentAPI, admissionAPI } from '@/lib/api';
import { Joining, JoiningDocuments, PaymentSummary, PaymentTransaction, Admission } from '@/types';
import { isJoiningDocumentChecklistKeyVisible } from '@/lib/joiningDocumentChecklist';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import { useCourseLookup } from '@/hooks/useCourseLookup';
import { resolveJoiningOrAdmissionCourseLabel } from '@/lib/admissionCourseDisplay';
import { PrintableStudentApplication } from '@/components/PrintableStudentApplication';
import { FeeStructureSection } from '@/components/fee/FeeStructureSection';
import { ApplicationSectionCard } from '@/components/admission/ApplicationSectionCard';
import { JoiningCourseQuotaReadSection } from '@/components/joining/JoiningCourseQuotaReadSection';
import { JoiningRegistrationFieldsReadView } from '@/components/joining/JoiningRegistrationFieldsReadView';
import {
  pickJoiningCourseQuotaRegistrationEntries,
  pickJoiningStudentProfileRegistrationEntries,
  resolveJoiningReference1,
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


export default function JoiningDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const leadId = Array.isArray(params?.leadId) ? params.leadId[0] : params?.leadId;
  const { getCourseName, getBranchName, getCollegeNameForCourse } = useCourseLookup();

  const [revealedAadhaars, setRevealedAadhaars] = useState<{
    student: boolean;
    father: boolean;
    mother: boolean;
  }>({
    student: false,
    father: false,
    mother: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['joining', leadId],
    enabled: !!leadId,
    queryFn: async () => {
      const response = await joiningAPI.getByLeadId(leadId as string);
      return response;
    },
  });

  const joining = data?.data?.joining as Joining | undefined;
  /** Prefer API `lead` (fresher); fall back to snapshot in `joining.leadData`. */
  const lead = (data?.data?.lead as any) || (joining?.leadData as any);

  // Fetch admission if joining is approved
  const { data: admissionData } = useQuery({
    queryKey: ['admission', joining?._id],
    enabled: !!joining?._id && joining?.status === 'approved',
    queryFn: async () => {
      if (!joining?._id) return null;
      try {
        const response = await admissionAPI.getByJoiningId(joining._id);
        return response;
      } catch {
        return null;
      }
    },
  });

  const admission = admissionData?.data?.admission as Admission | undefined;

  // Fetch payment information - use paymentSummary from joining if available
  const paymentSummary: PaymentSummary | null = useMemo(() => {
    if (joining?.paymentSummary) {
      return joining.paymentSummary;
    }
    return null;
  }, [joining]);

  const { data: transactionsData } = useQuery({
    queryKey: ['transactions', joining?._id],
    enabled: !!joining?._id,
    queryFn: async () => {
      if (!joining?._id) return null;
      try {
        const response = await paymentAPI.listTransactions({
          joiningId: joining._id,
          leadId: joining.leadId,
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
    if (payload && Array.isArray((payload as any).data)) {
      return (payload as any).data as PaymentTransaction[];
    }
    return [];
  }, [transactionsData]);

  useEffect(() => {
    setHeaderContent(
      <div className="flex items-center justify-between w-full">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
            Joining Form Details
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {joining?.status === 'draft' ? 'Draft' : joining?.status === 'pending_approval' ? 'Pending Approval' : 'Approved'}
            {lead?.enquiryNumber && ` • Enquiry #${lead.enquiryNumber}`}
            {admission?.admissionNumber && ` • Admission #${admission.admissionNumber}`}
          </p>
        </div>
        <div className="flex gap-3">
          {joining && (
            <PrintableStudentApplication
              application={joining}
              enquiryNumber={
                lead?.enquiryNumber ||
                (joining?.leadData as { enquiryNumber?: string } | undefined)?.enquiryNumber
              }
              admissionNumber={admission?.admissionNumber}
              courseName={joining.courseInfo?.course || getCourseName(joining.courseInfo?.courseId) || undefined}
              branchName={getBranchName(joining.courseInfo?.branchId) || joining.courseInfo?.branch || undefined}
              collegeName={getCollegeNameForCourse(joining.courseInfo?.courseId) || undefined}
              paymentSummary={paymentSummary ?? undefined}
              transactions={transactions}
              title="Student Application"
              printButtonLabel="Print application"
            />
          )}
          {(joining?.status === 'draft' || joining?.status === 'pending_approval') && (
            <Link href={`/superadmin/joining/${leadId}`}>
              <Button variant="primary">
                <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Form
              </Button>
            </Link>
          )}
          <Link href="/superadmin/joining">
            <Button variant="outline">Back to List</Button>
          </Link>
        </div>
      </div>
    );
    return () => clearHeaderContent();
  }, [
    joining,
    lead,
    leadId,
    admission,
    paymentSummary,
    transactions,
    getCourseName,
    getBranchName,
    getCollegeNameForCourse,
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

  if (!joining) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-lg text-slate-600 dark:text-slate-400">Joining form not found</p>
        <Link href="/superadmin/joining" className="mt-4">
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

  const registrationSource = joining.registrationFormData as Record<string, unknown> | undefined;
  const courseQuotaRegistrationEntries = pickJoiningCourseQuotaRegistrationEntries(registrationSource);
  const studentProfileRegistrationEntries =
    pickJoiningStudentProfileRegistrationEntries(registrationSource);

  const collegeName = getCollegeNameForCourse(joining.courseInfo?.courseId) || undefined;
  const courseName = resolveJoiningOrAdmissionCourseLabel(joining, getCourseName) || undefined;
  const branchName =
    getBranchName(joining.courseInfo?.branchId) || joining.courseInfo?.branch || undefined;
  const reference1 = resolveJoiningReference1(admission, joining, lead);

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <ApplicationSectionCard step={1} title="Student Information">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Course &amp; quota
        </h3>
        <div className="mt-4">
          <JoiningCourseQuotaReadSection
            joining={joining}
            collegeName={collegeName}
            courseName={courseName}
            branchName={branchName}
            intakeRegistrationEntries={courseQuotaRegistrationEntries}
            reference1={reference1}
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
                  {joining.studentInfo?.name || '—'}
                </p>
              </div>
              <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Phone</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {joining.studentInfo?.phone || '—'}
                </p>
              </div>
              <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Preferred mobile
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {joining.studentInfo?.preferredMobileNumber || '—'}
                </p>
              </div>
              <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Gender</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {joining.studentInfo?.gender || '—'}
                </p>
              </div>
              <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Date of birth</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {joining.studentInfo?.dateOfBirth || '—'}
                </p>
              </div>
              <div className="min-w-0 rounded-lg border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-800/30">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Aadhaar</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {revealedAadhaars.student
                    ? joining.studentInfo?.aadhaarNumber || '—'
                    : maskAadhaar(joining.studentInfo?.aadhaarNumber)}
                </p>
              </div>
            </div>
          )}
        </div>
      </ApplicationSectionCard>

      <ApplicationSectionCard step={2} title="Parents Details">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300">Father</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Name</p>
                <p className="text-base font-semibold text-gray-900 dark:text-slate-100 mt-1">
                  {joining.parents?.father?.name || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Phone</p>
                <p className="text-base font-semibold text-gray-900 dark:text-slate-100 mt-1">
                  {joining.parents?.father?.phone || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Aadhaar Number</p>
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-gray-900 dark:text-slate-100">
                    {revealedAadhaars.father
                      ? joining.parents?.father?.aadhaarNumber || '—'
                      : maskAadhaar(joining.parents?.father?.aadhaarNumber)}
                  </p>
                  {joining.parents?.father?.aadhaarNumber && (
                    <button
                      onClick={() => toggleAadhaar('father')}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                      aria-label={revealedAadhaars.father ? 'Hide Aadhaar' : 'Show Aadhaar'}
                    >
                      <svg
                        className={`h-5 w-5 ${revealedAadhaars.father ? 'text-blue-600' : 'text-gray-400'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        {revealedAadhaars.father ? (
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L3 12m3.29-5.71L12 3m-5.71 3.29L12 12"
                          />
                        ) : (
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        )}
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
                <p className="text-base font-semibold text-gray-900 dark:text-slate-100 mt-1">
                  {joining.parents?.mother?.name || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Phone</p>
                <p className="text-base font-semibold text-gray-900 dark:text-slate-100 mt-1">
                  {joining.parents?.mother?.phone || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Aadhaar Number</p>
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold text-gray-900 dark:text-slate-100">
                    {revealedAadhaars.mother
                      ? joining.parents?.mother?.aadhaarNumber || '—'
                      : maskAadhaar(joining.parents?.mother?.aadhaarNumber)}
                  </p>
                  {joining.parents?.mother?.aadhaarNumber && (
                    <button
                      onClick={() => toggleAadhaar('mother')}
                      className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                      aria-label={revealedAadhaars.mother ? 'Hide Aadhaar' : 'Show Aadhaar'}
                    >
                      <svg
                        className={`h-5 w-5 ${revealedAadhaars.mother ? 'text-blue-600' : 'text-gray-400'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        {revealedAadhaars.mother ? (
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.29 3.29m0 0L3 12m3.29-5.71L12 3m-5.71 3.29L12 12"
                          />
                        ) : (
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        )}
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

      {joining.address && (
        <ApplicationSectionCard step={3} title="Address Details">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">Communication Address</h3>
              <div className="space-y-2 text-sm">
                <p className="text-gray-900 dark:text-slate-100">
                  {joining.address.communication?.doorOrStreet || '—'}
                </p>
                <p className="text-gray-600 dark:text-slate-400">
                  {joining.address.communication?.landmark && `Near: ${joining.address.communication.landmark}`}
                </p>
                <p className="text-gray-600 dark:text-slate-400">
                  {[
                    joining.address.communication?.villageOrCity,
                    joining.address.communication?.mandal,
                    joining.address.communication?.district,
                  ]
                    .filter(Boolean)
                    .join(', ') || '—'}
                </p>
                <p className="text-gray-600 dark:text-slate-400">
                  {joining.address.communication?.pinCode && `PIN: ${joining.address.communication.pinCode}`}
                </p>
              </div>
            </div>
            {joining.address.relatives && joining.address.relatives.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-4">Relatives</h3>
                <div className="space-y-3">
                  {joining.address.relatives.map((relative, idx) => (
                    <div key={idx} className="border-l-2 border-blue-200 pl-3">
                      <p className="font-semibold text-gray-900 dark:text-slate-100">{relative.name}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">{relative.relationship}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ApplicationSectionCard>
      )}

      {joining.educationHistory && joining.educationHistory.length > 0 && (
        <ApplicationSectionCard step={4} title="Education History">
          <div className="space-y-4">
            {joining.educationHistory.map((edu, idx) => (
              <div key={idx} className="border-l-4 border-blue-500 pl-4 py-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-slate-100 uppercase">
                      {edu.level?.replace('_', ' ')}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                      {edu.courseOrBranch} • {edu.yearOfPassing}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-slate-500 mt-1">
                      {edu.institutionName}
                    </p>
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
            ))}
          </div>
        </ApplicationSectionCard>
      )}

      {joining.siblings && joining.siblings.length > 0 && (
        <ApplicationSectionCard step={5} title="Siblings">
          <div className="space-y-4">
            {joining.siblings.map((sibling, idx) => (
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

      {joining.documents && (
        <ApplicationSectionCard step={6} title="Documents Checklist">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Object.entries(joining.documents)
              .filter(([key]) =>
                isJoiningDocumentChecklistKeyVisible(
                  key as keyof JoiningDocuments,
                  joining.courseInfo?.quota,
                  { paperChecklist: false }
                )
              )
              .map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <div
                  className={`h-3 w-3 rounded-full ${
                    value === 'received' ? 'bg-green-500' : value === 'pending' ? 'bg-amber-500' : 'bg-gray-300'
                  }`}
                />
                <div>
                  <p className="text-xs font-medium text-gray-700 dark:text-slate-300 capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400 capitalize">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </ApplicationSectionCard>
      )}

      {/* Payment Information */}
      {paymentSummary && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900/70">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-6">
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

          {joining?.status === 'draft' && (
            <div className="mt-6 flex gap-3">
              <Link href={`/superadmin/joining/${leadId}`}>
                <Button variant="primary" className="w-full sm:w-auto">
                  Make Payment
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Fee Structure (Fee Management DB) — defaults to current year, ±3 years dropdown */}
      <FeeStructureSection
        course={joining.courseInfo?.course || ''}
        branch={joining.courseInfo?.branch || ''}
        quota={joining.courseInfo?.quota || ''}
        batch={
          (lead as { academicYear?: number | string } | undefined)?.academicYear ?? null
        }
        description="Live from the Fee Management database. Pick a batch (academic year) from the dropdown — the table updates to that year's configured fees."
        studentFeeDetails={joining.studentFeeDetails ?? { lines: [] }}
      />
    </div>
  );
}

