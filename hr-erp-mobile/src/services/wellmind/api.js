/**
 * WellMind API Service
 *
 * All WellMind-related API calls, organized by domain.
 * Uses the shared axios instance from the main api module.
 */
import apiInstance from '../api';

// ─── Pulse Surveys ──────────────────────────────────────────

export const pulse = {
  /** Submit daily mood check-in (max 1/day). */
  submit: async (data) => {
    const response = await apiInstance.post('/wellmind/pulse', data);
    return response.data;
  },

  /** Get today's pulse status and available questions. */
  getToday: async () => {
    const response = await apiInstance.get('/wellmind/pulse/today');
    return response.data;
  },

  /** Get pulse history with trend & anomaly detection. */
  getHistory: async (days = 30) => {
    const response = await apiInstance.get('/wellmind/pulse/history', { params: { days } });
    return response.data;
  },
};

// ─── Assessments (Quarterly) ────────────────────────────────

export const assessment = {
  /** Submit quarterly burnout/engagement assessment. */
  submit: async (responses) => {
    const response = await apiInstance.post('/wellmind/assessment', { responses });
    return response.data;
  },

  /** Get all past assessment submissions. */
  getHistory: async () => {
    const response = await apiInstance.get('/wellmind/assessment/history');
    return response.data;
  },

  /** Get active assessment questions (employee-accessible endpoint). */
  getQuestions: async () => {
    const response = await apiInstance.get('/wellmind/assessment/questions', {
    });
    return response.data;
  },
};

// ─── Dashboard ──────────────────────────────────────────────

export const dashboard = {
  /** Get personalized wellbeing dashboard. */
  get: async () => {
    const response = await apiInstance.get('/wellmind/my-dashboard');
    return response.data;
  },
};

// ─── Interventions ──────────────────────────────────────────

export const interventions = {
  /** Get recommended interventions, optionally filtered by status. */
  getAll: async (status) => {
    const response = await apiInstance.get('/wellmind/interventions', {
      params: status ? { status } : {},
    });
    return response.data;
  },

  /** Accept a recommended intervention. */
  accept: async (id) => {
    const response = await apiInstance.post(`/wellmind/interventions/${id}/accept`);
    return response.data;
  },

  /** Mark an intervention as completed with optional rating. */
  complete: async (id, data = {}) => {
    const response = await apiInstance.post(`/wellmind/interventions/${id}/complete`, data);
    return response.data;
  },

  /** Decline/skip an intervention. */
  skip: async (id, reason) => {
    const response = await apiInstance.post(`/wellmind/interventions/${id}/skip`, {
      decline_reason: reason,
    });
    return response.data;
  },
};

// ─── Coaching Sessions ──────────────────────────────────────

export const coaching = {
  /** Get coaching session list, optionally filtered by status. */
  getAll: async (status) => {
    const response = await apiInstance.get('/wellmind/coaching-sessions', {
      params: status ? { status } : {},
    });
    return response.data;
  },

  /** Rate and provide feedback on a completed session. */
  submitFeedback: async (id, rating, feedback) => {
    const response = await apiInstance.post(`/wellmind/coaching-sessions/${id}/feedback`, {
      rating,
      feedback,
    });
    return response.data;
  },
};

// ─── NLP Consent ──────────────────────────────────────────────

const nlpConsent = {
  get: async () => {
    const response = await apiInstance.get('/nlp/consent');
    return response.data;
  },
  update: async (consented) => {
    const response = await apiInstance.post('/nlp/consent', { consented });
    return response.data;
  },
};

// ─── Convenience re-export ──────────────────────────────────

const wellmindAPI = { pulse, assessment, dashboard, interventions, coaching, nlpConsent };
export default wellmindAPI;
