import axios from 'axios';
import { Platform } from 'react-native';
import { getItem, setItem, deleteItem } from './storage';

// Your computer's LAN IP (for physical devices on the same WiFi)
const LOCAL_IP = '192.168.1.37';

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

export default api;
