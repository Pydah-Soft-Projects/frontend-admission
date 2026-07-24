import axios from 'axios';
import Cookies from 'js-cookie';
import type {
  JoiningStatus,
  CoursePaymentSettings,
  CourseFeePayload,
  CashfreeConfigPreview,
  PaymentTransaction,
  LeadUpdatePayload,
  CreateUserData,
  UpdateUserData,
  BulkUploadJobResponse,
  ImportJobStatusResponse,
  DeleteJobStatusResponse,
  LeadFilters,
  JoiningStudentFeeDetails,
} from '@/types';

export type SmsBulkJobReportContext = {
  version?: number;
  studentGroup: string | null;
  district: string | null;
  selectedUsers: { id: string; name: string }[];
  _truncated?: boolean;
};

// API Base URL - MUST be set on the host (e.g. Vercel → Environment Variables).
// If unset in production, the bundle defaults to localhost and API calls fail from real users' browsers.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

if (typeof window !== 'undefined') {
  const host = window.location.hostname;
  const isLocalPage = host === 'localhost' || host === '127.0.0.1';
  const apiPointsToLocal =
    API_BASE_URL.includes('localhost') || API_BASE_URL.includes('127.0.0.1');
  if (!isLocalPage && apiPointsToLocal) {
    console.error(
      '[Admissions API] NEXT_PUBLIC_API_URL is missing or still localhost. Set it on your hosting provider to your public backend base URL (e.g. https://api.example.com/api). Until then, stats and data will not load.'
    );
  }
}

// CRM Backend URL for SSO token verification
export const CRM_BACKEND_URL = process.env.NEXT_PUBLIC_CRM_BACKEND_URL || 'https://pydah-crm-backend.pydah.edu.in';
export const CRM_FRONTEND_URL = process.env.NEXT_PUBLIC_CRM_FRONTEND_URL || 'http://localhost:5173';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add token
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Public (unauthenticated) route prefixes. A 401 from an incidental authenticated
// call on one of these pages must NOT clear cookies or redirect the visitor to
// login — e.g. a student filling the self-registration form opened from a QR code.
const PUBLIC_PATH_PREFIXES = ['/joining/public', '/lead-form', '/s/'];

const isOnPublicPath = () => {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname;
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(prefix)
  );
};

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If 401 Unauthorized
    if (error.response?.status === 401) {
      // Don't redirect if it's a login attempt (user is already trying to login)
      const isLoginRequest = error.config?.url?.includes('/auth/login');
      
      // Don't auto-logout for print proxy errors - these may be external service auth failures
      // The print proxy converts external service 401/403 to 422, so genuine print proxy 401s
      // indicate user session expired, but we want to handle that gracefully without logout
      const isPrintRequest = error.config?.url?.includes('/print/');

      // Never clear session / redirect when the visitor is on a public page.
      const onPublicPath = isOnPublicPath();

      if (!isLoginRequest && !isPrintRequest && !onPublicPath) {
        // Unauthorized on other private routes - clear token and redirect to login
        Cookies.remove('token', { path: '/' });
        Cookies.remove('user', { path: '/' });
        Cookies.remove('accessToken', { path: '/' });
        Cookies.remove('refreshToken', { path: '/' });
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('token');
          window.localStorage.removeItem('user');
          window.localStorage.removeItem('accessToken');
          window.localStorage.removeItem('refreshToken');
          window.sessionStorage.clear();

          // Only redirect if we are not already on the login page to avoid loops/reloads
          if (!window.location.pathname.includes('/auth/login')) {
            window.location.href = '/auth/login';
          }
        }
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: async (credentials: { email: string; password: string }) => {
    const response = await api.post('/auth/login', credentials);
    return response.data;
  },
  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      // Ignore errors during logout
    }
  },
  resetPasswordDirectly: async (mobileNumber: string) => {
    const response = await api.post('/auth/forgot-password/reset-direct', { mobileNumber });
    return response.data;
  },
  checkUser: async (mobileNumber: string) => {
    const response = await api.post('/auth/forgot-password/check-user', { mobileNumber });
    return response.data; // Expect { success: true, data: { exists: true, name: "Name" } }
  },
  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    // Backend returns { success: true, data: {...}, message: "..." }
    // Extract the nested data property for consistency
    return response.data?.data || response.data;
  },
  // SSO Token Verification (calls CRM backend)
  verifySSOToken: async (encryptedToken: string) => {
    const response = await fetch(`${CRM_BACKEND_URL}/auth/verify-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ encryptedToken }),
    });
    return response.json();
  },
  // Create SSO session (calls admissions backend)
  createSSOSession: async (ssoData: {
    userId: string;
    role: string;
    portalId: string;
    ssoToken: string;
  }) => {
    const response = await api.post('/auth/sso-session', ssoData);
    return response.data;
  },
};

// User API
export const userAPI = {
  getAll: async () => {
    const response = await api.get('/users');
    return response.data;
  },
  getAssignable: async () => {
    const response = await api.get('/users/assignable');
    return response.data;
  },
  /** Super Admin only: Get all users' time tracking ON/OFF logs */
  getAllUserLoginLogs: async (params?: {
    page?: number;
    limit?: number;
    userId?: string;
    eventType?: 'tracking_enabled' | 'tracking_disabled';
    startDate?: string;
    endDate?: string;
  }) => {
    const p = new URLSearchParams();
    if (params?.page) p.append('page', String(params.page));
    if (params?.limit) p.append('limit', String(params.limit));
    if (params?.userId) p.append('userId', params.userId);
    if (params?.eventType) p.append('eventType', params.eventType);
    if (params?.startDate) p.append('startDate', params.startDate);
    if (params?.endDate) p.append('endDate', params.endDate);
    const query = p.toString() ? `?${p.toString()}` : '';
    const response = await api.get(`/users/all/login-logs${query}`);
    return response.data?.data ?? response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/users/${id}`);
    return response.data;
  },
  create: async (data: CreateUserData) => {
    const response = await api.post('/users', data);
    return response.data;
  },
  update: async (id: string, data: UpdateUserData) => {
    const response = await api.put(`/users/${id}`, data);
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  },
  searchHrmsEmployees: async (name: string) => {
    const response = await api.get(`/users/hrms/search?name=${encodeURIComponent(name)}`);
    return response.data;
  },
  getHrmsEmployeeByEmpNo: async (empNo: string) => {
    const response = await api.get(`/users/hrms/${encodeURIComponent(empNo)}`);
    return response.data;
  },
  /** When user has hrms_id but no emp_no (e.g. some Student Counselors), resolve org from HRMS employee _id */
  getHrmsEmployeeByMongoId: async (mongoId: string) => {
    const response = await api.get(`/users/hrms/id/${encodeURIComponent(mongoId)}`);
    return response.data;
  },
};

// User Settings API (current user only)
export const userSettingsAPI = {
  getMySettings: async () => {
    const response = await api.get('/users/me/settings');
    return response.data?.data ?? response.data;
  },
  updateMySettings: async (data: { timeTrackingEnabled: boolean }) => {
    const response = await api.put('/users/me/settings', data);
    return response.data?.data ?? response.data;
  },
  updateMyProfile: async (data: { password?: string; name?: string; mobileNumber?: string }) => {
    const response = await api.put('/users/me/profile', data);
    return response.data?.data ?? response.data;
  },
  getMyLoginLogs: async (params?: { page?: number; limit?: number }) => {
    const p = new URLSearchParams();
    if (params?.page) p.append('page', String(params.page));
    if (params?.limit) p.append('limit', String(params.limit));
    const query = p.toString() ? `?${p.toString()}` : '';
    const response = await api.get(`/users/me/login-logs${query}`);
    return response.data?.data ?? response.data;
  },
};

// Lead API
export const leadAPI = {
  getAll: async (filters?: LeadFilters) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (key === 'touchedToday' || key === 'villageInAddress' || key === 'needsUpdate') {
          if (value === true || value === 'true' || value === 1 || value === '1') params.append(key, 'true');
          return;
        }
        if (Array.isArray(value)) {
          value.forEach((v) => {
            if (v !== undefined && v !== null && v !== '') {
              params.append(key, String(v));
            }
          });
        } else if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get(`/leads?${params.toString()}`);

    // Backend returns { success: true, data: { leads: [...], pagination: {...} }, message: "..." }
    // Extract the nested data property for consistency
    return response.data?.data || response.data;
  },
  exportLeads: async (filters?: {
    village?: string;
    mandal?: string;
    district?: string;
    state?: string;
    source?: string;
    quota?: string;
    leadStatus?: string;
    applicationStatus?: string;
    assignedTo?: string;
    academicYear?: number | string;
    studentGroup?: string;
    search?: string;
    enquiryNumber?: string;
    scheduledOn?: string;
    touchedToday?: boolean;
    cycleNumber?: number | string;
  }) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (key === 'touchedToday') {
          if (value === true) params.append(key, 'true');
          return;
        }
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get(`/leads/export?${params.toString()}`, {
      responseType: 'blob',
    });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/leads/${id}`);
    // Backend returns { success: true, data: {...}, message: "..." }
    // Extract the nested data property for consistency
    return response.data?.data || response.data;
  },
  create: async (data: {
    hallTicketNumber?: string;
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
    rank?: number;
    interCollege?: string;
    studentGroup?: string;
    dynamicFields?: Record<string, any>;
    source?: string;
  }) => {
    const response = await api.post('/leads', data);
    return response.data;
  },
  update: async (id: string, data: LeadUpdatePayload) => {
    const response = await api.put(`/leads/${id}`, data);
    return response.data;
  },
  assignToUser: async (id: string, userId: string) => {
    const response = await api.put(`/leads/${id}`, { assignedTo: userId });
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/leads/${id}`);
    return response.data;
  },
  bulkDelete: async (leadIds: string[]) => {
    const response = await api.delete('/leads/bulk', { data: { leadIds } });
    return response.data?.data as { jobId: string; status: string; requestedCount: number; validCount: number; message: string } | undefined;
  },
  getDeleteJobStatus: async (jobId: string) => {
    const response = await api.get(`/leads/delete-jobs/${jobId}`);
    return response.data?.data as DeleteJobStatusResponse | undefined;
  },
  bulkUpload: async (formData: FormData) => {
    const response = await api.post('/leads/bulk-upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    // Backend returns: { success: true, data: { batchId, total, success, errors, ... }, message: "..." }
    return response.data?.data || response.data;
  },
  inspectBulkUpload: async (formData: FormData) => {
    const response = await api.post('/leads/bulk-upload/inspect', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return response.data?.data;
  },
  bulkUpdateLeadGroups: async (formData: FormData) => {
    const response = await api.post('/leads/bulk-group-update', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return response.data?.data || response.data;
  },
  /** Read-only: compare all staged rows to leads (enquiry + name). Does not modify leads. */
  executeGroupSync: async () => {
    const response = await api.post('/leads/execute-group-sync', {});
    return response.data?.data || response.data;
  },
  /** Staging table only — no join to leads (fast). */
  getStagedRows: async () => {
    const response = await api.get('/leads/staged-rows');
    return response.data?.data || response.data;
  },
  getStagedCount: async () => {
    const response = await api.get('/leads/staged-count');
    return response.data?.data || response.data;
  },
  getFilterOptions: async (opts?: { district?: string; mandal?: string; academicYear?: number | string }) => {
    const params = new URLSearchParams();
    if (opts?.district) params.append('district', opts.district);
    if (opts?.mandal) params.append('mandal', opts.mandal);
    if (opts?.academicYear != null && opts.academicYear !== '') {
      params.append('academicYear', String(opts.academicYear));
    }
    const q = params.toString();
    const response = await api.get(`/leads/filters/options${q ? `?${q}` : ''}`);
    return response.data;
  },
  /** One lightweight query + server cache — prefer over getFilterOptions when only `studentGroups` is needed. */
  getStudentGroupFilterOptions: async () => {
    const response = await api.get('/leads/filters/student-groups');
    return response.data?.data || response.data;
  },
  getAllIds: async (filters?: {
    mandal?: string;
    state?: string;
    district?: string;
    source?: string;
    quota?: string;
    leadStatus?: string;
    applicationStatus?: string;
    assignedTo?: string;
    search?: string;
    enquiryNumber?: string;
    /** Exclude leads that were touched today (call, SMS, or activity) by the current user. Used for "next lead" sequence. */
    excludeTouchedToday?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (key === 'excludeTouchedToday') {
          if (value === true) params.append(key, 'true');
          return;
        }
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get(`/leads/ids?${params.toString()}`);
    return response.data;
  },
  getUploadStats: async (batchId: string) => {
    const response = await api.get(`/leads/upload-stats?batchId=${batchId}`);
    return response.data;
  },
  getImportJobStatus: async (jobId: string) => {
    const response = await api.get(`/leads/import-jobs/${jobId}`);
    return response.data?.data as ImportJobStatusResponse | undefined;
  },
  addActivity: async (
    leadId: string,
    data: {
      comment?: string;
      newStatus?: string;
      newQuota?: string;
      type?: 'comment' | 'status_change' | 'quota_change';
      /** call_status | visit_status | lead_status — managers should send call_status or visit_status */
      statusChannel?: 'call_status' | 'visit_status' | 'lead_status';
      /** YYYY-MM-DD: the visit date selected by the PRO. Stored in activity metadata so diary history groups by this date, not the server's NOW(). */
      visitDate?: string;
    },
  ) => {
    const response = await api.post(`/leads/${leadId}/activity`, data);
    return response.data;
  },
  getActivityLogs: async (leadId: string, page?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (page) params.append('page', String(page));
    if (limit) params.append('limit', String(limit));
    const response = await api.get(`/leads/${leadId}/activity?${params.toString()}`);
    return response.data;
  },
  assignLeads: async (data: {
    userId: string;
    mandal?: string;
    state?: string;
    academicYear?: number | string;
    studentGroup?: string;
    count?: number;
    leadIds?: string[];
    assignNow?: boolean;
    institutionName?: string;
    targetDate?: string;
    district?: string;
    village?: string;
    cycleNumber?: number | string;
    source?: string;
    minRank?: number | string;
    maxRank?: number | string;
  }) => {
    const response = await api.post('/leads/assign', data);
    return response.data;
  },
  getAssignmentStats: async (params?: {
    mandal?: string;
    state?: string;
    academicYear?: number | string;
    studentGroup?: string;
    institutionName?: string;
    forBreakdown?: 'school' | 'college';
    district?: string;

    village?: string;
    cycleNumber?: number | string;
    targetRole?: string;
    /** When `district`, requires `state`. When `mandal`, requires `state` and `district`. */
    geoBreakdown?: 'district' | 'mandal';
    /** Skip heavy state/mandal grouped breakdown queries when false. */
    includeBreakdowns?: boolean;
    /** Return only summary counts; skip grouped breakdown queries. */
    summaryOnly?: boolean;
    /** With `forBreakdown`: run only school/college grouped query (no summary COUNT on leads). */
    institutionBreakdownOnly?: boolean;
    source?: string;
    minRank?: number | string;
    maxRank?: number | string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.mandal) queryParams.append('mandal', params.mandal);
    if (params?.village) queryParams.append('village', params.village);
    if (params?.district) queryParams.append('district', params.district);
    if (params?.state) queryParams.append('state', params.state);
    if (params?.academicYear != null && params.academicYear !== '') queryParams.append('academicYear', String(params.academicYear));
    if (params?.studentGroup) queryParams.append('studentGroup', params.studentGroup);
    if (params?.institutionName) queryParams.append('institutionName', params.institutionName);
    if (params?.forBreakdown) queryParams.append('forBreakdown', params.forBreakdown);
    if (params?.cycleNumber != null && params.cycleNumber !== '') queryParams.append('cycleNumber', String(params.cycleNumber));
    if (params?.targetRole) queryParams.append('targetRole', params.targetRole);
    if (params?.geoBreakdown) queryParams.append('geoBreakdown', params.geoBreakdown);
    if (params?.includeBreakdowns === false) queryParams.append('includeBreakdowns', 'false');
    if (params?.summaryOnly === true) queryParams.append('summaryOnly', 'true');
    if (params?.institutionBreakdownOnly === true) queryParams.append('institutionBreakdownOnly', 'true');
    if (params?.source) queryParams.append('source', params.source);
    if (params?.minRank != null && params.minRank !== '') queryParams.append('minRank', String(params.minRank));
    if (params?.maxRank != null && params.maxRank !== '') queryParams.append('maxRank', String(params.maxRank));
    const query = queryParams.toString();
    const response = await api.get(`/leads/assign/stats${query ? `?${query}` : ''}`);
    return response.data;
  },
  getAssignmentPortfolio: async (params: {
    userId: string;
    mandal?: string;
    district?: string;
    state?: string;
    village?: string;
    academicYear?: number | string;
    studentGroup?: string;
    cycleNumber?: number | string;
  }) => {
    const queryParams = new URLSearchParams();
    queryParams.append('userId', String(params.userId).trim());
    if (params.mandal) queryParams.append('mandal', params.mandal);
    if (params.village) queryParams.append('village', params.village);
    if (params.district) queryParams.append('district', params.district);
    if (params.state) queryParams.append('state', params.state);
    if (params.academicYear != null && params.academicYear !== '') {
      queryParams.append('academicYear', String(params.academicYear));
    }
    if (params.studentGroup) queryParams.append('studentGroup', params.studentGroup);
    if (params.cycleNumber != null && params.cycleNumber !== '') {
      queryParams.append('cycleNumber', String(params.cycleNumber));
    }
    const response = await api.get(`/leads/assign/portfolio?${queryParams.toString()}`);
    return response.data?.data ?? response.data;
  },
  getAssignedCountForUser: async (params: {
    userId: string;
    mandal?: string;
    district?: string;
    state?: string;
    village?: string;
    academicYear?: number | string;
    studentGroup?: string;
    cycleNumber?: number | string;
  }): Promise<{ count: number }> => {
    const queryParams = new URLSearchParams();
    queryParams.append('userId', String(params.userId).trim());
    if (params.mandal) queryParams.append('mandal', params.mandal);
    if (params.village) queryParams.append('village', params.village);
    if (params.district) queryParams.append('district', params.district);
    if (params.state) queryParams.append('state', params.state);
    if (params.academicYear != null && params.academicYear !== '') queryParams.append('academicYear', String(params.academicYear));
    if (params.studentGroup) queryParams.append('studentGroup', params.studentGroup);
    if (params.cycleNumber != null && params.cycleNumber !== '') queryParams.append('cycleNumber', String(params.cycleNumber));
    const response = await api.get(`/leads/assign/assigned-count?${queryParams.toString()}`);
    const body = response.data as Record<string, unknown> | undefined;
    // Accept both { success, data: { count } } and any single nested shape (proxies / older clients)
    const inner = body?.data as Record<string, unknown> | undefined;
    const raw =
      inner && typeof inner === 'object' && 'count' in inner
        ? inner.count
        : body && typeof body === 'object' && 'count' in body
          ? body.count
          : 0;
    const n = typeof raw === 'bigint' ? Number(raw) : Number(raw);
    return { count: Number.isFinite(n) ? n : 0 };
  },
  removeAssignments: async (data: {
    userId: string;
    mandal?: string;
    state?: string;
    academicYear?: number | string;
    studentGroup?: string;
    district?: string;
    village?: string;
    cycleNumber?: number | string;
    count: number;
    /** Student Counselor: only unassign leads in these call_status buckets. */
    callStatuses?: string[];
    /** PRO: only unassign leads in these visit_status buckets. */
    visitStatuses?: string[];
    /** Role-agnostic alias (server picks column from user role). */
    statuses?: string[];
  }) => {
    const response = await api.post('/leads/assign/remove', data);
    return response.data;
  },
  getAnalytics: async (userId: string, params?: { academicYear?: number | string; studentGroup?: string; mandal?: string }) => {
    const query = new URLSearchParams();
    if (params?.academicYear != null && params.academicYear !== '') {
      query.append('academicYear', String(params.academicYear));
    }
    if (params?.studentGroup) {
      query.append('studentGroup', params.studentGroup);
    }
    if (params?.mandal) {
      query.append('mandal', params.mandal);
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const response = await api.get(`/leads/analytics/${userId}${suffix}`);
    return response.data;
  },
  getOverviewAnalytics: async (params?: {
    days?: number;
    tz?: string;
    academicYear?: number | string;
    studentGroup?: string;
    source?: string;
    cycleNumber?: number | string;
  }) => {
    const query = new URLSearchParams();
    if (params?.days) {
      query.append('days', String(params.days));
    }
    if (params?.tz) {
      query.append('tz', params.tz);
    }
    if (params?.academicYear != null && params.academicYear !== '') {
      query.append('academicYear', String(params.academicYear));
    }
    if (params?.studentGroup) {
      query.append('studentGroup', params.studentGroup);
    }
    if (params?.source) {
      query.append('source', params.source);
    }
    if (params?.cycleNumber != null && params.cycleNumber !== '') {
      query.append('cycleNumber', String(params.cycleNumber));
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const response = await api.get(`/leads/analytics/overview${suffix}`);
    // Backend returns { success: true, data: { ... }, message: "..." }
    // Extract the nested data property for consistency
    return response.data?.data || response.data;
  },
  getUserAnalytics: async (params?: { 
    startDate?: string; 
    endDate?: string; 
    userId?: string; 
    academicYear?: number | string;
    division?: string;
    department?: string;
    group?: string;
    /** Roster / analytics: filter by `leads.student_group` (communications user-leads). */
    studentGroup?: string;
    /** Roster: only users with current portfolio leads in this `leads.district` (exact). */
    district?: string;
    includeAssignmentDetails?: boolean;
    /** Visit Diary report: lightweight path (visit_status logs + leaves only). */
    visitDiaryOnly?: boolean;
    /** Server-side pagination for heavy user list (e.g. Call Reports → User Performance). */
    page?: number;
    limit?: number;
    /** Matches reports performance filters (name/email contains). */
    perfSearch?: string;
    perfDepartment?: string;
    perfGroup?: string;
    /** Filter employees by HRMS / hydrated division (same as user.division). */
    perfDivision?: string;
    perfRole?: string;
    /** Print: only return matching user list (no heavy analytics). */
    printUsersOnly?: boolean;
    /** User Performance print: allow larger page size and lighter portfolio SQL. */
    printPortfolioReport?: boolean;
    /** Skip cohort summary totals SQL (print / export rows only). */
    skipCohortSummary?: boolean;
    /** Skip server in-memory analytics cache (use after bulk DB fixes e.g. call_status scripts). */
    bypassCache?: boolean;
    /** Heavy reports path skips when true — communications user-leads uses this for a fast roster + lead counts only. */
    rosterOnly?: boolean;
    leadStatus?: string;
    callStatus?: string;
    visitStatus?: string;
    /** Dashboard overview: metrics from current `leads` assignment only (no default date window on activity). */
    currentPortfolioOnly?: boolean;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.academicYear != null && params.academicYear !== '') queryParams.append('academicYear', String(params.academicYear));
    if (params?.userId) queryParams.append('userId', params.userId);
    if (params?.division) queryParams.append('division', params.division);
    if (params?.department) queryParams.append('department', params.department);
    if (params?.group) queryParams.append('group', params.group);
    if (params?.studentGroup != null && params.studentGroup !== '') {
      queryParams.append('studentGroup', String(params.studentGroup));
    }
    if (params?.district != null && params.district !== '') {
      queryParams.append('district', String(params.district));
    }
    if (params?.includeAssignmentDetails) queryParams.append('includeAssignmentDetails', 'true');
    if (params?.visitDiaryOnly) queryParams.append('visitDiaryOnly', 'true');
    if (params?.page != null) queryParams.append('page', String(params.page));
    if (params?.limit != null) queryParams.append('limit', String(params.limit));
    if (params?.perfSearch != null && params.perfSearch !== '') queryParams.append('perfSearch', params.perfSearch);
    if (params?.perfDepartment != null && params.perfDepartment !== '') queryParams.append('perfDepartment', params.perfDepartment);
    if (params?.perfGroup != null && params.perfGroup !== '') queryParams.append('perfGroup', params.perfGroup);
    if (params?.perfDivision != null && params.perfDivision !== '') queryParams.append('perfDivision', params.perfDivision);
    if (params?.perfRole != null && params.perfRole !== '') queryParams.append('perfRole', params.perfRole);
    if (params?.printUsersOnly) queryParams.append('printUsersOnly', 'true');
    if (params?.printPortfolioReport) queryParams.append('printPortfolioReport', 'true');
    if (params?.skipCohortSummary) queryParams.append('skipCohortSummary', 'true');
    if (params?.bypassCache) queryParams.append('bypassCache', 'true');
    if (params?.rosterOnly) queryParams.append('rosterOnly', 'true');
    if (params?.leadStatus) queryParams.append('leadStatus', params.leadStatus);
    if (params?.callStatus) queryParams.append('callStatus', params.callStatus);
    if (params?.visitStatus) queryParams.append('visitStatus', params.visitStatus);
    if (params?.currentPortfolioOnly) queryParams.append('currentPortfolioOnly', 'true');
    const query = queryParams.toString();
    const response = await api.get(`/leads/analytics/users${query ? `?${query}` : ''}`);
    // Backend returns { success: true, data: { users: [...] }, message: "..." }
    // Extract the nested data property for consistency
    return response.data?.data || response.data;
  },
  /** Current user's own call/SMS/activity report (for counsellor dashboard) */
  getMyCallAnalytics: async (params?: { startDate?: string; endDate?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    const query = queryParams.toString();
    const response = await api.get(`/leads/analytics/me${query ? `?${query}` : ''}`);
    return response.data?.data || response.data;
  },
  getMyAssignmentHistory: async () => {
    const response = await api.get('/leads/analytics/me/assignments');
    return response.data?.data || response.data;
  },
  getAssignmentDetailsByDate: async (date: string) => {
    const response = await api.get(`/leads/analytics/me/assignments/details?date=${date}`);
    return response.data?.data;
  },
  // Public lead submission (no auth required)
  submitPublicLead: async (data: {
    hallTicketNumber?: string;
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
    rank?: number;
    interCollege?: string;
    dynamicFields?: Record<string, any>;
    source?: string;
    isNRI?: boolean;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
  }) => {
    // Create a separate axios instance without auth interceptor for public submission
    const publicApi = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const response = await publicApi.post('/leads/public', data);
    return response.data;
  },
  // Public filter options (no auth required)
  getPublicFilterOptions: async () => {
    // Create a separate axios instance without auth interceptor for public access
    const publicApi = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const response = await publicApi.get('/leads/filters/options/public');
    return response.data;
  },
};

// Course & Branch API
export const courseAPI = {
  list: async (params?: {
    includeBranches?: boolean;
    showInactive?: boolean;
    /** Secondary DB `courses.college_id` filter. */
    collegeId?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.includeBranches) queryParams.append('includeBranches', 'true');
    if (params?.showInactive) queryParams.append('showInactive', 'true');
    if (params?.collegeId != null && String(params.collegeId).trim() !== '') {
      queryParams.append('collegeId', String(params.collegeId).trim());
    }
    const query = queryParams.toString();
    const response = await api.get(`/courses${query ? `?${query}` : ''}`);
    return response.data;
  },
  get: async (
    courseId: string,
    params?: { includeBranches?: boolean; showInactive?: boolean }
  ) => {
    const queryParams = new URLSearchParams();
    if (params?.includeBranches) queryParams.append('includeBranches', 'true');
    if (params?.showInactive) queryParams.append('showInactive', 'true');
    const query = queryParams.toString();
    const response = await api.get(`/courses/${courseId}${query ? `?${query}` : ''}`);
    return response.data;
  },
  create: async (data: { name: string; code?: string; description?: string }) => {
    const response = await api.post('/courses', data);
    return response.data;
  },
  update: async (
    courseId: string,
    data: { name?: string; code?: string; description?: string; isActive?: boolean }
  ) => {
    const response = await api.put(`/courses/${courseId}`, data);
    return response.data;
  },
  delete: async (courseId: string) => {
    const response = await api.delete(`/courses/${courseId}`);
    return response.data;
  },
  listBranches: async (params?: { courseId?: string; showInactive?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.courseId) queryParams.append('courseId', params.courseId);
    if (params?.showInactive) queryParams.append('showInactive', 'true');
    const query = queryParams.toString();
    const response = await api.get(`/courses/branches${query ? `?${query}` : ''}`);
    return response.data;
  },
  createBranch: async (
    courseId: string,
    data: { name: string; code?: string; description?: string }
  ) => {
    const response = await api.post(`/courses/${courseId}/branches`, data);
    return response.data;
  },
  updateBranch: async (
    courseId: string,
    branchId: string,
    data: { name?: string; code?: string; description?: string; isActive?: boolean }
  ) => {
    const response = await api.put(`/courses/${courseId}/branches/${branchId}`, data);
    return response.data;
  },
  deleteBranch: async (courseId: string, branchId: string) => {
    const response = await api.delete(`/courses/${courseId}/branches/${branchId}`);
    return response.data;
  },
  /** Distinct program levels from secondary `student_database.courses`. */
  listProgramLevels: async () => {
    const response = await api.get('/courses/program-levels');
    return response.data;
  },
  /** Active quota catalog from secondary `student_database.student_quotas`. */
  listStudentQuotas: async () => {
    const response = await api.get('/courses/student-quotas');
    return response.data;
  },
  /** Certificate / document copy from secondary `settings` for a program level. */
  getCertificateGuidance: async (level: string) => {
    const q = new URLSearchParams();
    q.set('level', level);
    const response = await api.get(`/courses/certificate-guidance?${q.toString()}`);
    return response.data;
  },
  /** College header, course fee QR, and admission contact for admit card print. */
  getAdmitCardAssets: async (courseId: string) => {
    const response = await api.get(`/courses/${courseId}/admit-card-assets`);
    return response.data;
  },
  /** Binary course fee QR (used when the stored image is too large for JSON). */
  getFeeQrImageBlob: async (courseId: string) => {
    const response = await api.get(`/courses/${courseId}/fee-qr-image`, {
      responseType: 'blob',
    });
    return response.data as Blob;
  },
  /** Colleges from secondary DB (same source as courses). */
  listCollegesFromSecondary: async (params?: { showInactive?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.showInactive) queryParams.append('showInactive', 'true');
    const query = queryParams.toString();
    const response = await api.get(`/courses/colleges${query ? `?${query}` : ''}`);
    return response.data;
  },
};

// Payment Settings API
export const paymentSettingsAPI = {
  listCourseSettings: async (params?: {
    showInactive?: boolean;
    /** Secondary DB `courses.college_id` filter. */
    collegeId?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.showInactive) queryParams.append('showInactive', 'true');
    if (params?.collegeId != null && String(params.collegeId).trim() !== '') {
      queryParams.append('collegeId', String(params.collegeId).trim());
    }
    const query = queryParams.toString();
    const response = await api.get(`/payments/settings${query ? `?${query}` : ''}`);
    return response.data;
  },
  getCourseFees: async (courseId: string) => {
    const response = await api.get(`/payments/settings/courses/${courseId}/fees`);
    return response.data;
  },
  upsertCourseFees: async (
    courseId: string,
    data: {
      fees?: Array<{ branchId: string; amount: number }>;
      defaultFee?: number | null;
      currency?: string;
    }
  ) => {
    const response = await api.put(`/payments/settings/courses/${courseId}/fees`, data);
    return response.data;
  },
  deleteFeeConfig: async (courseId: string, configId: string) => {
    const response = await api.delete(`/payments/settings/courses/${courseId}/fees/${configId}`);
    return response.data;
  },
  getCashfreeConfig: async () => {
    const response = await api.get(`/payments/settings/cashfree`);
    return response.data;
  },
  updateCashfreeConfig: async (data: {
    clientId: string;
    clientSecret: string;
    environment?: 'sandbox' | 'production';
    confirmChange?: boolean;
  }) => {
    const response = await api.put(`/payments/settings/cashfree`, data);
    return response.data;
  },
};

// Communications API
export const communicationAPI = {
  getTemplates: async (params?: {
    language?: string;
    isActive?: boolean;
    search?: string;
    templateGroupId?: string;
    category?: 'sms' | 'whatsapp';
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.language) queryParams.append('language', params.language);
    if (params?.isActive !== undefined) queryParams.append('isActive', String(params.isActive));
    if (params?.search) queryParams.append('search', params.search);
    if (params?.templateGroupId) queryParams.append('templateGroupId', params.templateGroupId);
    if (params?.category) queryParams.append('category', params.category);
    const query = queryParams.toString();
    const response = await api.get(`/communications/templates${query ? `?${query}` : ''}`);
    return response.data;
  },
  listTemplateGroups: async () => {
    const response = await api.get('/communications/templates/groups');
    return (response.data?.data ?? response.data) as Array<{
      id: string;
      name: string;
      createdAt?: string;
      updatedAt?: string;
    }>;
  },
  createTemplateGroup: async (body: { name: string }) => {
    const response = await api.post('/communications/templates/groups', body);
    return response.data?.data ?? response.data;
  },
  updateTemplateGroup: async (id: string, body: { name: string }) => {
    const response = await api.put(`/communications/templates/groups/${encodeURIComponent(id)}`, body);
    return response.data?.data ?? response.data;
  },
  deleteTemplateGroup: async (id: string) => {
    const response = await api.delete(`/communications/templates/groups/${encodeURIComponent(id)}`);
    return response.data?.data ?? response.data;
  },
  getActiveTemplates: async (language?: string, category?: 'sms' | 'whatsapp') => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
    if (category) params.append('category', category);
    const query = params.toString();
    const response = await api.get(
      `/communications/templates/active${query ? `?${query}` : ''}`
    );
    return response.data;
  },
  createTemplate: async (data: {
    name: string;
    dltTemplateId: string;
    language: string;
    content: string;
    description?: string;
    isUnicode?: boolean;
    variables?: { key?: string; label?: string; defaultValue?: string }[];
    templateGroupId?: string | null;
  }) => {
    const response = await api.post('/communications/templates', data);
    return response.data;
  },
  updateTemplate: async (
    id: string,
    data: {
      name?: string;
      dltTemplateId?: string;
      language?: string;
      content?: string;
      description?: string;
      isUnicode?: boolean;
      variables?: { key?: string; label?: string; defaultValue?: string }[];
      isActive?: boolean;
      templateGroupId?: string | null;
    }
  ) => {
    const response = await api.put(`/communications/templates/${id}`, data);
    return response.data;
  },
  deleteTemplate: async (id: string) => {
    const response = await api.delete(`/communications/templates/${id}`);
    return response.data;
  },
  hardDeleteTemplate: async (id: string) => {
    const response = await api.delete(`/communications/templates/${id}/hard`);
    return response.data;
  },
  /** Super Admin: send rendered template to one number (no lead / no communications log row). */
  uploadWhatsAppMedia: async (formData: FormData) => {
    const response = await api.post('/communications/whatsapp/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  testTemplateSms: async (
    templateId: string,
    data: { phone: string; variables?: Array<{ key: string; value: string }> }
  ) => {
    const response = await api.post(`/communications/templates/${templateId}/test-sms`, data);
    return response.data?.data ?? response.data;
  },
  logCall: async (
    leadId: string,
    data: { contactNumber: string; remarks?: string; outcome?: string; durationSeconds?: number }
  ) => {
    const response = await api.post(`/communications/lead/${leadId}/call`, data);
    return response.data;
  },
  sendSms: async (
    leadId: string,
    data: {
      contactNumbers: string[];
      templates: Array<{
        templateId: string;
        variables?: { key?: string; value?: string; defaultValue?: string }[];
      }>;
    }
  ) => {
    const response = await api.post(`/communications/lead/${leadId}/sms`, data);
    return response.data;
  },
  sendWhatsApp: async (
    leadId: string,
    data: {
      contactNumbers: string[];
      templateId: string;
      variables?: Record<string, string>;
    }
  ) => {
    const response = await api.post(`/communications/lead/${leadId}/whatsapp`, data);
    return response.data;
  },
  async verifyWhatsAppContact(phone: string) {
    const response = await api.get('/communications/whatsapp/verify', { params: { phone } });
    return response.data;
  },
  async getWhatsAppConversations() {
    const response = await api.get('/communications/whatsapp/conversations');
    return response.data;
  },
  async getWhatsAppMessages(conversationId: string) {
    const response = await api.get(`/communications/whatsapp/conversations/${conversationId}/messages`);
    return response.data;
  },
  async sendWhatsAppChatReply(conversationId: string, text: string) {
    const response = await api.post(`/communications/whatsapp/conversations/${conversationId}/reply`, { text });
    return response.data;
  },
  getHistory: async (
    leadId: string,
    params?: { page?: number; limit?: number; type?: 'call' | 'sms' | 'whatsapp' }
  ) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.type) queryParams.append('type', params.type);
    const query = queryParams.toString();
    const response = await api.get(
      `/communications/lead/${leadId}/history${query ? `?${query}` : ''}`
    );
    return response.data;
  },
  getStats: async (leadId: string) => {
    const response = await api.get(`/communications/lead/${leadId}/stats`);
    return response.data;
  },
  syncWhatsAppTemplates: async () => {
    const response = await api.post('/communications/whatsapp/sync-templates');
    return response.data as { success: boolean; message: string; data: { syncCount: number } };
  },
  /** Super Admin: queue large batch SMS; processes in background (see Communications → SMS job reports). */
  createBulkSmsJob: async (body: {
    source: 'send_to_leads' | 'user_specific_leads';
    templateId: string;
    /** Shown in SMS job reports for user-specific jobs (selected roster users, student group, district). */
    reportContext?: {
      studentGroup?: string | null;
      district?: string | null;
      selectedUsers: Array<{ id: string; name: string }>;
    };
    items: Array<{
      leadId: string;
      leadName?: string;
      contactNumbers: string[];
      variables?: { key: string; value: string; defaultValue?: string }[];
    }>;
  }) => {
    const response = await api.post('/communications/sms-bulk/jobs', body);
    return (response.data?.data ?? response.data) as {
      jobId: string;
      totalItems: number;
      templateName: string;
      message?: string;
    };
  },
  createBulkWhatsAppJob: async (body: {
    source: 'send_to_leads' | 'user_specific_leads';
    templateId: string;
    reportContext?: {
      studentGroup?: string | null;
      district?: string | null;
      selectedUsers: Array<{ id: string; name: string }>;
    };
    items: Array<{
      leadId: string;
      leadName?: string;
      contactNumbers: string[];
      variables?: Record<string, string> | Array<{ key: string, value: string }>;
    }>;
  }) => {
    const response = await api.post('/communications/whatsapp-bulk/jobs', body);
    return (response.data?.data ?? response.data) as {
      jobId: string;
      totalItems: number;
      templateName: string;
      message?: string;
    };
  },
  listBulkSmsJobs: async (params?: { page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const response = await api.get(`/communications/sms-bulk/jobs?${q.toString()}`);
    return (response.data?.data ?? response.data) as {
      items: Array<{
        id: string;
        source: string;
        reportContext?: SmsBulkJobReportContext | null;
        templateName: string | null;
        status: string;
        displayStatus?: string;
        workRemaining?: number;
        totalItems: number;
        doneCount: number;
        successCount: number;
        failCount: number;
        lastError: string | null;
        createdAt: string;
        completedAt: string | null;
      }>;
      pagination: { page: number; limit: number; total: number; pages: number };
    };
  },
  /** Re-queue the worker (re-opens a wrongly “completed” job that still has pending line items). */
  resumeBulkSmsJob: async (id: string) => {
    const response = await api.post(`/communications/sms-bulk/jobs/${id}/resume`);
    return (response.data?.data ?? response.data) as {
      requeued: boolean;
      jobId: string;
      reopened?: boolean;
      completed?: boolean;
      message?: string;
    };
  },
  getBulkSmsJob: async (id: string) => {
    const response = await api.get(`/communications/sms-bulk/jobs/${id}`);
    return (response.data?.data ?? response.data) as {
      job: {
        id: string;
        source: string;
        reportContext?: SmsBulkJobReportContext | null;
        templateName: string | null;
        status: string;
        displayStatus?: string;
        workRemaining?: number;
        totalItems: number;
        doneCount: number;
        successCount: number;
        failCount: number;
        lastError: string | null;
        createdAt: string;
        completedAt: string | null;
      };
      items: Array<{
        id: string;
        leadName: string | null;
        contactNumbers: string[];
        status: string;
        responseText: string | null;
        errorMessage: string | null;
        providerMessageIds?: string[];
        communicationIds: string[];
      }>;
    };
  },
  /** BulkSMSApps: portal username (from env) + live credits from check-balance API v2. */
  getBulkSmsAccountStatus: async () => {
    const response = await api.get('/communications/sms/account');
    return (response.data?.data ?? response.data) as {
      configured: boolean;
      username: string | null;
      senderId: string;
      balanceCredits: number | null;
      balanceRaw: string | null;
      providerMessage: string | null;
    };
  },
};

export type SelfRegistrationLinkApiResponse = {
  data?: {
    path: string;
    publicUrl: string;
    token: string;
    permanent?: boolean;
    expiresAt?: string | null;
    ttlSeconds?: number | null;
    created?: boolean;
    configuredAt?: string;
  };
  message?: string;
};

// Joining API
export const joiningAPI = {
  list: async (params?: {
    status?: JoiningStatus | JoiningStatus[];
    page?: number;
    limit?: number;
    search?: string;
    leadStatus?: string;
    /** When true, only joinings with an enquiry on the lead or `lead_data.enquiryNumber` (joining desk). */
    requireEnquiry?: boolean;
    /** Filter by CRM lead source (e.g. `Self Registration`). */
    source?: string;
    /** Omit joinings whose lead/snapshot source matches this value. */
    excludeSource?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        if (Array.isArray(value)) {
          if (value.length > 0) {
            queryParams.append(key, value.join(','));
          }
          return;
        }
        if (value !== '') {
          queryParams.append(key, String(value));
        }
      });
    }
    const query = queryParams.toString();
    const response = await api.get(`/joinings${query ? `?${query}` : ''}`);
    return response.data;
  },
  getByLeadId: async (leadId: string) => {
    const response = await api.get(`/joinings/${leadId}`);
    return response.data;
  },
  saveDraft: async (leadId: string, data: any) => {
    const response = await api.post(`/joinings/${leadId}`, data);
    return response.data;
  },
  /** Approved joinings only: merge certificate registration extras + student fee lines into joining/admission lead_data. */
  patchStepTwo: async (
    leadId: string,
    data: {
      registrationFormData?: Record<string, unknown>;
      transportDetails?: unknown;
      studentFeeDetails?: unknown;
      documents?: Record<string, unknown>;
    }
  ) => {
    const response = await api.patch(`/joinings/${leadId}/step-two`, data);
    return response.data;
  },
  submit: async (leadId: string) => {
    const response = await api.post(`/joinings/${leadId}/submit`);
    return response.data;
  },
  approve: async (leadId: string) => {
    const response = await api.post(`/joinings/${leadId}/approve`);
    return response.data;
  },
  /** Mint a time-limited public URL to edit a draft joining form (default TTL 5 minutes on server). */
  createPublicEditLink: async (leadId: string) => {
    const response = await api.post(`/joinings/${leadId}/public-edit-link`);
    return response.data as {
      data?: {
        path: string;
        publicUrl: string;
        token: string;
        expiresAt: string;
        ttlSeconds: number;
      };
      message?: string;
    };
  },
  /** Permanent campus self-registration QR/link (get-or-create on first load). */
  getSelfRegistrationLink: async () => {
    const response = await api.get('/joinings/self-registration-link');
    return response.data as SelfRegistrationLinkApiResponse;
  },
  /** Idempotent alias — returns the same permanent link if already configured. */
  createSelfRegistrationLink: async () => {
    const response = await api.post('/joinings/self-registration-link');
    return response.data as SelfRegistrationLinkApiResponse;
  },
  /** Rotates the campus QR (invalidates the previous printed code). */
  regenerateSelfRegistrationLink: async () => {
    const response = await api.post('/joinings/self-registration-link/regenerate');
    return response.data as SelfRegistrationLinkApiResponse;
  },
  createDraftAndPublicLink: async (data: {
    studentName: string;
    studentPhone: string;
    fatherPhone: string;
    fatherName?: string;
    courseInterested: string;
    courseId?: string;
    branchId?: string;
    branch?: string;
    quota?: string;
    programLevel?: string;
    reference1?: string;
  }) => {
    const response = await api.post('/joinings/send-public-link', data);
    return response.data as {
      data?: {
        leadId: string;
        joiningId: string;
        enquiryNumber: string;
        path: string;
        publicUrl: string;
        token: string;
        expiresAt: string;
        ttlSeconds: number;
      };
      message?: string;
    };
  },
  /** Debounced lookup while entering mobiles on Add Joining Form. */
  checkExistingLeadByPhones: async (
    studentPhone: string,
    fatherPhone: string,
    reference1?: string
  ) => {
    const response = await api.get('/joinings/check-existing-lead', {
      params: { studentPhone, fatherPhone, reference1: reference1?.trim() || undefined },
    });
    return response.data as {
      data?: {
        exists: boolean;
        source: string;
        lead?: {
          id: string;
          enquiryNumber: string;
          name: string;
          phone: string;
          fatherPhone: string;
          courseInterested: string;
          quota: string;
          source: string;
          reference1?: string;
          managedCourseId?: string;
          managedBranchId?: string;
        } | null;
      };
      message?: string;
    };
  },
};

export const feeRequestAPI = {
  list: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: 'pending_approval' | 'approved' | 'rejected';
  }) => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        queryParams.append(key, String(value));
      });
    }
    const query = queryParams.toString();
    const response = await api.get(`/fee-requests${query ? `?${query}` : ''}`);
    return response.data;
  },
  getPendingForJoining: async (joiningId: string) => {
    const response = await api.get(`/fee-requests/joining/${joiningId}/pending`);
    return response.data;
  },
  submit: async (data: {
    joiningId: string;
    studentFeeDetails?: JoiningStudentFeeDetails;
    registrationFormData?: { transport_details?: unknown };
  }) => {
    const response = await api.post('/fee-requests/submit', data);
    return response.data;
  },
  approve: async (id: string, reviewerNote?: string) => {
    const response = await api.post(`/fee-requests/${id}/approve`, { reviewerNote });
    return response.data;
  },
  reject: async (id: string, reason?: string) => {
    const response = await api.post(`/fee-requests/${id}/reject`, { reason });
    return response.data;
  },
};

export const admissionAPI = {
  getStats: async (params?: {
    startDate?: string;
    endDate?: string;
    collegeId?: string;
    courseId?: string;
    branchId?: string;
    courseName?: string;
    branchName?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.collegeId) queryParams.append('collegeId', params.collegeId);
    if (params?.courseId) queryParams.append('courseId', params.courseId);
    if (params?.branchId) queryParams.append('branchId', params.branchId);
    if (params?.courseName) queryParams.append('courseName', params.courseName);
    if (params?.branchName) queryParams.append('branchName', params.branchName);
    const query = queryParams.toString();
    const response = await api.get(`/admissions/stats${query ? `?${query}` : ''}`);
    return response.data?.data || response.data;
  },
  upsertBranchIntake: async (payload: {
    courseId: string;
    branchId: string;
    courseName?: string;
    branchName?: string;
    lateralTrack?: number;
    cqIntake?: number | null;
    mqIntake?: number | null;
  }) => {
    const response = await api.put('/admissions/branch-intake', payload);
    return response.data?.data || response.data;
  },
  searchHrmsEmployeesForReference: async (q: string) => {
    const response = await api.get('/admissions/hrms-employees/search', {
      params: { q },
    });
    const payload = response.data?.data ?? response.data;
    return Array.isArray(payload) ? payload : [];
  },
  listReferenceNames: async () => {
    const response = await api.get('/admissions/reference-names');
    const payload = response.data?.data ?? response.data;
    const names = (payload as { names?: string[] })?.names;
    return Array.isArray(names) ? names : [];
  },
  getReferenceNameUsage: async (name: string) => {
    const response = await api.get('/admissions/reference-names/usage', {
      params: { name },
    });
    return (response.data?.data ?? response.data) as {
      name: string;
      admissionsCount: number;
      joiningsCount: number;
      leadsCount: number;
      admissions: Array<{
        id: string;
        admissionNumber: string;
        studentName: string;
        status: string;
        course: string;
        branch: string;
      }>;
      admissionsTruncated: boolean;
    };
  },
  renameReferenceName: async (oldName: string, newName: string) => {
    const response = await api.patch('/admissions/reference-names/rename', { oldName, newName });
    return response.data;
  },
  hideReferenceName: async (name: string, clearRecords = false) => {
    const response = await api.post('/admissions/reference-names/hide', { name, clearRecords });
    return response.data;
  },
  getStatsByReference: async (params?: {
    startDate?: string;
    endDate?: string;
    collegeId?: string;
    courseId?: string;
    branchId?: string;
    courseName?: string;
    branchName?: string;
    status?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, String(value));
        }
      });
    }
    const query = queryParams.toString();
    const response = await api.get(`/admissions/stats/by-reference${query ? `?${query}` : ''}`);
    return response.data?.data || response.data;
  },
  getReferenceAdmissions: async (params?: {
    name?: string;
    referenceKey?: string;
    unspecified?: boolean | string;
    startDate?: string;
    endDate?: string;
    collegeId?: string;
    courseId?: string;
    branchId?: string;
    courseName?: string;
    branchName?: string;
    status?: string;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        if (key === 'unspecified') {
          if (value === true || value === 'true' || value === '1') {
            queryParams.append('unspecified', '1');
          }
          return;
        }
        queryParams.append(key, String(value));
      });
    }
    const query = queryParams.toString();
    const response = await api.get(
      `/admissions/stats/by-reference/admissions${query ? `?${query}` : ''}`
    );
    return response.data?.data || response.data;
  },
  getStatsBySource: async (params?: {
    startDate?: string;
    endDate?: string;
    collegeId?: string;
    courseId?: string;
    branchId?: string;
    courseName?: string;
    branchName?: string;
    status?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, String(value));
        }
      });
    }
    const query = queryParams.toString();
    const response = await api.get(`/admissions/stats/by-source${query ? `?${query}` : ''}`);
    return response.data?.data || response.data;
  },
  getStatsByDate: async (params?: {
    startDate?: string;
    endDate?: string;
    collegeId?: string;
    courseId?: string;
    branchId?: string;
    courseName?: string;
    branchName?: string;
    status?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, String(value));
        }
      });
    }
    const query = queryParams.toString();
    const response = await api.get(`/admissions/stats/by-date${query ? `?${query}` : ''}`);
    return response.data?.data || response.data;
  },
  list: async (params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    collegeId?: string;
    courseId?: string;
    branchId?: string;
    courseName?: string;
    branchName?: string;
    /** Filter by lead source (e.g. `Self Registration`, `Website`). */
    source?: string;
    /** Filter by Year-1 TUI01/OTH1 fee entry: `no_entry` | `has_entry`. */
    feeEntry?: 'no_entry' | 'has_entry' | string;
    /** Filter by stored admission quota label (e.g. `Convenor Quota`). */
    quota?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, String(value));
        }
      });
    }
    const query = queryParams.toString();
    const response = await api.get(`/admissions${query ? `?${query}` : ''}`);
    // Backend returns { success: true, data: { admissions, pagination }, message }
    // Normalize to return the nested data object like other API helpers do.
    return response.data?.data || response.data;
  },
  getByLeadId: async (leadId: string) => {
    const response = await api.get(`/admissions/${leadId}`);
    return response.data;
  },
  getByJoiningId: async (joiningId: string) => {
    const response = await api.get(`/admissions/joining/${joiningId}`);
    return response.data;
  },
  getById: async (admissionId: string) => {
    const response = await api.get(`/admissions/id/${admissionId}`);
    return response.data;
  },
  updateById: async (admissionId: string, data: any) => {
    const response = await api.put(`/admissions/id/${admissionId}`, data);
    return response.data;
  },
  cancelById: async (admissionId: string, data: { reason: string; approvedBy: string }) => {
    const response = await api.post(`/admissions/id/${admissionId}/cancel`, data);
    return response.data;
  },
  sendConfirmationSms: async (admissionId: string) => {
    const response = await api.post(`/admissions/id/${admissionId}/send-confirmation-sms`);
    return response.data;
  },
  sendDocumentNotificationSms: async (admissionId: string, selectedDocuments?: string[]) => {
    const response = await api.post(`/admissions/id/${admissionId}/send-document-notification`, { selectedDocuments });
    return response.data;
  },
  /** Bulk Important Documents pending SMS for selected admissions. */
  sendDocumentNotificationSmsBulk: async (admissionIds: string[]) => {
    const response = await api.post(`/admissions/send-document-notification-bulk`, { admissionIds });
    return response.data;
  },
  updateByLeadId: async (leadId: string, data: any) => {
    const response = await api.put(`/admissions/${leadId}`, data);
    return response.data;
  },
  patchReferenceById: async (admissionId: string, reference1: string) => {
    const response = await api.patch(`/admissions/id/${admissionId}/reference`, { reference1 });
    return response.data;
  },
  patchRemarksById: async (admissionId: string, remarks: string) => {
    const response = await api.patch(`/admissions/id/${admissionId}/remarks`, { remarks });
    return response.data;
  },
  exportAdmissions: async (filters?: {
    search?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    collegeId?: string;
    courseId?: string;
    branchId?: string;
    courseName?: string;
    branchName?: string;
    /** Filter by lead source (e.g. `Self Registration`, `Website`). */
    source?: string;
    /** Filter by stored admission quota label (e.g. `Convenor Quota`). */
    quota?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, String(value));
        }
      });
    }
    const query = queryParams.toString();
    const response = await api.get(`/admissions/export${query ? `?${query}` : ''}`, {
      responseType: 'blob',
    });
    return response.data;
  },
  listPendingCertificates: async (filters?: {
    collegeId?: string;
    courseId?: string;
    courseName?: string;
    branchId?: string;
    branchName?: string;
    startDate?: string;
    endDate?: string;
    quota?: string;
    page?: number;
    limit?: number | 'all';
    /** When true, return every matching pending row (used for Print PDF). */
    all?: boolean;
  }) => {
    const queryParams = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, String(value));
        }
      });
    }
    const query = queryParams.toString();
    const response = await api.get(`/admissions/pending-certificates${query ? `?${query}` : ''}`);
    return (response.data?.data || response.data) as {
      rows: Array<{
        id: string;
        admissionNumber: string;
        studentName: string;
        parentMobile: string;
        studentMobile: string;
        quota: string;
        course: string;
        branch: string;
        programLevel?: string;
        importantDocumentsPending?: string[];
        otherDocumentsPending?: string[];
        pendingCertificates: string[];
        pendingCertificatesText: string;
        importantDocumentsPendingText?: string;
        otherDocumentsPendingText?: string;
      }>;
      pagination: { page: number; pages: number; limit: number; total: number };
      sampleLimit?: number;
      stats: {
        totalStudents: number;
        pendingStudents: number;
        completedStudents: number;
        importantReceivedStudents?: number;
        importantPendingStudents?: number;
        otherPendingStudents?: number;
        otherCompletedStudents?: number;
      };
      total: number;
    };
  },
  exportPendingCertificates: async (filters?: {
    collegeId?: string;
    courseId?: string;
    courseName?: string;
    branchId?: string;
    branchName?: string;
    startDate?: string;
    endDate?: string;
    quota?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, String(value));
        }
      });
    }
    const query = queryParams.toString();
    const response = await api.get(
      `/admissions/pending-certificates/export${query ? `?${query}` : ''}`,
      { responseType: 'blob' }
    );
    return response.data;
  },
  listPendingFees: async (filters?: {
    collegeId?: string;
    courseId?: string;
    courseName?: string;
    branchId?: string;
    branchName?: string;
    startDate?: string;
    endDate?: string;
    quota?: string;
    page?: number;
    limit?: number | 'all';
    /** When true, return every matching pending row (used for Print PDF). */
    all?: boolean;
  }) => {
    const queryParams = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, String(value));
        }
      });
    }
    const query = queryParams.toString();
    const response = await api.get(`/admissions/pending-fees${query ? `?${query}` : ''}`);
    return (response.data?.data || response.data) as {
      rows: Array<{
        id: string;
        admissionNumber: string;
        studentName: string;
        parentMobile: string;
        studentMobile: string;
        quota: string;
        course: string;
        branch: string;
        tuitionPayable: number;
        tuitionPaid: number;
        tuitionPending: number;
        otherPayable?: number;
        otherPaid?: number;
        otherPending?: number;
        totalPayable?: number;
        totalPaid?: number;
        totalPending?: number;
        hasFeeEntry: boolean;
        feeStatus: 'paid' | 'unpaid' | 'no_entry';
        displayAmount: number;
        displayLabel: string;
        feeStatusText: string;
        feeAmountText: string;
      }>;
      pagination: { page: number; pages: number; limit: number; total: number };
      sampleLimit?: number;
      stats: {
        totalStudents: number;
        tuitionPaidStudents: number;
        tuitionUnpaidStudents: number;
        tuitionNoEntryStudents: number;
        tuitionFullySettledStudents?: number;
        pendingStudents: number;
      };
      total: number;
    };
  },
  exportPendingFees: async (filters?: {
    collegeId?: string;
    courseId?: string;
    courseName?: string;
    branchId?: string;
    branchName?: string;
    startDate?: string;
    endDate?: string;
    quota?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, String(value));
        }
      });
    }
    const query = queryParams.toString();
    const response = await api.get(`/admissions/pending-fees/export${query ? `?${query}` : ''}`, {
      responseType: 'blob',
    });
    return response.data;
  },

  /** List minimum fee configs (college + course + quota amounts) from admissions DB. */
  listMinimumFeeConfigs: async (filters?: { collegeId?: string; courseId?: string }) => {
    const queryParams = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, String(value));
        }
      });
    }
    const query = queryParams.toString();
    const response = await api.get(
      `/admissions/minimum-fee-configs${query ? `?${query}` : ''}`
    );
    return (response.data?.data || response.data) as {
      configs: Array<{
        id?: string;
        collegeId: string;
        collegeName: string;
        courseId: string;
        courseName: string;
        quota: string;
        amount: number;
      }>;
      total: number;
    };
  },

  /** Replace quota amounts for one college + course. */
  upsertMinimumFeeConfigsForCourse: async (payload: {
    collegeId: string;
    collegeName: string;
    courseId: string;
    courseName: string;
    entries: Array<{ quota: string; amount: number }>;
  }) => {
    const response = await api.put('/admissions/minimum-fee-configs/course', payload);
    return (response.data?.data || response.data) as {
      configs: Array<{
        id?: string;
        collegeId: string;
        collegeName: string;
        courseId: string;
        courseName: string;
        quota: string;
        amount: number;
      }>;
      total: number;
    };
  },

  clearMinimumFeeConfigsForCourse: async (collegeId: string, courseId: string) => {
    const queryParams = new URLSearchParams({ collegeId, courseId });
    const response = await api.delete(
      `/admissions/minimum-fee-configs/course?${queryParams.toString()}`
    );
    return response.data?.data || response.data;
  },

  clearMinimumFeeConfigsForCollege: async (collegeId: string) => {
    const response = await api.delete(
      `/admissions/minimum-fee-configs/college/${encodeURIComponent(collegeId)}`
    );
    return response.data?.data || response.data;
  },
};

export const feeStructureAPI = {
  /**
   * List fee structures from the fee-management Mongo db (feestructures collection),
   * joined with the matching feeheads doc.
   * Filters are optional — pass at least course/branch/category for relevant rows.
   */
  list: async (params?: {
    course?: string | null;
    branch?: string | null;
    college?: string | null;
    batch?: string | number | null;
    category?: string | null;
    quota?: string | null;
    studentYear?: string | number | null;
    studentStatus?: string | null;
  }) => {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          queryParams.append(key, String(value));
        }
      });
    }
    const query = queryParams.toString();
    const response = await api.get(`/fee-structures${query ? `?${query}` : ''}`);
    return response.data;
  },
  options: async () => {
    const response = await api.get(`/fee-structures/options`);
    return response.data;
  },
  feeHeads: async () => {
    const response = await api.get(`/fee-structures/fee-heads`);
    return response.data;
  },
};

export const transportAPI = {
  listRoutes: async () => {
    const response = await api.get('/transport/routes');
    return response.data;
  },
  getRouteDetail: async (routeId: string) => {
    const response = await api.get(`/transport/routes/${encodeURIComponent(routeId)}`);
    return response.data;
  },
  getNextApplicationNumberPreview: async (params: {
    academicYear: string;
    collegeId?: number | null;
    managedCourseId?: number | null;
    courseName?: string | null;
    collegeName?: string | null;
  }) => {
    const query = new URLSearchParams();
    query.append('academicYear', params.academicYear);
    if (params.collegeId) query.append('collegeId', String(params.collegeId));
    if (params.managedCourseId) query.append('managedCourseId', String(params.managedCourseId));
    if (params.courseName) query.append('courseName', params.courseName);
    if (params.collegeName) query.append('collegeName', params.collegeName);
    const response = await api.get(`/transport/next-application-number?${query.toString()}`);
    return response.data;
  },
  getStudentTransportRequest: async (params: {
    admissionNumber: string;
    academicYear?: string | null;
  }) => {
    const query = new URLSearchParams();
    query.append('admissionNumber', params.admissionNumber);
    if (params.academicYear) query.append('academicYear', params.academicYear);
    const response = await api.get(`/transport/requests?${query.toString()}`);
    return response.data;
  },
  cancelTransportRequest: async (params: {
    admissionNumber?: string;
    academicYear?: string;
    requestId?: number;
    joiningId?: string;
    reason: string;
  }) => {
    const response = await api.post('/transport/requests/cancel', {
      admissionNumber: params.admissionNumber,
      academicYear: params.academicYear,
      requestId: params.requestId,
      joiningId: params.joiningId,
      reason: params.reason,
    });
    return response.data;
  },
};

export const hostelAPI = {
  listAcademicYears: async () => {
    const response = await api.get('/hostel/academic-years');
    return response.data;
  },
  listHostels: async () => {
    const response = await api.get('/hostel/hostels');
    return response.data;
  },
  listCategories: async (hostelId: string) => {
    const response = await api.get(`/hostel/categories?hostelId=${encodeURIComponent(hostelId)}`);
    return response.data;
  },
  listRooms: async (params: {
    hostelId: string;
    categoryId: string;
    academicYear?: string;
    course?: string;
    totalYears?: number;
  }) => {
    const query = new URLSearchParams({
      hostelId: params.hostelId,
      categoryId: params.categoryId,
    });
    if (params.academicYear) query.set('academicYear', params.academicYear);
    if (params.course) query.set('course', params.course);
    if (params.totalYears != null) query.set('totalYears', String(params.totalYears));
    const response = await api.get(`/hostel/rooms?${query.toString()}`);
    return response.data;
  },
  getFee: async (params: {
    hostelId: string;
    categoryId: string;
    academicYear: string;
    course?: string;
    totalYears?: number;
  }) => {
    const query = new URLSearchParams({
      hostelId: params.hostelId,
      categoryId: params.categoryId,
      academicYear: params.academicYear,
    });
    if (params.course) query.set('course', params.course);
    if (params.totalYears != null) query.set('totalYears', String(params.totalYears));
    const response = await api.get(`/hostel/fee?${query.toString()}`);
    return response.data;
  },
  getStudentHostelDetails: async (params: {
    admissionNumber?: string;
    joiningId?: string;
    hostelId?: string;
    academicYear?: string;
  }) => {
    const query = new URLSearchParams();
    if (params.admissionNumber) query.append('admissionNumber', params.admissionNumber);
    if (params.joiningId) query.append('joiningId', params.joiningId);
    if (params.hostelId) query.append('hostelId', params.hostelId);
    if (params.academicYear) query.append('academicYear', params.academicYear);
    const response = await api.get(`/hostel/student?${query.toString()}`);
    return response.data;
  },
};

export const paymentAPI = {
  listTransactions: async (params?: {
    leadId?: string;
    admissionId?: string;
    joiningId?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.leadId) queryParams.append('leadId', params.leadId);
    if (params?.admissionId) queryParams.append('admissionId', params.admissionId);
    if (params?.joiningId) queryParams.append('joiningId', params.joiningId);
    const query = queryParams.toString();
    const response = await api.get(`/payments/transactions${query ? `?${query}` : ''}`);
    return response.data;
  },
  recordCashPayment: async (data: {
    leadId?: string;
    joiningId?: string;
    admissionId?: string;
    courseId?: string;
    branchId?: string;
    amount: number;
    currency?: string;
    notes?: string;
    referenceId?: string;
    isAdditionalFee?: boolean;
    // Optional fee-head tagging from Fee Management DB
    feeHead?: string | null;
    feeHeadName?: string;
    feeHeadCode?: string;
    feeStructureBatch?: string;
    feeStructureYear?: number | null;
  }) => {
    const response = await api.post(`/payments/cash`, data);
    return response.data;
  },
  createCashfreeOrder: async (data: {
    leadId?: string;
    joiningId?: string;
    admissionId?: string;
    courseId?: string;
    branchId?: string;
    amount: number;
    currency?: string;
    customer?: {
      customerId?: string;
      name?: string;
      email?: string;
      phone?: string;
      notifyUrl?: string;
    };
    notes?: Record<string, any>;
    isAdditionalFee?: boolean;
    // Optional fee-head tagging from Fee Management DB
    feeHead?: string | null;
    feeHeadName?: string;
    feeHeadCode?: string;
    feeStructureBatch?: string;
    feeStructureYear?: number | null;
  }) => {
    const response = await api.post(`/payments/cashfree/order`, data);
    return response.data;
  },
  verifyCashfreePayment: async (data: { orderId: string }) => {
    const response = await api.post(`/payments/cashfree/verify`, data);
    return response.data;
  },
  reconcilePendingTransactions: async () => {
    const response = await api.post(`/payments/cashfree/reconcile`);
    return response.data;
  },
  getOverallConcessions: async (admissionNumber: string) => {
    const response = await api.get(
      `/payments/overall-concessions?admissionNumber=${encodeURIComponent(admissionNumber)}`
    );
    return response.data;
  },
  listFeeManagementTransactions: async (params: {
    admissionNumber?: string;
    joiningId?: string;
    admissionId?: string;
    studentYear?: number | string | null;
  }) => {
    const query = new URLSearchParams();
    if (params.admissionNumber) query.set('admissionNumber', params.admissionNumber);
    if (params.joiningId) query.set('joiningId', params.joiningId);
    if (params.admissionId) query.set('admissionId', params.admissionId);
    if (params.studentYear != null && String(params.studentYear).trim() !== '') {
      query.set('studentYear', String(params.studentYear));
    }
    const response = await api.get(`/payments/fee-management/transactions?${query.toString()}`);
    return response.data?.data || response.data;
  },
  recordFeeManagementTransaction: async (data: {
    joiningId: string;
    admissionId?: string;
    feeHead: string;
    feeHeadName?: string;
    feeHeadCode?: string;
    amount: number;
    paymentMode: 'Cash' | 'Bank';
    receiptNumber?: string;
    remarks?: string;
    semester?: number | string | null;
    studentYear?: number | string | null;
    paymentConfigId?: string;
    depositedToAccount?: string;
  }) => {
    const response = await api.post('/payments/fee-management/transactions', data);
    return response.data;
  },
  getFeeManagementGlobalAccounts: async () => {
    const response = await api.get('/payments/fee-management/global-accounts');
    return response.data?.data || response.data;
  },
  generateRazorpayQR: async (data: {
    joiningId: string;
    admissionId?: string;
    amount: number;
    feeHeadId?: string;
    feeHeadName?: string;
    feeHeadCode?: string;
    studentYear?: number | string | null;
    semester?: number | string | null;
    targets?: Array<{
      feeHeadId?: string;
      feeHeadName?: string;
      feeHeadCode?: string;
      amount: number;
      studentYear?: number | string | null;
      semester?: number | string | null;
    }>;
  }) => {
    const response = await api.post('/payments/razorpay/qr', data);
    return response.data;
  },
  verifyRazorpayQR: async (data: {
    qrCodeId?: string;
    razorpay_payment_id?: string;
    razorpay_order_id?: string;
    razorpay_signature?: string;
  }) => {
    const response = await api.post('/payments/razorpay/verify-qr', data);
    return response.data;
  },
};

// Notification API
export const notificationAPI = {
  // Get notification configuration
  getConfig: async () => {
    const response = await api.get('/notifications/config');
    return response.data;
  },
  // Update notification configuration
  updateConfig: async (config: {
    email_channel?: 'brevo' | 'nodemailer' | 'both';
    sms_channel?: string;
    push_enabled?: string;
  }) => {
    const response = await api.put('/notifications/config', config);
    return response.data;
  },
  // Test email channels
  testEmailChannels: async (testEmail: string) => {
    const response = await api.post('/notifications/config/test-email', { testEmail });
    return response.data;
  },
  getAll: async (params?: { page?: number; limit?: number; unreadOnly?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    if (params?.unreadOnly) queryParams.append('unreadOnly', String(params.unreadOnly));
    const query = queryParams.toString();
    const response = await api.get(`/notifications${query ? `?${query}` : ''}`);
    return response.data;
  },
  markAsRead: async (id: string) => {
    const response = await api.put(`/notifications/${id}/read`);
    return response.data;
  },
  markAllAsRead: async () => {
    const response = await api.put('/notifications/read-all');
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/notifications/${id}`);
    return response.data;
  },
  getVapidKey: async () => {
    const response = await api.get('/notifications/push/vapid-key');
    return response.data;
  },
  subscribeToPush: async (subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }) => {
    const response = await api.post('/notifications/push/subscribe', { subscription });
    return response.data;
  },
  unsubscribeFromPush: async (endpoint: string) => {
    const response = await api.post('/notifications/push/unsubscribe', { endpoint });
    return response.data;
  },
  sendTestPush: async () => {
    const response = await api.post('/notifications/push/test');
    return response.data;
  },
  // Send test notifications (push and email) to all users
  sendTestNotificationsToAll: async () => {
    const response = await api.post('/notifications/test-all');
    return response.data;
  },
  // Get user's push subscriptions (for debugging)
  getUserSubscriptions: async () => {
    const response = await api.get('/notifications/push/subscriptions');
    return response.data;
  },
};

// Report API
export const reportAPI = {
  getDailyCallReports: async (params?: {
    startDate?: string;
    endDate?: string;
    userId?: string;
    division?: string;
    department?: string;
    /** HRMS employee group (Mongo HRMS); not lead student_group. */
    group?: string;
    /** Lead cohort: `leads.student_group` (MySQL). Inter matches Inter + Inter-%. */
    studentGroup?: string;
    page?: number;
    limit?: number;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.userId) queryParams.append('userId', params.userId);
    if (params?.division) queryParams.append('division', params.division);
    if (params?.department) queryParams.append('department', params.department);
    if (params?.group) queryParams.append('group', params.group);
    if (params?.studentGroup) queryParams.append('studentGroup', params.studentGroup);
    if (params?.page) queryParams.append('page', String(params.page));
    if (params?.limit) queryParams.append('limit', String(params.limit));
    const query = queryParams.toString();
    const response = await api.get(`/reports/calls/daily${query ? `?${query}` : ''}`);
    // Backend returns { success: true, data: { reports: [...], summary: [...] }, message: "..." }
    // Extract the nested data property for consistency
    return response.data?.data || response.data;
  },
  getConversionReports: async (params?: {
    startDate?: string;
    endDate?: string;
    userId?: string;
    period?: 'weekly' | 'monthly' | 'custom';
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.userId) queryParams.append('userId', params.userId);
    if (params?.period) queryParams.append('period', params.period);
    const query = queryParams.toString();
    const response = await api.get(`/reports/conversions${query ? `?${query}` : ''}`);
    // Backend returns { success: true, data: { reports: [...], summary: [...] }, message: "..." }
    // Extract the nested data property for consistency
    return response.data?.data || response.data;
  },
  getLeadsAbstract: async (params: { academicYear: number | string; studentGroup?: string; stateId?: string; districtId?: string; mandalId?: string }) => {
    const queryParams = new URLSearchParams();
    queryParams.append('academicYear', String(params.academicYear));
    if (params.studentGroup) queryParams.append('studentGroup', params.studentGroup);
    if (params.stateId) queryParams.append('stateId', params.stateId);
    if (params.districtId) queryParams.append('districtId', params.districtId);
    if (params.mandalId) queryParams.append('mandalId', params.mandalId);
    const response = await api.get(`/reports/leads-abstract?${queryParams.toString()}`);
    return response.data?.data || response.data;
  },
  getProLeaves: async (params?: { startDate?: string; endDate?: string; userId?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.userId) queryParams.append('userId', params.userId);
    const query = queryParams.toString();
    const response = await api.get(`/leads/pro/leaves${query ? `?${query}` : ''}`);
    return response.data?.data || response.data;
  },
  markProLeave: async (data: { userId: string; date: string; reason?: string }) => {
    const response = await api.post('/leads/pro/leaves', data);
    return response.data;
  },
  deleteProLeave: async (id: string) => {
    const response = await api.delete(`/leads/pro/leaves/${id}`);
    return response.data;
  },
};

// UTM API
export const utmAPI = {
  buildUrl: async (data: {
    baseUrl: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    formId?: string;
  }) => {
    const response = await api.post('/utm/build-url', data);
    return response.data;
  },
  trackClick: async (originalUrl: string) => {
    // Use public API instance since this is a public endpoint
    const publicApi = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const response = await publicApi.post('/utm/track-click', { originalUrl });
    return response.data;
  },
  shortenUrl: async (data: {
    baseUrl: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmTerm?: string;
    utmContent?: string;
    formId?: string;
    shortCode?: string;
    useMeaningfulCode?: boolean;
    expiresAt?: string;
  }) => {
    const response = await api.post('/utm/shorten', data);
    return response.data;
  },
  getAllShortUrls: async (page?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (page) params.append('page', String(page));
    if (limit) params.append('limit', String(limit));
    const response = await api.get(`/utm/short-urls?${params.toString()}`);
    return response.data;
  },
  getUrlAnalytics: async (urlId: string) => {
    const response = await api.get(`/utm/analytics/${urlId}`);
    return response.data;
  },
};

// Form Builder API
export const formBuilderAPI = {
  listForms: async (params?: { showInactive?: boolean; includeFieldCount?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.showInactive) queryParams.append('showInactive', 'true');
    if (params?.includeFieldCount === false) queryParams.append('includeFieldCount', 'false');
    const query = queryParams.toString();
    const response = await api.get(`/form-builder/forms${query ? `?${query}` : ''}`);
    return response.data;
  },
  getForm: async (formId: string, params?: { includeFields?: boolean; showInactive?: boolean; public?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.includeFields === false) queryParams.append('includeFields', 'false');
    if (params?.showInactive) queryParams.append('showInactive', 'true');
    const query = queryParams.toString();

    // Use public endpoint if requested (for lead form page)
    const endpoint = params?.public
      ? `/form-builder/forms/public/${formId}${query ? `?${query}` : ''}`
      : `/form-builder/forms/${formId}${query ? `?${query}` : ''}`;

    // For public endpoint, use public API instance
    if (params?.public) {
      const publicApi = axios.create({
        baseURL: API_BASE_URL,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      const response = await publicApi.get(endpoint);
      return response.data;
    }

    const response = await api.get(endpoint);
    return response.data;
  },
  createForm: async (data: { name: string; description?: string; isDefault?: boolean }) => {
    const response = await api.post('/form-builder/forms', data);
    return response.data;
  },
  updateForm: async (formId: string, data: { name?: string; description?: string; isDefault?: boolean; isActive?: boolean }) => {
    const response = await api.put(`/form-builder/forms/${formId}`, data);
    return response.data;
  },
  deleteForm: async (formId: string) => {
    const response = await api.delete(`/form-builder/forms/${formId}`);
    return response.data;
  },
  listFields: async (formId: string, params?: { showInactive?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.showInactive) queryParams.append('showInactive', 'true');
    const query = queryParams.toString();
    const response = await api.get(`/form-builder/forms/${formId}/fields${query ? `?${query}` : ''}`);
    return response.data;
  },
  createField: async (formId: string, data: {
    fieldName: string;
    fieldType: string;
    fieldLabel: string;
    placeholder?: string;
    isRequired?: boolean;
    validationRules?: Record<string, any>;
    displayOrder?: number;
    options?: Array<{ value: string; label: string }>;
    defaultValue?: string;
    helpText?: string;
  }) => {
    const response = await api.post(`/form-builder/forms/${formId}/fields`, data);
    return response.data;
  },
  updateField: async (fieldId: string, data: {
    fieldName?: string;
    fieldType?: string;
    fieldLabel?: string;
    placeholder?: string;
    isRequired?: boolean;
    validationRules?: Record<string, any>;
    displayOrder?: number;
    options?: Array<{ value: string; label: string }>;
    defaultValue?: string;
    helpText?: string;
    isActive?: boolean;
  }) => {
    const response = await api.put(`/form-builder/fields/${fieldId}`, data);
    return response.data;
  },
  deleteField: async (fieldId: string) => {
    const response = await api.delete(`/form-builder/fields/${fieldId}`);
    return response.data;
  },
  reorderFields: async (formId: string, fieldIds: string[]) => {
    const response = await api.put(`/form-builder/forms/${formId}/fields/reorder`, { fieldIds });
    return response.data;
  },
};

/** Registration form definitions from secondary MySQL (DB_SECONDARY / student_database). Read-only. */
export const registrationFormAPI = {
  listForms: async (params?: { showInactive?: boolean; includeFieldCount?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.showInactive) queryParams.append('showInactive', 'true');
    if (params?.includeFieldCount === false) queryParams.append('includeFieldCount', 'false');
    const query = queryParams.toString();
    const response = await api.get(`/registration-form/forms${query ? `?${query}` : ''}`);
    return response.data;
  },
  getForm: async (formId: string, params?: { includeFields?: boolean; showInactive?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.includeFields === false) queryParams.append('includeFields', 'false');
    if (params?.showInactive) queryParams.append('showInactive', 'true');
    const query = queryParams.toString();
    const response = await api.get(`/registration-form/forms/${formId}${query ? `?${query}` : ''}`);
    return response.data;
  },
};

// Locations API (public read-only for dropdowns - states, districts, mandals from DB)
export const locationsAPI = {
  listStates: async () => {
    const response = await api.get('/locations/states');
    const data = response.data?.data ?? response.data;
    return Array.isArray(data) ? data : [];
  },
  listDistricts: async (params: { stateId?: string; stateName?: string }) => {
    const p = new URLSearchParams();
    if (params?.stateId) p.append('stateId', params.stateId);
    if (params?.stateName) p.append('stateName', params.stateName);
    const q = p.toString() ? `?${p.toString()}` : '';
    const response = await api.get(`/locations/districts${q}`);
    const data = response.data?.data ?? response.data;
    return Array.isArray(data) ? data : [];
  },
  listMandals: async (params: { districtId?: string; stateName?: string; districtName?: string }) => {
    const p = new URLSearchParams();
    if (params?.districtId) p.append('districtId', params.districtId);
    if (params?.stateName) p.append('stateName', params.stateName);
    if (params?.districtName) p.append('districtName', params.districtName);
    const q = p.toString() ? `?${p.toString()}` : '';
    const response = await api.get(`/locations/mandals${q}`);
    const data = response.data?.data ?? response.data;
    return Array.isArray(data) ? data : [];
  },
  listSchools: async () => {
    const response = await api.get('/locations/schools');
    const data = response.data?.data ?? response.data;
    return Array.isArray(data) ? data : [];
  },
  listColleges: async () => {
    const response = await api.get('/locations/colleges');
    return response.data?.data || response.data;
  },
  listVillages: async (params: { stateName: string; districtName: string; mandalName: string }) => {
    const q = new URLSearchParams();
    if (params.stateName) q.append('stateName', params.stateName);
    if (params.districtName) q.append('districtName', params.districtName);
    if (params.mandalName) q.append('mandalName', params.mandalName);
    const response = await api.get(`/locations/villages?${q.toString()}`);
    return response.data?.data || response.data;
  },
};

// Master Data API (states, districts, mandals, schools, colleges)
export const masterDataAPI = {
  // States
  listStates: async (params?: { showInactive?: boolean }) => {
    const q = params?.showInactive ? '?showInactive=true' : '';
    const response = await api.get(`/master-data/states${q}`);
    return response.data;
  },
  getState: async (id: string) => {
    const response = await api.get(`/master-data/states/${id}`);
    return response.data;
  },
  createState: async (data: { name: string; isActive?: boolean; displayOrder?: number }) => {
    const response = await api.post('/master-data/states', data);
    return response.data;
  },
  updateState: async (id: string, data: { name?: string; isActive?: boolean; displayOrder?: number }) => {
    const response = await api.put(`/master-data/states/${id}`, data);
    return response.data;
  },
  deleteState: async (id: string) => {
    const response = await api.delete(`/master-data/states/${id}`);
    return response.data;
  },
  // Districts
  listDistricts: async (params?: { stateId?: string; showInactive?: boolean }) => {
    const p = new URLSearchParams();
    if (params?.stateId) p.append('stateId', params.stateId);
    if (params?.showInactive) p.append('showInactive', 'true');
    const q = p.toString() ? `?${p.toString()}` : '';
    const response = await api.get(`/master-data/districts${q}`);
    return response.data;
  },
  getDistrict: async (id: string) => {
    const response = await api.get(`/master-data/districts/${id}`);
    return response.data;
  },
  createDistrict: async (data: { stateId: string; name: string; isActive?: boolean; displayOrder?: number }) => {
    const response = await api.post('/master-data/districts', data);
    return response.data;
  },
  updateDistrict: async (id: string, data: { stateId?: string; name?: string; isActive?: boolean; displayOrder?: number }) => {
    const response = await api.put(`/master-data/districts/${id}`, data);
    return response.data;
  },
  deleteDistrict: async (id: string) => {
    const response = await api.delete(`/master-data/districts/${id}`);
    return response.data;
  },
  // Mandals
  listMandals: async (params?: { districtId?: string; showInactive?: boolean }) => {
    const p = new URLSearchParams();
    if (params?.districtId) p.append('districtId', params.districtId);
    if (params?.showInactive) p.append('showInactive', 'true');
    const q = p.toString() ? `?${p.toString()}` : '';
    const response = await api.get(`/master-data/mandals${q}`);
    return response.data;
  },
  getMandal: async (id: string) => {
    const response = await api.get(`/master-data/mandals/${id}`);
    return response.data;
  },
  createMandal: async (data: { districtId: string; name: string; isActive?: boolean; displayOrder?: number }) => {
    const response = await api.post('/master-data/mandals', data);
    return response.data;
  },
  updateMandal: async (id: string, data: { districtId?: string; name?: string; isActive?: boolean; displayOrder?: number }) => {
    const response = await api.put(`/master-data/mandals/${id}`, data);
    return response.data;
  },
  deleteMandal: async (id: string) => {
    const response = await api.delete(`/master-data/mandals/${id}`);
    return response.data;
  },
  // Schools
  listSchools: async (params?: { showInactive?: boolean }) => {
    const q = params?.showInactive ? '?showInactive=true' : '';
    const response = await api.get(`/master-data/schools${q}`);
    return response.data;
  },
  createSchool: async (data: { name: string; isActive?: boolean }) => {
    const response = await api.post('/master-data/schools', data);
    return response.data;
  },
  updateSchool: async (id: string, data: { name?: string; isActive?: boolean }) => {
    const response = await api.put(`/master-data/schools/${id}`, data);
    return response.data;
  },
  deleteSchool: async (id: string) => {
    const response = await api.delete(`/master-data/schools/${id}`);
    return response.data;
  },
  bulkCreateSchools: async (names: string[]) => {
    const response = await api.post('/master-data/schools/bulk', { names });
    return response.data;
  },
  // Colleges
  listColleges: async (params?: { showInactive?: boolean }) => {
    const q = params?.showInactive ? '?showInactive=true' : '';
    const response = await api.get(`/master-data/colleges${q}`);
    return response.data;
  },
  createCollege: async (data: { name: string; isActive?: boolean }) => {
    const response = await api.post('/master-data/colleges', data);
    return response.data;
  },
  updateCollege: async (id: string, data: { name?: string; isActive?: boolean }) => {
    const response = await api.put(`/master-data/colleges/${id}`, data);
    return response.data;
  },
  deleteCollege: async (id: string) => {
    const response = await api.delete(`/master-data/colleges/${id}`);
    return response.data;
  },
  bulkCreateColleges: async (names: string[]) => {
    const response = await api.post('/master-data/colleges/bulk', { names });
    return response.data;
  },
};

// Manager API
export const managerAPI = {
  getTeamMembers: async () => {
    const response = await api.get('/manager/team');
    return response.data?.data || response.data;
  },
  getLeads: async (filters?: {
    page?: number;
    limit?: number;
    search?: string;
    enquiryNumber?: string;
    state?: string;
    district?: string;
    mandal?: string;
    village?: string;
    assignedTo?: string;
    leadStatus?: string;
    applicationStatus?: string;
    courseInterested?: string;
    source?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    if (filters?.search) params.append('search', filters.search);
    if (filters?.enquiryNumber) params.append('enquiryNumber', filters.enquiryNumber);
    if (filters?.state) params.append('state', filters.state);
    if (filters?.district) params.append('district', filters.district);
    if (filters?.mandal) params.append('mandal', filters.mandal);
    if (filters?.village) params.append('village', filters.village);
    if (filters?.assignedTo) params.append('assignedTo', filters.assignedTo);
    if (filters?.leadStatus) params.append('leadStatus', filters.leadStatus);
    if (filters?.applicationStatus) params.append('applicationStatus', filters.applicationStatus);
    if (filters?.courseInterested) params.append('courseInterested', filters.courseInterested);
    if (filters?.source) params.append('source', filters.source);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    const response = await api.get(`/manager/leads?${params.toString()}`);
    return response.data?.data || response.data;
  },
  exportLeads: async (filters?: {
    columns?: string[];
    search?: string;
    enquiryNumber?: string;
    state?: string;
    district?: string;
    mandal?: string;
    village?: string;
    assignedTo?: string;
    leadStatus?: string;
    applicationStatus?: string;
    courseInterested?: string;
    source?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.columns?.length) {
      params.append('columns', filters.columns.join(','));
    }
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (key === 'columns') return;
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get(`/manager/leads/export?${params.toString()}`, {
      responseType: 'blob',
    });
    return response.data;
  },
  getAnalytics: async (filters?: { startDate?: string; endDate?: string }) => {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    const response = await api.get(`/manager/analytics?${params.toString()}`);
    return response.data?.data || response.data;
  },
  getUnfollowedLeads: async (days?: number) => {
    const params = new URLSearchParams();
    if (days) params.append('days', String(days));
    const response = await api.get(`/manager/unfollowed-leads?${params.toString()}`);
    return response.data?.data || response.data;
  },
  getTeamAnalytics: async (managerId: string, filters?: { startDate?: string; endDate?: string }) => {
    const params = new URLSearchParams();
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    const response = await api.get(`/manager/team-analytics/${managerId}?${params.toString()}`);
    return response.data?.data || response.data;
  },
  notifyTeam: async (data: {
    userIds: string[];
    message: string;
    subject?: string;
    type?: 'email' | 'push';
  }) => {
    const response = await api.post('/manager/notify-team', data);
    return response.data?.data || response.data;
  },
};

// Visitor API
export const visitorAPI = {
  generateCode: async (leadId: string) => {
    const response = await api.post('/visitors/generate', { leadId });
    return response.data;
  },
  verifyCode: async (code: string) => {
    const response = await api.get(`/visitors/verify/${code}`);
    return response.data;
  },
  consumeCode: async (code: string, leadId: string) => {
    const response = await api.post('/visitors/consume', { code, leadId });
    return response.data;
  },
  getRecent: async () => {
    const response = await api.get('/visitors/recent');
    return response.data;
  },
};

// Print API proxy consumer
export const printAPI = {
  print: async (service: string, params?: Record<string, unknown>, body?: unknown) => {
    const q = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          q.append(key, String(val));
        }
      });
    }
    const queryString = q.toString() ? `?${q.toString()}` : '';
    
    const response = await api.request({
      method: body ? 'POST' : 'GET',
      url: `/print/${service}${queryString}`,
      data: body,
      responseType: 'blob',
    });
    return response.data;
  }
};

export default api;

