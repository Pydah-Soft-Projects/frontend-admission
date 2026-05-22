'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ReferenceUserSelect,
  REFERENCE_NAMES_QUERY_KEY,
} from '@/components/admission/ReferenceUserSelect';
import { Button } from '@/components/ui/Button';
import { admissionAPI } from '@/lib/api';
import { showToast } from '@/lib/toast';

type Props = {
  admissionId: string;
  initialReference1: string;
  canEdit: boolean;
  className?: string;
};

/** Editable Reference 1 on confirmed admissions (detail / desk). */
export function AdmissionReferenceEditor({
  admissionId,
  initialReference1,
  canEdit,
  className = '',
}: Props) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(initialReference1);

  useEffect(() => {
    setValue(initialReference1);
  }, [initialReference1, admissionId]);

  const saveMutation = useMutation({
    mutationFn: () => admissionAPI.patchReferenceById(admissionId, value.trim()),
    onSuccess: () => {
      showToast.success('Reference updated');
      void queryClient.invalidateQueries({ queryKey: [...REFERENCE_NAMES_QUERY_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['admission', admissionId] });
      void queryClient.invalidateQueries({ queryKey: ['admissions'] });
    },
    onError: (error: unknown) => {
      const msg =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error as Error)?.message ||
        'Failed to update reference';
      showToast.error(msg);
    },
  });

  const dirty = value.trim() !== initialReference1.trim();

  return (
    <div className={className}>
      <ReferenceUserSelect
        id="admission-detail-reference1"
        label="Reference"
        value={value}
        onChange={setValue}
        disabled={!canEdit || saveMutation.isPending}
        showAddUserButton={canEdit && !saveMutation.isPending}
      />
      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!dirty || saveMutation.isPending}
            isLoading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            Save reference
          </Button>
          {dirty ? (
            <button
              type="button"
              className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              onClick={() => setValue(initialReference1)}
              disabled={saveMutation.isPending}
            >
              Reset
            </button>
          ) : null}
        </div>
      ) : (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          You do not have permission to edit the reference.
        </p>
      )}
    </div>
  );
}
