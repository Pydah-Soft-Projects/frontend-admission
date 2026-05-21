'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { escapePrintHtml, printHtmlDocument } from '@/lib/printHtml';

export type PaymentReceiptPrintDetails = {
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

function buildPaymentReceiptHtml(details: PaymentReceiptPrintDetails): string {
  const modeLabel = details.mode === 'cash' ? 'Cash' : 'Online (Cashfree)';
  const rows: Array<[string, string]> = [
    ['Student name', details.studentName],
    ['Father name', details.fatherName],
    ['Course', details.course],
    ['Branch', details.branch],
    ...(details.quota ? [['Quota', details.quota] as [string, string]] : []),
    ...(details.enquiryNumber ? [['Enquiry no.', details.enquiryNumber] as [string, string]] : []),
    ...(details.admissionNumber ? [['Admission no.', details.admissionNumber] as [string, string]] : []),
    ['Payment mode', modeLabel],
    ...(details.feeHeadLabel ? [['Fee head', details.feeHeadLabel] as [string, string]] : []),
    ['Amount (INR)', details.amount],
    ...(details.transactionId ? [['Transaction / reference ID', details.transactionId] as [string, string]] : []),
    ['Date & time', details.collectedAt],
    ...(details.collectorName ? [['Collected by', details.collectorName] as [string, string]] : []),
  ];

  const bodyRows = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:13px;color:#6b7280;width:38%;">${escapePrintHtml(label)}</td>
        <td style="padding:10px 14px;border:1px solid #e5e7eb;font-size:14px;font-weight:600;">${escapePrintHtml(value)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Payment receipt</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; color: #111827; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    .sub { color: #6b7280; font-size: 13px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    .banner { margin-bottom: 16px; padding: 12px 16px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; font-size: 13px; }
    .footer { margin-top: 24px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <h1>Admission fee payment receipt</h1>
  <p class="sub">${details.isAdditionalFee ? 'Additional fee collection' : 'Admission fee collection'} — Step 2 workflow</p>
  ${details.isAdditionalFee ? '<div class="banner">Marked as additional fee (separate from scheduled admission balance).</div>' : ''}
  <table>${bodyRows}</table>
  <div class="footer">Generated from Admissions CRM — retain for office records.</div>
</body>
</html>`;
}

export function PrintablePaymentReceipt({
  details,
  printButtonLabel = 'Print payment details',
  className,
  size = 'sm',
}: {
  details: PaymentReceiptPrintDetails;
  printButtonLabel?: string;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const handlePrint = useCallback(() => {
    printHtmlDocument(buildPaymentReceiptHtml(details), 'Payment receipt');
  }, [details]);

  return (
    <Button type="button" variant="outline" size={size} onClick={handlePrint} className={className}>
      {printButtonLabel}
    </Button>
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
