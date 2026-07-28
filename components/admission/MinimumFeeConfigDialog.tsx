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

/** One saved minimum transaction amount for college + course + branch + quota. */
export type MinimumFeeConfigEntry = {
  id?: string;
  collegeId: string;
  collegeName: string;
  courseId: string;
  courseName: string;
  branchId: string;
  branchName: string;
  quota: string;
  amount: number;
};

/** @deprecated Prefer MinimumFeeConfigEntry — kept for older single-config callers. */
export type MinimumFeeConfig = MinimumFeeConfigEntry;

type CollegeOption = { id: string; name: string };
type CourseOption = { id: string; name: string; collegeId?: string };
type BranchOption = { id: string; name: string };

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
  branchId: string;
  quota: string;
}): string {
  return `${entry.collegeId}::${entry.courseId}::${entry.branchId}::${String(entry.quota || '')
    .trim()
    .toLowerCase()}`;
}

/**
 * Resolve min fee for a pending row / filter context.
 * Prefer college+course+branch+quota, then course+branch+quota, then branch+quota if unique.
 */
export function resolveMinimumFeeAmount(
  configs: MinimumFeeConfigEntry[],
  match: {
    collegeId?: string;
    courseId?: string;
    courseName?: string;
    branchId?: string;
    branchName?: string;
    quota?: string;
  }
): number {
  if (!configs.length) return 0;
  const quota = String(match.quota || '').trim().toLowerCase();
  const courseId = String(match.courseId || '').trim();
  const collegeId = String(match.collegeId || '').trim();
  const courseName = String(match.courseName || '').trim().toLowerCase();
  const branchId = String(match.branchId || '').trim();
  const branchName = String(match.branchName || '').trim().toLowerCase();

  if (collegeId && courseId && branchId && quota) {
    const exact = configs.find(
      (c) =>
        c.collegeId === collegeId &&
        c.courseId === courseId &&
        c.branchId === branchId &&
        c.quota.trim().toLowerCase() === quota
    );
    if (exact) return exact.amount;
  }

  if (courseId && branchId && quota) {
    const byCourseId = configs.find(
      (c) =>
        c.courseId === courseId &&
        c.branchId === branchId &&
        c.quota.trim().toLowerCase() === quota
    );
    if (byCourseId) return byCourseId.amount;
  }

  if (courseName && branchName && quota) {
    const byCourseName = configs.find(
      (c) =>
        c.courseName.trim().toLowerCase() === courseName &&
        c.branchName.trim().toLowerCase() === branchName &&
        c.quota.trim().toLowerCase() === quota
    );
    if (byCourseName) return byCourseName.amount;
  }

  if (branchId && quota) {
    const byBranch = configs.filter(
      (c) => c.branchId === branchId && c.quota.trim().toLowerCase() === quota
    );
    if (byBranch.length === 1) return byBranch[0].amount;
  }

  // Backward compatibility: old course-level configs without branch scope.
  if (collegeId && courseId && quota) {
    const courseLevel = configs.find(
      (c) =>
        c.collegeId === collegeId &&
        c.courseId === courseId &&
        !String(c.branchId || '').trim() &&
        c.quota.trim().toLowerCase() === quota
    );
    if (courseLevel) return courseLevel.amount;
  }

  if (courseId && quota) {
    const byCourseId = configs.find(
      (c) =>
        c.courseId === courseId &&
        !String(c.branchId || '').trim() &&
        c.quota.trim().toLowerCase() === quota
    );
    if (byCourseId) return byCourseId.amount;
  }

  if (courseName && quota) {
    const byCourseName = configs.find(
      (c) =>
        c.courseName.trim().toLowerCase() === courseName &&
        !String(c.branchId || '').trim() &&
        c.quota.trim().toLowerCase() === quota
    );
    if (byCourseName) return byCourseName.amount;
  }

  return 0;
}

function parseAmountInput(value: string): number {
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sameCourseConfig(
  row: Pick<MinimumFeeConfigEntry, 'collegeId' | 'courseId' | 'courseName'>,
  collegeId: string,
  courseId: string,
  courseName: string
) {
  if (row.collegeId !== collegeId) return false;
  if (row.courseId === courseId) return true;
  return (
    String(row.courseName || '').trim().toLowerCase() ===
    String(courseName || '').trim().toLowerCase()
  );
}

function sameDraftAmounts(a: Record<string, string>, b: Record<string, string>) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if ((a[key] || '') !== (b[key] || '')) return false;
  }
  return true;
}

/** Course-level drafts use quota only; branch matrix uses branchId::quota. */
function courseDraftKey(quota: string) {
  return String(quota || '');
}

function branchDraftKey(branchId: string, quota: string) {
  return `${String(branchId || '').trim()}::${String(quota || '')}`;
}

function amountForQuota(
  entries: MinimumFeeConfigEntry[],
  quota: string,
  branchId?: string
): string {
  const q = quota.trim().toLowerCase();
  const wantBranch = String(branchId || '').trim();
  const match = entries.find(
    (c) =>
      c.quota.trim().toLowerCase() === q &&
      String(c.branchId || '').trim() === wantBranch
  );
  return match?.amount ? String(match.amount) : '';
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
  const [enableBranches, setEnableBranches] = useState(false);
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});
  const [savedCollegeFilter, setSavedCollegeFilter] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const defaultCollegeId = initialCollegeId || colleges[0]?.id || '';

  useEffect(() => {
    if (!open) return;
    setTab('configure');
    setCollegeId(defaultCollegeId);
    setCourseId('');
    setEnableBranches(false);
    setDraftAmounts({});
    setSavedCollegeFilter(initialCollegeId || '');
  }, [open]);

  const { data: coursesData, isLoading: coursesLoading } = useQuery({
    queryKey: ['courses', 'list', 'minimum-fee-config', collegeId],
    queryFn: async () => {
      const response = await courseAPI.list({ showInactive: false, collegeId: collegeId || undefined });
      return response.data || response;
    },
    enabled: open && Boolean(collegeId),
    staleTime: 120_000,
  });

  const { data: branchesData, isLoading: branchesLoading } = useQuery({
    queryKey: ['branches', 'list', 'minimum-fee-config', courseId],
    queryFn: async () => {
      const response = await courseAPI.listBranches({ courseId });
      return response.data || response;
    },
    enabled: open && Boolean(courseId),
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

  const branches = useMemo(() => {
    const list = Array.isArray(branchesData) ? branchesData : (branchesData as any)?.data || [];
    return (list as Array<{ id?: string; _id?: string; name?: string; code?: string }>)
      .map((b) => ({
        id: String(b.id ?? b._id ?? '').trim(),
        name: String(b.name || b.code || '').trim(),
      }))
      .filter((b) => b.id && b.name);
  }, [branchesData]);

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

  const courseEntries = useMemo(
    () =>
      configs.filter((c) => sameCourseConfig(c, collegeId, courseId, selectedCourseName)),
    [configs, collegeId, courseId, selectedCourseName]
  );
  const courseLevelEntries = useMemo(
    () => courseEntries.filter((c) => !String(c.branchId || '').trim()),
    [courseEntries]
  );
  const branchScopedEntries = useMemo(
    () => courseEntries.filter((c) => String(c.branchId || '').trim() !== ''),
    [courseEntries]
  );

  // When switching course, open branch matrix if branch-scoped rows already exist.
  useEffect(() => {
    if (!open || !collegeId || !courseId) {
      setEnableBranches((prev) => (prev ? false : prev));
      return;
    }
    const hasBranchConfigs = configs.some(
      (c) =>
        sameCourseConfig(c, collegeId, courseId, selectedCourseName) &&
        String(c.branchId || '').trim() !== ''
    );
    setEnableBranches(hasBranchConfigs);
    // Only re-evaluate when the selected course changes — not on every configs refresh,
    // so the user can toggle the checkbox without it snapping back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, collegeId, courseId, selectedCourseName]);

  // Prefill drafts: course-level list, or branch×quota matrix defaulting to course config.
  useEffect(() => {
    if (!open || !collegeId || !courseId) {
      setDraftAmounts((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }

    const next: Record<string, string> = {};
    if (!enableBranches) {
      for (const quota of quotaOptions) {
        next[courseDraftKey(quota)] = amountForQuota(courseLevelEntries, quota);
      }
    } else {
      for (const branch of branches) {
        for (const quota of quotaOptions) {
          const branchAmount = amountForQuota(branchScopedEntries, quota, branch.id);
          const courseAmount = amountForQuota(courseLevelEntries, quota);
          // Prefer saved branch amount; otherwise default to course-level config; else empty.
          next[branchDraftKey(branch.id, quota)] = branchAmount || courseAmount || '';
        }
      }
    }
    setDraftAmounts((prev) => (sameDraftAmounts(prev, next) ? prev : next));
  }, [
    open,
    collegeId,
    courseId,
    enableBranches,
    quotaOptions,
    courseLevelEntries,
    branchScopedEntries,
    branches,
  ]);

  const courseProgress = useMemo(() => {
    let entered = 0;
    let total = 0;
    if (!enableBranches) {
      total = quotaOptions.length;
      for (const quota of quotaOptions) {
        if (parseAmountInput(draftAmounts[courseDraftKey(quota)] || '') > 0) entered += 1;
      }
    } else {
      total = quotaOptions.length * branches.length;
      for (const branch of branches) {
        for (const quota of quotaOptions) {
          if (parseAmountInput(draftAmounts[branchDraftKey(branch.id, quota)] || '') > 0) {
            entered += 1;
          }
        }
      }
    }
    return { entered, total, pending: Math.max(total - entered, 0) };
  }, [quotaOptions, draftAmounts, enableBranches, branches]);

  const savedSummary = useMemo(() => {
    const filtered = savedCollegeFilter
      ? configs.filter((c) => c.collegeId === savedCollegeFilter)
      : configs;
    const byCollege = new Map<
      string,
      {
        collegeName: string;
        courses: Map<string, { courseName: string; branches: Map<string, { branchName: string; rows: MinimumFeeConfigEntry[] }> }>;
      }
    >();

    for (const row of filtered) {
      if (!byCollege.has(row.collegeId)) {
        byCollege.set(row.collegeId, { collegeName: row.collegeName, courses: new Map() });
      }
      const college = byCollege.get(row.collegeId)!;
      if (!college.courses.has(row.courseId)) {
        college.courses.set(row.courseId, { courseName: row.courseName, branches: new Map() });
      }
      const course = college.courses.get(row.courseId)!;
      if (!course.branches.has(row.branchId)) {
        course.branches.set(row.branchId, {
          branchName: row.branchName || (String(row.branchId || '').trim() ? row.branchName : 'All branches'),
          rows: [],
        });
      }
      course.branches.get(row.branchId)!.rows.push(row);
    }

    return Array.from(byCollege.entries()).map(([collegeIdKey, college]) => ({
      collegeId: collegeIdKey,
      collegeName: college.collegeName,
      courses: Array.from(college.courses.entries()).map(([courseIdKey, course]) => ({
        courseId: courseIdKey,
        courseName: course.courseName,
        branches: Array.from(course.branches.entries()).map(([branchIdKey, branch]) => ({
          branchId: branchIdKey,
          branchName: branch.branchName,
          enteredDetails: branch.rows
            .slice()
            .sort((a, b) => a.quota.localeCompare(b.quota))
            .map((r) => ({ quota: r.quota, amount: r.amount })),
        })),
      })),
    }));
  }, [configs, savedCollegeFilter]);

  const handleSaveCourse = async () => {
    if (!collegeId) return showToast.error('Select a college.');
    if (!courseId) return showToast.error('Select a course.');
    if (quotaOptions.length === 0) return showToast.error('No quotas available to configure.');

    try {
      setIsSaving(true);

      if (!enableBranches) {
        const nextEntries: Array<{ quota: string; amount: number }> = [];
        for (const quota of quotaOptions) {
          const amount = parseAmountInput(draftAmounts[courseDraftKey(quota)] || '');
          if (amount > 0) nextEntries.push({ quota, amount });
        }
        if (nextEntries.length === 0) {
          showToast.error('Enter at least one quota minimum amount before saving.');
          return;
        }
        await admissionAPI.upsertMinimumFeeConfigsForCourse({
          collegeId,
          collegeName: selectedCollegeName,
          courseId,
          courseName: selectedCourseName,
          branches: [],
          entries: nextEntries,
        });
        showToast.success(`Saved ${nextEntries.length} course-level quota minimums.`);
      } else {
        if (branches.length === 0) {
          showToast.error('No branches found for this course.');
          return;
        }
        let savedBranches = 0;
        let savedCells = 0;
        for (const branch of branches) {
          const nextEntries: Array<{ quota: string; amount: number }> = [];
          for (const quota of quotaOptions) {
            const amount = parseAmountInput(
              draftAmounts[branchDraftKey(branch.id, quota)] || ''
            );
            if (amount > 0) nextEntries.push({ quota, amount });
          }
          if (nextEntries.length === 0) continue;
          await admissionAPI.upsertMinimumFeeConfigsForCourse({
            collegeId,
            collegeName: selectedCollegeName,
            courseId,
            courseName: selectedCourseName,
            branches: [{ branchId: branch.id, branchName: branch.name }],
            entries: nextEntries,
          });
          savedBranches += 1;
          savedCells += nextEntries.length;
        }
        if (savedBranches === 0) {
          showToast.error('Enter at least one amount in the branch matrix before saving.');
          return;
        }
        showToast.success(
          `Saved ${savedCells} quota minimums across ${savedBranches} branch(es).`
        );
      }

      await onConfigsChanged();
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
      if (enableBranches) {
        const branchIds = branches.map((b) => b.id);
        await admissionAPI.clearMinimumFeeConfigsForCourse(collegeId, courseId, branchIds);
        // Keep course-level rows; reset matrix to course defaults or empty.
        const next: Record<string, string> = {};
        for (const branch of branches) {
          for (const quota of quotaOptions) {
            next[branchDraftKey(branch.id, quota)] =
              amountForQuota(courseLevelEntries, quota) || '';
          }
        }
        setDraftAmounts(next);
        showToast.success(
          `Cleared branch configs for ${selectedCourseName || 'course'} (course-level kept as defaults).`
        );
      } else {
        await admissionAPI.clearMinimumFeeConfigsForCourse(collegeId, courseId);
        setDraftAmounts(
          Object.fromEntries(quotaOptions.map((quota) => [courseDraftKey(quota), '']))
        );
        showToast.success(`Cleared minimum fee config for ${selectedCourseName || 'course'}`);
      }
      await onConfigsChanged();
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
  const selectedCourseHasAnyConfig = configs.some((c) =>
    sameCourseConfig(c, collegeId, courseId, selectedCourseName)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-6xl flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6 dark:border-slate-800">
          <DialogTitle>Minimum Config</DialogTitle>
          <DialogDescription>
            Configure minimum transaction amounts per college, course, branch, and quota.
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
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">College</label>
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
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {collegeId ? (
                <div>
                  <div className="mb-2 flex items-end justify-between gap-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Course</label>
                    {selectedCourseName ? (
                      <span className="text-[11px] text-slate-500">
                        {enableBranches
                          ? `Branch matrix · ${courseProgress.entered}/${courseProgress.total} cells`
                          : `Course-level config · ${courseProgress.entered}/${courseProgress.total} quotas entered`}
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
                        const branchIds = new Set(
                          configs
                            .filter((c) =>
                              sameCourseConfig(c, collegeId, course.id, course.name)
                            )
                            .map((c) => c.branchId)
                        );
                        const hasCourseLevelConfig = branchIds.has('');
                        const branchCount = Array.from(branchIds).filter((id) => String(id || '').trim() !== '').length;
                        const isActive = courseId === course.id;
                        return (
                          <button
                            key={course.id}
                            type="button"
                            onClick={() => {
                              setCourseId(course.id);
                            }}
                            className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                              isActive
                                ? 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
                            }`}
                          >
                            <span className="block font-semibold">{course.name}</span>
                            <span className={`mt-0.5 block text-[10px] ${isActive ? 'text-white/80 dark:text-slate-700' : 'text-slate-400'}`}>
                              {branchCount > 0
                                ? `${branchCount} branches configured${hasCourseLevelConfig ? ' + course-level' : ''}`
                                : hasCourseLevelConfig
                                ? 'Course-level configured'
                                : 'No config'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              {collegeId && courseId ? (
                <>
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedCollegeName} · {selectedCourseName}</h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        Leave branches off for one course-level config. Turn them on to edit a quota × branch matrix — cells default from the course config when present.
                      </p>
                    </div>
                    <div className="p-4">
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-700">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={enableBranches}
                          onChange={(e) => setEnableBranches(e.target.checked)}
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-200">
                          Enable branches for this course
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {enableBranches ? 'Quota × Branch Minimums' : 'Quota Minimums'}
                      </h3>
                      {enableBranches ? (
                        <p className="mt-0.5 text-xs text-slate-500">
                          Quotas on the left, branches across the top. Empty cells stay unset; course-level amounts are used as defaults when opening.
                        </p>
                      ) : null}
                    </div>
                    {quotasLoading ? (
                      <p className="px-4 py-8 text-center text-sm text-slate-500">Loading quotas…</p>
                    ) : quotaOptions.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-slate-500">No student quotas found in catalog.</p>
                    ) : !enableBranches ? (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {quotaOptions.map((quota) => {
                          const amount = parseAmountInput(draftAmounts[courseDraftKey(quota)] || '');
                          const isEntered = amount > 0;
                          return (
                            <div key={quota} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{quota}</span>
                                  <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                                    isEntered
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                                      : 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                                  }`}>
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
                                  value={draftAmounts[courseDraftKey(quota)] || ''}
                                  onChange={(e) =>
                                    setDraftAmounts((prev) => ({
                                      ...prev,
                                      [courseDraftKey(quota)]: e.target.value,
                                    }))
                                  }
                                  className={selectClassName}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : branchesLoading ? (
                      <p className="px-4 py-8 text-center text-sm text-slate-500">Loading branches…</p>
                    ) : branches.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-slate-500">No branches found for this course.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/50">
                              <th className="sticky left-0 z-10 min-w-[10rem] bg-slate-50 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:bg-slate-900">
                                Quota
                              </th>
                              {branches.map((branch) => (
                                <th
                                  key={branch.id}
                                  className="min-w-[8.5rem] px-2 py-2.5 text-center text-xs font-semibold text-slate-800 dark:text-slate-100"
                                >
                                  {branch.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {quotaOptions.map((quota) => (
                              <tr key={quota}>
                                <th className="sticky left-0 z-10 bg-white px-3 py-2.5 text-left text-xs font-semibold text-slate-800 dark:bg-slate-950 dark:text-slate-100">
                                  {quota}
                                </th>
                                {branches.map((branch) => {
                                  const key = branchDraftKey(branch.id, quota);
                                  const amount = parseAmountInput(draftAmounts[key] || '');
                                  return (
                                    <td key={key} className="px-2 py-2 align-middle">
                                      <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        inputMode="numeric"
                                        placeholder="—"
                                        value={draftAmounts[key] || ''}
                                        onChange={(e) =>
                                          setDraftAmounts((prev) => ({
                                            ...prev,
                                            [key]: e.target.value,
                                          }))
                                        }
                                        className={`${selectClassName} ${
                                          amount > 0
                                            ? 'border-emerald-200 dark:border-emerald-900/50'
                                            : ''
                                        }`}
                                        aria-label={`${quota} · ${branch.name}`}
                                      />
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : collegeId ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-500 dark:border-slate-700">Select a course to configure quota minimums.</p>
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center text-sm text-slate-500 dark:border-slate-700">Select a college to begin.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">College</label>
                <select value={savedCollegeFilter} onChange={(e) => setSavedCollegeFilter(e.target.value)} className={selectClassName}>
                  <option value="">All colleges</option>
                  {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {savedSummary.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 px-3 py-10 text-center text-sm text-slate-500 dark:border-slate-700">No saved configs.</p>
              ) : (
                savedSummary.map((college) => (
                  <div key={college.collegeId} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{college.collegeName}</h3>
                        <p className="text-xs text-slate-500">{college.courses.length} course(s) configured</p>
                      </div>
                      {configs.some((c) => c.collegeId === college.collegeId) ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => handleClearCollege(college.collegeId)} isLoading={isSaving} disabled={isSaving}>
                          Clear college
                        </Button>
                      ) : null}
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {college.courses.map((course) => (
                        <div key={course.courseId} className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{course.courseName}</p>
                          <div className="mt-2 space-y-3">
                            {course.branches.map((branch) => (
                              <div key={branch.branchId || '__course__'} className="rounded-xl border border-slate-200 px-3 py-3 dark:border-slate-700">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{branch.branchName || 'All branches'}</p>
                                  <button
                                    type="button"
                                    className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                                    onClick={() => {
                                      setCollegeId(college.collegeId);
                                      setCourseId(course.courseId);
                                      setEnableBranches(Boolean(String(branch.branchId || '').trim()));
                                      setTab('configure');
                                    }}
                                  >
                                    Edit
                                  </button>
                                </div>
                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                  {branch.enteredDetails.map((row) => (
                                    <div key={`${branch.branchId}-${row.quota}`} className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-2.5 py-1.5 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
                                      <span className="font-semibold text-emerald-800 dark:text-emerald-300">{row.quota}</span>
                                      <span className="ml-2 text-emerald-700 dark:text-emerald-400">{formatInr(row.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {tab === 'configure' && collegeId && courseId ? (
            <>
              {selectedCourseHasAnyConfig ? (
                <Button type="button" variant="outline" onClick={handleClearCourse} isLoading={isSaving} disabled={isSaving}>
                  {enableBranches ? 'Clear branch configs' : 'Clear course config'}
                </Button>
              ) : null}
              <Button type="button" onClick={handleSaveCourse} isLoading={isSaving} disabled={isSaving}>
                {enableBranches ? 'Save branch matrix' : 'Save course config'}
              </Button>
            </>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
