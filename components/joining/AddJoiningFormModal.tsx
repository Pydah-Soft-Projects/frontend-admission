'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { joiningAPI, paymentSettingsAPI, courseAPI } from '@/lib/api';
import { REFERENCE_NAMES_QUERY_KEY } from '@/components/admission/ReferenceUserSelect';
import {
  mergeQuotaSelectOptions,
  parseStudentQuotasResponse,
  quotaLabelsFromCatalog,
} from '@/lib/studentQuotaCatalog';
import { parseJoiningPublicLinkFromApiResponse } from '@/lib/joiningInviteLink';
import { JoiningDraftSmsModal } from '@/components/joining/JoiningDraftSmsModal';
import { ReferenceUserSelect } from '@/components/admission/ReferenceUserSelect';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { showToast } from '@/lib/toast';
import type { CoursePaymentSettings } from '@/types';

const JOINING_FORM_DIRECT_SOURCE = 'Direct';
const JOINING_FORM_DEFAULT_SOURCE = 'Joining Form';

function resolveJoiningFormSource(reference1: string): string {
  if (reference1.trim().toLowerCase() === 'direct') return JOINING_FORM_DIRECT_SOURCE;
  return JOINING_FORM_DEFAULT_SOURCE;
}

type ExistingLeadPreview = NonNullable<
  Awaited<ReturnType<typeof joiningAPI.checkExistingLeadByPhones>>['data']
>['lead'];

type FormState = {
  studentName: string;
  studentPhone: string;
  fatherPhone: string;
  courseId: string;
  branchId: string;
  courseInterested: string;
  quota: string;
  reference1: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const initialForm: FormState = {
  studentName: '',
  studentPhone: '',
  fatherPhone: '',
  courseId: '',
  branchId: '',
  courseInterested: '',
  quota: '',
  reference1: '',
};

const onlyDigits = (value: string) => value.replace(/\D/g, '').slice(0, 10);

function applyExistingLeadToForm(
  prev: FormState,
  lead: NonNullable<ExistingLeadPreview>,
  courseSettings: CoursePaymentSettings[]
): FormState {
  const next = { ...prev };

  if (!next.studentName.trim() && lead.name) {
    next.studentName = lead.name.trim();
  }
  if (!next.studentPhone.trim() && lead.phone) {
    next.studentPhone = onlyDigits(lead.phone);
  }
  if (!next.fatherPhone.trim() && lead.fatherPhone) {
    next.fatherPhone = onlyDigits(lead.fatherPhone);
  }

  let courseId = String(lead.managedCourseId ?? '').trim();
  let branchId = String(lead.managedBranchId ?? '').trim();
  const courseInterested = String(lead.courseInterested ?? '').trim();

  if (!courseId && courseInterested && courseSettings.length > 0) {
    const matchedCourse = courseSettings.find(
      (item) => String(item.course.name ?? '').trim().toLowerCase() === courseInterested.toLowerCase()
    );
    if (matchedCourse) {
      courseId = String(matchedCourse.course._id ?? '').trim();
    }
  }

  if (!next.courseId.trim() && courseId) {
    next.courseId = courseId;
  }
  if (!next.branchId.trim() && branchId) {
    next.branchId = branchId;
  }
  if (!next.courseInterested.trim()) {
    if (courseInterested) {
      next.courseInterested = courseInterested;
    } else if (next.courseId) {
      const matchedCourse = courseSettings.find(
        (item) => String(item.course._id ?? '').trim() === next.courseId
      );
      if (matchedCourse?.course.name) {
        next.courseInterested = matchedCourse.course.name;
      }
    }
  }
  if (!next.quota.trim() && lead.quota && lead.quota !== 'Not Applicable') {
    next.quota = lead.quota.trim();
  }
  if (!next.reference1.trim() && lead.reference1) {
    next.reference1 = lead.reference1.trim();
  }

  return next;
}

const selectClassName =
  'w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100';

export function AddJoiningFormModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(initialForm);
  const [debouncedPhones, setDebouncedPhones] = useState({ studentPhone: '', fatherPhone: '' });
  const [debouncedReference1, setDebouncedReference1] = useState('');
  const appliedLeadKeyRef = useRef<string | null>(null);
  const [smsSession, setSmsSession] = useState<{
    leadId: string;
    admissionPublicLink: { url: string; expiresAt?: string; pathToken: string };
  } | null>(null);

  const { data: courseSettingsResponse, isLoading: isLoadingCourses } = useQuery({
    queryKey: ['payment-settings', 'courses', 'add-joining'],
    queryFn: async () => paymentSettingsAPI.listCourseSettings(),
    enabled: open,
  });

  const { data: studentQuotasResponse, isLoading: isLoadingQuotas } = useQuery({
    queryKey: ['courses', 'student-quotas', 'add-joining'],
    queryFn: async () => courseAPI.listStudentQuotas(),
    enabled: open,
    staleTime: 120_000,
  });

  const quotaSelectOptions = useMemo(
    () =>
      mergeQuotaSelectOptions(
        quotaLabelsFromCatalog(parseStudentQuotasResponse(studentQuotasResponse)),
        form.quota
      ),
    [studentQuotasResponse, form.quota]
  );

  const courseSettings: CoursePaymentSettings[] = useMemo(() => {
    const raw = courseSettingsResponse?.data;
    return Array.isArray(raw) ? raw : [];
  }, [courseSettingsResponse]);

  const selectedCourse = useMemo(() => {
    const target = String(form.courseId ?? '').trim();
    if (!target) return undefined;
    return courseSettings.find(
      (item) => String(item.course._id ?? '').trim() === target
    );
  }, [courseSettings, form.courseId]);

  const selectedBranch = useMemo(() => {
    const target = String(form.branchId ?? '').trim();
    if (!target) return undefined;
    return selectedCourse?.branches.find(
      (branch) => String(branch._id ?? '').trim() === target
    );
  }, [selectedCourse, form.branchId]);

  const studentPhoneDigits = onlyDigits(form.studentPhone);
  const fatherPhoneDigits = onlyDigits(form.fatherPhone);

  useEffect(() => {
    if (!open) {
      setDebouncedPhones({ studentPhone: '', fatherPhone: '' });
      appliedLeadKeyRef.current = null;
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedPhones({
        studentPhone: studentPhoneDigits,
        fatherPhone: fatherPhoneDigits,
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [open, studentPhoneDigits, fatherPhoneDigits]);

  useEffect(() => {
    if (!open) {
      setDebouncedReference1('');
      return;
    }
    const timer = window.setTimeout(() => {
      setDebouncedReference1(form.reference1.trim());
    }, 200);
    return () => window.clearTimeout(timer);
  }, [open, form.reference1]);

  const canCheckExistingLead =
    debouncedPhones.studentPhone.length === 10 || debouncedPhones.fatherPhone.length === 10;

  const { data: existingLeadCheck, isFetching: isCheckingExistingLead } = useQuery({
    queryKey: [
      'joining-existing-lead-check',
      debouncedPhones.studentPhone,
      debouncedPhones.fatherPhone,
      debouncedReference1,
    ],
    queryFn: async () =>
      joiningAPI.checkExistingLeadByPhones(
        debouncedPhones.studentPhone,
        debouncedPhones.fatherPhone,
        debouncedReference1
      ),
    enabled: open && canCheckExistingLead,
    staleTime: 30_000,
  });

  const existingLeadDetected = Boolean(existingLeadCheck?.data?.exists);
  const matchedLead = existingLeadCheck?.data?.lead ?? null;
  const resolvedSource =
    existingLeadCheck?.data?.source ?? resolveJoiningFormSource(form.reference1);

  useEffect(() => {
    if (!open) return;
    const lead = matchedLead;
    if (!lead?.id) {
      appliedLeadKeyRef.current = null;
      return;
    }
    const applyKey = `${lead.id}:${debouncedPhones.studentPhone}:${debouncedPhones.fatherPhone}`;
    if (appliedLeadKeyRef.current === applyKey) return;
    setForm((prev) => applyExistingLeadToForm(prev, lead, courseSettings));
    appliedLeadKeyRef.current = applyKey;
  }, [open, matchedLead, debouncedPhones.studentPhone, debouncedPhones.fatherPhone, courseSettings]);

  const createDraftMutation = useMutation({
    mutationFn: async () => {
      const courseName = selectedCourse?.course.name || form.courseInterested.trim();
      const branchName = selectedBranch?.name?.trim() || undefined;
      const quotaValue = form.quota.trim();
      return joiningAPI.createDraftAndPublicLink({
        studentName: form.studentName.trim(),
        studentPhone: onlyDigits(form.studentPhone),
        fatherPhone: onlyDigits(form.fatherPhone),
        courseInterested: courseName,
        courseId: selectedCourse?.course._id,
        branchId: selectedBranch?._id,
        branch: branchName,
        quota: quotaValue,
        programLevel:
          selectedCourse?.course.level != null ? String(selectedCourse.course.level) : undefined,
        reference1: form.reference1.trim() || undefined,
      });
    },
    onSuccess: (res) => {
      const parsed = parseJoiningPublicLinkFromApiResponse(res);
      const data = res.data;
      if (!parsed?.url || !data?.leadId) {
        showToast.error('Draft was created but the public link could not be resolved.');
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['joining-pipeline'] });
      void queryClient.invalidateQueries({ queryKey: ['joining-in-progress'] });
      void queryClient.invalidateQueries({ queryKey: ['confirmed-leads'] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      if (form.reference1.trim()) {
        void queryClient.invalidateQueries({ queryKey: [...REFERENCE_NAMES_QUERY_KEY] });
      }
      setSmsSession({
        leadId: data.leadId,
        admissionPublicLink: {
          url: parsed.url,
          expiresAt: parsed.expiresAt,
          pathToken: parsed.pathToken,
        },
      });
      setForm(initialForm);
      onClose();
      showToast.success(`Joining draft created with enquiry ${data.enquiryNumber}`);
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) => {
      showToast.error(error?.response?.data?.message || error?.message || 'Could not create joining draft');
    },
  });

  const hasBranches = Boolean(selectedCourse?.branches?.length);
  const courseOk =
    String(form.courseId || '').trim() !== '' ||
    (courseSettings.length === 0 && form.courseInterested.trim() !== '');
  const branchOk = !hasBranches || String(form.branchId || '').trim() !== '';
  const quotaOk = String(form.quota || '').trim() !== '';

  const canSubmit =
    form.studentName.trim() &&
    studentPhoneDigits.length === 10 &&
    fatherPhoneDigits.length === 10 &&
    courseOk &&
    branchOk &&
    quotaOk;

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  Add Joining Form
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Create a draft application with an enquiry number.
                </p>
              </div>
              <Button
                variant="light"
                onClick={onClose}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                x
              </Button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  label="Student Name"
                  value={form.studentName}
                  onChange={(event) => setForm((prev) => ({ ...prev, studentName: event.target.value }))}
                  placeholder="Enter student name"
                />
                <Input
                  label="Student Mobile Number"
                  value={form.studentPhone}
                  onChange={(event) => setForm((prev) => ({ ...prev, studentPhone: onlyDigits(event.target.value) }))}
                  placeholder="10 digit mobile number"
                  maxLength={10}
                />
                <Input
                  label="Parent Mobile Number"
                  value={form.fatherPhone}
                  onChange={(event) => setForm((prev) => ({ ...prev, fatherPhone: onlyDigits(event.target.value) }))}
                  placeholder="10 digit mobile number"
                  maxLength={10}
                />
                <div className="flex flex-col justify-end">
                  <p className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Lead source
                  </p>
                  <div
                    className={`min-h-[46px] rounded-xl border-2 px-4 py-3 text-sm shadow-sm ${
                      isCheckingExistingLead
                        ? 'border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-500'
                        : existingLeadDetected
                          ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200'
                          : canCheckExistingLead
                            ? 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400'
                            : 'border-dashed border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-500'
                    }`}
                  >
                    {isCheckingExistingLead ? (
                      'Checking CRM…'
                    ) : !canCheckExistingLead ? (
                      'Enter student or parent mobile'
                    ) : existingLeadDetected ? (
                      <span>
                        <span className="font-semibold">{resolvedSource}</span>
                        {matchedLead?.enquiryNumber ? (
                          <span className="mt-0.5 block text-xs opacity-90">
                            Existing CRM lead {matchedLead.enquiryNumber}
                            {matchedLead.name ? ` · ${matchedLead.name}` : ''}
                            {form.reference1.trim().toLowerCase() === 'direct'
                              ? ' · reference Direct'
                              : form.reference1.trim()
                                ? ` · reference ${form.reference1.trim()}`
                                : ''}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span>
                        <span className="font-semibold">{resolvedSource}</span>
                        <span className="mt-0.5 block text-xs opacity-90">
                          {form.reference1.trim().toLowerCase() === 'direct'
                            ? 'Reference is Direct'
                            : form.reference1.trim()
                              ? `Reference: ${form.reference1.trim()}`
                              : 'No matching lead — set reference to Direct or a staff name'}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    College / course <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.courseId}
                    onChange={(event) => {
                      const target = String(event.target.value ?? '').trim();
                      const course = courseSettings.find(
                        (item) => String(item.course._id ?? '').trim() === target
                      );
                      setForm((prev) => ({
                        ...prev,
                        courseId: event.target.value,
                        branchId: '',
                        courseInterested: course?.course.name || '',
                      }));
                    }}
                    className={selectClassName}
                    disabled={isLoadingCourses}
                  >
                    <option value="">{isLoadingCourses ? 'Loading courses...' : 'Select college / course'}</option>
                    {courseSettings.map((item) => (
                      <option key={item.course._id} value={item.course._id}>
                        {item.course.name}
                      </option>
                    ))}
                  </select>
                  {courseSettings.length === 0 && !isLoadingCourses ? (
                    <Input
                      className="mt-3"
                      label="College / course name"
                      value={form.courseInterested}
                      onChange={(event) => setForm((prev) => ({ ...prev, courseInterested: event.target.value }))}
                      placeholder="Type college or course name"
                    />
                  ) : null}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Branch {hasBranches ? <span className="text-red-500">*</span> : null}
                  </label>
                  <select
                    value={form.branchId}
                    onChange={(event) => setForm((prev) => ({ ...prev, branchId: event.target.value }))}
                    className={selectClassName}
                    disabled={!hasBranches}
                  >
                    <option value="">
                      {hasBranches ? 'Select branch' : 'Select a course first'}
                    </option>
                    {(selectedCourse?.branches ?? []).map((branch) => (
                      <option key={branch._id} value={branch._id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Quota <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.quota}
                    onChange={(event) => setForm((prev) => ({ ...prev, quota: event.target.value }))}
                    disabled={isLoadingQuotas}
                    className={selectClassName}
                  >
                    <option value="">
                      {isLoadingQuotas ? 'Loading quotas...' : 'Select quota'}
                    </option>
                    {quotaSelectOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
                <ReferenceUserSelect
                  label="Reference"
                  value={form.reference1}
                  onChange={(reference1) => setForm((prev) => ({ ...prev, reference1 }))}
                  showAddUserButton
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Final step: pick staff, use Add for a custom name, or leave as No reference.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setForm(initialForm)}
                disabled={createDraftMutation.isPending}
              >
                Reset
              </Button>
              <Button
                variant="primary"
                disabled={!canSubmit || createDraftMutation.isPending}
                onClick={() => createDraftMutation.mutate()}
              >
                {createDraftMutation.isPending ? 'Creating…' : 'Add Joining Form'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <JoiningDraftSmsModal
        open={Boolean(smsSession)}
        leadId={smsSession?.leadId}
        admissionPublicLink={smsSession?.admissionPublicLink}
        joiningOnlineAdmissionMode={Boolean(smsSession)}
        onClose={() => setSmsSession(null)}
      />
    </>
  );
}
