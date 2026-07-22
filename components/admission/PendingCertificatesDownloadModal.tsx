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
  mergeQuotaSelectOptions,
  parseStudentQuotasResponse,
  quotaLabelsFromCatalog,
} from '@/lib/studentQuotaCatalog';
import { escapePrintHtml, printHtmlDocument } from '@/lib/printHtml';
import { Download, Printer } from 'lucide-react';

type CollegeOption = { id: string; name: string };

/** Desk filters from the admissions page — keeps stats aligned with abstract / student-info. */
export type PendingDocumentsDeskFilters = {
  collegeId?: string;
  courseId?: string;
  courseName?: string;
  branchId?: string;
  branchName?: string;
  startDate?: string;
  endDate?: string;
};

type PendingCertificatesDownloadModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  colleges: CollegeOption[];
  /** Pre-select when the page already has a college filter / single-college scope. */
  initialCollegeId?: string;
  /** Shared with abstract tab & student-info list (active-only on backend). */
  deskFilters?: PendingDocumentsDeskFilters;
};

const PAGE_LIMIT = 20;

const selectClassName =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900';

const tableThClass =
  'px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 sm:px-4';
const tableTdClass = 'px-3 py-2.5 text-sm text-slate-700 sm:px-4 dark:text-slate-300';

export function PendingCertificatesDownloadModal({
  open,
  onOpenChange,
  colleges,
  initialCollegeId = '',
  deskFilters,
}: PendingCertificatesDownloadModalProps) {
  const [collegeId, setCollegeId] = useState(initialCollegeId);
  const [courseId, setCourseId] = useState('');
  const [quota, setQuota] = useState('');
  const [page, setPage] = useState(1);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCollegeId(initialCollegeId || '');
    setCourseId('');
    setQuota('');
    setPage(1);
    setHasLoadedOnce(false);
  }, [open, initialCollegeId]);

  const { data: coursesData, isLoading: coursesLoading } = useQuery({
    queryKey: ['courses', 'list', 'pending-certs', collegeId],
    queryFn: async () => {
      const response = await courseAPI.list({
        showInactive: false,
        collegeId: collegeId || undefined,
      });
      return response.data || response;
    },
    enabled: open,
    staleTime: 120_000,
  });

  const courses = useMemo(() => {
    const list = Array.isArray(coursesData) ? coursesData : (coursesData as any)?.data || [];
    if (!collegeId) return list as Array<{ id?: string; _id?: string; name?: string; collegeId?: string }>;
    return (list as Array<{ id?: string; _id?: string; name?: string; collegeId?: string }>).filter(
      (c) => c.collegeId != null && String(c.collegeId).trim() === collegeId
    );
  }, [coursesData, collegeId]);

  const selectedCourseName = useMemo(() => {
    const match = courses.find((c) => String(c.id ?? c._id ?? '').trim() === courseId);
    return match?.name ? String(match.name) : '';
  }, [courses, courseId]);

  const { data: studentQuotasResponse, isLoading: quotasLoading } = useQuery({
    queryKey: ['courses', 'student-quotas', 'pending-certs'],
    queryFn: async () => courseAPI.listStudentQuotas(),
    enabled: open,
    staleTime: 120_000,
  });

  const quotaOptions = useMemo(
    () =>
      mergeQuotaSelectOptions(
        quotaLabelsFromCatalog(parseStudentQuotasResponse(studentQuotasResponse)),
        quota
      ),
    [studentQuotasResponse, quota]
  );

  const filterParams = useMemo(
    () => ({
      collegeId: collegeId || deskFilters?.collegeId || undefined,
      courseId: courseId || deskFilters?.courseId || undefined,
      courseName: selectedCourseName || deskFilters?.courseName || undefined,
      branchId: deskFilters?.branchId || undefined,
      branchName: deskFilters?.branchName || undefined,
      startDate: deskFilters?.startDate || undefined,
      endDate: deskFilters?.endDate || undefined,
      quota: quota || undefined,
      page,
      limit: PAGE_LIMIT,
    }),
    [collegeId, courseId, selectedCourseName, quota, deskFilters, page]
  );

  const {
    data: pendingData,
    isLoading: pendingLoading,
    isFetching: pendingFetching,
    refetch,
  } = useQuery({
    queryKey: ['admissions', 'pending-certificates', filterParams],
    queryFn: async () => admissionAPI.listPendingCertificates(filterParams),
    enabled: open && hasLoadedOnce,
    staleTime: 30_000,
  });

  const rows = pendingData?.rows ?? [];
  const stats = pendingData?.stats;
  const pagination = pendingData?.pagination ?? {
    page: 1,
    pages: 1,
    limit: PAGE_LIMIT,
    total: pendingData?.total ?? 0,
  };
  const pendingTotal =
    pagination.total ?? stats?.otherPendingStudents ?? stats?.pendingStudents ?? 0;

  const handleLoad = async () => {
    setPage(1);
    if (!hasLoadedOnce) {
      setHasLoadedOnce(true);
      return;
    }
    await refetch();
  };

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      if (!hasLoadedOnce) {
        setHasLoadedOnce(true);
      }
      const { page: _page, limit: _limit, ...exportFilters } = filterParams;
      const blob = await admissionAPI.exportPendingCertificates(exportFilters);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      const date = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `pending_documents_${date}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast.success('Pending certificates export started');
    } catch (error) {
      console.error('Error exporting pending certificates:', error);
      showToast.error('Failed to export pending certificates. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrintPdf = async () => {
    try {
      setIsPrinting(true);
      if (!hasLoadedOnce) {
        setHasLoadedOnce(true);
      }
      const { page: _page, limit: _limit, ...baseFilters } = filterParams;
      const printData = await admissionAPI.listPendingCertificates({
        ...baseFilters,
        all: true,
      });
      const printRows = printData?.rows ?? [];
      if (printRows.length === 0) {
        showToast.error('No pending document records to print for the selected filters.');
        return;
      }

      const esc = escapePrintHtml;
      const bodyRows = printRows
        .map((row, index) => {
          const importantText = row.importantDocumentsPending?.length
            ? row.importantDocumentsPending.join(', ')
            : row.importantDocumentsPendingText || 'Completed';
          const otherText = row.otherDocumentsPending?.length
            ? row.otherDocumentsPending.join(', ')
            : row.otherDocumentsPendingText || row.pendingCertificatesText || '—';
          return `
      <tr>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;">${index + 1}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;font-weight:600;">${esc(row.studentName || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.admissionNumber || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.course || '—')}${row.branch ? `<div style="font-size:10px;color:#64748b;">${esc(row.branch)}</div>` : ''}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.parentMobile || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(row.studentMobile || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;text-align:center;">${esc(row.quota || '—')}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(importantText)}</td>
        <td style="padding:6px 8px;border:1px solid #e2e8f0;">${esc(otherText)}</td>
      </tr>`;
        })
        .join('');

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Pending Documents</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; color: #0f172a; }
    .page-header { text-align: center; margin-bottom: 14px; padding-bottom: 10px; border-bottom: 2px solid #0f172a; }
    .page-header h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: 0.08em; text-transform: uppercase; }
    .page-header p { margin: 0; font-size: 12px; color: #64748b; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th { padding: 8px; border: 1px solid #cbd5e1; background: #f1f5f9; text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em; text-align: left; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .footer { margin-top: 12px; font-size: 10px; color: #94a3b8; text-align: right; }
  </style>
</head>
<body>
  <div class="page-header">
    <h1>Pending Documents</h1>
    <p>Other documents pending — ${printRows.length} student(s)</p>
    <p>Generated ${esc(new Date().toLocaleString('en-IN'))}</p>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width:40px;text-align:center;">S.No</th>
        <th>Student Name</th>
        <th>Admission No</th>
        <th>Course</th>
        <th>Parent Mobile</th>
        <th>Student Mobile</th>
        <th style="text-align:center;">Quota</th>
        <th>Important Documents</th>
        <th>Other Documents Pending</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="footer">Admissions CRM — Pending Documents report</div>
</body>
</html>`;

      printHtmlDocument(html, 'Pending Documents');
    } catch (error) {
      console.error('Error printing pending documents:', error);
      showToast.error('Failed to prepare pending documents print. Please try again.');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[98vw] max-w-7xl flex-col overflow-hidden p-0 sm:max-w-7xl">
        <DialogHeader className="shrink-0 border-b border-slate-200 px-4 py-4 sm:px-6 dark:border-slate-800">
          <DialogTitle>Pending documents</DialogTitle>
          <DialogDescription>
            Active admissions only, using the same date and desk filters as the Abstract tab. Stats
            separate Step 2 Important Documents from Other Documents. Paginated list and Excel export
            show students with other documents pending (Important Documents status included in export).
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b border-slate-100 px-4 py-4 sm:px-6 dark:border-slate-800">
          <div className="flex flex-nowrap items-end gap-3 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="min-w-[140px] flex-1">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                College
              </label>
              <select
                value={collegeId}
                onChange={(e) => {
                  setCollegeId(e.target.value);
                  setCourseId('');
                  setPage(1);
                  setHasLoadedOnce(false);
                }}
                className={selectClassName}
              >
                <option value="">All Colleges</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[140px] flex-1">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Course
              </label>
              <select
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  setPage(1);
                  setHasLoadedOnce(false);
                }}
                className={selectClassName}
                disabled={coursesLoading}
              >
                <option value="">{coursesLoading ? 'Loading courses...' : 'All Courses'}</option>
                {courses.map((c) => {
                  const id = String(c.id ?? c._id ?? '').trim();
                  if (!id) return null;
                  return (
                    <option key={id} value={id}>
                      {c.name || id}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="min-w-[120px] flex-1">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Quota
              </label>
              <select
                value={quota}
                onChange={(e) => {
                  setQuota(e.target.value);
                  setPage(1);
                  setHasLoadedOnce(false);
                }}
                className={selectClassName}
                disabled={quotasLoading}
              >
                <option value="">{quotasLoading ? 'Loading quotas...' : 'All Quotas'}</option>
                {quotaOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-[38px] shrink-0 whitespace-nowrap"
              onClick={handleLoad}
              isLoading={pendingFetching}
            >
              Show list
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-[38px] shrink-0 gap-2 whitespace-nowrap"
              onClick={handlePrintPdf}
              isLoading={isPrinting}
            >
              <Printer className="h-4 w-4" />
              Print PDF
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-[38px] shrink-0 gap-2 whitespace-nowrap"
              onClick={handleDownload}
              isLoading={isDownloading}
            >
              <Download className="h-4 w-4" />
              Download XLSX
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-4 sm:px-6">
          {!hasLoadedOnce ? (
            <p className="py-10 text-center text-sm text-slate-500">
              Select filters and click <span className="font-semibold">Show list</span> to view stats
              (Important vs Other documents) and students with other documents still pending.
            </p>
          ) : pendingLoading || pendingFetching ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-400 border-t-transparent" />
              <p className="mt-3 text-xs uppercase tracking-[0.3em] text-slate-400">Loading…</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total students</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {stats?.totalStudents ?? 0}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">Active admissions (desk filters)</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                    Important received
                  </p>
                  <p className="mt-1 text-2xl font-bold text-emerald-800 dark:text-emerald-300">
                    {stats?.importantReceivedStudents ?? 0}
                  </p>
                  <p className="mt-0.5 text-[10px] text-emerald-700/80 dark:text-emerald-400/80">
                    Step 2 important docs complete
                  </p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    Important pending
                  </p>
                  <p className="mt-1 text-2xl font-bold text-amber-800 dark:text-amber-300">
                    {stats?.importantPendingStudents ?? 0}
                  </p>
                  <p className="mt-0.5 text-[10px] text-amber-700/80 dark:text-amber-400/80">
                    Step 2 important docs incomplete
                  </p>
                </div>
                <div className="rounded-xl border border-orange-200 bg-orange-50/80 px-4 py-3 dark:border-orange-900/50 dark:bg-orange-950/30">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400">
                    Other pending
                  </p>
                  <p className="mt-1 text-2xl font-bold text-orange-800 dark:text-orange-300">
                    {stats?.otherPendingStudents ?? stats?.pendingStudents ?? 0}
                  </p>
                  <p className="mt-0.5 text-[10px] text-orange-700/80 dark:text-orange-400/80">
                    Other documents incomplete
                  </p>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-4 py-3 dark:border-sky-900/50 dark:bg-sky-950/30">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-400">
                    Other completed
                  </p>
                  <p className="mt-1 text-2xl font-bold text-sky-800 dark:text-sky-300">
                    {stats?.otherCompletedStudents ?? stats?.completedStudents ?? 0}
                  </p>
                  <p className="mt-0.5 text-[10px] text-sky-700/80 dark:text-sky-400/80">
                    All other documents received
                  </p>
                </div>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      Other documents pending
                    </h3>
                    <p className="text-xs text-slate-500">
                      Showing {rows.length} of {pendingTotal} student(s)
                      {pagination.pages > 1
                        ? ` — page ${pagination.page} of ${pagination.pages}`
                        : ''}
                      . Download XLSX exports other documents only.
                    </p>
                  </div>
                </div>

                {rows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500 dark:border-slate-700">
                    No students found with pending other documents for the selected filters.
                  </p>
                ) : (
                  <>
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="min-w-[1200px] w-full divide-y divide-slate-200 dark:divide-slate-800">
                        <thead className="bg-slate-50 dark:bg-slate-900/70">
                          <tr>
                            <th className={tableThClass}>Student Name</th>
                            <th className={tableThClass}>Admission No</th>
                            <th className={tableThClass}>Course</th>
                            <th className={tableThClass}>Parent Mobile No</th>
                            <th className={tableThClass}>Student Mobile No</th>
                            <th className={`${tableThClass} text-center`}>Quota</th>
                            <th className={tableThClass}>Important Documents</th>
                            <th className={tableThClass}>Other Documents Pending</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {rows.map((row) => {
                            const importantText = row.importantDocumentsPending?.length
                              ? row.importantDocumentsPending.join(', ')
                              : row.importantDocumentsPendingText || 'Completed';
                            const otherText = row.otherDocumentsPending?.length
                              ? row.otherDocumentsPending.join(', ')
                              : row.otherDocumentsPendingText || 'Completed';
                            const importantDone =
                              !row.importantDocumentsPending?.length &&
                              (importantText === 'Completed' || !importantText || importantText === '—');
                            return (
                              <tr key={row.id}>
                                <td className={`${tableTdClass} font-medium text-slate-900 dark:text-slate-100`}>
                                  {row.studentName || '—'}
                                </td>
                                <td className={`${tableTdClass} font-semibold text-blue-600 dark:text-blue-400`}>
                                  {row.admissionNumber || '—'}
                                </td>
                                <td className={tableTdClass}>
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                                      {row.course || '—'}
                                    </span>
                                    {row.branch ? (
                                      <span className="text-[10px] text-slate-500">{row.branch}</span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className={tableTdClass}>{row.parentMobile || '—'}</td>
                                <td className={tableTdClass}>{row.studentMobile || '—'}</td>
                                <td className={`${tableTdClass} text-center`}>
                                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                    {row.quota || '—'}
                                  </span>
                                </td>
                                <td className={tableTdClass}>
                                  {importantDone || importantText === 'Completed' ? (
                                    <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                      Completed
                                    </span>
                                  ) : (
                                    importantText
                                  )}
                                </td>
                                <td className={tableTdClass}>{otherText}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {pagination.pages > 1 && (
                      <div className="mt-3 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:gap-4 dark:border-slate-700 dark:text-slate-300">
                        <div className="text-center sm:text-left">
                          Page {pagination.page} of {pagination.pages}
                        </div>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 sm:flex-none"
                            onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                            disabled={pagination.page === 1 || pendingFetching}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 sm:flex-none"
                            onClick={() => setPage((prev) => Math.min(prev + 1, pagination.pages))}
                            disabled={pagination.page === pagination.pages || pendingFetching}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-200 px-4 py-3 sm:px-6 dark:border-slate-800">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
