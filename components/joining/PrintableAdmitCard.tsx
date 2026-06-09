'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { courseAPI } from '@/lib/api';
import { escapePrintHtml, printHtmlDocument } from '@/lib/printHtml';
import { isJoiningDocumentChecklistKeyVisible } from '@/lib/joiningDocumentChecklist';
import { showToast } from '@/lib/toast';
import type { Admission, Joining, JoiningDocumentStatus, JoiningDocuments } from '@/types';

export type AdmitCardDocumentChecklist = {
  labels: Record<string, string>;
  documents: Record<string, JoiningDocumentStatus | undefined>;
};

export type AdmitCardPrintStudent = {
  studentName: string;
  admissionNumber?: string;
  program: string;
  branch: string;
  quota?: string;
  dateOfJoining?: string;
  studentPhone: string;
  fatherPhone: string;
  studentPhotoSrc?: string | null;
  collegeName?: string;
  documentChecklist?: AdmitCardDocumentChecklist;
};

const ACKNOWLEDGEMENT_DOCUMENT_LABELS: Record<keyof JoiningDocuments, string> = {
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

export function buildAdmitCardDocumentChecklist(
  documents: JoiningDocuments,
  quota?: string | null
): AdmitCardDocumentChecklist {
  const labels: Record<string, string> = {};
  const statuses: Record<string, JoiningDocumentStatus | undefined> = {};
  (Object.entries(ACKNOWLEDGEMENT_DOCUMENT_LABELS) as [keyof JoiningDocuments, string][]).forEach(
    ([key, label]) => {
      if (!isJoiningDocumentChecklistKeyVisible(key, quota)) return;
      labels[key] = label;
      statuses[key] = documents[key] || 'pending';
    }
  );
  return { labels, documents: statuses };
}

function formatAdmitCardDate(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export const DEFAULT_ADMISSION_CONTACT_DETAILS =
  'Mobile: +91 73820 15999\nMail: admissions@pydah.edu.in';

export const EMPTY_COLLEGE_ADDRESS_PLACEHOLDER = '(_____)';

export type AdmitCardPaperSize = 'A5' | 'A4';

const PAPER_DIMENSIONS: Record<AdmitCardPaperSize, { widthMm: number; heightMm: number; label: string }> =
  {
    A5: { widthMm: 148, heightMm: 210, label: 'A5 (148 × 210 mm)' },
    A4: { widthMm: 210, heightMm: 297, label: 'A4 (210 × 297 mm)' },
  };

export type AdmitCardAssets = {
  collegeName?: string;
  collegeAddress?: string;
  feeQrImage?: string | null;
  /** True when a QR exists in the DB but must be fetched via /fee-qr-image. */
  hasFeeQrImage?: boolean;
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
  if (s.startsWith('blob:')) return s;
  return null;
}

function parseAdmitCardAssetsResponse(response: unknown): AdmitCardAssets {
  const root = response as { data?: AdmitCardAssets } | AdmitCardAssets | null | undefined;
  const payload =
    root && typeof root === 'object' && 'data' in root && root.data && typeof root.data === 'object'
      ? root.data
      : root;
  return (payload as AdmitCardAssets) || {};
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image blob'));
    reader.readAsDataURL(blob);
  });
}

/** Downscale large QR/photo blobs so print HTML stays small enough for the browser. */
function compressImageDataUrlForPrint(src: string, maxDim = 420): Promise<string> {
  if (typeof document === 'undefined') return Promise.resolve(src);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(src);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

async function resolveFeeQrForPrint(
  courseId: string,
  assets: AdmitCardAssets
): Promise<string | null> {
  const inline = safeImageSrcForPrint(assets.feeQrImage);
  if (inline) {
    if (inline.startsWith('data:image/') && inline.length > 180_000) {
      return compressImageDataUrlForPrint(inline);
    }
    return inline;
  }

  if (!assets.hasFeeQrImage) return null;

  try {
    const blob = await courseAPI.getFeeQrImageBlob(courseId);
    if (!blob || blob.size === 0) return null;
    const dataUrl = await blobToDataUrl(blob);
    return compressImageDataUrlForPrint(dataUrl);
  } catch {
    return null;
  }
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

function buildAdmitCardPrintStyles(paperSize: AdmitCardPaperSize): string {
  const isA4 = paperSize === 'A4';
  const { widthMm, heightMm } = PAPER_DIMENSIONS[paperSize];
  const pageSizeName = isA4 ? 'A4 portrait' : 'A5 portrait';
  const pad = isA4 ? '8mm 10mm' : '5mm 6mm';
  const rightCol = isA4 ? '52mm' : '36mm';
  const photoW = isA4 ? '45mm' : '32mm';
  const photoH = isA4 ? '52mm' : '38mm';
  const qrSize = isA4 ? '48mm' : '34mm';
  const collegeNameFs = isA4 ? '22px' : '18px';
  const collegeAddrFs = isA4 ? '11px' : '10px';
  const cardTitleFs = isA4 ? '16px' : '14px';
  const detailsFs = isA4 ? '12px' : '11px';
  const docTableFs = isA4 ? '10px' : '9.5px';
  const sectionFs = isA4 ? '11px' : '10px';

  return `
  @page {
    size: ${pageSizeName};
    size: ${widthMm}mm ${heightMm}mm;
    margin: 0;
  }
  * { box-sizing: border-box; }
  html, body {
    width: ${widthMm}mm;
    margin: 0;
    padding: 0;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #111827;
    background: #fff;
  }
  .print-page {
    width: ${widthMm}mm;
    max-width: ${widthMm}mm;
    margin: 0;
    padding: ${pad};
    border: 1.5px solid #1e3a8a;
    overflow: hidden;
    page-break-after: always;
    page-break-inside: avoid;
  }
  .card-shell {
    width: 100%;
  }
  .college-header-block {
    flex-shrink: 0;
    border-bottom: 2px solid #1e3a8a;
    padding-bottom: 4px;
    margin-bottom: 4px;
  }
  .college-name-header {
    text-align: center;
    font-size: ${collegeNameFs};
    font-weight: 800;
    line-height: 1.25;
    padding: 2px 4px 2px;
    color: #1e3a8a;
  }
  .college-address {
    text-align: center;
    font-size: ${collegeAddrFs};
    font-weight: 600;
    line-height: 1.35;
    color: #334155;
    padding: 0 4px 2px;
  }
  .card-title {
    text-align: center;
    margin: 4px 0 6px;
    font-size: ${cardTitleFs};
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #1e40af;
  }
  .body-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) ${rightCol};
    gap: 3mm;
    align-items: start;
    margin-bottom: 2mm;
  }
  .left-col {
    min-width: 0;
  }
  .right-col {
    width: ${rightCol};
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2mm;
    flex-shrink: 0;
  }
  .photo {
    width: ${photoW};
    height: ${photoH};
    max-height: ${photoH};
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
    font-size: 11px;
    font-weight: 600;
  }
  .details-table {
    width: 100%;
    border-collapse: collapse;
    font-size: ${detailsFs};
    table-layout: fixed;
  }
  .details-table tr {
    height: 1.5em;
  }
  .details-table td {
    padding: 2px 0;
    vertical-align: middle;
    border-bottom: 1px dotted #e2e8f0;
    word-break: break-word;
    line-height: 1.35;
  }
  .details-table .lbl {
    width: 40%;
    color: #475569;
    font-weight: 600;
    padding-right: 4px;
  }
  .details-table .val {
    font-weight: 700;
    color: #0f172a;
  }
  .doc-checklist {
    margin-top: 2mm;
    min-height: 0;
    overflow: hidden;
  }
  .doc-table {
    width: 100%;
    border-collapse: collapse;
    font-size: ${docTableFs};
    table-layout: fixed;
  }
  .doc-table th {
    padding: 3px 4px;
    text-align: left;
    font-size: 9px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #475569;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
  }
  .doc-table th.status-col {
    width: 28%;
    text-align: center;
  }
  .doc-table td {
    padding: 2px 4px;
    vertical-align: middle;
    border: 1px solid #e2e8f0;
    line-height: 1.3;
    word-break: break-word;
  }
  .doc-table td.status-cell {
    text-align: center;
    font-weight: 700;
  }
  .doc-table td.status-received {
    color: #15803d;
  }
  .doc-table td.status-pending {
    color: #b45309;
  }
  .footer-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 2mm;
    align-items: start;
    border-top: 1px solid #cbd5e1;
    padding-top: 2mm;
    margin-top: 3mm;
  }
  .contact-section,
  .payment-note-section {
    min-width: 0;
  }
  .section-title {
    margin: 0 0 4px;
    font-size: ${sectionFs};
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #1e40af;
  }
  .contact-box {
    font-size: ${sectionFs};
    line-height: 1.45;
    color: #334155;
    padding: 5px 7px;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: #f8fafc;
  }
  .fee-qr {
    width: ${qrSize};
    height: ${qrSize};
    max-width: ${qrSize};
    max-height: ${qrSize};
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
    font-size: 9px;
    color: #64748b;
    padding: 6px;
    width: ${qrSize};
    height: ${qrSize};
    max-height: ${qrSize};
  }
  .qr-note {
    padding: 5px 7px;
    border: 1.5px dashed #2563eb;
    border-radius: 4px;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: ${sectionFs};
    font-weight: 700;
    text-align: left;
    line-height: 1.45;
  }
  @media print {
    html, body {
      width: ${widthMm}mm !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-page {
      width: ${widthMm}mm !important;
      max-width: ${widthMm}mm !important;
      margin: 0 !important;
      padding: ${pad};
      border: 1.5px solid #1e3a8a;
      overflow: hidden;
      page-break-after: always;
      page-break-inside: avoid;
    }
    .details-table tr {
      height: 1.3em;
    }
    .details-table td {
      padding: 1px 0;
    }
    .doc-table th {
      font-size: ${isA4 ? '8.5px' : '7px'};
      padding: 1px 2px;
    }
    .doc-table td {
      padding: 1px 2px;
      line-height: 1.2;
    }
    .section-title {
      margin-bottom: 2px;
    }
    .contact-box,
    .qr-note {
      line-height: 1.35;
      padding: 3px 4px;
    }
  }
`;
}

function buildDocumentChecklistTableHtml(checklist?: AdmitCardDocumentChecklist): string {
  if (!checklist || Object.keys(checklist.labels).length === 0) return '';

  const statuses = checklist.documents ?? {};
  const rows = Object.entries(checklist.labels)
    .map(([key, label]) => {
      const isReceived = statuses[key] === 'received';
      const status = isReceived ? 'Received' : 'Pending';
      const statusClass = isReceived ? 'status-received' : 'status-pending';
      return `
        <tr>
          <td>${escapePrintHtml(label)}</td>
          <td class="status-cell ${statusClass}">${escapePrintHtml(status)}</td>
        </tr>`;
    })
    .join('');

  return `
    <div class="doc-checklist">
      <p class="section-title">Documents checklist</p>
      <table class="doc-table">
        <thead>
          <tr>
            <th>Document</th>
            <th class="status-col">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>`;
}

export function formatCollegeAddressForPrint(address?: string | null): string {
  const trimmed = String(address ?? '').trim();
  if (!trimmed) return EMPTY_COLLEGE_ADDRESS_PLACEHOLDER;
  const inner = trimmed.replace(/^\(\s*([\s\S]*?)\s*\)$/, '$1').trim();
  return `( ${inner} )`;
}

function buildCardHtml(student: AdmitCardPrintStudent, assets: AdmitCardAssets): string {
  const photoSrc = safeImageSrcForPrint(student.studentPhotoSrc);
  const qrSrc = safeImageSrcForPrint(assets.feeQrImage);
  const collegeName =
    student.collegeName?.trim() || assets.collegeName?.trim() || 'Acknowledgement Card';
  const collegeAddress = formatCollegeAddressForPrint(assets.collegeAddress);
  const contactHtml = escapePrintHtml(
    assets.admissionContactDetails?.trim() || DEFAULT_ADMISSION_CONTACT_DETAILS
  ).replace(/\n/g, '<br/>');
  const qrNote = escapePrintHtml(assets.feeQrPaymentNote || 'Pay the fee through the QR');

  const detailRow = (label: string, value: unknown) => `
    <tr>
      <td class="lbl">${escapePrintHtml(label)}</td>
      <td class="val">${escapePrintHtml(String(value ?? '').trim() || '—')}</td>
    </tr>`;

  const photoBlock = photoSrc
    ? `<img src="${photoSrc.replace(/"/g, '&quot;')}" alt="Student photo" class="photo" />`
    : `<div class="photo photo-placeholder">Photo</div>`;

  const qrBlock = qrSrc
    ? `<img src="${qrSrc.replace(/"/g, '&quot;')}" alt="Fee payment QR" class="fee-qr" />`
    : `<div class="fee-qr fee-qr-missing">Fee QR not configured</div>`;

  return `
    <div class="card-shell">
      <div class="college-header-block">
        <div class="college-name-header">${escapePrintHtml(collegeName)}</div>
        <div class="college-address">${escapePrintHtml(collegeAddress)}</div>
      </div>
      <div class="card-title">Acknowledgement Card</div>
      <div class="body-grid">
        <div class="left-col">
          <table class="details-table">
            ${detailRow('Student name', student.studentName)}
            ${detailRow('Admission no.', student.admissionNumber || '—')}
            ${detailRow('Program', student.program)}
            ${detailRow('Branch', student.branch)}
            ${detailRow('Student quota', student.quota || '—')}
            ${detailRow('Date of joining', student.dateOfJoining || '—')}
            ${detailRow('Student phone', student.studentPhone)}
            ${detailRow('Father phone', student.fatherPhone)}
          </table>
          ${buildDocumentChecklistTableHtml(student.documentChecklist)}
        </div>
        <div class="right-col">
          ${photoBlock}
          ${qrBlock}
        </div>
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

/** Build printable HTML — one acknowledgement card per sheet (A5 or A4). */
export function buildAdmitCardPageHtml(
  entries: Array<{ student: AdmitCardPrintStudent; assets: AdmitCardAssets }>,
  paperSize: AdmitCardPaperSize = 'A5'
): string {
  const titleName = entries[0]?.student.studentName || 'Acknowledgement cards';
  const { widthMm, heightMm, label } = PAPER_DIMENSIONS[paperSize];

  const pages = entries
    .map(
      (entry) => `
  <section class="print-page" data-paper="${paperSize}">
    ${buildCardHtml(entry.student, entry.assets)}
  </section>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${widthMm}mm, initial-scale=1" />
  <title>Acknowledgement Card (${label}) — ${escapePrintHtml(titleName)}</title>
  <style>${buildAdmitCardPrintStyles(paperSize)}</style>
</head>
<body class="print-body" data-paper="${paperSize}" style="width:${widthMm}mm;margin:0;padding:0;">
  ${pages}
</body>
</html>`;
}

/** @deprecated Use buildAdmitCardPageHtml — kept for any external callers. */
export function buildAdmitCardA4PageHtml(
  entries: Array<{ student: AdmitCardPrintStudent; assets: AdmitCardAssets }>
): string {
  return buildAdmitCardPageHtml(entries, 'A4');
}

function buildAdmitCardHtml(
  student: AdmitCardPrintStudent,
  assets: AdmitCardAssets,
  paperSize: AdmitCardPaperSize = 'A5'
): string {
  return buildAdmitCardPageHtml([{ student, assets }], paperSize);
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
      const assets = parseAdmitCardAssetsResponse(response);
      const feeQrImage = await resolveFeeQrForPrint(cid, assets);
      let studentForPrint = student;
      const photoSrc = safeImageSrcForPrint(student.studentPhotoSrc);
      if (photoSrc?.startsWith('data:image/') && photoSrc.length > 180_000) {
        try {
          studentForPrint = {
            ...student,
            studentPhotoSrc: await compressImageDataUrlForPrint(photoSrc, 320),
          };
        } catch {
          // Keep original photo if compression fails.
        }
      }
      const html = buildAdmitCardHtml(studentForPrint, { ...assets, feeQrImage }, 'A5');
      printHtmlDocument(html, 'Acknowledgement card — A5');
      if (!feeQrImage) {
        showToast.error(
          assets.hasFeeQrImage
            ? 'Acknowledgement card opened, but the fee QR image could not be loaded.'
            : 'Acknowledgement card opened, but no fee QR is configured for this course in the student database.'
        );
      }
    } catch {
      showToast.error('Could not load acknowledgement card data. Please try again.');
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
          : 'Print acknowledgement card on A5 (148 × 210 mm)')
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
    courseInfo: { course?: string; branch?: string; courseId?: string; quota?: string };
    documents?: JoiningDocuments;
  };
  lead?: { name?: string; phone?: string; fatherPhone?: string } | null;
  admissionNumber?: string | null;
  collegeName?: string | null;
  dateOfJoining?: string | null;
  documentChecklist?: AdmitCardDocumentChecklist;
  registrationFormData?: Record<string, unknown>;
  application?: Joining | Admission;
}): AdmitCardPrintStudent & { courseId: string } {
  const photoFromApp = input.application ? pickStudentPortraitForAdmitCard(input.application) : null;
  const photoFromReg = pickStudentPortraitFromRegistration(input.registrationFormData);
  const quota = String(input.formState.courseInfo.quota ?? '').trim();
  const documentChecklist =
    input.documentChecklist ??
    (input.formState.documents
      ? buildAdmitCardDocumentChecklist(input.formState.documents, quota)
      : undefined);

  return {
    courseId: String(input.formState.courseInfo.courseId ?? '').trim(),
    studentName: input.formState.studentInfo.name || input.lead?.name || '—',
    admissionNumber: input.admissionNumber || undefined,
    program: input.formState.courseInfo.course || '—',
    branch: input.formState.courseInfo.branch || '—',
    quota: quota || '—',
    dateOfJoining: formatAdmitCardDate(input.dateOfJoining ?? new Date().toISOString()),
    studentPhone: input.formState.studentInfo.phone || input.lead?.phone || '—',
    fatherPhone: input.formState.parents.father.phone || input.lead?.fatherPhone || '—',
    studentPhotoSrc: photoFromApp || photoFromReg,
    collegeName: input.collegeName?.trim() || undefined,
    documentChecklist,
  };
}
