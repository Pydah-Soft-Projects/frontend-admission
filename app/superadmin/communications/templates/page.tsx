'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { communicationAPI, leadAPI, type SmsBulkJobReportContext } from '@/lib/api';
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
  /** message_template_groups.id, or '' for ungrouped */
  templateGroupId: string;
  category: 'sms' | 'whatsapp';
  headerType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  headerText?: string;
  headerHandle?: string;
  mediaGallery?: string[];
};

const DEFAULT_FORM_STATE: TemplateFormState = {
  name: '',
  dltTemplateId: '',
  language: 'en',
  content: '',
  description: '',
  isUnicode: false,
  variables: [],
  templateGroupId: '',
  category: 'sms',
  headerType: 'TEXT',
  headerText: '',
  headerHandle: '',
  mediaGallery: [],
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
  templateGroups = [],
  defaultCategory,
}: {
  mode: 'create' | 'edit';
  onClose: () => void;
  onSubmit: (state: TemplateFormState) => void;
  initialData?: MessageTemplate;
  isProcessing: boolean;
  templateGroups?: Array<{ id: string; name: string }>;
  defaultCategory?: 'sms' | 'whatsapp';
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
        templateGroupId: initialData.templateGroupId ?? '',
        category: (initialData as any).category || 'sms',
        headerType: (initialData as any).headerType || 'TEXT',
        headerText: (initialData as any).headerText || '',
        headerHandle: (initialData as any).headerHandle || '',
        mediaGallery: (initialData as any).mediaGallery || [],
      };
    }
    return { 
      ...DEFAULT_FORM_STATE, 
      category: defaultCategory || 'sms' 
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
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-semibold">
              {!isEditMode ? 'View Template' : mode === 'create' ? 'Create Template' : 'Edit Template'}
            </h2>
            <p className="text-sm text-gray-500">
              {!isEditMode 
                ? 'Review template details and placeholders.' 
                : 'Configure template details and map placeholders to friendly labels.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            {!isEditMode && (
              <Button variant="primary" size="sm" onClick={() => setIsEditMode(true)}>
                Edit Template
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
        </div>

        {!isEditMode ? (
          /* ==========================================
             VIEW MODE (Clean Content Display)
             ========================================== */
          <div className="space-y-8 animate-in fade-in duration-300">
            {/* Meta Information Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Group</span>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {templateGroups.find(g => g.id === formState.templateGroupId)?.name || 'No Group'}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Category</span>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {formState.category === 'whatsapp' ? (
                    <span className="text-emerald-600 dark:text-emerald-400">🟢 WhatsApp</span>
                  ) : (
                    <span className="text-blue-600 dark:text-blue-400">🔵 Normal (SMS)</span>
                  )}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Language</span>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {SUPPORTED_LANGUAGES.find(l => l.value === formState.language)?.label || formState.language}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                  {formState.category === 'whatsapp' ? 'WhatsApp Name' : 'DLT Template ID'}
                </span>
                <p className="font-mono text-sm font-semibold text-orange-700 dark:text-orange-400">
                  {formState.dltTemplateId}
                </p>
              </div>
              <div className="md:col-span-2 space-y-1">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Internal Description</span>
                <p className="text-sm text-slate-600 dark:text-slate-400 italic">
                  {formState.description || 'No description provided.'}
                </p>
              </div>
            </div>

            {/* WhatsApp Specific Header View */}
            {formState.category === 'whatsapp' && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/20">
                <h3 className="text-xs font-bold uppercase text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  WhatsApp Header Configuration
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white/60 dark:bg-slate-900/40 p-3 rounded-lg border border-emerald-100/50 dark:border-emerald-900/20">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Type</span>
                    <p className="text-sm font-medium">
                      {formState.headerType === 'TEXT' ? '📝 Text Message' : 
                       formState.headerType === 'IMAGE' ? '🖼️ Image Media' :
                       formState.headerType === 'VIDEO' ? '🎥 Video Media' :
                       formState.headerType === 'DOCUMENT' ? '📄 Document File' : 'None'}
                    </p>
                  </div>
                  <div className="bg-white/60 dark:bg-slate-900/40 p-3 rounded-lg border border-emerald-100/50 dark:border-emerald-900/20">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      {formState.headerType === 'TEXT' ? 'Header Text' : 'Media ID/URL'}
                    </span>
                    <p className="text-sm font-medium truncate italic" title={formState.headerType === 'TEXT' ? formState.headerText : formState.headerHandle}>
                      {formState.headerType === 'TEXT' ? (formState.headerText || '—') : (formState.headerHandle || '—')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Template Content Box */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Message Content</span>
              <div className="relative rounded-2xl bg-slate-100 p-6 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <div className="text-base leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans">
                  {formState.content}
                </div>
                {/* Speech bubble tail */}
                <div className="absolute -left-2 top-8 h-4 w-4 rotate-45 border-b border-l border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900"></div>
              </div>
            </div>

            {/* Variables / Placeholders */}
            {formState.variables.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Placeholder Mapping</span>
                  <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-[10px] font-bold">
                    {formState.variables.length} Variables
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {formState.variables.map((v, i) => (
                    <div key={i} className="flex flex-col p-3 rounded-xl border border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-mono font-bold text-orange-600 bg-orange-50 dark:bg-orange-950/30 px-1.5 rounded uppercase">
                          {v.key || `var${i+1}`}
                        </span>
                        {v.isGlobal && (
                          <span className="text-[9px] font-bold text-blue-600 uppercase">Global</span>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{v.label}</span>
                      {v.defaultValue && (
                        <span className="text-xs text-slate-500 mt-1 truncate">Default: &quot;{v.defaultValue}&quot;</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
               <Button variant="secondary" onClick={onClose}>Close Preview</Button>
            </div>
          </div>
        ) : (
          /* ==========================================
             EDIT MODE (Current Form Layout)
             ========================================== */
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-300">Group</label>
                <select
                  className="w-full rounded-lg border border-gray-300 bg-white/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-100"
                  value={formState.templateGroupId}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, templateGroupId: e.target.value }))
                  }
                >
                  <option value="">No group</option>
                  {templateGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template Name</label>
                <Input
                  value={formState.name}
                  onChange={(e) => setFormState((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Counselling started for Degree"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {formState.category === 'whatsapp' ? 'WhatsApp Template Name' : 'DLT Template ID'}
                </label>
                <Input
                  value={formState.dltTemplateId}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, dltTemplateId: e.target.value }))
                  }
                  placeholder={formState.category === 'whatsapp' ? "e.g. registration_success" : "1607100000000129152"}
                  disabled={formState.category === 'whatsapp' && mode === 'edit'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white/80 dark:bg-slate-900/50 dark:border-slate-700 dark:text-slate-100"
                  value={formState.category}
                  onChange={(e) => setFormState((prev) => ({ ...prev, category: e.target.value as any }))}
                >
                  <option value="sms">Normal (SMS)</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
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
                />
                <label htmlFor="unicode-toggle" className="text-sm text-gray-700">
                  Unicode (non-English) message
                </label>
              </div>

              {formState.category === 'whatsapp' && (
                <div className="md:col-span-2 border-t pt-4 dark:border-slate-800">
                  <label className="block text-sm font-semibold text-gray-800 dark:text-slate-200 mb-2">WhatsApp Header & Media Gallery</label>
                  <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-lg space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Header Type</label>
                        <div className="text-sm font-medium py-1 px-2 bg-white dark:bg-slate-800 rounded border dark:border-slate-700">
                          {formState.headerType === 'TEXT' ? '📝 Text' : 
                           formState.headerType === 'IMAGE' ? '🖼️ Image' :
                           formState.headerType === 'VIDEO' ? '🎥 Video' :
                           formState.headerType === 'DOCUMENT' ? '📄 Document' : 'None'}
                        </div>
                      </div>
                      {formState.headerType === 'TEXT' && (
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Header Text</label>
                          <div className="text-sm py-1 px-2 bg-white dark:bg-slate-800 rounded border dark:border-slate-700 italic">
                            {formState.headerText || 'No header text'}
                          </div>
                        </div>
                      )}
                    </div>

                    {formState.headerType !== 'TEXT' && formState.headerType !== 'NONE' && (
                      <div className="space-y-3">
                        <label className="block text-[10px] uppercase font-bold text-gray-500">Stored Media URLs (Gallery)</label>
                        <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
                          {(formState.mediaGallery || []).length === 0 && (
                            <p className="text-xs text-slate-500 italic">No media URLs stored yet. Add one below.</p>
                          )}
                          {formState.mediaGallery?.map((url, i) => (
                            <div key={i} className={`flex items-center gap-3 p-2 rounded border transition-colors ${formState.headerHandle === url ? 'bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-900/50' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                              <input 
                                type="radio" 
                                name="active-media-select" 
                                checked={formState.headerHandle === url}
                                onChange={() => setFormState(prev => ({ ...prev, headerHandle: url }))}
                                className="h-4 w-4 text-orange-600 focus:ring-orange-500"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-mono truncate text-slate-600 dark:text-slate-400" title={url}>{url}</p>
                              </div>
                              <button 
                                type="button" 
                                className="text-xs text-red-500 hover:text-red-700 p-1"
                                onClick={() => {
                                  const nextGallery = formState.mediaGallery?.filter((_, idx) => idx !== i) || [];
                                  setFormState(prev => ({ 
                                    ...prev, 
                                    mediaGallery: nextGallery,
                                    headerHandle: prev.headerHandle === url ? (nextGallery[0] || '') : prev.headerHandle
                                  }));
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="flex gap-2 pt-2">
                          <div className="flex-1">
                            <Input 
                              placeholder="Paste new Media ID or URL..." 
                              className="text-xs h-8"
                              id="new-media-input"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const btn = document.getElementById('add-media-btn');
                                  btn?.click();
                                }
                              }}
                            />
                          </div>
                          <Button 
                            id="add-media-btn"
                            variant="secondary" 
                            size="sm" 
                            className="h-8 px-3"
                            onClick={() => {
                              const input = document.getElementById('new-media-input') as HTMLInputElement;
                              const val = input.value.trim();
                              if (!val) return;
                              if (formState.mediaGallery?.includes(val)) {
                                showToast.error('URL already in gallery');
                                return;
                              }
                              setFormState(prev => {
                                const nextGallery = [...(prev.mediaGallery || []), val];
                                return {
                                  ...prev,
                                  mediaGallery: nextGallery,
                                  headerHandle: prev.headerHandle || val
                                };
                              });
                              input.value = '';
                            }}
                          >
                            Add
                          </Button>
                        </div>
                        <p className="text-[9px] text-slate-500">
                          Select the radio button to set the active media for this template.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <Input
                value={formState.description}
                onChange={(e) => setFormState((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Short summary for internal reference"
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
              />
              <p className="text-xs text-gray-500 mt-1">
                Detected placeholders: <span className="font-semibold">{variableCount}</span>
              </p>
            </div>

            {variableCount > 0 && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-300">
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
                        />
                      </div>
                      <div className="md:col-span-3">
                        <label className="mb-1 block text-xs font-medium text-gray-600">Friendly label</label>
                        <Input
                          value={variable.label}
                          onChange={(e) => handleVariableField(index, { label: e.target.value })}
                          placeholder={`Variable ${index + 1}`}
                        />
                      </div>
                      <div className="md:col-span-4">
                        <label className="mb-1 block text-xs font-medium text-gray-600">Default value</label>
                        <Input
                          value={variable.defaultValue || ''}
                          onChange={(e) => handleVariableField(index, { defaultValue: e.target.value })}
                          placeholder="Pre-filled when sending (optional)"
                        />
                      </div>
                      <div className="flex items-center gap-2 md:col-span-3">
                        <input
                          id={`var-global-${index}`}
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                          checked={variable.isGlobal === true}
                          onChange={(e) => handleVariableField(index, { isGlobal: e.target.checked })}
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

            <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-slate-800">
              <Button variant="secondary" onClick={onClose} disabled={isProcessing}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSubmit} disabled={isProcessing}>
                {isProcessing ? 'Saving…' : mode === 'create' ? 'Create Template' : 'Save Changes'}
              </Button>
            </div>
          </div>
        )}
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

/** Aligned with backend `MAX_SMS_BULK_JOB_ITEMS` — large sends run as background jobs. */
const MAX_SMS_BULK_LEADS = 2000;

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
  statusBreakdown,
  invalidCount,
}: {
  open: boolean;
  onClose: () => void;
  template: MessageTemplate | null;
  initialRows: SmsReviewRow[];
  isPreparing?: boolean;
  isSending?: boolean;
  onConfirmSend: (rows: SmsReviewRow[]) => void | Promise<void>;
  subtitle?: string;
  statusBreakdown?: Record<string, number>;
  invalidCount?: number;
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

  const previewVariableStats = useMemo(() => {
    const total = variableScopeList.length;
    if (total === 0) return { total: 0, filled: 0 };
    const vals = draft[0]?.variables ?? [];
    const filled = variableScopeList.reduce((acc, meta) => {
      const raw = (vals[meta.index]?.value ?? '').trim();
      return acc + (raw ? 1 : 0);
    }, 0);
    return { total, filled };
  }, [variableScopeList, draft]);

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
            {((statusBreakdown && Object.keys(statusBreakdown).length > 0) || (invalidCount && invalidCount > 0)) && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                {statusBreakdown && Object.entries(statusBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <span key={status} className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                      {status || 'Unknown'}: {count.toLocaleString()}
                    </span>
                  ))}
                {invalidCount && invalidCount > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 font-bold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse"></span>
                    Invalid/Missing Numbers: {invalidCount.toLocaleString()}
                  </span>
                ) : null}
              </div>
            )}
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
              <div className="flex flex-col md:flex-row gap-6">
                {/* Message Preview Column */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                      Message Preview
                    </p>
                    <div className="flex items-center gap-3">
                      {previewVariableStats.total > 0 && (
                        <p className="text-[10px] font-medium text-slate-600 tabular-nums dark:text-slate-400">
                          {previewVariableStats.filled}/{previewVariableStats.total} variables filled
                        </p>
                      )}
                      {samplePreview && (
                        <p className="text-[10px] font-medium text-slate-500 tabular-nums dark:text-slate-400">
                          {samplePreview.length} chars
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="relative">
                    <div className="max-h-24 md:max-h-32 overflow-y-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 text-sm italic leading-relaxed text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
                      {samplePreview || <span className="text-slate-400 not-italic">No template content.</span>}
                    </div>
                    <div className="absolute -left-1 top-4 h-2 w-2 rotate-45 border-b border-l border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"></div>
                  </div>
                </div>

                {/* Global Variables Column (Visible only if present) */}
                {globalVars.length > 0 && (
                  <div className="w-full md:w-[35%] lg:w-[30%] shrink-0 flex flex-col">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
                      Global Placeholders
                    </p>
                    <div className="flex-1 max-h-32 md:max-h-40 overflow-y-auto pr-1 space-y-3">
                      {globalVars.map((meta) => {
                        const val = draft[0]?.variables[meta.index]?.value ?? '';
                        return (
                          <div key={meta.key} className="space-y-1">
                            <label className="text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                              {meta.label} <span className="font-normal text-slate-400 opacity-70">(Global)</span>
                            </label>
                            <Input
                              value={val}
                              onChange={(e) => updateSharedVariable(meta.index, e.target.value)}
                              className="h-8 text-xs font-medium"
                              disabled={isSending}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto bg-white dark:bg-slate-950/20">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-700">
                  <thead className="sticky top-0 z-[1] bg-slate-100 dark:bg-slate-800 shadow-sm">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-[10px]">Recipient</th>
                      <th className="px-4 py-2.5 text-left font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-[10px]">Numbers</th>
                      {perLeadVars.map((meta) => (
                        <th
                          key={meta.key}
                          className="min-w-[8rem] px-3 py-2.5 text-left font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 text-[10px]"
                        >
                          {meta.label}
                          <span className="mt-0.5 block font-medium normal-case text-[9px] text-slate-400 italic">
                            Individual
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {draft.map((row, leadIdx) => (
                      <tr key={row.leadId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-2.5 align-middle">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[12rem]" title={row.leadName}>
                            {row.leadName}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 align-middle font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {row.phoneDisplay}
                        </td>
                        {perLeadVars.map((meta) => (
                          <td key={`${row.leadId}-${meta.key}`} className="px-3 py-2 align-middle">
                            <Input
                              value={row.variables[meta.index]?.value ?? ''}
                              onChange={(e) => updatePerLeadVariable(leadIdx, meta.index, e.target.value)}
                              className="h-8 text-xs"
                              disabled={isSending}
                              placeholder={`Enter ${meta.label.toLowerCase()}...`}
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
              <div className="flex flex-col gap-0.5">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {draft.length} SMS in this job · server runs up to {SMS_SEND_CONCURRENCY} in parallel
                </p>
                {invalidCount && invalidCount > 0 ? (
                  <p className="text-[10px] font-medium text-red-600 dark:text-red-400">
                    * {invalidCount} lead(s) filtered out (invalid or missing phone numbers)
                  </p>
                ) : null}
              </div>
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
                  {isSending ? 'Queuing…' : `Queue ${draft.length} SMS`}
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
  const [headerHandle, setHeaderHandle] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [hasUploaded, setHasUploaded] = useState(false);
  const [varRows, setVarRows] = useState<{ key: string; value: string }[]>([]);

  useEffect(() => {
    if (!open || !template) return;
    setPhone('');
    setHeaderHandle(template.headerHandle || '');
    setHasUploaded(false);
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
        headerHandle: headerHandle.trim(),
      });
    },
    onSuccess: (data: { success?: boolean; responseText?: string }) => {
      if (data?.success) {
        showToast.success(`Test ${template.category === 'whatsapp' ? 'WhatsApp' : 'SMS'} submitted. Check the handset for delivery.`);
        onClose();
      } else {
        const hint =
          typeof data?.responseText === 'string' ? data.responseText.trim().slice(0, 240) : '';
        showToast.error(hint || `${template.category === 'whatsapp' ? 'WhatsApp' : 'SMS'} provider did not confirm success.`);
      }
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { message?: string } }; message?: string };
      showToast.error(ax?.response?.data?.message || ax?.message || `Failed to send test ${template.category === 'whatsapp' ? 'WhatsApp' : 'SMS'}`);
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

  const isMediaHeader = template.category === 'whatsapp' && 
                        ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4 py-6 backdrop-blur-sm">
      <Card className="max-h-[92vh] w-full max-w-4xl flex flex-col overflow-hidden shadow-xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              Test {template.category === 'whatsapp' ? 'WhatsApp' : 'SMS'}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Template: <span className="font-medium">{template.name}</span></p>
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Left Column: Preview */}
            <div className="space-y-4">
              <div className="sticky top-0 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Real-time Preview
                </p>
                <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4 shadow-inner dark:border-slate-700 dark:bg-slate-900/60">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2 mb-3 dark:border-slate-800">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Message Content</p>
                    <span className="text-[10px] font-mono bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-100 dark:border-slate-700 text-slate-500 tabular-nums">
                      {previewText.length} chars
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-100 min-h-[100px]">
                    {previewText ? (
                      <span className="italic">&quot;{previewText}&quot;</span>
                    ) : (
                      <span className="text-slate-400 italic">No template content.</span>
                    )}
                  </p>
                  {previewText.includes('[Variable]') ? (
                    <div className="mt-4 flex gap-2 items-start rounded-lg bg-amber-50 p-2.5 dark:bg-amber-900/20">
                      <span className="text-amber-500 mt-0.5">⚠️</span>
                      <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        Some placeholders are still empty. Fill them in the right panel to complete the test message.
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-lg bg-blue-50/50 p-3 border border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/20">
                  <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                    <strong>Note:</strong> Sending a test message uses live provider credits. No lead history or communication record will be created for this test.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column: Configuration */}
            <div className="space-y-6">
              {/* Mobile Number */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Target Mobile Number</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="h-11 font-medium"
                  disabled={mutation.isPending}
                  icon={<span>📱</span>}
                />
              </div>

              {/* Media Selection (WhatsApp) */}
              {isMediaHeader && (
                <div className="space-y-3 animate-in slide-in-from-right-2 duration-300">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Header Media ({template.headerType})
                  </label>
                  
                  {/* Gallery */}
                  {(template.mediaGallery || []).length > 0 && (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold uppercase tracking-tight text-slate-500">Quick select from gallery</p>
                          {template.mediaGallery?.includes(headerHandle) && !hasUploaded && (
                            <span className="text-[9px] font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-1.5 py-0.5 rounded animate-in fade-in zoom-in duration-300">Selected from Gallery</span>
                          )}
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-1 p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800">
                          {template.mediaGallery?.map((url, i) => (
                            <div 
                              key={i} 
                              className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-all ${headerHandle === url && !hasUploaded ? 'bg-white dark:bg-slate-800 shadow-sm border border-orange-200 dark:border-orange-900/50' : 'hover:bg-white/50 dark:hover:bg-slate-800/50 border border-transparent'}`}
                              onClick={() => {
                                setHeaderHandle(url);
                                setHasUploaded(false);
                              }}
                            >
                              <div className={`h-3 w-3 rounded-full border-2 ${headerHandle === url && !hasUploaded ? 'border-orange-500 bg-orange-500' : 'border-slate-300'}`} />
                              <p className="text-[10px] font-mono truncate flex-1 text-slate-600 dark:text-slate-400" title={url}>{url}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="relative flex items-center py-1">
                        <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                        <span className="flex-shrink mx-3 text-[10px] font-black tracking-widest text-slate-400 dark:text-slate-500">OR</span>
                        <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
                      </div>
                    </div>
                  )}

                  {/* Custom URL / Upload */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-tight text-slate-500">Custom Media ID or Upload</p>
                      {hasUploaded ? (
                        <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded animate-in fade-in zoom-in duration-300">File Uploaded</span>
                      ) : headerHandle && !template.mediaGallery?.includes(headerHandle) ? (
                        <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded animate-in fade-in zoom-in duration-300">Manual Input</span>
                      ) : null}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={headerHandle}
                        onChange={(e) => {
                          setHeaderHandle(e.target.value);
                          if (hasUploaded) setHasUploaded(false);
                        }}
                        placeholder="URL or Media ID"
                        className="flex-1 font-mono text-[11px] h-10"
                        disabled={mutation.isPending || isUploading}
                      />
                      <div className="relative">
                        <input
                          type="file"
                          id="test-media-upload"
                          className="hidden"
                          accept={template.headerType === 'IMAGE' ? 'image/*' : 
                                  template.headerType === 'VIDEO' ? 'video/*' : 
                                  template.headerType === 'DOCUMENT' ? '.pdf,.doc,.docx' : '*/*'}
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            
                            setIsUploading(true);
                            try {
                              const formData = new FormData();
                              formData.append('file', file);
                              formData.append('type', template.headerType);
                              
                              const res = await communicationAPI.uploadWhatsAppMedia(formData);
                              
                              if (res.data?.id) {
                                setHeaderHandle(res.data.id);
                                setHasUploaded(true);
                                showToast.success('Media uploaded successfully');
                              } else if (res.data?.url) {
                                setHeaderHandle(res.data.url);
                                setHasUploaded(true);
                                showToast.success('Media uploaded successfully');
                              }
                            } catch (err: any) {
                              const msg = err.response?.data?.message || err.message || 'Upload failed';
                              showToast.error(msg);
                            } finally {
                              setIsUploading(false);
                            }
                          }}
                          disabled={mutation.isPending || isUploading}
                        />
                        {hasUploaded ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-10 px-3 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/10"
                            onClick={() => {
                              setHasUploaded(false);
                              setHeaderHandle(template.headerHandle || '');
                            }}
                            disabled={mutation.isPending}
                          >
                            ✕ Clear
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-10 px-3 whitespace-nowrap"
                            onClick={() => document.getElementById('test-media-upload')?.click()}
                            disabled={mutation.isPending || isUploading}
                          >
                            {isUploading ? '...' : '📁 Upload'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Variables */}
              {varRows.length > 0 && (
                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Template Placeholders</label>
                  <div className="space-y-3 max-h-[30vh] overflow-y-auto pr-2">
                    {varRows.map((row, i) => {
                      const label = template.variables?.[i]?.label || row.key;
                      return (
                        <div key={`${row.key}-${i}`} className="space-y-1">
                          <label className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{label}</label>
                          <Input
                            value={row.value}
                            onChange={(e) => updateVarRow(i, e.target.value)}
                            className="h-9 text-xs"
                            placeholder={`Enter value for ${label}`}
                            disabled={mutation.isPending}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-slate-50/80 px-6 py-4 dark:border-slate-700 dark:bg-slate-900/50">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            className="min-w-[120px]"
            disabled={mutation.isPending || !phone.trim()}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Sending…' : '🚀 Send Test Message'}
          </Button>
        </div>
      </Card>
    </div>
  );
}

type SmsBulkListJob = {
  id: string;
  source: string;
  reportContext?: SmsBulkJobReportContext | null;
  templateName: string | null;
  status: string;
  displayStatus?: string;
  workRemaining?: number;
  totalItems: number;
  doneCount: number;
  successCount: number;
  failCount: number;
  lastError: string | null;
  createdAt: string;
  completedAt?: string | null;
};

function SmsBulkReportsTab({ highlightJobId, onClearHighlight }: { highlightJobId?: string | null; onClearHighlight?: () => void }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: listData, isLoading, isFetching } = useQuery({
    queryKey: ['smsBulkJobs', 1],
    queryFn: () => communicationAPI.listBulkSmsJobs({ page: 1, limit: 40 }),
    refetchInterval: 2000,
  });
  const polledJobs: SmsBulkListJob[] = (listData?.items ?? []) as SmsBulkListJob[];
  const hasListActive = useMemo(
    () =>
      polledJobs.some(
        (j) =>
          j.status === 'running' ||
          j.status === 'queued' ||
          (j.workRemaining ?? 0) > 0 ||
          (j.displayStatus === 'incomplete' && (j.status === 'completed' || j.status === 'running' || j.status === 'queued'))
      ),
    [polledJobs]
  );
  const resumeMutation = useMutation({
    mutationFn: (jobId: string) => communicationAPI.resumeBulkSmsJob(jobId),
    onSuccess: (out) => {
      let msg: string;
      if (out.completed) {
        msg =
          'The job is now complete. The batch size was updated to the number of line items actually in the system ' +
          '(if the plan was larger, those extra lines were never saved, so you cannot re-send them from this same job ' +
          '— send a new batch to reach any additional leads).';
      } else {
        msg = out.reopened
          ? 'The job was re-opened; sending will continue in the background.'
          : 'Worker re-queued. Watch progress for updates.';
      }
      showToast.success(msg);
      queryClient.invalidateQueries({ queryKey: ['smsBulkJobs'] });
      if (expandedId) queryClient.invalidateQueries({ queryKey: ['smsBulkJob', expandedId] });
    },
    onError: (e: Error) => showToast.error(e?.message || 'Failed to resume job'),
  });
  useEffect(() => {
    if (highlightJobId) {
      setExpandedId(highlightJobId);
      onClearHighlight?.();
    }
  }, [highlightJobId, onClearHighlight]);
  const {
    data: jobDetail,
    isLoading: jobDetailLoading,
    isError: jobDetailError,
  } = useQuery({
    queryKey: ['smsBulkJob', expandedId],
    queryFn: () => communicationAPI.getBulkSmsJob(expandedId!),
    enabled: Boolean(expandedId),
    refetchInterval: 2000,
  });
  const detailMatchesExpanded =
    Boolean(jobDetail) && jobDetail?.job.id === expandedId;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Every bulk send from <span className="font-medium">Send to leads</span> and{' '}
        <span className="font-medium">User Specific Leads</span> is queued as a job. The table below refreshes
        {hasListActive ? ' every few seconds' : ' periodically'} while a job is running, so you can see counts and
        per-number provider responses.
      </p>
      {isFetching && hasListActive ? (
        <p className="text-xs text-amber-700 dark:text-amber-300">Updating…</p>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-900/70">
            <tr>
              <th className="w-9 px-2 py-2 text-left text-xs font-semibold text-slate-500" scope="col" aria-label="Expand" />
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Time</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Source</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Users</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Group</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Template</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Status</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Progress</th>
              <th className="w-0 whitespace-nowrap px-2 py-2 text-right text-xs font-semibold text-slate-500"> </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {polledJobs.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                  No jobs yet. Send a bulk SMS from the other tabs to see activity here.
                </td>
              </tr>
            ) : (
              polledJobs.map((j) => {
                const pct = j.totalItems > 0 ? Math.round((j.doneCount / j.totalItems) * 100) : 0;
                const isOpen = j.id === expandedId;
                const disp = j.displayStatus || j.status;
                const canResume = (j.workRemaining ?? 0) > 0 || j.displayStatus === 'incomplete';
                const jRc = j.reportContext;
                const userRosterChips = (jRc?.selectedUsers || []) as { id: string; name: string }[];
                const hasUserSnapshot =
                  j.source === 'user_specific_leads' &&
                  jRc &&
                  (userRosterChips.length > 0 ||
                    Boolean((jRc.studentGroup && jRc.studentGroup.trim()) || (jRc.district && jRc.district.trim())));
                return (
                  <Fragment key={j.id}>
                    <tr
                      role="button"
                      tabIndex={0}
                      aria-expanded={isOpen}
                      className={
                        isOpen
                          ? 'bg-orange-50/90 dark:bg-orange-950/35'
                          : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }
                      onClick={() => setExpandedId((prev) => (prev === j.id ? null : j.id))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setExpandedId((prev) => (prev === j.id ? null : j.id));
                        }
                      }}
                    >
                      <td className="w-9 align-middle px-2 py-2 text-slate-500" aria-hidden>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{isOpen ? '▾' : '▸'}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
                        {j.createdAt ? new Date(j.createdAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-700 dark:text-slate-200">
                        {j.source === 'user_specific_leads' ? 'User-specific leads' : 'Send to leads'}
                      </td>
                      <td className="max-w-[10rem] truncate px-3 py-2 text-xs text-slate-600 dark:text-slate-400" title={userRosterChips.length > 0 ? userRosterChips.map(u => u.name).join(', ') : undefined}>
                        {userRosterChips.length > 0 
                          ? userRosterChips.length === 1 
                            ? userRosterChips[0].name 
                            : `${userRosterChips[0].name} +${userRosterChips.length - 1}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                        {jRc?.studentGroup || '—'}
                      </td>
                      <td className="max-w-[10rem] truncate px-3 py-2 text-xs" title={j.templateName || ''}>
                        {j.templateName || '—'}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span
                          className={
                            disp === 'incomplete'
                              ? 'text-amber-800 dark:text-amber-200'
                              : j.status === 'completed'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : j.status === 'failed'
                                  ? 'text-red-600'
                                  : 'text-amber-700 dark:text-amber-300'
                          }
                        >
                          {disp === 'incomplete' ? 'incomplete' : j.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-700 dark:text-slate-200">
                        {j.doneCount}/{j.totalItems} ({pct}%) · ✓{j.successCount} ✗{j.failCount}
                      </td>
                      <td
                        className="whitespace-nowrap px-2 py-1.5 text-right align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canResume ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="shrink-0 px-2.5 text-[10px] font-semibold"
                            disabled={resumeMutation.isPending}
                            onClick={() => resumeMutation.mutate(j.id)}
                            title="Re-run the background worker; use if the job was marked complete but is not finished"
                          >
                            {resumeMutation.isPending ? '…' : 'Resume'}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="bg-slate-50/70 dark:bg-slate-900/30">
                        <td colSpan={9} className="border-b border-slate-200 p-0 align-top dark:border-slate-800">
                          <div className="space-y-3 px-3 py-3 sm:px-4 sm:py-3.5">
                            {canResume ? (
                              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                                <span>
                                  {disp === 'incomplete' && j.status === 'completed' ? (
                                    <span>
                                      This job is still marked <span className="font-medium">completed</span> in the
                                      database but progress is below 100% ({j.doneCount}/{j.totalItems}).
                                      {(j.workRemaining ?? 0) > 0
                                        ? ` There are still ${j.workRemaining} line item(s) waiting.`
                                        : ' Use Resume: we will re-check line items, repair counters, or set the job to an explicit error if data is missing.'}
                                    </span>
                                  ) : (j.workRemaining ?? 0) > 0 ? (
                                    <span>
                                      {j.workRemaining} line item(s) still in queue. Click Resume if the worker
                                      has stalled.
                                    </span>
                                  ) : (
                                    <span>Progress and status may be inconsistent. Try Resume to repair.</span>
                                  )}
                                </span>
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  className="shrink-0 text-xs"
                                  disabled={resumeMutation.isPending}
                                  onClick={() => resumeMutation.mutate(j.id)}
                                >
                                  {resumeMutation.isPending ? 'Resuming…' : 'Resume sending'}
                                </Button>
                              </div>
                            ) : null}
                            {hasUserSnapshot ? (
                              <div className="rounded-lg border border-slate-200 bg-white/90 px-3 py-2.5 dark:border-slate-600 dark:bg-slate-900/50">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                  Roster &amp; filters (when this job was queued)
                                </p>
                                {userRosterChips.length > 0 ? (
                                  <>
                                    <p className="mt-1.5 text-xs font-medium text-slate-900 dark:text-slate-100">
                                      Selected users ({userRosterChips.length}):
                                    </p>
                                    <ul className="mt-0.5 list-inside list-disc text-xs text-slate-800 dark:text-slate-200">
                                      {userRosterChips.map((u) => (
                                        <li key={u.id}>
                                          {u.name || u.id} <span className="font-mono text-slate-500">({u.id})</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </>
                                ) : null}
                                <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-300">
                                  <span className="font-medium text-slate-800 dark:text-slate-100">Student group:</span>{' '}
                                  {jRc && jRc.studentGroup?.trim() ? jRc.studentGroup : 'All (no filter)'}
                                </p>
                                {jRc?.district?.trim() ? (
                                  <p className="text-xs text-slate-700 dark:text-slate-300">
                                    <span className="font-medium text-slate-800 dark:text-slate-100">Portfolio district:</span>{' '}
                                    {jRc.district}
                                  </p>
                                ) : null}
                              </div>
                            ) : j.source === 'user_specific_leads' ? (
                              <p className="text-xs text-slate-500 dark:text-slate-400">No audience snapshot for this job.</p>
                            ) : (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Recipients for this run were selected in the grid on the <span className="font-medium">Send to
                                leads</span> tab. The line table below lists each number and the provider response.
                              </p>
                            )}
                            {j.lastError ? (
                              <p className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                                Last error: {j.lastError}
                              </p>
                            ) : null}
                            <div>
                              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                                Line items (numbers &amp; live response)
                              </h3>
                              {jobDetailLoading && isOpen && !detailMatchesExpanded ? (
                                <Skeleton className="mt-2 h-32 w-full" />
                              ) : null}
                              {isOpen && detailMatchesExpanded && jobDetail ? (
                                <div className="mt-2 max-h-[min(50vh,28rem)] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                                  <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-800">
                                    <thead className="sticky top-0 z-[1] bg-slate-100 dark:bg-slate-800">
                                      <tr>
                                        <th className="px-2 py-1.5 text-left font-semibold">Lead</th>
                                        <th className="px-2 py-1.5 text-left font-semibold">Numbers</th>
                                        <th className="px-2 py-1.5 text-left font-semibold">Status</th>
                                        <th className="px-2 py-1.5 text-left font-semibold min-w-48">Provider response / error</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {jobDetail.items.map((it) => (
                                        <tr key={it.id} className="border-t border-slate-100 dark:border-slate-800">
                                          <td className="px-2 py-1.5 align-top text-slate-800 dark:text-slate-200">
                                            {it.leadName || '—'}
                                          </td>
                                          <td className="px-2 py-1.5 align-top font-mono text-[11px] text-slate-600">
                                            {Array.isArray(it.contactNumbers) ? it.contactNumbers.join(', ') : '—'}
                                          </td>
                                          <td className="px-2 py-1.5 align-top">{it.status}</td>
                                          <td className="px-2 py-1.5 align-top text-slate-600">
                                            {it.errorMessage ? (
                                              <span className="text-red-700 dark:text-red-300">{it.errorMessage}</span>
                                            ) : null}
                                            {it.responseText ? (
                                              <span className="line-clamp-3 break-words whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                                                {it.errorMessage ? ' ' : null}
                                                {it.responseText.replace(/<[^>]+>/g, '').slice(0, 500)}
                                              </span>
                                            ) : !it.errorMessage ? (
                                              '—'
                                            ) : null}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : isOpen && !jobDetailLoading && jobDetailError ? (
                                <p className="mt-2 text-xs text-slate-500">Could not load line items. Try again or refresh the page.</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const broadcastFilterSelectClass =
  'h-9 min-w-0 max-w-full shrink rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 sm:max-w-[11rem]';

function SendToLeadsTab({ onBulkJobQueued }: { onBulkJobQueued?: (jobId: string) => void }) {
  const { canWrite } = useModulePermission('communications');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 25;
  const [selectedById, setSelectedById] = useState<Record<string, Lead>>({});
  const [templateId, setTemplateId] = useState('');
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('sms');
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
    queryKey: ['activeTemplates', 'communications-broadcast', channel],
    queryFn: async () => {
      const response = await communicationAPI.getActiveTemplates(undefined, channel);
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
        if (Object.keys(next).length >= MAX_SMS_BULK_LEADS) {
          showToast.error(`You can select at most ${MAX_SMS_BULK_LEADS} leads per batch.`);
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
        if (count >= MAX_SMS_BULK_LEADS) {
          showToast.error(`Maximum ${MAX_SMS_BULK_LEADS} leads per batch.`);
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
      if (!tpl) throw new Error(`Select a ${channel === 'whatsapp' ? 'WhatsApp' : 'message'} template.`);
      if (rows.length > MAX_SMS_BULK_LEADS) {
        throw new Error(`At most ${MAX_SMS_BULK_LEADS} leads per job.`);
      }
      
      const payload = {
        source: 'send_to_leads' as const,
        templateId: tpl._id,
        reportContext: {
          version: 1,
          studentGroup: studentGroupFilter.trim() || null,
          district: districtFilter.trim() || null,
          selectedUsers: [],
        },
        items: rows.map((row) => ({
          leadId: row.leadId,
          leadName: row.leadName,
          contactNumbers: row.numbers,
          variables: row.variables,
        })),
      };

      if (channel === 'whatsapp') {
        return communicationAPI.createBulkWhatsAppJob(payload);
      }
      return communicationAPI.createBulkSmsJob(payload);
    },
    onSuccess: (out) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['smsBulkJobs'] });
      showToast.success(
        `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} job queued: ${out.totalItems} lead row(s) for template «${out.templateName}».`
      );
      onBulkJobQueued?.(out.jobId);
      clearSelection();
      setSmsReviewOpen(false);
      setSmsReviewRows([]);
    },
    onError: (e: Error) => {
      showToast.error(e?.message || 'Failed to queue job');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4 dark:border-slate-700 xl:flex-row xl:items-start">
        <div className="flex flex-col gap-3">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Channel
          </span>
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-700 dark:bg-slate-800">
            <button
              onClick={() => { setChannel('sms'); setTemplateId(''); }}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                channel === 'sms' ? 'bg-white text-orange-600 shadow-sm dark:bg-slate-900 dark:text-orange-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              SMS
            </button>
            <button
              onClick={() => { setChannel('whatsapp'); setTemplateId(''); }}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                channel === 'whatsapp' ? 'bg-white text-orange-600 shadow-sm dark:bg-slate-900 dark:text-orange-400' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              WhatsApp
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 xl:border-0 xl:pt-0">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {channel === 'whatsapp' ? 'WhatsApp Template' : 'SMS Template'}
          </span>
          {loadingTemplates ? (
            <Skeleton className="h-9 w-64" />
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
          {selectedCount} selected (max {MAX_SMS_BULK_LEADS} per batch; sends as a background job). Showing page{' '}
          {pagination.page} of{' '}
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
            {confirmSendMutation.isPending ? 'Queuing…' : `Queue ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} for ${selectedCount} lead(s)`}
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

function UserLeadsTab({ onBulkJobQueued }: { onBulkJobQueued?: (jobId: string) => void }) {
  const { canWrite } = useModulePermission('communications');
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [divisionFilter, setDivisionFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [studentGroupFilter, setStudentGroupFilter] = useState('');
  /** Roster: show only users with at least one assigned lead in this `leads.district`. */
  const [userRosterDistrict, setUserRosterDistrict] = useState('');
  const [roleNameFilter, setRoleNameFilter] = useState('');

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [channel, setChannel] = useState<'sms' | 'whatsapp'>('whatsapp');
  const [statusFilter, setStatusFilter] = useState('');
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

  const userRosterDistrictOptions = useMemo(() => {
    const raw = (leadFilterOptionsRes as { districts?: string[] })?.districts;
    if (Array.isArray(raw) && raw.length > 0) return [...raw].filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return [] as string[];
  }, [leadFilterOptionsRes]);

  const { callStatusOptions, visitStatusOptions, leadStatusOptions } = useMemo(() => {
    const raw = leadFilterOptionsRes as any;
    const normalize = (list: string[]) => {
      const uniqueMap = new Map<string, string>();
      (list || []).forEach((s) => {
        if (!s) return;
        const label = s
          .replace(/_/g, ' ')
          .trim()
          .split(/\s+/)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ');
        if (!uniqueMap.has(label)) {
          uniqueMap.set(label, s);
        }
      });
      return Array.from(uniqueMap.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => a.label.localeCompare(b.label));
    };

    return {
      callStatusOptions: normalize(raw?.callStatuses),
      visitStatusOptions: normalize(raw?.visitStatuses),
      leadStatusOptions: normalize(raw?.leadStatuses),
    };
  }, [leadFilterOptionsRes]);

  const { data: rosterOptionsData } = useQuery({
    queryKey: [
      'userAnalytics',
      'communications',
      'options',
      divisionFilter,
      deptFilter,
      groupFilter,
      studentGroupFilter,
      userRosterDistrict,
    ],
    queryFn: async () => {
      const resp = await leadAPI.getUserAnalytics({
        division: divisionFilter || undefined,
        department: deptFilter || undefined,
        group: groupFilter || undefined,
        studentGroup: studentGroupFilter || undefined,
        district: userRosterDistrict.trim() || undefined,
        rosterOnly: true,
      });
      return resp?.users ?? [];
    },
    staleTime: 120_000,
  });

  const { data: analyticsData, isLoading: loadingUsers } = useQuery({
    queryKey: [
      'userAnalytics',
      'communications',
      'roster',
      divisionFilter,
      deptFilter,
      groupFilter,
      studentGroupFilter,
      userRosterDistrict,
      statusFilter,
      roleNameFilter,
    ],
    queryFn: async () => {
      const isProRole = roleNameFilter.trim().toUpperCase() === 'PRO';
      const isCounsellorRole = roleNameFilter.trim().toUpperCase() === 'STUDENT COUNSELOR';

      const resp = await leadAPI.getUserAnalytics({
        division: divisionFilter || undefined,
        department: deptFilter || undefined,
        group: groupFilter || undefined,
        studentGroup: studentGroupFilter || undefined,
        district: userRosterDistrict.trim() || undefined,
        rosterOnly: true,
        ...(statusFilter.trim() ? {
          ...(isProRole ? { visitStatus: statusFilter.trim() } : 
              isCounsellorRole ? { callStatus: statusFilter.trim() } : 
              { leadStatus: statusFilter.trim() })
        } : {}),
      });
      return resp?.users ?? [];
    },
    /** Roster is heavy (HRMS + lead counts); avoid refetching on every tab focus. */
    staleTime: 90_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const rosterSource: any[] = analyticsData ?? [];
  const optionsSource: any[] = rosterOptionsData ?? [];

  const roleNameOptions = useMemo(() => {
    const set = new Set<string>();
    optionsSource.forEach((u: any) => {
      const r = String(u.roleName ?? u.role_name ?? '').trim();
      if (r) set.add(r);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [optionsSource]);

  const users: any[] = useMemo(() => {
    let list = rosterSource;
    if (roleNameFilter.trim()) {
      const r = roleNameFilter.trim();
      list = list.filter(
        (u: any) => String(u.roleName ?? u.role_name ?? '').trim() === r
      );
    }
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase();
      list = list.filter(
        (u: any) =>
          u.userName?.toLowerCase().includes(s) ||
          u.name?.toLowerCase().includes(s) ||
          u.designation?.toLowerCase().includes(s) ||
          u.department?.toLowerCase().includes(s) ||
          String(u.roleName ?? u.role_name ?? '')
            .toLowerCase()
            .includes(s)
      );
    }
    return list;
  }, [rosterSource, debouncedSearch, roleNameFilter]);

  /** Sum of `totalAssigned` for the current table rows (roster + district/team filters from API; search/role in UI). */
  const cumulativePortfolioLeads = useMemo(
    () => users.reduce((sum, u) => sum + (Number(u.totalAssigned) || 0), 0),
    [users]
  );

  const { divisionOptions, deptOptions, groupOptions } = useMemo(() => {
    const divs = new Set<string>();
    const depts = new Set<string>();
    const groups = new Set<string>();
    optionsSource.forEach((u: any) => {
      if (u.division && u.division !== '-') divs.add(u.division);
      if (u.department && u.department !== '-') depts.add(u.department);
      if (u.group && u.group !== '-') groups.add(u.group);
    });
    return {
      divisionOptions: Array.from(divs).sort(),
      deptOptions: Array.from(depts).sort(),
      groupOptions: Array.from(groups).sort(),
    };
  }, [optionsSource]);

  // Fetch a sample lead for preview when users are selected
  const { data: previewLead } = useQuery({
    queryKey: ['userLeadPreview', selectedUserIds[0], studentGroupFilter, userRosterDistrict],
    queryFn: async () => {
      if (selectedUserIds.length === 0) return null;
      const resp = await leadAPI.getAll({ 
        assignedTo: selectedUserIds[0], 
        limit: 1,
        ...(studentGroupFilter.trim() ? { studentGroup: studentGroupFilter.trim() } : {}),
        ...(userRosterDistrict.trim() ? { district: userRosterDistrict.trim() } : {}),
      });
      return resp?.leads?.[0] || null;
    },
    enabled: selectedUserIds.length > 0,
  });

  const { data: templatesData, isLoading: loadingTemplates } = useQuery({
    queryKey: ['activeTemplates', 'communications-user-bulk', channel],
    queryFn: async () => {
      const response = await communicationAPI.getActiveTemplates(undefined, channel);
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
  const [smsReviewStatusBreakdown, setSmsReviewStatusBreakdown] = useState<Record<string, number>>({});
  const [smsReviewInvalidCount, setSmsReviewInvalidCount] = useState(0);
  const [isPreparingSmsReview, setIsPreparingSmsReview] = useState(false);
  const smsPrepareGenRef = useRef(0);

  const confirmSendMutation = useMutation({
    mutationFn: async (rows: SmsReviewRow[]) => {
      const tpl = selectedTemplate;
      if (!tpl) throw new Error('Select a template.');
      if (rows.length > MAX_SMS_BULK_LEADS) {
        throw new Error(`At most ${MAX_SMS_BULK_LEADS} leads per job.`);
      }
      const reportContext: SmsBulkJobReportContext = {
        version: 1,
        studentGroup: studentGroupFilter.trim() || null,
        district: userRosterDistrict.trim() || null,
        selectedUsers: selectedUserIds.map((id) => {
          const u = rosterSource.find((x: { id?: string; userId?: string; name?: string; userName?: string }) => {
            const rowId = String(x.id ?? x.userId ?? '');
            return rowId === id;
          });
          return {
            id,
            name: (u?.name || u?.userName || 'User').trim() || id,
          };
        }),
      };

      if (channel === 'whatsapp') {
        return communicationAPI.createBulkWhatsAppJob({
          source: 'user_specific_leads',
          templateId: tpl._id,
          reportContext,
          items: rows.map((row) => ({
            leadId: row.leadId,
            leadName: row.leadName,
            contactNumbers: row.numbers,
            variables: row.variables,
          })),
        });
      }

      return communicationAPI.createBulkSmsJob({
        source: 'user_specific_leads',
        templateId: tpl._id,
        reportContext,
        items: rows.map((row) => ({
          leadId: row.leadId,
          leadName: row.leadName,
          contactNumbers: row.numbers,
          variables: row.variables,
        })),
      });
    },
    onSuccess: (out) => {
      showToast.success(
        `${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} job queued: ${out.totalItems} lead row(s) for «${out.templateName}». Open job reports to watch live.`
      );
      onBulkJobQueued?.(out.jobId);
      setSelectedUserIds([]);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['smsBulkJobs'] });
      setSmsReviewOpen(false);
      setSmsReviewRows([]);
    },
    onError: (e: Error) => showToast.error(e?.message || 'Failed to queue job'),
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
    setSmsReviewStatusBreakdown({});
    try {
      const allLeads: Lead[] = [];
      const pageSize = 500;
      const isProRole = roleNameFilter.trim().toUpperCase() === 'PRO';
      const isCounsellorRole = roleNameFilter.trim().toUpperCase() === 'STUDENT COUNSELOR';

      for (const uid of selectedUserIds) {
        let page = 1;
        for (;;) {
          const resp = await leadAPI.getAll({
            assignedTo: uid,
            limit: pageSize,
            page,
            ...(studentGroupFilter.trim() ? { studentGroup: studentGroupFilter.trim() } : {}),
            ...(userRosterDistrict.trim() ? { district: userRosterDistrict.trim() } : {}),
            ...(statusFilter.trim() ? {
              ...(isProRole ? { visitStatus: statusFilter.trim() } : 
                  isCounsellorRole ? { callStatus: statusFilter.trim() } : 
                  { leadStatus: statusFilter.trim() })
            } : {}),
          });
          const batch = resp?.leads || [];
          if (batch.length === 0) break;
          allLeads.push(...batch);
          if (allLeads.length >= MAX_SMS_BULK_LEADS) break;
          if (batch.length < pageSize) break;
          page += 1;
        }
        if (allLeads.length >= MAX_SMS_BULK_LEADS) break;
      }
      if (gen !== smsPrepareGenRef.current) return;
      if (allLeads.length === 0) {
        showToast.error('No leads found for the selected users (check student group or district filter if applied).');
        setSmsReviewOpen(false);
        return;
      }
      const targetLeads = allLeads.filter(leadHasRecipient).slice(0, MAX_SMS_BULK_LEADS);
      
      // Calculate status breakdown of leads that actually have valid recipients
      const breakdown: Record<string, number> = {};
      const validLeads = allLeads.filter(leadHasRecipient);

      // Determine effective role for status labels (prefer roleNameFilter, then first selected user's role)
      const firstSelectedUser = selectedUserIds.length > 0 
        ? users.find(u => String(u.id ?? u.userId ?? '') === selectedUserIds[0])
        : null;
      const effectiveRole = (roleNameFilter || firstSelectedUser?.roleName || '').trim().toUpperCase();
      const isPro = effectiveRole === 'PRO';
      const isCounsellor = effectiveRole === 'STUDENT COUNSELOR';

      validLeads.forEach(l => {
        let s = '';
        if (isPro) {
          s = String(l.visitStatus || '').trim() || 'Not set';
        } else if (isCounsellor) {
          s = String(l.callStatus || '').trim() || 'Not set';
        } else {
          s = String(l.leadStatus || '').trim() || 'New';
        }
        breakdown[s] = (breakdown[s] || 0) + 1;
      });
      setSmsReviewStatusBreakdown(breakdown);
      setSmsReviewInvalidCount(allLeads.length - validLeads.length);

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
    roleNameFilter,
    studentGroupFilter,
    users,
    statusFilter,
    users,
    userRosterDistrict,
  ]);

  const closeSmsReview = useCallback(() => {
    if (confirmSendMutation.isPending) return;
    smsPrepareGenRef.current += 1;
    setIsPreparingSmsReview(false);
    setSmsReviewOpen(false);
    setSmsReviewRows([]);
    setSmsReviewStatusBreakdown({});
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
            <label className="flex min-w-[8rem] flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
              User role
              <select
                className={filterSelectClass}
                value={roleNameFilter}
                onChange={(e) => {
                  setRoleNameFilter(e.target.value);
                  setStatusFilter('');
                }}
              >
                <option value="">All roles</option>
                {roleNameOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            {roleNameFilter && (
              <label className="flex min-w-[8rem] flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                {roleNameFilter.trim().toUpperCase() === 'PRO' ? 'Visit Status' : 
                 roleNameFilter.trim().toUpperCase() === 'STUDENT COUNSELOR' ? 'Call Status' : 'Lead Status'}
                <select
                  className={filterSelectClass}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="">All Statuses</option>
                  {(roleNameFilter.trim().toUpperCase() === 'PRO' ? visitStatusOptions : 
                    roleNameFilter.trim().toUpperCase() === 'STUDENT COUNSELOR' ? callStatusOptions : 
                    leadStatusOptions).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3 dark:border-slate-800 xl:border-0 xl:pt-0 xl:pl-4">
            <div className="flex flex-col gap-1.5 mr-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Category
              </span>
              <div className="flex h-9 items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => { setChannel('whatsapp'); setTemplateId(''); }}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                    channel === 'whatsapp'
                      ? 'bg-white text-orange-600 shadow-sm dark:bg-slate-700 dark:text-orange-400'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  onClick={() => { setChannel('sms'); setTemplateId(''); }}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-all ${
                    channel === 'sms'
                      ? 'bg-white text-orange-600 shadow-sm dark:bg-slate-700 dark:text-orange-400'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  SMS
                </button>
              </div>
            </div>
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
                {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} to
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
          <div className="flex flex-1 min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
            <div className="min-w-0 flex-1">
              <label className="text-sm font-medium">Search users</label>
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, designation, department, or role…"
              />
            </div>
            <label className="flex w-full min-w-[10rem] max-w-sm shrink-0 flex-col gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 sm:max-w-[14rem]">
              District
              <select
                className={filterSelectClass + ' w-full max-w-none'}
                value={userRosterDistrict}
                onChange={(e) => setUserRosterDistrict(e.target.value)}
                title="Show only users who have at least one assigned lead in this district (portfolio + optional student group match)."
              >
                <option value="">All districts</option>
                {userRosterDistrictOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-end justify-end gap-2">
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
                <th className="px-3 py-2 text-left min-w-[8rem]">Role</th>
                <th className="max-w-[14rem] px-3 py-2 text-left">Student groups (leads)</th>
                <th className="px-3 py-2 text-left text-orange-600">Portfolio leads</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-white">
              {loadingUsers ? (
                <tr><td colSpan={6} className="p-4 text-center"><TemplatesSkeleton /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-slate-500">No users found.</td></tr>
              ) : (
                users.map((u, idx) => {
                  const rowId = String(u.id ?? u.userId ?? '');
                  const isChecked = selectedUserIds.includes(rowId);
                  const roleLabel = String(u.roleName ?? u.role_name ?? '').trim() || '—';
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
                      <td className="px-3 py-2 text-sm text-slate-800 dark:text-slate-200">
                        {roleLabel}
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
            {!loadingUsers && users.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50/90 font-semibold dark:border-slate-600 dark:bg-slate-800/50">
                  <td colSpan={5} className="px-3 py-2.5 text-right text-slate-700 dark:text-slate-200">
                    Cumulative (filters applied) · {users.length} user{users.length === 1 ? '' : 's'}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums text-orange-700 dark:text-orange-300">
                    {cumulativePortfolioLeads.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            ) : null}
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
                ? 'Queuing…'
                : `Queue SMS for leads of ${selectedUserIds.length} user(s)`}
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
        statusBreakdown={smsReviewStatusBreakdown}
        invalidCount={smsReviewInvalidCount}
        subtitle={`Edit variables per lead, then queue a background job (up to ${MAX_SMS_BULK_LEADS} SMS).`}
      />
    </div>
  );
}

type CommunicationsTab = 'templates' | 'send' | 'user-leads' | 'sms-reports';

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
  const [highlightSmsJobId, setHighlightSmsJobId] = useState<string | null>(null);
  const [templateGroupFilter, setTemplateGroupFilter] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<'sms' | 'whatsapp'>('sms');
  const [newGroupModalOpen, setNewGroupModalOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string } | null>(null);

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
    queryKey: ['communicationTemplates', languageFilter, showInactive, search, templateGroupFilter, categoryFilter],
    queryFn: async () => {
      const response = await communicationAPI.getTemplates({
        language: languageFilter === 'all' ? undefined : languageFilter,
        isActive: showInactive ? undefined : true,
        search: search.trim() || undefined,
        templateGroupId: templateGroupFilter || undefined,
        category: categoryFilter,
      });
      return response?.data ?? [];
    },
    enabled: isMounted && Boolean(user),
  });

  const {
    data: templateGroupsList = [],
    isFetching: templateGroupsFetching,
  } = useQuery({
    queryKey: ['templateGroups'],
    queryFn: () => communicationAPI.listTemplateGroups(),
    enabled: isMounted && Boolean(user) && activeTab === 'templates',
    staleTime: 60_000,
  });

  const {
    data: bulkSmsAccount,
    isLoading: bulkSmsAccountLoading,
    error: bulkSmsAccountError,
  } = useQuery({
    queryKey: ['bulkSmsAccountStatus'],
    queryFn: () => communicationAPI.getBulkSmsAccountStatus(),
    enabled: isMounted && Boolean(user) && activeTab === 'templates',
    staleTime: 90_000,
    retry: 1,
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
        templateGroupId: payload.templateGroupId.trim() || null,
        category: payload.category,
        headerHandle: payload.headerHandle,
        headerText: payload.headerText,
        mediaGallery: payload.mediaGallery,
      }),
    onSuccess: () => {
      showToast.success('Template created successfully');
      queryClient.invalidateQueries({ queryKey: ['communicationTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['activeTemplates'] });
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
        templateGroupId: payload.templateGroupId.trim() || null,
        category: payload.category,
        headerHandle: payload.headerHandle,
        headerText: payload.headerText,
        mediaGallery: payload.mediaGallery,
      }),
    onSuccess: () => {
      showToast.success('Template updated successfully');
      queryClient.invalidateQueries({ queryKey: ['communicationTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['activeTemplates'] });
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
      queryClient.invalidateQueries({ queryKey: ['activeTemplates'] });
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
      queryClient.invalidateQueries({ queryKey: ['activeTemplates'] });
    },
    onError: (error: any) => {
      console.error('Error hard deleting template:', error);
      showToast.error(error.response?.data?.message || 'Failed to permanently delete template');
    },
  });

  const createGroupMutation = useMutation({
    mutationFn: (name: string) => communicationAPI.createTemplateGroup({ name }),
    onSuccess: () => {
      showToast.success('Template group created');
      queryClient.invalidateQueries({ queryKey: ['templateGroups'] });
      setNewGroupName('');
    },
    onError: (error: any) => {
      console.error('Error creating template group:', error);
      showToast.error(error.response?.data?.message || 'Failed to create group');
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      communicationAPI.updateTemplateGroup(id, { name }),
    onSuccess: () => {
      showToast.success('Group updated');
      queryClient.invalidateQueries({ queryKey: ['templateGroups'] });
      queryClient.invalidateQueries({ queryKey: ['communicationTemplates'] });
      setEditingGroup(null);
    },
    onError: (error: any) => {
      console.error('Error updating template group:', error);
      showToast.error(error.response?.data?.message || 'Failed to update group');
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => communicationAPI.deleteTemplateGroup(id),
    onSuccess: (_data, deletedId) => {
      showToast.success('Group deleted');
      queryClient.invalidateQueries({ queryKey: ['templateGroups'] });
      queryClient.invalidateQueries({ queryKey: ['communicationTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['activeTemplates'] });
      setTemplateGroupFilter((current) => (current === deletedId ? '' : current));
      setEditingGroup((prev) => (prev?.id === deletedId ? null : prev));
    },
    onError: (error: any) => {
      console.error('Error deleting template group:', error);
      showToast.error(error.response?.data?.message || 'Failed to delete group');
    },
  });

  const groupModalBusy =
    createGroupMutation.isPending ||
    updateGroupMutation.isPending ||
    deleteGroupMutation.isPending;

  const closeGroupModal = () => {
    if (groupModalBusy) return;
    setNewGroupModalOpen(false);
    setNewGroupName('');
    setEditingGroup(null);
  };

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

  const syncWhatsAppMutation = useMutation({
    mutationFn: () => communicationAPI.syncWhatsAppTemplates(),
    onSuccess: (res) => {
      showToast.success(`Synced ${res.data.syncCount} templates from WhatsApp`);
      queryClient.invalidateQueries({ queryKey: ['communicationTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['activeTemplates'] });
    },
    onError: (error: any) => {
      console.error('WhatsApp Sync Error:', error);
      showToast.error(error.response?.data?.message || 'Failed to sync WhatsApp templates');
    },
  });

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
          <button
            type="button"
            onClick={() => setActiveTab('sms-reports')}
            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3 sm:text-sm ${
              activeTab === 'sms-reports'
                ? 'bg-white text-[#c2410c] shadow-sm dark:bg-slate-900 dark:text-[#fb923c]'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            SMS job reports
          </button>
        </nav>
      </header>

      {activeTab === 'send' && (
        <SendToLeadsTab
          onBulkJobQueued={(id) => {
            setHighlightSmsJobId(id);
            setActiveTab('sms-reports');
          }}
        />
      )}

      {activeTab === 'user-leads' && (
        <UserLeadsTab
          onBulkJobQueued={(id) => {
            setHighlightSmsJobId(id);
            setActiveTab('sms-reports');
          }}
        />
      )}

      {activeTab === 'sms-reports' && (
        <SmsBulkReportsTab
          highlightJobId={highlightSmsJobId}
          onClearHighlight={() => setHighlightSmsJobId(null)}
        />
      )}

      {activeTab === 'templates' ? (
        <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-6">
          <div className="min-w-0 shrink-0">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {categoryFilter === 'whatsapp' ? 'WhatsApp Templates' : 'Message Templates'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {categoryFilter === 'whatsapp' 
                ? 'Approved WhatsApp Cloud API templates.' 
                : 'DLT-approved templates for SMS.'}
            </p>
          </div>
          {categoryFilter === 'sms' && (
            <div
              className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-2 border-t border-slate-200 pt-2 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400 md:border-t-0 md:pt-0"
              aria-label="Bulk SMS account"
            >
              <span className="shrink-0 font-semibold text-slate-700 dark:text-slate-200">BulkSMS</span>
              {bulkSmsAccountLoading ? (
                <Skeleton className="h-8 w-44 sm:h-9" />
              ) : bulkSmsAccountError ? (
                <span className="text-sm text-red-600 dark:text-red-400">Could not load balance.</span>
              ) : (
                <>
                  {bulkSmsAccount?.username ? (
                    <span className="flex flex-wrap items-baseline gap-x-1.5">
                      <span className="shrink-0">User</span>
                      <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
                        {bulkSmsAccount.username}
                      </span>
                    </span>
                  ) : null}
                  {bulkSmsAccount?.username && bulkSmsAccount?.senderId ? (
                    <span className="text-slate-300 dark:text-slate-600" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  {bulkSmsAccount?.senderId ? (
                    <span className="flex flex-wrap items-baseline gap-x-1.5">
                      <span className="shrink-0">Sender</span>
                      <span className="font-mono text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl">
                        {bulkSmsAccount.senderId}
                      </span>
                    </span>
                  ) : null}
                  {!bulkSmsAccount?.configured ? (
                    <span className="text-sm text-amber-800 dark:text-amber-400">
                      {bulkSmsAccount?.providerMessage || 'API key not configured.'}
                    </span>
                  ) : bulkSmsAccount?.providerMessage ? (
                    <span
                      className="max-w-[min(100%,18rem)] truncate text-sm text-amber-800 dark:text-amber-400 sm:max-w-md"
                      title={bulkSmsAccount.providerMessage}
                    >
                      {bulkSmsAccount.providerMessage}
                    </span>
                  ) : typeof bulkSmsAccount?.balanceCredits === 'number' && Number.isFinite(bulkSmsAccount.balanceCredits) ? (
                    <span
                      className="flex flex-wrap items-baseline gap-x-1.5"
                      title={bulkSmsAccount.balanceRaw || undefined}
                    >
                      <span className="shrink-0">Credits</span>
                      <span
                        className={`text-xl font-bold tabular-nums tracking-tight sm:text-2xl ${
                          bulkSmsAccount.balanceCredits < 20000
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {bulkSmsAccount.balanceCredits.toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm text-slate-500" title={bulkSmsAccount?.balanceRaw || undefined}>
                      Credits — {bulkSmsAccount?.balanceRaw ? `(${bulkSmsAccount.balanceRaw.slice(0, 60)}${bulkSmsAccount.balanceRaw.length > 60 ? '…' : ''})` : ''}
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 self-start sm:self-auto">
          {categoryFilter === 'whatsapp' && (
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => syncWhatsAppMutation.mutate()}
              disabled={syncWhatsAppMutation.isPending}
            >
              {syncWhatsAppMutation.isPending ? 'Syncing…' : '↻ Sync from WhatsApp'}
            </Button>
          )}
          {categoryFilter === 'sms' && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setNewGroupModalOpen(true)}>
                + New group
              </Button>
              <Button variant="primary" size="sm" onClick={handleAddTemplate}>
                + New template
              </Button>
            </>
          )}
        </div>
      </div>
      {!bulkSmsAccountLoading &&
        bulkSmsAccount?.configured &&
        !bulkSmsAccount?.username &&
        !bulkSmsAccountError && (
          <p className="text-xs leading-snug text-slate-500 dark:text-slate-400">
            Set <code className="rounded bg-slate-100 px-1 font-mono text-[11px] dark:bg-slate-800">BULK_SMS_ACCOUNT_USERNAME</code>{' '}
            on the server to show the portal user name.
          </p>
        )}

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        <button
          onClick={() => setCategoryFilter('sms')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            categoryFilter === 'sms'
              ? 'border-orange-500 text-orange-600 dark:text-orange-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          Normal Templates (SMS)
        </button>
        <button
          onClick={() => setCategoryFilter('whatsapp')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
            categoryFilter === 'whatsapp'
              ? 'border-orange-500 text-orange-600 dark:text-orange-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
          }`}
        >
          WhatsApp Templates
        </button>
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
          <div className="w-full min-w-0 sm:w-44">
            <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Group
            </label>
            <select
              className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={templateGroupFilter}
              onChange={(e) => setTemplateGroupFilter(e.target.value)}
            >
              <option value="">All groups</option>
              {templateGroupsList.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
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
                <th className="hidden px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:table-cell dark:text-slate-400">
                  Group
                </th>
                {categoryFilter === 'sms' && (
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    DLT ID
                  </th>
                )}
                {categoryFilter === 'whatsapp' && (
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Header/Media
                  </th>
                )}
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
                  <td colSpan={8} className="px-3 py-4">
                    <TemplatesSkeleton />
                  </td>
                </tr>
              ) : templates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-xs text-slate-500">
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
                    <td className="hidden max-w-[10rem] px-3 py-2 align-top text-xs text-slate-600 sm:table-cell dark:text-slate-300">
                      <span className="line-clamp-2" title={template.templateGroupName || undefined}>
                        {template.templateGroupName || '—'}
                      </span>
                    </td>
                    {categoryFilter === 'sms' && (
                      <td className="max-w-[9rem] px-3 py-2 align-top font-mono text-xs text-orange-700 dark:text-orange-400">
                        <span className="block truncate" title={template.dltTemplateId}>
                          {template.dltTemplateId}
                        </span>
                      </td>
                    )}
                    {categoryFilter === 'whatsapp' && (
                      <td className="px-3 py-2 align-top text-xs text-slate-600 dark:text-slate-300">
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1 whitespace-nowrap font-medium">
                            {template.headerType === 'TEXT' ? '📝 Text' : 
                             template.headerType === 'IMAGE' ? '🖼️ Image' :
                             template.headerType === 'VIDEO' ? '🎥 Video' :
                             template.headerType === 'DOCUMENT' ? '📄 Doc' : '—'}
                          </span>
                          {template.headerText && (
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1" title={template.headerText}>
                              {template.headerType === 'DOCUMENT' ? template.headerText : 
                               template.headerType === 'TEXT' ? template.headerText : ''}
                            </span>
                          )}
                        </div>
                      </td>
                    )}
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
          key={modalMode === 'edit' ? editingTemplate?._id ?? 'edit' : 'create'}
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
          templateGroups={templateGroupsList}
          defaultCategory={categoryFilter}
        />
      )}

      {newGroupModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-groups-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeGroupModal();
          }}
        >
          <Card className="flex max-h-[85vh] w-full max-w-lg flex-col gap-4 p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3
                  id="template-groups-modal-title"
                  className="text-lg font-semibold text-slate-900 dark:text-slate-50"
                >
                  Template groups
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Manage groups for filtering templates. Deleting a group unlinks templates from it (they stay
                  active).
                </p>
              </div>
              <button
                type="button"
                onClick={closeGroupModal}
                disabled={groupModalBusy}
                className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <span>Existing groups</span>
                {templateGroupsFetching && !groupModalBusy ? (
                  <span className="font-normal normal-case text-slate-400">Refreshing…</span>
                ) : null}
              </div>
              <div className="max-h-[min(40vh,16rem)] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/40">
                {templateGroupsList.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
                    No groups yet. Add one below.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                    {templateGroupsList.map((g) => {
                      const isEditing = editingGroup?.id === g.id;
                      return (
                        <li key={g.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
                          {isEditing ? (
                            <>
                              <Input
                                value={editingGroup.name}
                                onChange={(e) =>
                                  setEditingGroup((prev) =>
                                    prev && prev.id === g.id ? { ...prev, name: e.target.value } : prev
                                  )
                                }
                                className="h-9 min-w-0 flex-1 text-sm"
                                autoFocus
                                disabled={updateGroupMutation.isPending}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') setEditingGroup(null);
                                  if (
                                    e.key === 'Enter' &&
                                    editingGroup?.name.trim() &&
                                    !updateGroupMutation.isPending
                                  ) {
                                    updateGroupMutation.mutate({
                                      id: g.id,
                                      name: editingGroup.name.trim(),
                                    });
                                  }
                                }}
                              />
                              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={updateGroupMutation.isPending}
                                  onClick={() => setEditingGroup(null)}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  disabled={
                                    !editingGroup?.name.trim() ||
                                    updateGroupMutation.isPending ||
                                    editingGroup.name.trim() === g.name
                                  }
                                  onClick={() =>
                                    updateGroupMutation.mutate({
                                      id: g.id,
                                      name: editingGroup!.name.trim(),
                                    })
                                  }
                                >
                                  {updateGroupMutation.isPending ? 'Saving…' : 'Save'}
                                </Button>
                              </div>
                            </>
                          ) : (
                            <>
                              <span
                                className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100"
                                title={g.name}
                              >
                                {g.name}
                              </span>
                              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={groupModalBusy || Boolean(editingGroup)}
                                  onClick={() => setEditingGroup({ id: g.id, name: g.name })}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                                  disabled={groupModalBusy || Boolean(editingGroup)}
                                  onClick={() => {
                                    if (
                                      typeof window !== 'undefined' &&
                                      !window.confirm(
                                        `Delete group "${g.name}"? Templates in this group will become ungrouped.`
                                      )
                                    ) {
                                      return;
                                    }
                                    deleteGroupMutation.mutate(g.id);
                                  }}
                                >
                                  Delete
                                </Button>
                              </div>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Add new group
              </label>
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Admissions 2026"
                className="h-10"
                disabled={groupModalBusy || Boolean(editingGroup)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newGroupName.trim() && !createGroupMutation.isPending) {
                    createGroupMutation.mutate(newGroupName.trim());
                  }
                }}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" size="sm" disabled={groupModalBusy} onClick={closeGroupModal}>
                Close
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!newGroupName.trim() || createGroupMutation.isPending || Boolean(editingGroup)}
                onClick={() => createGroupMutation.mutate(newGroupName.trim())}
              >
                {createGroupMutation.isPending ? 'Creating…' : 'Create group'}
              </Button>
            </div>
          </Card>
        </div>
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

