'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { courseAPI } from '@/lib/api';
import { showToast } from '@/lib/toast';
import { Branch, Course } from '@/types';
import { useDashboardHeader, useModulePermission } from '@/components/layout/DashboardShell';
import { useRouter } from 'next/navigation';

type ManagedCourse = Course & { branches?: Branch[] };

type BranchFormState = {
  name: string;
  code: string;
  description: string;
};

const emptyBranchForm: BranchFormState = {
  name: '',
  code: '',
  description: '',
};

type CourseFormState = {
  name: string;
  code: string;
  description: string;
  isActive: boolean;
};

type BranchEditFormState = BranchFormState & { isActive: boolean };

export default function CourseManagementPage() {
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const router = useRouter();
  const { hasAccess: canAccessPayments, canWrite: canEditPayments } = useModulePermission('payments');

  useEffect(() => {
    setHeaderContent(
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
          Course &amp; Branch Setup
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Maintain the official list of courses and branches. These drive joining form selections and
          payment fee mapping.
        </p>
      </div>
    );
    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent]);

  useEffect(() => {
    if (!canAccessPayments) {
      router.replace('/superadmin/dashboard');
    }
  }, [canAccessPayments, router]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['courses', 'with-branches'],
    queryFn: async () => {
      const response = await courseAPI.list({ includeBranches: true, showInactive: true });
      return response;
    },
  });

  const courses: ManagedCourse[] = useMemo(() => {
    const payload = data?.data;
    if (Array.isArray(payload)) {
      return payload as ManagedCourse[];
    }
    if (payload && Array.isArray((payload as any).data)) {
      return (payload as any).data as ManagedCourse[];
    }
    return [];
  }, [data]);

  const [newCourse, setNewCourse] = useState({
    name: '',
    code: '',
    description: '',
  });
  const [branchForms, setBranchForms] = useState<Record<string, BranchFormState>>({});
  const [isCreateCourseOpen, setIsCreateCourseOpen] = useState(false);
  const [branchModalCourseId, setBranchModalCourseId] = useState<string | null>(null);
  const [editingCourse, setEditingCourse] = useState<ManagedCourse | null>(null);
  const [courseEditForm, setCourseEditForm] = useState<CourseFormState>({
    name: '',
    code: '',
    description: '',
    isActive: true,
  });
  const [editingBranch, setEditingBranch] = useState<{
    courseId: string;
    courseName: string;
    branch: Branch;
  } | null>(null);
  const [branchEditForm, setBranchEditForm] = useState<BranchEditFormState>({
    name: '',
    code: '',
    description: '',
    isActive: true,
  });

  const createCourseMutation = useMutation({
    mutationFn: (payload: { name: string; code?: string; description?: string }) =>
      courseAPI.create(payload),
    onSuccess: () => {
      showToast.success('Course created successfully');
      setNewCourse({ name: '', code: '', description: '' });
      setIsCreateCourseOpen(false);
      refetch();
    },
    onError: (error: any) => {
      showToast.error(error?.response?.data?.message || 'Failed to create course');
    },
  });

  const updateCourseMutation = useMutation({
    mutationFn: ({
      courseId,
      payload,
    }: {
      courseId: string;
      payload: { name?: string; code?: string; description?: string; isActive?: boolean };
    }) => courseAPI.update(courseId, payload),
    onSuccess: () => {
      refetch();
      showToast.success('Course updated');
    },
    onError: (error: any) => {
      showToast.error(error?.response?.data?.message || 'Failed to update course');
    },
  });

  const deleteCourseMutation = useMutation({
    mutationFn: (courseId: string) => courseAPI.delete(courseId),
    onSuccess: () => {
      refetch();
      showToast.success('Course deleted');
    },
    onError: (error: any) => {
      showToast.error(error?.response?.data?.message || 'Unable to delete course');
    },
  });

  const createBranchMutation = useMutation({
    mutationFn: ({
      courseId,
      payload,
    }: {
      courseId: string;
      payload: { name: string; code?: string; description?: string };
    }) => courseAPI.createBranch(courseId, payload),
    onSuccess: (_, variables) => {
      const { courseId } = variables;
      setBranchForms((prev) => ({
        ...prev,
        [courseId]: emptyBranchForm,
      }));
      setBranchModalCourseId(null);
      refetch();
      showToast.success('Branch added');
    },
    onError: (error: any) => {
      showToast.error(error?.response?.data?.message || 'Failed to add branch');
    },
  });

  const updateBranchMutation = useMutation({
    mutationFn: ({
      courseId,
      branchId,
      payload,
    }: {
      courseId: string;
      branchId: string;
      payload: { name?: string; code?: string; description?: string; isActive?: boolean };
    }) => courseAPI.updateBranch(courseId, branchId, payload),
    onSuccess: () => {
      refetch();
      showToast.success('Branch updated');
    },
    onError: (error: any) => {
      showToast.error(error?.response?.data?.message || 'Failed to update branch');
    },
  });

  const handleCreateCourse = () => {
    if (!canEditPayments) {
      showToast.error('You do not have permission to modify courses');
      return;
    }
    if (!newCourse.name.trim()) {
      showToast.error('Course name is required');
      return;
    }
    createCourseMutation.mutate({
      name: newCourse.name.trim(),
      code: newCourse.code.trim() || undefined,
      description: newCourse.description.trim() || undefined,
    });
  };

  const openCourseEditModal = (course: ManagedCourse) => {
    if (!canEditPayments) {
      showToast.error('You do not have permission to edit courses');
      return;
    }
    setEditingCourse(course);
    setCourseEditForm({
      name: course.name,
      code: course.code || '',
      description: course.description || '',
      isActive: course.isActive ?? true,
    });
  };

  const closeCourseEditModal = () => {
    setEditingCourse(null);
    setCourseEditForm({
      name: '',
      code: '',
      description: '',
      isActive: true,
    });
  };

  const handleUpdateCourse = () => {
    if (!editingCourse) return;
    if (!courseEditForm.name.trim()) {
      showToast.error('Course name is required');
      return;
    }

    updateCourseMutation.mutate(
      {
        courseId: editingCourse._id,
        payload: {
          name: courseEditForm.name.trim(),
          code: courseEditForm.code.trim() || undefined,
          description: courseEditForm.description.trim() || undefined,
          isActive: courseEditForm.isActive,
        },
      },
      {
        onSuccess: () => {
          closeCourseEditModal();
        },
        onError: (error: any) => {
          if (error?.response?.data?.message) {
            showToast.error(error.response.data.message);
          }
        },
      }
    );
  };

  const handleToggleCourse = (course: ManagedCourse) => {
    if (!canEditPayments) {
      showToast.error('You do not have permission to update course status');
      return;
    }
    updateCourseMutation.mutate({
      courseId: course._id,
      payload: { isActive: !course.isActive },
    });
  };

  const handleDeleteCourse = (course: ManagedCourse) => {
    if (!canEditPayments) {
      showToast.error('You do not have permission to delete courses');
      return;
    }
    if ((course.branches?.length || 0) > 0) {
      showToast.error('Remove all branches before deleting a course.');
      return;
    }
    const confirmed = window.confirm(
      `Delete course "${course.name}"? This action cannot be undone.`
    );
    if (!confirmed) return;
    deleteCourseMutation.mutate(course._id);
  };

  const handleAddBranch = (courseId: string) => {
    if (!canEditPayments) {
      showToast.error('You do not have permission to add branches');
      return;
    }
    const form = branchForms[courseId] || emptyBranchForm;
    if (!form.name.trim()) {
      showToast.error('Branch name is required');
      return;
    }
    createBranchMutation.mutate({
      courseId,
      payload: {
        name: form.name.trim(),
        code: form.code.trim() || undefined,
        description: form.description.trim() || undefined,
      },
    });
  };

  const openBranchEditModal = (courseId: string, branch: Branch) => {
    if (!canEditPayments) {
      showToast.error('You do not have permission to edit branches');
      return;
    }
    const courseName = courses.find((item) => item._id === courseId)?.name || 'Course';
    setEditingBranch({
      courseId,
      courseName,
      branch,
    });
    setBranchEditForm({
      name: branch.name,
      code: branch.code || '',
      description: branch.description || '',
      isActive: branch.isActive ?? true,
    });
  };

  const closeBranchEditModal = () => {
    setEditingBranch(null);
    setBranchEditForm({
      name: '',
      code: '',
      description: '',
      isActive: true,
    });
  };

  const handleUpdateBranch = () => {
    if (!canEditPayments) {
      showToast.error('You do not have permission to edit branches');
      return;
    }
    if (!editingBranch) return;
    if (!branchEditForm.name.trim()) {
      showToast.error('Branch name is required');
      return;
    }
    updateBranchMutation.mutate(
      {
        courseId: editingBranch.courseId,
        branchId: editingBranch.branch._id,
        payload: {
          name: branchEditForm.name.trim(),
          code: branchEditForm.code.trim() || undefined,
          description: branchEditForm.description.trim() || undefined,
          isActive: branchEditForm.isActive,
        },
      },
      {
        onSuccess: () => {
          closeBranchEditModal();
        },
        onError: (error: any) => {
          if (error?.response?.data?.message) {
            showToast.error(error.response.data.message);
          }
        },
      }
    );
  };

  const handleToggleBranch = (courseId: string, branch: Branch) => {
    if (!canEditPayments) {
      showToast.error('You do not have permission to update branch status');
      return;
    }
    updateBranchMutation.mutate({
      courseId,
      branchId: branch._id,
      payload: { isActive: !branch.isActive },
    });
  };

  const isBusy =
    createCourseMutation.isPending ||
    updateCourseMutation.isPending ||
    createBranchMutation.isPending ||
    updateBranchMutation.isPending ||
    deleteCourseMutation.isPending;

  if (!canAccessPayments) {
    return null;
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Courses &amp; Branches
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Manage the catalog used across joining forms and payment configuration.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => refetch()} disabled={isBusy || isLoading}>
              Refresh
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setNewCourse({ name: '', code: '', description: '' });
                setIsCreateCourseOpen(true);
              }}
            >
              Create Course
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-3xl border border-white/60 bg-white/95 p-10 text-center text-sm text-slate-500 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400 dark:shadow-none">
            Loading courses…
          </div>
        ) : courses.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900/30 dark:text-slate-400">
            No courses yet. Create your first course to begin mapping branches and fees.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {courses.map((course) => (
              <div
                key={course._id}
                className="group relative flex h-full flex-col rounded-3xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                          {course.name}
                        </h3>
                        {!course.isActive && (
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            Inactive
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {course.code ? `Code · ${course.code}` : 'No course code'}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                      {(course.branches?.length || 0).toString().padStart(2, '0')} branch
                      {(course.branches?.length || 0) === 1 ? '' : 'es'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 line-clamp-3 dark:text-slate-400">
                    {course.description || 'No description provided.'}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => openCourseEditModal(course)} disabled={!canEditPayments}>
                    Edit
                  </Button>
                      <Button variant="secondary" onClick={() => handleToggleCourse(course)} disabled={!canEditPayments}>
                    {course.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setBranchForms((prev) => ({
                        ...prev,
                        [course._id]: emptyBranchForm,
                      }));
                      setBranchModalCourseId(course._id);
                    }}
                        disabled={!canEditPayments}
                  >
                    Add Branch
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleDeleteCourse(course)}
                        disabled={deleteCourseMutation.isPending || !canEditPayments}
                  >
                    Delete
                  </Button>
                </div>

                <div className="mt-6 space-y-3">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Branches
                  </h4>
                  {course.branches && course.branches.length > 0 ? (
                    <div className="grid gap-3">
                      {course.branches.map((branch) => (
                        <div
                          key={branch._id}
                          className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm shadow-sm transition hover:border-blue-200 dark:border-slate-700 dark:bg-slate-900/60"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-slate-100">
                                {branch.name}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {branch.code ? `Code · ${branch.code}` : 'No branch code'}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => openBranchEditModal(course._id, branch)}
                                disabled={!canEditPayments}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleToggleBranch(course._id, branch)}
                                disabled={!canEditPayments}
                              >
                                {branch.isActive ? 'Deactivate' : 'Activate'}
                              </Button>
                            </div>
                          </div>
                          {branch.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {branch.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-500 dark:border-slate-600 dark:text-slate-400">
                      No branches added yet.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {isCreateCourseOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-white/60 bg-white/95 p-6 shadow-xl shadow-blue-100/30 dark:border-slate-800 dark:bg-slate-900/95">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Create Course
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Add a course so it appears in joining workflows and payment configuration.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsCreateCourseOpen(false);
                  setNewCourse({ name: '', code: '', description: '' });
                }}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close create course dialog"
                disabled={createCourseMutation.isPending}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Input
                label="Course Name"
                value={newCourse.name}
                onChange={(event) => setNewCourse((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g. B.Tech"
              />
              <Input
                label="Course Code (optional)"
                value={newCourse.code}
                onChange={(event) => setNewCourse((prev) => ({ ...prev, code: event.target.value }))}
                placeholder="Internal reference"
              />
              <div className="md:col-span-2">
                <Input
                  label="Description (optional)"
                  value={newCourse.description}
                  onChange={(event) =>
                    setNewCourse((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Short description for admins"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsCreateCourseOpen(false);
                  setNewCourse({ name: '', code: '', description: '' });
                }}
                disabled={createCourseMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCreateCourse}
                disabled={createCourseMutation.isPending || !canEditPayments}
              >
                {createCourseMutation.isPending ? 'Creating…' : 'Create Course'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {branchModalCourseId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-white/60 bg-white/95 p-6 shadow-xl shadow-blue-100/30 dark:border-slate-800 dark:bg-slate-900/95">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Add Branch
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Create a branch under{' '}
                  <span className="font-semibold">
                    {courses.find((c) => c._id === branchModalCourseId)?.name || 'this course'}
                  </span>
                  .
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (branchModalCourseId) {
                    setBranchForms((prev) => ({
                      ...prev,
                      [branchModalCourseId]: emptyBranchForm,
                    }));
                  }
                  setBranchModalCourseId(null);
                }}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close add branch dialog"
                disabled={createBranchMutation.isPending}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Input
                label="Branch Name"
                value={(branchForms[branchModalCourseId]?.name) || ''}
                onChange={(event) =>
                  setBranchForms((prev) => ({
                    ...prev,
                    [branchModalCourseId]: {
                      ...(prev[branchModalCourseId] || emptyBranchForm),
                      name: event.target.value,
                    },
                  }))
                }
                placeholder="e.g. Computer Science"
              />
              <Input
                label="Branch Code (optional)"
                value={(branchForms[branchModalCourseId]?.code) || ''}
                onChange={(event) =>
                  setBranchForms((prev) => ({
                    ...prev,
                    [branchModalCourseId]: {
                      ...(prev[branchModalCourseId] || emptyBranchForm),
                      code: event.target.value,
                    },
                  }))
                }
                placeholder="Short code"
              />
              <div className="md:col-span-2">
                <Input
                  label="Description (optional)"
                  value={(branchForms[branchModalCourseId]?.description) || ''}
                  onChange={(event) =>
                    setBranchForms((prev) => ({
                      ...prev,
                      [branchModalCourseId]: {
                        ...(prev[branchModalCourseId] || emptyBranchForm),
                        description: event.target.value,
                      },
                    }))
                  }
                  placeholder="Brief description for admins"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  if (branchModalCourseId) {
                    setBranchForms((prev) => ({
                      ...prev,
                      [branchModalCourseId]: emptyBranchForm,
                    }));
                  }
                  setBranchModalCourseId(null);
                }}
                disabled={createBranchMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => branchModalCourseId && handleAddBranch(branchModalCourseId)}
                disabled={createBranchMutation.isPending || !canEditPayments}
              >
                {createBranchMutation.isPending ? 'Adding…' : 'Add Branch'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-white/60 bg-white/95 p-6 shadow-xl shadow-blue-100/30 dark:border-slate-800 dark:bg-slate-900/95">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Edit Course
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Update course details used across joining and payment configuration.
                </p>
              </div>
              <button
                type="button"
                onClick={closeCourseEditModal}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close edit course dialog"
                disabled={updateCourseMutation.isPending}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Input
                label="Course Name"
                value={courseEditForm.name}
                onChange={(event) =>
                  setCourseEditForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="e.g. B.Tech"
              />
              <Input
                label="Course Code"
                value={courseEditForm.code}
                onChange={(event) =>
                  setCourseEditForm((prev) => ({ ...prev, code: event.target.value }))
                }
                placeholder="Internal reference"
              />
              <div className="md:col-span-2">
                <Input
                  label="Description"
                  value={courseEditForm.description}
                  onChange={(event) =>
                    setCourseEditForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Short description for admins"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Status
                </label>
                <select
                  value={courseEditForm.isActive ? 'active' : 'inactive'}
                  onChange={(event) =>
                    setCourseEditForm((prev) => ({
                      ...prev,
                      isActive: event.target.value === 'active',
                    }))
                  }
                  disabled={!canEditPayments}
                  className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={closeCourseEditModal}
                disabled={updateCourseMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleUpdateCourse}
                disabled={updateCourseMutation.isPending || !canEditPayments}
              >
                {updateCourseMutation.isPending ? 'Saving…' : 'Update Course'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingBranch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-2xl rounded-3xl border border-white/60 bg-white/95 p-6 shadow-xl shadow-blue-100/30 dark:border-slate-800 dark:bg-slate-900/95">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Edit Branch
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Update branch details for{' '}
                  <span className="font-semibold">{editingBranch.courseName}</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={closeBranchEditModal}
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close edit branch dialog"
                disabled={updateBranchMutation.isPending}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Input
                label="Branch Name"
                value={branchEditForm.name}
                onChange={(event) =>
                  setBranchEditForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="e.g. Computer Science"
              />
              <Input
                label="Branch Code"
                value={branchEditForm.code}
                onChange={(event) =>
                  setBranchEditForm((prev) => ({ ...prev, code: event.target.value }))
                }
                placeholder="Short code"
              />
              <div className="md:col-span-2">
                <Input
                  label="Description"
                  value={branchEditForm.description}
                  onChange={(event) =>
                    setBranchEditForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  placeholder="Brief description for admins"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Status
                </label>
                <select
                  value={branchEditForm.isActive ? 'active' : 'inactive'}
                  onChange={(event) =>
                    setBranchEditForm((prev) => ({
                      ...prev,
                      isActive: event.target.value === 'active',
                    }))
                  }
                  className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={closeBranchEditModal}
                disabled={updateBranchMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleUpdateBranch}
                  disabled={updateBranchMutation.isPending || !canEditPayments}
              >
                {updateBranchMutation.isPending ? 'Saving…' : 'Update Branch'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


