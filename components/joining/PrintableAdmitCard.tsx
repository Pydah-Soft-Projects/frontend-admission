'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { courseAPI } from '@/lib/api';
import { escapePrintHtml, printHtmlDocument } from '@/lib/printHtml';
import { showToast } from '@/lib/toast';
import type { Admission, Joining } from '@/types';

export type AdmitCardPrintStudent = {
  studentName: string;
  admissionNumber?: string;
  program: string;
  branch: string;
  studentPhone: string;
  fatherPhone: string;
  studentPhotoSrc?: string | null;
  collegeName?: string;
};

export const DEFAULT_ADMISSION_CONTACT_DETAILS =
  'Mobile: +91 73820 15999\nMail: admissions@pydah.edu.in';

export type AdmitCardAssets = {
  collegeName?: string;
  feeQrImage?: string | null;
  admissionContactDetails?: string;
  feeQrPaymentNote?: string;
};

const STUDENT_PHOTO_REG_KEYS = [
  'student_photo',
  'studentPhoto',
  'applicant_photo',
  'applicantPhoto',
  'passport_photo',
  'passportPhoto',
];

function safeImageSrcForPrint(url?: string | null): string | null {
  const s = String(url ?? '').trim();
  if (!s) return null;
  if (/^data:image\//i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return s;
  return null;
}

function pickStudentPortraitFromRegistration(
  registrationFormData?: Record<string, unknown>
): string | null {
  const reg = registrationFormData;
  if (reg && typeof reg === 'object') {
    for (const k of STUDENT_PHOTO_REG_KEYS) {
      const v = reg[k];
      if (typeof v === 'string' && v.trim()) {
        const ok = safeImageSrcForPrint(v);
        if (ok) return ok;
      }
    }
    for (const [k, v] of Object.entries(reg)) {
      if (typeof v !== 'string' || !v.trim()) continue;
      const key = k.toLowerCase().replace(/\s+/g, '_');
      if (key.includes('father') || key.includes('mother') || key.includes('parent')) continue;
      if (
        (key.includes('student') || key.includes('applicant')) &&
        (key.includes('photo') || key.includes('picture') || key.includes('image'))
      ) {
        const ok = safeImageSrcForPrint(v);
        if (ok) return ok;
      }
    }
  }
  return null;
}

export function pickStudentPortraitForAdmitCard(
  application: Joining | Admission
): string | null {
  const fromReg = pickStudentPortraitFromRegistration(
    application.registrationFormData as Record<string, unknown> | undefined
  );
  if (fromReg) return fromReg;
  const si = application.studentInfo as { photo?: string } | undefined;
  return safeImageSrcForPrint(si?.photo);
}

/** One admit card = top or bottom half of an A4 sheet (2 students per A4 page). */
const ADMIT_CARD_PRINT_STYLES = `
  @page { size: A4 portrait; margin: 5mm; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #111827;
    background: #fff;
  }
  .a4-page {
    width: 200mm;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
  }
  .a4-page--single {
    height: auto;
  }
  .a4-page--double {
    height: 287mm;
  }
  .half-sheet {
    flex: 0 0 50%;
    height: 143.5mm;
    max-height: 143.5mm;
    overflow: hidden;
    padding: 2.5mm 4mm 2.5mm;
    position: relative;
    border-left: 2px solid #1e3a8a;
    border-right: 2px solid #1e3a8a;
  }
  .card-shell {
    width: 100%;
  }
  .a4-page--single .half-sheet {
    flex: 0 0 auto;
    height: auto;
    max-height: none;
    overflow: visible;
  }
  .a4-page > .half-sheet:first-child {
    border-top: 2px solid #1e3a8a;
  }
  .a4-page > .half-sheet:last-child {
    border-bottom: 2px solid #1e3a8a;
  }
  .half-sheet--filled {
    border-bottom: 1px dashed #64748b;
  }
  .a4-page > .half-sheet--filled:last-child {
    border-bottom: 2px solid #1e3a8a;
  }
  .college-name-header {
    text-align: center;
    font-size: 13px;
    font-weight: 800;
    line-height: 1.2;
    padding: 1px 2px 4px;
    border-bottom: 2px solid #1e3a8a;
    color: #1e3a8a;
  }
  .card-title {
    text-align: center;
    margin: 3px 0 4px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #1e40af;
  }
  .main-grid {
    display: grid;
    grid-template-columns: 32mm minmax(0, 1fr) 38mm;
    gap: 3mm;
    align-items: start;
    margin-bottom: 3mm;
  }
  .photo-cell {
    width: 32mm;
  }
  .qr-cell {
    width: 38mm;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    overflow: hidden;
  }
  .photo {
    width: 32mm;
    height: 38mm;
    max-height: 38mm;
    object-fit: cover;
    border: 1px solid #94a3b8;
    border-radius: 3px;
    display: block;
  }
  .photo-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f1f5f9;
    color: #64748b;
    font-size: 9px;
    font-weight: 600;
  }
  .details-cell {
    min-width: 0;
    padding-top: 1mm;
  }
  .details-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9px;
    table-layout: fixed;
  }
  .details-table tr {
    height: 1.45em;
  }
  .details-table td {
    padding: 2px 0;
    vertical-align: middle;
    border-bottom: 1px dotted #e2e8f0;
    word-break: break-word;
    line-height: 1.3;
  }
  .details-table .lbl {
    width: 38%;
    color: #475569;
    font-weight: 600;
    padding-right: 4px;
  }
  .details-table .val {
    font-weight: 700;
    color: #0f172a;
  }
  .footer-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 3mm;
    align-items: start;
    border-top: 1px solid #cbd5e1;
    padding-top: 3mm;
  }
  .contact-section,
  .payment-note-section {
    min-width: 0;
  }
  .section-title {
    margin: 0 0 4px;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #1e40af;
  }
  .contact-box {
    font-size: 9px;
    line-height: 1.4;
    color: #334155;
    padding: 5px 7px;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: #f8fafc;
  }
  .fee-qr {
    width: 38mm;
    height: 38mm;
    max-width: 38mm;
    max-height: 38mm;
    object-fit: contain;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: #fff;
    display: block;
  }
  .fee-qr-missing {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-size: 8px;
    color: #64748b;
    padding: 6px;
    width: 38mm;
    height: 38mm;
    max-height: 38mm;
  }
  .qr-note {
    padding: 5px 7px;
    border: 1.5px dashed #2563eb;
    border-radius: 4px;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 9px;
    font-weight: 700;
    text-align: left;
    line-height: 1.4;
  }
  @media print {
    .a4-page {
      width: auto;
      page-break-after: always;
    }
    .a4-page--single {
      height: auto;
      min-height: 0;
    }
    .a4-page--single .half-sheet {
      height: auto;
      max-height: none;
      overflow: visible;
    }
    .a4-page--double {
      height: 287mm;
      min-height: 287mm;
    }
    .a4-page--double .half-sheet {
      height: 143.5mm;
      max-height: 143.5mm;
    }
  }
`;

function buildHalfSheetHtml(student: AdmitCardPrintStudent, assets: AdmitCardAssets): string {
  const photoSrc = safeImageSrcForPrint(student.studentPhotoSrc);
  const qrSrc = safeImageSrcForPrint(assets.feeQrImage);
  const collegeName =
    student.collegeName?.trim() || assets.collegeName?.trim() || 'Acknowledgement Card';
  const contactHtml = escapePrintHtml(
    assets.admissionContactDetails?.trim() || DEFAULT_ADMISSION_CONTACT_DETAILS
  ).replace(/\n/g, '<br/>');
  const qrNote = escapePrintHtml(assets.feeQrPaymentNote || 'Pay the fee through the QR');

  const detailRow = (label: string, value: string) => `
    <tr>
      <td class="lbl">${escapePrintHtml(label)}</td>
      <td class="val">${escapePrintHtml(value || '—')}</td>
    </tr>`;

  const photoBlock = photoSrc
    ? `<img src="${photoSrc.replace(/"/g, '&quot;')}" alt="Student photo" class="photo" />`
    : `<div class="photo photo-placeholder">Photo</div>`;

  const qrBlock = qrSrc
    ? `<img src="${qrSrc.replace(/"/g, '&quot;')}" alt="Fee payment QR" class="fee-qr" />`
    : `<div class="fee-qr fee-qr-missing">Fee QR not configured</div>`;

  return `
    <div class="card-shell">
      <div class="college-name-header">${escapePrintHtml(collegeName)}</div>
      <div class="card-title">Acknowledgement Card</div>
      <div class="main-grid">
        <div class="photo-cell">${photoBlock}</div>
        <div class="details-cell">
          <table class="details-table">
            ${detailRow('Student name', student.studentName)}
            ${detailRow('Admission no.', student.admissionNumber || '—')}
            ${detailRow('Program', student.program)}
            ${detailRow('Branch', student.branch)}
            ${detailRow('Student phone', student.studentPhone)}
            ${detailRow('Father phone', student.fatherPhone)}
          </table>
        </div>
        <div class="qr-cell">${qrBlock}</div>
      </div>
      <div class="footer-row">
        <div class="contact-section">
          <p class="section-title">Admission contact details</p>
          <div class="contact-box">${contactHtml}</div>
        </div>
        <div class="payment-note-section">
          <p class="section-title">Pay through QR</p>
          <div class="qr-note">${qrNote}</div>
        </div>
      </div>
    </div>`;
}

/** Build A4 HTML with up to 2 half-page admit cards (2 students per sheet). */
export function buildAdmitCardA4PageHtml(
  entries: Array<{ student: AdmitCardPrintStudent; assets: AdmitCardAssets }>
): string {
  const titleName = entries[0]?.student.studentName || 'Acknowledgement cards';
  const cardCount = Math.min(entries.length, 2);
  const pageClass = cardCount === 2 ? 'a4-page a4-page--double' : 'a4-page a4-page--single';

  const filledSheets = entries
    .slice(0, 2)
    .map(
      (entry) => `
  <section class="half-sheet half-sheet--filled">
    ${buildHalfSheetHtml(entry.student, entry.assets)}
  </section>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Acknowledgement Card — ${escapePrintHtml(titleName)}</title>
  <style>${ADMIT_CARD_PRINT_STYLES}</style>
</head>
<body>
  <div class="${pageClass}">
    ${filledSheets}
  </div>
</body>
</html>`;
}

function buildAdmitCardHtml(student: AdmitCardPrintStudent, assets: AdmitCardAssets): string {
  return buildAdmitCardA4PageHtml([{ student, assets }]);
}

export function PrintableAdmitCard({
  courseId,
  student,
  printButtonLabel = 'Print acknowledgement card',
  className,
  size = 'sm',
  disabled,
  disabledTitle,
}: {
  courseId?: string | null;
  student: AdmitCardPrintStudent;
  printButtonLabel?: string;
  className?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  disabledTitle?: string;
}) {
  const [loading, setLoading] = useState(false);

  const handlePrint = useCallback(async () => {
    const cid = String(courseId ?? '').trim();
    if (!cid) return;
    setLoading(true);
    try {
      const response = await courseAPI.getAdmitCardAssets(cid);
      const payload = (response as { data?: AdmitCardAssets })?.data ?? response;
      const assets = (payload as AdmitCardAssets) || {};
      const html = buildAdmitCardHtml(student, assets);
      printHtmlDocument(html, 'Acknowledgement card');
    } catch {
      showToast.error(
        'Could not load acknowledgement card data. Check that the course fee QR is configured in the student database.'
      );
    } finally {
      setLoading(false);
    }
  }, [courseId, student]);

  const isDisabled = disabled || loading || !String(courseId ?? '').trim();

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={() => void handlePrint()}
      className={className}
      disabled={isDisabled}
      title={
        disabledTitle ||
        (!String(courseId ?? '').trim()
          ? 'Select a managed course before printing the acknowledgement card'
          : 'Print acknowledgement card on A4 (half page — 2 per sheet)')
      }
    >
      {loading ? 'Preparing…' : printButtonLabel}
    </Button>
  );
}

/** Build admit-card student fields from joining / admission form state. */
export function buildAdmitCardStudentFromForm(input: {
  formState: {
    studentInfo: { name?: string; phone?: string };
    parents: { father: { phone?: string } };
    courseInfo: { course?: string; branch?: string; courseId?: string };
  };
  lead?: { name?: string; phone?: string; fatherPhone?: string } | null;
  admissionNumber?: string | null;
  collegeName?: string | null;
  registrationFormData?: Record<string, unknown>;
  application?: Joining | Admission;
}): AdmitCardPrintStudent & { courseId: string } {
  const photoFromApp = input.application ? pickStudentPortraitForAdmitCard(input.application) : null;
  const photoFromReg = pickStudentPortraitFromRegistration(input.registrationFormData);
  return {
    courseId: String(input.formState.courseInfo.courseId ?? '').trim(),
    studentName: input.formState.studentInfo.name || input.lead?.name || '—',
    admissionNumber: input.admissionNumber || undefined,
    program: input.formState.courseInfo.course || '—',
    branch: input.formState.courseInfo.branch || '—',
    studentPhone: input.formState.studentInfo.phone || input.lead?.phone || '—',
    fatherPhone: input.formState.parents.father.phone || input.lead?.fatherPhone || '—',
    studentPhotoSrc: photoFromApp || photoFromReg,
    collegeName: input.collegeName?.trim() || undefined,
  };
}
