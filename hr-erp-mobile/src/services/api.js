import axios from 'axios';
import { Platform } from 'react-native';
import { getItem, setItem, deleteItem } from './storage';

// Your computer's LAN IP (for physical devices on the same WiFi)
const LOCAL_IP = 'localhost';

const getApiBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  // Use LAN IP so physical devices on the same WiFi can reach the backend
  return `http://${LOCAL_IP}:3000/api/v1`;
};

const API_BASE_URL = getApiBaseUrl();
console.log('[API] Base URL:', API_BASE_URL);

export const getBaseUrl = () => API_BASE_URL;

// Base URL for static files (uploads) - strip /api/v1 suffix
export const UPLOADS_BASE_URL = API_BASE_URL.replace(/\/api\/v\d+$/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor
api.interceptors.request.use(
  async (config) => {
    const token = await getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - auto refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        const { token } = response.data.data;
        await setItem('token', token);

        api.defaults.headers.common.Authorization = `Bearer ${token}`;
        processQueue(null, token);

        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        await deleteItem('token');
        await deleteItem('refreshToken');
        await deleteItem('user');
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
    console.log('[API] Login request to:', `${API_BASE_URL}/auth/login`);
    try {
      const response = await api.post('/auth/login', { email, password });
      console.log('[API] Login success:', response.data?.success);
      return response.data;
    } catch (error) {
      console.error('[API] Login failed:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message,
        code: error.code,
      });
      throw error;
    }
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

// Dashboard API
export const dashboardAPI = {
  getStats: async () => {
    const response = await api.get('/dashboard/stats');
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
  uploadPhoto: async (id, uri) => {
    const formData = new FormData();
    formData.append('photo', {
      uri,
      name: 'photo.jpg',
      type: 'image/jpeg',
    });
    const response = await api.post(`/employees/${id}/photo`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
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
  uploadDocument: async (id, uri, documentType, notes, onProgress) => {
    const formData = new FormData();
    const ext = uri.split('.').pop() || 'jpg';
    const mimeType = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    formData.append('document', {
      uri,
      name: `document.${ext}`,
      type: mimeType,
    });
    if (documentType) formData.append('document_type', documentType);
    if (notes) formData.append('notes', notes);
    const response = await api.post(`/employees/${id}/documents`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
      onUploadProgress: onProgress
        ? (e) => onProgress(Math.round((e.loaded * 100) / e.total))
        : undefined,
    });
    return response.data;
  },
  deleteDocument: async (docId) => {
    const response = await api.delete(`/employees/documents/${docId}`);
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
};

// Calendar API
export const calendarAPI = {
  getEvents: async (params = {}) => {
    const response = await api.get('/calendar/events', { params });
    return response.data;
  },
};

// Google Calendar API
export const googleCalendarAPI = {
  getStatus: async () => {
    const response = await api.get('/calendar/google/status');
    return response.data;
  },
  getAuthUrl: async () => {
    const response = await api.get('/calendar/google/auth');
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
  getCategories: async () => {
    const response = await api.get('/videos/categories');
    return response.data;
  },
  recordView: async (id, data = {}) => {
    const response = await api.post(`/videos/${id}/view`, data);
    return response.data;
  },
};

// Projects API
export const projectAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/projects', { params });
    return response.data;
  },
  getById: async (id) => {
    const response = await api.get(`/projects/${id}`);
    return response.data;
  },
};

// Tasks API
export const taskAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/tasks', { params });
    return response.data;
  },
  getById: async (id) => {
    const response = await api.get(`/tasks/${id}`);
    return response.data;
  },
  updateStatus: async (id, statusData) => {
    const response = await api.patch(`/tasks/${id}/status`, statusData);
    return response.data;
  },
};

// Invoices API
export const invoiceAPI = {
  getAll: async (params = {}) => {
    const response = await api.get('/invoices', { params });
    return response.data;
  },
  getById: async (id) => {
    const response = await api.get(`/invoices/${id}`);
    return response.data;
  },
};

// Chatbot API (Tier 1 - user endpoints only)
export const chatbotAPI = {
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
  selectSuggestion: async (conversationId, kbId) => {
    const response = await api.post(`/chatbot/conversations/${conversationId}/suggestions`, { kb_id: kbId });
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
  sendFeedback: async (messageId, helpful) => {
    const response = await api.post('/chatbot/feedback', { messageId, helpful });
    return response.data;
  },
};

export default api;
