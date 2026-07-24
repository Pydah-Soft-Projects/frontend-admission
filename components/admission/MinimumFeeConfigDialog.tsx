'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { admissionAPI, courseAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { showToast } from '@/lib/toast';
import {
  parseStudentQuotasResponse,
  quotaLabelsFromCatalog,
} from '@/lib/studentQuotaCatalog';

/** One saved minimum transaction amount for college + course + quota. */
export type MinimumFeeConfigEntry = {
  id?: string;
  collegeId: string;
  collegeName: string;
  courseId: string;
  courseName: string;
  quota: string;
  amount: number;
};

/** @deprecated Prefer MinimumFeeConfigEntry — kept for older single-config callers. */
export type MinimumFeeConfig = MinimumFeeConfigEntry;

type CollegeOption = { id: string; name: string };
type CourseOption = { id: string; name: string; collegeId?: string };

type MinimumFeeConfigDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colleges: CollegeOption[];
  initialCollegeId?: string;
  configs: MinimumFeeConfigEntry[];
  /** Called after DB save/clear so parent can refetch. */
  onConfigsChanged: () => void | Promise<unknown>;
};

const selectClassName =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900';

const formatInr = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

export function configEntryKey(entry: {
  collegeId: string;
  courseId: string;
  quota: string;
}): string {
  return `${entry.collegeId}::${entry.courseId}::${String(entry.quota || '')
    .trim()
    .toLowerCase()}`;
}

/**
 * Resolve min fee for a pending row / filter context.
 * Prefer college+course+quota, then course+quota, then quota-only if unique.
 */
export function resolveMinimumFeeAmount(
  configs: MinimumFeeConfigEntry[],
  match: {
    collegeId?: string;
    courseId?: string;
    courseName?: string;
    quota?: string;
  }
): number {
  if (!configs.length) return 0;
  const quota = String(match.quota || '').trim().toLowerCase();
  const courseId = String(match.courseId || '').trim();
  const collegeId = String(match.collegeId || '').trim();
  const courseName = String(match.courseName || '').trim().toLowerCase();

  if (collegeId && courseId && quota) {
    const exact = configs.find(
      (c) =>
        c.collegeId === collegeId &&
        c.courseId === courseId &&
        c.quota.trim().toLowerCase() === quota
    );
    if (exact) return exact.amount;
  }

  if (courseId && quota) {
    const byCourseId = configs.find(
      (c) => c.courseId === courseId && c.quota.trim().toLowerCase() === quota
    );
    if (byCourseId) return byCourseId.amount;
  }

  if (courseName && quota) {
    const byCourseName = configs.find(
      (c) =>
        c.courseName.trim().toLowerCase() === courseName &&
        c.quota.trim().toLowerCase() === quota
    );
    if (byCourseName) return byCourseName.amount;
  }

  if (quota) {
    const byQuota = configs.filter((c) => c.quota.trim().toLowerCase() === quota);
    if (byQuota.length === 1) return byQuota[0].amount;
  }

  return 0;
}

function parseAmountInput(value: string): number {
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function MinimumFeeConfigDialog({
  open,
  onOpenChange,
  colleges,
  initialCollegeId = '',
  configs,
  onConfigsChanged,
}: MinimumFeeConfigDialogProps) {
  const [tab, setTab] = useState<'configure' | 'saved'>('configure');
  const [collegeId, setCollegeId] = useState('');
  const [courseId, setCourseId] = useState('');
  /** Draft amount inputs keyed by quota label for the selected course. */
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});
  const [savedCollegeFilter, setSavedCollegeFilter] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab('configure');
    setCollegeId(initialCollegeId || colleges[0]?.id || '');
    setCourseId('');
    setDraftAmounts({});
    setSavedCollegeFilter(initialCollegeId || '');
  }, [open, initialCollegeId, colleges]);

  const { data: coursesData, isLoading: coursesLoading } = useQuery({
    queryKey: ['courses', 'list', 'minimum-fee-config', collegeId],
    queryFn: async () => {
      const response = await courseAPI.list({
        showInactive: false,
        collegeId: collegeId || undefined,
      });
      return response.data || response;
    },
    enabled: open && Boolean(collegeId),
    staleTime: 120_000,
  });

  const { data: allCoursesData } = useQuery({
    queryKey: ['courses', 'list', 'minimum-fee-config-all'],
    queryFn: async () => {
      const response = await courseAPI.list({ showInactive: false });
      return response.data || response;
    },
    enabled: open && tab === 'saved',
    staleTime: 120_000,
  });

  const courses = useMemo(() => {
    const list = Array.isArray(coursesData) ? coursesData : (coursesData as any)?.data || [];
    return (list as CourseOption[])
      .map((c) => ({
        id: String(c.id ?? (c as any)._id ?? '').trim(),
        name: String(c.name || '').trim(),
        collegeId: c.collegeId != null ? String(c.collegeId) : undefined,
      }))
      .filter((c) => c.id && (!collegeId || c.collegeId === collegeId));
  }, [coursesData, collegeId]);

  const allCourses = useMemo(() => {
    const list = Array.isArray(allCoursesData)
      ? allCoursesData
      : (allCoursesData as any)?.data || [];
    return (list as CourseOption[])
      .map((c) => ({
        id: String(c.id ?? (c as any)._id ?? '').trim(),
        name: String(c.name || '').trim(),
        collegeId: c.collegeId != null ? String(c.collegeId) : undefined,
      }))
      .filter((c) => c.id);
  }, [allCoursesData]);

  const selectedCollegeName = useMemo(
    () => colleges.find((c) => c.id === collegeId)?.name || '',
    [colleges, collegeId]
  );

  const selectedCourseName = useMemo(
    () => courses.find((c) => c.id === courseId)?.name || '',
    [courses, courseId]
  );

  const { data: studentQuotasResponse, isLoading: quotasLoading } = useQuery({
    queryKey: ['courses', 'student-quotas', 'minimum-fee-config'],
    queryFn: async () => courseAPI.listStudentQuotas(),
    enabled: open,
    staleTime: 120_000,
  });

  const quotaOptions = useMemo(
    () => quotaLabelsFromCatalog(parseStudentQuotasResponse(studentQuotasResponse)),
    [studentQuotasResponse]
  );

  // Load draft amounts when college/course or saved configs change.
  useEffect(() => {
    if (!open || !collegeId || !courseId) {
      setDraftAmounts({});
      return;
    }
    const next: Record<string, string> = {};
    for (const quota of quotaOptions) {
      const existing = configs.find(
        (c) =>
          c.collegeId === collegeId &&
          c.courseId === courseId &&
          c.quota.trim().toLowerCase() === quota.trim().toLowerCase()
      );
      next[quota] = existing?.amount ? String(existing.amount) : '';
    }
    setDraftAmounts(next);
  }, [open, collegeId, courseId, configs, quotaOptions]);

  const courseProgress = useMemo(() => {
    if (!collegeId || !courseId || quotaOptions.length === 0) {
      return { entered: 0, total: 0, pending: 0 };
    }
    let entered = 0;
    for (const quota of quotaOptions) {
      const amount = parseAmountInput(draftAmounts[quota] || '');
      if (amount > 0) entered += 1;
    }
    return {
      entered,
      total: quotaOptions.length,
      pending: Math.max(quotaOptions.length - entered, 0),
    };
  }, [collegeId, courseId, quotaOptions, draftAmounts]);

  const savedSummary = useMemo(() => {
    const collegeIds =
      savedCollegeFilter
        ? [savedCollegeFilter]
        : colleges.map((c) => c.id);

    return collegeIds.map((cid) => {
      const collegeName = colleges.find((c) => c.id === cid)?.name || 'College';
      const collegeCourses = allCourses.filter((c) => c.collegeId === cid);
      const courseRows = collegeCourses.map((course) => {
        const enteredEntries = configs.filter(
          (c) => c.collegeId === cid && c.courseId === course.id
        );
        const enteredQuotas = new Set(
          enteredEntries.map((e) => e.quota.trim().toLowerCase())
        );
        const total = quotaOptions.length;
        const entered = quotaOptions.filter((q) =>
          enteredQuotas.has(q.trim().toLowerCase())
        ).length;
        const pendingQuotas = quotaOptions.filter(
          (q) => !enteredQuotas.has(q.trim().toLowerCase())
        );
        const enteredDetails = quotaOptions
          .filter((q) => enteredQuotas.has(q.trim().toLowerCase()))
          .map((q) => {
            const match = enteredEntries.find(
              (e) => e.quota.trim().toLowerCase() === q.trim().toLowerCase()
            );
            return { quota: q, amount: match?.amount || 0 };
          });

        return {
          courseId: course.id,
          courseName: course.name,
          entered,
          total,
          pending: Math.max(total - entered, 0),
          pendingQuotas,
          enteredDetails,
          isComplete: total > 0 && entered === total,
          hasAny: entered > 0,
        };
      });

      const configuredCourses = courseRows.filter((r) => r.hasAny).length;
      const completeCourses = courseRows.filter((r) => r.isComplete).length;

      return {
        collegeId: cid,
        collegeName,
        courses: courseRows,
        configuredCourses,
        completeCourses,
        totalCourses: courseRows.length,
      };
    });
  }, [savedCollegeFilter, colleges, allCourses, configs, quotaOptions]);

  const handleSaveCourse = async () => {
    if (!collegeId) {
      showToast.error('Select a college.');
      return;
    }
    if (!courseId) {
      showToast.error('Select a course.');
      return;
    }
    if (quotaOptions.length === 0) {
      showToast.error('No quotas available to configure.');
      return;
    }

    const nextEntries: Array<{ quota: string; amount: number }> = [];
    for (const quota of quotaOptions) {
      const amount = parseAmountInput(draftAmounts[quota] || '');
      if (amount <= 0) continue;
      nextEntries.push({ quota, amount });
    }

    if (nextEntries.length === 0) {
      showToast.error('Enter at least one quota minimum amount before saving.');
      return;
    }

    try {
      setIsSaving(true);
      await admissionAPI.upsertMinimumFeeConfigsForCourse({
        collegeId,
        collegeName: selectedCollegeName,
        courseId,
        courseName: selectedCourseName,
        entries: nextEntries,
      });
      await onConfigsChanged();
      showToast.success(
        `Saved ${nextEntries.length} of ${quotaOptions.length} quotas for ${selectedCourseName}`
      );
      setTab('saved');
      setSavedCollegeFilter(collegeId);
    } catch (error) {
      console.error('Failed to save minimum fee configs:', error);
      showToast.error('Failed to save minimum fee config. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearCourse = async () => {
    if (!collegeId || !courseId) return;
    try {
      setIsSaving(true);
      await admissionAPI.clearMinimumFeeConfigsForCourse(collegeId, courseId);
      await onConfigsChanged();
      setDraftAmounts((prev) => {
        const cleared: Record<string, string> = {};
        for (const key of Object.keys(prev)) cleared[key] = '';
        return cleared;
      });
      showToast.success(`Cleared minimum fee config for ${selectedCourseName || 'course'}`);
    } catch (error) {
      console.error('Failed to clear course minimum fee configs:', error);
      showToast.error('Failed to clear course config. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearCollege = async (cid: string) => {
    try {
      setIsSaving(true);
      await admissionAPI.clearMinimumFeeConfigsForCollege(cid);
      await onConfigsChanged();
      showToast.success('Cleared configs for this college.');
    } catch (error) {
      console.error('Failed to clear college minimum fee configs:', error);
      showToast.error('Failed to clear college config. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const totalSaved = configs.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-3xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6 dark:border-slate-800">
          <DialogTitle>Minimum Config</DialogTitle>
          <DialogDescription>
            Configure minimum transaction amounts per college, course, and quota. Values are stored
            in the admissions database and used for unpaid fee on the pending list and Print PDF.
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b border-slate-100 px-4 py-3 sm:px-6 dark:border-slate-800">
          <div className="inline-flex rounded-full border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setTab('configure')}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                tab === 'configure'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              Configure
            </button>
            <button
              type="button"
              onClick={() => setTab('saved')}
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                tab === 'saved'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              Saved {totalSaved > 0 ? `(${totalSaved})` : ''}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6">
          {tab === 'configure' ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  College
                </label>
                <select
                  value={collegeId}
                  onChange={(e) => {
                    setCollegeId(e.target.value);
                    setCourseId('');
                  }}
                  className={selectClassName}
                >
                  <option value="">Select college</option>
                  {colleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {collegeId ? (
                <div>
                  <div className="mb-2 flex items-end justify-between gap-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Course
                    </label>
                    {selectedCourseName ? (
                      <span className="text-[11px] text-slate-500">
                        {courseProgress.entered} of {courseProgress.total} quotas entered
                        {courseProgress.pending > 0
                          ? ` · ${courseProgress.pending} pending`
                          : courseProgress.total > 0
                          ? ' · complete'
                          : ''}
                      </span>
                    ) : null}
                  </div>
                  {coursesLoading ? (
                    <p className="text-sm text-slate-500">Loading courses…</p>
                  ) : courses.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
                      No courses found for this college.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {courses.map((course) => {
                        const entered = configs.filter(
                          (c) => c.collegeId === collegeId && c.courseId === course.id
                        ).length;
                        const total = quotaOptions.length;
                        const isActive = courseId === course.id;
                        const isComplete = total > 0 && entered === total;
                        return (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => setCourseId(course.id)}
                            className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                              isActive
                                ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                            }`}
                          >
                            <span className="block font-semibold">{course.name}</span>
                            <span
                              className={`mt-0.5 block text-[10px] font-medium ${
                                isActive
                                  ? 'text-white/80 dark:text-slate-700'
                                  : isComplete
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : entered > 0
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-slate-400'
                              }`}
                            >
                              {total === 0
                                ? 'No quotas'
                                : isComplete
                                ? `Complete · ${entered}/${total}`
                                : entered > 0
                                ? `${entered}/${total} entered`
                                : `0/${total} · pending`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              {collegeId && courseId ? (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selectedCollegeName} · {selectedCourseName}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Enter minimum transaction amount for each quota. Leave blank if not needed yet.
                    </p>
                  </div>
                  {quotasLoading ? (
                    <p className="px-4 py-8 text-center text-sm text-slate-500">Loading quotas…</p>
                  ) : quotaOptions.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-slate-500">
                      No student quotas found in catalog.
                    </p>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {quotaOptions.map((quota) => {
                        const amount = parseAmountInput(draftAmounts[quota] || '');
                        const isEntered = amount > 0;
                        return (
                          <div
                            key={quota}
                            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                  {quota}
                                </span>
                                <span
                                  className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                    isEntered
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                      : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                                  }`}
                                >
                                  {isEntered ? 'Entered' : 'Pending'}
                                </span>
                              </div>
                            </div>
                            <div className="w-full sm:w-48">
                              <input
                                type="number"
                                min={0}
                                step={1}
                                inputMode="numeric"
                                placeholder="Amount ₹"
                                value={draftAmounts[quota] || ''}
                                onChange={(e) =>
                                  setDraftAmounts((prev) => ({
                                    ...prev,
                                    [quota]: e.target.value,
                                  }))
                                }
                                className={selectClassName}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : collegeId ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
                  Select a course to enter quota minimum amounts.
                </p>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-500 dark:border-slate-700">
                  Select a college to begin.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  College
                </label>
                <select
                  value={savedCollegeFilter}
                  onChange={(e) => setSavedCollegeFilter(e.target.value)}
                  className={selectClassName}
                >
                  <option value="">All colleges</option>
                  {colleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {savedSummary.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
                  No colleges available.
                </p>
              ) : (
                savedSummary.map((college) => (
                  <div
                    key={college.collegeId}
                    className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {college.collegeName}
                        </h3>
                        <p className="text-xs text-slate-500">
                          {college.configuredCourses} of {college.totalCourses} courses have amounts
                          · {college.completeCourses} complete
                        </p>
                      </div>
                      {configs.some((c) => c.collegeId === college.collegeId) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleClearCollege(college.collegeId)}
                          isLoading={isSaving}
                          disabled={isSaving}
                        >
                          Clear college
                        </Button>
                      ) : null}
                    </div>

                    {college.courses.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-slate-500">No courses for this college.</p>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {college.courses.map((course) => (
                          <div key={course.courseId} className="px-4 py-3">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                                  {course.courseName}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500">
                                  {course.total === 0
                                    ? 'No quotas in catalog'
                                    : `${course.entered} of ${course.total} quotas entered · ${course.pending} pending`}
                                </p>
                              </div>
                              <span
                                className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  course.isComplete
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                    : course.hasAny
                                    ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                }`}
                              >
                                {course.isComplete
                                  ? 'Complete'
                                  : course.hasAny
                                  ? 'Partial'
                                  : 'Pending'}
                              </span>
                            </div>

                            {course.hasAny || course.pendingQuotas.length > 0 ? (
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {course.enteredDetails.map((row) => (
                                  <div
                                    key={`in-${row.quota}`}
                                    className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-2.5 py-1.5 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/20"
                                  >
                                    <span className="font-semibold text-emerald-800 dark:text-emerald-300">
                                      {row.quota}
                                    </span>
                                    <span className="ml-2 text-emerald-700 dark:text-emerald-400">
                                      {formatInr(row.amount)}
                                    </span>
                                  </div>
                                ))}
                                {course.pendingQuotas.map((quota) => (
                                  <div
                                    key={`pend-${quota}`}
                                    className="rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 py-1.5 text-xs dark:border-amber-900/40 dark:bg-amber-950/20"
                                  >
                                    <span className="font-semibold text-amber-800 dark:text-amber-300">
                                      {quota}
                                    </span>
                                    <span className="ml-2 text-amber-700 dark:text-amber-400">
                                      Pending
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : null}

                            <div className="mt-2">
                              <button
                                type="button"
                                className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                                onClick={() => {
                                  setCollegeId(college.collegeId);
                                  setCourseId(course.courseId);
                                  setTab('configure');
                                }}
                              >
                                Edit amounts
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {tab === 'configure' && collegeId && courseId ? (
            <>
              {configs.some((c) => c.collegeId === collegeId && c.courseId === courseId) ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleClearCourse}
                  isLoading={isSaving}
                  disabled={isSaving}
                >
                  Clear course
                </Button>
              ) : null}
              <Button type="button" onClick={handleSaveCourse} isLoading={isSaving} disabled={isSaving}>
                Save course config
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
