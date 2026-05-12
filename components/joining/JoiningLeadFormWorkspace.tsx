'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  joiningAPI,
  admissionAPI,
  paymentAPI,
  paymentSettingsAPI,
  registrationFormAPI,
  courseAPI,
} from '@/lib/api';
import { joiningPublicApi } from '@/lib/joiningPublicApi';
import { JoiningDynamicRegistrationFields } from '@/components/joining/JoiningDynamicRegistrationFields';
import {
  applyMappedRegistrationField,
  isJoiningRegistrationFieldMapped,
  mergeJoiningStudentInfoFromExtras,
  readMappedRegistrationField,
} from '@/lib/joiningRegistrationFieldMap';
import {
  filterJoiningRegistrationDisplayFields,
  stripJoiningRedundantRegistrationExtras,
} from '@/lib/joiningRegistrationFieldFilter';
import {
  buildCertificateChecklistStoredValue,
  certificateChecklistValuesEqual,
  computeCertificationStatusFromChecklist,
  listCertificateItemOptions,
  parseCertificateChecklistEntry,
  type CertificateChecklistStoredValue,
} from '@/lib/certificateChecklistEntry';
import { coerceJoiningRegistrationField } from '@/lib/joiningRegistrationFieldCoerce';
import { mergeLeadIntoJoiningFormState, type LeadLike } from '@/lib/joiningLeadPrefill';
import { computeScholarshipRegistrationPatches } from '@/lib/joiningScholarshipQuotaDefault';
import {
  computeAcademicYearRegistrationPatches,
  resolveTotalYearsFromCourseSettings,
} from '@/lib/joiningAcademicYearRegistration';
import { showToast } from '@/lib/toast';
import {
  Joining,
  JoiningDocumentStatus,
  JoiningDocuments,
  JoiningEducationHistory,
  JoiningRelativeAddress,
  JoiningReservation,
  JoiningSibling,
  JoiningStatus,
  Admission,
  Branch,
  PaymentSummary,
  CoursePaymentSettings,
  PaymentTransaction,
  CashfreeConfigPreview,
  CertificateGuidance,
} from '@/types';
import { useDashboardHeader, useModulePermission } from '@/components/layout/DashboardShell';
import { PrintableDocumentChecklist } from '@/components/PrintableDocumentChecklist';
import { FeeStructureSection, type FeeHeadSelection } from '@/components/fee/FeeStructureSection';
import { useLocations } from '@/lib/useLocations';
import { useInstitutions } from '@/lib/useInstitutions';

const formatCurrency = (amount?: number | null) => {
  if (amount === undefined || amount === null || Number.isNaN(amount)) {
    return '—';
  }
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return amount.toString();
  }
};

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  return new Date(value).toLocaleString();
};

const documentLabels: Record<keyof JoiningDocuments, string> = {
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

/** Hidden from the joining UI checklist (covered by settings `certificate_config` per program level). */
const DOCUMENT_KEYS_HIDDEN_FROM_CHECKLIST = new Set<keyof JoiningDocuments>([
  'ssc',
  'inter',
  'ugOrPgCmm',
  'transferCertificate',
  'studyCertificate',
]);

const quotaOptions = ['Management', 'Convenor', 'Not Applicable'] as const;

const mediumOptions: Array<{ value: 'english' | 'telugu' | 'other'; label: string }> = [
  { value: 'english', label: 'English' },
  { value: 'telugu', label: 'Telugu' },
  { value: 'other', label: 'Other' },
];

const mediumOptionValues = new Set(mediumOptions.map((option) => option.value));

const documentStatusOptions: JoiningDocumentStatus[] = ['pending', 'received'];
const FIXED_REGISTRATION_ACADEMIC_YEAR = '2026';
const FIXED_REGISTRATION_SEMESTER = '1-1';

const normalizeDateInput = (value?: string) => {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const isoCandidate = new Date(value);
  if (!Number.isNaN(isoCandidate.getTime())) {
    return isoCandidate.toISOString().slice(0, 10);
  }
  const ddMmYyMatch = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddMmYyMatch) {
    return `${ddMmYyMatch[3]}-${ddMmYyMatch[2]}-${ddMmYyMatch[1]}`;
  }
  return '';
};

const normalizeMediumSelections = (
  qualifications?: Joining['qualifications']
): Array<'english' | 'telugu' | 'other'> => {
  const selections: string[] = [];

  if (Array.isArray(qualifications?.mediums)) {
    selections.push(...qualifications.mediums);
  }

  const legacyMedium = (qualifications as any)?.medium;
  if (typeof legacyMedium === 'string' && legacyMedium) {
    selections.push(legacyMedium);
  }

  return Array.from(
    new Set(
      selections.filter(
        (item): item is 'english' | 'telugu' | 'other' => mediumOptionValues.has(item as any)
      )
    )
  );
};

const sanitizeYearValue = (value: string) => value.replace(/\D/g, '').slice(0, 4);

const sanitizeTotalMarksInput = (nextValue: string, previousValue: string) => {
  const cleaned = nextValue.replace(/[^0-9.%]/g, '');

  if (cleaned === '') {
    return '';
  }

  const percentMatches = cleaned.match(/%/g)?.length ?? 0;
  if (percentMatches > 1) {
    return previousValue;
  }

  if (percentMatches === 1) {
    if (!cleaned.endsWith('%')) {
      return previousValue;
    }

    const numberPart = cleaned.slice(0, -1);
    if (!numberPart) {
      return previousValue;
    }

    if (numberPart.split('%').length > 1) {
      return previousValue;
    }

    const [integerPart, decimalPart] = numberPart.split('.');
    if (!integerPart || integerPart.length > 2 || !/^\d+$/.test(integerPart)) {
      return previousValue;
    }

    if (decimalPart !== undefined) {
      if (decimalPart.length > 2 || !/^\d*$/.test(decimalPart)) {
        return previousValue;
      }
    }

    return cleaned;
  }

  if (/^\d{0,4}(\.\d{0,2})?$/.test(cleaned)) {
    return cleaned;
  }

  return previousValue;
};

function RelativeAddressRow({
  relative,
  index,
  updateRelative,
  removeRelative,
  stateNames,
}: {
  relative: JoiningRelativeAddress;
  index: number;
  updateRelative: (index: number, field: keyof JoiningRelativeAddress, value: string) => void;
  removeRelative: (index: number) => void;
  stateNames: string[];
}) {
  const { districtNames, mandalNames } = useLocations({
    stateName: relative.state || undefined,
    districtName: relative.district || undefined,
  });
  return (
    <div className="rounded-xl border border-gray-200 p-4 shadow-sm dark:border-slate-700">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200">Address #{index + 1}</h3>
        <button className="text-sm text-red-500" onClick={() => removeRelative(index)}>Remove</button>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Input label="Name" value={relative.name || ''} onChange={(e) => updateRelative(index, 'name', e.target.value)} />
        <Input label="Relationship" value={relative.relationship || ''} onChange={(e) => updateRelative(index, 'relationship', e.target.value)} />
        <Input label="Door / Street" value={relative.doorOrStreet || ''} onChange={(e) => updateRelative(index, 'doorOrStreet', e.target.value.toUpperCase())} />
        <Input label="Landmark" value={relative.landmark || ''} onChange={(e) => updateRelative(index, 'landmark', e.target.value.toUpperCase())} />
        <Input label="Village / City" value={relative.villageOrCity || ''} onChange={(e) => updateRelative(index, 'villageOrCity', e.target.value.toUpperCase())} />
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">State</label>
          <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" value={relative.state || ''} onChange={(e) => updateRelative(index, 'state', e.target.value)}>
            <option value="">Select state</option>
            {stateNames.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">District</label>
          <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" value={relative.district || ''} onChange={(e) => updateRelative(index, 'district', e.target.value)}>
            <option value="">Select district</option>
            {districtNames.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mandal</label>
          <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" value={relative.mandal || ''} onChange={(e) => updateRelative(index, 'mandal', e.target.value)}>
            <option value="">Select mandal</option>
            {mandalNames.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <Input label="PIN Code" value={relative.pinCode || ''} onChange={(e) => updateRelative(index, 'pinCode', e.target.value)} maxLength={6} />
      </div>
    </div>
  );
}

type JoiningFormState = {
  courseInfo: Joining['courseInfo'];
  studentInfo: Joining['studentInfo'];
  parents: Joining['parents'];
  reservation: JoiningReservation;
  address: Joining['address'];
  qualifications: Joining['qualifications'];
  educationHistory: JoiningEducationHistory[];
  siblings: JoiningSibling[];
  documents: JoiningDocuments;
};

const defaultDocuments: JoiningDocuments = {
  ssc: 'pending',
  inter: 'pending',
  ugOrPgCmm: 'pending',
  transferCertificate: 'pending',
  studyCertificate: 'pending',
  aadhaarCard: 'pending',
  photos: 'pending',
  incomeCertificate: 'pending',
  casteCertificate: 'pending',
  cetRankCard: 'pending',
  cetHallTicket: 'pending',
  allotmentLetter: 'pending',
  joiningReport: 'pending',
  bankPassBook: 'pending',
  rationCard: 'pending',
};

const buildInitialState = (joining?: Joining): JoiningFormState => {
  const resolvedMediums = normalizeMediumSelections(joining?.qualifications);

  return {
    courseInfo: {
      courseId: joining?.courseInfo?.courseId,
      branchId: joining?.courseInfo?.branchId,
      course: joining?.courseInfo?.course || '',
      branch: joining?.courseInfo?.branch || '',
      quota: joining?.courseInfo?.quota || '',
      programLevel: joining?.courseInfo?.programLevel || '',
    },
    studentInfo: {
      name: joining?.studentInfo?.name || '',
      aadhaarNumber: joining?.studentInfo?.aadhaarNumber || '',
      phone: joining?.studentInfo?.phone || '',
      gender: joining?.studentInfo?.gender || '',
      dateOfBirth: normalizeDateInput(joining?.studentInfo?.dateOfBirth),
    },
    parents: {
      father: {
        name: joining?.parents?.father?.name || '',
        phone: joining?.parents?.father?.phone || '',
        aadhaarNumber: joining?.parents?.father?.aadhaarNumber || '',
      },
      mother: {
        name: joining?.parents?.mother?.name || '',
        phone: joining?.parents?.mother?.phone || '',
        aadhaarNumber: joining?.parents?.mother?.aadhaarNumber || '',
      },
    },
    reservation: {
      general: joining?.reservation?.general || 'oc',
      isEws: joining?.reservation?.isEws || false,
      other: joining?.reservation?.other || [],
    },
    address: {
      communication: {
        state: joining?.address?.communication?.state || '',
        doorOrStreet: joining?.address?.communication?.doorOrStreet || '',
        landmark: joining?.address?.communication?.landmark || '',
        villageOrCity: joining?.address?.communication?.villageOrCity || '',
        mandal: joining?.address?.communication?.mandal || '',
        district: joining?.address?.communication?.district || '',
        pinCode: joining?.address?.communication?.pinCode || '',
      },
      relatives: joining?.address?.relatives?.length
        ? joining.address.relatives.map((relative) => ({
          name: relative.name || '',
          relationship: relative.relationship || '',
          state: relative.state || '',
          doorOrStreet: relative.doorOrStreet || '',
          landmark: relative.landmark || '',
          villageOrCity: relative.villageOrCity || '',
          mandal: relative.mandal || '',
          district: relative.district || '',
          pinCode: relative.pinCode || '',
        }))
        : [],
    },
    qualifications: {
      ssc: joining?.qualifications?.ssc || false,
      interOrDiploma: joining?.qualifications?.interOrDiploma || false,
      ug: joining?.qualifications?.ug || false,
      mediums: resolvedMediums,
      otherMediumLabel: resolvedMediums.includes('other')
        ? joining?.qualifications?.otherMediumLabel || ''
        : '',
    },
    educationHistory: joining?.educationHistory?.length
      ? joining.educationHistory.map((item) => ({
        level: item.level,
        otherLevelLabel: item.otherLevelLabel || '',
        courseOrBranch: item.courseOrBranch || '',
        yearOfPassing: item.yearOfPassing || '',
        institutionName: item.institutionName || '',
        institutionAddress: item.institutionAddress || '',
        hallTicketNumber: item.hallTicketNumber || '',
        totalMarksOrGrade: item.totalMarksOrGrade || '',
        cetRank: item.cetRank || '',
      }))
      : [],
    siblings: joining?.siblings?.length
      ? joining.siblings.map((sibling) => ({
        name: sibling.name || '',
        relation: sibling.relation || '',
        studyingStandard: sibling.studyingStandard || '',
        institutionName: sibling.institutionName || '',
      }))
      : [],
    documents: {
      ...defaultDocuments,
      ...(joining?.documents || {}),
    },
  };
};

const maskAadhaar = (value?: string) => {
  const digitsOnly = value?.replace(/\D/g, '') || '';
  if (!digitsOnly) return '';
  if (digitsOnly.length <= 4) return digitsOnly;
  const masked = digitsOnly
    .slice(0, -4)
    .replace(/\d/g, '•')
    .replace(/(.{4})/g, '$1 ')
    .trim();
  const suffix = digitsOnly.slice(-4);
  return `${masked} ${suffix}`;
};

export type JoiningLeadFormWorkspaceProps = {
  adminLeadId?: string | null;
  publicToken?: string | null;
};

export function JoiningLeadFormWorkspace({ adminLeadId, publicToken }: JoiningLeadFormWorkspaceProps) {
  const isPublicEdit = Boolean(publicToken);
  const params = useParams();
  const router = useRouter();
  const { setHeaderContent, clearHeaderContent } = useDashboardHeader();
  const routeLeadFromParams = Array.isArray(params?.leadId) ? params.leadId[0] : params?.leadId;
  const effectiveAdminLeadId = (adminLeadId ?? routeLeadFromParams) as string | undefined;

  const joiningPerm = useModulePermission('joining');
  const paymentsPerm = useModulePermission('payments');
  const canAccessJoiningModule = isPublicEdit || joiningPerm.hasAccess;
  const canWriteJoining = isPublicEdit || joiningPerm.canWrite;
  const canAccessPaymentsModule = !isPublicEdit && paymentsPerm.hasAccess;
  const canWritePayments = !isPublicEdit && paymentsPerm.canWrite;

  const [formState, setFormState] = useState<JoiningFormState>(buildInitialState());
  const [status, setStatus] = useState<JoiningStatus>('draft');
  const [meta, setMeta] = useState<{
    updatedAt?: string;
    submittedAt?: string;
    approvedAt?: string;
    admissionNumber?: string;
  }>({});
  const [admissionRecord, setAdmissionRecord] = useState<Admission | null>(null);
  const [hasAppliedAdmissionSnapshot, setHasAppliedAdmissionSnapshot] = useState(false);
  const [otherReservationInput, setOtherReservationInput] = useState('');
  const [showStudentAadhaar, setShowStudentAadhaar] = useState(false);
  const [showFatherAadhaar, setShowFatherAadhaar] = useState(false);
  const [showMotherAadhaar, setShowMotherAadhaar] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [registrationExtras, setRegistrationExtras] = useState<Record<string, unknown>>({});
  const [registrationFormId, setRegistrationFormId] = useState<string | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [openPaymentMode, setOpenPaymentMode] = useState<'cash' | 'online' | null>(null);
  const [shouldPromptPayment, setShouldPromptPayment] = useState(false);
  const [isAdditionalFeeMode, setIsAdditionalFeeMode] = useState(false);
  const [paymentFormState, setPaymentFormState] = useState<{
    amount: string;
    isProcessing: boolean;
  }>({
    amount: '',
    isProcessing: false,
  });
  // Fee head the user clicked "Pay" against in the Fee Structure section. When set, the
  // payment modal pre-fills the row amount, displays a fee-head pill, and tags the resulting
  // payment_transactions row via the request body so payment history shows which head was paid.
  const [selectedFeeHead, setSelectedFeeHead] = useState<FeeHeadSelection | null>(null);
  const [publicLinkDialog, setPublicLinkDialog] = useState<{ url: string; expiresAt: string } | null>(null);
  const [publicLinkBusy, setPublicLinkBusy] = useState(false);
  const [publicSubmitted, setPublicSubmitted] = useState(false);

  const commState = formState.address.communication.state ?? '';
  const commDistrict = formState.address.communication.district ?? '';
  const { stateNames, districtNames: commDistricts, mandalNames: commMandals } = useLocations({
    stateName: commState || undefined,
    districtName: commDistrict || undefined,
  });
  const { colleges } = useInstitutions();

  const publicBootstrapQuery = useQuery({
    queryKey: ['joining-public-bootstrap', publicToken],
    enabled: isPublicEdit && !!publicToken,
    queryFn: async () => joiningPublicApi.getBootstrap(publicToken as string),
    retry: false,
  });

  const adminJoiningQuery = useQuery({
    queryKey: ['joining', effectiveAdminLeadId],
    enabled: !isPublicEdit && !!effectiveAdminLeadId,
    queryFn: async () => joiningAPI.getByLeadId(effectiveAdminLeadId as string),
  });

  const data = useMemo(() => {
    if (!isPublicEdit) return adminJoiningQuery.data;
    const root = publicBootstrapQuery.data;
    if (!root?.data) return undefined;
    const d = root.data as { joining: Joining; lead: Record<string, unknown> | null };
    return { ...root, data: { joining: d.joining, lead: d.lead } };
  }, [isPublicEdit, adminJoiningQuery.data, publicBootstrapQuery.data]);

  const isLoading = isPublicEdit ? publicBootstrapQuery.isLoading : adminJoiningQuery.isLoading;
  const refetch = isPublicEdit ? publicBootstrapQuery.refetch : adminJoiningQuery.refetch;

  const routeKey = useMemo(() => {
    if (isPublicEdit) {
      const rk = (publicBootstrapQuery.data?.data as { routeKey?: string } | undefined)?.routeKey;
      return rk || '';
    }
    return effectiveAdminLeadId || '';
  }, [isPublicEdit, publicBootstrapQuery.data, effectiveAdminLeadId]);

  const leadId = routeKey;
  const isNewJoining = !isPublicEdit && leadId === 'new';

  const joiningRecord = data?.data?.joining as Joining | undefined;
  // Use leadData from joining instead of populated lead
  /** Prefer populated `lead` from API (includes address, academicYear, studentGroup); fall back to snapshot in `leadData`. */
  const lead = (data?.data?.lead as any) || (joiningRecord?.leadData as any);

  /** Joining id (after first save) or CRM lead/joining URL segment — never `new`. Used for detail link + public invite API. */
  const publicLinkRouteKey = useMemo(() => {
    if (joiningRecord?._id) return String(joiningRecord._id);
    if (leadId && leadId !== 'new') return String(leadId);
    return '';
  }, [joiningRecord?._id, leadId]);

  const { data: registrationFormsResponse, isError: registrationFormsError } = useQuery({
    queryKey: ['registration-form', 'student-db', 'forms', 'joining'],
    queryFn: async () =>
      registrationFormAPI.listForms({ showInactive: false, includeFieldCount: true }),
    staleTime: 60_000,
    retry: 1,
    enabled: !isPublicEdit,
  });

  const registrationForms = useMemo(() => {
    if (isPublicEdit) {
      const list = (publicBootstrapQuery.data?.data as { registrationForms?: unknown[] } | undefined)
        ?.registrationForms;
      return Array.isArray(list) ? list : ([] as any[]);
    }
    const payload = (registrationFormsResponse as any)?.data ?? registrationFormsResponse;
    if (!payload) return [] as any[];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray((payload as any).data)) return (payload as any).data;
    return [] as any[];
  }, [isPublicEdit, publicBootstrapQuery.data, registrationFormsResponse]);

  useEffect(() => {
    if (!registrationFormId && registrationForms.length > 0) {
      const def =
        registrationForms.find((f: any) => f.isDefault || f.is_default) ?? registrationForms[0];
      const id = def?.id || def?._id;
      if (id) setRegistrationFormId(id);
    }
  }, [registrationForms, registrationFormId]);

  useEffect(() => {
    if (!isPublicEdit) return;
    const f = (publicBootstrapQuery.data?.data as { registrationForm?: { id?: string; _id?: string } } | undefined)
      ?.registrationForm;
    const id = f?.id || f?._id;
    if (id) setRegistrationFormId(String(id));
  }, [isPublicEdit, publicBootstrapQuery.data]);

  const {
    data: registrationFormResponse,
    isLoading: isLoadingRegistrationForm,
    isError: registrationFormError,
  } = useQuery({
    queryKey: ['registration-form', 'student-db', 'form', registrationFormId, 'joining'],
    queryFn: async () => {
      if (!registrationFormId) return null;
      return registrationFormAPI.getForm(registrationFormId, {
        includeFields: true,
        showInactive: false,
      });
    },
    enabled: !isPublicEdit && !!registrationFormId,
    staleTime: 30_000,
    retry: 1,
  });

  const registrationFormDefinition = useMemo(() => {
    if (isPublicEdit) {
      const f = (publicBootstrapQuery.data?.data as { registrationForm?: Record<string, unknown> } | undefined)
        ?.registrationForm;
      return f && typeof f === 'object' ? f : null;
    }
    if (!registrationFormResponse) return null;
    const payload = (registrationFormResponse as any)?.data ?? registrationFormResponse;
    return payload || null;
  }, [isPublicEdit, publicBootstrapQuery.data, registrationFormResponse]);

  const sortedRegistrationFields = useMemo(() => {
    const fields = registrationFormDefinition?.fields;
    if (!Array.isArray(fields)) return [] as any[];
    return [...fields].sort((a: any, b: any) => (a.displayOrder || 0) - (b.displayOrder || 0));
  }, [registrationFormDefinition]);

  /** Management → not eligible; Convenor → eligible (registration fields whose name/label match scholarship). */
  useEffect(() => {
    const q = (formState.courseInfo.quota || '').trim();
    if (q !== 'Management' && q !== 'Convenor') return;
    if (!sortedRegistrationFields.length) return;
    const patches = computeScholarshipRegistrationPatches(q, sortedRegistrationFields);
    if (!Object.keys(patches).length) return;
    setRegistrationExtras((prev) => {
      let next = { ...prev };
      let changed = false;
      for (const [k, v] of Object.entries(patches)) {
        const cur = next[k];
        if (cur !== undefined && cur !== null && String(cur).trim() !== '') continue;
        if (next[k] === v) continue;
        next[k] = v;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [sortedRegistrationFields, formState.courseInfo.quota, registrationFormId]);

  /** Omits course / branch / quota / student_type / Aadhaar / caste / address keys (etc.) — edited above in Course & Quota or structured student fields. */
  const joiningRegistrationDisplayFields = useMemo(
    () => filterJoiningRegistrationDisplayFields(sortedRegistrationFields),
    [sortedRegistrationFields]
  );

  const joiningRegistrationDisplayFieldsCoerced = useMemo(
    () => joiningRegistrationDisplayFields.map((f: any) => coerceJoiningRegistrationField(f)),
    [joiningRegistrationDisplayFields]
  );

  const registrationFormFieldsAllFilteredOut =
    sortedRegistrationFields.length > 0 && joiningRegistrationDisplayFields.length === 0;

  const registrationDynHas = useMemo(
    () => (names: string[]) =>
      joiningRegistrationDisplayFieldsCoerced.some((f: any) =>
        names.includes(String(f.fieldName || '').trim().toLowerCase())
      ),
    [joiningRegistrationDisplayFieldsCoerced]
  );

  const regHasDyn = joiningRegistrationDisplayFieldsCoerced.length > 0;
  const hideJoiningStudentName = regHasDyn && registrationDynHas(['student_name', 'name']);
  const hideJoiningStudentPhone =
    regHasDyn &&
    registrationDynHas([
      'student_phone',
      'phone',
      'student_mobile',
      'student_mobileno',
      'mobile',
      'applicant_mobile',
      'candidate_mobile',
    ]);
  const hideJoiningStudentGender = regHasDyn && registrationDynHas(['student_gender', 'gender']);
  const hideJoiningDateOfBirth = regHasDyn &&
    registrationDynHas([
      'date_of_birth',
      'dateofbirth',
      'dob',
      'student_dob',
      'student_date_of_birth',
      'birth_date',
      'birthdate',
    ]);
  const hideJoiningFatherName = regHasDyn && registrationDynHas(['father_name', 'fathername']);
  const hideJoiningMotherName = regHasDyn && registrationDynHas(['mother_name', 'mothername']);
  const hideJoiningDoor = regHasDyn && registrationDynHas(['address_door_street', 'door_street']);
  const hideJoiningLandmark = regHasDyn && registrationDynHas(['address_landmark', 'landmark']);
  const hideJoiningVillage = regHasDyn && registrationDynHas(['address_village_city', 'village', 'city', 'address_village']);
  const hideJoiningState = regHasDyn && registrationDynHas(['state', 'address_state']);
  const hideJoiningDistrict = regHasDyn && registrationDynHas(['address_district', 'district']);
  const hideJoiningMandal = regHasDyn && registrationDynHas(['address_mandal', 'mandal']);
  const hideJoiningPin = regHasDyn && registrationDynHas(['pincode', 'pin_code', 'address_pin_code']);

  useEffect(() => {
    if (!joiningRecord?._id) return;
    const saved = joiningRecord.registrationFormData;
    const ld = (joiningRecord.leadData || {}) as Record<string, unknown>;
    const dyn = ld.dynamicFields || ld.dynamic_fields;
    const merged: Record<string, unknown> = {
      ...(dyn && typeof dyn === 'object' ? (dyn as Record<string, unknown>) : {}),
      ...(saved && typeof saved === 'object' ? saved : {}),
    };
    const cleaned = { ...merged };
    Object.keys(cleaned).forEach((k) => {
      if (isJoiningRegistrationFieldMapped(k)) delete cleaned[k];
    });
    let next = stripJoiningRedundantRegistrationExtras(cleaned);
    const leadSnap = lead as LeadLike | undefined;
    // Academic year: always mirror the lead’s intake year on this workspace (single source of truth).
    if (leadSnap?.academicYear != null && !Number.isNaN(Number(leadSnap.academicYear))) {
      const y = String(leadSnap.academicYear);
      next = { ...next, academic_year: y, academicYear: y };
    }
    // Upload / intake batch from lead (UUID) — common registration field names.
    const uploadBid =
      leadSnap?.uploadBatchId != null && String(leadSnap.uploadBatchId).trim() !== ''
        ? String(leadSnap.uploadBatchId).trim()
        : '';
    if (uploadBid) {
      next = {
        ...next,
        upload_batch_id: uploadBid,
        uploadBatchId: uploadBid,
        batch_id: uploadBid,
        batchId: uploadBid,
        batch: uploadBid,
        upload_batch: uploadBid,
      };
    }
    if (leadSnap?.studentGroup && String(leadSnap.studentGroup).trim()) {
      const sg = String(leadSnap.studentGroup).trim();
      if (next.student_group === undefined && next.studentGroup === undefined) {
        next = { ...next, student_group: sg };
      }
    }
    if (next.student_status === undefined && next.studentStatus === undefined) {
      next = { ...next, student_status: 'Regular' };
    }
    next = {
      ...next,
      academic_year: FIXED_REGISTRATION_ACADEMIC_YEAR,
      academicYear: FIXED_REGISTRATION_ACADEMIC_YEAR,
      current_year: FIXED_REGISTRATION_ACADEMIC_YEAR,
      currentYear: FIXED_REGISTRATION_ACADEMIC_YEAR,
      current_semester: FIXED_REGISTRATION_SEMESTER,
      currentSemester: FIXED_REGISTRATION_SEMESTER,
      semester: FIXED_REGISTRATION_SEMESTER,
      semister: FIXED_REGISTRATION_SEMESTER,
    };
    setRegistrationExtras(next);
  }, [joiningRecord?._id, joiningRecord?.updatedAt, lead]);

  const registrationLocationState = useMemo(
    () =>
      formState.address.communication.state ||
      String(registrationExtras.state || registrationExtras.address_state || ''),
    [formState.address.communication.state, registrationExtras]
  );

  const registrationLocationDistrict = useMemo(
    () =>
      formState.address.communication.district ||
      String(registrationExtras.district || registrationExtras.address_district || ''),
    [formState.address.communication.district, registrationExtras]
  );

  const handleRegistrationFieldChange = useCallback((fieldName: string, value: unknown) => {
    const n = fieldName.toLowerCase();
    if (
      n === 'academic_year' ||
      n === 'academicyear' ||
      n === 'current_year' ||
      n === 'currentyear'
    ) {
      setRegistrationExtras((prev) => ({
        ...prev,
        [fieldName]: FIXED_REGISTRATION_ACADEMIC_YEAR,
        academic_year: FIXED_REGISTRATION_ACADEMIC_YEAR,
        academicYear: FIXED_REGISTRATION_ACADEMIC_YEAR,
        current_year: FIXED_REGISTRATION_ACADEMIC_YEAR,
        currentYear: FIXED_REGISTRATION_ACADEMIC_YEAR,
      }));
      return;
    }
    if (
      n === 'current_semester' ||
      n === 'currentsemester' ||
      n === 'semester' ||
      n === 'semister'
    ) {
      setRegistrationExtras((prev) => ({
        ...prev,
        [fieldName]: FIXED_REGISTRATION_SEMESTER,
        current_semester: FIXED_REGISTRATION_SEMESTER,
        currentSemester: FIXED_REGISTRATION_SEMESTER,
        semester: FIXED_REGISTRATION_SEMESTER,
        semister: FIXED_REGISTRATION_SEMESTER,
      }));
      return;
    }
    if (isJoiningRegistrationFieldMapped(fieldName)) {
      setFormState((prev) => applyMappedRegistrationField(prev, fieldName, value));
      return;
    }
    setRegistrationExtras((prev) => {
      const next = { ...prev, [fieldName]: value };
      if (n === 'state' || n === 'address_state') {
        delete next.district;
        delete next.address_district;
        delete next.mandal;
        delete next.address_mandal;
      } else if (n === 'district' || n === 'address_district') {
        delete next.mandal;
        delete next.address_mandal;
      } else if (n === 'student_group' || n === 'studentgroup') {
        delete next.school_or_college_name;
      }
      return next;
    });
  }, []);

  const selectedCollegeId = useMemo(() => {
    const rawId =
      registrationExtras.college_id ??
      registrationExtras.collegeId ??
      registrationExtras.school_or_college_id ??
      registrationExtras.schoolOrCollegeId;
    if (rawId !== undefined && rawId !== null && String(rawId).trim() !== '') {
      return String(rawId).trim();
    }
    const byName =
      (registrationExtras.school_or_college_name as string) ||
      (registrationExtras.college as string) ||
      '';
    const match = colleges.find((c) => c.name === byName);
    return match?.id || '';
  }, [registrationExtras, colleges]);

  const handleCollegeSelect = useCallback(
    (collegeId: string) => {
      const selected = colleges.find((item) => item.id === collegeId);
      setRegistrationExtras((prev) => ({
        ...prev,
        college_id: collegeId || undefined,
        collegeId: collegeId || undefined,
        school_or_college_id: collegeId || undefined,
        schoolOrCollegeId: collegeId || undefined,
        school_or_college_name: selected?.name || '',
        college: selected?.name || '',
      }));
    },
    [colleges]
  );

  const {
    data: courseSettingsResponse,
    isLoading: isLoadingCourseSettings,
  } = useQuery({
    queryKey: ['payment-settings', 'courses'],
    queryFn: async () => {
      const response = await paymentSettingsAPI.listCourseSettings();
      return response;
    },
    enabled: !isPublicEdit,
  });

  const courseSettings: CoursePaymentSettings[] = useMemo(() => {
    if (isPublicEdit) {
      const raw = (publicBootstrapQuery.data?.data as { courseSettings?: CoursePaymentSettings[] } | undefined)
        ?.courseSettings;
      if (!Array.isArray(raw)) return [];
      return raw;
    }
    const payload = courseSettingsResponse?.data;
    let settings: CoursePaymentSettings[] = [];

    if (Array.isArray(payload)) {
      settings = payload as CoursePaymentSettings[];
    } else if (payload && Array.isArray((payload as any).data)) {
      settings = (payload as any).data as CoursePaymentSettings[];
    }

    // Deduplicate branches for each course (frontend safety check)
    return settings.map((setting) => {
      const uniqueBranchesMap = new Map<string, typeof setting.branches[0]>();
      setting.branches.forEach((branch) => {
        // Use _id for deduplication
        const branchId = branch._id;
        if (branchId && !uniqueBranchesMap.has(branchId)) {
          uniqueBranchesMap.set(branchId, branch);
        }
      });

      return {
        ...setting,
        branches: Array.from(uniqueBranchesMap.values()),
      };
    });
  }, [isPublicEdit, publicBootstrapQuery.data, courseSettingsResponse]);

  /** Application (intake) academic year from lead + completion year = application year + course/branch total_years. */
  useEffect(() => {
    const leadSnap = lead as LeadLike | undefined;
    const appRaw = leadSnap?.academicYear;
    if (appRaw == null || Number.isNaN(Number(appRaw))) return;
    const applicationYear = Number(appRaw);
    if (!sortedRegistrationFields.length) return;
    const totalYears = resolveTotalYearsFromCourseSettings(
      courseSettings,
      formState.courseInfo.courseId,
      formState.courseInfo.branchId
    );
    const patches = computeAcademicYearRegistrationPatches(
      sortedRegistrationFields,
      applicationYear,
      totalYears
    );
    setRegistrationExtras((prev) => {
      let next = { ...prev };
      let changed = false;
      for (const [k, v] of Object.entries(patches)) {
        if (next[k] !== v) {
          next[k] = v;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [
    sortedRegistrationFields,
    registrationFormId,
    lead,
    formState.courseInfo.courseId,
    formState.courseInfo.branchId,
    courseSettings,
  ]);

  const { data: programLevelsResponse } = useQuery({
    queryKey: ['courses', 'program-levels'],
    queryFn: async () => courseAPI.listProgramLevels(),
    staleTime: 120_000,
    enabled: !isPublicEdit,
  });

  const programLevels: string[] = useMemo(() => {
    if (isPublicEdit) {
      const pl = (publicBootstrapQuery.data?.data as { programLevels?: string[] } | undefined)?.programLevels;
      return Array.isArray(pl) ? pl : [];
    }
    const payload = programLevelsResponse?.data;
    if (Array.isArray(payload)) {
      return payload as string[];
    }
    if (payload && Array.isArray((payload as { data?: unknown }).data)) {
      return (payload as { data: string[] }).data;
    }
    return [];
  }, [isPublicEdit, publicBootstrapQuery.data, programLevelsResponse]);

  const filteredCourseSettings = useMemo(() => {
    const pl = (formState.courseInfo.programLevel || '').trim();
    if (programLevels.length > 0 && !pl) {
      return [] as CoursePaymentSettings[];
    }
    if (!pl || programLevels.length === 0) {
      return courseSettings;
    }
    return courseSettings.filter((item) => {
      const lv = item.course.level != null ? String(item.course.level).trim() : '';
      return lv === pl;
    });
  }, [courseSettings, formState.courseInfo.programLevel, programLevels]);

  const programLevelTrimmed = (formState.courseInfo.programLevel || '').trim();
  const { data: certificateGuidanceResponse, isLoading: isLoadingCertificateGuidance } = useQuery({
    queryKey: ['courses', 'certificate-guidance', programLevelTrimmed],
    enabled: !isPublicEdit && Boolean(programLevelTrimmed),
    queryFn: async () => courseAPI.getCertificateGuidance(programLevelTrimmed),
  });

  const certificateGuidance: CertificateGuidance | null = useMemo(() => {
    // Unwrap the `{ success, data: { … } }` envelope returned by the API (or
    // the inline `certificateGuidance` block on the public-link bootstrap
    // payload). Keep the guidance object even when empty so the UI can show
    // an actionable "no rules for this level" banner instead of going silent.
    let inner: unknown;
    if (isPublicEdit) {
      inner = (publicBootstrapQuery.data?.data as { certificateGuidance?: unknown } | undefined)
        ?.certificateGuidance;
    } else {
      const envelope = certificateGuidanceResponse?.data ?? certificateGuidanceResponse;
      inner =
        envelope && typeof envelope === 'object' && 'data' in envelope
          ? (envelope as { data: unknown }).data
          : envelope;
    }
    if (!inner || typeof inner !== 'object') return null;
    return inner as CertificateGuidance;
  }, [isPublicEdit, publicBootstrapQuery.data, certificateGuidanceResponse]);

  useEffect(() => {
    const items = certificateGuidance?.items;
    if (!items?.length || certificateGuidance?.format !== 'certificate_config') {
      return;
    }
    setRegistrationExtras((prev) => {
      const prevRaw = prev.certificate_checklist;
      const prevMap =
        prevRaw && typeof prevRaw === 'object' && !Array.isArray(prevRaw)
          ? (prevRaw as Record<string, unknown>)
          : {};
      const nextMap: Record<string, CertificateChecklistStoredValue> = {};
      for (const item of items) {
        const id = String(item.id || item.name || '').trim();
        if (!id) continue;
        const opts = listCertificateItemOptions(item);
        const prevEntry = parseCertificateChecklistEntry(prevMap[id]);
        if (opts.length > 0) {
          const valid = new Set(opts.map((o) => o.encoded));
          const option =
            prevEntry.option && valid.has(prevEntry.option)
              ? prevEntry.option
              : opts[0]!.encoded;
          nextMap[id] = { status: prevEntry.status, option };
        } else {
          nextMap[id] = prevEntry.status;
        }
      }
      const prevKeys = Object.keys(prevMap).sort().join(',');
      const nextKeys = Object.keys(nextMap).sort().join(',');
      if (prevKeys === nextKeys) {
        let allMatch = true;
        for (const k of Object.keys(nextMap)) {
          if (!certificateChecklistValuesEqual(prevMap[k], nextMap[k])) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) return prev;
      }
      return { ...prev, certificate_checklist: nextMap };
    });
  }, [certificateGuidance?.format, certificateGuidance?.items]);

  const documentsChecklistForPrint = useMemo(() => {
    const labels: Record<string, string> = {};
    const docs: Record<string, JoiningDocumentStatus | undefined> = {};
    (Object.entries(documentLabels) as [keyof JoiningDocuments, string][]).forEach(([key, label]) => {
      if (DOCUMENT_KEYS_HIDDEN_FROM_CHECKLIST.has(key)) return;
      labels[key] = label;
      docs[key] = formState.documents[key] || 'pending';
    });
    const raw = registrationExtras.certificate_checklist;
    const ccMap =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    if (certificateGuidance?.format === 'certificate_config' && certificateGuidance.items?.length) {
      for (const item of certificateGuidance.items) {
        const id = String(item.id || item.name || '').trim();
        if (!id) continue;
        const sk = `cert:${id}`;
        const entry = parseCertificateChecklistEntry(ccMap[id]);
        const opts = listCertificateItemOptions(item);
        const optLabel = opts.find((o) => o.encoded === entry.option)?.label;
        labels[sk] = optLabel ? `${item.name} (${optLabel})` : item.name;
        docs[sk] = entry.status === 'received' ? 'received' : 'pending';
      }
    }
    return { labels, docs };
  }, [formState.documents, registrationExtras.certificate_checklist, certificateGuidance]);

  const certificateChecklistParsed = useMemo(() => {
    const raw = registrationExtras.certificate_checklist;
    const out: Record<string, { status: JoiningDocumentStatus; option?: string }> = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return out;
    }
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      out[k] = parseCertificateChecklistEntry(v);
    }
    return out;
  }, [registrationExtras.certificate_checklist]);

  const derivedCertificationStatus = useMemo((): 'Verified' | 'Unverified' | null => {
    if (certificateGuidance?.format !== 'certificate_config' || !certificateGuidance.items?.length) {
      return null;
    }
    return computeCertificationStatusFromChecklist(
      certificateGuidance.items,
      registrationExtras.certificate_checklist
    );
  }, [certificateGuidance, registrationExtras.certificate_checklist]);

  const getRegistrationFieldValue = useCallback(
    (fieldName: string): string | boolean => {
      const fl = fieldName.toLowerCase();
      if (isJoiningRegistrationFieldMapped(fieldName)) {
        const v = readMappedRegistrationField(formState, fieldName);
        if (fl === 'student_gender' || fl === 'gender') {
          const g = String(v).trim();
          if (!g) return '';
          const low = g.toLowerCase();
          if (low === 'male' || low === 'm') return 'Male';
          if (low === 'female' || low === 'f') return 'Female';
          if (low === 'other' || low === 'o') return 'Other';
          return g;
        }
        return v;
      }
      if (fl === 'student_status' || fl === 'studentstatus') {
        const v = registrationExtras[fieldName] ?? registrationExtras.student_status;
        if (v === undefined || v === null || String(v).trim() === '') return 'Regular';
        return String(v);
      }
      if (
        fl === 'academic_year' ||
        fl === 'academicyear' ||
        fl === 'current_year' ||
        fl === 'currentyear'
      ) {
        return FIXED_REGISTRATION_ACADEMIC_YEAR;
      }
      if (
        fl === 'current_semester' ||
        fl === 'currentsemester' ||
        fl === 'semester' ||
        fl === 'semister'
      ) {
        return FIXED_REGISTRATION_SEMESTER;
      }
      if (
        fl === 'certification_status' ||
        fl === 'certificationstatus' ||
        fl === 'certificate_status' ||
        fl === 'certificatestatus' ||
        fl === 'certificates_status' ||
        fl === 'certificatesstatus' ||
        fl === 'certification'
      ) {
        if (derivedCertificationStatus !== null) {
          return derivedCertificationStatus;
        }
        const v = registrationExtras[fieldName];
        if (v === undefined || v === null || String(v).trim() === '') return 'Unverified';
        return String(v);
      }
      const v = registrationExtras[fieldName];
      if (typeof v === 'boolean') return v;
      if (v === undefined || v === null) return '';
      return String(v);
    },
    [formState, registrationExtras, derivedCertificationStatus]
  );

  useEffect(() => {
    if (!joiningRecord?._id || courseSettings.length === 0) return;
    const fromApi = joiningRecord.courseInfo?.programLevel;
    if (fromApi && String(fromApi).trim()) return;
    const cid = joiningRecord.courseInfo?.courseId;
    if (!cid) return;
    const cidTarget = String(cid).trim();
    if (!cidTarget) return;
    const entry = courseSettings.find((item) => String(item.course._id ?? '').trim() === cidTarget);
    const inferred =
      entry?.course?.level != null && String(entry.course.level).trim()
        ? String(entry.course.level).trim()
        : '';
    if (!inferred) return;
    setFormState((prev) => {
      if ((prev.courseInfo.programLevel || '').trim()) return prev;
      return {
        ...prev,
        courseInfo: { ...prev.courseInfo, programLevel: inferred },
      };
    });
  }, [joiningRecord?._id, joiningRecord?.courseInfo?.courseId, joiningRecord?.courseInfo?.programLevel, courseSettings]);

  /**
   * Resolve managed course / branch IDs (and the program level) by matching the
   * lead's free-text course/branch strings against the secondary-DB catalog.
   *
   * Why this matters: leads carry `course_interested` as a single free-text
   * field (no FK to the secondary DB), and the value frequently combines the
   * course AND branch — e.g. "B.Tech CSE", "MBA Marketing", "Diploma EEE". The
   * managed catalog, on the other hand, splits these into a course row
   * ("B.Tech") with branches underneath ("CSE", "ECE", …). Without smarter
   * matching the user complaint surfaces as:
   *  - The branches dropdown stays empty because no `courseId` got picked.
   *  - The certificate-checklist (keyed by program level) never loads.
   *  - The "interested" lead text and the "actual" managed values diverge.
   *
   * Strategy:
   *  1. Normalize both sides (lowercased, punctuation collapsed to spaces).
   *  2. For every managed course, find the longest course-name segment that
   *     occurs inside the lead's course/branch text. Track the leftover text.
   *  3. Within the candidate course, try to match a branch from either the
   *     lead's separate `branch` label OR the leftover text.
   *  4. Pick the candidate with the best combined coverage (course match +
   *     branch match) so "B.Tech CSE" prefers the "B.Tech" course whose "CSE"
   *     branch also fits, rather than another course that incidentally shares
   *     a substring.
   */
  useEffect(() => {
    if (courseSettings.length === 0) return;
    const courseLabel = (formState.courseInfo.course || '').trim();
    const branchLabel = (formState.courseInfo.branch || '').trim();
    const hasCourseId = Boolean((formState.courseInfo.courseId || '').toString().trim());
    const hasBranchId = Boolean((formState.courseInfo.branchId || '').toString().trim());
    const hasProgramLevel = Boolean((formState.courseInfo.programLevel || '').trim());
    if (hasCourseId && hasBranchId && hasProgramLevel) return;
    if (!courseLabel && !branchLabel && !hasCourseId) return;

    const norm = (v?: string | null) =>
      String(v ?? '')
        .toLowerCase()
        .replace(/[\s._\-/&,]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const courseHaystack = norm(`${courseLabel} ${branchLabel}`);

    type Candidate = {
      setting: CoursePaymentSettings;
      courseScore: number;
      branch?: { _id: string; name: string } | null;
      branchScore: number;
    };

    let best: Candidate | null = null;

    const considerCandidate = (candidate: Candidate) => {
      if (!best) {
        best = candidate;
        return;
      }
      const bestTotal = best.courseScore + best.branchScore;
      const total = candidate.courseScore + candidate.branchScore;
      if (total > bestTotal) {
        best = candidate;
      } else if (total === bestTotal && candidate.branchScore > best.branchScore) {
        best = candidate;
      }
    };

    if (hasCourseId) {
      // Caller already locked a courseId — only try to fill the branch / level.
      const cidTarget = String(formState.courseInfo.courseId ?? '').trim();
      const setting = courseSettings.find(
        (item) => String(item.course._id ?? '').trim() === cidTarget
      );
      if (setting) {
        considerCandidate({ setting, courseScore: 999, branch: null, branchScore: 0 });
      }
    } else {
      for (const setting of courseSettings) {
        const courseName = norm(setting.course.name);
        const courseCode = norm(setting.course.code || '');
        let courseScore = 0;
        if (!courseName && !courseCode) continue;
        if (courseName && courseHaystack === courseName) {
          courseScore = courseName.length * 3 + 5;
        } else if (courseCode && courseHaystack === courseCode) {
          courseScore = courseCode.length * 3 + 5;
        } else if (courseName && courseHaystack.includes(` ${courseName} `)) {
          courseScore = courseName.length * 2 + 2;
        } else if (courseName && (courseHaystack.startsWith(`${courseName} `) || courseHaystack.endsWith(` ${courseName}`))) {
          courseScore = courseName.length * 2 + 1;
        } else if (courseName && courseHaystack.includes(courseName)) {
          courseScore = courseName.length;
        } else if (courseCode && courseHaystack.includes(courseCode)) {
          courseScore = courseCode.length;
        } else if (courseName && courseName.includes(courseHaystack) && courseHaystack.length >= 3) {
          // Lead text is a shorter abbreviation of the managed name.
          courseScore = courseHaystack.length;
        }
        if (courseScore <= 0) continue;
        considerCandidate({ setting, courseScore, branch: null, branchScore: 0 });
      }
    }

    if (!best) return;

    const bestCandidate: Candidate = best;

    // Try to attach a branch under the chosen course.
    const branchHaystack = norm(`${branchLabel} ${courseLabel}`);
    let bestBranch: { _id: string; name: string } | null = null;
    let bestBranchScore = 0;
    for (const branch of bestCandidate.setting.branches) {
      const bName = norm(branch.name);
      const bCode = norm(branch.code || '');
      let score = 0;
      if (!bName && !bCode) continue;
      if (bName && branchHaystack === bName) {
        score = bName.length * 3 + 5;
      } else if (bCode && branchHaystack === bCode) {
        score = bCode.length * 3 + 5;
      } else if (bName && branchHaystack.includes(` ${bName} `)) {
        score = bName.length * 2 + 2;
      } else if (bName && (branchHaystack.startsWith(`${bName} `) || branchHaystack.endsWith(` ${bName}`))) {
        score = bName.length * 2 + 1;
      } else if (bName && branchHaystack.includes(bName)) {
        score = bName.length;
      } else if (bCode && branchHaystack.includes(bCode)) {
        score = bCode.length;
      }
      if (score > bestBranchScore) {
        bestBranchScore = score;
        bestBranch = { _id: String(branch._id), name: branch.name };
      }
    }
    if (bestBranch) {
      bestCandidate.branch = bestBranch;
      bestCandidate.branchScore = bestBranchScore;
    }

    const matchedCourseId = String(bestCandidate.setting.course._id ?? '').trim();
    const matchedCourseName = bestCandidate.setting.course.name;
    const inferredLevel =
      bestCandidate.setting.course?.level != null &&
      String(bestCandidate.setting.course.level).trim()
        ? String(bestCandidate.setting.course.level).trim()
        : '';

    setFormState((prev) => {
      const next = { ...prev.courseInfo };
      let changed = false;
      if (!(next.courseId || '').toString().trim() && matchedCourseId) {
        next.courseId = matchedCourseId;
        // Preserve the original lead text in `course` if user already had a
        // value — keeps the “interested” intent. Otherwise default to the
        // managed name so the field is never empty.
        if (!next.course || !norm(next.course)) {
          next.course = matchedCourseName;
        }
        changed = true;
      }
      if (!(next.branchId || '').toString().trim() && bestCandidate.branch) {
        next.branchId = String(bestCandidate.branch._id);
        if (!next.branch || !norm(next.branch)) {
          next.branch = bestCandidate.branch.name;
        }
        changed = true;
      }
      if (!(next.programLevel || '').trim() && inferredLevel) {
        next.programLevel = inferredLevel;
        changed = true;
      }
      if (!changed) return prev;
      return { ...prev, courseInfo: next };
    });
  }, [
    courseSettings,
    formState.courseInfo.course,
    formState.courseInfo.branch,
    formState.courseInfo.courseId,
    formState.courseInfo.branchId,
    formState.courseInfo.programLevel,
  ]);

  useEffect(() => {
    const pl = (formState.courseInfo.programLevel || '').trim();
    if (!pl || programLevels.length === 0) return;
    const cid = formState.courseInfo.courseId;
    if (!cid) return;
    const cidTarget = String(cid).trim();
    if (!cidTarget) return;
    const entry = courseSettings.find(
      (item) => String(item.course._id ?? '').trim() === cidTarget
    );
    const lv = entry?.course?.level != null ? String(entry.course.level).trim() : '';
    if (lv && lv !== pl) {
      setFormState((prev) => ({
        ...prev,
        courseInfo: {
          ...prev.courseInfo,
          courseId: undefined,
          course: '',
          branchId: undefined,
          branch: '',
        },
      }));
    }
  }, [formState.courseInfo.programLevel, formState.courseInfo.courseId, courseSettings, programLevels.length]);

  const { data: cashfreeConfigResponse } = useQuery({
    queryKey: ['payments', 'cashfree-config'],
    queryFn: async () => {
      const response = await paymentSettingsAPI.getCashfreeConfig();
      return response;
    },
    enabled: !isPublicEdit,
  });

  const cashfreeConfig: CashfreeConfigPreview | null = useMemo(() => {
    const payload = cashfreeConfigResponse?.data;
    if (!payload) return null;
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      if ('provider' in (payload as any) || 'environment' in (payload as any)) {
        return payload as CashfreeConfigPreview;
      }
      if ('data' in (payload as any) && (payload as any).data) {
        return (payload as any).data as CashfreeConfigPreview;
      }
    }
    return null;
  }, [cashfreeConfigResponse]);

  const {
    data: transactionsResponse,
    isLoading: isLoadingTransactions,
    refetch: refetchTransactions,
  } = useQuery({
    queryKey: ['payments', 'transactions', leadId, joiningRecord?._id],
    enabled: !isPublicEdit && !!leadId && !!joiningRecord?._id,
    queryFn: async () => {
      const response = await paymentAPI.listTransactions({
        joiningId: joiningRecord?._id,
        leadId: leadId as string
      });
      return response;
    },
  });

  const transactions: PaymentTransaction[] = useMemo(() => {
    const payload = transactionsResponse?.data;
    if (Array.isArray(payload)) {
      return payload as PaymentTransaction[];
    }
    if (payload && Array.isArray((payload as any).data)) {
      return (payload as any).data as PaymentTransaction[];
    }
    return [];
  }, [transactionsResponse]);

  useEffect(() => {
    if (isPublicEdit) {
      return () => clearHeaderContent();
    }
    if (typeof window !== 'undefined') {
      const scriptId = 'cashfree-sdk-v3';
      if (!document.getElementById(scriptId)) {
        const script = document.createElement('script');
        script.id = scriptId;
        script.async = true;
        script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
        document.body.appendChild(script);
      }
    }

    if (!lead) {
      return () => clearHeaderContent();
    }

    setHeaderContent(
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Joining &amp; Admission Workspace
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {lead.name}{' '}
            {lead.enquiryNumber ? `· Enquiry #${lead.enquiryNumber}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push('/superadmin/joining')}>
            Back to Joining Desk
          </Button>
          <Button variant="secondary" onClick={() => router.push(`/superadmin/leads/${lead._id}`)}>
            View Lead
          </Button>
        </div>
      </div>
    );

    return () => clearHeaderContent();
  }, [isPublicEdit, lead, router, setHeaderContent, clearHeaderContent]);

  useEffect(() => {
    if (isPublicEdit) return;
    if (!canAccessJoiningModule) {
      router.replace('/superadmin/dashboard');
    }
  }, [isPublicEdit, canAccessJoiningModule, router]);

  if (!isPublicEdit && !canAccessJoiningModule) {
    return null;
  }

  const selectedCourseSetting = useMemo(() => {
    if (!formState.courseInfo.courseId) return undefined;
    // Legacy joining/admission rows may carry the FK id as a MySQL INT (number)
    // while `courseSettings` from the secondary DB always exposes `_id` as a
    // string. Strict equality (e.g. `"5" === 5`) would silently fail and the
    // branches dropdown would stay empty, so compare on the string form.
    const target = String(formState.courseInfo.courseId).trim();
    if (!target) return undefined;
    const setting = courseSettings.find((item) => String(item.course._id ?? '').trim() === target);
    if (!setting) return undefined;

    // Deduplicate branches by ID (frontend safety check)
    const uniqueBranchesMap = new Map<string, typeof setting.branches[0]>();
    setting.branches.forEach((branch) => {
      const bid = String(branch._id ?? '').trim();
      if (bid && !uniqueBranchesMap.has(bid)) {
        uniqueBranchesMap.set(bid, branch);
      }
    });

    return {
      ...setting,
      branches: Array.from(uniqueBranchesMap.values()),
    };
  }, [courseSettings, formState.courseInfo.courseId]);

  const selectedBranchSetting = useMemo(() => {
    if (!selectedCourseSetting || !formState.courseInfo.branchId) return undefined;
    const target = String(formState.courseInfo.branchId).trim();
    if (!target) return undefined;
    return selectedCourseSetting.payment.branchFees.find(
      (entry) => String(entry.branch?._id ?? '').trim() === target
    );
  }, [selectedCourseSetting, formState.courseInfo.branchId]);

  const configuredFee = useMemo(() => {
    if (selectedBranchSetting?.amount) return selectedBranchSetting.amount;
    if (selectedCourseSetting?.payment.defaultFee?.amount) {
      return selectedCourseSetting.payment.defaultFee.amount;
    }
    return null;
  }, [selectedBranchSetting, selectedCourseSetting]);

  const totalPaid = paymentSummary?.totalPaid ?? 0;
  const effectiveTotalFee = useMemo(() => {
    const summaryFee = paymentSummary?.totalFee ?? 0;
    if (summaryFee > 0) {
      return summaryFee;
    }
    return configuredFee ?? summaryFee;
  }, [paymentSummary?.totalFee, configuredFee]);

  const outstandingBalance = useMemo(() => {
    if (!effectiveTotalFee) {
      if (totalPaid > 0) {
        return Math.max(0, -totalPaid);
      }
      return configuredFee ?? 0;
    }
    return Math.max(effectiveTotalFee - totalPaid, 0);
  }, [effectiveTotalFee, totalPaid, configuredFee]);

  const inferredPaymentStatus = useMemo(() => {
    if (paymentSummary?.status) return paymentSummary.status;
    if (totalPaid <= 0) return 'not_started';
    if (outstandingBalance <= 0.5) return 'paid';
    return 'partial';
  }, [paymentSummary?.status, totalPaid, outstandingBalance]);

  const paymentStatusLabel = useMemo(
    () => inferredPaymentStatus.replace(/_/g, ' '),
    [inferredPaymentStatus]
  );

  const paymentStatusBadgeClass = useMemo(() => {
    switch (inferredPaymentStatus) {
      case 'paid':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200';
      case 'partial':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200';
      default:
        return 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
    }
  }, [inferredPaymentStatus]);

  const baseFeeTarget = useMemo(() => {
    return (effectiveTotalFee ?? configuredFee ?? 0) || 0;
  }, [effectiveTotalFee, configuredFee]);

  const additionalFeePaid = useMemo(() => {
    if (!transactions || transactions.length === 0) return 0;
    return transactions
      .filter((transaction) => transaction.isAdditionalFee && transaction.status === 'success')
      .reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
  }, [transactions]);

  const normalizedBaseFeePaid = Math.max(totalPaid - additionalFeePaid, 0);
  const baseFeePaid =
    baseFeeTarget > 0 ? Math.min(normalizedBaseFeePaid, baseFeeTarget) : normalizedBaseFeePaid;
  const totalAmountPaid = Math.max(totalPaid, 0);
  const isBaseFeeCleared = baseFeeTarget > 0 && outstandingBalance <= 0.5;
  const shouldShowAdditionalFeeButton =
    (isBaseFeeCleared || additionalFeePaid > 0 || isAdditionalFeeMode) && canWritePayments;
  const paymentActionsDisabled =
    paymentFormState.isProcessing ||
    (!isAdditionalFeeMode && isBaseFeeCleared) ||
    !canWritePayments;

  useEffect(() => {
    if (isAdditionalFeeMode && (!isBaseFeeCleared || !canWritePayments)) {
      setIsAdditionalFeeMode(false);
    }
  }, [isAdditionalFeeMode, isBaseFeeCleared, canWritePayments]);

  const cashfreeMode: 'production' = 'production';
  const canUseCashfree = Boolean(cashfreeConfig?.isActive && cashfreeConfig?.environment);

  useEffect(() => {
    if (data?.data?.joining) {
      const joining: Joining = data.data.joining;
      setStatus(joining.status);
      setMeta({
        updatedAt: joining.updatedAt,
        submittedAt: joining.submittedAt as string | undefined,
        approvedAt: joining.approvedAt as string | undefined,
        admissionNumber: lead?.admissionNumber,
      });
      setPaymentSummary(joining.paymentSummary || null);

      if (joining.status !== 'approved' || !hasAppliedAdmissionSnapshot) {
        const base = buildInitialState(joining);
        setFormState(mergeLeadIntoJoiningFormState(base, lead as LeadLike));
      }
    }
  }, [data, lead, hasAppliedAdmissionSnapshot]);

  const {
    data: admissionData,
    isLoading: isLoadingAdmission,
    refetch: refetchAdmission,
  } = useQuery({
    queryKey: ['admission', leadId, status],
    enabled: !isPublicEdit && !!leadId && status === 'approved',
    queryFn: async () => {
      const candidateLeadId = lead?.id || joiningRecord?.leadId || (leadId as string);
      try {
        return await admissionAPI.getByLeadId(candidateLeadId);
      } catch {
        const candidateJoiningId = joiningRecord?._id || (leadId as string);
        return admissionAPI.getByJoiningId(candidateJoiningId);
      }
    },
  });

  useEffect(() => {
    if (status === 'approved') {
      if (admissionData?.data?.admission) {
        const record = admissionData.data.admission as Admission;
        setAdmissionRecord(record);
        setMeta((prev) => ({
          ...prev,
          admissionNumber: record.admissionNumber || prev.admissionNumber,
        }));
        setPaymentSummary(record.paymentSummary || null);
        if (!hasAppliedAdmissionSnapshot) {
          const base = buildInitialState(record as unknown as Joining);
          setFormState(mergeLeadIntoJoiningFormState(base, lead as LeadLike));
          setHasAppliedAdmissionSnapshot(true);
        }
      }
    } else {
      setAdmissionRecord(null);
      setPaymentSummary(joiningRecord?.paymentSummary || null);
      if (hasAppliedAdmissionSnapshot) {
        setHasAppliedAdmissionSnapshot(false);
      }
    }
  }, [status, admissionData, hasAppliedAdmissionSnapshot, joiningRecord, lead]);

  const handleCourseFieldChange = (field: 'course' | 'branch' | 'quota', value: string) => {
    setFormState((prev) => ({
      ...prev,
      courseInfo: {
        ...prev.courseInfo,
        [field]: value,
        ...(field === 'course' ? { courseId: undefined } : {}),
        ...(field === 'branch' ? { branchId: undefined } : {}),
      },
    }));
    if (field === 'quota') {
      const patches = computeScholarshipRegistrationPatches(value, sortedRegistrationFields);
      if (Object.keys(patches).length > 0) {
        setRegistrationExtras((prev) => ({ ...prev, ...patches }));
      }
    }
  };

  const handleProgramLevelChange = (value: string) => {
    const next = value.trim();
    setFormState((prev) => ({
      ...prev,
      courseInfo: {
        ...prev.courseInfo,
        programLevel: next,
        courseId: undefined,
        course: '',
        branchId: undefined,
        branch: '',
      },
    }));
  };

  const handleManagedCourseSelect = (courseId: string) => {
    if (!courseId) {
      setFormState((prev) => ({
        ...prev,
        courseInfo: {
          ...prev.courseInfo,
          courseId: undefined,
          course: '', // Clear course name when ID is cleared
          branchId: undefined,
          branch: '', // Clear branch when course is cleared
        },
      }));
      return;
    }

    const cidTarget = String(courseId).trim();
    // Look up the picked course in the full catalog (not just the level-filtered
    // view) so we can also auto-fill the program level when the course's
    // `level` is set in the secondary DB. This is what kicks off the
    // certificate-guidance API automatically — without it, staff have to pick
    // the level separately and the checklist sits empty.
    const course =
      courseSettings.find((item) => String(item.course._id ?? '').trim() === cidTarget) ||
      filteredCourseSettings.find((item) => String(item.course._id ?? '').trim() === cidTarget);
    const inferredLevel =
      course?.course?.level != null && String(course.course.level).trim()
        ? String(course.course.level).trim()
        : '';
    setFormState((prev) => ({
      ...prev,
      courseInfo: {
        ...prev.courseInfo,
        courseId: cidTarget,
        course: course?.course?.name || '',
        branchId: undefined,
        branch: '',
        // Only overwrite an empty program level — never clobber a value the
        // user explicitly picked. If the picked course doesn't carry a level
        // in the secondary DB, leave the existing selection alone.
        programLevel:
          (prev.courseInfo.programLevel || '').trim() || inferredLevel || prev.courseInfo.programLevel,
      },
    }));
  };

  const handleManagedBranchSelect = (branchId: string) => {
    if (!branchId) {
      setFormState((prev) => ({
        ...prev,
        courseInfo: {
          ...prev.courseInfo,
          branchId: undefined,
          branch: '', // Clear branch name when ID is cleared
        },
      }));
      return;
    }

    const bidTarget = String(branchId).trim();
    const branch = selectedCourseSetting?.branches.find(
      (item) => String(item._id ?? '').trim() === bidTarget
    );
    setFormState((prev) => ({
      ...prev,
      courseInfo: {
        ...prev.courseInfo,
        branchId: bidTarget,
        branch: branch?.name || '',
      },
    }));
  };

  const loadCashfreeSDK = useCallback(() => {
    return new Promise<any>((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject(new Error('Cashfree SDK is only available in the browser'));
        return;
      }

      const existing = (window as any).Cashfree;
      if (existing) {
        try {
          const instance = existing({ mode: 'production' });
          resolve(instance);
          return;
        } catch (error) {
          reject(error);
          return;
        }
      }

      const scriptId = 'cashfree-sdk';
      const existingScript = document.getElementById(scriptId);
      const handleReady = () => {
        if ((window as any).Cashfree) {
          try {
            const instance = (window as any).Cashfree({ mode: 'production' });
            resolve(instance);
          } catch (error) {
            reject(error);
          }
        } else {
          reject(new Error('Cashfree SDK failed to initialize'));
        }
      };

      if (existingScript) {
        const maxWaitMs = 6000;
        const start = Date.now();
        const interval = window.setInterval(() => {
          if ((window as any).Cashfree) {
            window.clearInterval(interval);
            handleReady();
          } else if (Date.now() - start > maxWaitMs) {
            window.clearInterval(interval);
            reject(new Error('Cashfree SDK initialization timed out'));
          }
        }, 150);
        return;
      }

      const script = document.createElement('script');
      script.id = scriptId;
      script.async = true;
      script.src = 'https://sdk.cashfree.com/js/ui/2.0/cashfree.prod.js';
      script.onload = handleReady;
      script.onerror = () => reject(new Error('Failed to load Cashfree SDK'));
      document.body.appendChild(script);
    });
  }, []);

  const resetPaymentForm = () => {
    setPaymentFormState({
      amount: '',
      isProcessing: false,
    });
    setSelectedFeeHead(null);
  };

  const openPaymentModal = (mode: 'cash' | 'online') => {
    if (!canWritePayments) {
      showToast.error('You have read-only access to payments');
      return;
    }
    const defaultAmountValue =
      isAdditionalFeeMode
        ? null
        : outstandingBalance && outstandingBalance > 0
          ? outstandingBalance
          : configuredFee ?? effectiveTotalFee ?? 0;
    const normalizedValue =
      defaultAmountValue && defaultAmountValue > 0
        ? Number(defaultAmountValue.toFixed(2))
        : 0;
    setPaymentFormState({
      amount:
        isAdditionalFeeMode || normalizedValue <= 0 ? '' : String(normalizedValue),
      isProcessing: false,
    });
    setShouldPromptPayment(false);
    setOpenPaymentMode(mode);
  };

  const closePaymentModal = () => {
    if (paymentFormState.isProcessing) return;
    setOpenPaymentMode(null);
  };

  /**
   * Triggered when the user clicks Cash or Cashfree on a row inside the Fee Structure section.
   * Mirrors the existing "Payments & Transactions" section behavior:
   * - Stores the fee-head identity so subsequent cash/cashfree submits tag the transaction.
   * - Prefills the amount with the row's amount (clamped to the outstanding balance when one
   *   exists and is smaller, so users never over-collect on the scheduled fee by accident).
   * - Opens the same modal the existing section uses, in the mode the user picked.
   */
  const handleSelectFeeHead = (selection: FeeHeadSelection) => {
    if (!canWritePayments) {
      showToast.error('You have read-only access to payments');
      return;
    }
    // Online lane requires Cashfree to be configured + active, same gate as the main section.
    if (selection.mode === 'online' && !canUseCashfree) {
      showToast.error(
        'Cashfree configuration is not active. Update Payment Settings before collecting online.'
      );
      return;
    }
    setSelectedFeeHead(selection);
    // Selecting a specific fee head implies a targeted payment, not a generic "additional fee".
    setIsAdditionalFeeMode(false);
    const rowAmount = Number(selection.amount) || 0;
    const cappedAmount =
      outstandingBalance && outstandingBalance > 0
        ? Math.min(rowAmount, outstandingBalance)
        : rowAmount;
    setPaymentFormState({
      amount: cappedAmount > 0 ? String(Number(cappedAmount.toFixed(2))) : '',
      isProcessing: false,
    });
    setShouldPromptPayment(false);
    setOpenPaymentMode(selection.mode);
  };

  const handleCashPaymentSubmit = async () => {
    if (!canWritePayments) {
      showToast.error('You have read-only access to payments');
      return;
    }
    if (!leadId) return;
    const amountValue = Number(paymentFormState.amount);
    if (!amountValue || Number.isNaN(amountValue) || amountValue <= 0) {
      showToast.error('Enter a valid payment amount');
      return;
    }

    setPaymentFormState((prev) => ({ ...prev, isProcessing: true }));
    try {
      await paymentAPI.recordCashPayment({
        ...(lead?._id && { leadId: lead._id }),
        joiningId: joiningRecord?._id,
        admissionId: admissionRecord?._id,
        courseId: formState.courseInfo.courseId,
        branchId: formState.courseInfo.branchId,
        amount: amountValue,
        currency: 'INR',
        isAdditionalFee: isAdditionalFeeMode || undefined,
        // Tag transaction with the selected fee head (Fee Management DB) when present.
        ...(selectedFeeHead && {
          feeHead: selectedFeeHead.feeHeadId,
          feeHeadName: selectedFeeHead.feeHeadName,
          feeHeadCode: selectedFeeHead.feeHeadCode,
          feeStructureBatch: selectedFeeHead.batch,
          feeStructureYear: selectedFeeHead.studentYear,
        }),
      });

      showToast.success(
        selectedFeeHead
          ? `Cash payment recorded for ${selectedFeeHead.feeHeadName || 'selected fee head'}`
          : 'Cash payment recorded'
      );
      setOpenPaymentMode(null);
      resetPaymentForm();
      setShouldPromptPayment(false);
      setIsAdditionalFeeMode(false);

      await Promise.all([
        refetch(),
        refetchTransactions(),
        status === 'approved' ? refetchAdmission() : Promise.resolve(),
      ]);
    } catch (error: any) {
      console.error('Error recording cash payment:', error);
      showToast.error(error?.response?.data?.message || 'Failed to record cash payment');
    } finally {
      setPaymentFormState((prev) => ({ ...prev, isProcessing: false }));
    }
  };

  const handleCashfreePayment = async () => {
    if (!canWritePayments) {
      showToast.error('You have read-only access to payments');
      return;
    }
    if (!leadId) return;
    if (!canUseCashfree) {
      showToast.error('Cashfree configuration is not active. Please update settings.');
      return;
    }

    const amountValue = Number(paymentFormState.amount);
    if (!amountValue || Number.isNaN(amountValue) || amountValue <= 0) {
      showToast.error('Enter a valid payment amount');
      return;
    }

    setPaymentFormState((prev) => ({ ...prev, isProcessing: true }));
    let orderId: string | null = null;
    try {
      const orderResponse = await paymentAPI.createCashfreeOrder({
        ...(lead?._id && { leadId: lead._id }),
        joiningId: joiningRecord?._id,
        admissionId: admissionRecord?._id,
        courseId: formState.courseInfo.courseId,
        branchId: formState.courseInfo.branchId,
        amount: amountValue,
        currency: 'INR',
        customer: {
          customerId: lead?._id || joiningRecord?._id || (leadId as string),
          name: formState.studentInfo.name || lead?.name || 'Prospective Student',
          email: lead?.email || 'student@example.com',
          phone: formState.studentInfo.phone || lead?.phone || '9999999999',
        },
        isAdditionalFee: isAdditionalFeeMode || undefined,
        // Tag the Cashfree transaction with the selected fee head so reconciliation /
        // payment history shows what was paid for. Both order rows and the eventual
        // verification land on the same transaction row (meta is set at insert time).
        ...(selectedFeeHead && {
          feeHead: selectedFeeHead.feeHeadId,
          feeHeadName: selectedFeeHead.feeHeadName,
          feeHeadCode: selectedFeeHead.feeHeadCode,
          feeStructureBatch: selectedFeeHead.batch,
          feeStructureYear: selectedFeeHead.studentYear,
          notes: {
            feeHead: selectedFeeHead.feeHeadId,
            feeHeadName: selectedFeeHead.feeHeadName,
            feeHeadCode: selectedFeeHead.feeHeadCode,
          },
        }),
      });

      const orderData = orderResponse?.data;
      if (!orderData?.orderId || !orderData?.paymentSessionId) {
        throw new Error('Missing payment session details');
      }
      orderId = orderData.orderId;

      const cashfree = await loadCashfreeSDK();
      try {
        await cashfree.checkout({
          paymentSessionId: orderData.paymentSessionId,
          redirectTarget: '_modal',
        });
      } catch (sdkError) {
        console.warn('Cashfree checkout error:', sdkError);
      }

      if (!orderId) {
        throw new Error('Missing Cashfree order identifier');
      }

      const verificationResponse = await paymentAPI.verifyCashfreePayment({ orderId });
      const verification = verificationResponse?.data || {};
      const statusResult = (verification.status || '').toLowerCase();

      if (statusResult === 'success' || statusResult === 'paid') {
        showToast.success('Online payment successful');
        setOpenPaymentMode(null);
        resetPaymentForm();
        setShouldPromptPayment(false);
        setIsAdditionalFeeMode(false);
        await Promise.all([
          refetch(),
          refetchTransactions(),
          status === 'approved' ? refetchAdmission() : Promise.resolve(),
        ]);
      } else if (statusResult === 'failed') {
        showToast.error('Payment failed. Please try again or choose a different mode.');
      } else {
        showToast.info('Payment pending. You can verify the status shortly.');
      }
    } catch (error: any) {
      console.error('Error processing online payment:', error);
      showToast.error(
        error?.response?.data?.message || error?.message || 'Failed to initiate online payment'
      );
      if (orderId) {
        try {
          await paymentAPI.verifyCashfreePayment({ orderId });
        } catch (verifyError) {
          console.warn('Unable to verify payment status after failure:', verifyError);
        }
      }
    } finally {
      setPaymentFormState((prev) => ({ ...prev, isProcessing: false }));
    }
  };

  const handleStudentInfoChange = (field: keyof JoiningFormState['studentInfo'], value: string) => {
    setFormState((prev) => ({
      ...prev,
      studentInfo: {
        ...prev.studentInfo,
        [field]: value,
      },
    }));
  };

  const handleParentChange = (
    role: 'father' | 'mother',
    field: keyof JoiningFormState['parents']['father'],
    value: string
  ) => {
    setFormState((prev) => ({
      ...prev,
      parents: {
        ...prev.parents,
        [role]: {
          ...prev.parents[role],
          [field]: value,
        },
      },
    }));
  };

  const handleReservationGeneralChange = (value: JoiningReservation['general']) => {
    setFormState((prev) => ({
      ...prev,
      reservation: {
        ...prev.reservation,
        general: value,
      },
    }));
  };

  const addOtherReservation = () => {
    if (!otherReservationInput.trim()) return;
    setFormState((prev) => ({
      ...prev,
      reservation: {
        ...prev.reservation,
        other: Array.from(
          new Set([...(prev.reservation.other || []), otherReservationInput.trim()])
        ),
      },
    }));
    setOtherReservationInput('');
  };

  const removeOtherReservation = (value: string) => {
    setFormState((prev) => ({
      ...prev,
      reservation: {
        ...prev.reservation,
        other: (prev.reservation.other || []).filter((item) => item !== value),
      },
    }));
  };

  const handleCommunicationAddressChange = (
    field: keyof JoiningFormState['address']['communication'],
    value: string
  ) => {
    setFormState((prev) => {
      const next = { ...prev.address.communication, [field]: value };
      if (field === 'state') {
        delete next.district;
        delete next.mandal;
      } else if (field === 'district') {
        delete next.mandal;
      }
      return {
        ...prev,
        address: {
          ...prev.address,
          communication: next,
        },
      };
    });
  };

  const updateRelative = (
    index: number,
    field: keyof JoiningRelativeAddress,
    value: string
  ) => {
    setFormState((prev) => {
      const nextRelatives = [...prev.address.relatives];
      const nextEntry = { ...nextRelatives[index], [field]: value };
      if (field === 'state') {
        delete nextEntry.district;
        delete nextEntry.mandal;
      } else if (field === 'district') {
        delete nextEntry.mandal;
      }
      nextRelatives[index] = nextEntry;
      return {
        ...prev,
        address: {
          ...prev.address,
          relatives: nextRelatives,
        },
      };
    });
  };

  const addRelative = () => {
    setFormState((prev) => ({
      ...prev,
      address: {
        ...prev.address,
        relatives: [
          ...prev.address.relatives,
          {
            name: '',
            relationship: '',
            state: '',
            doorOrStreet: '',
            landmark: '',
            villageOrCity: '',
            mandal: '',
            district: '',
            pinCode: '',
          },
        ],
      },
    }));
  };

  const removeRelative = (index: number) => {
    setFormState((prev) => {
      const copy = [...prev.address.relatives];
      copy.splice(index, 1);
      return {
        ...prev,
        address: {
          ...prev.address,
          relatives: copy,
        },
      };
    });
  };

  const toggleQualification = (field: 'ssc' | 'interOrDiploma' | 'ug') => {
    setFormState((prev) => ({
      ...prev,
      qualifications: {
        ...prev.qualifications,
        [field]: !prev.qualifications[field],
      },
    }));
  };

  const toggleMediumSelection = (value: 'english' | 'telugu' | 'other') => {
    setFormState((prev) => {
      const current = Array.isArray(prev.qualifications.mediums)
        ? prev.qualifications.mediums
        : [];
      const exists = current.includes(value);
      const next = exists
        ? current.filter((item) => item !== value)
        : Array.from(new Set([...current, value]));

      return {
        ...prev,
        qualifications: {
          ...prev.qualifications,
          mediums: next,
          otherMediumLabel: next.includes('other') ? prev.qualifications.otherMediumLabel : '',
        },
      };
    });
  };

  const handleMediumOtherLabelChange = (value: string) => {
    setFormState((prev) => ({
      ...prev,
      qualifications: {
        ...prev.qualifications,
        otherMediumLabel: value,
      },
    }));
  };

  const updateEducationHistory = (
    index: number,
    field: keyof JoiningEducationHistory,
    value: string
  ) => {
    setFormState((prev) => {
      const copy = [...prev.educationHistory];
      copy[index] = {
        ...copy[index],
        [field]: value,
      };
      return {
        ...prev,
        educationHistory: copy,
      };
    });
  };

  const handleYearOfPassingChange = (index: number, value: string) => {
    updateEducationHistory(index, 'yearOfPassing', sanitizeYearValue(value));
  };

  const handleTotalMarksChange = (index: number, value: string) => {
    setFormState((prev) => {
      const historyCopy = [...prev.educationHistory];
      const previousValue = historyCopy[index]?.totalMarksOrGrade || '';
      const sanitized = sanitizeTotalMarksInput(value, previousValue);
      historyCopy[index] = {
        ...historyCopy[index],
        totalMarksOrGrade: sanitized,
      };
      return {
        ...prev,
        educationHistory: historyCopy,
      };
    });
  };

  const addEducationHistory = () => {
    setFormState((prev) => ({
      ...prev,
      educationHistory: [
        ...prev.educationHistory,
        {
          level: 'ssc',
          courseOrBranch: '',
          yearOfPassing: '',
          institutionName: '',
          institutionAddress: '',
          hallTicketNumber: '',
          totalMarksOrGrade: '',
          cetRank: '',
          otherLevelLabel: '',
        },
      ],
    }));
  };

  const removeEducationHistory = (index: number) => {
    setFormState((prev) => {
      const copy = [...prev.educationHistory];
      copy.splice(index, 1);
      return {
        ...prev,
        educationHistory: copy,
      };
    });
  };

  const updateSibling = (index: number, field: keyof JoiningSibling, value: string) => {
    setFormState((prev) => {
      const copy = [...prev.siblings];
      copy[index] = {
        ...copy[index],
        [field]: value,
      };
      return {
        ...prev,
        siblings: copy,
      };
    });
  };

  const addSibling = () => {
    setFormState((prev) => ({
      ...prev,
      siblings: [
        ...prev.siblings,
        { name: '', relation: '', studyingStandard: '', institutionName: '' },
      ],
    }));
  };

  const handleReservationEwsChange = (value: boolean) => {
    setFormState((prev) => ({
      ...prev,
      reservation: {
        ...prev.reservation,
        isEws: value,
      },
    }));
  };

  const removeSibling = (index: number) => {
    setFormState((prev) => {
      const copy = [...prev.siblings];
      copy.splice(index, 1);
      return {
        ...prev,
        siblings: copy,
      };
    });
  };

  const updateDocumentStatus = (
    key: keyof JoiningDocuments,
    value: JoiningDocumentStatus
  ) => {
    setFormState((prev) => ({
      ...prev,
      documents: {
        ...prev.documents,
        [key]: value,
      },
    }));
  };

  const updateCertificateChecklistStatus = (
    itemId: string,
    value: JoiningDocumentStatus,
    hasOptions: boolean
  ) => {
    const id = String(itemId || '').trim();
    if (!id) return;
    setRegistrationExtras((prev) => {
      const raw = prev.certificate_checklist;
      const cur =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? { ...(raw as Record<string, CertificateChecklistStoredValue>) }
          : {};
      const prevEntry = parseCertificateChecklistEntry(cur[id]);
      cur[id] = buildCertificateChecklistStoredValue(hasOptions, value, prevEntry.option);
      return { ...prev, certificate_checklist: cur };
    });
  };

  const updateCertificateChecklistOption = (itemId: string, encoded: string) => {
    const id = String(itemId || '').trim();
    if (!id) return;
    setRegistrationExtras((prev) => {
      const raw = prev.certificate_checklist;
      const cur =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? { ...(raw as Record<string, CertificateChecklistStoredValue>) }
          : {};
      const prevEntry = parseCertificateChecklistEntry(cur[id]);
      cur[id] = { status: prevEntry.status, option: encoded.trim() || undefined };
      return { ...prev, certificate_checklist: cur };
    });
  };

  const payloadForSave = useMemo(() => {
    // Ensure course and branch names are stored when IDs are present
    const courseInfo = { ...formState.courseInfo };

    const courseTarget = courseInfo.courseId != null ? String(courseInfo.courseId).trim() : '';
    const branchTarget = courseInfo.branchId != null ? String(courseInfo.branchId).trim() : '';

    if (courseTarget && !courseInfo.course) {
      const selectedCourse = courseSettings.find(
        (item) => String(item.course._id ?? '').trim() === courseTarget
      );
      if (selectedCourse) {
        courseInfo.course = selectedCourse.course.name;
      }
    }

    if (branchTarget && !courseInfo.branch && courseTarget) {
      const selectedCourse = courseSettings.find(
        (item) => String(item.course._id ?? '').trim() === courseTarget
      );
      const selectedBranch = selectedCourse?.branches.find(
        (branch) => String(branch._id ?? '').trim() === branchTarget
      );
      if (selectedBranch) {
        courseInfo.branch = selectedBranch.name;
      }
    }

    return {
      courseInfo,
      studentInfo: mergeJoiningStudentInfoFromExtras(
        formState.studentInfo,
        registrationExtras as Record<string, unknown>
      ),
      parents: formState.parents,
      reservation: {
        general: formState.reservation.general,
        isEws: formState.reservation.isEws || false,
        other: formState.reservation.other || [],
      },
      address: formState.address,
      qualifications: formState.qualifications,
      educationHistory: formState.educationHistory,
      siblings: formState.siblings,
      documents: formState.documents,
      registrationFormData: (() => {
        const stripped = stripJoiningRedundantRegistrationExtras({ ...registrationExtras });
        if (derivedCertificationStatus !== null) {
          return {
            ...stripped,
            certification_status: derivedCertificationStatus,
            certificates_status: derivedCertificationStatus,
          };
        }
        return stripped;
      })(),
    };
  }, [formState, courseSettings, registrationExtras, derivedCertificationStatus]);

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!leadId) return null;
      const payload = {
        ...payloadForSave,
        ...(joiningRecord?._id ? { _id: joiningRecord._id } : {}),
      };
      if (isPublicEdit && publicToken) {
        return joiningPublicApi.saveDraft(publicToken, payload);
      }
      return joiningAPI.saveDraft(leadId, payload);
    },
    onSuccess: (response: any) => {
      showToast.success('Joining form saved as draft');
      const savedJoining = response?.data?.data || response?.data;
      if (isNewJoining && savedJoining?._id && leadId === 'new') {
        router.replace(`/superadmin/joining/${savedJoining._id}`);
      } else {
        refetch();
      }
    },
    onError: (error: any) => {
      console.error('Error saving draft:', error);
      const msg = error?.response?.data?.message || error?.message || 'Failed to save draft';
      showToast.error(msg);
    },
  });

  const joiningDraftPayloadRef = useRef(payloadForSave);
  joiningDraftPayloadRef.current = payloadForSave;
  const joiningRecordIdRef = useRef<string | undefined>(undefined);
  joiningRecordIdRef.current = joiningRecord?._id;

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!leadId) return null;
      const payload = {
        ...joiningDraftPayloadRef.current,
        ...(joiningRecordIdRef.current ? { _id: joiningRecordIdRef.current } : {}),
      };
      if (isPublicEdit && publicToken) {
        const saved = await joiningPublicApi.saveDraft(publicToken, payload);
        const savedJoining = (saved as { data?: { _id?: string } | null } | null)?.data || null;
        const submittedRouteKey =
          savedJoining && typeof savedJoining === 'object' && savedJoining._id
            ? String(savedJoining._id)
            : leadId && leadId !== 'new'
              ? String(leadId)
              : undefined;
        return joiningPublicApi.submit(publicToken, submittedRouteKey);
      }
      await joiningAPI.saveDraft(leadId, payload);
      return joiningAPI.submit(leadId);
    },
    onSuccess: () => {
      showToast.success('Joining form submitted for approval');
      if (isPublicEdit) {
        setPublicSubmitted(true);
      }
      refetch();
      if (!isPublicEdit) {
        refetchTransactions();
        setShouldPromptPayment(true);
        if (typeof window !== 'undefined') {
          setTimeout(() => {
            const panel = document.getElementById('payment-panel');
            if (panel) {
              panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 250);
        }
      }
    },
    onError: (error: any) => {
      console.error('Error submitting joining form:', error);
      const msg = error?.response?.data?.message || error?.message || 'Failed to submit form';
      showToast.error(msg);
    },
  });

  const handleCopyPublicLink = useCallback(async () => {
    if (!canWriteJoining || status !== 'draft' || isPublicEdit) return;
    const routeKey = publicLinkRouteKey || (isNewJoining ? 'new' : '');
    if (!routeKey) return;
    setPublicLinkBusy(true);
    try {
      const res = await joiningAPI.createPublicEditLink(routeKey);
      const body = res as { data?: { publicUrl?: string; path?: string; token?: string; expiresAt?: string } };
      const d = body?.data;
      const pathOnly =
        d?.path || (d?.token ? `/joining/public?t=${encodeURIComponent(String(d.token))}` : '');
      const url =
        d?.publicUrl ||
        (typeof window !== 'undefined' && pathOnly ? `${window.location.origin}${pathOnly}` : pathOnly);
      if (url) {
        setPublicLinkDialog({ url, expiresAt: d?.expiresAt || '' });
        void navigator.clipboard?.writeText(url).catch(() => {});
        showToast.success('Public link copied. It expires in 5 minutes.');
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      showToast.error(err?.response?.data?.message || err?.message || 'Failed to copy public link');
    } finally {
      setPublicLinkBusy(false);
    }
  }, [canWriteJoining, status, isPublicEdit, publicLinkRouteKey, isNewJoining]);

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!leadId || isPublicEdit) return null;
      return joiningAPI.approve(leadId);
    },
    onSuccess: (response: any) => {
      const payload = response?.data || response;
      const joiningData = payload?.data?.joining || payload?.joining;
      const generatedAdmissionNumber =
        payload?.data?.admissionNumber || payload?.admissionNumber || null;

      showToast.success('Joining form approved');

      if (joiningData) {
        setStatus((joiningData.status as JoiningStatus) || 'approved');
        setMeta((prev) => ({
          ...prev,
          updatedAt: joiningData.updatedAt,
          submittedAt: joiningData.submittedAt,
          approvedAt: joiningData.approvedAt,
          admissionNumber:
            generatedAdmissionNumber || joiningData.admissionNumber || prev.admissionNumber,
        }));
      } else {
        setStatus('approved');
        setMeta((prev) => ({
          ...prev,
          admissionNumber: generatedAdmissionNumber || prev.admissionNumber,
        }));
      }

      setHasAppliedAdmissionSnapshot(false);
      setAdmissionRecord(null);
      refetch();
      refetchAdmission();
      refetchTransactions();
    },
    onError: (error: any) => {
      console.error('Error approving joining form:', error);
      showToast.error(error.response?.data?.message || 'Failed to approve form');
    },
  });

  const updateAdmissionMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (!leadId) return null;
      return admissionAPI.updateByLeadId(leadId, payload);
    },
    onSuccess: () => {
      showToast.success('Admission record updated');
      setHasAppliedAdmissionSnapshot(false);
      refetchAdmission();
    },
    onError: (error: any) => {
      console.error('Error updating admission record:', error);
      showToast.error(error.response?.data?.message || 'Failed to update admission record');
    },
  });

  const isSubmitting = submitMutation.isPending;
  const isSaving = saveDraftMutation.isPending;
  const isApproving = approveMutation.isPending;
  const isUpdatingAdmission = updateAdmissionMutation.isPending;

  const canSubmit = canWriteJoining && status !== 'approved' && status !== 'pending_approval';
  const canApprove = !isPublicEdit && canWriteJoining && status === 'pending_approval';
  const isAdmissionEditable = canWriteJoining && status === 'approved';
  const admissionNumberDisplay =
    meta.admissionNumber || admissionRecord?.admissionNumber || lead?.admissionNumber || null;
  const isBusy = isLoading || (isAdmissionEditable && isLoadingAdmission && !admissionRecord);

  const handleSaveAdmissionRecord = () => {
    if (!canWriteJoining) {
      showToast.error('You have read-only access to the joining desk');
      return;
    }
    updateAdmissionMutation.mutate(payloadForSave);
  };

  if (!isPublicEdit && !leadId) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-500">Invalid URL. Lead identifier is missing.</p>
      </div>
    );
  }

  if (isPublicEdit && publicBootstrapQuery.isError) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Link invalid or expired</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Ask your admissions desk for a new joining form link.
        </p>
      </div>
    );
  }

  if (isPublicEdit && !isLoading && !joiningRecord) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Link invalid or expired</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          This joining form is no longer available at this address.
        </p>
      </div>
    );
  }

  const publicExpiresAt = (publicBootstrapQuery.data?.data as { expiresAt?: string } | undefined)?.expiresAt;

  if (isPublicEdit && publicSubmitted) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-10 dark:border-emerald-900/50 dark:bg-emerald-950/40">
          <h1 className="text-xl font-semibold text-emerald-900 dark:text-emerald-100">Submitted for approval</h1>
          <p className="mt-3 text-sm text-emerald-800 dark:text-emerald-200">
            Your joining form has been sent to the admissions team. It will appear in their{' '}
            <strong>Joining Pipeline</strong> under <strong>Pending Approvals</strong>. You can close this window.
          </p>
        </div>
      </div>
    );
  }

  const statusBadgeClass =
    status === 'approved'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200'
      : status === 'pending_approval'
        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200'
        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200';

  const statusLabel = status.replace('_', ' ');

  return (
    <div className="w-full space-y-10 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      {isPublicEdit && publicExpiresAt && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
          Secure public form · This link expires at{' '}
          <strong>{new Date(publicExpiresAt).toLocaleString()}</strong> (5 minutes from when it was created).
        </div>
      )}
      <div className="rounded-3xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-semibold ${statusBadgeClass}`}>
                <span className="inline-block h-2 w-2 rounded-full bg-current opacity-75" />
                {statusLabel}
              </span>
              {!isNewJoining && lead?.enquiryNumber && (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600 dark:bg-slate-800/70 dark:text-slate-200">
                  Enquiry #{lead.enquiryNumber}
                </span>
              )}
              {isNewJoining && (
                <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-600 dark:bg-blue-900/60 dark:text-blue-200">
                  New Joining Form
                </span>
              )}
              {admissionNumberDisplay && (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200">
                  Admission #{admissionNumberDisplay}
                </span>
              )}
              {meta.updatedAt && (
                <span>
                  Last updated: <strong>{new Date(meta.updatedAt).toLocaleString()}</strong>
                </span>
              )}
              {meta.submittedAt && (
                <span>
                  Submitted: <strong>{new Date(meta.submittedAt).toLocaleString()}</strong>
                </span>
              )}
              {meta.approvedAt && (
                <span>
                  Approved: <strong>{new Date(meta.approvedAt).toLocaleString()}</strong>
                </span>
              )}
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-300">
              <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {formState.studentInfo.name || lead?.name || (isNewJoining ? 'New Student' : '—')}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span>{formState.studentInfo.phone || lead?.phone || 'No phone recorded'}</span>
                {!isNewJoining && lead?.courseInterested && <span>· {lead.courseInterested}</span>}
                {!isNewJoining && lead?.district && <span>· {lead.district}</span>}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
            {!isPublicEdit && publicLinkRouteKey && (
              <Link href={`/superadmin/joining/${publicLinkRouteKey}/detail`}>
                <Button variant="outline" className="group inline-flex items-center gap-2">
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  View Details
                </Button>
              </Link>
            )}
            {status === 'draft' && canWriteJoining && !isPublicEdit && (
              <Button
                variant="primary"
                onClick={() => setIsEditModalOpen(true)}
                className="group inline-flex items-center gap-2"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Form
              </Button>
            )}
            {status === 'draft' && canWriteJoining && !isPublicEdit && (isNewJoining || !!publicLinkRouteKey) && (
              <Button
                variant="outline"
                disabled={publicLinkBusy}
                onClick={() => void handleCopyPublicLink()}
                className="inline-flex items-center gap-2"
              >
                {publicLinkBusy ? 'Preparing link…' : 'Copy public link (5 min)'}
              </Button>
            )}
            {status === 'draft' && canWriteJoining && !isPublicEdit && !isNewJoining && !publicLinkRouteKey && (
              <p className="text-xs text-slate-500 dark:text-slate-400 sm:w-full sm:pl-0">
                Open a confirmed lead/joining record to create a public link.
              </p>
            )}
            {isAdmissionEditable ? (
              <>
                <Button
                  variant="primary"
                  disabled={isUpdatingAdmission || isBusy || !canWriteJoining}
                  onClick={handleSaveAdmissionRecord}
                  className="group inline-flex items-center gap-2"
                >
                  {isUpdatingAdmission ? 'Updating…' : 'Update Admission'}
                  <svg
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </Button>
                <Button variant="outline" onClick={() => router.push('/superadmin/joining')}>
                  Joining List
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {isBusy ? (
          <div className="rounded-2xl border border-white/60 bg-white/90 p-12 text-center shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-400 border-t-transparent" />
            <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-300">
              {status === 'approved' ? 'Loading admission record…' : 'Loading joining details…'}
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            <section className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                Course & Quota
              </h2>
              <p className="text-sm text-gray-500">
                These values default from the confirmed lead. Adjust if the student opted for a
                different program.
              </p>
              {(() => {
                // Show what the lead actually carried over (free-text "course
                // interested") next to the managed-DB resolved values so staff
                // can spot mismatches. The lead-side text and the managed
                // course/branch can diverge when the lead form stored a
                // combined "B.Tech CSE" string while the secondary DB keeps
                // them split into a course + branch.
                const interestedFromLead = String(lead?.courseInterested || '').trim();
                const resolvedCourseName = selectedCourseSetting?.course?.name || '';
                const resolvedBranchName =
                  selectedCourseSetting?.branches.find(
                    (b) =>
                      String(b._id ?? '').trim() ===
                      String(formState.courseInfo.branchId ?? '').trim()
                  )?.name || '';
                if (!interestedFromLead && !resolvedCourseName && !resolvedBranchName) {
                  return null;
                }
                return (
                  <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-100">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                      {interestedFromLead ? (
                        <div className="min-w-0">
                          <span className="font-medium">From lead (interest):</span>{' '}
                          <span className="font-semibold">{interestedFromLead}</span>
                        </div>
                      ) : null}
                      {(resolvedCourseName || resolvedBranchName) ? (
                        <div className="min-w-0">
                          <span className="font-medium">Linked to managed:</span>{' '}
                          <span className="font-semibold">
                            {resolvedCourseName || '—'}
                            {resolvedBranchName ? ` · ${resolvedBranchName}` : ''}
                          </span>
                        </div>
                      ) : interestedFromLead ? (
                        <div className="min-w-0 text-xs text-amber-700 dark:text-amber-300">
                          Not yet mapped to a managed course/branch. Pick below to link it.
                        </div>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-blue-700/80 dark:text-blue-200/80">
                      Managed values come from the secondary <span className="font-mono">student_database</span> (courses & course_branches).
                    </p>
                  </div>
                );
              })()}
              {isLoadingCourseSettings ? (
                <p className="mt-4 text-sm text-slate-500 dark:text-slate-300">
                  Loading course and branch directory…
                </p>
              ) : courseSettings.length > 0 ? (
                <>
                  {(() => {
                    const currentLevel = formState.courseInfo.programLevel || '';
                    const hasLevelOptions = programLevels.length > 0;
                    const knownOption =
                      currentLevel &&
                      programLevels.some(
                        (lvl) => String(lvl).trim().toLowerCase() === currentLevel.trim().toLowerCase()
                      );
                    return (
                    <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-6 md:items-start">
                      <div className="min-w-0">
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                          Program level
                          <span className="ml-1 text-rose-600">*</span>
                        </label>
                        <select
                          value={currentLevel}
                          onChange={(event) => handleProgramLevelChange(event.target.value)}
                          disabled={!hasLevelOptions}
                          className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                        >
                          <option value="">
                            {hasLevelOptions ? 'Select program level' : 'No levels configured in secondary DB'}
                          </option>
                          {/* Preserve a pre-existing value (e.g. inferred from a managed course) even if absent from the fresh list. */}
                          {currentLevel && !knownOption ? (
                            <option value={currentLevel}>{currentLevel}</option>
                          ) : null}
                          {programLevels.map((lvl) => (
                            <option key={lvl} value={lvl}>
                              {lvl}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          From <span className="font-mono">student_database.courses</span> and{' '}
                          <span className="font-mono">settings.certificate_config</span>.
                        </p>
                      </div>
                      <div className="min-w-0">
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                          Quota
                        </label>
                        <select
                          value={formState.courseInfo.quota || ''}
                          onChange={(event) => handleCourseFieldChange('quota', event.target.value)}
                          className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                        >
                          <option value="">Select quota</option>
                          {formState.courseInfo.quota &&
                            !quotaOptions.includes(formState.courseInfo.quota as (typeof quotaOptions)[number]) && (
                              <option value={formState.courseInfo.quota}>{formState.courseInfo.quota}</option>
                            )}
                          {quotaOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-0">
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                          College
                        </label>
                        <select
                          value={selectedCollegeId}
                          onChange={(event) => handleCollegeSelect(event.target.value)}
                          className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                        >
                          <option value="">Select college</option>
                          {colleges.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          From secondary DB colleges list (same source family as courses).
                        </p>
                      </div>
                      {!programLevelTrimmed ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30 md:col-span-2">
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                            Select a program level to load courses for that level.
                          </p>
                        </div>
                      ) : filteredCourseSettings.length > 0 ? (
                        <>
                          <div className="min-w-0">
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                              Select Managed Course
                            </label>
                            <select
                              value={formState.courseInfo.courseId || ''}
                              onChange={(event) => handleManagedCourseSelect(event.target.value)}
                              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                            >
                              <option value="">Choose a course</option>
                              {filteredCourseSettings.map((item) => (
                                <option key={item.course._id} value={item.course._id}>
                                  {item.course.name}
                                  {item.course.code ? ` (${item.course.code})` : ''}
                                </option>
                              ))}
                            </select>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Managed in Course &amp; Branch Setup. Keeps payments in sync.
                            </p>
                          </div>
                          <div className="min-w-0">
                            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                              Select Managed Branch
                            </label>
                            <select
                              value={formState.courseInfo.branchId || ''}
                              onChange={(event) => handleManagedBranchSelect(event.target.value)}
                              disabled={!formState.courseInfo.courseId}
                              className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                            >
                              <option value="">
                                {formState.courseInfo.courseId ? 'Choose a branch' : 'Select a course first'}
                              </option>
                              {(() => {
                                if (!selectedCourseSetting) return null;
                                const branchMap = new Map<string, Branch>();
                                selectedCourseSetting.branches.forEach((branch) => {
                                  const branchId = branch._id;
                                  if (branchId && !branchMap.has(branchId)) {
                                    branchMap.set(branchId, branch);
                                  }
                                });
                                const uniqueBranches = Array.from(branchMap.values());
                                return uniqueBranches.map((branch) => {
                                  const branchId = branch._id;
                                  return (
                                    <option key={branchId} value={branchId}>
                                      {branch.name}
                                      {branch.code ? ` (${branch.code})` : ''}
                                    </option>
                                  );
                                });
                              })()}
                            </select>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Updates when the course changes.
                            </p>
                          </div>
                        </>
                      ) : programLevelTrimmed ? (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30 md:col-span-2">
                          <p className="text-sm text-amber-800 dark:text-amber-200">
                            No managed courses are tagged for this program level. Check course level values or payment
                            configuration.
                          </p>
                        </div>
                      ) : null}
                      {admissionNumberDisplay ? (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-900/40 dark:text-emerald-200 md:col-span-2">
                          Admission Number
                          <div className="mt-1 text-lg font-bold tracking-wide">{admissionNumberDisplay}</div>
                        </div>
                      ) : null}
                    </div>
                    );
                  })()}
                </>
              ) : null}
              {configuredFee !== null && (
                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700 shadow-sm dark:border-blue-900/50 dark:bg-blue-900/30 dark:text-blue-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-blue-500 dark:text-blue-300">
                        Configured Admission Fee
                      </p>
                      <p className="text-lg font-semibold">{formatCurrency(configuredFee)}</p>
                    </div>
                    {selectedBranchSetting?.branch ? (
                      <p className="text-right text-xs text-blue-500 dark:text-blue-300">
                        Branch: {selectedBranchSetting.branch.name}
                      </p>
                    ) : selectedCourseSetting ? (
                      <p className="text-right text-xs text-blue-500 dark:text-blue-300">
                        Course-wide default fee
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-2 text-xs text-blue-500/80 dark:text-blue-200/70">
                    Update fee amounts any time under Payment Configuration settings.
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                1. Student Information
              </h2>
              {status === 'draft' ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50/90 to-white p-4 dark:border-slate-700 dark:from-slate-900/60 dark:to-slate-900/40">
                  <div className="flex flex-col gap-2 border-b border-slate-200/80 pb-3 dark:border-slate-700/80 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                        Registration fields (student database)
                      </h3>
                      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        Definitions load from secondary MySQL (<span className="font-mono">student_database</span>
                        ). Course, branch, quota, student type, Aadhaar, caste, and address are not repeated here — use{' '}
                        <span className="font-medium text-slate-700 dark:text-slate-300">Course &amp; Quota</span>{' '}
                        above so fee rules stay aligned.
                      </p>
                    </div>
                  </div>
                  {registrationFormsError ? (
                    <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                      Could not load form list from the student database. Check DB_SECONDARY_* and that a{' '}
                      <span className="font-mono">forms</span> or <span className="font-mono">form_builder_forms</span>{' '}
                      table is available.
                    </p>
                  ) : registrationFormError ? (
                    <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                      Could not load the selected registration form from the student database.
                    </p>
                  ) : !registrationFormId ? (
                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                      No active registration form found in the student database.
                    </p>
                  ) : isLoadingRegistrationForm ? (
                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Loading registration form…</p>
                  ) : registrationFormFieldsAllFilteredOut ? (
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                      This registration form only contained fields that are already covered above (for example
                      course or branch). Nothing extra to show here.
                    </p>
                  ) : regHasDyn ? (
                    <div className="mt-4">
                      <JoiningDynamicRegistrationFields
                        formTitle={registrationFormDefinition?.name || undefined}
                        formDescription={registrationFormDefinition?.description}
                        fields={joiningRegistrationDisplayFieldsCoerced}
                        getValue={getRegistrationFieldValue}
                        onChange={handleRegistrationFieldChange}
                        selectedState={registrationLocationState}
                        selectedDistrict={registrationLocationDistrict}
                      />
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                      No active fields on the default registration form in the student database.
                    </p>
                  )}
                </div>
              ) : null}
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {!hideJoiningStudentName ? (
                <div>
                  <Input
                    label="Student Name"
                    value={formState.studentInfo.name}
                    onChange={(event) => handleStudentInfoChange('name', event.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Enter as per SSC</p>
                </div>
                ) : null}
                {!hideJoiningStudentPhone ? (
                  <div>
                    <Input
                      label="Student mobile number"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      value={formState.studentInfo.phone || ''}
                      onChange={(event) =>
                        handleStudentInfoChange('phone', event.target.value.replace(/\D/g, ''))
                      }
                      placeholder="10-digit mobile"
                      maxLength={15}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                      Pulled from the lead when you open joining; edit here if it changed.
                    </p>
                  </div>
                ) : null}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Aadhaar Number
                  </label>
                  <div className="flex gap-2">
                    <input
                      type={showStudentAadhaar ? 'text' : 'password'}
                      value={formState.studentInfo.aadhaarNumber || ''}
                      onChange={(event) =>
                        handleStudentInfoChange('aadhaarNumber', event.target.value)
                      }
                      placeholder="12-digit Aadhaar number"
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70"
                      maxLength={14}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setShowStudentAadhaar((prev) => !prev)}
                    >
                      {showStudentAadhaar ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Stored securely. Masked by default for privacy.
                  </p>
                </div>
                {(!hideJoiningStudentGender || !hideJoiningDateOfBirth) ? (
                <div className="grid grid-cols-2 gap-4">
                  {!hideJoiningStudentGender ? (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                      Gender
                    </label>
                    <select
                      value={formState.studentInfo.gender || ''}
                      onChange={(event) => handleStudentInfoChange('gender', event.target.value)}
                      className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                    >
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  ) : null}
                  {!hideJoiningDateOfBirth ? (
                  <div>
                    <Input
                      label="Date of Birth"
                      value={formState.studentInfo.dateOfBirth || ''}
                      onChange={(event) => handleStudentInfoChange('dateOfBirth', event.target.value)}
                      type="date"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Enter as per SSC</p>
                  </div>
                  ) : null}
                </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                2. Parents Details
              </h2>
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="text-md font-semibold text-gray-800 dark:text-slate-200">
                    Father Information
                  </h3>
                  <div className="mt-4 space-y-3">
                    {!hideJoiningFatherName ? (
                    <div>
                      <Input
                        label="Father Name"
                        value={formState.parents.father.name || ''}
                        onChange={(event) => handleParentChange('father', 'name', event.target.value)}
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Enter as per SSC</p>
                    </div>
                    ) : null}
                    <div>
                      <Input
                        label="Father Mobile Number"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        value={formState.parents.father.phone || ''}
                        onChange={(event) =>
                          handleParentChange(
                            'father',
                            'phone',
                            event.target.value.replace(/\D/g, '')
                          )
                        }
                        placeholder="10-digit mobile"
                        maxLength={15}
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                        Required for the printed application form.
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                        Father Aadhaar Number
                      </label>
                      <div className="flex gap-2">
                        <input
                          type={showFatherAadhaar ? 'text' : 'password'}
                          value={formState.parents.father.aadhaarNumber || ''}
                          onChange={(event) =>
                            handleParentChange('father', 'aadhaarNumber', event.target.value)
                          }
                          placeholder="12-digit Aadhaar number"
                          className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70"
                          maxLength={14}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setShowFatherAadhaar((prev) => !prev)}
                        >
                          {showFatherAadhaar ? 'Hide' : 'Show'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-md font-semibold text-gray-800 dark:text-slate-200">
                    Mother Information
                  </h3>
                  <div className="mt-4 space-y-3">
                    {!hideJoiningMotherName ? (
                    <div>
                      <Input
                        label="Mother Name"
                        value={formState.parents.mother.name || ''}
                        onChange={(event) => handleParentChange('mother', 'name', event.target.value)}
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">Enter as per SSC</p>
                    </div>
                    ) : null}
                    <div>
                      <Input
                        label="Mother Mobile Number"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        value={formState.parents.mother.phone || ''}
                        onChange={(event) =>
                          handleParentChange(
                            'mother',
                            'phone',
                            event.target.value.replace(/\D/g, '')
                          )
                        }
                        placeholder="10-digit mobile"
                        maxLength={15}
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                        Required for the printed application form.
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                        Mother Aadhaar Number
                      </label>
                      <div className="flex gap-2">
                        <input
                          type={showMotherAadhaar ? 'text' : 'password'}
                          value={formState.parents.mother.aadhaarNumber || ''}
                          onChange={(event) =>
                            handleParentChange('mother', 'aadhaarNumber', event.target.value)
                          }
                          placeholder="12-digit Aadhaar number"
                          className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70"
                          maxLength={14}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setShowMotherAadhaar((prev) => !prev)}
                        >
                          {showMotherAadhaar ? 'Hide' : 'Show'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                3. Reservation Category
              </h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    General Reservation Category<span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formState.reservation.general}
                    onChange={(event) =>
                      handleReservationGeneralChange(
                        event.target.value as JoiningReservation['general']
                      )
                    }
                    className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                  >
                    <option value="oc">OC</option>
                    <option value="ews">EWS</option>
                    <option value="bc-a">BC-A</option>
                    <option value="bc-b">BC-B</option>
                    <option value="bc-c">BC-C</option>
                    <option value="bc-d">BC-D</option>
                    <option value="bc-e">BC-E</option>
                    <option value="sc">SC</option>
                    <option value="st">ST</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    EWS (Economically Weaker Section)<span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-4 py-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="ews"
                        checked={formState.reservation.isEws === true}
                        onChange={() => handleReservationEwsChange(true)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-slate-200">Yes</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="ews"
                        checked={formState.reservation.isEws !== true}
                        onChange={() => handleReservationEwsChange(false)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-slate-200">No</span>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Other Reservations
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={otherReservationInput}
                      onChange={(event) => setOtherReservationInput(event.target.value)}
                      placeholder="Add NCC, Sports, PH, etc."
                    />
                    <Button type="button" variant="secondary" onClick={addOtherReservation}>
                      Add
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(formState.reservation.other || []).map((value) => (
                      <span
                        key={value}
                        className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700"
                      >
                        {value}
                        <button
                          className="text-blue-500"
                          onClick={() => removeOtherReservation(value)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {(formState.reservation.other || []).length === 0 && (
                      <span className="text-xs text-gray-500">No additional reservations added.</span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                4. Address for Communication (Uppercase)
              </h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {!hideJoiningDoor ? (
                <Input
                  label="Door No / Street Name"
                  value={formState.address.communication.doorOrStreet || ''}
                  onChange={(event) =>
                    handleCommunicationAddressChange('doorOrStreet', event.target.value.toUpperCase())
                  }
                />
                ) : null}
                {!hideJoiningLandmark ? (
                <Input
                  label="Landmark"
                  value={formState.address.communication.landmark || ''}
                  onChange={(event) =>
                    handleCommunicationAddressChange('landmark', event.target.value.toUpperCase())
                  }
                />
                ) : null}
                {!hideJoiningVillage ? (
                <Input
                  label="Village / Town / City"
                  value={formState.address.communication.villageOrCity || ''}
                  onChange={(event) =>
                    handleCommunicationAddressChange('villageOrCity', event.target.value.toUpperCase())
                  }
                />
                ) : null}
                {!hideJoiningState ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">State</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    value={formState.address.communication.state || ''}
                    onChange={(e) => handleCommunicationAddressChange('state', e.target.value)}
                  >
                    <option value="">Select state</option>
                    {stateNames.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                ) : null}
                {!hideJoiningDistrict ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">District</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    value={formState.address.communication.district || ''}
                    onChange={(e) => handleCommunicationAddressChange('district', e.target.value)}
                  >
                    <option value="">Select district</option>
                    {commDistricts.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                ) : null}
                {!hideJoiningMandal ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mandal</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    value={formState.address.communication.mandal || ''}
                    onChange={(e) => handleCommunicationAddressChange('mandal', e.target.value)}
                  >
                    <option value="">Select mandal</option>
                    {commMandals.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                ) : null}
                {!hideJoiningPin ? (
                <Input
                  label="PIN Code"
                  value={formState.address.communication.pinCode || ''}
                  onChange={(event) =>
                    handleCommunicationAddressChange('pinCode', event.target.value)
                  }
                  maxLength={6}
                />
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                    5. Relatives / Friends (Optional)
                  </h2>
                  <p className="text-sm text-gray-500">
                    Capture additional contact addresses. Add as many as required.
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={addRelative}>
                  Add Address
                </Button>
              </div>
              <div className="mt-6 space-y-6">
                {formState.address.relatives.length === 0 && (
                  <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                    No relative or friend addresses added.
                  </p>
                )}
                {formState.address.relatives.map((relative, index) => (
                  <RelativeAddressRow
                    key={`relative-${index}`}
                    relative={relative}
                    index={index}
                    updateRelative={updateRelative}
                    removeRelative={removeRelative}
                    stateNames={stateNames}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                6. Qualified Examinations
              </h2>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  {[
                    { key: 'ssc' as const, label: 'SSC' },
                    { key: 'interOrDiploma' as const, label: 'Inter / Diploma' },
                    { key: 'ug' as const, label: 'UG' },
                  ].map((item) => (
                    <label key={item.key} className="flex items-center gap-3 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={Boolean(formState.qualifications[item.key])}
                        onChange={() => toggleQualification(item.key)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                    Medium of Instruction
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {mediumOptions.map((option) => (
                      <label
                        key={option.value}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-blue-300 focus-within:border-blue-400 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200"
                      >
                        <input
                          type="checkbox"
                          checked={Array.isArray(formState.qualifications.mediums) && formState.qualifications.mediums.includes(option.value)}
                          onChange={() => toggleMediumSelection(option.value)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                  {Array.isArray(formState.qualifications.mediums) &&
                    formState.qualifications.mediums.includes('other') && (
                      <Input
                        className="mt-3"
                        placeholder="Specify medium"
                        value={formState.qualifications.otherMediumLabel || ''}
                        onChange={(event) => handleMediumOtherLabelChange(event.target.value)}
                      />
                    )}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                    7. Education History
                  </h2>
                  <p className="text-sm text-gray-500">
                    Add every school or college the student has studied. Include year, course, and
                    identifiers.
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={addEducationHistory}>
                  Add Entry
                </Button>
              </div>
              <div className="mt-6 space-y-6">
                {formState.educationHistory.length === 0 && (
                  <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                    No education history added. Include SSC, Inter/Diploma, UG, and others if
                    applicable.
                  </p>
                )}
                {formState.educationHistory.map((entry, index) => (
                  <div
                    key={`edu-${index}`}
                    className="rounded-xl border border-gray-200 p-4 shadow-sm dark:border-slate-700"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200">
                        Entry #{index + 1}
                      </h3>
                      <button className="text-sm text-red-500" onClick={() => removeEducationHistory(index)}>
                        Remove
                      </button>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-slate-200">
                          Level
                        </label>
                        <select
                          value={entry.level}
                          onChange={(event) =>
                            updateEducationHistory(index, 'level', event.target.value)
                          }
                          className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                        >
                          <option value="ssc">SSC</option>
                          <option value="inter_diploma">Inter / Diploma</option>
                          <option value="ug">UG</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      {entry.level === 'other' && (
                        <Input
                          label="Specify Level"
                          value={entry.otherLevelLabel || ''}
                          onChange={(event) =>
                            updateEducationHistory(index, 'otherLevelLabel', event.target.value)
                          }
                        />
                      )}
                      <Input
                        label="Course / Branch"
                        value={entry.courseOrBranch || ''}
                        onChange={(event) =>
                          updateEducationHistory(index, 'courseOrBranch', event.target.value)
                        }
                      />
                      <Input
                        label="Year of Passing"
                        value={entry.yearOfPassing || ''}
                        onChange={(event) => handleYearOfPassingChange(index, event.target.value)}
                        inputMode="numeric"
                        maxLength={4}
                      />
                      <Input
                        label="School / College Name"
                        value={entry.institutionName || ''}
                        onChange={(event) =>
                          updateEducationHistory(index, 'institutionName', event.target.value)
                        }
                      />
                      <Input
                        label="School / College Address"
                        value={entry.institutionAddress || ''}
                        onChange={(event) =>
                          updateEducationHistory(index, 'institutionAddress', event.target.value)
                        }
                      />
                      <Input
                        label="Hall Ticket Number"
                        value={entry.hallTicketNumber || ''}
                        onChange={(event) =>
                          updateEducationHistory(index, 'hallTicketNumber', event.target.value)
                        }
                      />
                      <Input
                        label="Total Marks / Grade / %"
                        value={entry.totalMarksOrGrade || ''}
                        onChange={(event) => handleTotalMarksChange(index, event.target.value)}
                        inputMode="decimal"
                      />
                      <Input
                        label="CET Rank (Optional)"
                        value={entry.cetRank || ''}
                        onChange={(event) =>
                          updateEducationHistory(index, 'cetRank', event.target.value)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                    8. Siblings (Optional)
                  </h2>
                  <p className="text-sm text-gray-500">Record siblings currently studying.</p>
                </div>
                <Button type="button" variant="secondary" onClick={addSibling}>
                  Add Sibling
                </Button>
              </div>
              <div className="mt-6 space-y-6">
                {formState.siblings.length === 0 && (
                  <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500">
                    No siblings recorded.
                  </p>
                )}
                {formState.siblings.map((sibling, index) => (
                  <div
                    key={`sibling-${index}`}
                    className="rounded-xl border border-gray-200 p-4 shadow-sm dark:border-slate-700"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-slate-200">
                        Sibling #{index + 1}
                      </h3>
                      <button className="text-sm text-red-500" onClick={() => removeSibling(index)}>
                        Remove
                      </button>
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <Input
                        label="Name"
                        value={sibling.name || ''}
                        onChange={(event) => updateSibling(index, 'name', event.target.value)}
                      />
                      <Input
                        label="Relation"
                        value={sibling.relation || ''}
                        onChange={(event) => updateSibling(index, 'relation', event.target.value)}
                      />
                      <Input
                        label="Studying Standard"
                        value={sibling.studyingStandard || ''}
                        onChange={(event) =>
                          updateSibling(index, 'studyingStandard', event.target.value)
                        }
                      />
                      <Input
                        label="College / School Name"
                        value={sibling.institutionName || ''}
                        onChange={(event) =>
                          updateSibling(index, 'institutionName', event.target.value)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                    9. Documents Checklist
                  </h2>
                  <p className="text-sm text-gray-500">
                    Mark each document as received. SSC, Intermediate, UG/PG CMM, Transfer Certificate, and Study
                    Certificate are tracked under <span className="font-medium">Certificate information checklist</span>{' '}
                    (from student database settings).
                  </p>
                </div>
                <PrintableDocumentChecklist
                  documentLabels={documentsChecklistForPrint.labels}
                  documents={documentsChecklistForPrint.docs as Record<string, 'pending' | 'received' | undefined>}
                  title="Documents Checklist"
                  studentName={formState.studentInfo.name || (lead as any)?.name || undefined}
                  enquiryNumber={(lead as any)?.enquiryNumber || undefined}
                  printButtonLabel="Print checklist"
                  className="shrink-0"
                />
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {(Object.entries(documentLabels) as [keyof JoiningDocuments, string][])
                  .filter(([key]) => !DOCUMENT_KEYS_HIDDEN_FROM_CHECKLIST.has(key))
                  .map(([key, label]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 shadow-sm dark:border-slate-700"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-slate-200">{label}</p>
                      </div>
                      <div className="flex gap-3">
                        {documentStatusOptions.map((statusOption) => (
                          <label
                            key={`${key}-${statusOption}`}
                            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-xs font-semibold uppercase transition ${(formState.documents[key] || 'pending') ===
                              statusOption
                              ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-900/30 dark:text-blue-200'
                              : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-400 dark:hover:text-blue-200'
                              }`}
                          >
                            <input
                              type="radio"
                              name={`document-${key}`}
                              value={statusOption}
                              checked={(formState.documents[key] || 'pending') === statusOption}
                              onChange={() => updateDocumentStatus(key, statusOption)}
                              className="h-3 w-3 border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span>{statusOption === 'received' ? 'Received' : 'Pending'}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>

              <div className="mt-10 border-t border-slate-200 pt-8 dark:border-slate-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100">
                  Certificate information checklist
                </h3>
                {derivedCertificationStatus !== null && (
                  <p className="mt-2 text-sm text-gray-700 dark:text-slate-300">
                    <span className="font-medium text-gray-900 dark:text-slate-100">Certification status</span>
                    {': '}
                    <span
                      className={
                        derivedCertificationStatus === 'Verified'
                          ? 'ml-1 inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200'
                          : 'ml-1 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200'
                      }
                    >
                      {derivedCertificationStatus}
                    </span>
                  </p>
                )}
                <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                  From <span className="font-mono">student_database.settings</span> (<span className="font-mono">certificate_config</span>
                  ) for the program level selected in Course &amp; Quota. Status is saved with the joining draft.
                </p>
                {!programLevelTrimmed ? (
                  <p className="mt-4 text-sm text-amber-700 dark:text-amber-300">
                    Select a program level in Course &amp; Quota to load this checklist.
                  </p>
                ) : isLoadingCertificateGuidance ? (
                  <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Loading certificate rules…</p>
                ) : certificateGuidance?.format === 'certificate_config' &&
                  certificateGuidance.items &&
                  certificateGuidance.items.length > 0 ? (
                  <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {certificateGuidance.items
                      .filter((item) => String(item.id || item.name || '').trim())
                      .map((item) => {
                      const itemId = String(item.id || item.name || '').trim();
                      const certOpts = listCertificateItemOptions(item);
                      const hasCertOptions = certOpts.length > 0;
                      const parsed = certificateChecklistParsed[itemId] ?? {
                        status: 'pending' as JoiningDocumentStatus,
                      };
                      const status = parsed.status === 'received' ? 'received' : 'pending';
                      const selectedEncoded =
                        hasCertOptions &&
                        parsed.option &&
                        certOpts.some((o) => o.encoded === parsed.option)
                          ? parsed.option!
                          : hasCertOptions
                            ? certOpts[0]!.encoded
                            : undefined;
                      return (
                        <div
                          key={itemId}
                          className="flex flex-col gap-2 rounded-xl border border-indigo-200/80 bg-indigo-50/40 px-4 py-3 shadow-sm dark:border-indigo-900/50 dark:bg-indigo-950/30"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{item.name}</p>
                            <span
                              className={
                                item.required
                                  ? 'shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800 dark:bg-rose-900/50 dark:text-rose-200'
                                  : 'shrink-0 rounded-full bg-slate-200/90 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-600 dark:text-slate-200'
                              }
                            >
                              {item.required ? 'Required' : 'Optional'}
                            </span>
                          </div>
                          {hasCertOptions ? (
                            <div className="flex flex-wrap gap-2">
                              {certOpts.map(({ encoded, label }) => (
                                <label
                                  key={encoded}
                                  className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition ${
                                    selectedEncoded === encoded
                                      ? 'border-indigo-500 bg-white text-indigo-950 shadow-sm ring-1 ring-indigo-300 dark:border-indigo-400 dark:bg-indigo-900/40 dark:text-indigo-50 dark:ring-indigo-600'
                                      : 'border-indigo-200/80 bg-white/70 text-indigo-900 hover:border-indigo-400 dark:border-indigo-800 dark:bg-slate-800/60 dark:text-indigo-100 dark:hover:border-indigo-500'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`cert-option-${itemId}`}
                                    value={encoded}
                                    checked={selectedEncoded === encoded}
                                    onChange={() => updateCertificateChecklistOption(itemId, encoded)}
                                    className="h-3 w-3 border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <span>{label}</span>
                                </label>
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-1 flex justify-end gap-3 border-t border-indigo-200/60 pt-2 dark:border-indigo-800/50">
                            {documentStatusOptions.map((statusOption) => (
                              <label
                                key={`${itemId}-${statusOption}`}
                                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1 text-xs font-semibold uppercase transition ${status === statusOption
                                  ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-500/60 dark:bg-blue-900/30 dark:text-blue-200'
                                  : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 dark:border-slate-600 dark:text-slate-300 dark:hover:border-blue-400 dark:hover:text-blue-200'
                                  }`}
                              >
                                <input
                                  type="radio"
                                  name={`cert-checklist-${itemId}`}
                                  value={statusOption}
                                  checked={status === statusOption}
                                  onChange={() =>
                                    updateCertificateChecklistStatus(
                                      itemId,
                                      statusOption,
                                      hasCertOptions
                                    )
                                  }
                                  className="h-3 w-3 border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span>{statusOption === 'received' ? 'Received' : 'Pending'}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : certificateGuidance?.format === 'certificate_config' ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                    <p className="font-medium">
                      No certificate rules are configured for program level{' '}
                      <span className="font-mono">{certificateGuidance.level || programLevelTrimmed}</span>.
                    </p>
                    <p className="mt-1 text-xs">
                      Add a <span className="font-mono">"{(certificateGuidance.level || programLevelTrimmed).toLowerCase()}"</span>{' '}
                      bucket to <span className="font-mono">student_database.settings.certificate_config</span> to populate this checklist.
                    </p>
                  </div>
                ) : certificateGuidance && (certificateGuidance.format === 'html' || certificateGuidance.format === 'text') && String(certificateGuidance.body || '').trim() ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/80 p-4 text-sm dark:border-slate-700 dark:bg-slate-900/50">
                    {certificateGuidance.format === 'html' ? (
                      <div
                        className="certificate-guidance-html max-w-none [&_ul]:list-disc [&_ul]:pl-5"
                        dangerouslySetInnerHTML={{ __html: certificateGuidance.body || '' }}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap">{certificateGuidance.body}</div>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                    <p className="font-medium">
                      Certificate configuration is not set up in the secondary student database.
                    </p>
                    <p className="mt-1 text-xs">
                      Add a row to <span className="font-mono">student_database.settings</span> with key{' '}
                      <span className="font-mono">certificate_config</span> and a JSON value such as{' '}
                      <span className="font-mono">{`{"diploma":[…],"ug":[…],"pg":[…]}`}</span> to drive this checklist
                      for program level{' '}
                      <span className="font-mono">{programLevelTrimmed}</span>.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/*
             * Payment Information should always render for any joining viewer
             * (admin / counsellor / data-entry). The write actions (Record Cash,
             * Cashfree, Additional Fee) stay gated on `canWritePayments`. Public
             * edit links never see the payments panel — that surface is admin-only.
             */}
            {!isPublicEdit && (
              <section
                id="payment-panel"
                className={`rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur transition dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none ${shouldPromptPayment
                  ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-white dark:ring-offset-slate-950'
                  : ''
                  }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100">
                      10. Payments &amp; Transactions
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-slate-400">
                      Collect admission fees in parts or full. Every transaction updates the balance and is
                      logged for audit.
                    </p>
                    {paymentSummary?.lastPaymentAt && (
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        Last payment updated on{' '}
                        <span className="font-semibold">
                          {formatDateTime(paymentSummary.lastPaymentAt)}
                        </span>
                      </p>
                    )}
                  </div>
                  {canAccessPaymentsModule ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="primary"
                        onClick={() => openPaymentModal('cash')}
                        disabled={paymentActionsDisabled}
                      >
                        {isAdditionalFeeMode ? 'Record Additional Cash Payment' : 'Record Cash Payment'}
                      </Button>
                      <Button
                        variant={isAdditionalFeeMode ? 'secondary' : 'outline'}
                        onClick={() => openPaymentModal('online')}
                        disabled={!canUseCashfree || paymentActionsDisabled}
                      >
                        {isAdditionalFeeMode
                          ? 'Collect Additional Fee via Cashfree'
                          : 'Collect via Cashfree UPI / QR'}
                      </Button>
                      {shouldShowAdditionalFeeButton && (
                        <Button
                          variant={isAdditionalFeeMode ? 'secondary' : 'outline'}
                          onClick={() => {
                            if (paymentFormState.isProcessing) return;
                            setIsAdditionalFeeMode((prev) => {
                              if (prev) {
                                resetPaymentForm();
                              }
                              return !prev;
                            });
                          }}
                          disabled={paymentFormState.isProcessing || !canWritePayments}
                        >
                          {isAdditionalFeeMode ? 'Cancel Additional Fee' : 'Additional Fee'}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                      Payments module is read-only for your role. Ask a Super Admin to grant the
                      <span className="font-semibold"> Payments </span> permission to record fees.
                    </p>
                  )}
                  {isAdditionalFeeMode && (
                    <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                      Additional fee mode active
                    </div>
                  )}
                </div>

                {!canUseCashfree && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/40 dark:text-amber-200">
                    Cashfree credentials are not configured or inactive. Update them under Payment Settings
                    to enable online collections.
                  </div>
                )}

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                          Total Fee
                        </span>
                        <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {formatCurrency(baseFeeTarget)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                          Paid Fee
                        </span>
                        <span className="text-base font-semibold text-emerald-600 dark:text-emerald-300">
                          {formatCurrency(baseFeePaid)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                          Balance Fee
                        </span>
                        <span className="text-base font-semibold text-blue-600 dark:text-blue-300">
                          {formatCurrency(outstandingBalance)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                          Additional Fee
                        </span>
                        <span className="text-base font-semibold text-amber-600 dark:text-amber-300">
                          {formatCurrency(additionalFeePaid)}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                          Total Amount Paid
                        </span>
                        <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {formatCurrency(totalAmountPaid)}
                        </span>
                      </div>
                      <div className="mt-4 inline-flex items-center gap-2 rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wide">
                        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${paymentStatusBadgeClass}`}>
                          <span className="inline-block h-2 w-2 rounded-full bg-current opacity-75" />
                          {paymentStatusLabel}
                        </span>
                        {cashfreeConfig && (
                          <span className="text-[10px] uppercase text-slate-400 dark:text-slate-500">
                            Cashfree mode: production
                          </span>
                        )}
                      </div>
                    </div>
                    {configuredFee !== null && outstandingBalance > configuredFee && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600 shadow-sm dark:border-rose-900/60 dark:bg-rose-900/40 dark:text-rose-200">
                        Awaiting fee configuration update. Balance exceeds configured amount—verify course
                        selection and fee setup.
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Payment Activity
                    </h3>
                    {isLoadingTransactions ? (
                      <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                        Loading transactions…
                      </p>
                    ) : transactions.length === 0 ? (
                      <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                        No payments recorded yet. Collect fees using the actions above.
                      </p>
                    ) : (
                      <ul className="mt-4 space-y-3">
                        {transactions.map((transaction) => {
                          const modeLabel =
                            transaction.mode === 'cash'
                              ? 'Cash'
                              : transaction.mode === 'online'
                                ? 'Cashfree'
                                : 'UPI QR';
                          const statusClass =
                            transaction.status === 'success'
                              ? 'text-emerald-600 dark:text-emerald-300'
                              : transaction.status === 'failed'
                                ? 'text-rose-600 dark:text-rose-300'
                                : 'text-amber-600 dark:text-amber-300';
                          const collectorName =
                            typeof transaction.collectedBy === 'object'
                              ? transaction.collectedBy?.name
                              : undefined;
                          return (
                            <li
                              key={transaction._id}
                              className="rounded-lg border border-slate-200 px-4 py-3 text-sm shadow-sm dark:border-slate-700"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                                    {modeLabel}
                                  </span>
                                  {transaction.isAdditionalFee && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                                      Additional
                                    </span>
                                  )}
                                  {(transaction.feeHeadName || transaction.feeHeadCode) && (
                                    <span
                                      className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                                      title={
                                        transaction.feeStructureYear || transaction.feeStructureBatch
                                          ? `Batch ${transaction.feeStructureBatch || ''} ${
                                              transaction.feeStructureYear
                                                ? `· Year ${transaction.feeStructureYear}`
                                                : ''
                                            }`.trim()
                                          : 'Tagged fee head'
                                      }
                                    >
                                      {transaction.feeHeadName || transaction.feeHeadCode}
                                    </span>
                                  )}
                                </div>
                                <span className={`text-xs font-semibold uppercase ${statusClass}`}>
                                  {transaction.status}
                                </span>
                              </div>
                              <div className="mt-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                                <span>{formatDateTime(transaction.processedAt || transaction.createdAt)}</span>
                                <span>{formatCurrency(transaction.amount)}</span>
                              </div>
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {collectorName && (
                                  <span>
                                    Collected by <span className="font-semibold">{collectorName}</span>
                                  </span>
                                )}
                                {transaction.referenceId && (
                                  <span className="ml-2">
                                    Ref: <span className="font-mono">{transaction.referenceId}</span>
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* Fee Structure (Fee Management DB) — visible to any joining viewer.
                Users with payments-write permission can record a cash/Cashfree payment on
                any row; the transaction is tagged with the chosen fee head. The per-row
                Cash + Cashfree buttons mirror the "10. Payments & Transactions" section. */}
            {!isPublicEdit && (
              <FeeStructureSection
                course={formState.courseInfo.course}
                branch={formState.courseInfo.branch}
                quota={formState.courseInfo.quota}
                batch={
                  (lead as { academicYear?: number | string } | undefined)?.academicYear ??
                  null
                }
                description="Live from the Fee Management database. Pick a batch, then use Cash or Cashfree on any fee head — the payment is tagged with that head and shows up in Payments & Transactions."
                onSelectFeeHead={canWritePayments ? handleSelectFeeHead : undefined}
                activeFeeHeadId={selectedFeeHead?.feeHeadId ?? null}
                canUseCashfree={canUseCashfree}
              />
            )}

            {/* Action Buttons at Bottom - Always visible for draft/pending status */}
            {!isAdmissionEditable && status !== 'approved' && (
              <div className="sticky bottom-0 z-10 rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-blue-100/20 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none">
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {status === 'draft' && !isPublicEdit && (
                    <Button
                      variant="secondary"
                      disabled={isSaving || !canWriteJoining}
                      onClick={() => {
                        if (!canWriteJoining) {
                          showToast.error('You have read-only access to the joining desk');
                          return;
                        }
                        saveDraftMutation.mutate();
                      }}
                    >
                      {isSaving ? 'Saving…' : 'Save Draft'}
                    </Button>
                  )}
                  {status === 'draft' && (
                    <Button
                      variant="primary"
                      disabled={!canSubmit || isSubmitting}
                      onClick={() => {
                        if (!canWriteJoining) {
                          showToast.error('You have read-only access to the joining desk');
                          return;
                        }
                        submitMutation.mutate();
                      }}
                    >
                      {isSubmitting ? 'Submitting…' : 'Submit for Approval'}
                    </Button>
                  )}
                  {canApprove && (
                    <Button
                      variant="primary"
                      disabled={isApproving}
                      onClick={() => {
                        if (!canWriteJoining) {
                          showToast.error('You have read-only access to the joining desk');
                          return;
                        }
                        approveMutation.mutate();
                      }}
                    >
                      {isApproving ? 'Approving…' : 'Approve'}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {openPaymentMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/40 bg-white/95 p-6 shadow-2xl shadow-slate-900/20 dark:border-slate-700 dark:bg-slate-900/95">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {isAdditionalFeeMode
                    ? openPaymentMode === 'cash'
                      ? 'Record Additional Cash Payment'
                      : 'Collect Additional Fee via Cashfree'
                    : openPaymentMode === 'cash'
                      ? 'Record Cash Payment'
                      : 'Collect via Cashfree'}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {isAdditionalFeeMode
                    ? 'Capture any additional fee collected beyond the scheduled admission fee.'
                    : openPaymentMode === 'cash'
                      ? 'Confirm the amount received in cash. The logged-in user is marked as collector.'
                      : 'Enter the amount to collect. The Cashfree checkout modal opens next for secure UPI/QR payment.'}
                </p>
              </div>
              <button
                className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                onClick={closePaymentModal}
                aria-label="Close payment dialog"
                disabled={paymentFormState.isProcessing}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {isAdditionalFeeMode && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/40 dark:text-amber-200">
                  This transaction is marked as an additional fee. It will be tracked separately from the admission balance.
                </div>
              )}
              {selectedFeeHead && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-900/30 dark:text-emerald-200">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Paying for
                    </span>
                    <span className="font-semibold">{selectedFeeHead.label}</span>
                    {selectedFeeHead.feeHeadCode && (
                      <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-emerald-700 dark:bg-emerald-800/50 dark:text-emerald-100">
                        {selectedFeeHead.feeHeadCode}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedFeeHead(null)}
                    className="text-[11px] font-semibold text-emerald-700 underline-offset-2 hover:underline disabled:opacity-60 dark:text-emerald-200"
                    disabled={paymentFormState.isProcessing}
                  >
                    Clear selection
                  </button>
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Amount (INR)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={paymentFormState.amount}
                  onChange={(event) =>
                    setPaymentFormState((prev) => ({
                      ...prev,
                      amount: event.target.value,
                    }))
                  }
                  className="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                  placeholder={
                    isAdditionalFeeMode
                      ? 'Enter additional amount'
                      : configuredFee
                        ? String(configuredFee)
                        : 'Enter amount'
                  }
                  disabled={paymentFormState.isProcessing}
                />
              </div>


              {openPaymentMode === 'online' && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-700 dark:border-blue-900/60 dark:bg-blue-900/30 dark:text-blue-200">
                  The Cashfree modal appears once you continue. Students can pay via UPI apps or card.
                  Stay on this screen until the modal completes.
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <Button
                variant="secondary"
                onClick={closePaymentModal}
                disabled={paymentFormState.isProcessing}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={openPaymentMode === 'cash' ? handleCashPaymentSubmit : handleCashfreePayment}
                disabled={paymentFormState.isProcessing}
              >
                {paymentFormState.isProcessing
                  ? 'Processing…'
                  : openPaymentMode === 'cash'
                    ? 'Record Payment'
                    : 'Collect Payment'}
              </Button>
            </div>
          </div>
        </div>
      )}
      {publicLinkDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-link-dialog-title"
          onClick={() => setPublicLinkDialog(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="public-link-dialog-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Public edit link
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Anyone with this URL can edit this draft until it expires (5 minutes from creation). The link was copied
              to your clipboard.
            </p>
            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500">URL</label>
            <div className="mt-1 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              {publicLinkDialog.url}
            </div>
            {publicLinkDialog.expiresAt && (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Expires: <strong>{new Date(publicLinkDialog.expiresAt).toLocaleString()}</strong>
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigator.clipboard?.writeText(publicLinkDialog.url).catch(() => {})}
              >
                Copy again
              </Button>
              <Button type="button" variant="primary" onClick={() => setPublicLinkDialog(null)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
