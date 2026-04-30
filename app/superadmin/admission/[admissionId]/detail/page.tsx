'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { admissionAPI, joiningAPI, paymentAPI } from '@/lib/api';
import { Admission, PaymentSummary, PaymentTransaction } from '@/types';
import { useDashboardHeader } from '@/components/layout/DashboardShell';
import { useCourseLookup } from '@/hooks/useCourseLookup';
import { PrintableStudentApplication } from '@/components/PrintableStudentApplication';

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

const formatRegistrationFieldLabel = (key: string): string =>
  String(key || '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const normalizeRegistrationFieldKey = (key: string): string => {
  const normalized = String(key || '')
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
    .trim();

  const aliasToCanonical: Record<string, string> = {
    semister: 'current_semester',
    semester: 'current_semester',
    current_semester: 'current_semester',
    currentsemester: 'current_semester',
    academic_year: 'current_year',
    academicyear: 'current_year',
    current_year: 'current_year',
    currentyear: 'current_year',
    certification_status: 'certificates_status',
    certificates_status: 'certificates_status',
    college_id: 'college',
    collegeid: 'college',
    school_or_college_id: 'college',
    schoolorcollegeid: 'college',
    school_or_college_name: 'college',
    schoolorcollegename: 'college',
  };

  return aliasToCanonical[normalized] || normalized;
};

const isImageDataUrl = (value: unknown): value is string =>
  typeof value === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value.trim());

export default function AdmissionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const admissionId = Array.isArray(params?.admissionId) ? params.admissionId[0] : params?.admissionId;
  const { getCourseName, getBranchName } = useCourseLookup();

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
    queryKey: ['admission', admissionId],
    enabled: !!admissionId,
    queryFn: async () => {
      const response = await admissionAPI.getById(admissionId as string);
      return response;
    },
  });

  const admission = data?.data?.admission as Admission | undefined;
  const lead = (admission?.leadData as any) || data?.data?.lead;

  // Fetch payment information - use paymentSummary from admission if available
  const paymentSummary: PaymentSummary | null = useMemo(() => {
    if (admission?.paymentSummary) {
      return admission.paymentSummary;
    }
    return null;
  }, [admission]);

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
    if (payload && Array.isArray((payload as any).data)) {
      return (payload as any).data as PaymentTransaction[];
    }
    return [];
  }, [transactionsData]);

  const { data: joiningForRegistrationData } = useQuery({
    queryKey: ['joining', 'registration-form-data', admission?.joiningId],
    enabled:
      !!admission?.joiningId &&
      (!admission?.registrationFormData || Object.keys(admission.registrationFormData).length === 0),
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
            {admission?.status && ` • ${admission.status === 'active' ? 'Active' : 'Withdrawn'}`}
          </p>
        </div>
        <div className="flex gap-3">
          {admission && (
            <PrintableStudentApplication
              application={admission}
              enquiryNumber={lead?.enquiryNumber}
              admissionNumber={admission.admissionNumber}
              courseName={admission.courseInfo?.course || getCourseName(admission.courseInfo?.courseId) || undefined}
              branchName={admission.courseInfo?.branch || getBranchName(admission.courseInfo?.branchId) || undefined}
              paymentSummary={paymentSummary ?? undefined}
              transactions={transactions}
              title="Student Application"
              printButtonLabel="Print application"
            />
          )}
          {admission?.joiningId && (
            <Link href={`/superadmin/joining/${admission.joiningId}/detail`}>
              <Button variant="outline">
                View Joining Form
              </Button>
            </Link>
          )}
          <Link href="/superadmin/joining/completed">
            <Button variant="outline">Back to List</Button>
          </Link>
        </div>
      </div>
    );
    return () => clearHeaderContent();
  }, [admission, lead, admissionId, setHeaderContent, clearHeaderContent]);

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

  const registrationFieldSource =
    admission.registrationFormData && Object.keys(admission.registrationFormData).length > 0
      ? admission.registrationFormData
      : ((joiningForRegistrationData?.data?.joining?.registrationFormData as Record<string, unknown> | undefined) ||
        {});

  // Keep complete data but collapse repeated aliases to avoid noisy duplicate rows.
  const registrationFieldEntries = (() => {
    const deduped = new Map<string, unknown>();
    for (const [key, value] of Object.entries(registrationFieldSource)) {
      const lk = String(key || '').toLowerCase();
      if (lk === 'certificate_checklist') continue;
      if (lk.startsWith('_')) continue;
      if (value === undefined || value === null) continue;
      if (typeof value === 'string' && value.trim() === '') continue;

      const canonical = normalizeRegistrationFieldKey(key);
      const existing = deduped.get(canonical);
      if (existing === undefined) {
        deduped.set(canonical, value);
        continue;
      }
      if (canonical === 'college') {
        const existingText = String(existing ?? '').trim();
        const nextText = String(value ?? '').trim();
        if (/^\d+$/.test(existingText) && !/^\d+$/.test(nextText)) {
          deduped.set(canonical, value);
        }
      }
    }
    return Array.from(deduped.entries());
  })();

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Student & Course Information - Highlighted */}
      <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 shadow-lg dark:border-blue-800 dark:from-blue-900/30 dark:to-slate-900/70">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300 mb-4">
              Student Information
            </h2>
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
                  <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Gender</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-slate-100 mt-1">
                    {admission.studentInfo?.gender || '—'}
                  </p>
                </div>
              </div>
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
                  {(admission.studentInfo as any)?.notes || '—'}
                </p>
              </div>
            </div>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300 mb-4">
              Course Information
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Course</p>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-300 mt-1">
                  {admission.courseInfo?.course || getCourseName(admission.courseInfo?.courseId) || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Branch</p>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-300 mt-1">
                  {admission.courseInfo?.branch || getBranchName(admission.courseInfo?.branchId) || '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Quota</p>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-300 mt-1">
                  {admission.courseInfo?.quota || '—'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Parents Information */}
      {admission.parents && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900/70">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-6">
            Parents Information
          </h2>
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
        </div>
      )}

      {/* Address Information */}
      {admission.address && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900/70">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-6">
            Address Information
          </h2>
          <div className="space-y-4">
            {admission.address.communication && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-300 mb-2">
                  Communication Address
                </h3>
                <div className="text-sm text-gray-600 dark:text-slate-400 space-y-1">
                  {admission.address.communication.doorOrStreet && (
                    <p>{admission.address.communication.doorOrStreet}</p>
                  )}
                  {admission.address.communication.landmark && (
                    <p>{admission.address.communication.landmark}</p>
                  )}
                  <p>
                    {[
                      admission.address.communication.villageOrCity,
                      admission.address.communication.mandal,
                      admission.address.communication.district,
                      admission.address.communication.pinCode,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Registration Form Fields */}
      {registrationFieldEntries.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900/70">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-6">
            Registration Form Fields
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {registrationFieldEntries.map(([key, raw]) => (
              <div key={key} className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {formatRegistrationFieldLabel(key)}
                </p>
                {isImageDataUrl(raw) ? (
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
        </div>
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
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {transactions.map((transaction) => (
                    <div
                      key={transaction._id}
                      className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/50"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                            {formatCurrency(transaction.amount)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-slate-400">
                            {formatDateTime(transaction.createdAt)}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            transaction.status === 'success'
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200'
                              : transaction.status === 'pending'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200'
                          }`}
                        >
                          {transaction.status}
                        </span>
                      </div>
                      {transaction.mode && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                          {transaction.mode === 'cash' ? 'Cash' : 'Online'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

