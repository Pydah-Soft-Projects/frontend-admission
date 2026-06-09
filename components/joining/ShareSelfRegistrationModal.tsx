'use client';

import { SelfRegistrationQrPanel } from '@/components/joining/SelfRegistrationQrPanel';
import { Button } from '@/components/ui/Button';

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ShareSelfRegistrationModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="self-reg-qr-dialog-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2
              id="self-reg-qr-dialog-title"
              className="text-xl font-semibold text-slate-900 dark:text-slate-100"
            >
              Show QR / Print
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Campus self-registration link for Step 1. Source is{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">Self Registration</span>
              ; reference is not collected.
            </p>
          </div>
          <Button variant="light" onClick={onClose} className="text-slate-500" aria-label="Close">
            x
          </Button>
        </div>

        <SelfRegistrationQrPanel showPrint />
      </div>
    </div>
  );
}
