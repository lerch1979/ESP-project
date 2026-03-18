/**
 * CarePath API Service
 * Employee Assistance Program endpoints.
 */
import apiInstance from '../api';

export const categories = {
  getAll: async () => {
    const response = await apiInstance.get('/carepath/categories');
    return response.data;
  },
};

export const cases = {
  create: async (data) => {
    const response = await apiInstance.post('/carepath/cases', data);
    return response.data;
  },
  getMine: async (params = {}) => {
    const response = await apiInstance.get('/carepath/my-cases', { params });
    return response.data;
  },
  getById: async (id) => {
    const response = await apiInstance.get(`/carepath/cases/${id}`);
    return response.data;
  },
  close: async (id, data = {}) => {
    const response = await apiInstance.put(`/carepath/cases/${id}/close`, data);
    return response.data;
  },
};

export const providers = {
  search: async (params = {}) => {
    const response = await apiInstance.get('/carepath/providers/search', { params });
    return response.data;
  },
  getById: async (id) => {
    const response = await apiInstance.get(`/carepath/providers/${id}`);
    return response.data;
  },
  getAvailability: async (id, startDate, endDate) => {
    const response = await apiInstance.get(`/carepath/providers/${id}/availability`, {
      params: { startDate, endDate },
    });
    return response.data;
  },
};

export const bookings = {
  create: async (data) => {
    const response = await apiInstance.post('/carepath/bookings', data);
    return response.data;
  },
  getMine: async (params = {}) => {
    const response = await apiInstance.get('/carepath/my-bookings', { params });
    return response.data;
  },
  cancel: async (id, reason) => {
    const response = await apiInstance.put(`/carepath/bookings/${id}/cancel`, {
      cancellation_reason: reason,
    });
    return response.data;
  },
  reschedule: async (id, newDatetime) => {
    const response = await apiInstance.put(`/carepath/bookings/${id}/reschedule`, {
      new_appointment_datetime: newDatetime,
    });
    return response.data;
  },
};

export const admin = {
  getUsageStats: async (params = {}) => {
    const response = await apiInstance.get('/carepath/admin/usage-stats', { params });
    return response.data;
  },
};

const carepathAPI = { categories, cases, providers, bookings, admin };
export default carepathAPI;
