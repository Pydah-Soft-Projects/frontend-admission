'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import type { Joining, Admission, PaymentSummary, PaymentTransaction } from '@/types';

function escapeHtml(text: string | undefined): string {
  const s = text ?? '';
  if (typeof document !== 'undefined') {
    const span = document.createElement('span');
    span.textContent = s;
    return span.innerHTML;
  }
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(amount?: number | null): string {
  if (amount === undefined || amount === null || Number.isNaN(amount)) return '—';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(amount);
  } catch {
    return String(amount);
  }
}

function formatDateTime(value?: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

type ApplicationData = Joining | Admission;

export interface PrintableStudentApplicationProps {
  /** Joining or Admission (same shape for application content) */
  application: ApplicationData;
  /** Enquiry number from lead */
  enquiryNumber?: string;
  /** Admission number (when converted) */
  admissionNumber?: string;
  /** Course display name (from lookup) */
  courseName?: string;
  /** Branch display name (from lookup) */
  branchName?: string;
  /** Payment summary if available */
  paymentSummary?: PaymentSummary | null;
  /** Recent transactions for print */
  transactions?: PaymentTransaction[];
  /** Title shown at top of print */
  title?: string;
  /** Label for the print button */
  printButtonLabel?: string;
  /** Optional class for the button */
  className?: string;
  /** Render only the button (default true) */
  renderButton?: boolean;
  /** Optional: callback when print dialog is opened */
  onPrintOpen?: () => void;
  /** Optional: callback when print dialog is closed */
  onPrintClose?: () => void;
}

const DEFAULT_TITLE = 'Student Application';

const DOCUMENT_LABELS: Record<string, string> = {
  ssc: 'SSC',
  inter: 'Intermediate',
  ugOrPgCmm: 'UG / PG CMM',
  transferCertificate: 'Transfer Certificate',
  studyCertificate: 'Study Certificate',
  aadhaarCard: 'Aadhaar Card',
  photos: 'Photos (5)',
  incomeCertificate: 'Income Certificate',
  casteCertificate: 'Caste Certificate',
  cetRankCard: 'CET Rank Card',
  cetHallTicket: 'CET Hall Ticket',
  allotmentLetter: 'Allotment Letter',
  joiningReport: 'Joining Report',
  bankPassBook: 'Bank Pass Book',
  rationCard: 'Ration Card',
};

/**
 * Builds the HTML string for the printable full student application.
 * Uses inline styles so the print window is self-contained.
 */
function getPrintApplicationHtml(props: {
  application: ApplicationData;
  title: string;
  enquiryNumber?: string;
  admissionNumber?: string;
  courseName?: string;
  branchName?: string;
  paymentSummary?: PaymentSummary | null;
  transactions?: PaymentTransaction[];
  printedDate: string;
}): string {
  const {
    application,
    title,
    enquiryNumber,
    admissionNumber,
    courseName,
    branchName,
    paymentSummary,
    transactions = [],
    printedDate,
  } = props;

  const student = application.studentInfo;
  const course = application.courseInfo;
  const parents = application.parents;
  const address = application.address;
  const reservation = application.reservation;
  const qualifications = application.qualifications;
  const educationHistory = application.educationHistory ?? [];
  const documents = application.documents ?? {};
  const siblings = (application as Joining).siblings ?? (application as Admission).siblings ?? [];

  const section = (heading: string, body: string) => `
    <div class="section">
      <h2 class="section-title">${escapeHtml(heading)}</h2>
      <div class="section-body">${body}</div>
    </div>`;

  const row = (label: string, value: string | undefined) =>
    `<div class="row"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value ?? '—')}</span></div>`;

  let body = '';

  body += `<div class="meta">`;
  if (enquiryNumber) body += `<span><strong>Enquiry No:</strong> ${escapeHtml(enquiryNumber)}</span>`;
  if (admissionNumber) body += `<span><strong>Admission No:</strong> ${escapeHtml(admissionNumber)}</span>`;
  body += `<span><strong>Printed:</strong> ${escapeHtml(printedDate)}</span>`;
  body += `</div>`;

  body += section(
    'Student & Course Information',
    `
    <div class="two-col">
      <div>
        ${row('Full Name', student?.name)}
        ${row('Phone', student?.phone)}
        ${row('Gender', student?.gender)}
        ${row('Date of Birth', student?.dateOfBirth)}
        ${row('Aadhaar', student?.aadhaarNumber)}
      </div>
      <div>
        ${row('Course', courseName || course?.course)}
        ${row('Branch', branchName || course?.branch)}
        ${row('Quota', course?.quota)}
      </div>
    </div>`
  );

  if (parents) {
    body += section(
      'Parents Information',
      `
      <div class="two-col">
        <div>
          <h3 class="sub">Father</h3>
          ${row('Name', parents.father?.name)}
          ${row('Phone', parents.father?.phone)}
          ${row('Aadhaar', parents.father?.aadhaarNumber)}
        </div>
        <div>
          <h3 class="sub">Mother</h3>
          ${row('Name', parents.mother?.name)}
          ${row('Phone', parents.mother?.phone)}
          ${row('Aadhaar', parents.mother?.aadhaarNumber)}
        </div>
      </div>`
    );
  }

  if (address?.communication) {
    const comm = address.communication;
    const addrLines = [
      comm.doorOrStreet,
      comm.landmark ? `Near: ${comm.landmark}` : '',
      [comm.villageOrCity, comm.mandal, comm.district].filter(Boolean).join(', '),
      comm.pinCode ? `PIN: ${comm.pinCode}` : '',
    ].filter(Boolean);
    body += section('Address & Communication', `<div class="block">${addrLines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>`);
  }

  if (address?.relatives?.length) {
    const relList = address.relatives.map((r) => `${escapeHtml(r.name || '')} (${escapeHtml(r.relationship || '')})`).join(', ');
    body += section('Relatives', `<div class="block">${relList}</div>`);
  }

  if (reservation) {
    const other = reservation.other?.length ? reservation.other.join(', ') : '';
    body += section('Reservation', `${row('Category', (reservation.general || '').toUpperCase())}${other ? row('Other', other) : ''}`);
  }

  if (qualifications) {
    const q = [
      qualifications.ssc ? 'SSC' : null,
      qualifications.interOrDiploma ? 'Inter/Diploma' : null,
      qualifications.ug ? 'UG' : null,
      qualifications.mediums?.length ? `Mediums: ${qualifications.mediums.join(', ')}` : null,
    ].filter(Boolean);
    body += section('Qualifications', `<div class="block">${q.map((x) => `<p>${escapeHtml(String(x))}</p>`).join('')}</div>`);
  }

  if (educationHistory.length) {
    const eduRows = educationHistory.map(
      (e) =>
        `<div class="edu-item">
          <strong>${escapeHtml((e.level || '').replace('_', ' '))}</strong> — ${escapeHtml(e.courseOrBranch || '')} (${escapeHtml(e.yearOfPassing || '')})<br/>
          <span class="muted">${escapeHtml(e.institutionName || '')}</span>${e.totalMarksOrGrade ? ` — ${escapeHtml(e.totalMarksOrGrade)}` : ''}
        </div>`
    );
    body += section('Education History', `<div class="block">${eduRows.join('')}</div>`);
  }

  if (siblings.length) {
    const sibRows = siblings.map((s) => `${escapeHtml(s.name || '')} (${escapeHtml(s.relation || '')})`).join('; ');
    body += section('Siblings', `<div class="block">${sibRows}</div>`);
  }

  const docEntries = Object.entries(documents);
  if (docEntries.length) {
    const docRows = docEntries
      .map(([key, val]) => `<tr><td>${escapeHtml(DOCUMENT_LABELS[key] || key)}</td><td class="cap">${escapeHtml(String(val || 'pending'))}</td></tr>`)
      .join('');
    body += section(
      'Documents Status',
      `<table class="mini-table"><thead><tr><th>Document</th><th>Status</th></tr></thead><tbody>${docRows}</tbody></table>`
    );
  }

  if (paymentSummary) {
    let payBody = `
      ${row('Total Fee', formatCurrency(paymentSummary.totalFee))}
      ${row('Paid', formatCurrency(paymentSummary.totalPaid))}
      ${row('Balance', formatCurrency(paymentSummary.balance))}
      ${row('Status', paymentSummary.status?.toUpperCase() || '—')}
    `;
    if (transactions.length) {
      payBody += `<h3 class="sub mt">Payment History</h3><div class="block">`;
      transactions.forEach((t) => {
        payBody += `<p>${formatCurrency(t.amount)} — ${formatDateTime(t.createdAt)} (${escapeHtml(t.status || '')})</p>`;
      });
      payBody += `</div>`;
    }
    body += section('Payment Information', payBody);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; padding: 24px; color: #111827; background: #fff; font-size: 14px; }
    .header { margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb; }
    .header h1 { margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #111827; }
    .meta { font-size: 13px; color: #6b7280; }
    .meta span { margin-right: 20px; }
    .section { margin-top: 20px; break-inside: avoid; }
    .section-title { font-size: 16px; font-weight: 700; color: #1f2937; margin: 0 0 10px 0; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; }
    .section-body { font-size: 14px; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .row { margin-bottom: 6px; }
    .row .label { color: #6b7280; margin-right: 8px; }
    .row .value { font-weight: 500; color: #111827; }
    .sub { font-size: 13px; font-weight: 600; color: #374151; margin: 12px 0 6px 0; }
    .sub.mt { margin-top: 16px; }
    .block p { margin: 4px 0; }
    .block .muted { color: #6b7280; font-size: 13px; }
    .edu-item { margin-bottom: 10px; padding-left: 8px; border-left: 2px solid #3b82f6; }
    .mini-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
    .mini-table th, .mini-table td { padding: 8px 10px; border: 1px solid #e5e7eb; text-align: left; }
    .mini-table th { background: #f9fafb; font-weight: 600; }
    .cap { text-transform: capitalize; }
    .footer { margin-top: 24px; padding-top: 12px; font-size: 12px; color: #9ca3af; }
    @media print { body { padding: 16px; } .section { break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">
      ${enquiryNumber ? `<span><strong>Enquiry No:</strong> ${escapeHtml(enquiryNumber)}</span>` : ''}
      ${admissionNumber ? `<span><strong>Admission No:</strong> ${escapeHtml(admissionNumber)}</span>` : ''}
      <span><strong>Printed:</strong> ${escapeHtml(printedDate)}</span>
    </div>
  </div>
  ${body}
  <div class="footer">Generated from Admissions — Complete student application.</div>
</body>
</html>`;
}

/**
 * Reusable printable full student application. Uses the same hidden-iframe
 * print mechanism as PrintableDocumentChecklist (single print dialog, cleanup on afterprint).
 */
export function PrintableStudentApplication({
  application,
  enquiryNumber,
  admissionNumber,
  courseName,
  branchName,
  paymentSummary,
  transactions,
  title = DEFAULT_TITLE,
  printButtonLabel = 'Print application',
  className,
  renderButton = true,
  onPrintOpen,
  onPrintClose,
}: PrintableStudentApplicationProps) {
  const handlePrint = useCallback(() => {
    if (typeof document === 'undefined') return;
    onPrintOpen?.();
    const printedAt = new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    const html = getPrintApplicationHtml({
      application,
      title,
      enquiryNumber,
      admissionNumber,
      courseName,
      branchName,
      paymentSummary: paymentSummary ?? null,
      transactions: transactions ?? [],
      printedDate: printedAt,
    });
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
    setTimeout(() => {
      if (!printTriggered) triggerPrint();
    }, 300);
  }, [
    application,
    title,
    enquiryNumber,
    admissionNumber,
    courseName,
    branchName,
    paymentSummary,
    transactions,
    onPrintOpen,
    onPrintClose,
  ]);

  if (!renderButton) return null;

  return (
    <Button type="button" variant="outline" onClick={handlePrint} className={className}>
      {printButtonLabel}
    </Button>
  );
}

export default PrintableStudentApplication;
