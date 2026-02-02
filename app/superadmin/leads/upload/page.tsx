'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { auth } from '@/lib/auth';
import { leadAPI, formBuilderAPI } from '@/lib/api';
import {
  LeadUploadData,
  BulkUploadResponse,
  BulkUploadInspectResponse,
  BulkUploadJobResponse,
  ImportJobStatusResponse,
} from '@/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useDashboardHeader } from '@/components/layout/DashboardShell';

export default function BulkUploadPage() {
  const router = useRouter();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadResult, setUploadResult] = useState<BulkUploadResponse | null>(null);
  const [source, setSource] = useState('Bulk Upload');
  const [error, setError] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [sheetPreviews, setSheetPreviews] = useState<Record<string, LeadUploadData[]>>({});
  const [fileType, setFileType] = useState<'excel' | 'csv' | null>(null);
  const [uploadToken, setUploadToken] = useState<string | null>(null);
  const [analysisInfo, setAnalysisInfo] = useState<{ previewAvailable: boolean; previewDisabledReason?: string } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [jobInfo, setJobInfo] = useState<BulkUploadJobResponse | null>(null);
  const jobInfoRef = useRef<BulkUploadJobResponse | null>(null);
  const [jobStatus, setJobStatus] = useState<ImportJobStatusResponse | null>(null);
  const jobPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);

  // Form Builder: list forms for template selection
  const { data: formsData } = useQuery({
    queryKey: ['form-builder', 'forms'],
    queryFn: async () => {
      const response = await formBuilderAPI.listForms({ showInactive: false, includeFieldCount: true });
      return response;
    },
  });

  const forms = useMemo(() => {
    const payload = (formsData as any)?.data ?? formsData;
    if (!payload) return [] as any[];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray((payload as any).data)) return (payload as any).data;
    return [] as any[];
  }, [formsData]);

  // Selected form with fields (for template generation)
  const { data: formDataResponse } = useQuery({
    queryKey: ['form-builder', 'form', selectedFormId],
    queryFn: async () => {
      if (!selectedFormId) return null;
      const response = await formBuilderAPI.getForm(selectedFormId, {
        includeFields: true,
        showInactive: false,
      });
      return response;
    },
    enabled: !!selectedFormId,
  });

  const selectedForm = useMemo(() => {
    if (!formDataResponse) return null;
    const payload = (formDataResponse as any)?.data ?? formDataResponse;
    return payload ?? null;
  }, [formDataResponse]);

  const selectedFormFields = useMemo(() => {
    if (!selectedForm?.fields) return [] as any[];
    const fields = Array.isArray(selectedForm.fields) ? selectedForm.fields : [];
    return [...fields].sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }, [selectedForm]);

  // Auto-select default form on first load
  useEffect(() => {
    if (!selectedFormId && forms.length > 0) {
      const defaultForm = forms.find((f: any) => f.isDefault) ?? forms[0];
      if (defaultForm) {
        setSelectedFormId(defaultForm.id || defaultForm._id);
      }
    }
  }, [forms, selectedFormId]);

  const clearProgressInterval = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const clearProgressResetTimeout = () => {
    if (progressResetTimeoutRef.current) {
      clearTimeout(progressResetTimeoutRef.current);
      progressResetTimeoutRef.current = null;
    }
  };

  type PreviewRow = LeadUploadData & { __sheetName?: string };

  const toggleSheetSelection = (sheet: string) => {
    setSelectedSheets((prev) =>
      prev.includes(sheet) ? prev.filter((name) => name !== sheet) : [...prev, sheet]
    );
  };

  const selectAllSheets = () => {
    setSelectedSheets(sheetNames);
  };

  const clearAllSheets = () => {
    setSelectedSheets([]);
  };

  const previewRows = useMemo<PreviewRow[]>(() => {
    if (fileType === 'excel') {
      return selectedSheets.flatMap((sheet) =>
        (sheetPreviews[sheet] || []).map((row) => ({ ...row, __sheetName: sheet }))
      );
    }

    return Object.entries(sheetPreviews).flatMap(([sheet, rows]) =>
      rows.map((row) => ({ ...row, __sheetName: sheet }))
    );
  }, [fileType, selectedSheets, sheetPreviews]);

  const limitedPreviewRows = useMemo<PreviewRow[]>(() => previewRows.slice(0, 10), [previewRows]);

  // Dynamic preview columns: use actual column names from the sheet (not fixed name/phone/mandal/state)
  const previewColumns = useMemo(() => {
    if (limitedPreviewRows.length === 0) return [];
    const keys = new Set<string>();
    limitedPreviewRows.forEach((row) => {
      Object.keys(row).forEach((k) => {
        if (k !== '__sheetName') keys.add(k);
      });
    });
    // Use order from first row so columns match the sheet
    const first = limitedPreviewRows[0];
    return Object.keys(first).filter((k) => k !== '__sheetName');
  }, [limitedPreviewRows]);

  useEffect(() => {
    const currentUser = auth.getUser();
    if (!currentUser || (currentUser.roleName !== 'Super Admin' && currentUser.roleName !== 'Sub Super Admin')) {
      router.push('/auth/login');
      return;
    }
  }, [router]);

  const handleGoToLeads = useCallback(() => {
    router.push('/superadmin/leads');
  }, [router]);

  const handleGoToDashboard = useCallback(() => {
    router.push('/superadmin/dashboard');
  }, [router]);

  useEffect(() => {
    setHeaderContent(
      <div className="flex flex-col items-end gap-2 text-right">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Bulk Upload Leads</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Process Excel or CSV files and feed them into your pipeline
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleGoToDashboard}>
            Super Admin Overview
          </Button>
          <Button size="sm" variant="primary" onClick={handleGoToLeads}>
            View Leads
          </Button>
        </div>
      </div>
    );

    return () => clearHeaderContent();
  }, [setHeaderContent, clearHeaderContent, handleGoToDashboard, handleGoToLeads]);

  useEffect(() => {
    return () => {
      clearProgressInterval();
      clearProgressResetTimeout();
    };
  }, []);

  const stopJobPolling = useCallback(() => {
    if (jobPollingRef.current) {
      clearInterval(jobPollingRef.current);
      jobPollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isProcessing) {
      clearProgressResetTimeout();
      setUploadProgress((prev) => (prev > 5 ? prev : 5));
      clearProgressInterval();
      progressIntervalRef.current = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 92) {
            return prev;
          }
          const increment = Math.random() * 6 + 3;
          return Math.min(prev + increment, 92);
        });
      }, 500);
    } else {
      clearProgressInterval();
      setUploadProgress((prev) => {
        if (prev === 0) {
          return 0;
        }
        if (prev < 100) {
          return 100;
        }
        return prev;
      });
      clearProgressResetTimeout();
      progressResetTimeoutRef.current = setTimeout(() => {
        setUploadProgress(0);
      }, 800);
    }

    return () => {
      clearProgressInterval();
    };
  }, [isProcessing]);

  useEffect(() => {
    return () => {
      stopJobPolling();
    };
  }, [stopJobPolling]);

  const analyzeFile = async (selectedFile: File) => {
    setIsAnalyzing(true);
    setAnalysisInfo(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const analysis = (await leadAPI.inspectBulkUpload(formData)) as BulkUploadInspectResponse | undefined;

      if (!analysis) {
        throw new Error('No analysis data received');
      }

      setUploadToken(analysis.uploadToken);
      setFileType(analysis.fileType);
      setSheetNames(analysis.sheetNames || []);
      setSelectedSheets(analysis.sheetNames || []);
      setSheetPreviews(analysis.previewAvailable ? analysis.previews ?? {} : {});
      setAnalysisInfo({
        previewAvailable: analysis.previewAvailable,
        previewDisabledReason: analysis.previewDisabledReason,
      });
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Failed to analyze file. Please try again.';
      setError(message);
      setFile(null);
      setUploadToken(null);
      setSheetNames([]);
      setSelectedSheets([]);
      setSheetPreviews({});
      setFileType(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetJobState = useCallback(() => {
    stopJobPolling();
    setJobInfo(null);
    jobInfoRef.current = null;
    setJobStatus(null);
    setUploadResult(null);
    setIsProcessing(false);
    setUploadProgress(0);
  }, [stopJobPolling]);

  const fetchJobStatus = useCallback(
    async (jobId: string) => {
      try {
        const status = await leadAPI.getImportJobStatus(jobId);
        if (!status) {
          throw new Error('Failed to fetch import status. Please try again.');
        }
        
        // Log status for debugging
        console.log('[Upload] Job status received:', {
          jobId: status.jobId,
          status: status.status,
          stats: status.stats,
          hasStats: !!status.stats,
        });
        
        setJobStatus(status);

        if (status.status === 'completed' || status.status === 'failed') {
          stopJobPolling();
          setIsProcessing(false);
          setUploadProgress(100);

          const info = jobInfoRef.current;
          if (status.status === 'failed') {
            setError(status.message || 'Bulk upload failed. Please review the errors and try again.');
          }

          if (info) {
            const stats = status.stats || {};
            // Ensure we're using numbers, not strings
            const uploadResultData: BulkUploadResponse = {
              batchId: info.batchId,
              total: Number(stats.totalProcessed) || 0,
              success: Number(stats.totalSuccess) || 0,
              errors: Number(stats.totalErrors) || 0,
              durationMs: Number(stats.durationMs) || 0,
              sheetsProcessed: Array.isArray(stats.sheetsProcessed) ? stats.sheetsProcessed : [],
              errorDetails: Array.isArray(status.errorDetails) ? status.errorDetails : [],
              message: status.message || `Processed ${stats.totalProcessed || 0} row(s). ${stats.totalSuccess || 0} succeeded, ${stats.totalErrors || 0} failed`,
            };
            
            console.log('[Upload] Setting upload result:', uploadResultData);
            setUploadResult(uploadResultData);
          } else {
            console.warn('[Upload] No job info available when job completed');
          }
        }
      } catch (err: any) {
        console.error('Failed to fetch import job status', err);
        stopJobPolling();
        setIsProcessing(false);
        const message =
          err?.response?.data?.message ||
          err?.message ||
          'Failed to fetch import status. Please try again.';
        setError(message);
      }
    },
    [stopJobPolling],
  );

  const startJobPolling = useCallback(
    (jobId: string) => {
      stopJobPolling();
      fetchJobStatus(jobId);
      jobPollingRef.current = setInterval(() => {
        fetchJobStatus(jobId);
      }, 4000);
    },
    [fetchJobStatus, stopJobPolling],
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    resetJobState();
    setUploadResult(null);
    setSheetNames([]);
    setSelectedSheets([]);
    setSheetPreviews({});
    setUploadToken(null);
    setFileType(null);
    setAnalysisInfo(null);
    setFile(selectedFile);

    await analyzeFile(selectedFile);
  };

  const handleBulkUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    if (isAnalyzing) {
      setError('File analysis in progress. Please wait.');
      return;
    }

    if (fileType === 'excel' && selectedSheets.length === 0) {
      setError('Select at least one worksheet to include in the upload.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setUploadResult(null);

    if (jobInfoRef.current) {
      resetJobState();
      setIsProcessing(true);
    }

    try {
      const formData = new FormData();
      if (uploadToken) {
        formData.append('uploadToken', uploadToken);
      } else {
        formData.append('file', file);
      }
      formData.append('source', source || 'Bulk Upload');

      if (selectedFormId) {
        formData.append('formId', selectedFormId);
      }

      if (fileType === 'excel') {
        formData.append('selectedSheets', JSON.stringify(selectedSheets));
      }

      const response = await leadAPI.bulkUpload(formData);
      if (!response) {
        throw new Error('Upload response was empty');
      }
      
      // Backend queues the job and processes asynchronously
      // Response structure: { jobId, uploadId, batchId, status: 'queued' }
      if (response.jobId) {
        // Store job info and start polling
        const jobInfoData: BulkUploadJobResponse = {
          jobId: response.jobId,
          uploadId: response.uploadId || '',
          batchId: response.batchId || '',
          status: response.status || 'queued',
        };
        setJobInfo(jobInfoData);
        jobInfoRef.current = jobInfoData;
        startJobPolling(response.jobId);
      } else {
        // Fallback: if no jobId, treat as immediate response (legacy support)
        setIsProcessing(false);
        setUploadProgress(100);
        const uploadResultData: BulkUploadResponse = {
          batchId: response.batchId || '',
          total: response.total ?? 0,
          success: response.success ?? 0,
          errors: response.errors ?? 0,
          durationMs: response.durationMs,
          sheetsProcessed: response.sheetsProcessed ?? [],
          errorDetails: response.errorDetails ?? [],
          message: `Processed ${response.total ?? 0} row(s). ${response.success ?? 0} succeeded, ${response.errors ?? 0} failed`,
        };
        setUploadResult(uploadResultData);
      }
    } catch (err: any) {
      const message = err.response?.data?.message || err.message || 'Upload failed. Please try again.';
      setError(message);
      setIsProcessing(false);
      stopJobPolling();
      setJobInfo(null);
      jobInfoRef.current = null;
      setJobStatus(null);
    }
  };

  const downloadTemplate = (format: 'csv' | 'excel') => {
    // When a form is selected, use its fields for template; otherwise use static template
    const useFormTemplate = selectedFormId && selectedFormFields.length > 0;
    const headers = useFormTemplate
      ? selectedFormFields.map((f: any) => f.fieldName || f.field_name || '')
      : [
          'hallTicketNumber',
          'name',
          'phone',
          'email',
          'fatherName',
          'fatherPhone',
          'motherName',
          'gender',
          'village',
          'district',
          'courseInterested',
          'interCollege',
          'rank',
          'mandal',
          'state',
          'quota',
          'applicationStatus',
        ];

    const sampleRow: Record<string, string | number> = useFormTemplate
      ? {}
      : {
          hallTicketNumber: 'HT123456',
          name: 'John Doe',
          phone: '9876543210',
          email: 'john@example.com',
          fatherName: 'Father Name',
          fatherPhone: '9876543211',
          motherName: 'Mother Name',
          gender: 'Male',
          village: 'Village Name',
          district: 'District Name',
          courseInterested: 'Engineering',
          interCollege: 'ABC Junior College',
          rank: 125,
          mandal: 'Mandal Name',
          state: 'State Name',
          quota: 'Not Applicable',
          applicationStatus: 'Qualified',
        };

    if (useFormTemplate) {
      headers.forEach((h: string) => {
        if (h) sampleRow[h] = '';
      });
    }

    const templateData = [sampleRow];

    if (format === 'csv') {
      const csvContent = [
        headers.filter(Boolean).join(','),
        ...templateData.map((row) =>
          headers
            .filter(Boolean)
            .map((header) => {
              const value = row[header] ?? '';
              const str = typeof value === 'number' ? String(value) : String(value ?? '');
              if (str.includes(',') || str.includes('"')) {
                return `"${str.replace(/"/g, '""')}"`;
              }
              return str;
            })
            .join(',')
        ),
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'lead_template.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const worksheet = XLSX.utils.json_to_sheet(templateData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
      XLSX.writeFile(workbook, 'lead_template.xlsx');
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Upload File</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadTemplate('csv')} className="group">
              <span className="inline-block transition-transform group-hover:scale-105">Download CSV Template</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadTemplate('excel')} className="group">
              <span className="inline-block transition-transform group-hover:scale-105">Download Excel Template</span>
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
              Form Template
            </label>
            <select
              value={selectedFormId || ''}
              onChange={(e) => setSelectedFormId(e.target.value || null)}
              className="w-full rounded-xl border-2 border-gray-200 bg-white/80 px-4 py-3 text-sm font-medium text-slate-600 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
            >
              <option value="">Select a form (or use default columns)</option>
              {forms.map((form: any) => (
                <option key={form.id || form._id} value={form.id || form._id}>
                  {form.name}
                  {form.isDefault ? ' (Default)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              Templates and upload columns are based on the selected form. Select the same form used for individual leads for consistent mapping.
            </p>
          </div>

          <Input
            label="Source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g., Website, Campaign, Walk-in"
          />

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Select File (Excel or CSV)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="flex gap-4">
              <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                Choose File
              </Button>
              {file && (
                <span className="flex items-center text-sm text-gray-600">
                  {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              )}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border-2 border-red-200 bg-gradient-to-r from-red-50 to-red-100/50 p-4 shadow-sm">
              <p className="text-sm font-medium text-red-700">{error}</p>
            </div>
          )}

          {isAnalyzing && (
            <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-600">
              <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500"></span>
              <span>Analyzing workbook… please wait.</span>
            </div>
          )}

          {analysisInfo?.previewAvailable === false && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              {analysisInfo.previewDisabledReason ||
                'Preview disabled for this file. Data will still be processed on upload.'}
            </div>
          )}

          {fileType === 'excel' && sheetNames.length > 0 && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-white/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Worksheets detected ({sheetNames.length})</p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={selectAllSheets}
                disabled={sheetNames.length === 0 || isAnalyzing || isProcessing}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearAllSheets}
                    disabled={selectedSheets.length === 0 || isAnalyzing || isProcessing}
                  >
                    Clear All
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {sheetNames.map((sheet) => (
                  <label
                    key={sheet}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      selectedSheets.includes(sheet)
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-300 bg-white text-gray-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selectedSheets.includes(sheet)}
                      onChange={() => toggleSheetSelection(sheet)}
                      disabled={isAnalyzing || isProcessing}
                    />
                    <span>{sheet}</span>
                  </label>
                ))}
              </div>
              {selectedSheets.length === 0 && !isAnalyzing && (
                <p className="mt-2 text-xs text-red-600">Select at least one worksheet to include in the upload.</p>
              )}
              <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
                Only select worksheets that contain <strong>student records</strong> (e.g. Student Name, Phone, Father Name, Village, Mandal, District). Summary/count/dropdown sheets (e.g. &quot;School Wise Data Count&quot;, &quot;Mandalwise data count&quot;) have no student columns and will be skipped.
              </p>
            </div>
          )}

          {analysisInfo?.previewAvailable !== false && limitedPreviewRows.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-gray-600">Preview (first 10 rows):</p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100/50">
                    <tr>
                      <th className="sticky left-0 z-10 min-w-[120px] bg-gray-50 px-4 py-2 text-left text-xs font-semibold text-gray-700">Worksheet</th>
                      {previewColumns.map((col) => (
                        <th key={col} className="px-4 py-2 text-left text-xs font-semibold text-gray-700 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white/50">
                    {limitedPreviewRows.map((row: PreviewRow, index) => (
                      <tr key={index} className="hover:bg-blue-50/50">
                        <td className="sticky left-0 z-10 min-w-[120px] bg-white/80 px-4 py-2 text-sm text-gray-500">
                          {row.__sheetName || (fileType === 'excel' ? '-' : 'CSV')}
                        </td>
                        {previewColumns.map((col) => (
                          <td key={col} className="max-w-[200px] truncate px-4 py-2 text-sm text-gray-900" title={row[col] != null ? String(row[col]) : ''}>
                            {row[col] != null && String(row[col]).trim() !== '' ? String(row[col]) : '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500">
                Note: Enquiry numbers will be auto-generated. Rows with the same phone as an existing lead are skipped as duplicates.
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Every row must have: <strong>Student Name</strong> and <strong>at least one phone</strong> (Phone 1 or Phone 2). Other columns (Father Name, Village, Mandal, District, etc.) are optional and will use defaults if empty.
              </p>
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            onClick={handleBulkUpload}
            isLoading={isProcessing}
            disabled={!file || isAnalyzing || (fileType === 'excel' && selectedSheets.length === 0) || isProcessing}
            className="w-full"
          >
            {isProcessing
              ? jobStatus?.message ||
                (jobStatus?.status === 'queued'
                  ? 'Queued… preparing to import'
                  : jobStatus?.status === 'processing'
                    ? `Processing… ${Math.min(100, Math.max(5, Math.round(uploadProgress)))}%`
                    : 'Processing upload…')
              : `Upload ${file ? file.name : 'File'}`}
          </Button>

          {(isProcessing || uploadProgress > 0) && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {isProcessing
                    ? jobStatus?.message || 'Processing file…'
                    : 'Finalizing results…'}
                </span>
                <span>{Math.min(100, Math.max(1, Math.round(uploadProgress)))}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200/80">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.round(uploadProgress))}%` }}
                />
              </div>
            </div>
          )}

          {jobInfo && (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700">
              <div className="flex flex-col gap-1">
                <p className="font-medium">
                  Current Status:{' '}
                  <span className="font-semibold capitalize text-slate-900">
                    {jobStatus?.status || jobInfo.status}
                  </span>
                </p>
                {jobStatus?.message && <p>{jobStatus.message}</p>}
                {jobStatus?.stats && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-white p-3 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Processed</p>
                      <p className="text-lg font-semibold text-slate-900">
                        {jobStatus.stats.totalProcessed ?? 0}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-3 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Success</p>
                      <p className="text-lg font-semibold text-emerald-600">
                        {jobStatus.stats.totalSuccess ?? 0}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-3 shadow-sm">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Errors</p>
                      <p className="text-lg font-semibold text-rose-600">
                        {jobStatus.stats.totalErrors ?? 0}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      {uploadResult && (
        <Card>
          <h3 className="mb-4 text-lg font-semibold">Upload Results</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg bg-blue-50 p-4">
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-2xl font-bold text-blue-600">{uploadResult.total ?? 0}</p>
              </div>
              <div className="rounded-lg bg-green-50 p-4">
                <p className="text-sm text-gray-600">Success</p>
                <p className="text-2xl font-bold text-green-600">{uploadResult.success ?? 0}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-4">
                <p className="text-sm text-gray-600">Errors</p>
                <p className="text-2xl font-bold text-red-600">{uploadResult.errors ?? 0}</p>
              </div>
            </div>

            {typeof uploadResult.durationMs === 'number' && (
              <div className="rounded-lg bg-purple-50 p-4">
                <p className="text-sm text-gray-600">Processing Time</p>
                <p className="text-lg font-semibold text-purple-700">{(uploadResult.durationMs / 1000).toFixed(1)} s</p>
              </div>
            )}

            {uploadResult.sheetsProcessed && uploadResult.sheetsProcessed.length > 0 && (
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm text-gray-600">Worksheets processed</p>
                <p className="text-sm font-medium text-gray-900">{uploadResult.sheetsProcessed.join(', ')}</p>
              </div>
            )}

            {uploadResult.message && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
                {uploadResult.message}
              </div>
            )}

            {uploadResult.errorDetails && uploadResult.errorDetails.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">Error Details (first 200):</p>
                <p className="mb-2 text-xs text-gray-600">
                  Common reasons: <strong>Missing required</strong> (student name and at least one phone); or <strong>Duplicate phone number</strong> — lead with this phone already exists.
                </p>
                <div className="max-h-60 overflow-y-auto rounded-lg border">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Worksheet</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Row</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-700">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {uploadResult.errorDetails.map((error, index) => (
                        <tr key={index} className="hover:bg-red-50/40">
                          <td className="px-4 py-2 text-sm text-gray-600">{error.sheet || '-'}</td>
                          <td className="px-4 py-2 text-sm text-gray-900">{error.row ?? '-'}</td>
                          <td className="px-4 py-2 text-sm text-red-600">{error.error}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Button variant="primary" onClick={handleGoToLeads}>
              View All Leads
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

