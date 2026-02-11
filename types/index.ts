// User Types
export type RoleName = 'Super Admin' | 'Sub Super Admin' | 'Student Counselor' | 'Data Entry User';

export type ModulePermissionLevel = 'read' | 'write';

export interface ModulePermission {
  access: boolean;
  permission: ModulePermissionLevel;
}

export interface User {
  id: string; // Add id (same as _id)
  _id: string;
  name: string;
  email: string;
  mobileNumber?: string;
  roleName: RoleName;
  designation?: string;
  permissions?: Record<string, ModulePermission>;
  managedBy?: string | User;
  previousRoleName?: string;
  isManager?: boolean;
  isActive: boolean;
  /** When false, User/Counsellor/Manager can only access Settings until they enable tracking */
  timeTrackingEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface CreateUserData {
  name: string;
  email: string;
  mobileNumber?: string;
  password: string;
  roleName: RoleName;
  designation?: string;
  permissions?: Record<string, ModulePermission>;
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  mobileNumber?: string;
  roleName?: RoleName;
  designation?: string;
  password?: string;
  permissions?: Record<string, ModulePermission>;
  isActive?: boolean;
  isManager?: boolean;
  managedBy?: string | null;
}

// Course & Branch Types
export interface Course {
  _id: string;
  name: string;
  code?: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Branch {
  _id: string;
  courseId: string;
  name: string;
  code?: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentConfigEntry {
  _id: string;
  courseId: string;
  branchId?: string;
  amount: number;
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PaymentSummaryStatus = 'not_started' | 'partial' | 'paid';

export interface PaymentSummary {
  totalFee: number;
  totalPaid: number;
  balance: number;
  currency: string;
  status: PaymentSummaryStatus;
  lastPaymentAt?: string;
}

export type PaymentMode = 'cash' | 'online' | 'upi_qr';

export type PaymentStatus = 'pending' | 'success' | 'failed';

export interface PaymentTransaction {
  _id: string;
  admissionId?: string;
  joiningId?: string;
  leadId: string;
  courseId?: string;
  branchId?: string;
  amount: number;
  currency: string;
  mode: PaymentMode;
  status: PaymentStatus;
  collectedBy?: User | string;
  cashfreeOrderId?: string;
  cashfreePaymentSessionId?: string;
  referenceId?: string;
  notes?: string;
  meta?: Record<string, any>;
  isAdditionalFee?: boolean;
  processedAt?: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CashfreeConfigPreview {
  provider: 'cashfree';
  displayName: string;
  environment: 'sandbox' | 'production';
  isActive: boolean;
  updatedAt?: string;
  clientIdPreview: string;
  clientSecretPreview: string;
}

export interface CoursePaymentSettings {
  course: Course;
  branches: Branch[];
  payment: {
    defaultFee?: PaymentConfigEntry | null;
    branchFees: Array<
      PaymentConfigEntry & {
        branch: Branch | null;
      }
    >;
  };
}

export interface CourseFeePayload {
  course: Course;
  fees: Array<{
    branch: Branch;
    feeConfig: PaymentConfigEntry | null;
  }>;
  defaultFee: PaymentConfigEntry | null;
}

// Lead Types
export interface Lead {
  _id: string;
  enquiryNumber?: string;
  hallTicketNumber?: string;
  name: string;
  phone: string;
  email?: string;
  fatherName: string;
  fatherPhone: string;
  motherName?: string;
  village: string;
  address?: string;
  district: string;
  courseInterested?: string;
  mandal: string;
  state: string;
  quota: string;
  applicationStatus?: string;
  leadStatus?: string;
  admissionNumber?: string;
  gender?: string;
  rank?: number;
  interCollege?: string;
  dynamicFields?: Record<string, any>;
  assignedTo?: User | string;
  assignedAt?: string;
  assignedBy?: User | string;
  source?: string;
  isNRI?: boolean;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  lastFollowUp?: string;
  nextScheduledCall?: string;
  academicYear?: number;
  studentGroup?: string;
  needsManualUpdate?: boolean;
  notes?: string;
  uploadedBy?: User | string;
  uploadBatchId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadUpdatePayload {
  hallTicketNumber?: string;
  name?: string;
  phone?: string;
  email?: string;
  fatherName?: string;
  fatherPhone?: string;
  motherName?: string;
  village?: string;
  address?: string;
  district?: string;
  courseInterested?: string;
  mandal?: string;
  state?: string;
  quota?: string;
  applicationStatus?: string;
  gender?: string;
  rank?: number;
  interCollege?: string;
  leadStatus?: string;
  dynamicFields?: Record<string, any>;
  assignedTo?: string;
  source?: string;
  notes?: string;
  lastFollowUp?: string;
  nextScheduledCall?: string;
  academicYear?: number;
  studentGroup?: string;
}

export interface MessageTemplateVariable {
  key: string;
  label: string;
  defaultValue?: string;
  value?: string;
}

export interface MessageTemplate {
  _id: string;
  name: string;
  dltTemplateId: string;
  language: string;
  content: string;
  description?: string;
  isUnicode?: boolean;
  variables: MessageTemplateVariable[];
  variableCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CommunicationType = 'call' | 'sms';

export type CommunicationStatus = 'pending' | 'success' | 'failed';

export interface CommunicationRecord {
  _id: string;
  leadId: string;
  contactNumber: string;
  type: CommunicationType;
  direction: 'outgoing' | 'incoming';
  status: CommunicationStatus;
  remarks?: string;
  callOutcome?: string;
  durationSeconds?: number;
  template?: {
    templateId?: string;
    dltTemplateId?: string;
    name?: string;
    language?: string;
    originalContent?: string;
    renderedContent?: string;
    variables?: MessageTemplateVariable[];
  };
  providerMessageIds?: string[];
  metadata?: Record<string, any>;
  sentBy: User | string;
  sentAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationHistoryResponse {
  items: CommunicationRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface CommunicationTemplateUsage {
  templateId: string;
  templateName?: string;
  count: number;
}

export interface CommunicationStatsEntry {
  contactNumber: string;
  callCount: number;
  smsCount: number;
  lastContactedAt?: string;
  lastCallAt?: string;
  lastSmsAt?: string;
  templateUsage: CommunicationTemplateUsage[];
}

export interface CommunicationStatsResponse {
  stats: CommunicationStatsEntry[];
}

export type JoiningStatus = 'draft' | 'pending_approval' | 'approved';

export type JoiningDocumentStatus = 'pending' | 'received';

export interface JoiningCourseInfo {
  courseId?: string;
  branchId?: string;
  course?: string;
  branch?: string;
  quota?: string;
}

export interface JoiningStudentInfo {
  name: string;
  aadhaarNumber?: string;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
}

export interface JoiningParentInfo {
  name?: string;
  phone?: string;
  aadhaarNumber?: string;
}

export interface JoiningReservation {
  general: 'oc' | 'ews' | 'bc-a' | 'bc-b' | 'bc-c' | 'bc-d' | 'bc-e' | 'sc' | 'st';
  other?: string[];
}

export interface JoiningCommunicationAddress {
  state?: string;
  doorOrStreet?: string;
  landmark?: string;
  villageOrCity?: string;
  mandal?: string;
  district?: string;
  pinCode?: string;
}

export interface JoiningRelativeAddress extends JoiningCommunicationAddress {
  name?: string;
  relationship?: string;
}

export interface JoiningQualifications {
  ssc?: boolean;
  interOrDiploma?: boolean;
  ug?: boolean;
  mediums?: Array<'english' | 'telugu' | 'other'>;
  otherMediumLabel?: string;
}

export interface JoiningEducationHistory {
  level: 'ssc' | 'inter_diploma' | 'ug' | 'other';
  otherLevelLabel?: string;
  courseOrBranch?: string;
  yearOfPassing?: string;
  institutionName?: string;
  institutionAddress?: string;
  hallTicketNumber?: string;
  totalMarksOrGrade?: string;
  cetRank?: string;
}

export interface JoiningSibling {
  name?: string;
  relation?: string;
  studyingStandard?: string;
  institutionName?: string;
}

export interface JoiningDocuments {
  ssc?: JoiningDocumentStatus;
  inter?: JoiningDocumentStatus;
  ugOrPgCmm?: JoiningDocumentStatus;
  transferCertificate?: JoiningDocumentStatus;
  studyCertificate?: JoiningDocumentStatus;
  aadhaarCard?: JoiningDocumentStatus;
  photos?: JoiningDocumentStatus;
  incomeCertificate?: JoiningDocumentStatus;
  casteCertificate?: JoiningDocumentStatus;
  cetRankCard?: JoiningDocumentStatus;
  cetHallTicket?: JoiningDocumentStatus;
  allotmentLetter?: JoiningDocumentStatus;
  joiningReport?: JoiningDocumentStatus;
  bankPassBook?: JoiningDocumentStatus;
  rationCard?: JoiningDocumentStatus;
}

export interface Joining {
  _id: string;
  leadId?: string; // Made optional to support joinings without leads
  leadData?: any; // Snapshot of lead data stored in joining
  status: JoiningStatus;
  courseInfo: JoiningCourseInfo;
  studentInfo: JoiningStudentInfo;
  parents: {
    father: JoiningParentInfo;
    mother: JoiningParentInfo;
  };
  reservation: JoiningReservation;
  address: {
    communication: JoiningCommunicationAddress;
    relatives: JoiningRelativeAddress[];
  };
  qualifications: JoiningQualifications;
  educationHistory: JoiningEducationHistory[];
  siblings: JoiningSibling[];
  documents: JoiningDocuments;
  draftUpdatedAt?: string;
  submittedAt?: string;
  submittedBy?: User | string;
  approvedAt?: string;
  approvedBy?: User | string;
  paymentSummary?: PaymentSummary;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface JoiningListItem extends Joining {
  lead?: Lead;
}

export interface JoiningListPayload {
  joinings: JoiningListItem[];
  pagination: Pagination;
}

export interface JoiningListResponse {
  success?: boolean;
  message?: string;
  data: JoiningListPayload;
}

export interface OverviewAnalyticsTotals {
  leads: number;
  confirmedLeads: number;
  admittedLeads: number;
  assignedLeads?: number;
  unassignedLeads?: number;
  joinings: {
    draft: number;
    pendingApproval: number;
    approved: number;
  };
  admissions: number;
}

export interface OverviewAnalyticsDailyCount {
  date: string;
  count: number;
}

export interface OverviewAnalyticsDailyStatus {
  date: string;
  total: number;
  statuses: Record<string, number>;
}

export interface OverviewAnalyticsDailyJoining {
  date: string;
  draft: number;
  pending_approval: number;
  approved: number;
}

export interface OverviewAnalyticsResponse {
  totals: OverviewAnalyticsTotals;
  leadStatusBreakdown: Record<string, number>;
  joiningStatusBreakdown: Record<string, number>;
  admissionStatusBreakdown: Record<string, number>;
  daily: {
    leadsCreated: OverviewAnalyticsDailyCount[];
    statusChanges: OverviewAnalyticsDailyStatus[];
    joiningProgress: OverviewAnalyticsDailyJoining[];
    admissions: OverviewAnalyticsDailyCount[];
  };
}

export interface Admission {
  _id: string;
  leadId?: string; // Made optional to support admissions without leads
  joiningId: string;
  admissionNumber: string;
  enquiryNumber?: string; // Enquiry number from lead
  leadData?: any; // Snapshot of lead data stored in admission
  status: 'active' | 'withdrawn';
  admissionDate: string;
  courseInfo: JoiningCourseInfo;
  studentInfo: JoiningStudentInfo;
  parents: {
    father: JoiningParentInfo;
    mother: JoiningParentInfo;
  };
  reservation: JoiningReservation;
  address: {
    communication: JoiningCommunicationAddress;
    relatives: JoiningRelativeAddress[];
  };
  qualifications: JoiningQualifications;
  educationHistory: JoiningEducationHistory[];
  siblings: JoiningSibling[];
  documents: JoiningDocuments;
  paymentSummary?: PaymentSummary;
  createdAt: string;
  updatedAt: string;
  createdBy?: User | string;
  updatedBy?: User | string;
}

export interface AdmissionListResponse {
  admissions: Array<Admission & { lead: Lead }>;
  pagination: Pagination;
}

export interface LeadUploadData {
  name: string;
  phone: string;
  email?: string;
  fatherName: string;
  fatherPhone: string;
  motherName?: string;
  village: string;
  district: string;
  courseInterested?: string;
  mandal: string;
  state?: string;
  quota?: string;
  applicationStatus?: string;
  gender?: string;
  rank?: number | string;
  interCollege?: string;
  hallTicketNumber?: string;
  dynamicFields?: Record<string, any>;
  [key: string]: any; // For dynamic fields
}

export interface BulkUploadResponse {
  batchId: string;
  total?: number;
  success?: number;
  errors?: number;
  durationMs?: number;
  sheetsProcessed?: string[];
  errorDetails?: Array<{
    sheet?: string;
    row?: number;
    error: string;
  }>;
  message?: string;
}

export interface BulkUploadJobResponse {
  jobId: string;
  uploadId: string;
  batchId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
}

export interface ImportJobStats {
  totalProcessed?: number;
  totalSuccess?: number;
  totalErrors?: number;
  sheetsProcessed?: string[];
  durationMs?: number;
}

export interface ImportJobStatusResponse {
  jobId: string;
  uploadId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  stats?: ImportJobStats;
  message?: string;
  errorDetails?: Array<{
    sheet?: string;
    row?: number;
    error: string;
  }>;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface DeleteJobStats {
  requestedCount: number;
  validCount: number;
  deletedLeadCount: number;
  deletedLogCount: number;
  durationMs: number;
}

export interface DeleteJobResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  requestedCount: number;
  validCount: number;
  message: string;
}

export interface DeleteJobStatusResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  stats?: DeleteJobStats;
  errorDetails?: Array<{
    leadId: string;
    error: string;
  }>;
  message?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
}

export interface BulkUploadInspectResponse {
  uploadToken: string;
  originalName: string;
  size: number;
  fileType: 'excel' | 'csv';
  sheetNames: string[];
  previews: Record<string, LeadUploadData[]>;
  previewAvailable: boolean;
  previewDisabledReason?: string;
  expiresInMs: number;
}

export interface LeadFilters {
  mandal?: string;
  state?: string;
  district?: string;
  quota?: string;
  status?: string;
  leadStatus?: string;
  applicationStatus?: string;
  assignedTo?: string;
  academicYear?: number | string;
  studentGroup?: string;
  search?: string;
  enquiryNumber?: string;
  page?: number;
  limit?: number;
  /** When true, only leads with at least one comment or status update today */
  touchedToday?: boolean;
}

export interface LeadPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface FilterOptions {
  mandals: string[];
  districts: string[];
  states: string[];
  quotas: string[];
  statuses?: string[];
  leadStatuses: string[];
  applicationStatuses: string[];
  academicYears?: number[];
  studentGroups?: string[];
}

export interface OverviewSeriesPoint {
  date: string;
  count: number;
}

export interface OverviewStatusSeriesPoint {
  date: string;
  total: number;
  statuses: Record<string, number>;
}

export interface OverviewJoiningProgressPoint {
  date: string;
  draft: number;
  pending_approval: number;
  approved: number;
}

export interface OverviewAnalytics {
  totals: {
    leads: number;
    confirmedLeads: number;
    admittedLeads: number;
    assignedLeads?: number;
    unassignedLeads?: number;
    joinings: {
      draft: number;
      pendingApproval: number;
      approved: number;
    };
    admissions: number;
  };
  leadStatusBreakdown: Record<string, number>;
  joiningStatusBreakdown: Record<string, number>;
  admissionStatusBreakdown: Record<string, number>;
  daily: {
    leadsCreated: OverviewSeriesPoint[];
    statusChanges: OverviewStatusSeriesPoint[];
    joiningProgress: OverviewJoiningProgressPoint[];
    admissions: OverviewSeriesPoint[];
  };
}

export interface ActivityLog {
  _id: string;
  leadId: string;
  type: 'status_change' | 'comment' | 'follow_up' | 'quota_change' | 'joining_update' | 'field_update';
  oldStatus?: string;
  newStatus?: string;
  comment?: string;
  performedBy: User | string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}
