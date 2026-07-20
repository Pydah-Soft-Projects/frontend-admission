'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import {
  PARENT_OCCUPATION_OTHERS_VALUE,
  getParentOccupationOptions,
  loadCustomParentOccupations,
  saveCustomParentOccupation,
  type ParentOccupationRole,
} from '@/lib/parentOccupation';
import { cn } from '@/lib/utils';

type ParentOccupationSelectProps = {
  role: ParentOccupationRole;
  label: string;
  value?: string | null;
  onChange: (value: string) => void;
  className?: string;
  labelClassName?: string;
  selectClassName?: string;
  disabled?: boolean;
};

export function ParentOccupationSelect({
  role,
  label,
  value,
  onChange,
  className,
  labelClassName,
  selectClassName,
  disabled = false,
}: ParentOccupationSelectProps) {
  const [customOptions, setCustomOptions] = useState<string[]>([]);
  const [othersOpen, setOthersOpen] = useState(false);
  const [othersDraft, setOthersDraft] = useState('');
  const [selectKey, setSelectKey] = useState(0);

  useEffect(() => {
    setCustomOptions(loadCustomParentOccupations());
  }, []);

  const options = useMemo(
    () => getParentOccupationOptions(role, customOptions, value),
    [role, customOptions, value]
  );

  const currentValue = String(value ?? '').trim();

  const handleSelectChange = (next: string) => {
    if (next === PARENT_OCCUPATION_OTHERS_VALUE) {
      setOthersDraft('');
      setOthersOpen(true);
      // Force select back to current value until Others is confirmed.
      setSelectKey((prev) => prev + 1);
      return;
    }
    onChange(next);
  };

  const handleSaveOthers = () => {
    const saved = saveCustomParentOccupation(othersDraft);
    if (!saved) return;
    setCustomOptions(loadCustomParentOccupations());
    onChange(saved);
    setOthersOpen(false);
    setOthersDraft('');
  };

  return (
    <div className={className}>
      <label className={cn('mb-0.5 block text-xs font-medium text-gray-700 dark:text-slate-200', labelClassName)}>
        {label}
      </label>
      <select
        key={selectKey}
        value={currentValue}
        onChange={(event) => handleSelectChange(event.target.value)}
        disabled={disabled}
        className={cn(
          'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100',
          selectClassName
        )}
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={PARENT_OCCUPATION_OTHERS_VALUE}>Others</option>
      </select>

      <Dialog open={othersOpen} onOpenChange={setOthersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enter occupation</DialogTitle>
            <DialogDescription>
              Add a custom occupation. It will appear in the dropdown from next time onwards.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <Input
              label="Occupation"
              value={othersDraft}
              onChange={(event) => setOthersDraft(event.target.value)}
              placeholder="Enter occupation"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSaveOthers();
                }
              }}
            />
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="secondary" onClick={() => setOthersOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSaveOthers}
              disabled={!othersDraft.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
