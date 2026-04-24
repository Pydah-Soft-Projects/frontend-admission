'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { communicationAPI, leadAPI } from '@/lib/api';
import { Lead, MessageTemplate, MessageTemplateVariable } from '@/types';
import { useModulePermission, TemplateIcon, UserIcon } from '@/components/layout/DashboardShell';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { showToast } from '@/lib/toast';

const VAR_REGEX = /\{#var#\}/gi;

type TemplateFormState = {
  name: string;
  dltTemplateId: string;
  language: string;
  content: string;
  description: string;
  isUnicode: boolean;
  variables: MessageTemplateVariable[];
};

const DEFAULT_FORM_STATE: TemplateFormState = {
  name: '',
  dltTemplateId: '',
  language: 'en',
  content: '',
  description: '',
  isUnicode: false,
  variables: [],
};

const SUPPORTED_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'te', label: 'Telugu' },
  { value: 'hi', label: 'Hindi' },
];

const ensureVariableArray = (content: string, existing?: MessageTemplateVariable[]) => {
  const matches = content.match(VAR_REGEX);
  const count = matches ? matches.length : 0;

  if (count === 0) {
    return [];
  }

  const normalized: MessageTemplateVariable[] = [];

  for (let index = 0; index < count; index += 1) {
    const fallbackKey = `var${index + 1}`;
    const existingVar = existing?.[index];
    normalized.push({
      key: existingVar?.key || fallbackKey,
      label: existingVar?.label || `Variable ${index + 1}`,
      defaultValue: existingVar?.defaultValue || '',
      isGlobal: existingVar?.isGlobal === true,
    });
  }

  return normalized;
};

const TemplateModal = ({
  mode,
  onClose,
  onSubmit,
  initialData,
  isProcessing,
}: {
  mode: 'create' | 'edit';
  onClose: () => void;
  onSubmit: (state: TemplateFormState) => void;
  initialData?: MessageTemplate;
  isProcessing: boolean;
}) => {
  const [isEditMode, setIsEditMode] = useState(mode === 'create');
  const [formState, setFormState] = useState<TemplateFormState>(() => {
    if (initialData) {
      return {
        name: initialData.name,
        dltTemplateId: initialData.dltTemplateId,
        language: initialData.language || 'en',
        content: initialData.content,
        description: initialData.description || '',
        isUnicode: Boolean(initialData.isUnicode || initialData.language !== 'en'),
        variables: ensureVariableArray(initialData.content, initialData.variables),
      };
    }
    return {
      ...DEFAULT_FORM_STATE,
      variables: ensureVariableArray('', []),
    };
  });

  const variableCount = useMemo(() => {
    const matches = formState.content.match(VAR_REGEX);
    return matches ? matches.length : 0;
  }, [formState.content]);

  useEffect(() => {
    setFormState((prev) => ({
      ...prev,
      variables: ensureVariableArray(prev.content, prev.variables),
    }));
    // Only adjust when content changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formState.content]);

  const handleVariableField = (index: number, patch: Partial<MessageTemplateVariable>) => {
    setFormState((prev) => {
      const nextVariables = [...prev.variables];
      nextVariables[index] = { ...nextVariables[index], ...patch };
      return { ...prev, variables: nextVariables };
    });
  };

  const handleSubmit = () => {
    if (!formState.name.trim()) {
      showToast.error('Template name is required');
      return;
    }
    if (!formState.dltTemplateId.trim()) {
      showToast.error('DLT Template ID is required');
      return;
    }
    if (!formState.content.trim()) {
      showToast.error('Template content is required');
      return;
    }

    onSubmit({
      ...formState,
      language: formState.language || 'en',
      variables: ensureVariableArray(formState.content, formState.variables),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-semibold">
              {!isEditMode ? 'View Template' : mode === 'create' ? 'Create Template' : 'Edit Template'}
            </h2>
            <p className="text-sm text-gray-500">
              {!isEditMode 
                ? 'Review template details and placeholders.' 
                : 'Configure template details and map placeholders to friendly labels.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close Modal"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
            <Input
              value={formState.name}
              onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Counselling started for Degree"
              disabled={!isEditMode}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">DLT Template ID</label>
            <Input
              value={formState.dltTemplateId}
              onChange={(e) =>
                setFormState((prev) => ({ ...prev, dltTemplateId: e.target.value }))
              }
              placeholder="1607100000000129152"
              disabled={!isEditMode}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
              value={formState.language}
              onChange={(e) => {
                const language = e.target.value;
                setFormState((prev) => ({
                  ...prev,
                  language,
                  isUnicode: language !== 'en' ? true : prev.isUnicode,
                }));
              }}
              disabled={!isEditMode}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 mt-6 md:mt-8">
            <input
              id="unicode-toggle"
              type="checkbox"
              checked={formState.isUnicode}
              onChange={(e) =>
                setFormState((prev) => ({ ...prev, isUnicode: e.target.checked }))
              }
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              disabled={!isEditMode}
            />
            <label htmlFor="unicode-toggle" className="text-sm text-gray-700">
              Unicode (non-English) message
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <Input
            value={formState.description}
            onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Short summary for internal reference"
            disabled={!isEditMode}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Template Content
          </label>
          <textarea
            className="w-full min-h-[150px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
            value={formState.content}
            onChange={(e) =>
              setFormState((prev) => ({
                ...prev,
                content: e.target.value,
              }))
            }
            placeholder="Use {#var#} for placeholder values"
            disabled={!isEditMode}
          />
          <p className="text-xs text-gray-500 mt-1">
            Detected placeholders: <span className="font-semibold">{variableCount}</span>
          </p>
        </div>

        {variableCount > 0 && (
          <div>
            <h3 className="text-lg font-semibold mb-2">Placeholder Mapping</h3>
            <p className="mb-3 text-xs text-gray-500 dark:text-slate-400">
              Mark <strong className="font-medium">Global</strong> when one value is used for every recipient in bulk
              sends; leave off to edit that placeholder per lead in the review step.
            </p>
            <div className="space-y-4">
              {formState.variables.map((variable, index) => (
                <div
                  key={variable.key || `var-${index}`}
                  className="grid grid-cols-1 gap-3 border-b border-gray-100 pb-3 last:border-0 dark:border-slate-800 md:grid-cols-12 md:items-end"
                >
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-600">Placeholder key</label>
                    <Input
                      value={variable.key}
                      onChange={(e) => handleVariableField(index, { key: e.target.value })}
                      placeholder={`var${index + 1}`}
                      disabled={!isEditMode}
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="mb-1 block text-xs font-medium text-gray-600">Friendly label</label>
                    <Input
                      value={variable.label}
                      onChange={(e) => handleVariableField(index, { label: e.target.value })}
                      placeholder={`Variable ${index + 1}`}
                      disabled={!isEditMode}
                    />
                  </div>
                  <div className="md:col-span-4">
                    <label className="mb-1 block text-xs font-medium text-gray-600">Default value</label>
                    <Input
                      value={variable.defaultValue || ''}
                      onChange={(e) => handleVariableField(index, { defaultValue: e.target.value })}
                      placeholder="Pre-filled when sending (optional)"
                      disabled={!isEditMode}
                    />
                  </div>
                  <div className="flex items-center gap-2 md:col-span-3">
                    <input
                      id={`var-global-${index}`}
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                      checked={variable.isGlobal === true}
                      onChange={(e) => handleVariableField(index, { isGlobal: e.target.checked })}
                      disabled={!isEditMode}
                    />
                    <label htmlFor={`var-global-${index}`} className="text-sm text-gray-700 dark:text-slate-300">
                      Global (same for all)
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isProcessing}>
            {isEditMode ? 'Cancel' : 'Close'}
          </Button>
          {!isEditMode ? (
            <Button variant="primary" onClick={() => setIsEditMode(true)}>
              Edit Template
            </Button>
          ) : (
            <Button variant="primary" onClick={handleSubmit} disabled={isProcessing}>
              {isProcessing ? 'Saving…' : mode === 'create' ? 'Create Template' : 'Save Changes'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};

const TemplatesSkeleton = () => (
  <div className="space-y-3">
    {Array.from({ length: 4 }).map((_, index) => (
      <Skeleton key={`template-skel-${index}`} className="w-full h-14" />
    ))}
  </div>
);

function hydrateTemplateContent(content: string, variables: { key: string; value: string }[]): string {
  if (!content) return '';
  let index = 0;
  return content.replace(VAR_REGEX, () => {
    const val = variables[index]?.value || '[Variable]';
    index++;
    return val;
  });
}

function MessagePreviewCard({ 
  template, 
  lead,
  isBulk = false
}: { 
  template?: MessageTemplate; 
  lead?: Lead;
  isBulk?: boolean;
}) {
  if (!template) {
    return (
      <Card className="p-6 border-dashed border-2 flex flex-col items-center justify-center text-slate-400 min-h-[160px]">
        <TemplateIcon className="h-8 w-8 mb-2 opacity-20" />
        <p className="text-sm">Select a template to see preview</p>
      </Card>
    );
  }

  const variables = lead && template ? buildSmsVariablesFromTemplate(template) : [];
  const preview = hydrateTemplateContent(template.content, variables);

  return (
    <Card className="overflow-hidden border-blue-100 dark:border-blue-900 shadow-md">
      <div className="bg-blue-50 dark:bg-blue-900/30 px-4 py-2 border-b border-blue-100 dark:border-blue-900 flex justify-between items-center">
        <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wider">
          {isBulk ? 'Sample Preview (First Lead)' : 'Message Preview'}
        </span>
        <span className="text-[10px] bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-200 px-2 py-0.5 rounded-full">
          {template.language?.toUpperCase() || 'EN'}
        </span>
      </div>
      <div className="p-4 bg-white dark:bg-slate-950">
        {lead && (
          <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
            <UserIcon className="h-3 w-3" />
            <span>To: <span className="font-medium text-slate-700 dark:text-slate-200">{lead.name}</span> ({lead.phone})</span>
          </div>
        )}
        <div className="relative p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm text-slate-800 dark:text-slate-200 font-sans leading-relaxed border border-slate-100 dark:border-slate-800 whitespace-pre-wrap italic">
           &quot;{preview || 'No content'}&quot;
           <div className="absolute -left-1 top-4 w-2 h-2 bg-slate-50 dark:bg-slate-900 border-l border-b border-slate-100 dark:border-slate-800 rotate-45 transform -translate-x-1/2"></div>
        </div>
        <div className="mt-3 flex justify-between items-center">
           <span className="text-[10px] text-slate-400">DLT ID: {template.dltTemplateId || '—'}</span>
           <span className="text-[10px] text-slate-400">{preview.length} chars</span>
        </div>
      </div>
    </Card>
  );
}

const MAX_BULK_LEADS = 80;

/** Initial SMS variable values from template only (no auto lead name). */
function buildSmsVariablesFromTemplate(template: MessageTemplate): { key: string; value: string }[] {
  const vars = template.variables && template.variables.length > 0 ? template.variables : [];
  if (vars.length === 0) {
    const n = template.variableCount || 0;
    return Array.from({ length: n }).map((_, index) => ({
      key: `var${index + 1}`,
      value: '',
    }));
  }
  return vars.map((variable, index) => ({
    key: variable.key || `var${index + 1}`,
    value: (variable.defaultValue || '').trim(),
  }));
}

/** Parallel SMS sends — avoids overloading the API while still faster than strictly sequential. */
const SMS_SEND_CONCURRENCY = 4;

type SmsReviewRow = {
  leadId: string;
  leadName: string;
  phoneDisplay: string;
  numbers: string[];
  variables: { key: string; value: string }[];
};

function buildRecipientNumbersForLead(lead: Lead, sendPrimary: boolean, sendFather: boolean): string[] {
  const numbers: string[] = [];
  if (sendPrimary && lead.phone) numbers.push(lead.phone);
  if (sendFather && lead.fatherPhone) numbers.push(lead.fatherPhone);
  return [...new Set(numbers.map((n) => String(n).trim()).filter(Boolean))];
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const queue = [...items];
  const pump = async (): Promise<void> => {
    for (;;) {
      const next = queue.shift();
      if (next === undefined) return;
      await worker(next);
    }
  };
  const n = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: n }, () => pump()));
}

function BulkSmsReviewModal({
  open,
  onClose,
  template,
  initialRows,
  isPreparing,
  isSending,
  onConfirmSend,
  subtitle,
}: {
  open: boolean;
  onClose: () => void;
  template: MessageTemplate | null;
  initialRows: SmsReviewRow[];
  isPreparing?: boolean;
  isSending?: boolean;
  onConfirmSend: (rows: SmsReviewRow[]) => void | Promise<void>;
  subtitle?: string;
}) {
  const [draft, setDraft] = useState<SmsReviewRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setDraft(
      initialRows.map((r) => ({
        ...r,
        numbers: [...r.numbers],
        variables: r.variables.map((v) => ({ ...v })),
      }))
    );
  }, [open, initialRows]);

  const variableScopeList = useMemo(() => {
    if (template?.variables && template.variables.length > 0) {
      return template.variables.map((v, i) => ({
        index: i,
        key: v.key || `var${i + 1}`,
        label: v.label || v.key || `var${i + 1}`,
        isGlobal: Boolean(v.isGlobal),
      }));
    }
    const row0 = draft[0]?.variables ?? [];
    return row0.map((v, i) => ({
      index: i,
      key: v.key,
      label: v.key || `Variable ${i + 1}`,
      isGlobal: false,
    }));
  }, [template, draft]);

  const globalVars = useMemo(() => variableScopeList.filter((s) => s.isGlobal), [variableScopeList]);
  const perLeadVars = useMemo(() => variableScopeList.filter((s) => !s.isGlobal), [variableScopeList]);

  const updatePerLeadVariable = (leadIdx: number, varIdx: number, value: string) => {
    setDraft((prev) =>
      prev.map((row, i) => {
        if (i !== leadIdx) return row;
        return {
          ...row,
          variables: row.variables.map((v, j) => (j === varIdx ? { ...v, value } : v)),
        };
      })
    );
  };

  /** Template `isGlobal`: one value applied to every row. */
  const updateSharedVariable = (varIdx: number, value: string) => {
    setDraft((prev) =>
      prev.map((row) => ({
        ...row,
        variables: row.variables.map((v, j) => (j === varIdx ? { ...v, value } : v)),
      }))
    );
  };

  const samplePreview =
    template && draft.length > 0 ? hydrateTemplateContent(template.content, draft[0].variables) : '';

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-3 py-6 backdrop-blur-sm">
      <Card className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden shadow-xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Review & edit SMS</h2>
            {subtitle ? (
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
            ) : null}
            {template ? (
              <p className="mt-1 text-xs text-slate-500">
                Template: <span className="font-medium text-slate-700 dark:text-slate-300">{template.name}</span> · DLT{' '}
                {template.dltTemplateId || '—'}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            onClick={onClose}
            disabled={isSending}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {isPreparing ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10">
            <Skeleton className="h-10 w-48" />
            <p className="text-sm text-slate-500">Loading leads…</p>
          </div>
        ) : (
          <>
            <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/50">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Message preview (first lead)
              </p>
              <p className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm italic text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                {samplePreview || '—'}
              </p>
            </div>

            {globalVars.length > 0 ? (
              <div className="shrink-0 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Global placeholders (same value on every SMS)
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Marked “Global” on the template. Edit once; all recipients use this text.
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {globalVars.map((meta) => {
                    const val = draft[0]?.variables[meta.index]?.value ?? '';
                    return (
                      <label
                        key={meta.key}
                        className="flex min-w-0 flex-col gap-1 text-xs text-slate-600 dark:text-slate-400"
                      >
                        <span className="font-medium text-slate-700 dark:text-slate-300">{meta.label}</span>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => updateSharedVariable(meta.index, e.target.value)}
                          className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                          disabled={isSending}
                        />
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-700">
                  <thead className="sticky top-0 z-[1] bg-slate-100 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Lead</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">Numbers</th>
                      {perLeadVars.map((meta) => (
                        <th
                          key={meta.key}
                          className="min-w-[7rem] px-2 py-2 text-left font-semibold text-slate-700 dark:text-slate-200"
                        >
                          {meta.label}
                          <span className="mt-0.5 block font-normal normal-case text-[10px] text-slate-500">
                            Per recipient
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900/40">
                    {draft.map((row, leadIdx) => (
                      <tr key={row.leadId}>
                        <td className="max-w-[10rem] px-3 py-2 align-top">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{row.leadName}</div>
                        </td>
                        <td className="max-w-[9rem] px-3 py-2 align-top font-mono text-[11px] text-slate-600 dark:text-slate-400">
                          {row.phoneDisplay}
                        </td>
                        {perLeadVars.map((meta) => (
                          <td key={`${row.leadId}-${meta.key}`} className="px-2 py-1 align-top">
                            <input
                              type="text"
                              value={row.variables[meta.index]?.value ?? ''}
                              onChange={(e) => updatePerLeadVariable(leadIdx, meta.index, e.target.value)}
                              className="w-full min-w-[6rem] rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                              disabled={isSending}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/80">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {draft.length} SMS · up to {SMS_SEND_CONCURRENCY} sends at a time
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSending}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={isSending || draft.length === 0}
                  onClick={() => void onConfirmSend(draft)}
                >
                  {isSending ? 'Sending…' : `Send ${draft.length} SMS`}
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function TestTemplateSmsModal({
  open,
  template,
  onClose,
}: {
  open: boolean;
  template: MessageTemplate | null;
  onClose: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [varRows, setVarRows] = useState<{ key: string; value: string }[]>([]);

  useEffect(() => {
    if (!open || !template) return;
    setPhone('');
    setVarRows(buildSmsVariablesFromTemplate(template));
  }, [open, template]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!template) throw new Error('No template');
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 10) throw new Error('Enter a valid mobile number (at least 10 digits).');
      return communicationAPI.testTemplateSms(template._id, {
        phone: phone.trim(),
        variables: varRows,
      });
    },
    onSuccess: (data: { success?: boolean; responseText?: string }) => {
      if (data?.success) {
        showToast.success('Test SMS submitted. Check the handset for delivery.');
        onClose();
      } else {
        const hint =
          typeof data?.responseText === 'string' ? data.responseText.trim().slice(0, 240) : '';
        showToast.error(hint || 'SMS provider did not confirm success.');
      }
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      showToast.error(ax?.response?.data?.message || ax?.message || 'Failed to send test SMS');
    },
  });

  const updateVarRow = (index: number, value: string) => {
    setVarRows((prev) => prev.map((row, i) => (i === index ? { ...row, value } : row)));
  };

  const previewText = useMemo(
    () => (template ? hydrateTemplateContent(template.content, varRows) : ''),
    [template, varRows]
  );

  if (!open || !template) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
      <Card className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto p-6 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Test SMS</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{template.name}</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            onClick={onClose}
            disabled={mutation.isPending}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Sends this template with the values below to one number using the same SMS provider as live sends. No lead
          record and no communication history row are created.
        </p>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Mobile number</label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. 9876543210"
            className="mt-1"
            disabled={mutation.isPending}
          />
        </div>
        {varRows.length > 0 ? (
          <div className="max-h-44 space-y-2 overflow-y-auto">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Placeholder values</p>
            {varRows.map((row, i) => {
              const label = template.variables?.[i]?.label || row.key;
              return (
                <div key={`${row.key}-${i}`}>
                  <label className="text-xs text-slate-500 dark:text-slate-400">{label}</label>
                  <Input
                    value={row.value}
                    onChange={(e) => updateVarRow(i, e.target.value)}
                    className="mt-0.5"
                    disabled={mutation.isPending}
                  />
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 dark:border-slate-700 dark:bg-slate-900/60">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Message preview
            </p>
            <span className="text-[10px] text-slate-400 tabular-nums">{previewText.length} chars</span>
          </div>
          <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-100">
            {previewText ? (
              <span className="italic">&quot;{previewText}&quot;</span>
            ) : (
              <span className="text-slate-400">No template content.</span>
            )}
          </p>
          {previewText.includes('[Variable]') ? (
            <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
              <span className="font-medium">[Variable]</span> means a placeholder is still empty — fill it before
              sending.
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={mutation.isPending || !phone.trim()}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Sending…' : 'Send test'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

const broadcastFilterSelectClass =
  'h-9 min-w-0 max-w-full shrink rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 sm:max-w-[11rem]';

function SendToLeadsTab() {
  const { canWrite } = useModulePermission('communications');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;
  const [selectedById, setSelectedById] = useState<Record<string, Lead>>({});
  const [templateId, setTemplateId] = useState('');
  const [sendPrimary, setSendPrimary] = useState(true);
  const [sendFather, setSendFather] = useState(false);

  const [districtFilter, setDistrictFilter] = useState('');
  const [mandalFilter, setMandalFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [studentGroupFilter, setStudentGroupFilter] = useState('');
  const [leadStatusFilter, setLeadStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, districtFilter, mandalFilter, stateFilter, studentGroupFilter, leadStatusFilter, sourceFilter]);

  useEffect(() => {
    setMandalFilter('');
  }, [districtFilter]);

  const { data: broadcastFilterOptionsRes } = useQuery({
    queryKey: ['filterOptions', 'communications-send-leads', districtFilter],
    queryFn: async () => {
      const res = await leadAPI.getFilterOptions(
        districtFilter.trim() ? { district: districtFilter.trim() } : undefined
      );
      const payload = (res as { data?: Record<string, unknown> })?.data ?? res;
      return payload && typeof payload === 'object' ? payload : {};
    },
    staleTime: 120_000,
  });

  const broadcastDistricts = useMemo(() => {
    const raw = (broadcastFilterOptionsRes as { districts?: string[] })?.districts;
    return Array.isArray(raw) ? raw : [];
  }, [broadcastFilterOptionsRes]);
  const broadcastMandals = useMemo(() => {
    const raw = (broadcastFilterOptionsRes as { mandals?: string[] })?.mandals;
    return Array.isArray(raw) ? raw : [];
  }, [broadcastFilterOptionsRes]);
  const broadcastStates = useMemo(() => {
    const raw = (broadcastFilterOptionsRes as { states?: string[] })?.states;
    return Array.isArray(raw) ? raw : [];
  }, [broadcastFilterOptionsRes]);
  const broadcastStudentGroups = useMemo(() => {
    const raw = (broadcastFilterOptionsRes as { studentGroups?: string[] })?.studentGroups;
    if (Array.isArray(raw) && raw.length > 0) return raw;
    return ['10th', 'Inter', 'Inter-MPC', 'Inter-BIPC', 'Degree', 'Diploma'];
  }, [broadcastFilterOptionsRes]);
  const broadcastLeadStatuses = useMemo(() => {
    const raw = (broadcastFilterOptionsRes as { leadStatuses?: string[] })?.leadStatuses;
    return Array.isArray(raw) ? raw : [];
  }, [broadcastFilterOptionsRes]);
  const broadcastSources = useMemo(() => {
    const raw = (broadcastFilterOptionsRes as { sources?: string[] })?.sources;
    return Array.isArray(raw) ? raw : [];
  }, [broadcastFilterOptionsRes]);

  const { data: templatesData, isLoading: loadingTemplates } = useQuery({
    queryKey: ['activeTemplates', 'communications-broadcast'],
    queryFn: async () => {
      const response = await communicationAPI.getActiveTemplates();
      const payload = (response as { data?: MessageTemplate[] })?.data ?? response;
      return Array.isArray(payload) ? payload : [];
    },
  });
  const activeTemplates: MessageTemplate[] = Array.isArray(templatesData) ? templatesData : [];

  const selectedTemplate = useMemo(
    () => activeTemplates.find((t) => t._id === templateId),
    [activeTemplates, templateId]
  );

  const { data: leadsPayload, isLoading: loadingLeads } = useQuery({
    queryKey: [
      'broadcastLeads',
      page,
      limit,
      debouncedSearch,
      districtFilter,
      mandalFilter,
      stateFilter,
      studentGroupFilter,
      leadStatusFilter,
      sourceFilter,
    ],
    queryFn: async () => {
      const s = debouncedSearch.trim();
      return await leadAPI.getAll({
        page,
        limit,
        search: s.length >= 2 ? s : undefined,
        district: districtFilter.trim() || undefined,
        mandal: mandalFilter.trim() || undefined,
        state: stateFilter.trim() || undefined,
        studentGroup: studentGroupFilter.trim() || undefined,
        leadStatus: leadStatusFilter.trim() || undefined,
        source: sourceFilter.trim() || undefined,
      });
    },
  });

  const leads: Lead[] = leadsPayload?.leads ?? [];
  const pagination = leadsPayload?.pagination ?? {
    page: 1,
    limit,
    total: 0,
    pages: 1,
  };

  const selectedCount = Object.keys(selectedById).length;

  const leadHasRecipient = useCallback(
    (lead: Lead) =>
      Boolean(
        (sendPrimary && lead.phone && String(lead.phone).replace(/\D/g, '').length >= 10) ||
          (sendFather && lead.fatherPhone && String(lead.fatherPhone).replace(/\D/g, '').length >= 10)
      ),
    [sendFather, sendPrimary]
  );

  const toggleLead = useCallback((lead: Lead) => {
    if (!leadHasRecipient(lead)) {
      showToast.error('This lead has no phone for the selected recipient types.');
      return;
    }
    setSelectedById((prev) => {
      const next = { ...prev };
      if (next[lead._id]) {
        delete next[lead._id];
      } else {
        if (Object.keys(next).length >= MAX_BULK_LEADS) {
          showToast.error(`You can select at most ${MAX_BULK_LEADS} leads per batch.`);
          return prev;
        }
        next[lead._id] = lead;
      }
      return next;
    });
  }, [leadHasRecipient]);

  const selectEligibleOnPage = useCallback(() => {
    setSelectedById((prev) => {
      const next = { ...prev };
      let count = Object.keys(next).length;
      for (const l of leads) {
        if (!leadHasRecipient(l)) continue;
        if (next[l._id]) continue;
        if (count >= MAX_BULK_LEADS) {
          showToast.error(`Maximum ${MAX_BULK_LEADS} leads per batch.`);
          break;
        }
        next[l._id] = l;
        count += 1;
      }
      return next;
    });
  }, [leadHasRecipient, leads]);

  const clearSelection = useCallback(() => setSelectedById({}), []);

  const [smsReviewOpen, setSmsReviewOpen] = useState(false);
  const [smsReviewRows, setSmsReviewRows] = useState<SmsReviewRow[]>([]);

  const canSend =
    canWrite &&
    Boolean(templateId) &&
    selectedCount > 0 &&
    (sendPrimary || sendFather) &&
    Boolean(selectedTemplate);

  const openSmsReview = useCallback(() => {
    if (!canSend || !selectedTemplate) return;
    const list = Object.values(selectedById);
    const rows: SmsReviewRow[] = [];
    for (const lead of list) {
      const numbers = buildRecipientNumbersForLead(lead, sendPrimary, sendFather);
      if (numbers.length === 0) continue;
      rows.push({
        leadId: lead._id,
        leadName: (lead.name || '').trim() || 'Lead',
        phoneDisplay: numbers.join(', '),
        numbers,
        variables: buildSmsVariablesFromTemplate(selectedTemplate),
      });
    }
    if (rows.length === 0) {
      showToast.error('No eligible phone numbers for the selected recipient options.');
      return;
    }
    setSmsReviewRows(rows);
    setSmsReviewOpen(true);
  }, [canSend, selectedById, selectedTemplate, sendFather, sendPrimary]);

  const confirmSendMutation = useMutation({
    mutationFn: async (rows: SmsReviewRow[]) => {
      const tpl = selectedTemplate;
      if (!tpl) throw new Error('Select a message template.');
      let ok = 0;
      let fail = 0;
      await runWithConcurrency(rows, SMS_SEND_CONCURRENCY, async (row) => {
        try {
          await communicationAPI.sendSms(row.leadId, {
            contactNumbers: row.numbers,
            templates: [{ templateId: tpl._id, variables: row.variables }],
          });
          ok += 1;
        } catch {
          fail += 1;
        }
      });
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      if (fail === 0) {
        showToast.success(`SMS sent for ${ok} lead(s).`);
      } else {
        showToast.success(`Sent for ${ok} lead(s); ${fail} failed.`);
      }
      clearSelection();
      setSmsReviewOpen(false);
      setSmsReviewRows([]);
    },
    onError: (e: Error) => {
      showToast.error(e?.message || 'Failed to send');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:flex-wrap xl:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Message template
          </label>
          {loadingTemplates ? (
            <Skeleton className="h-10 w-full max-w-md" />
          ) : (
            <select
              className="w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">Select a template…</option>
              {activeTemplates.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name} ({(t.language || 'en').toUpperCase()})
                </option>
              ))}
            </select>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Variables default per lead; you can edit them in the review step before sending.
          </p>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 dark:border-slate-700 xl:border-0 xl:pt-0">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Recipients
          </span>
          <div className="flex flex-wrap gap-4 text-sm text-slate-700 dark:text-slate-300">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                checked={sendPrimary}
                onChange={(e) => setSendPrimary(e.target.checked)}
              />
              Student / primary mobile
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                checked={sendFather}
                onChange={(e) => setSendFather(e.target.checked)}
              />
              Father mobile
            </label>
          </div>
          {!sendPrimary && !sendFather && (
            <p className="text-sm text-amber-700 dark:text-amber-300">Select at least one recipient type.</p>
          )}
        </div>
        <div className="min-w-0 flex-1 basis-full xl:basis-[min(100%,28rem)]">
          <MessagePreviewCard
            template={selectedTemplate}
            lead={Object.values(selectedById)[0]}
            isBulk={selectedCount > 1}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 dark:border-slate-800 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Search leads</label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or enquiry number…"
              className="h-9 max-w-xl"
            />
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="secondary" size="sm" type="button" onClick={selectEligibleOnPage} disabled={loadingLeads}>
              Select eligible on page
            </Button>
            <Button variant="secondary" size="sm" type="button" onClick={clearSelection} disabled={selectedCount === 0}>
              Clear selection ({selectedCount})
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Filters
          </p>
          <div className="flex flex-wrap items-end gap-2 gap-y-3">
            <label className="flex min-w-[8rem] flex-col gap-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              State
              <select
                className={broadcastFilterSelectClass}
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
              >
                <option value="">All</option>
                {broadcastStates.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[8rem] flex-col gap-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              District
              <select
                className={broadcastFilterSelectClass}
                value={districtFilter}
                onChange={(e) => setDistrictFilter(e.target.value)}
              >
                <option value="">All</option>
                {broadcastDistricts.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[8rem] flex-col gap-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Mandal
              <select
                className={broadcastFilterSelectClass}
                value={mandalFilter}
                onChange={(e) => setMandalFilter(e.target.value)}
              >
                <option value="">All</option>
                {broadcastMandals.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[8rem] flex-col gap-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Student group
              <select
                className={broadcastFilterSelectClass}
                value={studentGroupFilter}
                onChange={(e) => setStudentGroupFilter(e.target.value)}
              >
                <option value="">All</option>
                {broadcastStudentGroups.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[9rem] flex-col gap-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Lead status
              <select
                className={broadcastFilterSelectClass}
                value={leadStatusFilter}
                onChange={(e) => setLeadStatusFilter(e.target.value)}
              >
                <option value="">All</option>
                {broadcastLeadStatuses.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[9rem] flex-col gap-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Source
              <select
                className={broadcastFilterSelectClass}
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
              >
                <option value="">All</option>
                {broadcastSources.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="outline"
              size="sm"
              type="button"
              className="shrink-0"
              onClick={() => {
                setDistrictFilter('');
                setMandalFilter('');
                setStateFilter('');
                setStudentGroupFilter('');
                setLeadStatusFilter('');
                setSourceFilter('');
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          {selectedCount} selected (max {MAX_BULK_LEADS} per batch). Showing page {pagination.page} of{' '}
          {pagination.pages} — {pagination.total} leads total.
        </p>

        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800 text-sm">
            <thead className="bg-gray-50 dark:bg-slate-900/60">
              <tr>
                <th className="w-10 px-3 py-2 text-left" />
                <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-slate-400">Lead</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-slate-400">Phone</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-slate-400">District</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-800 bg-white/60 dark:bg-slate-900/40">
              {loadingLeads ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6">
                    <TemplatesSkeleton />
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                    No leads match your filters or search.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const eligible = leadHasRecipient(lead);
                  const checked = Boolean(selectedById[lead._id]);
                  return (
                    <tr key={lead._id} className={!eligible ? 'opacity-50' : undefined}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          checked={checked}
                          disabled={!eligible}
                          onChange={() => toggleLead(lead)}
                          aria-label={`Select ${lead.name}`}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{lead.name}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300 font-mono text-xs">{lead.phone || '—'}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{lead.district || '—'}</td>
                      <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{lead.leadStatus || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination.pages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-500">
              Page {pagination.page} of {pagination.pages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                type="button"
                disabled={page <= 1 || loadingLeads}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                disabled={page >= pagination.pages || loadingLeads}
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          {!canWrite && (
            <p className="text-sm text-amber-700 dark:text-amber-300">You do not have permission to send SMS.</p>
          )}
          <Button
            variant="primary"
            type="button"
            className="sm:ml-auto"
            disabled={!canSend || confirmSendMutation.isPending}
            onClick={openSmsReview}
          >
            {confirmSendMutation.isPending ? 'Sending…' : `Send SMS to ${selectedCount} lead(s)`}
          </Button>
        </div>
      </div>

      <BulkSmsReviewModal
        open={smsReviewOpen}
        onClose={() => {
          if (confirmSendMutation.isPending) return;
          setSmsReviewOpen(false);
          setSmsReviewRows([]);
        }}
        template={selectedTemplate ?? null}
        initialRows={smsReviewRows}
        isSending={confirmSendMutation.isPending}
        onConfirmSend={(rows) => confirmSendMutation.mutate(rows)}
        subtitle={`Review template variables for each lead, then send (${smsReviewRows.length} SMS).`}
      />
    </div>
  );
}

function UserLeadsTab() {
  const { canWrite } = useModulePermission('communications');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [divisionFilter, setDivisionFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [studentGroupFilter, setStudentGroupFilter] = useState('');

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [sendPrimary, setSendPrimary] = useState(true);
  const [sendFather, setSendFather] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const { data: leadFilterOptionsRes } = useQuery({
    queryKey: ['filterOptions', 'communications-user-leads'],
    queryFn: async () => {
      const res = await leadAPI.getFilterOptions();
      const payload = (res as { data?: Record<string, unknown> })?.data ?? res;
      return payload && typeof payload === 'object' ? payload : {};
    },
    staleTime: 120_000,
  });

  const studentGroupFilterOptions = useMemo(() => {
    const raw = (leadFilterOptionsRes as { studentGroups?: string[] })?.studentGroups;
    if (Array.isArray(raw) && raw.length > 0) return raw;
    return ['10th', 'Inter', 'Inter-MPC', 'Inter-BIPC', 'Degree', 'Diploma'];
  }, [leadFilterOptionsRes]);

  const { data: analyticsData, isLoading: loadingUsers } = useQuery({
    queryKey: [
      'userAnalytics',
      'communications',
      'roster',
      divisionFilter,
      deptFilter,
      groupFilter,
      studentGroupFilter,
    ],
    queryFn: async () => {
      const resp = await leadAPI.getUserAnalytics({
        division: divisionFilter || undefined,
        department: deptFilter || undefined,
        group: groupFilter || undefined,
        studentGroup: studentGroupFilter || undefined,
        rosterOnly: true,
      });
      return resp?.users ?? [];
    },
  });

  const rosterSource: any[] = analyticsData ?? [];

  const users: any[] = useMemo(() => {
    let list = rosterSource;
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      list = list.filter(
        (u: any) =>
          u.userName?.toLowerCase().includes(s) ||
          u.name?.toLowerCase().includes(s) ||
          u.designation?.toLowerCase().includes(s) ||
          u.department?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [rosterSource, debouncedSearch]);

  /** Org filter option lists from full roster response (not client search subset). */
  const { divisionOptions, deptOptions, groupOptions } = useMemo(() => {
    const divs = new Set<string>();
    const depts = new Set<string>();
    const groups = new Set<string>();
    rosterSource.forEach((u: any) => {
      if (u.division && u.division !== '-') divs.add(u.division);
      if (u.department && u.department !== '-') depts.add(u.department);
      if (u.group && u.group !== '-') groups.add(u.group);
    });
    return {
      divisionOptions: Array.from(divs).sort(),
      deptOptions: Array.from(depts).sort(),
      groupOptions: Array.from(groups).sort(),
    };
  }, [rosterSource]);

  // Fetch a sample lead for preview when users are selected
  const { data: previewLead } = useQuery({
    queryKey: ['userLeadPreview', selectedUserIds[0]],
    queryFn: async () => {
      if (selectedUserIds.length === 0) return null;
      const resp = await leadAPI.getAll({ assignedTo: selectedUserIds[0], limit: 1 });
      return resp?.leads?.[0] || null;
    },
    enabled: selectedUserIds.length > 0,
  });

  const { data: templatesData, isLoading: loadingTemplates } = useQuery({
    queryKey: ['activeTemplates', 'communications-user-bulk'],
    queryFn: async () => {
      const response = await communicationAPI.getActiveTemplates();
      const payload = (response as { data?: MessageTemplate[] })?.data ?? response;
      return Array.isArray(payload) ? payload : [];
    },
  });
  const activeTemplates: MessageTemplate[] = Array.isArray(templatesData) ? templatesData : [];

  const selectedTemplate = useMemo(
    () => activeTemplates.find((t) => t._id === templateId),
    [activeTemplates, templateId]
  );

  const leadHasRecipient = useCallback(
    (lead: Lead) =>
      Boolean(
        (sendPrimary && lead.phone && String(lead.phone).replace(/\D/g, '').length >= 10) ||
          (sendFather && lead.fatherPhone && String(lead.fatherPhone).replace(/\D/g, '').length >= 10)
      ),
    [sendFather, sendPrimary]
  );

  const [smsReviewOpen, setSmsReviewOpen] = useState(false);
  const [smsReviewRows, setSmsReviewRows] = useState<SmsReviewRow[]>([]);
  const [isPreparingSmsReview, setIsPreparingSmsReview] = useState(false);
  const smsPrepareGenRef = useRef(0);

  const confirmSendMutation = useMutation({
    mutationFn: async (rows: SmsReviewRow[]) => {
      const tpl = selectedTemplate;
      if (!tpl) throw new Error('Select a template.');
      let ok = 0;
      let fail = 0;
      await runWithConcurrency(rows, SMS_SEND_CONCURRENCY, async (row) => {
        try {
          await communicationAPI.sendSms(row.leadId, {
            contactNumbers: row.numbers,
            templates: [{ templateId: tpl._id, variables: row.variables }],
          });
          ok += 1;
        } catch {
          fail += 1;
        }
      });
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      showToast.success(
        fail === 0 ? `SMS sent for ${ok} lead(s).` : `Sent for ${ok} lead(s); ${fail} failed.`
      );
      setSelectedUserIds([]);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setSmsReviewOpen(false);
      setSmsReviewRows([]);
    },
    onError: (e: Error) => showToast.error(e?.message || 'Failed to send'),
  });

  const canSend =
    canWrite &&
    Boolean(templateId) &&
    Boolean(selectedTemplate) &&
    selectedUserIds.length > 0 &&
    (sendPrimary || sendFather);

  const prepareAndOpenSmsReview = useCallback(async () => {
    if (!canSend || !selectedTemplate) return;
    const gen = ++smsPrepareGenRef.current;
    setSmsReviewOpen(true);
    setIsPreparingSmsReview(true);
    setSmsReviewRows([]);
    try {
      const allLeads: Lead[] = [];
      for (const uid of selectedUserIds) {
        const resp = await leadAPI.getAll({
          assignedTo: uid,
          limit: 500,
          ...(studentGroupFilter.trim() ? { studentGroup: studentGroupFilter.trim() } : {}),
        });
        if (resp?.leads) allLeads.push(...resp.leads);
      }
      if (gen !== smsPrepareGenRef.current) return;
      if (allLeads.length === 0) {
        showToast.error('No leads found for the selected users (check student group filter if applied).');
        setSmsReviewOpen(false);
        return;
      }
      const targetLeads = allLeads.filter(leadHasRecipient).slice(0, MAX_BULK_LEADS);
      const rows: SmsReviewRow[] = [];
      for (const lead of targetLeads) {
        const numbers = buildRecipientNumbersForLead(lead, sendPrimary, sendFather);
        if (numbers.length === 0) continue;
        rows.push({
          leadId: lead._id,
          leadName: (lead.name || '').trim() || 'Lead',
          phoneDisplay: numbers.join(', '),
          numbers,
          variables: buildSmsVariablesFromTemplate(selectedTemplate),
        });
      }
      if (gen !== smsPrepareGenRef.current) return;
      if (rows.length === 0) {
        showToast.error('No leads with phone numbers for the selected recipient options.');
        setSmsReviewOpen(false);
        return;
      }
      setSmsReviewRows(rows);
    } catch (e) {
      if (gen === smsPrepareGenRef.current) {
        showToast.error((e as Error)?.message || 'Failed to load leads');
        setSmsReviewOpen(false);
      }
    } finally {
      if (gen === smsPrepareGenRef.current) setIsPreparingSmsReview(false);
    }
  }, [
    canSend,
    leadHasRecipient,
    selectedTemplate,
    selectedUserIds,
    sendFather,
    sendPrimary,
    studentGroupFilter,
  ]);

  const closeSmsReview = useCallback(() => {
    if (confirmSendMutation.isPending) return;
    smsPrepareGenRef.current += 1;
    setIsPreparingSmsReview(false);
    setSmsReviewOpen(false);
    setSmsReviewRows([]);
  }, [confirmSendMutation.isPending]);

  const filterSelectClass =
    'min-h-[38px] min-w-0 max-w-[11rem] shrink rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 sm:max-w-[13rem]';

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap xl:items-end">
          <div className="flex flex-wrap items-end gap-2 gap-y-3">
            <label className="flex min-w-[8rem] flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
              Division
              <select
                className={filterSelectClass}
                value={divisionFilter}
                onChange={(e) => setDivisionFilter(e.target.value)}
              >
                <option value="">All</option>
                {divisionOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[8rem] flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
              Department
              <select
                className={filterSelectClass}
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="">All</option>
                {deptOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[8rem] flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
              Employee group
              <select
                className={filterSelectClass}
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
              >
                <option value="">All</option>
                {groupOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[8rem] flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
              Student group
              <select
                className={filterSelectClass}
                value={studentGroupFilter}
                onChange={(e) => setStudentGroupFilter(e.target.value)}
              >
                <option value="">All</option>
                {studentGroupFilterOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3 dark:border-slate-800 xl:border-0 xl:pt-0 xl:pl-4">
            <label className="flex min-w-[12rem] flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
              Template
              {loadingTemplates ? (
                <Skeleton className="h-[38px] w-full min-w-[12rem]" />
              ) : (
                <select
                  className={`${filterSelectClass} max-w-none sm:min-w-[14rem]`}
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  <option value="">Select template…</option>
                  {activeTemplates.map((t) => (
                    <option key={t._id} value={t._id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <div className="flex flex-wrap items-center gap-4 pb-1 text-sm text-slate-700 dark:text-slate-300">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                SMS to
              </span>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={sendPrimary} onChange={(e) => setSendPrimary(e.target.checked)} />
                Primary
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={sendFather} onChange={(e) => setSendFather(e.target.checked)} />
                Father
              </label>
            </div>
          </div>
        </div>
        <MessagePreviewCard
          template={selectedTemplate}
          lead={previewLead}
          isBulk={selectedUserIds.length > 0}
        />
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
        <div className="flex flex-col lg:flex-row gap-4 justify-between lg:items-end">
          <div className="flex-1 min-w-0">
            <label className="text-sm font-medium">Search Users</label>
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or designation..." />
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const allIds = users.map((u) => String(u.id ?? u.userId ?? '')).filter(Boolean);
                setSelectedUserIds((prev) => (prev.length === allIds.length ? [] : allIds));
              }}
            >
              {selectedUserIds.length === users.length ? 'Deselect All' : 'Select All'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setSelectedUserIds([])} disabled={selectedUserIds.length === 0}>
              Clear ({selectedUserIds.length})
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="min-w-full divide-y text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input 
                    type="checkbox" 
                    checked={users.length > 0 && selectedUserIds.length === users.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedUserIds(
                          users.map((u) => String(u.id ?? u.userId ?? '')).filter(Boolean)
                        );
                      } else setSelectedUserIds([]);
                    }}
                  />
                </th>
                <th className="w-12 px-3 py-2 text-left">S.No</th>
                <th className="px-3 py-2 text-left">User Name</th>
                <th className="max-w-[14rem] px-3 py-2 text-left">Student groups (leads)</th>
                <th className="px-3 py-2 text-left text-orange-600">Portfolio leads</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-white">
              {loadingUsers ? (
                <tr><td colSpan={5} className="p-4 text-center"><TemplatesSkeleton /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">No users found.</td></tr>
              ) : (
                users.map((u, idx) => {
                  const rowId = String(u.id ?? u.userId ?? '');
                  const isChecked = selectedUserIds.includes(rowId);
                  const groupsLabel =
                    typeof u.portfolioStudentGroups === 'string' && u.portfolioStudentGroups.trim()
                      ? u.portfolioStudentGroups.trim()
                      : '—';
                  return (
                    <tr key={rowId} className={isChecked ? 'bg-orange-50/30' : undefined}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setSelectedUserIds((prev) =>
                              prev.includes(rowId) ? prev.filter((id) => id !== rowId) : [...prev, rowId]
                            );
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">{idx + 1}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900">{u.name}</div>
                        <div className="text-xs text-slate-500 uppercase tracking-tight">
                          {u.designation || 'Staff'} • {u.department || 'General'}
                        </div>
                      </td>
                      <td className="max-w-[14rem] px-3 py-2 text-xs leading-snug text-slate-700 dark:text-slate-300">
                        <span className="break-words">{groupsLabel}</span>
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-orange-700">
                        {u.totalAssigned ?? 0}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end border-t border-slate-200 pt-4 dark:border-slate-800">
          <Button
            variant="primary"
            disabled={!canSend || isPreparingSmsReview || confirmSendMutation.isPending}
            onClick={() => void prepareAndOpenSmsReview()}
          >
            {isPreparingSmsReview
              ? 'Loading leads…'
              : confirmSendMutation.isPending
                ? 'Sending…'
                : `Send to leads of ${selectedUserIds.length} user(s)`}
          </Button>
        </div>
      </div>

      <BulkSmsReviewModal
        open={smsReviewOpen}
        onClose={closeSmsReview}
        template={selectedTemplate ?? null}
        initialRows={smsReviewRows}
        isPreparing={isPreparingSmsReview}
        isSending={confirmSendMutation.isPending}
        onConfirmSend={(rows) => confirmSendMutation.mutate(rows)}
        subtitle={`Edit variables per lead, then send (up to ${MAX_BULK_LEADS} SMS per batch).`}
      />
    </div>
  );
}

type CommunicationsTab = 'templates' | 'send' | 'user-leads';

export default function TemplatesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(auth.getUser());
  const [isMounted, setIsMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [languageFilter, setLanguageFilter] = useState<'all' | string>('all');
  const [showInactive, setShowInactive] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | undefined>();
  const [testSmsTemplate, setTestSmsTemplate] = useState<MessageTemplate | null>(null);
  const [activeTab, setActiveTab] = useState<CommunicationsTab>('templates');

  useEffect(() => {
    setIsMounted(true);
    const currentUser = auth.getUser();
    if (!currentUser) {
      router.push('/auth/login');
      return;
    }
    if (currentUser.roleName !== 'Super Admin' && currentUser.roleName !== 'Sub Super Admin') {
      router.push('/user/dashboard');
      return;
    }
    setUser(currentUser);
  }, [router]);

  const canDeactivateTemplates = user?.roleName === 'Super Admin';

  const {
    data: templatesResponse,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['communicationTemplates', languageFilter, showInactive, search],
    queryFn: async () => {
      const response = await communicationAPI.getTemplates({
        language: languageFilter === 'all' ? undefined : languageFilter,
        isActive: showInactive ? undefined : true,
        search: search.trim() || undefined,
      });
      return response?.data ?? [];
    },
    enabled: isMounted && Boolean(user),
  });

  const templates: MessageTemplate[] = Array.isArray(templatesResponse)
    ? templatesResponse
    : [];

  const createMutation = useMutation({
    mutationFn: (payload: TemplateFormState) =>
      communicationAPI.createTemplate({
        name: payload.name.trim(),
        dltTemplateId: payload.dltTemplateId.trim(),
        language: payload.language,
        content: payload.content,
        description: payload.description,
        isUnicode: payload.isUnicode,
        variables: payload.variables,
      }),
    onSuccess: () => {
      showToast.success('Template created successfully');
      queryClient.invalidateQueries({ queryKey: ['communicationTemplates'] });
      setModalMode(null);
      setEditingTemplate(undefined);
    },
    onError: (error: any) => {
      console.error('Error creating template:', error);
      showToast.error(error.response?.data?.message || 'Failed to create template');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: TemplateFormState }) =>
      communicationAPI.updateTemplate(id, {
        name: payload.name.trim(),
        dltTemplateId: payload.dltTemplateId.trim(),
        language: payload.language,
        content: payload.content,
        description: payload.description,
        isUnicode: payload.isUnicode,
        variables: payload.variables,
      }),
    onSuccess: () => {
      showToast.success('Template updated successfully');
      queryClient.invalidateQueries({ queryKey: ['communicationTemplates'] });
      setModalMode(null);
      setEditingTemplate(undefined);
    },
    onError: (error: any) => {
      console.error('Error updating template:', error);
      showToast.error(error.response?.data?.message || 'Failed to update template');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => communicationAPI.deleteTemplate(id),
    onSuccess: () => {
      showToast.success('Template deactivated');
      queryClient.invalidateQueries({ queryKey: ['communicationTemplates'] });
    },
    onError: (error: any) => {
      console.error('Error deleting template:', error);
      showToast.error(error.response?.data?.message || 'Failed to delete template');
    },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: (id: string) => communicationAPI.hardDeleteTemplate(id),
    onSuccess: () => {
      showToast.success('Template permanently deleted');
      queryClient.invalidateQueries({ queryKey: ['communicationTemplates'] });
    },
    onError: (error: any) => {
      console.error('Error hard deleting template:', error);
      showToast.error(error.response?.data?.message || 'Failed to permanently delete template');
    },
  });

  const handleAddTemplate = () => {
    setModalMode('create');
    setEditingTemplate(undefined);
  };

  const handleEditTemplate = (template: MessageTemplate) => {
    setEditingTemplate(template);
    setModalMode('edit');
  };

  const handleModalSubmit = (formData: TemplateFormState) => {
    if (modalMode === 'create') {
      createMutation.mutate(formData);
    } else if (modalMode === 'edit' && editingTemplate) {
      updateMutation.mutate({ id: editingTemplate._id, payload: formData });
    }
  };

  const activeCount = templates.filter((template) => template.isActive).length;

  return (
    <div className="w-full space-y-4">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">Communications</h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 sm:text-sm">
            SMS templates and bulk sends.
          </p>
        </div>
        <nav
          className="flex w-full shrink-0 flex-wrap justify-end gap-0.5 self-end rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-700 dark:bg-slate-800/80 sm:w-auto"
          aria-label="Communications sections"
        >
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
              activeTab === 'templates'
                ? 'bg-white text-[#c2410c] shadow-sm dark:bg-slate-900 dark:text-[#fb923c]'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Message templates
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('send')}
            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
              activeTab === 'send'
                ? 'bg-white text-[#c2410c] shadow-sm dark:bg-slate-900 dark:text-[#fb923c]'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Send to leads
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('user-leads')}
            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
              activeTab === 'user-leads'
                ? 'bg-white text-[#c2410c] shadow-sm dark:bg-slate-900 dark:text-[#fb923c]'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            User Specific Leads
          </button>
        </nav>
      </header>

      {activeTab === 'send' && (
        <SendToLeadsTab />
      )}

      {activeTab === 'user-leads' && (
        <UserLeadsTab />
      )}

      {activeTab === 'templates' ? (
        <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Message templates</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">DLT-approved templates for SMS.</p>
        </div>
        <Button variant="primary" size="sm" className="shrink-0 self-start sm:self-auto" onClick={handleAddTemplate}>
          + New template
        </Button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900/40">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
          <div className="min-w-0 flex-1 md:max-w-md lg:max-w-xl">
            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Search
            </label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or DLT ID"
              className="h-9 text-sm"
            />
          </div>
          <div className="w-full sm:w-36">
            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Language
            </label>
            <select
              className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
            >
              <option value="all">All languages</option>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-2 pb-0.5 text-xs text-slate-600 dark:text-slate-300 sm:pb-1">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
            />
            Show inactive
          </label>
          <div className="flex flex-1 items-center justify-end gap-2 border-t border-slate-100 pt-2 dark:border-slate-800 sm:border-0 sm:pt-0">
            <span className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{activeCount}</span> active
            </span>
            <Button variant="secondary" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? '…' : 'Refresh'}
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-900/70">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  DLT ID
                </th>
                <th className="hidden px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:table-cell dark:text-slate-400">
                  Lang
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Vars
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Status
                </th>
                <th className="hidden px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:table-cell dark:text-slate-400">
                  Updated
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-800 dark:bg-slate-900/30">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4">
                    <TemplatesSkeleton />
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-xs text-slate-500">
                    No templates found. Click &quot;New template&quot; to add one.
                  </td>
                </tr>
              ) : (
                templates.map((template) => (
                  <tr 
                    key={template._id} 
                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    onClick={() => handleEditTemplate(template)}
                  >
                    <td className="max-w-[12rem] px-3 py-2 align-top">
                      <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {template.name}
                      </div>
                      {template.description ? (
                        <div className="line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">{template.description}</div>
                      ) : null}
                    </td>
                    <td className="max-w-[9rem] px-3 py-2 align-top font-mono text-xs text-orange-700 dark:text-orange-400">
                      <span className="block truncate" title={template.dltTemplateId}>
                        {template.dltTemplateId}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2 align-top text-xs capitalize text-slate-600 sm:table-cell dark:text-slate-300">
                      {SUPPORTED_LANGUAGES.find((lang) => lang.value === template.language)?.label ||
                        template.language?.toUpperCase()}
                    </td>
                    <td className="px-3 py-2 align-top text-center text-xs text-slate-600 tabular-nums dark:text-slate-300">
                      {template.variableCount}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          template.isActive
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {template.isActive ? 'Active' : 'Off'}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2 align-top text-xs text-slate-500 md:table-cell dark:text-slate-400">
                      {new Date(template.updatedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                    <td
                      className="whitespace-nowrap px-2 py-2 align-middle text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex flex-nowrap items-center justify-end gap-1">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="shrink-0 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTestSmsTemplate(template);
                          }}
                        >
                          Test
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="shrink-0 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditTemplate(template);
                          }}
                        >
                          Edit
                        </Button>
                        {canDeactivateTemplates ? (
                          <>
                            <Button
                              variant="secondary"
                              size="sm"
                              className="shrink-0 px-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (
                                  window.confirm(
                                    'Deactivate this template? It will no longer be available for sending but will remain in history.'
                                  )
                                ) {
                                  deleteMutation.mutate(template._id);
                                }
                              }}
                              disabled={!template.isActive || deleteMutation.isPending}
                            >
                              {deleteMutation.isPending ? '…' : 'Deactivate'}
                            </Button>
                            <Button
                              variant="primary"
                              className="shrink-0 bg-red-600 px-2 text-xs hover:bg-red-700"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                const firstCheck = window.confirm(
                                  'PERMANENTLY delete this template? This cannot be undone.'
                                );
                                if (firstCheck) {
                                  const secondCheck = window.confirm('Delete permanently — confirm again.');
                                  if (secondCheck) {
                                    hardDeleteMutation.mutate(template._id);
                                  }
                                }
                              }}
                              disabled={hardDeleteMutation.isPending}
                            >
                              {hardDeleteMutation.isPending ? '…' : 'Delete'}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalMode && (
        <TemplateModal
          mode={modalMode}
          onClose={() => {
            if (!createMutation.isPending && !updateMutation.isPending) {
              setModalMode(null);
              setEditingTemplate(undefined);
            }
          }}
          onSubmit={handleModalSubmit}
          initialData={modalMode === 'edit' ? editingTemplate : undefined}
          isProcessing={createMutation.isPending || updateMutation.isPending}
        />
      )}

      <TestTemplateSmsModal
        open={testSmsTemplate != null}
        template={testSmsTemplate}
        onClose={() => setTestSmsTemplate(null)}
      />
        </>
      ) : null}
    </div>
  );
}

