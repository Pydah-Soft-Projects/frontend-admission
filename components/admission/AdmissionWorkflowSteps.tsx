'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export type AdmissionWorkflowStep = 1 | 2 | 3;

export const ADMISSION_WORKFLOW_STEPS = [
  {
    step: 1 as AdmissionWorkflowStep,
    label: 'Step 1',
    title: 'Online application',
    description:
      'Course, quota, reservation, qualifications, student profile, parents, address, education, siblings, and document checklist (sections 1–6).',
    scrollId: 'joining-wizard-step-1',
    admissionScrollId: 'admission-step-one',
    tone: 'blue' as const,
  },
  {
    step: 2 as AdmissionWorkflowStep,
    label: 'Step 2',
    title: 'Admission fee workflow',
    description:
      'Certificate checklist and direct admission fee entry (amount and reference ID).',
    scrollId: 'joining-wizard-step-2',
    admissionScrollId: 'admission-step-two',
    tone: 'indigo' as const,
  },
  {
    step: 3 as AdmissionWorkflowStep,
    label: 'Step 3',
    title: 'Fee configuration & payments',
    description:
      'Fee heads from the Fee Management database, payment collection, and final submit.',
    scrollId: 'joining-wizard-step-3',
    admissionScrollId: 'joining-post-admission-payments',
    tone: 'emerald' as const,
  },
] as const;

export type AdmissionWorkflowSurface = 'admission-detail' | 'joining-edit' | 'joining-public';

export type AdmissionWorkflowStepsProps = {
  activeStep: AdmissionWorkflowStep;
  surface: AdmissionWorkflowSurface;
  joiningId?: string | null;
  admissionId?: string | null;
  joiningStatus?: string;
  isAdmissionCancelled?: boolean;
  className?: string;
  /** When set, step pills on the joining desk jump between in-page wizard panels. */
  onJoiningWizardStepSelect?: (step: AdmissionWorkflowStep) => void;
};

const toneRing: Record<(typeof ADMISSION_WORKFLOW_STEPS)[number]['tone'], string> = {
  blue: 'border-blue-200 bg-blue-50/90 text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100',
  indigo:
    'border-indigo-200 bg-indigo-50/90 text-indigo-950 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-100',
  emerald:
    'border-emerald-200 bg-emerald-50/90 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100',
};

export function scrollToWorkflowAnchor(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function scrollToAnchor(id: string) {
  scrollToWorkflowAnchor(id);
}

/** Resolve scroll target or external URL for the next workflow step. */
export function resolveWorkflowNextTarget(
  fromStep: AdmissionWorkflowStep,
  surface: AdmissionWorkflowSurface,
  joiningId?: string | null,
  admissionId?: string | null
): { type: 'scroll'; id: string } | { type: 'href'; href: string } | null {
  if (fromStep === 1) {
    if (surface === 'admission-detail' && admissionId) {
      return { type: 'scroll', id: 'admission-step-two' };
    }
    if ((surface === 'joining-edit' || surface === 'joining-public') && joiningId) {
      if (admissionId) {
        return {
          type: 'href',
          href: `/superadmin/admission/${admissionId}/detail#admission-step-two`,
        };
      }
      return { type: 'scroll', id: 'joining-wizard-step-2' };
    }
  }
  if (fromStep === 2) {
    if (surface === 'admission-detail' && joiningId) {
      return {
        type: 'href',
        href: `/superadmin/joining/${joiningId}#joining-post-admission-payments`,
      };
    }
    if (surface === 'joining-edit' && joiningId) {
      return { type: 'scroll', id: 'joining-post-admission-payments' };
    }
    return { type: 'scroll', id: 'joining-wizard-step-3' };
  }
  return null;
}

function isStep2Available(
  joiningStatus?: string,
  joiningId?: string | null,
  admissionId?: string | null,
  isAdmissionCancelled?: boolean
) {
  if (isAdmissionCancelled) return false;
  if (!joiningId || !admissionId) return false;
  return joiningStatus === 'approved';
}

function isStep3Available(
  joiningStatus?: string,
  joiningId?: string | null,
  isAdmissionCancelled?: boolean
) {
  if (isAdmissionCancelled) return false;
  if (!joiningId) return false;
  return joiningStatus === 'approved';
}

function resolveScrollTarget(
  step: AdmissionWorkflowStep,
  surface: AdmissionWorkflowSurface
): string {
  const meta = ADMISSION_WORKFLOW_STEPS[step - 1];
  if (surface === 'admission-detail') {
    return meta.admissionScrollId;
  }
  return meta.scrollId;
}

function resolveExternalHref(
  step: AdmissionWorkflowStep,
  props: AdmissionWorkflowStepsProps
): string | null {
  const { surface, joiningId, admissionId } = props;
  if (!joiningId && step !== 2) return null;
  if (step === 1 && surface === 'admission-detail' && joiningId) {
    return `/superadmin/joining/${joiningId}#joining-step-one`;
  }
  if (step === 2 && (surface === 'joining-edit' || surface === 'joining-public') && admissionId) {
    return `/superadmin/admission/${admissionId}/detail#admission-step-two`;
  }
  if (step === 3 && surface === 'admission-detail' && joiningId) {
    return `/superadmin/joining/${joiningId}#joining-post-admission-payments`;
  }
  return null;
}

function isStepEnabled(step: AdmissionWorkflowStep, props: AdmissionWorkflowStepsProps): boolean {
  const { joiningStatus, joiningId, admissionId, isAdmissionCancelled, surface, onJoiningWizardStepSelect } =
    props;
  if (isAdmissionCancelled) return false;
  if (onJoiningWizardStepSelect && (surface === 'joining-edit' || surface === 'joining-public')) {
    return true;
  }
  if (step === 1) {
    if (surface === 'admission-detail') return Boolean(joiningId) && !isAdmissionCancelled;
    return true;
  }
  if (step === 2) {
    return isStep2Available(joiningStatus, joiningId, admissionId, isAdmissionCancelled);
  }
  return isStep3Available(joiningStatus, joiningId, isAdmissionCancelled);
}

function stepDisabledTitle(step: AdmissionWorkflowStep, props: AdmissionWorkflowStepsProps): string {
  const { joiningStatus, joiningId, admissionId, isAdmissionCancelled } = props;
  if (isAdmissionCancelled) return 'Admission cancelled — this step is not available';
  if (step === 1 && !joiningId) return 'No joining record linked';
  if (step === 2) {
    if (!joiningId || !admissionId) return 'Link a joining record and admission to open Step 2';
    if (joiningStatus !== 'approved') return 'Step 2 unlocks after the joining is approved';
    return 'Open certificate checklist and fee lines on the admission record';
  }
  if (!joiningId) return 'No joining record linked';
  if (joiningStatus !== 'approved') return 'Step 3 unlocks after the joining is approved';
  return 'Open verification summary and payments on the joining workspace';
}

/** Compact step pills for page headers (scroll same page or navigate to linked record). */
export function AdmissionWorkflowStepButtons({
  activeStep,
  surface,
  joiningId,
  admissionId,
  joiningStatus,
  isAdmissionCancelled,
  className,
  onJoiningWizardStepSelect,
}: AdmissionWorkflowStepsProps) {
  const handleStep = (step: AdmissionWorkflowStep) => {
    const props = {
      activeStep,
      surface,
      joiningId,
      admissionId,
      joiningStatus,
      isAdmissionCancelled,
      onJoiningWizardStepSelect,
    };
    if (!isStepEnabled(step, props)) return;

    if (onJoiningWizardStepSelect && (surface === 'joining-edit' || surface === 'joining-public')) {
      onJoiningWizardStepSelect(step);
      scrollToAnchor(resolveScrollTarget(step, surface));
      return;
    }

    const href = resolveExternalHref(step, props);
    if (href) return;
    scrollToAnchor(resolveScrollTarget(step, surface));
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {ADMISSION_WORKFLOW_STEPS.map((meta) => {
        const stepProps = {
          activeStep,
          surface,
          joiningId,
          admissionId,
          joiningStatus,
          isAdmissionCancelled,
          onJoiningWizardStepSelect,
        };
        const enabled = isStepEnabled(meta.step, stepProps);
        const href =
          enabled && !onJoiningWizardStepSelect ? resolveExternalHref(meta.step, stepProps) : null;
        const isActive = activeStep === meta.step;
        const title = enabled
          ? `${meta.label}: ${meta.title}`
          : stepDisabledTitle(meta.step, {
              activeStep,
              surface,
              joiningId,
              admissionId,
              joiningStatus,
              isAdmissionCancelled,
            });

        const buttonClass = cn(
          'shrink-0',
          isActive && 'ring-2 ring-offset-1 ring-[#ea580c]/40 dark:ring-offset-slate-900'
        );

        if (href) {
          return (
            <Link key={meta.step} href={href} title={title}>
              <Button variant={isActive ? 'primary' : 'outline'} size="sm" className={buttonClass}>
                {meta.label}
              </Button>
            </Link>
          );
        }

        return (
          <Button
            key={meta.step}
            variant={isActive ? 'primary' : 'outline'}
            size="sm"
            className={buttonClass}
            disabled={!enabled}
            title={title}
            onClick={() => handleStep(meta.step)}
          >
            {meta.label}
          </Button>
        );
      })}
    </div>
  );
}

/** Full-width workflow strip with step descriptions (joining edit / admission detail). */
export function AdmissionWorkflowOverview({
  activeStep,
  surface,
  joiningId,
  admissionId,
  joiningStatus,
  isAdmissionCancelled,
  className,
  onJoiningWizardStepSelect,
}: AdmissionWorkflowStepsProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 sm:p-5',
        className
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Admissions workflow
      </p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {ADMISSION_WORKFLOW_STEPS.map((meta) => {
          const stepProps = {
            activeStep,
            surface,
            joiningId,
            admissionId,
            joiningStatus,
            isAdmissionCancelled,
            onJoiningWizardStepSelect,
          };
          const enabled = isStepEnabled(meta.step, stepProps);
          const isActive = activeStep === meta.step;
          const href =
            enabled && !onJoiningWizardStepSelect ? resolveExternalHref(meta.step, stepProps) : null;

          const inner = (
            <>
              <span
                className={cn(
                  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  isActive
                    ? 'bg-[#ea580c] text-white'
                    : enabled
                      ? 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-100'
                      : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                )}
              >
                {meta.step}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-sm font-semibold',
                    isActive ? 'text-[#ea580c] dark:text-orange-300' : 'text-slate-900 dark:text-slate-100'
                  )}
                >
                  {meta.label} — {meta.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                  {meta.description}
                </p>
              </div>
            </>
          );

          const itemClass = cn(
            'flex gap-3 rounded-xl border p-3 transition',
            isActive
              ? 'border-[#ea580c]/40 bg-orange-50/50 dark:border-orange-900/40 dark:bg-orange-950/20'
              : 'border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/30',
            !enabled && 'opacity-60'
          );

          if (href) {
            return (
              <li key={meta.step}>
                <Link
                  href={href}
                  className={cn(itemClass, enabled && 'hover:border-[#ea580c]/30 hover:bg-orange-50/80')}
                  title={stepDisabledTitle(meta.step, {
                    activeStep,
                    surface,
                    joiningId,
                    admissionId,
                    joiningStatus,
                    isAdmissionCancelled,
                  })}
                >
                  {inner}
                </Link>
              </li>
            );
          }

          return (
            <li key={meta.step}>
              <button
                type="button"
                disabled={!enabled}
                className={cn(
                  itemClass,
                  enabled && 'w-full text-left hover:border-[#ea580c]/30 hover:bg-orange-50/80 disabled:cursor-not-allowed'
                )}
                title={stepDisabledTitle(meta.step, stepProps)}
                onClick={() => {
                  if (!enabled) return;
                  if (onJoiningWizardStepSelect) {
                    onJoiningWizardStepSelect(meta.step);
                  }
                  scrollToAnchor(resolveScrollTarget(meta.step, surface));
                }}
              >
                {inner}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Sticky action row anchored to a workflow step section. */
export function WorkflowStickyActionBar({
  stepLabel,
  hint,
  children,
  className,
  id,
}: {
  stepLabel?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        'sticky bottom-0 z-10 -mx-1 rounded-xl border border-white/60 bg-white/95 px-3 py-3 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 dark:shadow-none sm:mx-0 sm:px-4',
        className
      )}
    >
      {stepLabel ? (
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {stepLabel}
        </p>
      ) : null}
      {hint ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          {hint}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-3">{children}</div>
    </div>
  );
}

/** Move to the previous in-page wizard step. */
export function WorkflowPreviousStepButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button type="button" variant="outline" size="sm" className={cn('gap-2', className)} onClick={onClick}>
      <span aria-hidden>←</span>
      Previous Step
    </Button>
  );
}

/** Primary navigation control at the bottom of Steps 1 and 2. */
export function WorkflowNextStepButton({
  fromStep,
  surface,
  joiningId,
  admissionId,
  onWizardAdvance,
  className,
}: {
  fromStep: 1 | 2;
  surface: AdmissionWorkflowSurface;
  joiningId?: string | null;
  admissionId?: string | null;
  /** When the joining form uses an in-page wizard, advance to the next wizard panel. */
  onWizardAdvance?: () => void;
  className?: string;
}) {
  const wizardScrollId =
    onWizardAdvance && (surface === 'joining-edit' || surface === 'joining-public')
      ? (`joining-wizard-step-${fromStep + 1}` as const)
      : null;
  const target = wizardScrollId
    ? { type: 'scroll' as const, id: wizardScrollId }
    : resolveWorkflowNextTarget(fromStep, surface, joiningId, admissionId);

  const handleClick = () => {
    onWizardAdvance?.();
    if (target?.type === 'scroll') {
      requestAnimationFrame(() => scrollToWorkflowAnchor(target.id));
    }
  };

  if (target?.type === 'href' && !onWizardAdvance) {
    return (
      <Link href={target.href} className={className}>
        <Button type="button" variant="primary" size="sm" className="gap-2">
          Next Step
          <span aria-hidden>→</span>
        </Button>
      </Link>
    );
  }

  return (
    <Button
      type="button"
      variant="primary"
      size="sm"
      className={cn('gap-2', className)}
      onClick={handleClick}
      disabled={!target && !onWizardAdvance}
    >
      Next Step
      <span aria-hidden>→</span>
    </Button>
  );
}

/** Highlight banner for the active step section (public Step 1, admin joining edit). */
export function AdmissionWorkflowStepBanner({
  step,
  className,
}: {
  step: AdmissionWorkflowStep;
  className?: string;
}) {
  const meta = ADMISSION_WORKFLOW_STEPS[step - 1];
  return (
    <div className={cn('rounded-xl border px-4 py-3 text-sm', toneRing[meta.tone], className)}>
      <p className="font-semibold">
        {meta.label} — {meta.title}
      </p>
      <p className="mt-1 text-xs leading-relaxed opacity-90">{meta.description}</p>
    </div>
  );
}
