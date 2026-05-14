import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { courseAPI } from '@/lib/api';
import { Course, Branch } from '@/types';

export interface CourseLookup {
  courses: Map<string, string>;
  branches: Map<string, string>;
  getCourseName: (courseId?: string | null) => string;
  getBranchName: (branchId?: string | null) => string;
  /** College display name for a course (from secondary `courses.college_id` + `colleges`). */
  getCollegeNameForCourse: (courseId?: string | null) => string;
  isLoading: boolean;
}

/**
 * Hook to fetch and provide course/branch lookup maps from courseId/branchId
 */
export const useCourseLookup = (): CourseLookup => {
  const { data: coursesResponse, isLoading: coursesLoading } = useQuery({
    queryKey: ['courses', 'lookup'],
    queryFn: async () => {
      const response = await courseAPI.list({ includeBranches: true, showInactive: true });
      return response;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const { data: collegesResponse, isLoading: collegesLoading } = useQuery({
    queryKey: ['courses', 'colleges', 'lookup'],
    queryFn: async () => {
      const response = await courseAPI.listCollegesFromSecondary({ showInactive: true });
      return response;
    },
    staleTime: 5 * 60 * 1000,
  });

  const lookup = useMemo(() => {
    const payload = coursesResponse?.data;
    const courseList: Array<Course & { branches?: Branch[] }> = Array.isArray(payload)
      ? (payload as Array<Course & { branches?: Branch[] }>)
      : Array.isArray((payload as any)?.data)
      ? ((payload as any).data as Array<Course & { branches?: Branch[] }>)
      : [];

    const courses = new Map<string, string>();
    const branches = new Map<string, string>();
    const courseIdToCollegeId = new Map<string, string>();

    courseList.forEach((item) => {
      const cid = String(item._id);
      courses.set(cid, item.name);
      if (item.collegeId != null && String(item.collegeId).trim() !== '') {
        courseIdToCollegeId.set(cid, String(item.collegeId));
      }
      (item.branches || []).forEach((branch) => {
        branches.set(String(branch._id), branch.name);
      });
    });

    const collegePayload = collegesResponse?.data;
    const collegeList: Array<{ _id?: string; id?: string; name?: string }> = Array.isArray(collegePayload)
      ? (collegePayload as Array<{ _id?: string; id?: string; name?: string }>)
      : Array.isArray((collegePayload as any)?.data)
      ? ((collegePayload as any).data as Array<{ _id?: string; id?: string; name?: string }>)
      : [];

    const collegeNamesById = new Map<string, string>();
    collegeList.forEach((c) => {
      const id = String(c._id ?? c.id ?? '').trim();
      if (id) collegeNamesById.set(id, String(c.name ?? '').trim());
    });

    const getCollegeNameForCourse = (courseId?: string | null): string => {
      if (courseId == null || String(courseId).trim() === '') return '';
      const colId = courseIdToCollegeId.get(String(courseId));
      if (!colId) return '';
      return collegeNamesById.get(colId) || '';
    };

    return { courses, branches, getCollegeNameForCourse };
  }, [coursesResponse, collegesResponse]);

  /** Empty string when unknown so callers can fall back to stored `course` / `branch` labels. */
  const getCourseName = (courseId?: string | null): string => {
    if (courseId == null || String(courseId).trim() === '') return '';
    return lookup.courses.get(String(courseId)) || '';
  };

  const getBranchName = (branchId?: string | null): string => {
    if (branchId == null || String(branchId).trim() === '') return '';
    return lookup.branches.get(String(branchId)) || '';
  };

  return {
    courses: lookup.courses,
    branches: lookup.branches,
    getCourseName,
    getBranchName,
    getCollegeNameForCourse: lookup.getCollegeNameForCourse,
    isLoading: coursesLoading || collegesLoading,
  };
};

