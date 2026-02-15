import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

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
};

// Export API
export const exportAPI = {
  employees: (params) => api.get('/export/employees', { params, responseType: 'blob' }),
  contractors: (params) => api.get('/export/contractors', { params, responseType: 'blob' }),
  accommodations: (params) => api.get('/export/accommodations', { params, responseType: 'blob' }),
  tickets: (params) => api.get('/export/tickets', { params, responseType: 'blob' }),
};

export default api;
