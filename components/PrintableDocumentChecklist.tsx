'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/Button';

export type DocumentStatus = 'pending' | 'received';

export interface PrintableDocumentChecklistProps {
  /** Map of document key to display label */
  documentLabels: Record<string, string>;
  /** Map of document key to status */
  documents: Record<string, DocumentStatus | undefined>;
  /** Title shown at the top of the print (e.g. "Documents Checklist") */
  title?: string;
  /** Student/candidate name shown on the print */
  studentName?: string;
  /** Enquiry number or reference id */
  enquiryNumber?: string;
  /** Optional printed date (defaults to current date when print is triggered) */
  printedDate?: string;
  /** Label for the print button */
  printButtonLabel?: string;
  /** Optional class for the wrapper or button */
  className?: string;
  /** Render only the button (default true). If false, you can wrap custom trigger. */
  renderButton?: boolean;
  /** Optional: callback when print dialog is opened */
  onPrintOpen?: () => void;
  /** Optional: callback when print dialog is closed (after print or cancel) */
  onPrintClose?: () => void;
}

const DEFAULT_TITLE = 'Documents Checklist';

/**
 * Builds the HTML string for the printable document checklist.
 * Uses inline styles so the print window is self-contained and displays correctly.
 */
function getPrintDocumentHtml(props: {
  title: string;
  documentLabels: Record<string, string>;
  documents: Record<string, DocumentStatus | undefined>;
  studentName?: string;
  enquiryNumber?: string;
  printedDate: string;
}): string {
  const { title, documentLabels, documents, studentName, enquiryNumber, printedDate } = props;
  const rows = Object.entries(documentLabels)
    .map(([key, label]) => {
      const status = documents[key] === 'received' ? 'Received' : 'Pending';
      return `
        <tr>
          <td style="padding: 10px 14px; border: 1px solid #e5e7eb; font-size: 14px; color: #374151;">${escapeHtml(label)}</td>
          <td style="padding: 10px 14px; border: 1px solid #e5e7eb; font-size: 14px; font-weight: 600; text-align: center; color: #1f2937;">${escapeHtml(status)}</td>
        </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 24px; color: #111827; background: #fff; }
    .header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e5e7eb; }
    .header h1 { margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #111827; }
    .meta { font-size: 13px; color: #6b7280; }
    .meta span { margin-right: 16px; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; }
    th { padding: 12px 14px; text-align: left; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; background: #f9fafb; border: 1px solid #e5e7eb; }
    .footer { margin-top: 24px; padding-top: 12px; font-size: 12px; color: #9ca3af; }
    @media print { body { padding: 16px; } .header { break-after: avoid; } table { break-inside: auto; } tr { break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      ${studentName ? `<span><strong>Student:</strong> ${escapeHtml(studentName)}</span>` : ''}
      ${enquiryNumber ? `<span><strong>Enquiry No:</strong> ${escapeHtml(enquiryNumber)}</span>` : ''}
      <span><strong>Printed:</strong> ${escapeHtml(printedDate)}</span>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Document</th>
        <th style="text-align: center; width: 120px;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="footer">
    Generated from Admissions — Document checklist for joining.
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  const div = { innerHTML: '' };
  const span = typeof document !== 'undefined' ? document.createElement('span') : null;
  if (span) {
    span.textContent = text;
    return span.innerHTML;
  }
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Reusable printable document checklist. Opens a new window with only the
 * checklist content and triggers the browser print dialog so the user
 * gets a clean, styled printout.
 */
export function PrintableDocumentChecklist({
  documentLabels,
  documents,
  title = DEFAULT_TITLE,
  studentName,
  enquiryNumber,
  printedDate,
  printButtonLabel = 'Print checklist',
  className,
  renderButton = true,
  onPrintOpen,
  onPrintClose,
}: PrintableDocumentChecklistProps) {
  const handlePrint = useCallback(() => {
    if (typeof document === 'undefined') return;
    onPrintOpen?.();
    const printedAt =
      printedDate ||
      new Date().toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    const html = getPrintDocumentHtml({
      title,
      documentLabels,
      documents,
      studentName,
      enquiryNumber,
      printedDate: printedAt,
    });
    // Hidden iframe: only the print dialog is shown, no new window or tab
    const iframe = document.createElement('iframe');
    iframe.setAttribute('style', 'position:absolute;width:0;height:0;border:0;overflow:hidden;');
    iframe.setAttribute('title', title);
    document.body.appendChild(iframe);
    let done = false;
    let printTriggered = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      if (iframe.parentNode) iframe.remove();
      onPrintClose?.();
    };
    const triggerPrint = () => {
      if (printTriggered) return;
      printTriggered = true;
      const win = iframe.contentWindow;
      if (!win || !iframe.parentNode) {
        cleanup();
        return;
      }
      win.focus();
      win.print();
      win.onafterprint = cleanup;
    };
    iframe.onload = triggerPrint;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      cleanup();
      return;
    }
    iframeDoc.open();
    iframeDoc.write(html);
    iframeDoc.close();
    // Fallback: if onload never fires (e.g. in some browsers), trigger print once after a short delay
    setTimeout(() => {
      if (!printTriggered) triggerPrint();
    }, 300);
  }, [
    title,
    documentLabels,
    documents,
    studentName,
    enquiryNumber,
    printedDate,
    onPrintOpen,
    onPrintClose,
  ]);

  if (!renderButton) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handlePrint}
      className={className}
    >
      {printButtonLabel}
    </Button>
  );
}

export default PrintableDocumentChecklist;
