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
} from '@/types';

// API Base URL - Update this with your backend URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// CRM Backend URL for SSO token verification
export const CRM_BACKEND_URL = process.env.NEXT_PUBLIC_CRM_BACKEND_URL || 'http://localhost:3000';
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

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      Cookies.remove('token');
      Cookies.remove('user');
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/login';
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
  getAll: async (filters?: {
    page?: number;
    limit?: number;
    mandal?: string;
    district?: string;
    state?: string;
    quota?: string;
    leadStatus?: string;
    applicationStatus?: string;
    assignedTo?: string;
    academicYear?: number | string;
    studentGroup?: string;
    search?: string;
    enquiryNumber?: string;
    scheduledOn?: string;
    /** When true, only leads with at least one comment or status update today by current user */
    touchedToday?: boolean;
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
    const response = await api.get(`/leads?${params.toString()}`);
    // Backend returns { success: true, data: { leads: [...], pagination: {...} }, message: "..." }
    // Extract the nested data property for consistency
    return response.data?.data || response.data;
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
  getFilterOptions: async () => {
    const response = await api.get('/leads/filters/options');
    return response.data;
  },
  getAllIds: async (filters?: {
    mandal?: string;
    state?: string;
    district?: string;
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
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.mandal) queryParams.append('mandal', params.mandal);
    if (params?.state) queryParams.append('state', params.state);
    if (params?.academicYear != null && params.academicYear !== '') queryParams.append('academicYear', String(params.academicYear));
    if (params?.studentGroup) queryParams.append('studentGroup', params.studentGroup);
    if (params?.institutionName) queryParams.append('institutionName', params.institutionName);
    if (params?.forBreakdown) queryParams.append('forBreakdown', params.forBreakdown);
    const query = queryParams.toString();
    const response = await api.get(`/leads/assign/stats${query ? `?${query}` : ''}`);
    return response.data;
  },
  getAssignedCountForUser: async (params: { userId: string; mandal?: string; state?: string; academicYear?: number | string; studentGroup?: string }) => {
    const queryParams = new URLSearchParams();
    queryParams.append('userId', params.userId);
    if (params.mandal) queryParams.append('mandal', params.mandal);
    if (params.state) queryParams.append('state', params.state);
    if (params.academicYear != null && params.academicYear !== '') queryParams.append('academicYear', String(params.academicYear));
    if (params.studentGroup) queryParams.append('studentGroup', params.studentGroup);
    const response = await api.get(`/leads/assign/assigned-count?${queryParams.toString()}`);
    return response.data;
  },
  removeAssignments: async (data: {
    userId: string;
    mandal?: string;
    state?: string;
    academicYear?: number | string;
    studentGroup?: string;
    count: number;
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
  getOverviewAnalytics: async (params?: { days?: number; tz?: string; academicYear?: number | string; studentGroup?: string }) => {
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
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const response = await api.get(`/leads/analytics/overview${suffix}`);
    // Backend returns { success: true, data: { ... }, message: "..." }
    // Extract the nested data property for consistency
    return response.data?.data || response.data;
  },
  getUserAnalytics: async (params?: { startDate?: string; endDate?: string; userId?: string; academicYear?: number | string }) => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.academicYear != null && params.academicYear !== '') queryParams.append('academicYear', String(params.academicYear));
    if (params?.userId) queryParams.append('userId', params.userId);
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
  list: async (params?: { includeBranches?: boolean; showInactive?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.includeBranches) queryParams.append('includeBranches', 'true');
    if (params?.showInactive) queryParams.append('showInactive', 'true');
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
};

// Payment Settings API
export const paymentSettingsAPI = {
  listCourseSettings: async (params?: { showInactive?: boolean }) => {
    const queryParams = new URLSearchParams();
    if (params?.showInactive) queryParams.append('showInactive', 'true');
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
  getTemplates: async (filters?: { language?: string; isActive?: boolean; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.language) params.append('language', filters.language);
    if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive));
    if (filters?.search) params.append('search', filters.search);
    const query = params.toString();
    const response = await api.get(`/communications/templates${query ? `?${query}` : ''}`);
    return response.data;
  },
  getActiveTemplates: async (language?: string) => {
    const params = new URLSearchParams();
    if (language) params.append('language', language);
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
    }
  ) => {
    const response = await api.put(`/communications/templates/${id}`, data);
    return response.data;
  },
  deleteTemplate: async (id: string) => {
    const response = await api.delete(`/communications/templates/${id}`);
    return response.data;
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
  getHistory: async (
    leadId: string,
    params?: { page?: number; limit?: number; type?: 'call' | 'sms' }
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
};

// Joining API
export const joiningAPI = {
  list: async (params?: {
    status?: JoiningStatus | JoiningStatus[];
    page?: number;
    limit?: number;
    search?: string;
    leadStatus?: string;
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
  submit: async (leadId: string) => {
    const response = await api.post(`/joinings/${leadId}/submit`);
    return response.data;
  },
  approve: async (leadId: string) => {
    const response = await api.post(`/joinings/${leadId}/approve`);
    return response.data;
  },
};

export const admissionAPI = {
  list: async (params?: { page?: number; limit?: number; search?: string; status?: string }) => {
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
    return response.data;
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
  updateByLeadId: async (leadId: string, data: any) => {
    const response = await api.put(`/admissions/${leadId}`, data);
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
    isAdditionalFee?: boolean;
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
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.userId) queryParams.append('userId', params.userId);
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
  getLeadsAbstract: async (params: { academicYear: number | string; studentGroup?: string; stateId?: string; districtId?: string }) => {
    const queryParams = new URLSearchParams();
    queryParams.append('academicYear', String(params.academicYear));
    if (params.studentGroup) queryParams.append('studentGroup', params.studentGroup);
    if (params.stateId) queryParams.append('stateId', params.stateId);
    if (params.districtId) queryParams.append('districtId', params.districtId);
    const response = await api.get(`/reports/leads-abstract?${queryParams.toString()}`);
    return response.data?.data || response.data;
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
    const data = response.data?.data ?? response.data;
    return Array.isArray(data) ? data : [];
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
    mandal?: string;
    state?: string;
    district?: string;
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
    if (filters?.mandal) params.append('mandal', filters.mandal);
    if (filters?.state) params.append('state', filters.state);
    if (filters?.district) params.append('district', filters.district);
    if (filters?.leadStatus) params.append('leadStatus', filters.leadStatus);
    if (filters?.applicationStatus) params.append('applicationStatus', filters.applicationStatus);
    if (filters?.courseInterested) params.append('courseInterested', filters.courseInterested);
    if (filters?.source) params.append('source', filters.source);
    if (filters?.startDate) params.append('startDate', filters.startDate);
    if (filters?.endDate) params.append('endDate', filters.endDate);
    const response = await api.get(`/manager/leads?${params.toString()}`);
    return response.data?.data || response.data;
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

export default api;


