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

// Response interceptor - hibakezelés
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token lejárt vagy érvénytelen
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
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

export default api;
