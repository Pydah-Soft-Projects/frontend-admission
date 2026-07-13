import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

function PrintIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-3.5 w-3.5 shrink-0', className)}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
      />
    </svg>
  );
}

type PrintActionButtonProps = {
  label: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  title?: string;
};

/** Compact orange print action matching admissions theme (#ea580c). */
export function PrintActionButton({
  label,
  onClick,
  className,
  disabled,
  title,
}: PrintActionButtonProps) {
  return (
    <Button
      type="button"
      variant="primary"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn('!min-h-0 cursor-pointer gap-1.5 px-3 py-1.5 text-xs font-semibold', className)}
    >
      <PrintIcon />
      {label}
    </Button>
  );
}

export { PrintIcon };
