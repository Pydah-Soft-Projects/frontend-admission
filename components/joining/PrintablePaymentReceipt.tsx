import { useCallback } from 'react';
import { PrintActionButton } from '@/components/ui/PrintActionButton';
import { handleExternalPrint } from '@/lib/printHtml';

export type PaymentReceiptPrintDetails = {
  template?: string;
  receiptNumber?: string;
  studentName: string;
  fatherName: string;
  course: string;
  branch: string;
  quota?: string;
  enquiryNumber?: string;
  admissionNumber?: string;
  amount: string;
  mode: 'cash' | 'online';
  transactionId?: string;
  feeHeadLabel?: string;
  collectedAt: string;
  collectorName?: string;
  isAdditionalFee?: boolean;
};

export function PrintablePaymentReceipt({
  details,
  printButtonLabel = 'Print payment details',
  className,
}: {
  details: PaymentReceiptPrintDetails;
  printButtonLabel?: string;
  className?: string;
  /** @deprecated Size is ignored; compact theme button is always used. */
  size?: 'sm' | 'md';
}) {
  const handlePrint = useCallback(() => {
    void handleExternalPrint('fee', { template: 'fee-receipt' }, { template: 'fee-receipt', data: details }, 'Fee Receipt');
  }, [details]);

  return (
    <PrintActionButton
      label={printButtonLabel}
      onClick={handlePrint}
      className={className}
    />
  );
}

/** Build receipt fields from joining form state (auto-filled for modal / print). */
export function buildPaymentReceiptDetailsFromForm(input: {
  formState: {
    studentInfo: { name?: string };
    parents: { father: { name?: string } };
    courseInfo: { course?: string; branch?: string; quota?: string };
  };
  lead?: { name?: string; enquiryNumber?: string } | null;
  admissionNumber?: string;
  amount: string;
  mode: 'cash' | 'online';
  transactionId?: string;
  feeHeadLabel?: string;
  collectorName?: string;
  isAdditionalFee?: boolean;
  collectedAt?: Date;
}): PaymentReceiptPrintDetails {
  const collectedAt = (input.collectedAt ?? new Date()).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return {
    receiptNumber: input.transactionId,
    studentName: input.formState.studentInfo.name || input.lead?.name || '—',
    fatherName: input.formState.parents.father.name || '—',
    course: input.formState.courseInfo.course || '—',
    branch: input.formState.courseInfo.branch || '—',
    quota: input.formState.courseInfo.quota || undefined,
    enquiryNumber: input.lead?.enquiryNumber,
    admissionNumber: input.admissionNumber,
    amount: input.amount || '—',
    mode: input.mode,
    transactionId: input.transactionId,
    feeHeadLabel: input.feeHeadLabel,
    collectedAt,
    collectorName: input.collectorName,
    isAdditionalFee: input.isAdditionalFee,
  };
}
