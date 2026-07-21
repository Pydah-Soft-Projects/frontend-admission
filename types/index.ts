// User Types
export type RoleName = 'Super Admin' | 'Sub Super Admin' | 'Student Counselor' | 'Data Entry User' | 'PRO';

export type ModulePermissionLevel = 'read' | 'write';

export interface ModulePermission {
  access: boolean;
  permission: ModulePermissionLevel;
  /** Joining desk: edit Reference 1 on admissions (requires module write). */
  editReference?: boolean;
  /** Joining desk: edit joining / admission records (requires module write). */
  editAdmission?: boolean;
  /** Joining desk: approve or reject fee requests on the Fee Requests page. */
  approveFeeRequest?: boolean;
  /** Limit joining admission edit scope by college id. */
  allowedColleges?: string[];
  /** Admissions page (`/joining/completed`) tab access (requires joining module access). */
  admissionTabAbstract?: boolean;
  admissionTabDetailed?: boolean;
  admissionTabStudentInfo?: boolean;
  admissionTabReference?: boolean;
  admissionTabSource?: boolean;
  admissionTabDateWise?: boolean;
}

export interface User {
  id: string; // Add id (same as _id)
  _id: string;
  name: string;
  email: string;
  mobileNumber?: string | null;
  hrms_id?: string | null;
  emp_no?: string | null;
  roleName: RoleName;
  designation?: string;
  permissions?: Record<string, any>;
  managedBy?: string | User;
  previousRoleName?: string;
  isManager?: boolean;
  isActive: boolean;
  /** When false, User/Counsellor/Manager can only access Settings until they enable tracking */
  timeTrackingEnabled?: boolean;
  autoCallingEnabled?: boolean;
  division?: string;
  department?: string;
  group?: string;
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
  permissions?: Record<string, any>;
  hrms_id?: string;
  emp_no?: string;
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  mobileNumber?: string | null;
  roleName?: RoleName;
  designation?: string;
  password?: string;
  permissions?: Record<string, any>;
  isActive?: boolean;
  isManager?: boolean;
  managedBy?: string | null;
  unassignLeads?: boolean;
  hrms_id?: string | null;
  emp_no?: string | null;
}

// Course & Branch Types
export interface Course {
  _id: string;
  name: string;
  code?: string;
  description?: string;
  /** Secondary `student_database.courses.college_id` → `colleges.id` when present. */
  collegeId?: string | null;
  /** Academic / program level from secondary `courses` (column or metadata). */
  level?: string | null;
  /** Program length in years from secondary `courses.total_years` when available. */
  totalYears?: number | null;
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
  /** Program length in years from secondary `course_branches.total_years` when available. */
  totalYears?: number | null;
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
  /** Year 1 tuition fee head (TUI01) paid amount from Fee Management ledger. */
  tuitionPaid?: number;
  /** Combined Year 1 paid amount for Tuition (TUI01) + Special Fee (OTH1) only. */
  yearOnePaid?: number;
  balance: number;
  currency: string;
  status: PaymentSummaryStatus;
  lastPaymentAt?: string;
}

export type PaymentMode = 'cash' | 'online' | 'upi_qr';

export type PaymentStatus = 'pending' | 'success' | 'failed' | 'cancelled';

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
  // Fee-head tagging (when the payment was recorded against a specific row of the Fee Structure)
  feeHead?: string | null;
  feeHeadName?: string;
  feeHeadCode?: string;
  feeStructureBatch?: string;
  feeStructureYear?: number | null;
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
  alternateMobile?: string;
  email?: string;
  fatherName: string;
  fatherPhone: string;
  motherName?: string;
  motherPhone?: string;
  village: string;
  address?: string;
  district: string;
  courseInterested?: string;
  mandal: string;
  state: string;
  quota: string;
  applicationStatus?: string;
  leadStatus?: string;
  /** Counsellor phone workflow; omitted in API responses for PRO */
  callStatus?: string | null;
  /** PRO field-visit workflow; omitted in API responses for Student Counselor */
  visitStatus?: string | null;
  admissionNumber?: string;
  gender?: string;
  rank?: number;
  interCollege?: string;
  dynamicFields?: Record<string, any>;
  assignedTo?: User | string;
  /** PRO field staff assigned to the lead (superadmin / full lead views) */
  assignedToPro?: User | string;
  confirmedBy?: User | null;
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
  /** True when backend auto-moves a missed yesterday call into today's schedule */
  isYesterdayMissedCall?: boolean;
  /** Original scheduled date (YYYY-MM-DD) before auto-reschedule */
  missedScheduledDate?: string;
  academicYear?: number;
  studentGroup?: string;
  needsManualUpdate?: number;
  notes?: string;
  uploadedBy?: User | string;
  uploadBatchId?: string;
  cycle_number?: number;
  cycleNumber?: number;
  target_date?: string;
  targetDate?: string;
  counsellorTargetDate?: string;
  proTargetDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeadUpdatePayload {
  hallTicketNumber?: string;
  name?: string;
  phone?: string;
  alternateMobile?: string;
  email?: string;
  fatherName?: string;
  fatherPhone?: string;
  motherName?: string;
  motherPhone?: string;
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
  /** Bulk SMS: one shared value for all recipients. Unchecked = per-recipient in the review grid. */
  isGlobal?: boolean;
  value?: string;
}

export interface MessageTemplateGroup {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MessageTemplate {
  _id: string;
  name: string;
  /** Optional folder-style group (admin UI + filtering). */
  templateGroupId?: string | null;
  templateGroupName?: string | null;
  dltTemplateId: string;
  language: string;
  content: string;
  description?: string;
  isUnicode?: boolean;
  variables: MessageTemplateVariable[];
  variableCount: number;
  category: 'sms' | 'whatsapp';
  headerType?: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  headerText?: string;
  headerHandle?: string;
  mediaGallery?: Array<{ name: string; url: string }>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CommunicationType = 'call' | 'sms' | 'whatsapp';

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
  /** Program level from secondary DB; persisted in joining `lead_data._joiningProgramLevel`. */
  programLevel?: string;
}

/** One row inside `settings.certificate_config` JSON (diploma / ug / pg arrays). */
export interface CertificateConfigItem {
  id: string;
  name: string;
  required?: boolean;
  options?: Array<{ value?: string; type?: string } | string>;
}

/** Certificate guidance from secondary `settings` (by program level). */
export interface CertificateGuidance {
  level: string;
  /** Plain HTML/text legacy rows, or structured `certificate_config` from settings. */
  format: 'text' | 'html' | 'certificate_config';
  body?: string;
  matchedRows: number;
  /** Which top-level key matched in certificate_config (e.g. ug, diploma, pg). */
  configKey?: string | null;
  items?: CertificateConfigItem[];
}

export interface JoiningStudentInfo {
  name: string;
  aadhaarNumber?: string;
  phone?: string;
  /** Selected from student / father / mother mobiles for SMS and primary contact. */
  preferredMobileNumber?: string;
  gender?: string;
  dateOfBirth?: string;
}

export interface JoiningParentInfo {
  name?: string;
  phone?: string;
  aadhaarNumber?: string;
  /** Portrait from joining uploads: typically a data URL (`data:image/...;base64,...`), or a URL/filename string. */
  photo?: string;
  /** Parent occupation (dropdown + custom “Others” values). */
  occupation?: string;
}

export interface JoiningReservation {
  general: 'oc' | 'ews' | 'bc-a' | 'bc-b' | 'bc-c' | 'bc-d' | 'bc-e' | 'sc' | 'st';
  isEws?: boolean;
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
  phone?: string;
  /** When true, this relative's mobile is offered in the preferred-mobile dropdown (optional). */
  isGuardian?: boolean;
}

export interface JoiningQualifications {
  ssc?: boolean;
  interOrDiploma?: boolean;
  ug?: boolean;
  /** Yes = true, No = false, not answered = null (persisted as SQL NULL when supported). */
  merit?: boolean | null;
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

/** Per–fee-structure row overrides for a joining (persisted in joinings.lead_data._joiningStudentFeeDetails). */
export interface JoiningStudentFeeLineOverride {
  structureId: string;
  /** Student-specific amount; omit or null to use the catalog (Fee Management) amount. */
  amount?: number | null;
  remarks?: string;
  concessionType?: 'REVISED_FEE' | 'CONCESSION';
  feeHeadId?: string;
  feeHeadCode?: string;
  feeHeadName?: string;
  studentYear?: number;
}

export interface JoiningStudentFeeDetails {
  /** Batch (academic year) the overrides were last edited against — for context only. */
  batch?: string;
  lines: JoiningStudentFeeLineOverride[];
}

/** Bus / hostel selection for Step 3 (persisted in joinings.registrationFormData.transport_details). */
export interface JoiningTransportDetails {
  /** Unset until staff picks bus, hostel, or none. */
  accommodationType?: 'bus' | 'hostel' | 'none';
  routeId?: string;
  routeName?: string;
  stageId?: string;
  stageName?: string;
  stageFare?: number | null;
  /** Assigned bus number (maps to transport_requests.bus_id). */
  busId?: string;
  busNumber?: string;
  academicYear?: string;
  hostelId?: string;
  hostelName?: string;
  hostelType?: 'boys' | 'girls' | 'other';
  categoryId?: string;
  categoryName?: string;
  roomId?: string;
  roomNumber?: string;
  /** Live seat availability count from transport app. */
  busSeatsAvailable?: number;
  /** Legacy first-year amount; kept for backward compatibility. */
  hostelFee?: number | null;
  /** Per student-year hostel fees from HMS `hostelfeestructures`. */
  hostelFeesByYear?: Array<{ studentYear: number; amount: number | null }>;
}

export interface HostelSummary {
  _id: string;
  name: string;
  type: 'boys' | 'girls' | 'other';
  description?: string;
}

export interface HostelCategorySummary {
  _id: string;
  name: string;
  description?: string;
  hostelId: string;
}

export interface HostelRoomSummary {
  _id: string;
  roomNumber: string;
  bedCount: number;
  /** Active student allocations for the requested academic year. */
  studentCount?: number;
  occupiedBeds: number;
  /** Same as occupiedBeds — total beds taken for the academic year session. */
  totalOccupancy?: number;
  availableBeds: number;
  isAvailable: boolean;
  hostelId: string;
  categoryId: string;
}

export interface HostelFeeSummary {
  _id: string;
  amount: number | null;
  course?: string;
  academicYear?: string;
  studentYear?: number | null;
  description?: string;
}

export interface HostelRoomsPayload {
  rooms: HostelRoomSummary[];
  /** Per-year fee rows resolved for the program duration. */
  yearlyFees?: HostelFeeSummary[];
  /** First-year fee (legacy). */
  fee: HostelFeeSummary | null;
  /** Academic year the fee rows were resolved from (may differ from selected year). */
  resolvedAcademicYear?: string;
  feeMatchedBy?: 'exact' | 'fallback' | 'feestructures' | 'none';
  /** Academic year used for occupancy (YYYY-YYYY). */
  academicYear?: string;
  total: number;
  availableCount: number;
}

export interface TransportRouteSummary {
  _id: string;
  routeId: string;
  routeName: string;
  startPoint?: string;
  endPoint?: string;
  totalDistance?: number | null;
  stageCount?: number;
  capacity?: number;
  seatsFilled?: number;
  seatsAvailable?: number;
}

export interface TransportRouteStage {
  _id: string;
  stageName: string;
  distanceFromStart?: number | null;
  fare?: number | null;
}

export interface TransportBusSummary {
  _id: string;
  busNumber: string;
  capacity?: number | null;
  seatsFilled?: number;
  seatsAvailable?: number;
  type?: string;
  driverName?: string;
  attendantName?: string;
  status?: string;
  assignedRouteId?: string;
}

export interface TransportRouteDetail extends TransportRouteSummary {
  estimatedTime?: string;
  stages: TransportRouteStage[];
  buses: TransportBusSummary[];
}

export interface Joining {
  _id: string;
  leadId?: string; // Made optional to support joinings without leads
  leadData?: any; // Snapshot of lead data stored in joining
  /** Extra answers from Form Builder fields not stored on joining columns (persisted in lead_data._joiningRegistrationExtras). */
  registrationFormData?: Record<string, unknown>;
  /** Editable per-head fee amounts/notes for this student (persisted in lead_data._joiningStudentFeeDetails). */
  studentFeeDetails?: JoiningStudentFeeDetails;
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
  /** List/detail when API joins or embeds lead summary (e.g. enquiry # on pipeline). */
  lead?: Pick<
    Lead,
    | 'name'
    | 'phone'
    | 'enquiryNumber'
    | 'hallTicketNumber'
    | 'leadStatus'
    | 'courseInterested'
    | 'mandal'
    | 'district'
    | 'quota'
    | 'fatherPhone'
  >;
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

export type FeeRequestStatus = 'pending_approval' | 'approved' | 'rejected';

export interface FeeRequestLine {
  structureId: string;
  feeHeadName?: string;
  feeHeadCode?: string;
  actualAmount?: number;
  revisedAmount?: number;
  isRevised?: boolean;
  studentYear?: number | null;
}

export interface FeeRequest {
  id: string;
  joiningId: string;
  leadId?: string | null;
  admissionNumber?: string;
  studentName?: string;
  course?: string;
  branch?: string;
  batch?: string;
  status: FeeRequestStatus;
  requestLines: FeeRequestLine[];
  accommodationType?: string | null;
  transportDetails?: JoiningTransportDetails | null;
  studentFeeDetails?: JoiningStudentFeeDetails | null;
  submittedAt?: string | null;
  submittedBy?: string | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectionReason?: string;
  reviewerNote?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FeeRequestListPayload {
  feeRequests: FeeRequest[];
  pagination: Pagination;
}

export interface FeeRequestListResponse {
  success?: boolean;
  message?: string;
  data: FeeRequestListPayload;
}

export interface OverviewAnalyticsTotals {
  leads: number;
  confirmedLeads: number;
  admittedLeads: number;
  assignedLeads?: number;
  assignedLeadsToCounselor?: number;
  assignedLeadsToPro?: number;
  unassignedLeads?: number;
  /** Leads with counselor call_status or PRO visit_status beyond initial "Assigned" */
  callOrVisitDone?: number;
  /** lead_status in Interested, CET Applied */
  interestedLeads?: number;
  joinings: {
    draft: number;
    pendingApproval: number;
    approved: number;
  };
  admissions: number;
  userRoleCounts?: {
    counselors: number;
    pros: number;
    dataEntry: number;
    subAdmins: number;
  };
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
  studentGroupCallsBreakdown?: Record<string, number>;
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
  /** Extra answers from Form Builder fields (copied from joining lead_data._joiningRegistrationExtras). */
  registrationFormData?: Record<string, unknown>;
  /** Per-head fee overrides (from lead_data._joiningStudentFeeDetails when exposed on detail API). */
  studentFeeDetails?: JoiningStudentFeeDetails;
  status: 'active' | 'withdrawn' | 'Admission Cancelled';
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
  /** Excel Reference 1 (from lead_data.reference1 on list API). */
  referenceName?: string;
  /** Lead source / quota label on list API. */
  leadSource?: string;
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
  village?: string | string[];
  /** PRO My Leads: when true with `village`, backend matches text inside address + village + mandal + district + state */
  villageInAddress?: boolean;
  source?: string;
  quota?: string;
  status?: string;
  leadStatus?: string;
  callStatus?: string;
  visitStatus?: string;
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
  needsUpdate?: boolean | number;
  cycleNumber?: number | string;
  targetDate?: string;
  scheduledOn?: string;
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
  villages?: string[];
  states: string[];
  sources?: string[];
  quotas: string[];
  statuses?: string[];
  leadStatuses: string[];
  callStatuses?: string[];
  visitStatuses?: string[];
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
    assignedLeadsToCounselor?: number;
    assignedLeadsToPro?: number;
    unassignedLeads?: number;
    joinings: {
      draft: number;
      pendingApproval: number;
      approved: number;
    };
    admissions: number;
    userRoleCounts?: {
      counselors: number;
      pros: number;
      dataEntry: number;
      subAdmins: number;
    };
    callOrVisitDone?: number;
    interestedLeads?: number;
  };
  leadStatusBreakdown: Record<string, number>;
  studentGroupCallsBreakdown?: Record<string, number>;
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

// Fee Structure (from fee-management Mongo: feestructures + feeheads)
export interface FeeStructureTerm {
  termNumber: number | null;
  percentage: number | null;
  amount: number;
  lateFeeAmount: number;
  dueOffsetDays: number | null;
  dueDescription: string;
}

export interface FeeStructure {
  _id: string;
  id: string;
  category: string;
  course: string;
  branch: string;
  college: string;
  studentYear: number | null;
  semester: number | null;
  batch: string;
  amount: number;
  isScholarshipApplicable: boolean;
  feeHead: string | null;
  feeHeadName: string;
  feeHeadCode: string;
  feeHeadDescription: string;
  terms: FeeStructureTerm[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface FeeHead {
  _id: string;
  id: string;
  name: string;
  code: string;
  description: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface FeeStructureListFilters {
  course?: string | null;
  branch?: string | null;
  college?: string | null;
  batch?: string | null;
  category?: string | null;
  studentYear?: number | null;
}

export interface FeeStructureListPayload {
  data: FeeStructure[];
  filters: FeeStructureListFilters;
  total: number;
}

export interface FeeManagementGlobalAccount {
  _id: string;
  account_name: string;
  bank_name: string;
  account_number: string;
  ifsc_code?: string;
  upi_id?: string;
  is_active: boolean;
  is_global: boolean;
}

