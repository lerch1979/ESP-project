import api from '../api';

const gamificationAPI = {
  async getMyStats() {
    const response = await api.get('/gamification/my-stats');
    return response.data;
  },

  async getLeaderboard(period = '30days') {
    const response = await api.get(`/gamification/leaderboard?period=${period}`);
    return response.data;
  },

  async getAvailableBadges() {
    const response = await api.get('/gamification/badges/available');
    return response.data;
  },

  async getPointsHistory(days = 30) {
    const response = await api.get(`/gamification/points-history?days=${days}`);
    return response.data;
  },
};

export default gamificationAPI;
