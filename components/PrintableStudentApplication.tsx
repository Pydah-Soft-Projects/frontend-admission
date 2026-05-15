'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import type { Joining, Admission, PaymentSummary, PaymentTransaction, JoiningDocuments } from '@/types';

type ApplicationData = Joining | Admission;

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

/** Safe for double-quoted HTML attributes (e.g. img src). */
function escapeHtmlAttribute(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;');
}

/** Only allow values suitable for print iframe img src (avoid HTML injection). */
function safeImageSrcForPrint(url?: string | null): string | null {
  const s = String(url ?? '').trim();
  if (!s) return null;
  if (/^data:image\//i.test(s)) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return s;
  return null;
}

/** Application / enquiry number shown in the print header (prop, then admission field, then embedded lead). */
function pickEnquiryFromRegistrationFormData(reg: Record<string, unknown> | undefined): string {
  if (!reg || typeof reg !== 'object') return '';
  const keys = [
    'enquiryNumber',
    'enquiry_number',
    'EnquiryNumber',
    'application_number',
    'applicationNumber',
  ] as const;
  for (const k of keys) {
    const v = reg[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function resolveApplicationNumberForPrint(
  application: ApplicationData,
  enquiryNumberProp?: string
): string {
  const fromProp = String(enquiryNumberProp ?? '').trim();
  if (fromProp) return fromProp;
  const adm = application as Admission;
  if (typeof adm.enquiryNumber === 'string' && adm.enquiryNumber.trim()) {
    return adm.enquiryNumber.trim();
  }
  const admLd = adm.leadData as { enquiryNumber?: string; enquiry_number?: string } | undefined;
  const fromAdmLd = String(admLd?.enquiryNumber ?? admLd?.enquiry_number ?? '').trim();
  if (fromAdmLd) return fromAdmLd;
  const fromAdmReg = pickEnquiryFromRegistrationFormData(
    adm.registrationFormData as Record<string, unknown> | undefined
  );
  if (fromAdmReg) return fromAdmReg;

  const join = application as Joining;
  const fromLead = String(join.lead?.enquiryNumber ?? '').trim();
  if (fromLead) return fromLead;
  const ld = join.leadData as { enquiryNumber?: string; enquiry_number?: string } | undefined;
  const fromLeadData =
    String(ld?.enquiryNumber ?? ld?.enquiry_number ?? '').trim();
  if (fromLeadData) return fromLeadData;
  const fromReg = pickEnquiryFromRegistrationFormData(
    join.registrationFormData as Record<string, unknown> | undefined
  );
  if (fromReg) return fromReg;
  return '';
}

const STUDENT_PHOTO_REG_KEYS = [
  'student_photo',
  'studentPhoto',
  'applicant_photo',
  'applicantPhoto',
  'passport_photo',
  'passportPhoto',
];

function pickStudentPortraitForPrint(application: ApplicationData): string | null {
  const reg = application.registrationFormData;
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
  const si = application.studentInfo as { photo?: string } | undefined;
  return safeImageSrcForPrint(si?.photo);
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
  /** College display name (e.g. from course lookup); replaces generic header text. */
  collegeName?: string;
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

const DEFAULT_TITLE = '';

// Document labels are now handled inside the getPrintApplicationHtml function for layout purposes.

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
  collegeName?: string;
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
    collegeName,
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
  const relatives = address?.relatives ?? [];

  const headerCollegeTitle = (collegeName || '').trim()
    ? (collegeName || '').trim().toUpperCase()
    : '—';

  const applicationNumberDisplay = resolveApplicationNumberForPrint(application, enquiryNumber);
  const fatherPhotoSrc = safeImageSrcForPrint(parents?.father?.photo);
  const motherPhotoSrc = safeImageSrcForPrint(parents?.mother?.photo);
  const studentPhotoSrc = pickStudentPortraitForPrint(application);
  const portraitPhotoCell = (src: string | null) =>
    src
      ? `<img src="${escapeHtmlAttribute(src)}" alt="" class="portrait-img" />`
      : `<span class="portrait-empty">—</span>`;

  // Normalize education level value so we can match data regardless of case
  // or separator differences (e.g. "ssc", "SSC", "inter_diploma",
  // "inter-diploma", "Inter / Diploma"). The view dialog renders the entries
  // directly, but the print form has fixed rows per standard, so we need
  // robust lookup here to ensure stored values surface on the printout.
  const normalizeLevel = (value?: string): string =>
    String(value || '')
      .toLowerCase()
      .replace(/[\s/\-]+/g, '_')
      .replace(/_+/g, '_')
      .trim();

  const findEducationByLevel = (target: string) => {
    const wanted = normalizeLevel(target);
    return educationHistory.find((e) => normalizeLevel(e.level) === wanted);
  };

  const matchedLevels = new Set(['ssc', 'inter_diploma', 'ug']);
  const extraEducationEntries = educationHistory.filter(
    (e) => !matchedLevels.has(normalizeLevel(e.level))
  );

  // Case-insensitive matcher for "Other Reservations". The joining form
  // accepts free-text tags ("NCC", "Sports", "ph", "PWD", etc.) while the
  // print form has fixed checkbox slots. Map intelligently so tags like
  // "sports", "Sports", "SPORTS" all tick the SPORTS box, and recognise
  // common synonyms (Ex-Service / Ex Serviceman -> EX-SERVICEMAN, etc.).
  const normalizeReservation = (value?: string): string =>
    String(value || '')
      .toLowerCase()
      .replace(/[\s_\-]+/g, '')
      .trim();
  const otherReservationsList = Array.isArray(reservation?.other)
    ? reservation!.other!.map(normalizeReservation)
    : [];
  const otherReservationAliases: Record<string, string[]> = {
    NCC: ['ncc'],
    SPORTS: ['sports', 'sport'],
    'EX-SERVICEMAN': ['exserviceman', 'exservice', 'exservicemen', 'esm'],
    PH: ['ph', 'pwd', 'physicallyhandicapped', 'differentlyabled'],
    OTHERS: ['others', 'other'],
  };
  const isOtherReservationChecked = (label: string): boolean => {
    const aliases = otherReservationAliases[label] || [label.toLowerCase()];
    return otherReservationsList.some((v) => aliases.includes(v));
  };
  // Any tag the user typed that doesn't fit the fixed boxes is shown next
  // to "(If any)" so the data isn't lost on the printout.
  const knownOtherReservationValues = new Set(
    Object.values(otherReservationAliases).flat()
  );
  const extraOtherReservations = Array.isArray(reservation?.other)
    ? reservation!.other!.filter(
        (v) => !knownOtherReservationValues.has(normalizeReservation(v))
      )
    : [];

  // Receipt number resolution for the Fee Paid Details table. The previous
  // logic showed only the last 6 chars of the internal _id which is not
  // meaningful to staff. Prefer human references in this order.
  const getReceiptNumber = (tx?: PaymentTransaction): string => {
    if (!tx) return '';
    const candidate =
      (tx as PaymentTransaction & { receiptNumber?: string }).receiptNumber ||
      tx.referenceId ||
      tx.cashfreeOrderId ||
      (tx as PaymentTransaction & { transactionId?: string }).transactionId ||
      '';
    if (candidate) return String(candidate);
    return tx._id ? String(tx._id).slice(-6) : '';
  };
  const formatTxDate = (value?: string): string => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('en-IN');
  };


  const renderDobBoxes = (dob?: string) => {
    if (!dob) return '<div class="dob-grid">' + Array(8).fill('<span></span>').join('') + '</div>';
    // Assuming YYYY-MM-DD or similar
    const date = new Date(dob);
    if (isNaN(date.getTime())) return '<div class="dob-grid">' + Array(8).fill('<span></span>').join('') + '</div>';
    
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = String(date.getFullYear());
    const str = d + m + y;
    return `<div class="dob-grid">${str.split('').map(char => `<span>${char}</span>`).join('')}</div>`;
  };

  /** All document slots for print summary (received vs not received). */
  const docList: Array<{ id: keyof JoiningDocuments; label: string }> = [
    { id: 'ssc', label: 'S.S.C' },
    { id: 'casteCertificate', label: 'Caste Certificate' },
    { id: 'inter', label: 'Inter' },
    { id: 'cetRankCard', label: 'CET Rank Card' },
    { id: 'ugOrPgCmm', label: 'U.G - P.C / C.M.M' },
    { id: 'cetHallTicket', label: 'CET Hall Ticket' },
    { id: 'transferCertificate', label: 'TC' },
    { id: 'allotmentLetter', label: 'Allotment Letter' },
    { id: 'studyCertificate', label: 'Study Certificate' },
    { id: 'joiningReport', label: 'Joining Report' },
    { id: 'aadhaarCard', label: 'Aadhar Card' },
    { id: 'bankPassBook', label: 'Bank Pass Book' },
    { id: 'photos', label: 'Photos(5)' },
    { id: 'rationCard', label: 'Ration Card' },
    { id: 'incomeCertificate', label: 'Income Certificate' },
  ];

  const receivedDocLabels = docList
    .filter((d) => documents[d.id] === 'received')
    .map((d) => d.label);
  const notReceivedDocLabels = docList
    .filter((d) => documents[d.id] !== 'received')
    .map((d) => d.label);

  const displayGenderText = (() => {
    const g = String(student?.gender || '').trim().toLowerCase();
    if (g === 'male') return 'Male';
    if (g === 'female') return 'Female';
    const raw = String(student?.gender || '').trim();
    return raw || '';
  })();

  const displayReservationCategoryText = (() => {
    const parts: string[] = [];
    const gen = String(reservation?.general || '').trim().toUpperCase();
    if (gen) parts.push(gen);
    if (reservation?.isEws && gen !== 'EWS') parts.push('EWS');
    return parts.length ? parts.join(' + ') : '';
  })();

  const displayOtherReservationText = (() => {
    const tags = (['NCC', 'SPORTS', 'EX-SERVICEMAN', 'PH', 'OTHERS'] as const)
      .filter((cat) => isOtherReservationChecked(cat))
      .join(', ');
    const extra = extraOtherReservations.length ? extraOtherReservations.join(', ') : '';
    if (tags && extra) return `${tags}; ${extra}`;
    return tags || extra || '';
  })();

  const displayQualifiedExamText = (() => {
    const levels: string[] = [];
    if (qualifications?.ssc) levels.push('SSC');
    if (qualifications?.interOrDiploma) levels.push('Inter / Diploma');
    if (qualifications?.ug) levels.push('UG');
    return levels.length ? levels.join(', ') : '';
  })();

  const displayMeritText = (() => {
    if (qualifications?.merit === true) return 'Yes';
    if (qualifications?.merit === false) return 'No';
    return '';
  })();

  const displayMediumText = (() => {
    const mediums = qualifications?.mediums ?? [];
    const parts: string[] = [];
    if (mediums.includes('english')) parts.push('English');
    if (mediums.includes('telugu')) parts.push('Telugu');
    if (mediums.includes('other')) {
      const o = String(qualifications?.otherMediumLabel || '').trim();
      parts.push(o ? `Other (${o})` : 'Other');
    }
    return parts.length ? parts.join(', ') : '';
  })();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { margin: 0; size: A4; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      margin: 0; 
      padding: 5mm 10mm; /* Padding acts as the new margin since @page margin is 0 */
      color: #333; 
      font-size: 11px; 
      line-height: 1.3; 
    }
    .page { position: relative; }
    
    .top-meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; row-gap: 6px; margin-bottom: 10px; font-weight: 600; font-size: 10px; }
    .top-meta div { display: flex; align-items: center; gap: 5px; }
    .top-meta .box { border: 3px solid #8B2323; padding: 4px 12px; min-width: 100px; height: 22px; display: inline-block; text-align: center; line-height: 16px; font-weight: bold; background: #f9f9f9; }

    /* Flex container for Header and Office Use Box */
    .header-container {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 15px;
      border-bottom: 2px solid #8B2323;
      padding-bottom: 10px;
    }
    
    .header-logo { width: 160px; height: 100px; margin-right: 20px; flex-shrink: 0; }
    .header-logo img { width: 100%; height: 100%; object-fit: contain; }
    
    .header-main { 
      flex: 1;
      text-align: center; 
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
    }
    .header-main h1 { margin: 0; font-size: 24px; color: #8B2323; text-transform: uppercase; letter-spacing: 1px; }
    .header-main p { margin: 2px 0; font-weight: bold; font-size: 14px; }
    
    .office-use-top { border: 1px solid #777; width: 180px; padding: 5px; font-size: 10px; background: #fff; }
    .office-use-top .title { text-align: center; font-weight: bold; border-bottom: 1px solid #777; margin-bottom: 5px; padding-bottom: 2px; }
    .office-use-top div { margin-bottom: 4px; display: flex; }
    .office-use-top div span:first-child { width: 50px; font-weight: 600; }
    .office-use-top div span:last-child { border-bottom: 1px dotted #333; flex: 1; min-height: 12px; }

    .app-title-box { border: 1px solid #777; padding: 5px; text-align: center; margin: 10px auto; max-width: 400px; }
    .app-title-box h2 { margin: 0; font-size: 16px; color: #8B2323; }
    .app-title-box p { margin: 0; font-size: 9px; font-weight: 600; }

    .section-num { font-weight: bold; margin-right: 5px; }
    .form-row { display: flex; margin-bottom: 8px; align-items: center; }
    .form-label { min-width: 130px; font-weight: 600; }
    .form-value { border-bottom: 1px dotted #333; flex: 1; padding-left: 5px; min-height: 14px; }
    .inline-val { border-bottom: 1px dotted #333; padding: 0 5px; min-width: 50px; flex: 1; }
    .selected-inline { font-weight: 600; padding-left: 5px; min-height: 14px; flex: 1; border-bottom: 1px dotted #333; }
    .dob-grid { display: flex; gap: 2px; }
    .dob-grid span { border: 1px solid #333; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 10px; }

    .photos-inline-row {
      display: flex;
      justify-content: center;
      align-items: flex-end;
      gap: 18px;
      margin: 8px 0 14px 0;
      flex-wrap: nowrap;
    }
    .photos-inline-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      flex: 0 0 auto;
    }
    .photos-inline-label { font-size: 9px; font-weight: 600; color: #333; text-align: center; max-width: 96px; line-height: 1.15; }
    .portrait-thumb {
      border: 1px solid #777;
      width: 88px;
      height: 104px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #fafafa;
    }
    .portrait-img { max-width: 100%; max-height: 100%; object-fit: cover; }
    .portrait-empty { font-size: 9px; color: #999; }

    .relative-address-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 5px; }
    .relative-box { border: 1px solid #777; padding: 5px; height: 60px; }

    table.data-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
    table.data-table th, table.data-table td { border: 1px solid #777; padding: 4px; text-align: left; }
    table.data-table th { background: #f2f2f2; font-size: 9px; }
    table.data-table thead { display: table-header-group; }

    /* Siblings + page-1 signatures: keep together (see @media print for hard page start). */
    .print-siblings-signature-block {
      display: block;
    }
    .education-table { break-inside: auto; page-break-inside: auto; }
    
    .declaration-section {
      border-radius: 15px;
      border: 2px solid #8B2323;
      padding: 5px 15px;
      margin-top: 15px;
      break-after: auto;
      page-break-after: auto;
      break-inside: auto;
      page-break-inside: auto;
    }
    .declaration-title { text-align: center; margin: -15px auto 5px; background: #8B2323; color: white; width: 150px; border-radius: 10px; padding: 2px; font-weight: bold; }
    .declaration-list { list-style: disc; padding-left: 20px; font-size: 12px; }
    .declaration-list li { margin-bottom: 4px; }

    .signature-row {
      display: flex;
      justify-content: space-between;
      margin-top: 20px;
      padding: 0 20px;
      break-inside: avoid;
      page-break-inside: avoid;
      break-before: auto;
      page-break-before: auto;
      clear: both;
    }
    .sig-block { width: 180px; border: 1px solid #777; border-radius: 4px; overflow: hidden; display: flex; flex-direction: column; }
    .sig-section-title { font-size: 9px; color: #8B2323; font-weight: bold; text-align: center; background: #f2f2f2; border-bottom: 1px solid #777; margin: 0; padding: 4px 0; }
    .sig-box { height: 50px; background: #fff; }

    .office-use-bottom { border: 1px solid #777; margin-top: 15px; display: flex; }
    .office-use-bottom-left { flex: 1; border-right: 1px solid #777; padding: 5px; display: flex; flex-direction: column; align-items: center; }
    .office-use-bottom-right { width: 350px; padding: 5px; display: flex; flex-direction: column; align-items: center; }
    
    .office-label-tag { background: #8B2323; color: white; padding: 4px 20px; border-radius: 10px; font-weight: bold; margin: 10px auto; display: block; width: fit-content; text-align: center; }

    .footer-note { background: #FFD700; color: #8B2323; text-align: center; padding: 10px; margin-top: 10px; font-weight: bold; font-size: 12px; border: 3px solid #8B2323; border-radius: 8px; }
    
    .doc-required-section { display: flex; gap: 10px; margin-top: 10px; }
    .doc-table { flex: 1; border-collapse: collapse; }
    .doc-table th, .doc-table td { border: 1px solid #777; padding: 3px; font-size: 9px; }

    .m-t-10 { margin-top: 10px; }
    .bold { font-weight: bold; }
    .text-red { color: #8B2323; }
    .font-8 { font-size: 8px; }

    /* Keep declaration + signatures + fee as one flow so nothing overlaps when the fee
       table wraps; avoid forcing a blank page between signatures and fee. */
    .fee-print-page { page-break-before: auto; break-before: auto; }
    .print-doc-fee-block { break-inside: auto; page-break-inside: auto; }
    .office-use-bottom { break-inside: auto; page-break-inside: auto; }
    .fee-print-page .footer-note { break-inside: avoid; page-break-inside: avoid; }

    @media print {
      body { padding: 0; margin: 5mm 10mm; }
      .no-print { display: none; }
      .education-table tbody tr { break-inside: auto; page-break-inside: auto; }

      /*
        Chrome often ignores break-inside:avoid when the block does not fit the *remaining*
        space on a page — the last fragment (signatures) then jumps alone to the next page.
        Starting this block on a fresh page guarantees room so the table + signatures stay together.
      */
      .print-siblings-signature-block {
        break-before: page;
        page-break-before: always;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .print-siblings-signature-block .siblings-table,
      .print-siblings-signature-block .siblings-table thead,
      .print-siblings-signature-block .siblings-table tbody,
      .print-siblings-signature-block .signature-row {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      .print-declaration-signatures {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .print-declaration-signatures .signature-row {
        page-break-before: avoid;
        break-before: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="top-meta">
      <div>Application No: <span class="box text-red">${escapeHtml(applicationNumberDisplay)}</span></div>
      <div>Admission No: <span class="box">${escapeHtml(admissionNumber || '')}</span></div>
      <div>PIN No: <span class="box"></span></div>
    </div>

    <div class="header-container">
      <div class="header-logo">
        <img src="https://static.wixstatic.com/media/bfee2e_7d499a9b2c40442e85bb0fa99e7d5d37~mv2.png/v1/fill/w_162,h_89,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/logo1.png" alt="Pydah Logo" />
      </div>
      <div class="header-main">
        <div>
          <h1>${escapeHtml(headerCollegeTitle)}</h1>
        </div>
      </div>

      <div class="office-use-top">
        <div class="title">For Office Use</div>
        <div><span>College :</span> <span>${escapeHtml((collegeName || '').trim() || '—')}</span></div>
        <div><span>Course :</span> <span>${escapeHtml(courseName || course?.course)}</span></div>
        <div><span>Branch :</span> <span>${escapeHtml(branchName || course?.branch)}</span></div>
        <div><span>Quota :</span> <span>${escapeHtml(course?.quota)}</span></div>
      </div>
    </div>

    <div class="app-title-box">
      <h2>APPLICATION FOR ADMISSION</h2>
      <p>(PLEASE FILL THE FORM IN CAPITAL LETTERS)</p>
      <p style="margin: 8px 0 0; font-size: 11px; font-weight: 700; color: #8B2323;">
        Application / Enquiry No.:
        <span style="border: 2px solid #8B2323; padding: 2px 14px; margin-left: 6px; display: inline-block; min-width: 90px; background: #f9f9f9;">${escapeHtml(applicationNumberDisplay || '—')}</span>
      </p>
    </div>

    <div class="form-section">
      <div class="form-row">
        <span class="section-num">1.</span>
        <span class="form-label">Name of the Student :</span>
        <span class="form-value bold">${escapeHtml(student?.name?.toUpperCase())}</span>
      </div>
      <div class="form-row" style="margin-left: 20px; font-size: 9px;">
        <span>(As per S.S.C)</span>
      </div>
      <div class="form-row" style="padding-left: 20px;">
        <span style="min-width: 80px;">Aadhar No :</span>
        <span class="inline-val">${escapeHtml(student?.aadhaarNumber)}</span>
        <span style="min-width: 80px; margin-left: 20px;">Mobile :</span>
        <span class="inline-val">${escapeHtml(student?.phone)}</span>
      </div>

      <div class="form-row">
        <span class="section-num">2.</span>
        <span class="form-label">Gender :</span>
        <span class="selected-inline">${escapeHtml(displayGenderText || '—')}</span>
        <span class="form-label" style="min-width: 150px; margin-left: 12px;">Date of Birth (As Per SSC) :</span>
        ${renderDobBoxes(student?.dateOfBirth)}
      </div>

      <div class="photos-inline-row" aria-label="Applicant portraits">
        <div class="photos-inline-item">
          <div class="portrait-thumb">${portraitPhotoCell(studentPhotoSrc)}</div>
          <span class="photos-inline-label">Student photo</span>
        </div>
        <div class="photos-inline-item">
          <div class="portrait-thumb">${portraitPhotoCell(fatherPhotoSrc)}</div>
          <span class="photos-inline-label">Father photo</span>
        </div>
        <div class="photos-inline-item">
          <div class="portrait-thumb">${portraitPhotoCell(motherPhotoSrc)}</div>
          <span class="photos-inline-label">Mother photo</span>
        </div>
      </div>

      <div class="form-row">
        <span class="section-num">3.</span>
        <span class="form-label">Father's Name :</span>
        <span class="form-value">${escapeHtml(parents?.father?.name?.toUpperCase())}</span>
      </div>
      <div class="form-row" style="padding-left: 20px;">
        <span style="min-width: 80px;">Aadhar No :</span>
        <span class="inline-val">${escapeHtml(parents?.father?.aadhaarNumber)}</span>
        <span style="min-width: 80px; margin-left: 20px;">Mobile :</span>
        <span class="inline-val">${escapeHtml(parents?.father?.phone)}</span>
      </div>
      <div class="form-row">
        <span style="width: 20px;"></span>
        <span class="form-label">Nationality :</span>
        <span class="form-value">INDIAN</span>
      </div>
      <div class="form-row">
        <span style="width: 20px;"></span>
        <span class="form-label">Mother's Name :</span>
        <span class="form-value">${escapeHtml(parents?.mother?.name?.toUpperCase())}</span>
      </div>
      <div class="form-row" style="padding-left: 20px;">
        <span style="min-width: 80px;">Aadhar No :</span>
        <span class="inline-val">${escapeHtml(parents?.mother?.aadhaarNumber)}</span>
        <span style="min-width: 80px; margin-left: 20px;">Mobile :</span>
        <span class="inline-val">${escapeHtml(parents?.mother?.phone)}</span>
      </div>

      <div class="form-row m-t-10">
        <span class="section-num">4.</span>
        <span class="form-label" style="min-width: 150px;">Reservation Category :</span>
        <span class="selected-inline">${escapeHtml(displayReservationCategoryText || '—')}</span>
      </div>
      <div class="form-row" style="padding-left: 20px;">
        <span class="form-label" style="min-width: 120px;">Other Reservation :</span>
        <span class="selected-inline">${escapeHtml(displayOtherReservationText || '—')}</span>
      </div>

      <div class="form-row m-t-10">
        <span class="section-num">5.</span>
        <span class="form-label" style="min-width: 250px;">Address for communication(In Capital Letters) :</span>
      </div>
      <div class="form-row" style="padding-left: 20px;">
        <span style="min-width: 130px;">Door No/ Street Name</span>
        <span class="form-value">${escapeHtml(address?.communication?.doorOrStreet?.toUpperCase())}</span>
      </div>
      <div class="form-row" style="padding-left: 20px;">
        <span style="min-width: 130px;">Land Mark :</span>
        <span class="form-value">${escapeHtml(address?.communication?.landmark?.toUpperCase())}</span>
        <span style="margin-left: 10px; min-width: 120px;">Village/City/Town :</span>
        <span class="form-value">${escapeHtml(address?.communication?.villageOrCity?.toUpperCase())}</span>
      </div>
      <div class="form-row" style="padding-left: 20px;">
        <span style="min-width: 130px;">Mandal :</span>
        <span class="form-value">${escapeHtml(address?.communication?.mandal?.toUpperCase())}</span>
        <span style="margin-left: 10px; min-width: 120px;">District :</span>
        <span class="form-value">${escapeHtml(address?.communication?.district?.toUpperCase())}</span>
      </div>
      <div class="form-row" style="padding-left: 20px;">
        <span style="min-width: 130px;">State :</span>
        <span class="form-value">${escapeHtml(address?.communication?.state?.toUpperCase())}</span>
        <span style="margin-left: 10px; min-width: 80px;">Pin Code :</span>
        <span class="inline-val">${escapeHtml(address?.communication?.pinCode)}</span>
      </div>

      <div class="form-row m-t-10">
        <span class="section-num">6.</span>
        <span class="form-label">Full Address of any Relative / Friends</span>
      </div>
      <div class="relative-address-grid" style="margin-left: 20px;">
        ${(() => {
          const renderRelativeBox = (rel: typeof relatives[number] | undefined, idx: number) => {
            if (!rel) {
              return `
                <div class="relative-box">
                  ${idx + 1})....................................................................................<br/>
                  .......................................................................................<br/>
                  Mobile :
                </div>
              `;
            }
            const nameLine = [rel.name, rel.relationship ? `(${rel.relationship})` : '']
              .filter(Boolean)
              .join(' ');
            const addressLine = [
              rel.doorOrStreet,
              rel.landmark,
              rel.villageOrCity,
              rel.mandal,
              rel.district,
              rel.state,
              rel.pinCode,
            ]
              .filter((part) => part && String(part).trim() !== '')
              .join(', ');
            const mobile = (rel as { phone?: string; mobile?: string }).phone
              || (rel as { phone?: string; mobile?: string }).mobile
              || '';
            return `
              <div class="relative-box">
                <div><strong>${idx + 1}) ${escapeHtml(nameLine.toUpperCase() || '')}</strong></div>
                <div style="font-size: 9px; margin-top: 2px;">${escapeHtml(addressLine.toUpperCase())}</div>
                <div style="margin-top: 4px;">Mobile : ${escapeHtml(mobile)}</div>
              </div>
            `;
          };
          // Always render at least 2 boxes; if more relatives, render them all
          // so nothing captured in the joining form is lost on the printout.
          const total = Math.max(2, relatives.length);
          return Array.from({ length: total }).map((_, i) => renderRelativeBox(relatives[i], i)).join('');
        })()}
      </div>

      <div class="form-row m-t-10">
        <span class="section-num">7.</span>
        <span class="form-label" style="min-width: 180px;">Details of Qualified Examination :</span>
        <span class="selected-inline">${escapeHtml(displayQualifiedExamText || '—')}</span>
      </div>
      <div class="form-row" style="padding-left: 20px;">
        <span class="form-label" style="min-width: 120px;">Merit :</span>
        <span class="selected-inline">${escapeHtml(displayMeritText || '—')}</span>
      </div>
      <div class="form-row" style="padding-left: 20px;">
        <span class="form-label" style="min-width: 180px;">Medium of Qualified Examination :</span>
        <span class="selected-inline">${escapeHtml(displayMediumText || '—')}</span>
      </div>

      <div class="form-row m-t-10">
        <span class="section-num">8.</span>
        <span class="form-label">Details of the School/College Last Studied :</span>
      </div>
      <table class="data-table education-table">
        <thead>
          <tr>
            <th>Standard</th>
            <th>Course / Branch</th>
            <th>Year of Passed</th>
            <th>Name of the School / College & Address</th>
            <th>Hall Ticket No.</th>
            <th>Total Marks/Grade</th>
            <th>% or CGPA</th>
            <th>CET Rank</th>
          </tr>
        </thead>
        <tbody>
          ${[
            { label: 'SSC', key: 'ssc' },
            { label: 'Inter / Diploma', key: 'inter_diploma' },
            { label: 'UG', key: 'ug' },
          ].map(({ label, key }) => {
            const edu = findEducationByLevel(key);
            const institutionText = [edu?.institutionName, edu?.institutionAddress]
              .filter(Boolean)
              .join(', ');
            return `
              <tr style="height: 25px;">
                <td>${label}</td>
                <td>${escapeHtml(edu?.courseOrBranch || '')}</td>
                <td>${escapeHtml(edu?.yearOfPassing || '')}</td>
                <td style="font-size: 8px;">${escapeHtml(institutionText)}</td>
                <td>${escapeHtml(edu?.hallTicketNumber || '')}</td>
                <td>${escapeHtml(edu?.totalMarksOrGrade || '')}</td>
                <td></td>
                <td>${escapeHtml(edu?.cetRank || '')}</td>
              </tr>
            `;
          }).join('')}
          ${extraEducationEntries.map((edu) => {
            const institutionText = [edu?.institutionName, edu?.institutionAddress]
              .filter(Boolean)
              .join(', ');
            const standardLabel =
              (edu?.otherLevelLabel && edu.otherLevelLabel.trim()) ||
              (edu?.level
                ? String(edu.level).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
                : 'Other');
            return `
              <tr style="height: 25px;">
                <td>${escapeHtml(standardLabel)}</td>
                <td>${escapeHtml(edu?.courseOrBranch || '')}</td>
                <td>${escapeHtml(edu?.yearOfPassing || '')}</td>
                <td style="font-size: 8px;">${escapeHtml(institutionText)}</td>
                <td>${escapeHtml(edu?.hallTicketNumber || '')}</td>
                <td>${escapeHtml(edu?.totalMarksOrGrade || '')}</td>
                <td></td>
                <td>${escapeHtml(edu?.cetRank || '')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <div class="print-siblings-signature-block">
      <div class="form-row m-t-10">
        <span class="section-num">9.</span>
        <span class="form-label">Details of the Siblings</span>
      </div>
      <table class="data-table siblings-table">
        <thead>
          <tr>
            <th style="width: 120px;">Relation</th>
            <th>Name</th>
            <th style="width: 110px;">Standard</th>
            <th>Name of the School/ College</th>
          </tr>
        </thead>
        <tbody>
          ${(() => {
            // Render at least 2 rows even if there are no siblings (keeps the
            // printed form looking consistent), but if more are captured we
            // render all of them so no sibling is dropped.
            const totalRows = Math.max(2, siblings.length);
            return Array.from({ length: totalRows }).map((_, i) => {
              const sib = siblings[i];
              const relation = sib?.relation
                ? sib.relation
                : sib
                  ? 'Brother/Sister'
                  : '';
              return `
                <tr style="height: 25px;">
                  <td>${escapeHtml(relation)}</td>
                  <td>${escapeHtml(sib?.name || '')}</td>
                  <td>${escapeHtml(sib?.studyingStandard || '')}</td>
                  <td>${escapeHtml(sib?.institutionName || '')}</td>
                </tr>
              `;
            }).join('');
          })()}
        </tbody>
      </table>

      <div class="signature-row page-one-signatures" style="margin-top: 16px; border-top: 2px solid #8B2323; padding-top: 10px;">
        <div class="sig-block">
          <div class="sig-section-title">STUDENT SIGNATURE</div>
          <div class="sig-box"></div>
        </div>
        <div class="sig-block">
          <div class="sig-section-title">PARENT / GUARDIAN SIGNATURE</div>
          <div class="sig-box"></div>
        </div>
      </div>
    </div>

    <div class="print-continuation">
    <div class="top-meta">
      <div>Application No: <span class="box text-red">${escapeHtml(applicationNumberDisplay)}</span></div>
      <div>Admission No: <span class="box">${escapeHtml(admissionNumber || '')}</span></div>
      <div>STUDENT NAME : <span class="bold" style="border-bottom: 1px dotted #333; min-width: 150px; display: inline-block;">${escapeHtml(student?.name?.toUpperCase())}</span></div>
      <div>PIN No: <span style="border-bottom: 1px dotted #333; min-width: 80px; display: inline-block;"></span></div>
      <div>College: <span style="border-bottom: 1px dotted #333; min-width: 120px; display: inline-block;">${escapeHtml((collegeName || '').trim() || '—')}</span></div>
      <div>Course: <span style="border-bottom: 1px dotted #333; min-width: 100px; display: inline-block;">${escapeHtml(courseName || course?.course)}</span></div>
      <div>Branch: <span style="border-bottom: 1px dotted #333; min-width: 100px; display: inline-block;">${escapeHtml(branchName || course?.branch)}</span></div>
    </div>

    <div class="form-row">
      <span class="section-num">10.</span>
      <span class="form-label">List of Documents Required</span>
    </div>
    <div class="doc-required-section" style="flex-direction: column; gap: 6px;">
      <div class="form-row" style="padding-left: 20px; margin-bottom: 4px;">
        <span class="form-label" style="min-width: 160px;">Received (Yes) :</span>
        <span class="selected-inline">${escapeHtml(receivedDocLabels.join(', ') || '—')}</span>
      </div>
      <div class="form-row" style="padding-left: 20px; margin-bottom: 8px;">
        <span class="form-label" style="min-width: 160px;">Not received (No) :</span>
        <span class="selected-inline">${escapeHtml(notReceivedDocLabels.join(', ') || '—')}</span>
      </div>
      <div style="background: #f2f2f2; font-weight: bold; padding: 6px 10px; font-size: 9px; border: 1px solid #777;">
        NOTE : 2 Sets of Xerox copies of the certificates from 1 to 6
      </div>
    </div>

    <div class="print-doc-fee-block">
    <div class="print-declaration-signatures">
    <div class="declaration-section">
      <div class="declaration-title">DECLARATION</div>
      <ul class="declaration-list">
        <li>Myself / My ward will follow the discipline of the institution and strictly adopt anti-ragging policies.</li>
        <li>Myself / My ward will abide the rules and regulations laid in the prospectus. We will submit all the originals along with the photocopies of the certificates and passport size photos at the time of joining my ward in the institution.</li>
        <li>I/We know that the fee paid towards admission is not refundable in any case or transfered to any other student. Cancellation of admission or finalization of account is as per the conditions mentioned by the management.</li>
        <li>I/We, Misbehaves or create any disturbance in the campus, necessary action will be taken on the ward including termination from the institution.</li>
        <li>If I want to shift my ward from your Institution to another institution before completion of course, I shall pay all the balance fee of full course as mentioned.</li>
        <li>Myself / My ward fails to maintain 75% attendance, he/she will not be permitted to write the exams.</li>
        <li>I/We aware that filling the application is not confirmation of the admission until it's ratified by the university.</li>
        <li>I/We have got satisfied ourself with all the facilities, conditions, rules and regulations of the institutions and the Hostel/Transport, I am willingly admitting my ward.</li>
      </ul>
    </div>

    <div class="signature-row" style="border-top: 1px solid #ddd; padding-top: 10px;">
      <div class="sig-block">
        <div class="sig-section-title">STUDENT SIGNATURE</div>
        <div class="sig-box"></div>
      </div>
      <div class="sig-block">
        <div class="sig-section-title">PARENT / GUARDIAN SIGNATURE</div>
        <div class="sig-box"></div>
      </div>
    </div>
    </div>

    <div class="fee-print-page">
    <div class="office-label-tag">FOR OFFICE USE</div>
    <div class="office-use-bottom">
      <div class="office-use-bottom-left">
        <div style="text-align: center; font-weight: bold; margin-bottom: 5px;">Fee Paid Details</div>
        ${paymentSummary ? `
          <div style="font-size: 9px; margin-bottom: 4px; display: flex; gap: 12px; justify-content: center;">
            <span><strong>Total:</strong> ${formatCurrency(paymentSummary.totalFee)}</span>
            <span><strong>Paid:</strong> ${formatCurrency(paymentSummary.totalPaid)}</span>
            <span><strong>Balance:</strong> ${formatCurrency(paymentSummary.balance)}</span>
          </div>
        ` : ''}
        <table class="data-table" style="font-size: 8px;">
          <thead>
            <tr>
              <th>S.no</th>
              <th>Receipt No</th>
              <th>Date</th>
              <th>Mode</th>
              <th>Amount Paid</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${(() => {
              // Always render at least 5 rows for the printed form layout,
              // but if there are more transactions, render all of them so
              // none are dropped from the printout.
              const totalRows = Math.max(5, transactions.length);
              return Array.from({ length: totalRows }).map((_, i) => {
                const tx = transactions[i];
                return `
                  <tr style="height: 18px;">
                    <td>${i + 1}</td>
                    <td>${escapeHtml(getReceiptNumber(tx))}</td>
                    <td>${escapeHtml(formatTxDate(tx?.createdAt))}</td>
                    <td>${escapeHtml(tx?.mode || '')}</td>
                    <td>${tx ? formatCurrency(tx.amount) : ''}</td>
                    <td>${escapeHtml(tx?.status || '')}</td>
                  </tr>
                `;
              }).join('');
            })()}
          </tbody>
        </table>
      </div>
      <div class="office-use-bottom-right">
        <!-- Empty for office notes -->
      </div>
    </div>

    <div class="footer-note">
      Do not pay the fees without receipt. Do not transfer/deposit College<br/>
      fees to any personal account
    </div>
    </div>
    </div>
    </div>

  </div>
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
  collegeName,
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
    const html = getPrintApplicationHtml({
      application,
      title,
      enquiryNumber,
      admissionNumber,
      courseName,
      branchName,
      paymentSummary: paymentSummary ?? null,
      transactions: transactions ?? [],
      printedDate: '',
      collegeName,
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
    collegeName,
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
