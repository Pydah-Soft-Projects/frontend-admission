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
} from '@/types';

// API Base URL - Update this with your backend URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

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
    const response = await api.post('/auth/logout');
    return response.data;
  },
  getCurrentUser: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

// User API
export const userAPI = {
  getAll: async () => {
    const response = await api.get('/users');
    return response.data;
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
    search?: string;
    enquiryNumber?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          params.append(key, String(value));
        }
      });
    }
    const response = await api.get(`/leads?${params.toString()}`);
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/leads/${id}`);
    return response.data;
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
  delete: async (id: string) => {
    const response = await api.delete(`/leads/${id}`);
    return response.data;
  },
  bulkDelete: async (leadIds: string[]) => {
    const response = await api.delete('/leads/bulk', { data: { leadIds } });
    return response.data;
  },
  bulkUpload: async (formData: FormData) => {
    const response = await api.post('/leads/bulk-upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return response.data?.data;
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
  }) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
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
    count: number;
    assignNow?: boolean;
  }) => {
    const response = await api.post('/leads/assign', data);
    return response.data;
  },
  getAnalytics: async (userId: string) => {
    const response = await api.get(`/leads/analytics/${userId}`);
    return response.data;
  },
  getOverviewAnalytics: async (params?: { days?: number; tz?: string }) => {
    const query = new URLSearchParams();
    if (params?.days) {
      query.append('days', String(params.days));
    }
    if (params?.tz) {
      query.append('tz', params.tz);
    }
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const response = await api.get(`/leads/analytics/overview${suffix}`);
    return response.data;
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
    leadId: string;
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
    leadId: string;
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
};

export default api;


