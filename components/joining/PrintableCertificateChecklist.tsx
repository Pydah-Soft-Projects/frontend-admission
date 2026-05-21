'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import { escapePrintHtml, printHtmlDocument } from '@/lib/printHtml';
import type { CertificateGuidance } from '@/types';
import { listCertificateItemOptions } from '@/lib/certificateChecklistEntry';
import type { CertificateChecklistParsedEntry } from '@/components/joining/CertificateInformationChecklistPanel';

export type PrintableCertificateChecklistProps = {
  certificateGuidance: CertificateGuidance | null;
  certificateChecklistParsed: Record<string, CertificateChecklistParsedEntry>;
  programLevel: string;
  certificationStatus?: string | null;
  studentName?: string;
  fatherName?: string;
  course?: string;
  branch?: string;
  enquiryNumber?: string;
  printButtonLabel?: string;
  className?: string;
};

function buildCertificatePrintHtml(props: {
  title: string;
  rows: Array<{ name: string; required: boolean; optionLabel: string; status: string }>;
  studentName?: string;
  fatherName?: string;
  course?: string;
  branch?: string;
  enquiryNumber?: string;
  programLevel: string;
  certificationStatus?: string | null;
  printedAt: string;
}): string {
  const {
    title,
    rows,
    studentName,
    fatherName,
    course,
    branch,
    enquiryNumber,
    programLevel,
    certificationStatus,
    printedAt,
  } = props;

  const tableRows = rows
    .map(
      (row) => `
        <tr>
          <td style="padding: 10px 14px; border: 1px solid #e5e7eb; font-size: 14px;">${escapePrintHtml(row.name)}</td>
          <td style="padding: 10px 14px; border: 1px solid #e5e7eb; font-size: 13px; text-align: center;">${escapePrintHtml(row.required ? 'Required' : 'Optional')}</td>
          <td style="padding: 10px 14px; border: 1px solid #e5e7eb; font-size: 13px;">${escapePrintHtml(row.optionLabel || '—')}</td>
          <td style="padding: 10px 14px; border: 1px solid #e5e7eb; font-size: 13px; font-weight: 600; text-align: center;">${escapePrintHtml(row.status)}</td>
        </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapePrintHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; color: #111827; }
    .header { margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    .meta { font-size: 13px; color: #4b5563; line-height: 1.6; }
    .meta span { display: inline-block; margin-right: 16px; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; background: #f9fafb; border: 1px solid #e5e7eb; }
    .footer { margin-top: 20px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapePrintHtml(title)}</h1>
    <div class="meta">
      ${studentName ? `<span><strong>Student:</strong> ${escapePrintHtml(studentName)}</span>` : ''}
      ${fatherName ? `<span><strong>Father:</strong> ${escapePrintHtml(fatherName)}</span>` : ''}
      ${course ? `<span><strong>Course:</strong> ${escapePrintHtml(course)}</span>` : ''}
      ${branch ? `<span><strong>Branch:</strong> ${escapePrintHtml(branch)}</span>` : ''}
      ${enquiryNumber ? `<span><strong>Enquiry:</strong> ${escapePrintHtml(enquiryNumber)}</span>` : ''}
      <span><strong>Program level:</strong> ${escapePrintHtml(programLevel)}</span>
      ${certificationStatus ? `<span><strong>Certification:</strong> ${escapePrintHtml(certificationStatus)}</span>` : ''}
      <span><strong>Printed:</strong> ${escapePrintHtml(printedAt)}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Certificate item</th>
        <th style="text-align:center;width:90px">Type</th>
        <th>Option / detail</th>
        <th style="text-align:center;width:100px">Status</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="footer">Certificate configuration — Admissions CRM joining desk (Step 2).</div>
</body>
</html>`;
}

export function PrintableCertificateChecklist({
  certificateGuidance,
  certificateChecklistParsed,
  programLevel,
  certificationStatus,
  studentName,
  fatherName,
  course,
  branch,
  enquiryNumber,
  printButtonLabel = 'Print certificate checklist',
  className,
}: PrintableCertificateChecklistProps) {
  const handlePrint = useCallback(() => {
    const items =
      certificateGuidance?.format === 'certificate_config' && certificateGuidance.items
        ? certificateGuidance.items.filter((item) => String(item.id || item.name || '').trim())
        : [];

    const rows = items.map((item) => {
      const itemId = String(item.id || item.name || '').trim();
      const certOpts = listCertificateItemOptions(item);
      const parsed = certificateChecklistParsed[itemId] ?? { status: 'pending' as const };
      const status = parsed.status === 'received' ? 'Received' : 'Pending';
      let optionLabel = '';
      if (parsed.option && certOpts.length > 0) {
        const match = certOpts.find((o) => o.encoded === parsed.option);
        optionLabel = match?.label || parsed.option;
      }
      return {
        name: String(item.name || itemId),
        required: Boolean(item.required),
        optionLabel,
        status,
      };
    });

    const printedAt = new Date().toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    printHtmlDocument(
      buildCertificatePrintHtml({
        title: 'Certificate Information Checklist',
        rows,
        studentName,
        fatherName,
        course,
        branch,
        enquiryNumber,
        programLevel,
        certificationStatus,
        printedAt,
      }),
      'Certificate checklist'
    );
  }, [
    certificateGuidance,
    certificateChecklistParsed,
    programLevel,
    certificationStatus,
    studentName,
    fatherName,
    course,
    branch,
    enquiryNumber,
  ]);

  const hasRows =
    certificateGuidance?.format === 'certificate_config' &&
    (certificateGuidance.items?.length ?? 0) > 0;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handlePrint}
      disabled={!hasRows}
      className={className}
      title={hasRows ? undefined : 'Load certificate rules from program level first'}
    >
      {printButtonLabel}
    </Button>
  );
}
