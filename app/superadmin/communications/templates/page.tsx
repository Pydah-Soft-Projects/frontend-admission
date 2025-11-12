'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { auth } from '@/lib/auth';
import { communicationAPI } from '@/lib/api';
import { MessageTemplate, MessageTemplateVariable } from '@/types';
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
              {mode === 'create' ? 'Create Template' : 'Edit Template'}
            </h2>
            <p className="text-sm text-gray-500">
              Configure template details and map placeholders to friendly labels.
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
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isProcessing}>
            {isProcessing ? 'Saving…' : mode === 'create' ? 'Create Template' : 'Save Changes'}
          </Button>
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
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Message Templates</h1>
          <p className="text-gray-600">
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
                  <tr key={template._id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 dark:text-slate-100">
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
                    <td className="px-4 py-3 text-right space-x-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEditTemplate(template)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => deleteMutation.mutate(template._id)}
                        disabled={!template.isActive || deleteMutation.isPending}
                      >
                        {deleteMutation.isPending ? 'Processing…' : 'Deactivate'}
                      </Button>
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
    </div>
  );
}

