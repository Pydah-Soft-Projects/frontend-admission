'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/Button';
import type { Joining, Admission, PaymentSummary, PaymentTransaction, JoiningDocuments } from '@/types';

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

  const checkbox = (checked: boolean) => `
    <span class="cb-box ${checked ? 'checked' : ''}"></span>
  `;

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

  // Split docs into two columns for the table
  const leftDocs = docList.slice(0, 8);
  const rightDocs = docList.slice(8);

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
    
    .top-meta { display: flex; justify-content: space-between; margin-bottom: 10px; font-weight: 600; font-size: 10px; }
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
    
    .cb-group { display: flex; gap: 10px; flex-wrap: wrap; }
    .cb-item { display: flex; align-items: center; gap: 4px; margin-right: 8px; }
    .cb-box { width: 12px; height: 12px; border: 1px solid #333; display: inline-block; position: relative; }
    .cb-box.checked::after { content: '✓'; position: absolute; top: -3px; left: 1px; font-size: 10px; font-weight: bold; }
    
    .dob-grid { display: flex; gap: 2px; }
    .dob-grid span { border: 1px solid #333; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 10px; }

    .photo-box { border: 1px solid #777; width: 100px; height: 120px; display: flex; align-items: center; justify-content: center; position: absolute; right: 0; top: 150px; font-weight: bold; color: #777; }

    .relative-address-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 5px; }
    .relative-box { border: 1px solid #777; padding: 5px; height: 60px; }

    table.data-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
    table.data-table th, table.data-table td { border: 1px solid #777; padding: 4px; text-align: left; }
    table.data-table th { background: #f2f2f2; font-size: 9px; }
    
    .declaration-section { border-radius: 15px; border: 2px solid #8B2323; padding: 5px 15px; margin-top: 15px; }
    .declaration-title { text-align: center; margin: -15px auto 5px; background: #8B2323; color: white; width: 150px; border-radius: 10px; padding: 2px; font-weight: bold; }
    .declaration-list { list-style: disc; padding-left: 20px; font-size: 12px; }
    .declaration-list li { margin-bottom: 4px; }

    .signature-row { display: flex; justify-content: space-between; margin-top: 20px; padding: 0 20px; }
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

    @media print {
      body { padding: 0; margin: 5mm 10mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="top-meta">
      <div>Application No: <span class="box text-red">${escapeHtml(enquiryNumber || '')}</span></div>
      <div>Admission No: <span class="box">${escapeHtml(admissionNumber || '')}</span></div>
      <div>PIN No: <span class="box"></span></div>
    </div>

    <div class="header-container">
      <div class="header-logo">
        <img src="https://static.wixstatic.com/media/bfee2e_7d499a9b2c40442e85bb0fa99e7d5d37~mv2.png/v1/fill/w_162,h_89,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/logo1.png" alt="Pydah Logo" />
      </div>
      <div class="header-main">
        <div>
          <h1>PYDAH EDUCATIONAL INSTITUTIONS</h1>
          <p>KAKINADA</p>
        </div>
      </div>

      <div class="office-use-top">
        <div class="title">For Office Use</div>
        <div><span>Course :</span> <span>${escapeHtml(courseName || course?.course)}</span></div>
        <div><span>Branch :</span> <span>${escapeHtml(branchName || course?.branch)}</span></div>
        <div><span>Quota :</span> <span>${escapeHtml(course?.quota)}</span></div>
      </div>
    </div>

    <div class="app-title-box">
      <h2>APPLICATION FOR ADMISSION</h2>
      <p>(PLEASE FILL THE FORM IN CAPITAL LETTERS)</p>
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
        <div class="cb-group" style="min-width: 150px;">
          <span class="cb-item">${checkbox(student?.gender?.toLowerCase() === 'male')} Male</span>
          <span class="cb-item">${checkbox(student?.gender?.toLowerCase() === 'female')} Female</span>
        </div>
        <span class="form-label" style="min-width: 150px;">Date of Birth (As Per SSC) :</span>
        ${renderDobBoxes(student?.dateOfBirth)}
      </div>

      <div class="photo-box">Photo</div>

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
        <div class="cb-group">
          ${['OC', 'EWS', 'BC-A', 'BC-B', 'BC-C', 'BC-D', 'BC-E', 'SC', 'ST'].map(cat => `
            <span class="cb-item">${checkbox(!!(reservation?.general?.toUpperCase() === cat || (cat === 'EWS' && reservation?.isEws)))} ${cat}</span>
          `).join('')}
        </div>
      </div>
      <div class="form-row" style="padding-left: 20px;">
        <span class="form-label" style="min-width: 120px;">Other Reservation :</span>
        <div class="cb-group">
          ${['NCC', 'SPORTS', 'EX-SERVICEMAN', 'PH', 'OTHERS'].map(cat => `
            <span class="cb-item">${checkbox(!!reservation?.other?.includes(cat))} ${cat}</span>
          `).join('')}
          <span style="margin-left: 10px;">(If any)..................................</span>
        </div>
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
        <span style="margin-left: 10px; min-width: 60px;">Pin Code :</span>
        <span class="inline-val">${escapeHtml(address?.communication?.pinCode)}</span>
      </div>

      <div class="form-row m-t-10">
        <span class="section-num">6.</span>
        <span class="form-label">Full Address of any Relative / Friends</span>
      </div>
      <div class="relative-address-grid" style="margin-left: 20px;">
        <div class="relative-box">
          1)....................................................................................<br/>
          .......................................................................................<br/>
          Mobile :
        </div>
        <div class="relative-box">
          2)....................................................................................<br/>
          .......................................................................................<br/>
          Mobile :
        </div>
      </div>

      <div class="form-row m-t-10">
        <span class="section-num">7.</span>
        <span class="form-label" style="min-width: 180px;">Details of Qualified Examination :</span>
        <div class="cb-group">
          <span class="cb-item">${checkbox(!!qualifications?.ssc)} SSC</span>
          <span class="cb-item">${checkbox(!!qualifications?.interOrDiploma)} Inter / Diploma</span>
          <span class="cb-item">${checkbox(!!qualifications?.ug)} UG</span>
        </div>
      </div>
      <div class="form-row" style="padding-left: 20px;">
        <span class="form-label" style="min-width: 180px;">Medium of Qualified Examination :</span>
        <div class="cb-group">
          <span class="cb-item">${checkbox(!!qualifications?.mediums?.includes('english'))} English</span>
          <span class="cb-item">${checkbox(!!qualifications?.mediums?.includes('telugu'))} Telugu</span>
          <span class="cb-item">${checkbox(false)} Others(If any) ........................................</span>
        </div>
      </div>

      <div class="form-row m-t-10">
        <span class="section-num">8.</span>
        <span class="form-label">Details of the School/College Last Studied :</span>
      </div>
      <table class="data-table">
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
          ${['SSC', 'Inter / Diploma', 'UG'].map(std => {
            const edu = educationHistory.find(e => e.level === (std === 'Inter / Diploma' ? 'INTERMEDIATE' : std));
            return `
              <tr style="height: 25px;">
                <td>${std}</td>
                <td>${escapeHtml(edu?.courseOrBranch || '')}</td>
                <td>${escapeHtml(edu?.yearOfPassing || '')}</td>
                <td style="font-size: 8px;">${escapeHtml(edu?.institutionName || '')}</td>
                <td></td>
                <td>${escapeHtml(edu?.totalMarksOrGrade || '')}</td>
                <td></td>
                <td></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>

      <div class="form-row m-t-10">
        <span class="section-num">9.</span>
        <span class="form-label">Details of the Siblings</span>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th style="width: 100px;">Relation</th>
            <th>Name</th>
            <th style="width: 100px;">Standard</th>
            <th>Name of the School/ College</th>
          </tr>
        </thead>
        <tbody>
          ${Array.from({ length: 2 }).map((_, i) => {
            const sib = siblings[i];
            return `
              <tr style="height: 25px;">
                <td>${i === 0 ? 'Brother/Sister' : ''}</td>
                <td>${escapeHtml(sib?.name || '')}</td>
                <td>${escapeHtml(sib?.studyingStandard || '')}</td>
                <td>${escapeHtml(sib?.institutionName || '')}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Signature Row — Page 1 Bottom -->
    <div class="signature-row" style="margin-top: 30px; border-top: 2px solid #8B2323; padding-top: 15px;">
      <div class="sig-block">
        <div class="sig-section-title">STUDENT SIGNATURE</div>
        <div class="sig-box"></div>
      </div>
      <div class="sig-block">
        <div class="sig-section-title">PARENT / GUARDIAN SIGNATURE</div>
        <div class="sig-box"></div>
      </div>
    </div>

    <!-- Page Break or Second Section -->
    <div style="page-break-before: always;"></div>
    <div style="height: 30px;"></div>

    <div class="top-meta">
      <div>STUDENT NAME : <span class="bold" style="border-bottom: 1px dotted #333; min-width: 150px; display: inline-block;">${escapeHtml(student?.name?.toUpperCase())}</span></div>
      <div>Pin No: <span style="border-bottom: 1px dotted #333; min-width: 80px; display: inline-block;"></span></div>
      <div>Course: <span style="border-bottom: 1px dotted #333; min-width: 100px; display: inline-block;">${escapeHtml(courseName || course?.course)}</span></div>
      <div>Branch: <span style="border-bottom: 1px dotted #333; min-width: 100px; display: inline-block;">${escapeHtml(branchName || course?.branch)}</span></div>
    </div>

    <div class="form-row">
      <span class="section-num">10.</span>
      <span class="form-label">List of Documents Required</span>
    </div>
    <div class="doc-required-section">
      <table class="doc-table">
        <thead>
          <tr>
            <th>s.no</th>
            <th>Particulars</th>
            <th>Yes/ No</th>
            <th>s.no</th>
            <th>Particulars</th>
            <th>Yes/ No</th>
          </tr>
        </thead>
        <tbody>
          ${Array.from({ length: 8 }).map((_, i) => `
            <tr>
              <td style="text-align: center;">${i + 1}.</td>
              <td>${escapeHtml(leftDocs[i]?.label || '')}</td>
              <td style="text-align: center;">${leftDocs[i] ? (documents[leftDocs[i].id] === 'received' ? 'Yes' : 'No') : ''}</td>
              <td style="text-align: center;">${i + 9}.</td>
              <td>${escapeHtml(rightDocs[i]?.label || '')}</td>
              <td style="text-align: center;">${rightDocs[i] ? (documents[rightDocs[i].id] === 'received' ? 'Yes' : 'No') : ''}</td>
            </tr>
          `).join('')}
          <tr>
            <td colspan="6" style="background: #f2f2f2; font-weight: bold; padding: 5px;">
              NOTE : 2 Sets of Xerox copies of the certificates from 1 to 6
            </td>
          </tr>
        </tbody>
      </table>
    </div>

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

    <div class="office-label-tag">FOR OFFICE USE</div>
    <div class="office-use-bottom">
      <div class="office-use-bottom-left">
        <div style="text-align: center; font-weight: bold; margin-bottom: 5px;">Fee Paid Details</div>
        <table class="data-table" style="font-size: 8px;">
          <thead>
            <tr>
              <th>S.no</th>
              <th>Receipt No</th>
              <th>Amount Paid</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${Array.from({ length: 5 }).map((_, i) => {
              const tx = transactions[i];
              return `
                <tr style="height: 18px;">
                  <td>${i + 1}</td>
                  <td>${escapeHtml(tx?._id?.slice(-6) || '')}</td>
                  <td>${tx ? formatCurrency(tx.amount) : ''}</td>
                  <td>${escapeHtml(tx?.status || '')}</td>
                </tr>
              `;
            }).join('')}
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
