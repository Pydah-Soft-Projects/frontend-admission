'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { joiningAPI, paymentSettingsAPI, courseAPI } from '@/lib/api';
import {
  mergeQuotaSelectOptions,
  parseStudentQuotasResponse,
  quotaLabelsFromCatalog,
} from '@/lib/studentQuotaCatalog';
import { parseJoiningPublicLinkFromApiResponse } from '@/lib/joiningInviteLink';
import { JoiningDraftSmsModal } from '@/components/joining/JoiningDraftSmsModal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { showToast } from '@/lib/toast';
import type { CoursePaymentSettings } from '@/types';

type FormState = {
  studentName: string;
  studentPhone: string;
  fatherPhone: string;
  courseId: string;
  branchId: string;
  courseInterested: string;
  quota: string;
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
};

const onlyDigits = (value: string) => value.replace(/\D/g, '').slice(0, 10);

export function SendJoiningFormModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(initialForm);
  const [smsSession, setSmsSession] = useState<{
    leadId: string;
    admissionPublicLink: { url: string; expiresAt?: string; pathToken: string };
  } | null>(null);

  const { data: courseSettingsResponse, isLoading: isLoadingCourses } = useQuery({
    queryKey: ['payment-settings', 'courses', 'send-joining'],
    queryFn: async () => paymentSettingsAPI.listCourseSettings(),
    enabled: open,
  });

  const { data: studentQuotasResponse, isLoading: isLoadingQuotas } = useQuery({
    queryKey: ['courses', 'student-quotas', 'send-joining'],
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

  const createDraftMutation = useMutation({
    mutationFn: async () => {
      const courseName = selectedCourse?.course.name || form.courseInterested.trim();
      return joiningAPI.createDraftAndPublicLink({
        studentName: form.studentName.trim(),
        studentPhone: onlyDigits(form.studentPhone),
        fatherPhone: onlyDigits(form.fatherPhone),
        courseInterested: courseName,
        courseId: selectedCourse?.course._id,
        branchId: selectedBranch?._id,
        branch: selectedBranch?.name,
        quota: form.quota.trim(),
        programLevel:
          selectedCourse?.course.level != null ? String(selectedCourse.course.level) : undefined,
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
      showToast.success(`Draft created with enquiry ${data.enquiryNumber}`);
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
    onlyDigits(form.studentPhone).length === 10 &&
    onlyDigits(form.fatherPhone).length === 10 &&
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
                  Send Joining Form
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Create a draft application with an enquiry number and send the Step 1 application link (mobile-friendly).
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

            <div className="grid gap-4 md:grid-cols-2">
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
                label="Father Mobile Number"
                value={form.fatherPhone}
                onChange={(event) => setForm((prev) => ({ ...prev, fatherPhone: onlyDigits(event.target.value) }))}
                placeholder="10 digit mobile number"
                maxLength={10}
              />

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
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
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

              {selectedCourse?.branches?.length ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Branch <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={form.branchId}
                    onChange={(event) => setForm((prev) => ({ ...prev, branchId: event.target.value }))}
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                  >
                    <option value="">Select branch</option>
                    {selectedCourse.branches.map((branch) => (
                      <option key={branch._id} value={branch._id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Quota <span className="text-red-500">*</span>
                </label>
                <select
                  value={form.quota}
                  onChange={(event) => setForm((prev) => ({ ...prev, quota: event.target.value }))}
                  disabled={isLoadingQuotas}
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
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
                {createDraftMutation.isPending ? 'Creating...' : 'Create Draft & Send SMS'}
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
