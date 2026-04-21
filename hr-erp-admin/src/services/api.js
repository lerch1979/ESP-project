import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// Base URL for static files (uploads) - strip /api/v1 suffix
export const UPLOADS_BASE_URL = API_BASE_URL.replace(/\/api\/v\d+$/, '');

// Axios instance létrehozása
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - token hozzáadása minden kéréshez
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - automatic token refresh on 401
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Skip refresh logic for auth endpoints
    const url = originalRequest?.url || '';
    if (url.includes('/auth/login') || url.includes('/auth/refresh')) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
        const { token } = response.data.data;

        localStorage.setItem('token', token);
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
        originalRequest.headers.Authorization = `Bearer ${token}`;

        processQueue(null, token);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },
  
  logout: async () => {
    const response = await api.post('/auth/logout');
    return response.data;
  },
  
  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  },
};

// Tickets API
export const ticketsAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/tickets', { params });
    return response.data;
  },
  
  getById: async (id) => {
    const response = await api.get(`/tickets/${id}`);
    return response.data;
  },
  
  create: async (ticketData) => {
    const response = await api.post('/tickets', ticketData);
    return response.data;
  },
  
  updateStatus: async (id, statusData) => {
    const response = await api.patch(`/tickets/${id}/status`, statusData);
    return response.data;
  },
  
  addComment: async (id, commentData) => {
    const response = await api.post(`/tickets/${id}/comments`, commentData);
    return response.data;
  },

  getStatuses: async () => {
    const response = await api.get('/statuses');
    return response.data;
  },

  getCategories: async () => {
    const response = await api.get('/categories');
    return response.data;
  },

  getPriorities: async () => {
    const response = await api.get('/priorities');
    return response.data;
  },
};

// Contractors API
export const contractorsAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/contractors', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/contractors/${id}`);
    return response.data;
  },

  create: async (contractorData) => {
    const response = await api.post('/contractors', contractorData);
    return response.data;
  },

  update: async (id, contractorData) => {
    const response = await api.put(`/contractors/${id}`, contractorData);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/contractors/${id}`);
    return response.data;
  },

  bulkImport: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/contractors/bulk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

// Dashboard API
export const dashboardAPI = {
  getStats: async () => {
    const response = await api.get('/dashboard/stats');
    return response.data;
  },
};

// Accommodations API
export const accommodationsAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/accommodations', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/accommodations/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/accommodations', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/accommodations/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/accommodations/${id}`);
    return response.data;
  },

  getContractorHistory: async (id) => {
    const response = await api.get(`/accommodations/${id}/contractors`);
    return response.data;
  },

  bulkImport: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/accommodations/bulk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

// Rooms API
export const roomsAPI = {
  getByAccommodation: async (accommodationId) => {
    const response = await api.get(`/accommodations/${accommodationId}/rooms`);
    return response.data;
  },
  create: async (accommodationId, data) => {
    const response = await api.post(`/accommodations/${accommodationId}/rooms`, data);
    return response.data;
  },
  update: async (accommodationId, roomId, data) => {
    const response = await api.put(`/accommodations/${accommodationId}/rooms/${roomId}`, data);
    return response.data;
  },
  delete: async (accommodationId, roomId) => {
    const response = await api.delete(`/accommodations/${accommodationId}/rooms/${roomId}`);
    return response.data;
  },
};

// Employees API
export const employeesAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/employees', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/employees/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/employees', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/employees/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/employees/${id}`);
    return response.data;
  },

  getStatuses: async () => {
    const response = await api.get('/employees/statuses');
    return response.data;
  },

  bulkImport: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/employees/bulk', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getTimeline: async (id, params = {}) => {
    const response = await api.get(`/employees/${id}/timeline`, { params });
    return response.data;
  },

  createNote: async (id, data) => {
    const response = await api.post(`/employees/${id}/notes`, data);
    return response.data;
  },

  deleteNote: async (id, noteId) => {
    const response = await api.delete(`/employees/${id}/notes/${noteId}`);
    return response.data;
  },

  uploadPhoto: async (id, file) => {
    const formData = new FormData();
    formData.append('photo', file);
    const response = await api.post(`/employees/${id}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  deletePhoto: async (id) => {
    const response = await api.delete(`/employees/${id}/photo`);
    return response.data;
  },

  getDocuments: async (id) => {
    const response = await api.get(`/employees/${id}/documents`);
    return response.data;
  },

  uploadDocument: async (id, file, documentType, notes) => {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('document_type', documentType);
    if (notes) formData.append('notes', notes);
    const response = await api.post(`/employees/${id}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  deleteDocument: async (docId) => {
    const response = await api.delete(`/employees/documents/${docId}`);
    return response.data;
  },

  bulkUpdateStatus: async (data) => {
    const response = await api.post('/employees/bulk-update', data);
    return response.data;
  },

  bulkDelete: async (data) => {
    const response = await api.post('/employees/bulk-delete', data);
    return response.data;
  },

  bulkExport: async (data) => {
    const response = await api.post('/employees/bulk-export', data, {
      responseType: 'blob',
    });
    return response;
  },
};

// Notifications API
export const notificationsAPI = {
  getTemplates: async () => {
    const response = await api.get('/notifications/templates');
    return response.data;
  },
  getFilterOptions: async () => {
    const response = await api.get('/notifications/filter-options');
    return response.data;
  },
  filterRecipients: async (data) => {
    const response = await api.post('/notifications/filter-recipients', data);
    return response.data;
  },
  sendBulk: async (data) => {
    const response = await api.post('/notifications/send-bulk', data);
    return response.data;
  },
  getEmailLogs: async (params = {}) => {
    const response = await api.get('/notifications/email-logs', { params });
    return response.data;
  },
  testEmail: async (to, template_type) => {
    const response = await api.post('/notifications/test-email', { to, template_type });
    return response.data;
  },
  getTemplateById: async (id) => {
    const response = await api.get(`/notifications/templates/${id}`);
    return response.data;
  },
  createTemplate: async (data) => {
    const response = await api.post('/notifications/templates', data);
    return response.data;
  },
  updateTemplate: async (id, data) => {
    const response = await api.put(`/notifications/templates/${id}`, data);
    return response.data;
  },
  deleteTemplate: async (id) => {
    const response = await api.delete(`/notifications/templates/${id}`);
    return response.data;
  },
  previewTemplate: async (body_html, variables) => {
    const response = await api.post('/notifications/templates/preview', { body_html, variables });
    return response.data;
  },
};

// Reports API
export const reportsAPI = {
  getFilterOptions: async () => {
    const response = await api.get('/reports/filter-options');
    return response.data;
  },
  getEmployeesSummary: async (filters = []) => {
    const response = await api.post('/reports/employees-summary', { filters });
    return response.data;
  },
  getAccommodationsSummary: async (filters = []) => {
    const response = await api.post('/reports/accommodations-summary', { filters });
    return response.data;
  },
  getTicketsSummary: async (filters = []) => {
    const response = await api.post('/reports/tickets-summary', { filters });
    return response.data;
  },
  getContractorsSummary: async (filters = []) => {
    const response = await api.post('/reports/contractors-summary', { filters });
    return response.data;
  },
  getOccupancyDaily: async (params = {}) => {
    const response = await api.get('/reports/occupancy/daily', { params });
    return response.data;
  },
  getOccupancyMonthly: async (params = {}) => {
    const response = await api.get('/reports/occupancy/monthly', { params });
    return response.data;
  },
  getOccupancyRange: async (params = {}) => {
    const response = await api.get('/reports/occupancy/range', { params });
    return response.data;
  },
};

// Calendar API
export const calendarAPI = {
  getEvents: async (params = {}) => {
    const response = await api.get('/calendar/events', { params });
    return response.data;
  },

  // Shifts
  createShift: async (data) => {
    const response = await api.post('/calendar/shifts', data);
    return response.data;
  },
  updateShift: async (id, data) => {
    const response = await api.put(`/calendar/shifts/${id}`, data);
    return response.data;
  },
  deleteShift: async (id) => {
    const response = await api.delete(`/calendar/shifts/${id}`);
    return response.data;
  },

  // Medical Appointments
  createMedicalAppointment: async (data) => {
    const response = await api.post('/calendar/medical-appointments', data);
    return response.data;
  },
  updateMedicalAppointment: async (id, data) => {
    const response = await api.put(`/calendar/medical-appointments/${id}`, data);
    return response.data;
  },
  deleteMedicalAppointment: async (id) => {
    const response = await api.delete(`/calendar/medical-appointments/${id}`);
    return response.data;
  },

  // Personal Events
  createPersonalEvent: async (data) => {
    const response = await api.post('/calendar/personal-events', data);
    return response.data;
  },
  updatePersonalEvent: async (id, data) => {
    const response = await api.put(`/calendar/personal-events/${id}`, data);
    return response.data;
  },
  deletePersonalEvent: async (id) => {
    const response = await api.delete(`/calendar/personal-events/${id}`);
    return response.data;
  },
};

// Google Calendar API
export const googleCalendarAPI = {
  getAuthUrl: async () => {
    const response = await api.get('/calendar/google/auth', { params: { source: 'web' } });
    return response.data;
  },
  getStatus: async () => {
    const response = await api.get('/calendar/google/status');
    return response.data;
  },
  triggerSync: async () => {
    const response = await api.post('/calendar/google/sync');
    return response.data;
  },
  disconnect: async () => {
    const response = await api.delete('/calendar/google/disconnect');
    return response.data;
  },
};

// Documents API
export const documentsAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/documents', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/documents/${id}`);
    return response.data;
  },

  create: async (formData) => {
    const response = await api.post('/documents', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/documents/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/documents/${id}`);
    return response.data;
  },

  download: async (id) => {
    const response = await api.get(`/documents/${id}/download`, {
      responseType: 'blob',
    });
    return response;
  },
};

// Export API
export const exportAPI = {
  employees: (params) => api.get('/export/employees', { params, responseType: 'blob' }),
  contractors: (params) => api.get('/export/contractors', { params, responseType: 'blob' }),
  accommodations: (params) => api.get('/export/accommodations', { params, responseType: 'blob' }),
  tickets: (params) => api.get('/export/tickets', { params, responseType: 'blob' }),
  project: (id) => api.get(`/export/projects/${id}`, { responseType: 'blob' }),
  projectTasksCsv: (id) => api.get(`/export/projects/${id}/tasks-csv`, { responseType: 'blob' }),
};

// Videos API
export const videosAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/videos', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/videos/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/videos', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/videos/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/videos/${id}`);
    return response.data;
  },

  getCategories: async () => {
    const response = await api.get('/videos/categories');
    return response.data;
  },

  recordView: async (id, data = {}) => {
    const response = await api.post(`/videos/${id}/view`, data);
    return response.data;
  },
};

// Search API
export const searchAPI = {
  global: async (q) => {
    const response = await api.get('/search/global', { params: { q } });
    return response.data;
  },
};

// Notification Center API
export const notificationCenterAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/notification-center', { params });
    return response.data;
  },

  markAsRead: async (id) => {
    const response = await api.put(`/notification-center/${id}/read`);
    return response.data;
  },

  markAllAsRead: async () => {
    const response = await api.post('/notification-center/mark-all-read');
    return response.data;
  },

  getUnreadCount: async () => {
    const response = await api.get('/notification-center/unread-count');
    return response.data;
  },
};

// Activity Log API
export const activityLogAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/activity-log', { params });
    return response.data;
  },
  getById: async (id) => {
    const response = await api.get(`/activity-log/${id}`);
    return response.data;
  },
  export: async (params = {}) => {
    const response = await api.get('/activity-log/export', { params, responseType: 'blob' });
    return response;
  },
};

// Scheduled Reports API
export const scheduledReportsAPI = {
  getAll: async () => {
    const response = await api.get('/scheduled-reports');
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/scheduled-reports', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/scheduled-reports/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/scheduled-reports/${id}`);
    return response.data;
  },
  triggerRun: async (id) => {
    const response = await api.post(`/scheduled-reports/${id}/run`);
    return response.data;
  },
  getRunHistory: async (id) => {
    const response = await api.get(`/scheduled-reports/${id}/runs`);
    return response.data;
  },
  toggleActive: async (id) => {
    const response = await api.patch(`/scheduled-reports/${id}/toggle`);
    return response.data;
  },
};

// Preferences API
export const preferencesAPI = {
  getPreferences: async () => {
    const response = await api.get('/preferences');
    return response.data;
  },
  updatePreferences: async (data) => {
    const response = await api.put('/preferences', data);
    return response.data;
  },
};

// Chatbot API
export const chatbotAPI = {
  // Tier 1 - User
  createConversation: async (data = {}) => {
    const response = await api.post('/chatbot/conversations', data);
    return response.data;
  },
  getConversations: async (params = {}) => {
    const response = await api.get('/chatbot/conversations', { params });
    return response.data;
  },
  getMessages: async (conversationId) => {
    const response = await api.get(`/chatbot/conversations/${conversationId}/messages`);
    return response.data;
  },
  sendMessage: async (conversationId, content) => {
    const response = await api.post(`/chatbot/conversations/${conversationId}/messages`, { content });
    return response.data;
  },
  escalateConversation: async (conversationId) => {
    const response = await api.post(`/chatbot/conversations/${conversationId}/escalate`);
    return response.data;
  },
  closeConversation: async (conversationId) => {
    const response = await api.post(`/chatbot/conversations/${conversationId}/close`);
    return response.data;
  },
  getFaqCategories: async () => {
    const response = await api.get('/chatbot/faq/categories');
    return response.data;
  },
  getFaqEntries: async (params = {}) => {
    const response = await api.get('/chatbot/faq/entries', { params });
    return response.data;
  },

  // Tier 2 - Admin
  adminGetConversations: async (params = {}) => {
    const response = await api.get('/chatbot/admin/conversations', { params });
    return response.data;
  },
  adminGetConversationDetail: async (conversationId) => {
    const response = await api.get(`/chatbot/admin/conversations/${conversationId}`);
    return response.data;
  },
  getKnowledgeBase: async (params = {}) => {
    const response = await api.get('/chatbot/admin/knowledge-base', { params });
    return response.data;
  },
  createKnowledgeBaseEntry: async (data) => {
    const response = await api.post('/chatbot/admin/knowledge-base', data);
    return response.data;
  },
  updateKnowledgeBaseEntry: async (id, data) => {
    const response = await api.put(`/chatbot/admin/knowledge-base/${id}`, data);
    return response.data;
  },
  deleteKnowledgeBaseEntry: async (id) => {
    const response = await api.delete(`/chatbot/admin/knowledge-base/${id}`);
    return response.data;
  },
  bulkActionKnowledgeBase: async (action, ids, data = {}) => {
    const response = await api.post('/chatbot/admin/knowledge-base/bulk-action', { action, ids, ...data });
    return response.data;
  },
  getAnalytics: async (params = {}) => {
    const response = await api.get('/chatbot/admin/analytics', { params });
    return response.data;
  },

  // Tier 3 - Superadmin
  getDecisionTrees: async (params = {}) => {
    const response = await api.get('/chatbot/admin/decision-trees', { params });
    return response.data;
  },
  getDecisionTree: async (id) => {
    const response = await api.get(`/chatbot/admin/decision-trees/${id}`);
    return response.data;
  },
  createDecisionTree: async (data) => {
    const response = await api.post('/chatbot/admin/decision-trees', data);
    return response.data;
  },
  updateDecisionTree: async (id, data) => {
    const response = await api.put(`/chatbot/admin/decision-trees/${id}`, data);
    return response.data;
  },
  deleteDecisionTree: async (id) => {
    const response = await api.delete(`/chatbot/admin/decision-trees/${id}`);
    return response.data;
  },
  createDecisionNode: async (data) => {
    const response = await api.post('/chatbot/admin/decision-nodes', data);
    return response.data;
  },
  updateDecisionNode: async (id, data) => {
    const response = await api.put(`/chatbot/admin/decision-nodes/${id}`, data);
    return response.data;
  },
  deleteDecisionNode: async (id) => {
    const response = await api.delete(`/chatbot/admin/decision-nodes/${id}`);
    return response.data;
  },
  adminGetFaqCategories: async (params = {}) => {
    const response = await api.get('/chatbot/admin/faq-categories', { params });
    return response.data;
  },
  createFaqCategory: async (data) => {
    const response = await api.post('/chatbot/admin/faq-categories', data);
    return response.data;
  },
  updateFaqCategory: async (id, data) => {
    const response = await api.put(`/chatbot/admin/faq-categories/${id}`, data);
    return response.data;
  },
  deleteFaqCategory: async (id) => {
    const response = await api.delete(`/chatbot/admin/faq-categories/${id}`);
    return response.data;
  },
  reorderFaqCategories: async (orderedIds) => {
    const response = await api.put('/chatbot/admin/faq-categories/reorder', { orderedIds });
    return response.data;
  },
  toggleFaqCategoryActive: async (id, is_active) => {
    const response = await api.put(`/chatbot/admin/faq-categories/${id}`, { is_active });
    return response.data;
  },
  getConfig: async (params = {}) => {
    const response = await api.get('/chatbot/admin/config', { params });
    return response.data;
  },
  updateConfig: async (data) => {
    const response = await api.put('/chatbot/admin/config', data);
    return response.data;
  },
  getGlobalAnalytics: async () => {
    const response = await api.get('/chatbot/admin/analytics/global');
    return response.data;
  },
  selectSuggestion: async (conversationId, kbId) => {
    const response = await api.post(`/chatbot/conversations/${conversationId}/suggestions`, { kb_id: kbId });
    return response.data;
  },
  sendFeedback: async (messageId, helpful) => {
    const response = await api.post('/chatbot/feedback', { messageId, helpful });
    return response.data;
  },
};

// Users API
export const usersAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/users', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/users/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/users', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/users/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  },

  updateRole: async (id, roleId) => {
    const response = await api.put(`/users/${id}/role`, { roleId });
    return response.data;
  },
};

// Permissions API
export const permissionsAPI = {
  getAll: async () => {
    const response = await api.get('/permissions');
    return response.data;
  },

  getRoles: async () => {
    const response = await api.get('/permissions/roles');
    return response.data;
  },

  createRole: async (data) => {
    const response = await api.post('/permissions/roles', data);
    return response.data;
  },

  updateRolePermissions: async (roleId, permissions) => {
    const response = await api.put(`/permissions/roles/${roleId}/permissions`, { permissions });
    return response.data;
  },

  getUserPermissions: async (userId) => {
    const response = await api.get(`/permissions/users/${userId}`);
    return response.data;
  },

  updateUserPermissions: async (userId, permissions) => {
    const response = await api.put(`/permissions/users/${userId}`, { permissions });
    return response.data;
  },
};

// Email Templates API
export const emailTemplatesAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/email-templates', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/email-templates/${id}`);
    return response.data;
  },

  getBySlug: async (slug) => {
    const response = await api.get(`/email-templates/slug/${slug}`);
    return response.data;
  },

  getTypes: async () => {
    const response = await api.get('/email-templates/types');
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/email-templates', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/email-templates/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/email-templates/${id}`);
    return response.data;
  },

  preview: async (id, variables = {}) => {
    const response = await api.post(`/email-templates/${id}/preview`, { variables });
    return response.data;
  },

  render: async (id, variables = {}) => {
    const response = await api.post(`/email-templates/${id}/render`, { variables });
    return response.data;
  },

  duplicate: async (id, data = {}) => {
    const response = await api.post(`/email-templates/${id}/duplicate`, data);
    return response.data;
  },
};

// Cost Centers API
export const costCentersAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/cost-centers', { params });
    return response.data;
  },

  getTree: async (params = {}) => {
    const response = await api.get('/cost-centers/tree', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/cost-centers/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/cost-centers', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/cost-centers/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/cost-centers/${id}`);
    return response.data;
  },

  getAncestors: async (id) => {
    const response = await api.get(`/cost-centers/${id}/ancestors`);
    return response.data;
  },

  getDescendants: async (id) => {
    const response = await api.get(`/cost-centers/${id}/descendants`);
    return response.data;
  },

  getBudgetSummary: async (id) => {
    const response = await api.get(`/cost-centers/${id}/budget-summary`);
    return response.data;
  },

  move: async (id, newParentId) => {
    const response = await api.post(`/cost-centers/${id}/move`, { new_parent_id: newParentId });
    return response.data;
  },

  // Invoice Categories
  getInvoiceCategories: async () => {
    const response = await api.get('/cost-centers/invoice-categories/list');
    return response.data;
  },

  createInvoiceCategory: async (data) => {
    const response = await api.post('/cost-centers/invoice-categories', data);
    return response.data;
  },

  updateInvoiceCategory: async (id, data) => {
    const response = await api.put(`/cost-centers/invoice-categories/${id}`, data);
    return response.data;
  },

  deleteInvoiceCategory: async (id) => {
    const response = await api.delete(`/cost-centers/invoice-categories/${id}`);
    return response.data;
  },

  // Invoices
  getInvoices: async (params = {}) => {
    const response = await api.get('/cost-centers/invoices/list', { params });
    return response.data;
  },

  getInvoiceById: async (id) => {
    const response = await api.get(`/cost-centers/invoices/${id}`);
    return response.data;
  },

  createInvoice: async (data) => {
    const response = await api.post('/cost-centers/invoices', data);
    return response.data;
  },

  updateInvoice: async (id, data) => {
    const response = await api.put(`/cost-centers/invoices/${id}`, data);
    return response.data;
  },

  deleteInvoice: async (id) => {
    const response = await api.delete(`/cost-centers/invoices/${id}`);
    return response.data;
  },

  getInvoiceStats: async () => {
    const response = await api.get('/cost-centers/invoices/stats');
    return response.data;
  },

  bulkInvoiceAction: async (action, ids) => {
    const response = await api.post('/cost-centers/invoices/bulk-action', { action, ids });
    return response.data;
  },

  uploadInvoiceFile: async (id, formData) => {
    const response = await api.post(`/cost-centers/invoices/${id}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  exportToFolder: async (filters) => {
    const response = await api.post('/cost-centers/invoices/export-to-folder', filters, {
      responseType: 'blob',
      timeout: 120000, // 2 min for large exports
    });
    return response;
  },
};

// Invoice Reports API
export const invoiceReportsAPI = {
  generate: async (filters) => {
    const response = await api.post('/invoice-reports/generate', filters);
    return response.data;
  },
  export: async (filters, format) => {
    const response = await api.post('/invoice-reports/export', { ...filters, format }, {
      responseType: 'blob',
      timeout: 180000, // 3 min for large exports
    });
    return response;
  },
};

// Projects API
export const projectsAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/projects', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/projects/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/projects', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/projects/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/projects/${id}`);
    return response.data;
  },

  getDashboard: async () => {
    const response = await api.get('/projects/dashboard');
    return response.data;
  },

  getTimeline: async (id) => {
    const response = await api.get(`/projects/${id}/timeline`);
    return response.data;
  },

  getBudgetSummary: async (id) => {
    const response = await api.get(`/projects/${id}/budget-summary`);
    return response.data;
  },

  assignTeamMember: async (id, data) => {
    const response = await api.post(`/projects/${id}/team`, data);
    return response.data;
  },

  removeTeamMember: async (id, userId) => {
    const response = await api.delete(`/projects/${id}/team/${userId}`);
    return response.data;
  },
};

// Tasks API
export const tasksAPI = {
  getAll: async (projectId, params = {}) => {
    const response = await api.get(`/projects/${projectId}/tasks`, { params });
    return response.data;
  },

  getMyTasks: async (params = {}) => {
    const response = await api.get('/tasks/my', { params });
    return response.data;
  },

  getMyTasksStats: async () => {
    const response = await api.get('/tasks/my/stats');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/tasks/${id}`);
    return response.data;
  },

  create: async (projectId, data) => {
    const response = await api.post(`/projects/${projectId}/tasks`, data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/tasks/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/tasks/${id}`);
    return response.data;
  },

  updateStatus: async (id, statusData) => {
    const response = await api.put(`/tasks/${id}/status`, statusData);
    return response.data;
  },

  addComment: async (id, data) => {
    const response = await api.post(`/tasks/${id}/comments`, data);
    return response.data;
  },

  addAttachment: async (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/tasks/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  getSubtasks: async (id) => {
    const response = await api.get(`/tasks/${id}/subtasks`);
    return response.data;
  },

  addDependency: async (id, data) => {
    const response = await api.post(`/tasks/${id}/dependencies`, data);
    return response.data;
  },
};

// Timesheets API
export const timesheetsAPI = {
  logHours: async (data) => {
    const response = await api.post('/timesheets', data);
    return response.data;
  },

  getByTask: async (taskId) => {
    const response = await api.get(`/timesheets/task/${taskId}`);
    return response.data;
  },

  getByUser: async (userId, params = {}) => {
    const response = await api.get(`/timesheets/user/${userId}`, { params });
    return response.data;
  },

  getByProject: async (projectId) => {
    const response = await api.get(`/timesheets/project/${projectId}`);
    return response.data;
  },
};

// Assignment Rules API
export const assignmentRulesAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/assignment-rules', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/assignment-rules/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/assignment-rules', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/assignment-rules/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/assignment-rules/${id}`);
    return response.data;
  },

  simulate: async (data) => {
    const response = await api.post('/assignment-rules/simulate', data);
    return response.data;
  },
};

// User Workload API
export const userWorkloadAPI = {
  getAll: async () => {
    const response = await api.get('/user-workload');
    return response.data;
  },

  getByUserId: async (userId) => {
    const response = await api.get(`/user-workload/${userId}`);
    return response.data;
  },

  recalculate: async () => {
    const response = await api.post('/user-workload/recalculate');
    return response.data;
  },

  getSkills: async (params = {}) => {
    const response = await api.get('/user-workload/skills/all', { params });
    return response.data;
  },

  addSkill: async (data) => {
    const response = await api.post('/user-workload/skills', data);
    return response.data;
  },

  removeSkill: async (id) => {
    const response = await api.delete(`/user-workload/skills/${id}`);
    return response.data;
  },
};

// SLA Policies API
export const slaPoliciesAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/sla-policies', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/sla-policies/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/sla-policies', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/sla-policies/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/sla-policies/${id}`);
    return response.data;
  },
};

// Invoice Drafts API (Email Invoice Automation)
export const invoiceDraftsAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/invoice-drafts', { params });
    return response.data;
  },

  getStats: async () => {
    const response = await api.get('/invoice-drafts/stats');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/invoice-drafts/${id}`);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/invoice-drafts/${id}`, data);
    return response.data;
  },

  approve: async (id, data = {}) => {
    const response = await api.post(`/invoice-drafts/${id}/approve`, data);
    return response.data;
  },

  reject: async (id) => {
    const response = await api.post(`/invoice-drafts/${id}/reject`);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/invoice-drafts/${id}`);
    return response.data;
  },

  uploadPDF: async (formData) => {
    const response = await api.post('/invoice-drafts/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  reRunOCR: async (id) => {
    const response = await api.post(`/invoice-drafts/${id}/re-ocr`);
    return response.data;
  },

  pollEmails: async () => {
    const response = await api.post('/invoice-drafts/poll-emails');
    return response.data;
  },
};

// Classification Rules API (invoice auto-classification rules)
export const classificationRulesAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/classification-rules', { params });
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/classification-rules', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/classification-rules/${id}`, data);
    return response.data;
  },

  remove: async (id) => {
    const response = await api.delete(`/classification-rules/${id}`);
    return response.data;
  },

  test: async (data) => {
    const response = await api.post('/classification-rules/test', data);
    return response.data;
  },
};

export const emailInboxAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/email-inbox', { params });
    return response.data;
  },

  getStats: async () => {
    const response = await api.get('/email-inbox/stats');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/email-inbox/${id}`);
    return response.data;
  },

  upload: async (formData) => {
    const response = await api.post('/email-inbox/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  classify: async (id) => {
    const response = await api.post(`/email-inbox/classify/${id}`);
    return response.data;
  },

  route: async (id) => {
    const response = await api.post(`/email-inbox/route/${id}`);
    return response.data;
  },

  reclassify: async (id, documentType) => {
    const response = await api.post(`/email-inbox/reclassify/${id}`, { documentType });
    return response.data;
  },

  reclassifyCostCenter: async (id, notes) => {
    const response = await api.post(`/email-inbox/${id}/reclassify-cost-center`, { notes });
    return response.data;
  },

  getRoutingLog: async (id) => {
    const response = await api.get(`/email-inbox/routing-log/${id}`);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/email-inbox/${id}`);
    return response.data;
  },

  pollEmails: async () => {
    const response = await api.post('/email-inbox/poll-emails');
    return response.data;
  },

  getGmailStatus: async () => {
    const response = await api.get('/email-inbox/gmail-status');
    return response.data;
  },
};

// Invoices API (new invoice module with payments)
export const invoicesAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/invoices', { params });
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/invoices/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/invoices', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/invoices/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/invoices/${id}`);
    return response.data;
  },

  downloadPDF: async (id) => {
    const response = await api.get(`/invoices/${id}/pdf`, { responseType: 'blob' });
    return response;
  },

  sendEmail: async (id, data) => {
    const response = await api.post(`/invoices/${id}/send-email`, data);
    return response.data;
  },

  getPayments: async (invoiceId) => {
    const response = await api.get(`/invoices/${invoiceId}/payments`);
    return response.data;
  },
};

// Payments API
export const paymentsAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/payments', { params });
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/payments', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/payments/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/payments/${id}`);
    return response.data;
  },
};

// Salary Transparency API (Bértranszparencia)
export const salaryAPI = {
  // Salary Bands
  getBands: async (params = {}) => {
    const response = await api.get('/salary/bands', { params });
    return response.data;
  },

  getBandById: async (id) => {
    const response = await api.get(`/salary/bands/${id}`);
    return response.data;
  },

  createBand: async (data) => {
    const response = await api.post('/salary/bands', data);
    return response.data;
  },

  updateBand: async (id, data) => {
    const response = await api.put(`/salary/bands/${id}`, data);
    return response.data;
  },

  deleteBand: async (id) => {
    const response = await api.delete(`/salary/bands/${id}`);
    return response.data;
  },

  // Employee Salaries
  getEmployeeSalaries: async (params = {}) => {
    const response = await api.get('/salary/employees', { params });
    return response.data;
  },

  getEmployeeSalaryById: async (id) => {
    const response = await api.get(`/salary/employees/${id}`);
    return response.data;
  },

  createEmployeeSalary: async (data) => {
    const response = await api.post('/salary/employees', data);
    return response.data;
  },

  updateEmployeeSalary: async (id, data) => {
    const response = await api.put(`/salary/employees/${id}`, data);
    return response.data;
  },

  deleteEmployeeSalary: async (id) => {
    const response = await api.delete(`/salary/employees/${id}`);
    return response.data;
  },

  getEmployeeSalaryHistory: async (employeeId) => {
    const response = await api.get(`/salary/employees/${employeeId}/history`);
    return response.data;
  },

  // Statistics
  getStats: async (params = {}) => {
    const response = await api.get('/salary/stats', { params });
    return response.data;
  },

  getDepartments: async () => {
    const response = await api.get('/salary/departments');
    return response.data;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// WELLMIND API
// ═══════════════════════════════════════════════════════════════════════════

export const wellmindAPI = {
  // Admin Dashboard
  getDashboard: async (contractorId) => {
    const params = contractorId ? { contractorId } : {};
    const response = await api.get('/wellmind/admin/dashboard', { params });
    return response.data;
  },

  // Risk Employees
  getRiskEmployees: async (riskLevel = 'red', contractorId = null) => {
    const params = {};
    if (riskLevel) params.risk_level = riskLevel;
    if (contractorId) params.contractorId = contractorId;
    const response = await api.get('/wellmind/admin/risk-employees', { params });
    return response.data;
  },

  // Trends
  getTrends: async (startDate, endDate, contractorId) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (contractorId) params.contractorId = contractorId;
    const response = await api.get('/wellmind/admin/trends', { params });
    return response.data;
  },

  // Questions
  getQuestions: async (questionType, isActive) => {
    const params = {};
    if (questionType) params.question_type = questionType;
    if (isActive !== undefined && isActive !== null) params.is_active = isActive;
    const response = await api.get('/wellmind/admin/questions', { params });
    return response.data;
  },
  createQuestion: async (data) => {
    const response = await api.post('/wellmind/admin/questions', data);
    return response.data;
  },
  updateQuestion: async (id, data) => {
    const response = await api.put(`/wellmind/admin/questions/${id}`, data);
    return response.data;
  },
  deleteQuestion: async (id) => {
    const response = await api.delete(`/wellmind/admin/questions/${id}`);
    return response.data;
  },

  // Bulk Intervention
  bulkIntervention: async (data) => {
    const response = await api.post('/wellmind/admin/bulk-intervention', data);
    return response.data;
  },

  // Team Metrics (Manager)
  getTeamMetrics: async (teamId, startDate, endDate) => {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    const response = await api.get(`/wellmind/team/${teamId}/metrics`, { params });
    return response.data;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CAREPATH API
// ═══════════════════════════════════════════════════════════════════════════

export const carepathAPI = {
  // Categories
  getCategories: async () => {
    const response = await api.get('/carepath/categories');
    return response.data;
  },

  // Usage Stats (Admin)
  getUsageStats: async (startMonth, endMonth, contractorId) => {
    const params = {};
    if (startMonth) params.startMonth = startMonth;
    if (endMonth) params.endMonth = endMonth;
    if (contractorId) params.contractorId = contractorId;
    const response = await api.get('/carepath/admin/usage-stats', { params });
    return response.data;
  },

  // Providers (Admin)
  getProviders: async (filters = {}) => {
    const response = await api.get('/carepath/admin/providers', { params: filters });
    return response.data;
  },
  createProvider: async (data) => {
    const response = await api.post('/carepath/admin/providers', data);
    return response.data;
  },
  updateProvider: async (id, data) => {
    const response = await api.put(`/carepath/admin/providers/${id}`, data);
    return response.data;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// WELLBEING INTEGRATION API
// ═══════════════════════════════════════════════════════════════════════════

export const wellbeingAPI = {
  // Notifications
  getNotifications: async (filters = {}) => {
    const response = await api.get('/wellbeing/notifications', { params: filters });
    return response.data;
  },
  markAsRead: async (id) => {
    const response = await api.put(`/wellbeing/notifications/${id}/read`);
    return response.data;
  },
  markAllAsRead: async () => {
    const response = await api.put('/wellbeing/notifications/read-all');
    return response.data;
  },

  // Referrals
  getMyReferrals: async (status) => {
    const params = status ? { status } : {};
    const response = await api.get('/wellbeing/my-referrals', { params });
    return response.data;
  },

  // Feedback
  submitFeedback: async (data) => {
    const response = await api.post('/wellbeing/feedback', data);
    return response.data;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SLACK INTEGRATION API
// ═══════════════════════════════════════════════════════════════════════════

export const slackAPI = {
  getConfig: async () => {
    const response = await api.get('/slack/config');
    return response.data;
  },
  updateConfig: async (data) => {
    const response = await api.put('/slack/config', data);
    return response.data;
  },
  syncUsers: async () => {
    const response = await api.post('/slack/sync-users');
    return response.data;
  },
  getUsers: async () => {
    const response = await api.get('/slack/users');
    return response.data;
  },
  toggleUser: async (id) => {
    const response = await api.put(`/slack/users/${id}/toggle`);
    return response.data;
  },
  sendTestMessage: async () => {
    const response = await api.post('/slack/test-message');
    return response.data;
  },
  getStats: async () => {
    const response = await api.get('/slack/stats');
    return response.data;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// NLP SENTIMENT ANALYSIS API
// ═══════════════════════════════════════════════════════════════════════════

export const nlpAPI = {
  getConfig: async () => {
    const response = await api.get('/nlp/config');
    return response.data;
  },
  updateConfig: async (data) => {
    const response = await api.put('/nlp/config', data);
    return response.data;
  },
  getStats: async (days = 30) => {
    const response = await api.get(`/nlp/stats?days=${days}`);
    return response.data;
  },
  getAlerts: async (params = {}) => {
    const response = await api.get('/nlp/alerts', { params });
    return response.data;
  },
  reviewAlert: async (id, reviewNotes) => {
    const response = await api.put(`/nlp/alerts/${id}/review`, { review_notes: reviewNotes });
    return response.data;
  },
  getSentimentHistory: async (days = 30) => {
    const response = await api.get(`/nlp/sentiment-history?days=${days}`);
    return response.data;
  },
  testAnalysis: async (text) => {
    const response = await api.post('/nlp/test', { text });
    return response.data;
  },
};

// Damage Reports API
export const damageReportsAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/damage-reports', { params });
    return response.data;
  },
  getById: async (id) => {
    const response = await api.get(`/damage-reports/${id}`);
    return response.data;
  },
  createManual: async (data) => {
    const response = await api.post('/damage-reports/create-manual', data);
    return response.data;
  },
  createFromTicket: async (data) => {
    const response = await api.post('/damage-reports/create-from-ticket', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/damage-reports/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/damage-reports/${id}`);
    return response.data;
  },
  acknowledge: async (id, data) => {
    const response = await api.post(`/damage-reports/${id}/acknowledge`, data);
    return response.data;
  },
  getPaymentStatus: async (id) => {
    const response = await api.get(`/damage-reports/${id}/payment-status`);
    return response.data;
  },
  calculatePaymentPlan: async (data) => {
    const response = await api.post('/damage-reports/calculate-payment-plan', data);
    return response.data;
  },
  downloadPDF: async (id, language = 'hu') => {
    const response = await api.get(`/damage-reports/${id}/pdf?language=${language}`, {
      responseType: 'blob',
    });
    return response.data;
  },
  addDamageItem: async (id, item) => {
    const response = await api.post(`/damage-reports/${id}/damage-items`, item);
    return response.data;
  },
  removeDamageItem: async (id, itemId) => {
    const response = await api.delete(`/damage-reports/${id}/damage-items/${itemId}`);
    return response.data;
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// INSPECTIONS API (Property inspection system)
// ═══════════════════════════════════════════════════════════════════════════

export const inspectionsAPI = {
  // Inspections
  getAll: async (params = {}) => {
    const response = await api.get('/inspections', { params });
    return response.data;
  },
  getById: async (id) => {
    const response = await api.get(`/inspections/${id}`);
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/inspections', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.patch(`/inspections/${id}`, data);
    return response.data;
  },
  addScores: async (id, scores) => {
    const response = await api.post(`/inspections/${id}/scores`, { scores });
    return response.data;
  },
  complete: async (id) => {
    const response = await api.post(`/inspections/${id}/complete`);
    return response.data;
  },
  remove: async (id) => {
    const response = await api.delete(`/inspections/${id}`);
    return response.data;
  },
  uploadPhoto: async (id, formData) => {
    const response = await api.post(`/inspections/${id}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
  listPhotos: async (id) => {
    const response = await api.get(`/inspections/${id}/photos`);
    return response.data;
  },
  deletePhoto: async (photoId) => {
    const response = await api.delete(`/inspections/photos/${photoId}`);
    return response.data;
  },

  // Room-level scoring (Day 3 Part A)
  listInspectionRooms: async (inspectionId) => {
    const response = await api.get(`/inspections/${inspectionId}/rooms`);
    return response.data;
  },
  scoreRoom: async (inspectionId, roomId, payload) => {
    const response = await api.post(`/inspections/${inspectionId}/rooms/${roomId}/score`, payload);
    return response.data;
  },
  getRoomHistory: async (roomId) => {
    const response = await api.get(`/rooms/${roomId}/inspection-history`);
    return response.data;
  },

  // PDF downloads (Day 3 Part B) — returns a Blob
  downloadLegalProtocol: (id)   => api.get(`/inspections/${id}/pdf/legal`,  { responseType: 'blob' }).then(r => r.data),
  downloadOwnerReport:   (id)   => api.get(`/inspections/${id}/pdf/owner`,  { responseType: 'blob' }).then(r => r.data),
  downloadInspectionReport: (id) => api.get(`/inspections/${id}/pdf/report`, { responseType: 'blob' }).then(r => r.data),

  // Compensations (Day 3 Part C) — all via inspectionsAPI for UI convenience;
  // they hit /compensations/* under the hood.
  listCompensations: async (params = {}) => (await api.get('/compensations', { params })).data,
  getCompensation:   async (id)          => (await api.get(`/compensations/${id}`)).data,
  createCompensation: async (payload, opts = {}) =>
    (await api.post(`/compensations${opts.issue ? '?issue=true' : ''}`, payload)).data,
  issueCompensation: async (id) => (await api.post(`/compensations/${id}/issue`)).data,
  recordCompensationPayment: async (id, payload) =>
    (await api.post(`/compensations/${id}/payments`, payload)).data,
  waiveCompensation:    async (id, reason) => (await api.post(`/compensations/${id}/waive`,    { reason })).data,
  escalateCompensation: async (id, payload = {}) =>
    (await api.post(`/compensations/${id}/escalate`, payload)).data,
  downloadCompensationNotice: (id) =>
    api.get(`/compensations/${id}/pdf`, { responseType: 'blob' }).then(r => r.data),

  // Advanced compensation ops (Day 3 Part C ext.)
  allocateResponsibilities: async (id, parties) =>
    (await api.post(`/compensations/${id}/responsibilities`, { parties })).data,
  submitDispute:  async (id, reason) => (await api.post(`/compensations/${id}/dispute`, { reason })).data,
  resolveDispute: async (id, payload) => (await api.post(`/compensations/${id}/resolve-dispute`, payload)).data,
  scheduleSalaryDeduction: async (id, payload) =>
    (await api.post(`/compensations/${id}/salary-deduction`, payload)).data,
  sendCompensationNotice: async (id) => (await api.post(`/compensations/${id}/send-notice`)).data,

  // Templates: categories
  listCategories: async (params = {}) => {
    const response = await api.get('/inspection-templates/categories', { params });
    return response.data;
  },
  createCategory: async (data) => {
    const response = await api.post('/inspection-templates/categories', data);
    return response.data;
  },
  updateCategory: async (id, data) => {
    const response = await api.put(`/inspection-templates/categories/${id}`, data);
    return response.data;
  },
  deleteCategory: async (id) => {
    const response = await api.delete(`/inspection-templates/categories/${id}`);
    return response.data;
  },

  // Templates: items
  listItems: async (params = {}) => {
    const response = await api.get('/inspection-templates/items', { params });
    return response.data;
  },
  createItem: async (data) => {
    const response = await api.post('/inspection-templates/items', data);
    return response.data;
  },
  updateItem: async (id, data) => {
    const response = await api.put(`/inspection-templates/items/${id}`, data);
    return response.data;
  },
  deleteItem: async (id) => {
    const response = await api.delete(`/inspection-templates/items/${id}`);
    return response.data;
  },

  // Schedules
  listSchedules: async (params = {}) => {
    const response = await api.get('/inspection-schedules', { params });
    return response.data;
  },
  upcomingSchedules: async (days = 30) => {
    const response = await api.get('/inspection-schedules/upcoming', { params: { days } });
    return response.data;
  },
  createSchedule: async (data) => {
    const response = await api.post('/inspection-schedules', data);
    return response.data;
  },
  updateSchedule: async (id, data) => {
    const response = await api.put(`/inspection-schedules/${id}`, data);
    return response.data;
  },
  deleteSchedule: async (id) => {
    const response = await api.delete(`/inspection-schedules/${id}`);
    return response.data;
  },

  // Tasks
  listTasks: async (params = {}) => {
    const response = await api.get('/inspection-tasks', { params });
    return response.data;
  },
  getTaskById: async (id) => {
    const response = await api.get(`/inspection-tasks/${id}`);
    return response.data;
  },
  updateTask: async (id, data) => {
    const response = await api.patch(`/inspection-tasks/${id}`, data);
    return response.data;
  },
  verifyTask: async (id) => {
    const response = await api.post(`/inspection-tasks/${id}/verify`);
    return response.data;
  },
  uploadTaskPhoto: async (id, formData) => {
    const response = await api.post(`/inspection-tasks/${id}/photos`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

// GTD Task Manager API
export const gtdAPI = {
  // Inbox
  getInbox: async () => {
    const response = await api.get('/gtd/inbox');
    return response.data;
  },
  captureInbox: async (content) => {
    const response = await api.post('/gtd/inbox', { content });
    return response.data;
  },
  processInbox: async (id) => {
    const response = await api.patch(`/gtd/inbox/${id}`);
    return response.data;
  },
  deleteInbox: async (id) => {
    const response = await api.delete(`/gtd/inbox/${id}`);
    return response.data;
  },

  // Inbox convert
  convertInbox: async (id, type) => {
    const response = await api.post(`/gtd/inbox/${id}/convert`, { type });
    return response.data;
  },

  // Projects (uses existing projects table with GTD fields)
  getProjects: async (params = {}) => {
    const response = await api.get('/gtd/projects', { params });
    return response.data;
  },
  updateProjectGTD: async (id, data) => {
    const response = await api.patch(`/gtd/projects/${id}/gtd`, data);
    return response.data;
  },

  // Ticket GTD fields
  updateTicketGTD: async (id, data) => {
    const response = await api.patch(`/gtd/tickets/${id}/gtd`, data);
    return response.data;
  },

  // Unified next actions (tickets + tasks)
  getNextActions: async (params = {}) => {
    const response = await api.get('/gtd/next-actions', { params });
    return response.data;
  },

  // Tasks
  getTasks: async (params = {}) => {
    const response = await api.get('/gtd/tasks', { params });
    return response.data;
  },
  createTask: async (data) => {
    const response = await api.post('/gtd/tasks', data);
    return response.data;
  },
  updateTask: async (id, data) => {
    const response = await api.patch(`/gtd/tasks/${id}`, data);
    return response.data;
  },
  deleteTask: async (id) => {
    const response = await api.delete(`/gtd/tasks/${id}`);
    return response.data;
  },

  // Contexts
  getContexts: async () => {
    const response = await api.get('/gtd/contexts');
    return response.data;
  },
  createContext: async (data) => {
    const response = await api.post('/gtd/contexts', data);
    return response.data;
  },

  // Weekly Review
  getCurrentReview: async () => {
    const response = await api.get('/gtd/review/current');
    return response.data;
  },
  updateReview: async (id, data) => {
    const response = await api.patch(`/gtd/review/${id}`, data);
    return response.data;
  },

  // Dashboard Stats
  getStats: async () => {
    const response = await api.get('/gtd/stats');
    return response.data;
  },
};

export default api;
