'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { communicationAPI, leadAPI } from '@/lib/api';
import { showToast } from '@/lib/toast';
import type { Lead, MessageTemplate } from '@/types';
import { Button } from '@/components/ui/Button';
import { JOINING_ONLINE_ADMISSION_TEMPLATE_NAME } from '@/lib/joiningAdmissionSms';
import { extractJoiningPublicPathToken } from '@/lib/joiningInviteLink';

export type AdmissionPublicLinkPrefill = {
  url: string;
  expiresAt?: string;
  /** Opaque token (query `t` value); omit to derive from `url` or API. */
  pathToken?: string;
};

function templateVariableKeys(template: MessageTemplate): string[] {
  if (template.variables && template.variables.length > 0) {
    return template.variables.map((v, i) => v.key || `var${i + 1}`);
  }
  return Array.from({ length: template.variableCount }, (_, i) => `var${i + 1}`);
}

/** Pick a placeholder to hold the full public joining URL (non–admission-SMS flows). */
function pickLinkVariableKey(template: MessageTemplate): string | null {
  const keys = templateVariableKeys(template);
  if (keys.length === 0) return null;
  const scored = keys.map((k) => ({
    k,
    score: /link|url|join|form|admit|website|online/i.test(k) ? 1 : 0,
  }));
  const best = scored.sort((a, b) => b.score - a.score)[0];
  if (best.score > 0) return best.k;
  if (keys.length === 1) return keys[0];
  return keys[0];
}

type LinkPrefillCtx = { fullUrl: string; pathToken: string };

/**
 * Prefills template variables from a minted joining link.
 * - `joiningOnlineAdmissionMode`: first variable defaults to **pathToken only** (fixed base URL lives in template text).
 *   If multiple variables exist, keys matching link/url/href get full URL; keys matching token/code/slug get pathToken.
 * - Otherwise: one “best” variable gets the full URL (legacy draft SMS).
 */
function prefillJoiningLinkTemplateVariables(
  base: Record<string, string>,
  template: MessageTemplate,
  ctx: LinkPrefillCtx,
  joiningOnlineAdmissionMode: boolean
): Record<string, string> {
  if (!ctx.fullUrl) return base;
  const keys = templateVariableKeys(template);
  if (keys.length === 0) return base;
  const out = { ...base };

  if (joiningOnlineAdmissionMode) {
    const segment = (ctx.pathToken || extractJoiningPublicPathToken(ctx.fullUrl, null)).trim();
    if (keys.length === 1) {
      out[keys[0]] = segment || ctx.fullUrl;
      return out;
    }
    for (const k of keys) {
      const kl = k.toLowerCase();
      const isFullUrlVar =
        /^(link|url|full_?url|href|website|weblink)$/.test(kl) ||
        (/\b(link|url|href|website)\b/.test(kl) && !/\btoken\b/.test(kl));
      const isTokenVar =
        /^(token|code|slug|invite|secret|key)$/.test(kl) ||
        /\b(path_?token|suffix|fragment)\b/.test(kl) ||
        (/\b(token|invite|slug|code)\b/.test(kl) && !/\b(link|url|href)\b/.test(kl));
      if (isFullUrlVar) out[k] = ctx.fullUrl;
      else if (isTokenVar) out[k] = segment;
    }
    return out;
  }

  const pick = pickLinkVariableKey(template);
  if (pick) out[pick] = ctx.fullUrl;
  return out;
}

type Props = {
  open: boolean;
  leadId: string | null | undefined;
  onClose: () => void;
  /** When set (e.g. after POST /joinings/:id/public-edit-link), matching template placeholders are prefilled with this URL. */
  admissionPublicLink?: AdmissionPublicLinkPrefill | null;
  /** Joining desk / confirmed leads: only the system template JOINING_ONLINE_ADMISSION_TEMPLATE_NAME is shown and pre-selected. */
  joiningOnlineAdmissionMode?: boolean;
};

type SmsDataState = {
  selectedNumbers: string[];
  selectedTemplates: Record<string, { template: MessageTemplate; variables: Record<string, string> }>;
  languageFilter: string;
};

const sanitizeDigits = (n: string) => String(n || '').replace(/\D/g, '');

export function JoiningDraftSmsModal({
  open,
  leadId,
  onClose,
  admissionPublicLink,
  joiningOnlineAdmissionMode = false,
}: Props) {
  const queryClient = useQueryClient();
  const [smsData, setSmsData] = useState<SmsDataState>({
    selectedNumbers: [],
    selectedTemplates: {},
    languageFilter: 'all',
  });

  useEffect(() => {
    if (!open) {
      setSmsData({ selectedNumbers: [], selectedTemplates: {}, languageFilter: 'all' });
    }
  }, [open]);

  const { data: lead, isLoading: leadLoading } = useQuery({
    queryKey: ['joining-draft-sms-lead', leadId],
    queryFn: async () => (await leadAPI.getById(leadId as string)) as Lead,
    enabled: open && !!leadId && String(leadId).length === 36,
  });

  const { data: templatesData, isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['joining-draft-sms-templates', smsData.languageFilter],
    queryFn: async () => {
      const response = await communicationAPI.getActiveTemplates(
        smsData.languageFilter !== 'all' ? smsData.languageFilter : undefined
      );
      return response.data || response;
    },
    enabled: open,
  });

  const templates: MessageTemplate[] = Array.isArray(templatesData)
    ? templatesData
    : (templatesData as { data?: MessageTemplate[] })?.data || [];

  const contactOptions = useMemo(() => {
    if (!lead) return [];
    const options: { label: string; number: string }[] = [];
    if (lead.phone) options.push({ label: 'Primary Phone', number: lead.phone });
    if (lead.fatherPhone) options.push({ label: 'Father Phone', number: lead.fatherPhone });
    return options;
  }, [lead]);

  const availableLanguages = useMemo(() => {
    const languages = new Set<string>();
    templates.forEach((template) => {
      if (template.language) languages.add(template.language);
    });
    return Array.from(languages);
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    if (joiningOnlineAdmissionMode) {
      return templates.filter((t) => t.name === JOINING_ONLINE_ADMISSION_TEMPLATE_NAME);
    }
    if (smsData.languageFilter === 'all') return templates;
    return templates.filter((t) => t.language === smsData.languageFilter);
  }, [templates, smsData.languageFilter, joiningOnlineAdmissionMode]);

  const systemJoiningTemplate = useMemo(
    () => templates.find((t) => t.name === JOINING_ONLINE_ADMISSION_TEMPLATE_NAME),
    [templates]
  );

  const linkPrefillCtx = useMemo((): LinkPrefillCtx | null => {
    const url = admissionPublicLink?.url?.trim() || '';
    if (!url) return null;
    const pathToken =
      admissionPublicLink?.pathToken?.trim() || extractJoiningPublicPathToken(url, null) || '';
    return { fullUrl: url, pathToken };
  }, [admissionPublicLink?.url, admissionPublicLink?.pathToken]);

  const buildDefaultTemplateValues = useCallback(
    (template: MessageTemplate, linkUrlOverride?: string | null) => {
      const values: Record<string, string> = {};
      if (template.variables && template.variables.length > 0) {
        template.variables.forEach((variable, index) => {
          const key = variable.key || `var${index + 1}`;
          values[key] = (variable.defaultValue || '').trim();
        });
      } else if (template.variableCount > 0) {
        for (let i = 0; i < template.variableCount; i++) {
          values[`var${i + 1}`] = '';
        }
      }
      const ctx = linkUrlOverride?.trim()
        ? {
            fullUrl: linkUrlOverride.trim(),
            pathToken: extractJoiningPublicPathToken(linkUrlOverride.trim(), null) || linkUrlOverride.trim(),
          }
        : linkPrefillCtx;
      if (!ctx) return values;
      return prefillJoiningLinkTemplateVariables(values, template, ctx, joiningOnlineAdmissionMode);
    },
    [linkPrefillCtx, joiningOnlineAdmissionMode]
  );

  const renderTemplatePreview = useCallback((template: MessageTemplate, values: Record<string, string>) => {
    const keys =
      template.variables && template.variables.length > 0
        ? template.variables.map((v, i) => v.key || `var${i + 1}`)
        : Array.from({ length: template.variableCount }).map((_, i) => `var${i + 1}`);

    let pointer = 0;
    return template.content.replace(/\{#var#\}/gi, () => {
      const key = keys[pointer] || `var${pointer + 1}`;
      pointer += 1;
      return values[key] || '';
    });
  }, []);

  useEffect(() => {
    if (!open || !lead) return;
    const defaults = contactOptions
      .map((option) => option.number)
      .filter((n) => sanitizeDigits(n).length >= 10);
    setSmsData((prev) => ({
      selectedNumbers: joiningOnlineAdmissionMode ? defaults : defaults.length ? [defaults[0]] : [],
      selectedTemplates: joiningOnlineAdmissionMode ? prev.selectedTemplates : {},
      languageFilter: 'all',
    }));
  }, [open, lead?._id, lead?.phone, lead?.fatherPhone, contactOptions, joiningOnlineAdmissionMode]);

  useEffect(() => {
    if (!open || !joiningOnlineAdmissionMode || isLoadingTemplates) return;
    const t = systemJoiningTemplate;
    if (!t || !admissionPublicLink?.url) return;
    setSmsData((prev) => {
      const nextVars = buildDefaultTemplateValues(t);
      const existing = prev.selectedTemplates[t._id];
      if (existing) {
        const keys = new Set([...Object.keys(nextVars), ...Object.keys(existing.variables)]);
        const same = [...keys].every((k) => (nextVars[k] ?? '') === (existing.variables[k] ?? ''));
        if (same && existing.template._id === t._id) return prev;
      }
      return {
        ...prev,
        selectedTemplates: {
          [t._id]: {
            template: t,
            variables: nextVars,
          },
        },
      };
    });
  }, [
    open,
    joiningOnlineAdmissionMode,
    isLoadingTemplates,
    systemJoiningTemplate?._id,
    admissionPublicLink?.url,
    admissionPublicLink?.pathToken,
    buildDefaultTemplateValues,
  ]);

  useEffect(() => {
    if (!open || !linkPrefillCtx) return;
    setSmsData((prev) => {
      const nextTemplates = { ...prev.selectedTemplates };
      let changed = false;
      for (const [templateId, entry] of Object.entries(nextTemplates)) {
        const merged = prefillJoiningLinkTemplateVariables(
          { ...entry.variables },
          entry.template,
          linkPrefillCtx,
          joiningOnlineAdmissionMode
        );
        const keys = new Set([...Object.keys(merged), ...Object.keys(entry.variables)]);
        const differs = [...keys].some((k) => (merged[k] ?? '') !== (entry.variables[k] ?? ''));
        if (differs) {
          nextTemplates[templateId] = { ...entry, variables: merged };
          changed = true;
        }
      }
      return changed ? { ...prev, selectedTemplates: nextTemplates } : prev;
    });
  }, [open, linkPrefillCtx, joiningOnlineAdmissionMode]);

  const smsMutation = useMutation({
    mutationFn: async (payload: {
      contactNumbers: string[];
      templates: Array<{ templateId: string; variables: Array<{ key: string; value: string }> }>;
    }) => communicationAPI.sendSms(leadId as string, payload),
    onSuccess: (response: unknown) => {
      const root = response as { data?: { results?: Array<{ success?: boolean }> }; results?: Array<{ success?: boolean }> };
      const inner = root?.data ?? root;
      const results = inner?.results || [];
      const successCount = results.filter((r) => r.success).length;
      const totalCount = results.length;
      if (successCount === totalCount) showToast.success(`All ${successCount} message(s) sent successfully!`);
      else showToast.success(`${successCount}/${totalCount} message(s) sent successfully`);
      queryClient.invalidateQueries({ queryKey: ['lead', leadId, 'communications'] });
      void queryClient.invalidateQueries({ queryKey: ['joining-pipeline'] });
      void queryClient.invalidateQueries({ queryKey: ['joining-in-progress'] });
      void queryClient.invalidateQueries({ queryKey: ['confirmed-leads'] });
      setSmsData({ selectedNumbers: [], selectedTemplates: {}, languageFilter: 'all' });
      onClose();
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      showToast.error(err?.response?.data?.message || err?.message || 'Failed to send SMS');
    },
  });

  const handleSend = () => {
    if (!leadId) return;
    if (smsData.selectedNumbers.length === 0) {
      showToast.error('Please select at least one contact number');
      return;
    }
    if (Object.keys(smsData.selectedTemplates).length === 0) {
      showToast.error('Please select at least one template');
      return;
    }
    const templatesPayload = Object.values(smsData.selectedTemplates).map(({ template, variables }) => {
      const varsPayload =
        template.variables && template.variables.length > 0
          ? template.variables.map((variable, index) => ({
              key: variable.key || `var${index + 1}`,
              value: variables[variable.key || `var${index + 1}`] || '',
            }))
          : Array.from({ length: template.variableCount }).map((_, index) => ({
              key: `var${index + 1}`,
              value: variables[`var${index + 1}`] || '',
            }));
      return { templateId: template._id, variables: varsPayload };
    });
    smsMutation.mutate({
      contactNumbers: smsData.selectedNumbers,
      templates: templatesPayload,
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              {joiningOnlineAdmissionMode ? 'Send admission SMS' : 'Send SMS for Draft Lead'}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {joiningOnlineAdmissionMode
                ? 'A new public joining URL was created and filled into the system template. Confirm recipients, review the preview, then send.'
                : 'Select recipients and templates from Communications. Variables are auto-prefilled with template defaults.'}
            </p>
          </div>
          <Button
            variant="light"
            onClick={() => {
              setSmsData({ selectedNumbers: [], selectedTemplates: {}, languageFilter: 'all' });
              onClose();
            }}
            className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            ×
          </Button>
        </div>

        {leadLoading ? (
          <p className="text-sm text-slate-500">Loading lead details…</p>
        ) : !lead ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            No linked lead found. SMS can only be sent for draft rows linked to a CRM lead.
          </p>
        ) : (
          <>
            {admissionPublicLink?.url ? (
              <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                  Online joining form link (Step 1 only)
                </h3>
                <p className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-200/90">
                  Families complete the application form only. Certificate verification and fee lines are handled by
                  admissions after approval.
                </p>
                <p className="mt-2 break-all font-mono text-xs text-emerald-900 dark:text-emerald-100">{admissionPublicLink.url}</p>
                {admissionPublicLink.expiresAt ? (
                  <p className="mt-2 text-xs text-emerald-800/90 dark:text-emerald-300/90">
                    Expires: <strong>{new Date(admissionPublicLink.expiresAt).toLocaleString()}</strong> — send promptly so the
                    family can open the form before it lapses.
                  </p>
                ) : null}
                <div className="mt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => void navigator.clipboard?.writeText(admissionPublicLink.url).catch(() => {})}
                  >
                    Copy link
                  </Button>
                </div>
                {joiningOnlineAdmissionMode && linkPrefillCtx?.pathToken ? (
                  <p className="mt-3 text-xs text-emerald-900/90 dark:text-emerald-200/90">
                    SMS variable is only the token value after{' '}
                    <code className="rounded bg-emerald-100/80 px-1 font-mono text-[10px] dark:bg-emerald-900/50">
                      /joining/public?t=
                    </code>
                    <span className="font-mono">{linkPrefillCtx.pathToken}</span>
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Recipients</h3>
              <div className="space-y-2">
                {contactOptions.map((option) => {
                  const checked = smsData.selectedNumbers.includes(option.number);
                  return (
                    <label key={`${option.label}-${option.number}`} className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setSmsData((prev) => ({
                            ...prev,
                            selectedNumbers: e.target.checked
                              ? [...prev.selectedNumbers, option.number]
                              : prev.selectedNumbers.filter((n) => n !== option.number),
                          }))
                        }
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        <strong>{option.label}:</strong> {option.number}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Selected {smsData.selectedNumbers.length} recipient{smsData.selectedNumbers.length === 1 ? '' : 's'}.
              </p>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  {joiningOnlineAdmissionMode ? 'Message template' : 'Templates'}
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {joiningOnlineAdmissionMode
                    ? `Using: ${JOINING_ONLINE_ADMISSION_TEMPLATE_NAME}`
                    : `Selected: ${Object.keys(smsData.selectedTemplates).length}`}
                </p>
              </div>
              {!joiningOnlineAdmissionMode ? (
                <select
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                  value={smsData.languageFilter}
                  onChange={(e) => setSmsData((prev) => ({ ...prev, languageFilter: e.target.value }))}
                >
                  <option value="all">All languages</option>
                  {availableLanguages.map((language) => (
                    <option key={language} value={language}>
                      {language.toUpperCase()}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <div className="max-h-[40vh] space-y-4 overflow-y-auto pr-1">
              {isLoadingTemplates ? (
                <p className="text-sm text-slate-500">Loading templates…</p>
              ) : joiningOnlineAdmissionMode && !systemJoiningTemplate ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
                  <p className="font-medium">System template not found or inactive.</p>
                  <p className="mt-2 text-xs leading-relaxed">
                    Run the database migration{' '}
                    <code className="rounded bg-amber-100/80 px-1 py-0.5 font-mono text-[11px] dark:bg-amber-900/50">
                      sql/migrations/20260502_joining_online_admission_sms_template.sql
                    </code>{' '}
                    (or create an <strong>active</strong> template named exactly{' '}
                    <strong>{JOINING_ONLINE_ADMISSION_TEMPLATE_NAME}</strong> under Communications → Message templates).
                  </p>
                </div>
              ) : filteredTemplates.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No active templates available. Add templates under Communications → Message templates.
                </p>
              ) : (
                filteredTemplates.map((template) => {
                  const templateState = smsData.selectedTemplates[template._id];
                  const isSelected = Boolean(templateState);
                  const lockTemplate =
                    joiningOnlineAdmissionMode && template.name === JOINING_ONLINE_ADMISSION_TEMPLATE_NAME;
                  const templateVariables =
                    template.variables && template.variables.length > 0
                      ? template.variables
                      : Array.from({ length: template.variableCount }).map((_, index) => ({
                          key: `var${index + 1}`,
                          label: `Variable ${index + 1}`,
                          defaultValue: '',
                        }));

                  return (
                    <div key={template._id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={lockTemplate}
                          onChange={(e) => {
                            if (lockTemplate) return;
                            if (e.target.checked) {
                              setSmsData((prev) => ({
                                ...prev,
                                selectedTemplates: {
                                  ...prev.selectedTemplates,
                                  [template._id]: {
                                    template,
                                    variables: buildDefaultTemplateValues(template, admissionPublicLink?.url ?? null),
                                  },
                                },
                              }));
                            } else {
                              setSmsData((prev) => {
                                const next = { ...prev.selectedTemplates };
                                delete next[template._id];
                                return { ...prev, selectedTemplates: next };
                              });
                            }
                          }}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{template.name}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            DLT ID: {template.dltTemplateId} · Language: {template.language?.toUpperCase() || 'N/A'} · Placeholders: {template.variableCount}
                          </div>
                        </div>
                      </label>

                      {isSelected && (
                        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                          {templateVariables.length > 0 && (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {templateVariables.map((variable, index) => {
                                const key = variable.key || `var${index + 1}`;
                                return (
                                  <div key={`${template._id}-${key}`}>
                                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                                      {variable.label || key}
                                    </label>
                                    <input
                                      type="text"
                                      value={templateState.variables[key] || ''}
                                      onChange={(e) =>
                                        setSmsData((prev) => ({
                                          ...prev,
                                          selectedTemplates: {
                                            ...prev.selectedTemplates,
                                            [template._id]: {
                                              ...templateState,
                                              variables: {
                                                ...templateState.variables,
                                                [key]: e.target.value,
                                              },
                                            },
                                          },
                                        }))
                                      }
                                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                                      placeholder={`Enter ${variable.label || key}`}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Preview</p>
                            <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                              {renderTemplatePreview(template, templateState.variables)}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {smsData.selectedNumbers.length === 0
                  ? 'Select at least one recipient.'
                  : Object.keys(smsData.selectedTemplates).length === 0
                    ? 'Select at least one template.'
                    : `Ready to send ${Object.keys(smsData.selectedTemplates).length} template(s).`}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSmsData({ selectedNumbers: [], selectedTemplates: {}, languageFilter: 'all' });
                    onClose();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSend}
                  disabled={
                    smsMutation.isPending ||
                    smsData.selectedNumbers.length === 0 ||
                    Object.keys(smsData.selectedTemplates).length === 0
                  }
                >
                  {smsMutation.isPending ? 'Sending…' : 'Send SMS'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

