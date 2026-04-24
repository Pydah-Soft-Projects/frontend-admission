'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { communicationAPI, leadAPI, userAPI } from '@/lib/api';
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
      label: existingVar?.label || (index === 0 ? 'Lead Name' : `Variable ${index + 1}`),
      defaultValue: existingVar?.defaultValue || '',
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

  const handleVariableChange = (index: number, key: keyof MessageTemplateVariable, value: string) => {
    setFormState((prev) => {
      const nextVariables = [...prev.variables];
      nextVariables[index] = {
        ...nextVariables[index],
        [key]: value,
      };
      return {
        ...prev,
        variables: nextVariables,
      };
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
            <div className="space-y-3">
              {formState.variables.map((variable, index) => (
                <div
                  key={variable.key || `var-${index}`}
                  className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
                >
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Placeholder
                    </label>
                    <Input
                      value={variable.key}
                      onChange={(e) => handleVariableChange(index, 'key', e.target.value)}
                      placeholder={`var${index + 1}`}
                      disabled={!isEditMode}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Friendly Label
                    </label>
                    <Input
                      value={variable.label}
                      onChange={(e) => handleVariableChange(index, 'label', e.target.value)}
                      placeholder={index === 0 ? 'Lead Name' : `Variable ${index + 1}`}
                      disabled={!isEditMode}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Default Value
                    </label>
                    <Input
                      value={variable.defaultValue || ''}
                      onChange={(e) =>
                        handleVariableChange(index, 'defaultValue', e.target.value)
                      }
                      placeholder="Optional"
                      disabled={!isEditMode}
                    />
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

  const variables = lead ? buildSmsVariablesForLead(lead, template) : [];
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

function buildSmsVariablesForLead(lead: Lead, template: MessageTemplate): { key: string; value: string }[] {
  const vars = template.variables && template.variables.length > 0 ? template.variables : [];
  if (vars.length === 0) {
    const n = template.variableCount || 0;
    return Array.from({ length: n }).map((_, index) => ({
      key: `var${index + 1}`,
      value: index === 0 ? (lead.name || '').trim() : '',
    }));
  }
  return vars.map((variable, index) => {
    const key = variable.key || `var${index + 1}`;
    let value = (variable.defaultValue || '').trim();
    if (index === 0 && lead.name) {
      value = lead.name.trim();
    }
    return { key, value };
  });
}

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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

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
    queryKey: ['broadcastLeads', page, limit, debouncedSearch],
    queryFn: async () => {
      const s = debouncedSearch.trim();
      return await leadAPI.getAll({
        page,
        limit,
        search: s.length >= 2 ? s : undefined,
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

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error('Select a message template.');
      const list = Object.values(selectedById);
      if (list.length === 0) throw new Error('Select at least one lead.');
      let ok = 0;
      let fail = 0;
      for (const lead of list) {
        const numbers: string[] = [];
        if (sendPrimary && lead.phone) numbers.push(lead.phone);
        if (sendFather && lead.fatherPhone) numbers.push(lead.fatherPhone);
        const uniq = [...new Set(numbers.map((n) => String(n).trim()).filter(Boolean))];
        if (uniq.length === 0) {
          fail += 1;
          continue;
        }
        try {
          const variables = buildSmsVariablesForLead(lead, selectedTemplate);
          await communicationAPI.sendSms(lead._id, {
            contactNumbers: uniq,
            templates: [{ templateId: selectedTemplate._id, variables }],
          });
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      return { ok, fail };
    },
    onSuccess: ({ ok, fail }) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      if (fail === 0) {
        showToast.success(`SMS sent for ${ok} lead(s).`);
      } else {
        showToast.success(`Sent for ${ok} lead(s); ${fail} skipped or failed.`);
      }
      clearSelection();
    },
    onError: (e: Error) => {
      showToast.error(e?.message || 'Failed to send');
    },
  });

  const canSend =
    canWrite &&
    Boolean(templateId) &&
    selectedCount > 0 &&
    (sendPrimary || sendFather) &&
    Boolean(selectedTemplate);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Message template</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Pick the DLT template to send. The first template variable is filled with each lead&apos;s name (same
            behaviour as on a lead&apos;s SMS panel).
          </p>
          {loadingTemplates ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
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
        </Card>
        <Card className="p-4 space-y-3">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Recipients</h2>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={sendPrimary}
              onChange={(e) => setSendPrimary(e.target.checked)}
            />
            Student / primary mobile
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={sendFather}
              onChange={(e) => setSendFather(e.target.checked)}
            />
            Father mobile
          </label>
          {!sendPrimary && !sendFather && (
            <p className="text-sm text-amber-700 dark:text-amber-300">Select at least one recipient type.</p>
          )}
        </Card>
        <div className="lg:col-span-2">
           <MessagePreviewCard 
              template={selectedTemplate} 
              lead={Object.values(selectedById)[0]}
              isBulk={selectedCount > 1}
           />
        </div>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4 justify-between">
          <div className="flex-1 min-w-0 space-y-1">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Search leads</label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or enquiry number…"
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
                    No leads match this search.
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
            disabled={!canSend || sendMutation.isPending}
            onClick={() => {
              if (!window.confirm(`Send this template to ${selectedCount} lead(s)?`)) return;
              sendMutation.mutate();
            }}
          >
            {sendMutation.isPending ? 'Sending…' : `Send SMS to ${selectedCount} lead(s)`}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function UserLeadsTab() {
  const { canWrite } = useModulePermission('communications');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;

  const [divisionFilter, setDivisionFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [sendPrimary, setSendPrimary] = useState(true);
  const [sendFather, setSendFather] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, divisionFilter, deptFilter, groupFilter]);

  const { data: analyticsData, isLoading: loadingUsers } = useQuery({
    queryKey: ['userAnalytics', 'communications', 'roster', divisionFilter, deptFilter, groupFilter],
    queryFn: async () => {
      const resp = await leadAPI.getUserAnalytics({
        division: divisionFilter || undefined,
        department: deptFilter || undefined,
        group: groupFilter || undefined,
        rosterOnly: true,
      });
      return resp?.users ?? [];
    },
  });
  const users: any[] = useMemo(() => {
    let list = analyticsData ?? [];
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      list = list.filter((u: any) => 
        u.userName?.toLowerCase().includes(s) || 
        u.name?.toLowerCase().includes(s) ||
        u.designation?.toLowerCase().includes(s) ||
        u.department?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [analyticsData, debouncedSearch]);

  // Derive filter options from the full user dataset
  const { divisionOptions, deptOptions, groupOptions } = useMemo(() => {
    const divs = new Set<string>();
    const depts = new Set<string>();
    const groups = new Set<string>();
    
    // We fetch without filters once to get all options, OR we just use what we have.
    // For simplicity, let's assume the user wants filters for what is available.
    users.forEach(u => {
      if (u.division && u.division !== '-') divs.add(u.division);
      if (u.department && u.department !== '-') depts.add(u.department);
      if (u.group && u.group !== '-') groups.add(u.group);
    });

    return {
      divisionOptions: Array.from(divs).sort(),
      deptOptions: Array.from(depts).sort(),
      groupOptions: Array.from(groups).sort()
    };
  }, [users]);

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

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error('Select a template.');
      if (selectedUserIds.length === 0) throw new Error('Select at least one user.');
      
      let ok = 0; let fail = 0;
      
      // Fetch leads for all selected users (active leads only)
      const allLeads: Lead[] = [];
      for (const uid of selectedUserIds) {
        const resp = await leadAPI.getAll({ 
          assignedTo: uid, 
          limit: 100, // Reasonable limit per user to avoid too much data
          leadStatus: 'New,Assigned,In Progress,Interested' // Active statuses
        });
        if (resp?.leads) allLeads.push(...resp.leads);
      }

      if (allLeads.length === 0) throw new Error('No active leads found for selected users.');
      
      // Filter to leads with recipients and within MAX_BULK_LEADS
      const targetLeads = allLeads
        .filter(leadHasRecipient)
        .slice(0, MAX_BULK_LEADS);

      for (const lead of targetLeads) {
        const numbers: string[] = [];
        if (sendPrimary && lead.phone) numbers.push(lead.phone);
        if (sendFather && lead.fatherPhone) numbers.push(lead.fatherPhone);
        if (numbers.length === 0) { fail++; continue; }
        
        try {
          const variables = buildSmsVariablesForLead(lead, selectedTemplate);
          await communicationAPI.sendSms(lead._id, {
            contactNumbers: [...new Set(numbers)],
            templates: [{ templateId: selectedTemplate._id, variables }],
          });
          ok++;
        } catch { fail++; }
      }
      return { ok, fail, totalPlanned: targetLeads.length };
    },
    onSuccess: ({ ok, fail, totalPlanned }) => {
      showToast.success(`Sent to ${ok} lead(s). ${fail > 0 ? `${fail} failed.` : ''}`);
      if (totalPlanned < selectedUserIds.length * 10) { // arbitrary hint
         // maybe show warning if some leads were skipped?
      }
      setSelectedUserIds([]);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
    onError: (e: Error) => showToast.error(e.message),
  });

  const canSend = canWrite && !!templateId && selectedUserIds.length > 0 && (sendPrimary || sendFather);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 space-y-3">
          <h2 className="text-lg font-semibold">Step 1: Filters</h2>
          <div className="grid grid-cols-1 gap-2">
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm"
              value={divisionFilter}
              onChange={(e) => setDivisionFilter(e.target.value)}
            >
              <option value="">All Divisions</option>
              {divisionOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
            >
              <option value="">All Departments</option>
              {deptOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="">All Groupings</option>
              {groupOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
        </Card>
        <Card className="p-4 space-y-3">
          <h2 className="text-lg font-semibold">Step 2: Template</h2>
          {loadingTemplates ? <Skeleton className="h-10 w-full" /> : (
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">Select template…</option>
              {activeTemplates.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          )}
        </Card>
        <Card className="p-4 space-y-3">
          <h2 className="text-lg font-semibold">Step 3: Recipients</h2>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={sendPrimary} onChange={e => setSendPrimary(e.target.checked)} />
              Primary
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={sendFather} onChange={e => setSendFather(e.target.checked)} />
              Father
            </label>
          </div>
        </Card>
        <div className="lg:col-span-3">
           <MessagePreviewCard 
              template={selectedTemplate} 
              lead={previewLead}
              isBulk={selectedUserIds.length > 0}
           />
        </div>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4 justify-between lg:items-end">
          <div className="flex-1 min-w-0">
            <label className="text-sm font-medium">Search Users</label>
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or designation..." />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" 
              onClick={() => {
                const allIds = users.map(u => u.id);
                setSelectedUserIds(prev => prev.length === allIds.length ? [] : allIds);
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
                      if (e.target.checked) setSelectedUserIds(users.map(u => u.id));
                      else setSelectedUserIds([]);
                    }}
                  />
                </th>
                <th className="w-12 px-3 py-2 text-left">S.No</th>
                <th className="px-3 py-2 text-left">User Name</th>
                <th className="px-3 py-2 text-left">Student Group</th>
                <th className="px-3 py-2 text-left text-orange-600">Leads Count Available</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-white">
              {loadingUsers ? (
                <tr><td colSpan={5} className="p-4 text-center"><TemplatesSkeleton /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-500">No users found.</td></tr>
              ) : (
                users.map((u, idx) => {
                  const isChecked = selectedUserIds.includes(u.id);
                  return (
                    <tr key={u.id} className={isChecked ? 'bg-orange-50/30' : undefined}>
                      <td className="px-3 py-2">
                        <input 
                          type="checkbox" 
                          checked={isChecked} 
                          onChange={() => {
                            setSelectedUserIds(prev => 
                              prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]
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
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">
                          {u.group || 'N/A'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-orange-700">
                        {u.totalAssigned || 0}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="primary" disabled={!canSend || sendMutation.isPending} onClick={() => sendMutation.mutate()}>
            {sendMutation.isPending ? 'Sending...' : `Send to Leads of ${selectedUserIds.length} User(s)`}
          </Button>
        </div>
      </Card>
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
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 dark:border-slate-800 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">Communications</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Manage SMS templates and send a template to multiple leads.
          </p>
        </div>
        <nav
          className="flex w-full shrink-0 flex-wrap justify-end gap-1 self-end rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-700 dark:bg-slate-800/80 sm:w-auto"
          aria-label="Communications sections"
        >
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:px-4 ${
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
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:px-4 ${
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
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors sm:px-4 ${
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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">Message templates</h2>
          <p className="text-sm text-gray-600 dark:text-slate-400">
            Manage DLT-approved SMS templates for automated communications.
          </p>
        </div>
        <Button variant="primary" onClick={handleAddTemplate}>
          + New Template
        </Button>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by template name or DLT ID"
            />
          </div>
          <div>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
            >
              <option value="all">All Languages</option>
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            Show inactive templates
          </label>
        </div>
        <div className="flex items-center justify-between text-sm text-gray-500">
          <span>
            Active templates: <span className="font-semibold">{activeCount}</span>
          </span>
          <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </Card>

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-800">
            <thead className="bg-gray-50 dark:bg-slate-900/60">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  DLT ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Language
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Placeholders
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Updated
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-slate-800 bg-white/60 dark:bg-slate-900/50">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6">
                    <TemplatesSkeleton />
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                    No templates found. Click “New Template” to get started.
                  </td>
                </tr>
              ) : (
                templates.map((template) => (
                  <tr 
                    key={template._id} 
                    className="hover:bg-slate-50 dark:hover:bg-slate-900/80 cursor-pointer transition-colors"
                    onClick={() => handleEditTemplate(template)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 dark:text-slate-100 hover:text-blue-600 transition-colors">
                        {template.name}
                      </div>
                      {template.description && (
                        <div className="text-xs text-gray-500">{template.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-blue-600">
                      {template.dltTemplateId}
                    </td>
                    <td className="px-4 py-3 text-sm capitalize text-gray-700">
                      {SUPPORTED_LANGUAGES.find((lang) => lang.value === template.language)?.label ||
                        template.language?.toUpperCase()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{template.variableCount}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                          template.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {template.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(template.updatedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditTemplate(template);
                        }}
                      >
                        Edit
                      </Button>
                      {canDeactivateTemplates && (
                        <>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm('Are you sure you want to deactivate this template? It will no longer be available for sending but will remain in history.')) {
                                deleteMutation.mutate(template._id);
                              }
                            }}
                            disabled={!template.isActive || deleteMutation.isPending}
                          >
                            {deleteMutation.isPending ? 'Processing…' : 'Deactivate'}
                          </Button>
                          <Button
                            variant="primary"
                            className="bg-red-600 hover:bg-red-700 text-white border-transparent"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              const firstCheck = window.confirm('DANGER: This will PERMANENTLY remove the template. This action cannot be undone. Continue?');
                              if (firstCheck) {
                                const secondCheck = window.confirm('Are you absolutely sure? This will remove all associated template data.');
                                if (secondCheck) {
                                  hardDeleteMutation.mutate(template._id);
                                }
                              }
                            }}
                            disabled={hardDeleteMutation.isPending}
                          >
                            {hardDeleteMutation.isPending ? 'Deleting…' : 'Delete'}
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

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
        </>
      ) : null}
    </div>
  );
}

