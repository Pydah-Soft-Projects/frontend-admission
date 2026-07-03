'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatCollegeAddressForPrint } from '@/components/joining/PrintableAdmitCard';
import { courseAPI, feeStructureAPI, paymentAPI } from '@/lib/api';
import type {
  Joining,
  Admission,
  PaymentSummary,
  JoiningDocuments,
  JoiningQualifications,
  JoiningCommunicationAddress,
  JoiningRelativeAddress,
  Course,
  Branch,
} from '@/types';
import {
  buildPrintFeeAdjustmentsFromStudentFeeDetails,
  buildPrintFeeStructureDetailedTable,
  courseCatalogFromCourseList,
  mapQuotaToFeeCategory,
  resolvePrintFeeBatch,
  resolveProgramTotalYears,
  unwrapFeeStructureListPayload,
  type PrintFeeAdjustment,
  type PrintFeeStructureDetailedTable,
} from '@/lib/printApplicationFeeStructure';
import { isJoiningDocumentChecklistKeyVisible } from '@/lib/joiningDocumentChecklist';
import { normalizeJoiningDateOfBirthInput } from '@/lib/joiningRegistrationFieldMap';
import { normalizeAddressFieldForDisplay } from '@/lib/formatJoiningAddressDisplay';
import { resolveJoiningReference1 } from '@/lib/joiningApplicationViewDisplay';

type ApplicationData = Joining | Admission;

type PrintPaidTransaction = {
  _id?: string;
  amount: number;
  mode?: string;
  paymentMode?: string;
  status?: string;
  remarks?: string;
  receiptNumber?: string;
  referenceId?: string;
  referenceNo?: string;
  cashfreeOrderId?: string;
  transactionId?: string;
  feeHeadName?: string;
  feeHeadCode?: string;
  createdAt?: string;
  paymentDate?: string;
};

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

function formatPrintDate(value?: string | Date): string {
  const d = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatPrintFeeAmount(amount?: number | null): string {
  if (amount == null || !Number.isFinite(amount) || amount <= 0) return '';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return String(amount);
  }
}

function renderPrintFeeStructureDetailedTableHtml(table: PrintFeeStructureDetailedTable): string {
  if (!table.columns.length || !table.rows.length) return '';

  const secondHeader = table.columns.some((column) => column.adjustmentType);
  return `
    <div class="print-fee-structure-block">
      <div class="print-fee-structure-title">Fee Structure</div>
      <table class="data-table print-fee-structure-table">
        <thead>
          <tr>
            <th${secondHeader ? ' rowspan="2"' : ''}>Year</th>
            ${table.columns
              .map((column) => {
                const label = column.label;
                return `<th${column.adjustmentType ? ' colspan="2"' : secondHeader ? ' rowspan="2"' : ''}>${escapeHtml(label)}</th>`;
              })
              .join('')}
          </tr>
          ${
            secondHeader
              ? `<tr>${table.columns
                  .map((column) =>
                    column.adjustmentType
                      ? `<th>Actual</th><th>${column.adjustmentType === 'CONCESSION' ? 'Concession' : 'Revised Fee'}</th>`
                      : ''
                  )
                  .join('')}</tr>`
              : ''
          }
        </thead>
        <tbody>
          ${table.rows
            .map(
              (row) => `
            <tr>
              <td>Year ${row.year}</td>
              ${table.columns
                .map((column) => {
                  const cell = row.cells[column.key] || { actual: null, adjustment: null };
                  const actualText =
                    cell.actual != null && cell.actual > 0 ? escapeHtml(formatPrintFeeAmount(cell.actual)) : '-';
                  if (column.adjustmentType) {
                    return `<td>${actualText}</td><td>${cell.adjustment != null && cell.adjustment > 0 ? escapeHtml(formatPrintFeeAmount(cell.adjustment)) : '-'}</td>`;
                  }
                  return `<td>${actualText}</td>`;
                })
                .join('')}
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

function extractOverallConcessionLines(response: unknown): PrintFeeAdjustment[] {
  const root = response as { data?: unknown } | null | undefined;
  const payload = root?.data && typeof root.data === 'object' ? root.data : response;
  const revisedFees = (payload as { revisedFees?: unknown } | null | undefined)?.revisedFees;
  return Array.isArray(revisedFees) ? (revisedFees as PrintFeeAdjustment[]) : [];
}

function extractFeeMongoTransactions(response: unknown): PrintPaidTransaction[] {
  if (Array.isArray(response)) return response as PrintPaidTransaction[];
  const root = response as
    | {
        transactions?: unknown;
        data?: unknown;
      }
    | null
    | undefined;
  if (Array.isArray(root?.transactions)) return root.transactions as PrintPaidTransaction[];
  const payload = root?.data;
  if (Array.isArray(payload)) return payload as PrintPaidTransaction[];
  if (payload && typeof payload === 'object') {
    const nested = payload as { transactions?: unknown; data?: unknown };
    if (Array.isArray(nested.transactions)) return nested.transactions as PrintPaidTransaction[];
    if (Array.isArray(nested.data)) return nested.data as PrintPaidTransaction[];
  }
  return [];
}

function mergePrintFeeAdjustments(
  primary: PrintFeeAdjustment[],
  fallback: PrintFeeAdjustment[]
): PrintFeeAdjustment[] {
  const keyFor = (row: PrintFeeAdjustment) => {
    const head = String(row.feeHeadId || row.feeHeadCode || '').trim().toUpperCase();
    const year = Number(row.studentYear) || 1;
    return `${head}::${year}`;
  };
  const map = new Map<string, PrintFeeAdjustment>();
  for (const row of primary) {
    const key = keyFor(row);
    if (key !== '::1') map.set(key, row);
  }
  for (const row of fallback) {
    const key = keyFor(row);
    if (key !== '::1') map.set(key, row);
  }
  return Array.from(map.values());
}

async function resolvePrintFeeStructureTableHtml(
  application: ApplicationData,
  courseName?: string,
  branchName?: string,
  admissionNumber?: string
): Promise<string> {
  const courseId = String(application.courseInfo?.courseId ?? '').trim();
  const branchId = String(application.courseInfo?.branchId ?? '').trim();
  const resolvedCourseName = String(courseName || application.courseInfo?.course || '').trim();
  const resolvedBranchName = String(branchName || application.courseInfo?.branch || '').trim();
  const quota = String(application.courseInfo?.quota || '').trim();
  const batch = resolvePrintFeeBatch(application);
  const category = mapQuotaToFeeCategory(quota);

  const leadData = (application as any).leadData || {};
  const registrationExtras = leadData._joiningRegistrationExtras || {};
  const studentStatus = String(
    registrationExtras.student_status ??
    registrationExtras.studentStatus ??
    (application as any).studentStatus ??
    (application as any).student_status ??
    ''
  ).trim();

  if (!resolvedCourseName && !resolvedBranchName && !courseId) {
    return '';
  }

  let courseList: Array<Course & { branches?: Branch[] }> = [];
  try {
    const response = await courseAPI.list({ includeBranches: true, showInactive: true });
    const payload = response?.data;
    courseList = Array.isArray(payload)
      ? (payload as Array<Course & { branches?: Branch[] }>)
      : Array.isArray((payload as { data?: unknown })?.data)
        ? ((payload as { data: Array<Course & { branches?: Branch[] }> }).data)
        : [];
  } catch {
    courseList = [];
  }

  let feeStructures = unwrapFeeStructureListPayload(
    await feeStructureAPI
      .list({
        course: resolvedCourseName || undefined,
        branch: resolvedBranchName || undefined,
        category: category || undefined,
        quota: quota || undefined,
        batch: batch || undefined,
        studentStatus: studentStatus || undefined,
      })
      .catch(() => null)
  );

  if (feeStructures.length === 0 && (resolvedCourseName || resolvedBranchName)) {
    feeStructures = unwrapFeeStructureListPayload(
      await feeStructureAPI
        .list({
          course: resolvedCourseName || undefined,
          branch: resolvedBranchName || undefined,
          batch: batch || undefined,
        })
        .catch(() => null)
    );
  }

  const catalog = courseCatalogFromCourseList(courseList);
  const totalYears = resolveProgramTotalYears(catalog, courseId, branchId, feeStructures);
  const resolvedAdmissionNumber =
    String(admissionNumber || (application as Admission).admissionNumber || '').trim();
  let overallAdjustments: PrintFeeAdjustment[] = [];
  if (resolvedAdmissionNumber) {
    overallAdjustments = extractOverallConcessionLines(
      await paymentAPI.getOverallConcessions(resolvedAdmissionNumber).catch(() => null)
    );
  }
  const embeddedAdjustments = buildPrintFeeAdjustmentsFromStudentFeeDetails(
    application.studentFeeDetails?.lines || [],
    feeStructures
  );
  const adjustments = mergePrintFeeAdjustments(overallAdjustments, embeddedAdjustments);
  const detailedTable = buildPrintFeeStructureDetailedTable(feeStructures, totalYears, adjustments);

  return renderPrintFeeStructureDetailedTableHtml(detailedTable);
}

type EducationTableRowKey = 'ssc' | 'inter_diploma' | 'ug';

const EDUCATION_TABLE_ROWS: ReadonlyArray<{ label: string; key: EducationTableRowKey }> = [
  { label: 'SSC', key: 'ssc' },
  { label: 'Inter / Diploma', key: 'inter_diploma' },
  { label: 'UG', key: 'ug' },
];

function resolveEducationProgramTier(programLevel?: string): 'diploma' | 'ug' | 'pg' | null {
  const raw = String(programLevel || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!raw) return null;
  if (raw === 'pg' || /postgrad|post_graduate|postgraduate|mtech|m_tech|mba/.test(raw)) {
    return 'pg';
  }
  if (raw === 'ug' || /undergrad|under_graduate|undergraduate|btech|b_tech|b\.tech|b\.e|degree/.test(raw)) {
    return 'ug';
  }
  if (raw === 'diploma' || /polytechnic|poly|intermediate|\binter\b|10th|ssc/.test(raw)) {
    return 'diploma';
  }
  return null;
}

function pickRegistrationExtraCI(extras: Record<string, unknown>, keys: readonly string[]): string {
  const want = new Set(keys.map((k) => k.toLowerCase()));
  for (const [k, v] of Object.entries(extras)) {
    if (!want.has(k.toLowerCase())) continue;
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function formatPrintAddressValue(value: unknown, upper = false): string {
  const s = normalizeAddressFieldForDisplay(value);
  if (!s) return '';
  return upper ? s.toUpperCase() : s;
}

/** Merge structured address with registration extras and lead snapshot for print. */
function resolveCommunicationAddressForPrint(
  application: ApplicationData
): JoiningCommunicationAddress {
  const comm = application.address?.communication ?? {};
  const reg =
    application.registrationFormData &&
    typeof application.registrationFormData === 'object' &&
    !Array.isArray(application.registrationFormData)
      ? (application.registrationFormData as Record<string, unknown>)
      : {};
  const lead =
    application.leadData &&
    typeof application.leadData === 'object' &&
    !Array.isArray(application.leadData)
      ? (application.leadData as Record<string, unknown>)
      : {};

  const pick = (
    fromComm: string | undefined,
    regKeys: readonly string[],
    leadKey?: string
  ): string => {
    const direct = normalizeAddressFieldForDisplay(fromComm);
    if (direct) return direct;
    const fromReg = normalizeAddressFieldForDisplay(pickRegistrationExtraCI(reg, regKeys));
    if (fromReg) return fromReg;
    if (leadKey) {
      const fromLead = normalizeAddressFieldForDisplay(lead[leadKey]);
      if (fromLead) return fromLead;
    }
    return '';
  };

  return {
    doorOrStreet: pick(comm.doorOrStreet, ['address_door_street', 'door_street'], 'address'),
    landmark: pick(comm.landmark, ['address_landmark', 'landmark']),
    villageOrCity: pick(
      comm.villageOrCity,
      ['address_village_city', 'village', 'city', 'address_village'],
      'village'
    ),
    mandal: pick(comm.mandal, ['address_mandal', 'mandal'], 'mandal'),
    district: pick(comm.district, ['address_district', 'district'], 'district'),
    state: pick(comm.state, ['state', 'address_state'], 'state'),
    pinCode: pick(comm.pinCode, ['pincode', 'pin_code', 'address_pin_code']),
  };
}

function resolveRelativesForPrint(application: ApplicationData): JoiningRelativeAddress[] {
  return application.address?.relatives ?? [];
}

function resolveEducationProgramLevel(
  application: ApplicationData,
  courseProgramLevel?: string
): string {
  const fromCourse = String(courseProgramLevel || '').trim();
  if (fromCourse) return fromCourse;
  const leadData = application.leadData as { _joiningProgramLevel?: string } | undefined;
  const fromLead = String(leadData?._joiningProgramLevel || '').trim();
  if (fromLead) return fromLead;
  const reg = application.registrationFormData as
    | { programLevel?: string; program_level?: string }
    | undefined;
  return String(reg?.programLevel || reg?.program_level || '').trim();
}

function educationTableRowsForTier(
  tier: 'diploma' | 'ug' | 'pg' | null,
  qualifications?: JoiningQualifications
): Array<{ label: string; key: EducationTableRowKey }> {
  let resolved = tier;
  if (!resolved && qualifications) {
    if (qualifications.ug) resolved = 'pg';
    else if (qualifications.interOrDiploma) resolved = 'ug';
    else if (qualifications.ssc) resolved = 'diploma';
  }
  if (resolved === 'diploma') return [...EDUCATION_TABLE_ROWS.slice(0, 1)];
  if (resolved === 'ug') return [...EDUCATION_TABLE_ROWS.slice(0, 2)];
  if (resolved === 'pg') return [...EDUCATION_TABLE_ROWS];
  return [...EDUCATION_TABLE_ROWS.slice(0, 2)];
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
  transactions?: PrintPaidTransaction[];
  /** College display name (e.g. from course lookup); replaces generic header text. */
  collegeName?: string;
  /** College address for print header; fetched from admit-card assets when omitted. */
  collegeAddress?: string;
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
  transactions?: PrintPaidTransaction[];
  printedDate: string;
  collegeName?: string;
  collegeAddress?: string;
  feeStructureTableHtml?: string;
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
    collegeAddress,
    feeStructureTableHtml = '',
  } = props;

  const student = application.studentInfo;
  const course = application.courseInfo;
  const parents = application.parents;
  const reservation = application.reservation;
  const qualifications = application.qualifications;
  const educationHistory = application.educationHistory ?? [];
  const documents = application.documents ?? {};
  const siblings = (application as Joining).siblings ?? (application as Admission).siblings ?? [];
  const communicationAddress = resolveCommunicationAddressForPrint(application);
  const relatives = resolveRelativesForPrint(application);

  const headerCollegeTitle = (collegeName || '').trim()
    ? (collegeName || '').trim().toUpperCase()
    : '—';
  const headerCollegeAddress = formatCollegeAddressForPrint(collegeAddress);

  const applicationNumberDisplay = resolveApplicationNumberForPrint(application, enquiryNumber);
  const referenceNameDisplay = resolveJoiningReference1(
    application as Admission,
    application as Joining,
    ((application as Joining).lead ?? application.leadData) as Record<string, unknown> | undefined
  );
  const fatherPhotoSrc = safeImageSrcForPrint(parents?.father?.photo);
  const motherPhotoSrc = safeImageSrcForPrint(parents?.mother?.photo);
  const studentPhotoSrc = pickStudentPortraitForPrint(application);
  const portraitPhotoCell = (src: string | null, emptyLabel: string) =>
    src
      ? `<img src="${escapeHtmlAttribute(src)}" alt="" class="portrait-img" />`
      : `<span class="portrait-placeholder-label">${escapeHtml(emptyLabel)}</span>`;

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

  const educationProgramLevel = resolveEducationProgramLevel(application, course?.programLevel);
  const educationProgramTier = resolveEducationProgramTier(educationProgramLevel);
  const educationTableRows = educationTableRowsForTier(educationProgramTier, qualifications);
  const matchedLevels = new Set<string>(educationTableRows.map((row) => row.key));
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
  const getReceiptNumber = (tx?: PrintPaidTransaction): string => {
    if (!tx) return '';
    const candidate =
      tx.receiptNumber ||
      tx.referenceNo ||
      tx.referenceId ||
      tx.cashfreeOrderId ||
      tx.transactionId ||
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


  const parseDobDigitsForPrint = (dob?: string): string => {
    const raw = String(dob ?? '').trim();
    if (!raw) return '';
    const normalized = normalizeJoiningDateOfBirthInput(raw);
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      const [y, m, d] = normalized.split('-');
      return `${d}${m}${y}`;
    }
    const ddMmYyyy = raw.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (ddMmYyyy) return `${ddMmYyyy[1]}${ddMmYyyy[2]}${ddMmYyyy[3]}`;
    return '';
  };

  const renderDobBoxes = (dob?: string) => {
    const emptyBoxes = '<div class="dob-grid">' + Array(8).fill('<span></span>').join('') + '</div>';
    const str = parseDobDigitsForPrint(dob);
    if (str.length !== 8) return emptyBoxes;
    return `<div class="dob-grid">${str
      .split('')
      .map((char) => `<span>${escapeHtml(char)}</span>`)
      .join('')}</div>`;
  };

  /** All document slots for print summary (received vs not received). */
  type DocListItem = { id: keyof JoiningDocuments; label: string };
  const docList = (
    [
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
    ] satisfies DocListItem[]
  ).filter((d): d is DocListItem =>
    isJoiningDocumentChecklistKeyVisible(d.id, course?.quota, { paperChecklist: false })
  );

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

  const displayMeritText = qualifications?.merit === true ? 'Yes' : 'No';

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

  const renderPrintPageNumber = (page: number, total = 3) =>
    `<div class="print-page-number" aria-hidden="true">Page ${page} of ${total}</div>`;

  const renderPrintSignatureRow = (extraClass = '') => `
    <div class="print-signature-footer print-page-signatures ${extraClass}" aria-label="Student and parent signatures">
      <div class="signature-divider" aria-hidden="true"></div>
      <div class="signature-row">
      <div class="sig-block">
        <div class="sig-section-title">STUDENT SIGNATURE</div>
        <div class="sig-box"></div>
        <div class="sig-date-row">
          <span class="sig-date-label">Date :</span>
          <span class="sig-date-line">${escapeHtml(printedDate)}</span>
        </div>
      </div>
      <div class="sig-block">
        <div class="sig-section-title">PARENT / GUARDIAN SIGNATURE</div>
        <div class="sig-box"></div>
        <div class="sig-date-row">
          <span class="sig-date-label">Date :</span>
          <span class="sig-date-line">${escapeHtml(printedDate)}</span>
        </div>
      </div>
      </div>
    </div>`;

  const renderPrintPageHeader = () => `
    <div class="header-container">
      <div class="header-top-row">
        <div class="header-logo">
          <img src="https://static.wixstatic.com/media/bfee2e_7d499a9b2c40442e85bb0fa99e7d5d37~mv2.png/v1/fill/w_162,h_89,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/logo1.png" alt="Pydah Logo" />
        </div>
        <div class="header-brand-stack">
          <div class="header-main">
            <h1>${escapeHtml(headerCollegeTitle)}</h1>
            <p class="header-college-address">${escapeHtml(headerCollegeAddress)}</p>
          </div>
        </div>
      </div>
    </div>`;

  const renderPrintStudentMetaInline = () => `
    <div class="print-student-meta-inline" aria-label="Student and course details">
      <span class="meta-item">STUDENT NAME : <span class="meta-value meta-value-name">${escapeHtml(student?.name?.toUpperCase() || '—')}</span></span>
      <span class="meta-item">Course: <span class="meta-value">${escapeHtml(courseName || course?.course || '—')}</span></span>
      <span class="meta-item">Branch: <span class="meta-value">${escapeHtml(branchName || course?.branch || '—')}</span></span>
      <span class="meta-item">Quota: <span class="meta-value">${escapeHtml(course?.quota || '—')}</span></span>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --print-sidebar-width: 192px;
    }
    @page { margin: 0; size: A4; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      margin: 0; 
      padding: 5mm 10mm; /* Padding acts as the new margin since @page margin is 0 */
      color: #333; 
      font-size: 13px; 
      line-height: 1.45; 
    }
    .page { position: relative; }
    
    .top-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      row-gap: 6px;
      margin-bottom: 10px;
      font-weight: 600;
      font-size: 11px;
    }
    .top-meta div { display: flex; align-items: center; gap: 5px; }
    .top-meta .box {
      border: 3px solid #8B2323;
      padding: 4px 12px;
      min-width: 100px;
      height: 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      line-height: 1;
      font-weight: bold;
      background: #f9f9f9;
      box-sizing: border-box;
    }

    .header-container {
      margin-bottom: 2px;
    }
    .header-top-row {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 14px;
    }
    .header-logo {
      width: 118px;
      height: 72px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .header-logo img { width: 100%; height: 100%; object-fit: contain; display: block; }
    .header-brand-stack {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .header-main {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
    }
    .form-section {
      margin-top: 0;
    }
    .app-title-row {
      display: flex;
      justify-content: center;
      width: 100%;
      margin: 6px 0 14px;
    }
    /* Sidebar height = sections 1–3 + section 4 title + door row (photos distributed in remaining space) */
    .form-sidebar-row {
      position: relative;
      width: 100%;
      margin-top: 0;
      margin-bottom: 0;
      box-sizing: border-box;
    }
    .form-sidebar-main {
      min-width: 0;
      margin-right: calc(var(--print-sidebar-width) + 12px);
      display: flex;
      flex-direction: column;
      gap: 0;
    }
    .form-sidebar-aside {
      position: absolute;
      top: 0;
      right: 0;
      width: var(--print-sidebar-width);
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      box-sizing: border-box;
    }
    .form-sidebar-photos {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-rows: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-top: 10px;
    }
    .student-form-left {
      min-width: 0;
      margin: 0;
      padding: 0;
    }
    .student-form-left > .form-row:first-child {
      margin-top: 0;
    }
    .student-form-left > .form-row:last-child {
      margin-bottom: 0;
    }
    .print-address-block {
      margin-top: 0;
    }
    .print-page-one .section-4-title {
      margin-top: 0;
      margin-bottom: 4px;
    }
    .form-sidebar-main .section-4-title {
      margin-bottom: 4px;
    }
    .header-main h1 {
      margin: 0;
      font-size: 29px;
      font-weight: 800;
      color: #8B2323;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      line-height: 1.12;
      text-align: center;
      white-space: nowrap;
    }
    .header-college-address {
      margin: 5px 0 0;
      font-size: 12px;
      font-weight: 600;
      color: #334155;
      line-height: 1.35;
      text-align: center;
      max-width: 540px;
    }
    .header-main p { margin: 2px 0; font-weight: bold; font-size: 14px; }
    .app-title-box {
      border: 1px solid #777;
      padding: 4px 12px;
      text-align: center;
      width: fit-content;
      max-width: 100%;
      margin: 0;
    }
    .app-title-box h2 {
      margin: 0;
      font-size: 16px;
      color: #8B2323;
      line-height: 1.2;
      white-space: nowrap;
    }
    .app-title-box p {
      margin: 0;
      font-size: 9.5px;
      font-weight: 600;
      line-height: 1.2;
      white-space: nowrap;
    }
    .office-use-top {
      border: 1px solid #777;
      width: 100%;
      padding: 4px 5px;
      font-size: 10.5px;
      line-height: 1.2;
      background: #fff;
      flex-shrink: 0;
      box-sizing: border-box;
    }
    .office-use-top .office-use-row {
      margin-bottom: 3px;
      display: grid;
      grid-template-columns: 86px minmax(0, 1fr);
      column-gap: 4px;
      align-items: baseline;
      white-space: nowrap;
      font-weight: 700;
    }
    .office-use-top .office-use-row span:first-child { font-weight: 700; }
    .office-use-top .office-use-row span:last-child {
      border-bottom: 1px dotted #333;
      min-height: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 700;
    }

    .section-num { font-weight: bold; margin-right: 5px; font-size: 13px; width: 20px; flex-shrink: 0; }
    .form-row { display: flex; margin-bottom: 12px; align-items: center; min-height: 18px; }
    .form-label { min-width: 130px; max-width: 130px; font-weight: 600; font-size: 13px; flex-shrink: 0; }
    .form-value { border-bottom: 1px dotted #333; flex: 1; padding-left: 5px; min-height: 16px; font-size: 13px; }
    .form-value.bold { flex: 1; font-weight: 700; }
    .form-row-sub { padding-left: 25px; }
    .form-row-sub .form-label { min-width: 130px; max-width: 130px; flex-shrink: 0; white-space: nowrap; }
    .form-row-sub .form-label-wide {
      min-width: 168px;
      max-width: none;
      white-space: nowrap;
    }
    .form-row-section-title .form-label {
      min-width: auto;
      max-width: none;
      white-space: nowrap;
      flex: 0 1 auto;
    }
    .qualified-exam-section {
      margin-top: 10px;
    }
    .qualified-exam-row-main {
      display: flex;
      flex-wrap: nowrap;
      align-items: center;
      gap: 4px;
      margin-bottom: 8px;
    }
    .qualified-exam-row-main .form-label-wide {
      min-width: 220px;
      max-width: none;
      font-weight: 600;
      font-size: 13px;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .qualified-exam-row-sub {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
      padding-left: 25px;
    }
    .qualified-exam-two-col {
      flex: 1;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      column-gap: 20px;
      align-items: center;
    }
    .qualified-exam-col {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
    }
    .qualified-exam-col .form-label-compact {
      min-width: auto;
      max-width: none;
      font-weight: 600;
      font-size: 12px;
      flex-shrink: 0;
      white-space: nowrap;
    }
    .qualified-exam-col .form-field-inline {
      flex: 1;
      min-width: 0;
    }
    .form-field-inline {
      border-bottom: 1px dotted #333;
      padding: 0 5px;
      min-height: 16px;
      font-size: 13px;
      font-weight: 600;
      flex: 0 1 auto;
      min-width: 48px;
    }
    .qualified-exam-row-main .form-field-inline-wide {
      flex: 1;
      min-width: 80px;
    }
    .form-field-line {
      flex: 1;
      min-width: 0;
      border-bottom: 1px dotted #333;
      min-height: 16px;
      padding-left: 5px;
      font-size: 13px;
      font-weight: 600;
      box-sizing: border-box;
    }
    /* Align dotted-line start/end in sections 1–3 without changing row markup */
    .student-form-left .form-row {
      display: grid;
      grid-template-columns: 25px 168px minmax(0, 1fr);
      column-gap: 4px;
      align-items: center;
      padding-left: 0;
      width: 100%;
    }
    .student-form-left .form-row-sub {
      padding-left: 0;
    }
    .student-form-left .form-row .section-num {
      grid-column: 1;
      width: 25px;
      margin-right: 0;
    }
    .student-form-left .form-row .form-label,
    .student-form-left .form-row .form-label-wide {
      grid-column: 2;
      min-width: 0;
      max-width: none;
    }
    .student-form-left .form-row .form-field-line,
    .student-form-left .form-row .form-value {
      grid-column: 3;
      min-width: 0;
      width: 100%;
    }
    .student-form-left .form-row .dob-grid {
      grid-column: 3;
      justify-self: start;
    }
    .form-section .form-row-lined {
      width: 100%;
    }
    .student-form-left .form-row-student-name {
      align-items: start;
    }
    .student-form-left .form-label-with-ssc-hint {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 1px;
      line-height: 1.2;
    }
    .ssc-label-hint {
      font-size: 11px;
      font-weight: 600;
      color: #555;
      white-space: nowrap;
      font-style: italic;
    }
    .inline-val { border-bottom: 1px dotted #333; padding: 0 5px; min-width: 50px; flex: 1; font-size: 13px; }
    .selected-inline { font-weight: 600; padding-left: 5px; min-height: 16px; flex: 1; border-bottom: 1px dotted #333; font-size: 13px; }
    .dob-grid { display: flex; gap: 2px; flex-shrink: 0; }
    .dob-grid span { border: 1px solid #333; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }

    .photos-stack-item {
      min-height: 0;
      min-width: 0;
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    .portrait-thumb {
      border: 1px solid #777;
      aspect-ratio: 1 / 1;
      height: 100%;
      width: auto;
      max-width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #fafafa;
      box-sizing: border-box;
    }
    .portrait-img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .portrait-placeholder-label {
      font-size: 10px;
      font-weight: 600;
      color: #555;
      text-align: center;
      padding: 6px 4px;
      line-height: 1.2;
    }

    .address-section-layout {
      display: block;
    }
    .form-sidebar-main .address-door-row {
      margin-left: 25px;
      margin-bottom: 0;
    }
    /* 4-column rows: label | dots | label | dots — dots fill each half with no wide gap */
    .address-fields-grid {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: minmax(118px, max-content) minmax(0, 1fr) minmax(118px, max-content) minmax(0, 1fr);
      column-gap: 8px;
      row-gap: 8px;
      margin-left: 25px;
      margin-right: 0;
      margin-bottom: 4px;
      box-sizing: border-box;
      align-items: center;
    }
    .address-door-row {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: minmax(142px, max-content) minmax(0, 1fr);
      column-gap: 4px;
      align-items: center;
      min-height: 18px;
    }
    .address-door-row .form-field-line {
      text-align: center;
      padding-left: 0;
      padding-right: 5px;
    }
    .address-fields-grid .form-label {
      min-width: 0;
      max-width: none;
      font-size: 12px;
      white-space: nowrap;
      font-weight: 600;
    }
    .address-fields-grid .form-field-line {
      min-width: 0;
      width: 100%;
      flex: none;
      display: block;
      line-height: 1.35;
      color: #111;
      border-bottom: 1px dotted #333;
      min-height: 16px;
      padding-left: 5px;
      font-size: 13px;
      font-weight: 600;
      box-sizing: border-box;
    }
    .relative-address-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 5px; }
    .relative-box { border: 1px solid #777; padding: 5px; height: 60px; }

    table.data-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
    table.data-table th, table.data-table td { border: 1px solid #777; padding: 4px; text-align: left; font-size: 11px; }
    table.data-table th { background: #f2f2f2; font-size: 10px; }
    table.data-table thead { display: table-header-group; }

    /* Three sheets: (1) sections 1–7 + signatures, (2) 8–10 + declaration + signatures, (3) fee + signatures. */
    .print-page {
      display: block;
      position: relative;
      padding-bottom: 14px;
      box-sizing: border-box;
    }
    .print-page-number {
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      font-weight: 600;
      color: #475569;
      line-height: 1;
    }
    .print-page-two-content {
      display: block;
      line-height: 1.45;
      font-size: 13px;
    }
    .print-signature-footer {
      margin-top: 18px;
      padding: 0 16px;
      box-sizing: border-box;
    }
    .print-page-one .form-row {
      margin-bottom: 10px;
    }
    .print-page-one .student-form-left .form-row {
      margin-bottom: 10px;
    }
    .print-page-one .m-t-10 {
      margin-top: 8px !important;
    }
    .print-page-one {
      min-height: 277mm;
      display: flex;
      flex-direction: column;
    }
    .print-page-one .print-page-one-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 0;
    }
    .print-page-one .relative-address-grid {
      flex: 1;
      align-items: stretch;
      min-height: 58px;
    }
    .print-page-one .relative-box {
      min-height: 58px;
      height: 100%;
      padding: 5px;
      box-sizing: border-box;
    }
    .print-page-one .address-fields-grid {
      row-gap: 8px;
      margin-bottom: 2px;
    }
    .print-page-one .print-signature-footer.page-one-signatures {
      margin-top: 10px;
      flex-shrink: 0;
    }
    .print-page-one .sig-box {
      height: 52px;
    }
    .print-page-signatures {
      margin-top: 0;
      padding: 0;
      border-top: none;
    }
    .signature-divider {
      display: block;
      width: 100%;
      border-top: 2px solid #8B2323;
      margin: 0 0 10px 0;
    }
    .print-page-two,
    .fee-print-page {
      padding-top: 12mm;
      line-height: 1.45;
      font-size: 13px;
      box-sizing: border-box;
    }
    .print-page-two .header-container,
    .fee-print-page .header-container {
      margin-bottom: 6px;
    }
    .print-student-meta-inline {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 20px;
      margin-bottom: 12px;
      font-weight: 600;
      font-size: 11px;
      line-height: 1.4;
    }
    .print-student-meta-inline .meta-item {
      display: inline-flex;
      align-items: baseline;
      gap: 5px;
      white-space: nowrap;
    }
    .print-student-meta-inline .meta-value {
      border-bottom: 1px dotted #333;
      min-height: 14px;
      padding: 0 4px;
      font-weight: 700;
      color: #111;
    }
    .print-student-meta-inline .meta-value-name {
      min-width: 140px;
    }
    /* Page 2: relaxed vertical rhythm */
    .print-page-two-content .form-row {
      margin-bottom: 11px;
      min-height: 18px;
    }
    .print-page-two-content .m-t-10 {
      margin-top: 14px !important;
    }
    .print-page-two-content .data-table {
      margin-top: 8px;
      margin-bottom: 12px;
    }
    .print-page-two-content .data-table th,
    .print-page-two-content .data-table td {
      padding: 6px 5px;
      line-height: 1.4;
      font-size: 11px;
    }
    .print-page-two-content .data-table th {
      font-size: 10px;
    }
    .print-page-two-content .doc-required-section {
      margin-top: 12px;
      margin-bottom: 14px;
      gap: 10px;
    }
    .print-page-two-content .doc-required-section .form-row {
      margin-bottom: 10px;
    }
    .print-page-two-content .selected-inline {
      min-height: 18px;
      line-height: 1.45;
    }
    .print-doc-declaration-block {
      margin-top: 6px;
    }
    .declaration-section {
      padding: 12px 18px 14px;
      margin-top: 18px;
    }
    .declaration-list {
      line-height: 1.55;
    }
    .declaration-list li {
      margin-bottom: 9px;
    }
    /* Page 3: fee structure + office-use section */
    .print-fee-structure-block {
      margin-top: 8px;
      margin-bottom: 16px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .print-fee-structure-title {
      text-align: center;
      font-weight: bold;
      font-size: 14px;
      color: #8B2323;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .print-fee-structure-table {
      width: 100%;
      margin-bottom: 4px;
    }
    table.print-fee-structure-table th,
    table.print-fee-structure-table td {
      text-align: center;
      white-space: nowrap;
    }
    table.print-fee-structure-table th:first-child,
    table.print-fee-structure-table td:first-child {
      text-align: center;
      width: 72px;
    }
    .fee-print-page .office-label-tag {
      margin-top: 6px;
      margin-bottom: 14px;
    }
    .fee-print-page .office-use-bottom {
      margin-top: 8px;
      padding: 8px;
    }
    .fee-print-page .office-use-bottom-left {
      padding: 10px 8px;
    }
    .fee-print-page .data-table th,
    .fee-print-page .data-table td {
      padding: 6px 5px;
      line-height: 1.4;
      font-size: 11px;
    }
    .fee-print-page .data-table th {
      font-size: 10px;
    }
    .education-table { break-inside: auto; page-break-inside: auto; }
    
    .declaration-section {
      border-radius: 15px;
      border: 2px solid #8B2323;
      break-after: auto;
      page-break-after: auto;
      break-inside: auto;
      page-break-inside: auto;
    }
    .declaration-title { text-align: center; margin: -15px auto 8px; background: #8B2323; color: white; width: 150px; border-radius: 10px; padding: 2px; font-weight: bold; }
    .declaration-list { list-style: disc; padding-left: 20px; font-size: 13px; margin: 8px 0 4px; }

    .print-signature-footer .signature-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      width: 100%;
      margin-top: 0;
      padding: 0;
      break-inside: avoid;
      page-break-inside: avoid;
      clear: both;
    }
    .signature-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      width: 100%;
      break-inside: avoid;
      page-break-inside: avoid;
      clear: both;
    }
    .sig-block { width: 180px; flex-shrink: 0; border: 1px solid #777; border-radius: 4px; overflow: hidden; display: flex; flex-direction: column; }
    .sig-section-title { font-size: 10px; color: #8B2323; font-weight: bold; text-align: center; background: #f2f2f2; border-bottom: 1px solid #777; margin: 0; padding: 4px 0; }
    .sig-box { height: 50px; background: #fff; }
    .sig-date-row {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px 6px;
      font-size: 10px;
      font-weight: 600;
      border-top: 1px solid #777;
      background: #fff;
    }
    .sig-date-label { flex-shrink: 0; color: #333; }
    .sig-date-line {
      flex: 1;
      min-height: 14px;
      border-bottom: 1px dotted #333;
      text-align: center;
      line-height: 1.3;
    }

    .office-use-bottom { border: 1px solid #777; margin-top: 15px; display: flex; }
    .office-use-bottom-left { flex: 1; border-right: 1px solid #777; padding: 5px; display: flex; flex-direction: column; align-items: center; }
    .office-use-bottom-right {
      width: 350px;
      padding: 8px 10px;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
      box-sizing: border-box;
    }
    .office-reference-name-block {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      min-height: 100%;
    }
    .office-reference-name-title {
      text-align: center;
      font-weight: 700;
      font-size: 12px;
      color: #8B2323;
      border-bottom: 1px solid #777;
      width: 100%;
      padding-bottom: 4px;
    }
    .office-reference-name-value {
      width: 100%;
      min-height: 120px;
      flex: 1;
      border: 1px solid #777;
      padding: 8px 6px;
      font-size: 12px;
      font-weight: 600;
      text-align: center;
      line-height: 1.35;
      box-sizing: border-box;
      word-break: break-word;
    }
    
    .office-label-tag { background: #8B2323; color: white; padding: 4px 20px; border-radius: 10px; font-weight: bold; margin: 10px auto; display: block; width: fit-content; text-align: center; }

    .doc-required-section { display: flex; gap: 10px; margin-top: 10px; }
    .doc-table { flex: 1; border-collapse: collapse; }
    .doc-table th, .doc-table td { border: 1px solid #777; padding: 3px; font-size: 10px; }

    .m-t-10 { margin-top: 10px; }
    .bold { font-weight: bold; }
    .text-red { color: #8B2323; }
    .font-8 { font-size: 10px; }

    .print-doc-declaration-block { break-inside: auto; page-break-inside: auto; }
    .office-use-bottom { break-inside: auto; page-break-inside: auto; }

    @media print {
      body { padding: 0; margin: 5mm 10mm; }
      .header-top-row {
        display: flex;
        align-items: center;
        gap: 14px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .header-brand-stack {
        align-items: center;
        justify-content: center;
      }
      .form-sidebar-row {
        position: relative;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .form-sidebar-main {
        margin-right: calc(var(--print-sidebar-width) + 12px);
      }
      .form-sidebar-aside {
        position: absolute;
        top: 0;
        right: 0;
        width: var(--print-sidebar-width);
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        box-sizing: border-box;
      }
      .form-sidebar-photos {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-rows: repeat(3, minmax(0, 1fr));
        gap: 10px;
        margin-top: 10px;
      }
      .header-main h1,
      .app-title-box h2,
      .app-title-box p {
        white-space: nowrap;
      }
      .form-section {
        margin-top: 0;
      }
      .form-row {
        margin-bottom: 12px;
      }
      .address-section-layout {
        display: block;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .print-page-one {
        min-height: 277mm;
        display: flex;
        flex-direction: column;
      }
      .print-page-one .print-page-one-body {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .address-fields-grid {
        display: grid;
        grid-template-columns: minmax(118px, max-content) minmax(0, 1fr) minmax(118px, max-content) minmax(0, 1fr);
        column-gap: 8px;
        row-gap: 8px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .photos-stack-item,
      .portrait-thumb,
      .form-sidebar-photos {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .print-page-one .print-signature-footer.page-one-signatures {
        break-inside: avoid;
        page-break-inside: avoid;
        margin-top: 6px;
      }
      .print-page-two,
      .fee-print-page {
        padding-top: 12mm;
        box-sizing: border-box;
      }
      .print-page-two .header-container,
      .fee-print-page .header-container {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .no-print { display: none; }
      .education-table tbody tr { break-inside: auto; page-break-inside: auto; }

      .print-page {
        break-after: page;
        page-break-after: always;
      }
      .print-page:last-of-type {
        break-after: auto;
        page-break-after: auto;
      }
      .print-page-signatures {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .signature-divider {
        margin-bottom: 10px;
      }
      .print-signature-footer .signature-row {
        justify-content: space-between;
        width: 100%;
      }

      .print-page-two-content .siblings-table,
      .print-page-two-content .siblings-table thead,
      .print-page-two-content .siblings-table tbody {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      .print-declaration-signatures {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="print-page print-page-one">
    ${renderPrintPageHeader()}

    <div class="form-section print-page-one-body">
      <div class="app-title-row">
        <div class="app-title-box">
          <h2>APPLICATION FOR ADMISSION</h2>
          <p>(PLEASE FILL THE FORM IN CAPITAL LETTERS)</p>
        </div>
      </div>
      <div class="form-sidebar-row">
        <div class="form-sidebar-main">
          <div class="student-form-left">
          <div class="form-row form-row-student-name">
            <span class="section-num">1.</span>
            <span class="form-label form-label-with-ssc-hint">
              <span>Name of the Student :</span>
              <span class="ssc-label-hint">(As per S.S.C)</span>
            </span>
            <span class="form-value bold">${escapeHtml(student?.name?.toUpperCase())}</span>
          </div>
          <div class="form-row form-row-sub">
            <span class="form-label">Aadhar No :</span>
            <span class="form-field-line">${escapeHtml(student?.aadhaarNumber)}</span>
          </div>
          <div class="form-row form-row-sub">
            <span class="form-label">Mobile :</span>
            <span class="form-field-line">${escapeHtml(student?.phone)}</span>
          </div>
          <div class="form-row form-row-sub">
            <span class="form-label">Gender :</span>
            <span class="form-field-line">${escapeHtml(displayGenderText || '—')}</span>
          </div>
          <div class="form-row form-row-sub">
            <span class="form-label form-label-wide">Date of Birth (As Per SSC) :</span>
            ${renderDobBoxes(student?.dateOfBirth)}
          </div>
          <div class="form-row form-row-sub">
            <span class="form-label form-label-wide">Reservation Category :</span>
            <span class="form-field-line">${escapeHtml(displayReservationCategoryText || '—')}</span>
          </div>
          <div class="form-row form-row-sub">
            <span class="form-label form-label-wide">Other Reservation :</span>
            <span class="form-field-line">${escapeHtml(displayOtherReservationText || '—')}</span>
          </div>
          <div class="form-row form-row-sub">
            <span class="form-label">Nationality :</span>
            <span class="form-field-line">INDIAN</span>
          </div>

          <div class="form-row">
            <span class="section-num">2.</span>
            <span class="form-label">Father's Name :</span>
            <span class="form-field-line">${escapeHtml(parents?.father?.name?.toUpperCase())}</span>
          </div>
          <div class="form-row form-row-sub">
            <span class="form-label">Aadhar No :</span>
            <span class="form-field-line">${escapeHtml(parents?.father?.aadhaarNumber)}</span>
          </div>
          <div class="form-row form-row-sub">
            <span class="form-label">Mobile :</span>
            <span class="form-field-line">${escapeHtml(parents?.father?.phone)}</span>
          </div>

          <div class="form-row">
            <span class="section-num">3.</span>
            <span class="form-label">Mother's Name :</span>
            <span class="form-field-line">${escapeHtml(parents?.mother?.name?.toUpperCase())}</span>
          </div>
          <div class="form-row form-row-sub">
            <span class="form-label">Aadhar No :</span>
            <span class="form-field-line">${escapeHtml(parents?.mother?.aadhaarNumber)}</span>
          </div>
          <div class="form-row form-row-sub">
            <span class="form-label">Mobile :</span>
            <span class="form-field-line">${escapeHtml(parents?.mother?.phone)}</span>
          </div>
          </div>
          <div class="form-row form-row-lined form-row-section-title section-4-title">
            <span class="section-num">4.</span>
            <span class="form-label">Address for communication(In Capital Letters) :</span>
          </div>
          <div class="address-door-row">
            <span class="form-label">Door No/ Street Name :</span>
            <span class="form-field-line">${escapeHtml(formatPrintAddressValue(communicationAddress.doorOrStreet, true))}</span>
          </div>
        </div>
        <div class="form-sidebar-aside">
          <div class="office-use-top">
            <div class="office-use-row"><span>PIN No :</span><span></span></div>
            <div class="office-use-row"><span>Admission No :</span><span>${escapeHtml(admissionNumber || '')}</span></div>
            <div class="office-use-row"><span>Application No :</span><span class="text-red">${escapeHtml(applicationNumberDisplay)}</span></div>
            <div class="office-use-row"><span>Course :</span><span>${escapeHtml(courseName || course?.course)}</span></div>
            <div class="office-use-row"><span>Branch :</span><span>${escapeHtml(branchName || course?.branch)}</span></div>
            <div class="office-use-row"><span>Quota :</span><span>${escapeHtml(course?.quota)}</span></div>
          </div>
          <div class="form-sidebar-photos">
          <div class="photos-stack-item" aria-label="Student photo">
            <div class="portrait-thumb">${portraitPhotoCell(studentPhotoSrc, 'Student photo')}</div>
          </div>
          <div class="photos-stack-item" aria-label="Father photo">
            <div class="portrait-thumb">${portraitPhotoCell(fatherPhotoSrc, 'Father photo')}</div>
          </div>
          <div class="photos-stack-item" aria-label="Mother photo">
            <div class="portrait-thumb">${portraitPhotoCell(motherPhotoSrc, 'Mother photo')}</div>
          </div>
          </div>
        </div>
      </div>

      <div class="print-address-block">
      <div class="address-section-layout">
      <div class="address-fields-grid">
        <span class="form-label">Land Mark :</span>
        <span class="form-field-line">${escapeHtml(formatPrintAddressValue(communicationAddress.landmark, true))}</span>
        <span class="form-label">Village/City/Town :</span>
        <span class="form-field-line">${escapeHtml(formatPrintAddressValue(communicationAddress.villageOrCity, true))}</span>
        <span class="form-label">Mandal :</span>
        <span class="form-field-line">${escapeHtml(formatPrintAddressValue(communicationAddress.mandal, true))}</span>
        <span class="form-label">District :</span>
        <span class="form-field-line">${escapeHtml(formatPrintAddressValue(communicationAddress.district, true))}</span>
        <span class="form-label">State :</span>
        <span class="form-field-line">${escapeHtml(formatPrintAddressValue(communicationAddress.state, true))}</span>
        <span class="form-label">Pin Code :</span>
        <span class="form-field-line">${escapeHtml(formatPrintAddressValue(communicationAddress.pinCode))}</span>
      </div>
      </div>
      </div>

      <div class="form-row m-t-10 form-row-section-title">
        <span class="section-num">5.</span>
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
              .map((part) => formatPrintAddressValue(part))
              .filter(Boolean)
              .join(', ');
            const mobile = (rel as { phone?: string; mobile?: string }).phone
              || (rel as { phone?: string; mobile?: string }).mobile
              || '';
            return `
              <div class="relative-box">
                <div><strong>${idx + 1}) ${escapeHtml(nameLine.toUpperCase() || '')}</strong></div>
                <div style="font-size: 10px; margin-top: 2px;">${escapeHtml(addressLine.toUpperCase())}</div>
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

      <div class="qualified-exam-section">
        <div class="form-row qualified-exam-row-main">
          <span class="section-num">6.</span>
          <span class="form-label-wide">Details of Qualified Examination :</span>
          <span class="form-field-inline form-field-inline-wide">${escapeHtml(displayQualifiedExamText || '—')}</span>
        </div>
        <div class="form-row qualified-exam-row-sub">
          <div class="qualified-exam-two-col">
            <div class="qualified-exam-col">
              <span class="form-label-compact">Merit :</span>
              <span class="form-field-inline">${escapeHtml(displayMeritText || '—')}</span>
            </div>
            <div class="qualified-exam-col">
              <span class="form-label-compact">Medium of Qualified Examination :</span>
              <span class="form-field-inline">${escapeHtml(displayMediumText || '—')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    ${renderPrintSignatureRow('page-one-signatures')}
    ${renderPrintPageNumber(1)}
    </div>

    <div class="print-page print-page-two">
    ${renderPrintPageHeader()}
    ${renderPrintStudentMetaInline()}
    <div class="print-page-two-content">
      <div class="form-row m-t-10 form-row-section-title">
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
          ${educationTableRows.map(({ label, key }) => {
            const edu = findEducationByLevel(key);
            const institutionText = [edu?.institutionName, edu?.institutionAddress]
              .filter(Boolean)
              .join(', ');
            return `
              <tr style="height: 28px;">
                <td>${label}</td>
                <td>${escapeHtml(edu?.courseOrBranch || '')}</td>
                <td>${escapeHtml(edu?.yearOfPassing || '')}</td>
                <td style="font-size: 10px;">${escapeHtml(institutionText)}</td>
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
              <tr style="height: 28px;">
                <td>${escapeHtml(standardLabel)}</td>
                <td>${escapeHtml(edu?.courseOrBranch || '')}</td>
                <td>${escapeHtml(edu?.yearOfPassing || '')}</td>
                <td style="font-size: 10px;">${escapeHtml(institutionText)}</td>
                <td>${escapeHtml(edu?.hallTicketNumber || '')}</td>
                <td>${escapeHtml(edu?.totalMarksOrGrade || '')}</td>
                <td></td>
                <td>${escapeHtml(edu?.cetRank || '')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

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
                <tr style="height: 28px;">
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

    <div class="form-row form-row-section-title">
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
    </div>

    <div class="print-doc-declaration-block">
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
    </div>
    </div>
    </div>
    ${renderPrintSignatureRow('page-two-signatures')}
    ${renderPrintPageNumber(2)}
    </div>

    <div class="print-page fee-print-page">
    ${renderPrintPageHeader()}
    ${renderPrintStudentMetaInline()}

    ${feeStructureTableHtml}

    <div class="office-label-tag">FOR OFFICE USE</div>
    <div class="office-use-bottom">
      <div class="office-use-bottom-left">
        <div style="text-align: center; font-weight: bold; margin-bottom: 10px;">Fee Paid Details</div>
        ${paymentSummary ? `
          <div style="font-size: 11px; margin-bottom: 4px; display: flex; gap: 12px; justify-content: center;">
            <span><strong>Total:</strong> ${formatCurrency(paymentSummary.totalFee)}</span>
            <span><strong>Paid:</strong> ${formatCurrency(paymentSummary.totalPaid)}</span>
            <span><strong>Balance:</strong> ${formatCurrency(paymentSummary.balance)}</span>
          </div>
        ` : ''}
        <table class="data-table" style="font-size: 10px;">
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
                  <tr style="height: 24px;">
                    <td>${i + 1}</td>
                    <td>${escapeHtml(getReceiptNumber(tx))}</td>
                    <td>${escapeHtml(formatTxDate(tx?.paymentDate || tx?.createdAt))}</td>
                    <td>${escapeHtml(tx?.paymentMode === 'Net Banking' ? 'Bank' : tx?.paymentMode || tx?.mode || '')}</td>
                    <td>${tx ? formatCurrency(tx.amount) : ''}</td>
                    <td>${escapeHtml(tx?.remarks || tx?.feeHeadName || tx?.status || '')}</td>
                  </tr>
                `;
              }).join('');
            })()}
          </tbody>
        </table>
      </div>
      <div class="office-use-bottom-right">
        <div class="office-reference-name-block">
          <div class="office-reference-name-title">Reference Name</div>
          <div class="office-reference-name-value">${escapeHtml(referenceNameDisplay || '')}</div>
        </div>
      </div>
    </div>

    ${renderPrintSignatureRow('page-three-signatures')}
    ${renderPrintPageNumber(3)}
    </div>

  </div>
</body>
</html>`;
}


/**
 * Reusable printable full student application. Uses the same hidden-iframe
 * print mechanism as PrintableDocumentChecklist (single print dialog, cleanup on afterprint).
 */
function parseAdmitCardAssetsCollegeAddress(response: unknown): string {
  const root = response as { data?: { collegeAddress?: string } } | { collegeAddress?: string } | null;
  const payload =
    root && typeof root === 'object' && 'data' in root && root.data && typeof root.data === 'object'
      ? root.data
      : root;
  return String((payload as { collegeAddress?: string })?.collegeAddress ?? '').trim();
}

export function PrintableStudentApplication({
  application,
  enquiryNumber,
  admissionNumber,
  courseName,
  branchName,
  paymentSummary,
  transactions,
  collegeName,
  collegeAddress: collegeAddressProp,
  title = DEFAULT_TITLE,
  printButtonLabel = 'Print application',
  className,
  renderButton = true,
  onPrintOpen,
  onPrintClose,
}: PrintableStudentApplicationProps) {
  const [loading, setLoading] = useState(false);

  const handlePrint = useCallback(async () => {
    if (typeof document === 'undefined') return;
    setLoading(true);
    try {
    onPrintOpen?.();
    let collegeAddress = String(collegeAddressProp ?? '').trim();
    const courseId = String(application.courseInfo?.courseId ?? '').trim();
    if (!collegeAddress && courseId) {
      try {
        const response = await courseAPI.getAdmitCardAssets(courseId);
        collegeAddress = parseAdmitCardAssetsCollegeAddress(response);
      } catch {
        // Print without college address when assets cannot be loaded.
      }
    }
    const feeStructureTableHtml = await resolvePrintFeeStructureTableHtml(
      application,
      courseName,
      branchName,
      admissionNumber
    );
    const resolvedAdmissionNumber =
      String(admissionNumber || (application as Admission).admissionNumber || '').trim();
    let feePaidTransactions: PrintPaidTransaction[] = transactions ?? [];
    if (resolvedAdmissionNumber) {
      const feeMongoTransactions = extractFeeMongoTransactions(
        await paymentAPI
          .listFeeManagementTransactions({ admissionNumber: resolvedAdmissionNumber })
          .catch(() => null)
      );
      if (feeMongoTransactions.length > 0) {
        feePaidTransactions = feeMongoTransactions;
      }
    }
    const html = getPrintApplicationHtml({
      application,
      title,
      enquiryNumber,
      admissionNumber,
      courseName,
      branchName,
      paymentSummary: paymentSummary ?? null,
      transactions: feePaidTransactions,
      printedDate: formatPrintDate(),
      collegeName,
      collegeAddress: collegeAddress || undefined,
      feeStructureTableHtml,
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
    } finally {
      setLoading(false);
    }
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
    collegeAddressProp,
    onPrintOpen,
    onPrintClose,
  ]);

  if (!renderButton) return null;

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void handlePrint()}
      className={className}
      disabled={loading}
    >
      {loading ? 'Preparing…' : printButtonLabel}
    </Button>
  );
}

export default PrintableStudentApplication;
