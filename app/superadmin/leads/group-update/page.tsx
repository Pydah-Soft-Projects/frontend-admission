'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/auth';
import { leadAPI } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useDashboardHeader } from '@/components/layout/DashboardShell';

type StagingRow = {
  id: number;
  enquiryNumber: string;
  name: string;
  village: string | null;
  mandal: string | null;
  street: string | null;
  createdAt?: string | null;
};

type StagedRowsResponse = {
  rows?: StagingRow[];
  totalStaged?: number;
  returned?: number;
  truncated?: boolean;
  maxRows?: number;
  warning?: string | null;
};

export default function GroupUpdatePage() {
  const router = useRouter();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<'upload' | 'view'>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingStaged, setIsLoadingStaged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ totalInExcel?: number; stagedInTempTable?: number; message?: string } | null>(null);
  const [stagedCount, setStagedCount] = useState<number | null>(null);
  const [stagedRows, setStagedRows] = useState<StagingRow[]>([]);
  const [listWarning, setListWarning] = useState<string | null>(null);
  const stagedRequestIdRef = useRef(0);

  useEffect(() => {
    const currentUser = auth.getUser();
    if (!currentUser || (currentUser.roleName !== 'Super Admin' && currentUser.roleName !== 'Sub Super Admin')) {
      router.push('/auth/login');
      return;
    }
  }, [router]);

  useEffect(() => {
    setHeaderContent(
      <div className="flex flex-col items-end gap-2 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Excel location staging</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Stage Enquiry Number, Name, village, mandal — then view rows in the temp table (no lead lookup)
        </p>
      </div>
    );
    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent]);

  const fetchStagedCount = async () => {
    try {
      const data = await leadAPI.getStagedCount();
      const c = typeof data.count === 'number' ? data.count : Number(data.count || 0);
      setStagedCount(c);
    } catch (err) {
      console.error('Failed to fetch staged count', err);
    }
  };

  useEffect(() => {
    fetchStagedCount();
  }, [activeTab]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  const handleStageUpload = async () => {
    if (!file) {
      setError('Please select an Excel file');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = (await leadAPI.bulkUpdateLeadGroups(formData)) as {
        totalInExcel?: number;
        stagedInTempTable?: number;
        message?: string;
      };
      setResult(response);
      setStagedRows([]);
      setListWarning(null);
      fetchStagedCount();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e.response?.data?.message || e.message || 'Failed to stage file');
    } finally {
      setIsProcessing(false);
    }
  };

  /** Loads rows from lead_location_staging only (single fast SELECT). */
  const loadStagedRows = useCallback(async () => {
    const requestId = ++stagedRequestIdRef.current;
    setIsLoadingStaged(true);
    setError(null);
    setListWarning(null);
    try {
      const data = (await leadAPI.getStagedRows()) as StagedRowsResponse;
      if (requestId !== stagedRequestIdRef.current) return;
      const rows = Array.isArray(data.rows) ? data.rows : [];
      setStagedRows(rows);
      setListWarning(
        data.warning ||
          (data.truncated
            ? `Showing first ${data.returned?.toLocaleString()} of ${data.totalStaged?.toLocaleString()} staged rows.`
            : null)
      );
    } catch (err: unknown) {
      if (requestId !== stagedRequestIdRef.current) return;
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e.response?.data?.message || e.message || 'Failed to load staged rows');
      setStagedRows([]);
    } finally {
      if (requestId === stagedRequestIdRef.current) setIsLoadingStaged(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== 'view') return;
    if (stagedCount === null) return;
    if (stagedCount === 0) {
      stagedRequestIdRef.current++;
      setStagedRows([]);
      setListWarning(null);
      setIsLoadingStaged(false);
      return;
    }
    void loadStagedRows();
  }, [activeTab, stagedCount, loadStagedRows]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex space-x-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/50">
        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          className={`flex-1 rounded-lg py-2.5 text-sm font-medium leading-5 transition-all ${
            activeTab === 'upload'
              ? 'bg-white text-blue-700 shadow dark:bg-slate-700 dark:text-blue-400'
              : 'text-slate-600 hover:bg-white/12 dark:text-slate-400'
          }`}
        >
          1. Upload &amp; stage (temp table)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('view')}
          className={`flex-1 rounded-lg py-2.5 text-sm font-medium leading-5 transition-all ${
            activeTab === 'view'
              ? 'bg-white text-blue-700 shadow dark:bg-slate-700 dark:text-blue-400'
              : 'text-slate-600 hover:bg-white/12 dark:text-slate-400'
          }`}
        >
          2. View staged rows
        </button>
      </div>

      <Card>
        {activeTab === 'upload' ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 dark:border-blue-900/30 dark:bg-blue-900/10">
              <h4 className="mb-2 font-semibold text-blue-900 dark:text-blue-100">Instructions</h4>
              <p className="text-sm text-blue-800 mb-3 dark:text-blue-200">
                Rows are stored only in the database temp table <strong>lead_location_staging</strong>. Nothing in{' '}
                <strong>leads</strong> is changed by this step.
              </p>
              <ul className="list-inside list-disc space-y-1 text-sm text-blue-800 dark:text-blue-200">
                <li>
                  <strong>Enquiry Number</strong> (e.g. Enquiry Number, ENQ…)
                </li>
                <li>
                  <strong>Name</strong> (e.g. Name, STU_NAME)
                </li>
                <li>
                  <strong>village</strong> (e.g. Village, Village Name…)
                </li>
                <li>
                  <strong>mandal</strong> (e.g. Mandal, Mandal Name…)
                </li>
                <li>
                  <strong>street</strong> (e.g. Street, Address, Street Name…)
                </li>
              </ul>
              <p className="mt-3 text-xs text-blue-700 dark:text-blue-300">
                SQL to create the table (if it does not exist) is in <code className="rounded bg-blue-100/80 px-1">backend-admission/src/config-sql/schema.sql</code>{' '}
                — section <code className="rounded bg-blue-100/80 px-1">lead_location_staging</code>.
              </p>
            </div>

            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />

            <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-12 dark:border-slate-800 dark:bg-slate-900/50">
              {file ? (
                <div className="text-center">
                  <p className="text-lg font-medium text-slate-900 dark:text-slate-100">{file.name}</p>
                  <p className="text-sm text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="mt-4" disabled={isProcessing}>
                    Change file
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-lg font-medium text-slate-900 dark:text-slate-100">Select Excel workbook</p>
                  <Button variant="primary" size="lg" onClick={() => fileInputRef.current?.click()} className="mt-6">
                    Choose file
                  </Button>
                </div>
              )}
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400">
                {error}
              </div>
            )}

            {result && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900/30 dark:bg-emerald-900/10">
                <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  {(result.stagedInTempTable ?? result.totalInExcel ?? 0).toLocaleString()}
                </div>
                <div className="text-sm font-medium text-emerald-900 dark:text-emerald-100">Rows staged</div>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setActiveTab('view')}>
                  View staged rows
                </Button>
              </div>
            )}

            <Button variant="primary" size="lg" onClick={handleStageUpload} isLoading={isProcessing} disabled={!file || isProcessing} className="w-full py-6">
              Upload &amp; stage in temp table
            </Button>
          </div>
        ) : (
          <div className="space-y-6 pb-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 dark:bg-slate-800/30">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                This list is a direct read from <strong>lead_location_staging</strong> (Excel columns only).{' '}
                <strong>leads</strong> is not queried — loading should be quick.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-4">
                <span className="text-2xl font-bold text-blue-600">{stagedCount !== null ? stagedCount.toLocaleString() : '…'}</span>
                <span className="text-sm text-slate-600 dark:text-slate-400">rows in temp table</span>
                <button
                  type="button"
                  onClick={fetchStagedCount}
                  className="text-sm text-blue-600 underline hover:text-blue-800 dark:text-blue-400"
                >
                  Refresh count
                </button>
              </div>
            </div>

            {listWarning && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
                {listWarning}
              </div>
            )}

            {error && activeTab === 'view' && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => void loadStagedRows()}
                isLoading={isLoadingStaged}
                disabled={isLoadingStaged || (stagedCount || 0) === 0}
              >
                Refresh list
              </Button>
              {stagedRows.length > 0 && !isLoadingStaged && (
                <span className="text-sm text-slate-500">
                  Showing {stagedRows.length.toLocaleString()} row{stagedRows.length === 1 ? '' : 's'}
                </span>
              )}
            </div>

            {isLoadingStaged && <p className="text-center text-sm text-slate-500 py-8">Loading staged rows…</p>}

            {stagedRows.length > 0 && !isLoadingStaged && (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700 max-h-[70vh] overflow-y-auto">
                <table className="min-w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10">
                    <tr>
                      <th className="px-2 py-2 font-semibold">#</th>
                      <th className="px-2 py-2 font-semibold">Enquiry number</th>
                      <th className="px-2 py-2 font-semibold">Name</th>
                      <th className="px-2 py-2 font-semibold">Village</th>
                      <th className="px-2 py-2 font-semibold">Mandal</th>
                      <th className="px-2 py-2 font-semibold">Street</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stagedRows.map((r, i) => (
                      <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                        <td className="px-2 py-2 font-mono">{r.enquiryNumber}</td>
                        <td className="px-2 py-2">{r.name}</td>
                        <td className="px-2 py-2">{r.village ?? '—'}</td>
                        <td className="px-2 py-2">{r.mandal ?? '—'}</td>
                        <td className="px-2 py-2">{r.street ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {stagedRows.length === 0 && !isLoadingStaged && (stagedCount || 0) > 0 && !error && (
              <p className="text-center text-sm text-slate-500">No rows returned. Try Refresh list.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
