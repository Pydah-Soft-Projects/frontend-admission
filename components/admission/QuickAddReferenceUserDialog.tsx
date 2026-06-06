'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { showToast } from '@/lib/toast';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (referenceName: string) => void;
  /** When set, dialog edits an existing saved reference name. */
  initialName?: string;
  onRenamed?: (oldName: string, newName: string) => void;
};

export function QuickAddReferenceUserDialog({
  open,
  onClose,
  onCreated,
  initialName = '',
  onRenamed,
}: Props) {
  const isEditMode = Boolean(initialName.trim());
  const [name, setName] = useState('');

  useEffect(() => {
    if (open) {
      setName(initialName.trim());
    }
  }, [open, initialName]);

  const reset = () => setName('');

  const handleSubmit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast.error('Reference name is required');
      return;
    }
    if (isEditMode) {
      const oldName = initialName.trim();
      if (oldName && onRenamed) {
        onRenamed(oldName, trimmedName);
      }
    } else {
      onCreated(trimmedName);
    }
    reset();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {isEditMode ? 'Edit reference' : 'Add reference'}
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {isEditMode
                ? 'Rename this saved reference on all admissions, joinings, and CRM leads that use it.'
                : "Enter the reference person's name. This is stored as Reference 1 only — not a portal login."}
            </p>
          </div>
          <Button
            variant="light"
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="text-slate-500"
          >
            ×
          </Button>
        </div>

        <Input
          label="Reference name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. staff or referrer name"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />

        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={handleSubmit}>
            {isEditMode ? 'Save' : 'Add'}
          </Button>
        </div>
      </div>
    </div>
  );
}
