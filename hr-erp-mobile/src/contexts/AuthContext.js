import React, { createContext, useContext, useState, useEffect } from 'react';
import { getItem, setItem, deleteItem } from '../services/storage';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const token = await getItem('token');
      const storedUser = await getItem('user');

      if (token && storedUser) {
        setUser(JSON.parse(storedUser));
        // Verify token is still valid
        try {
          const response = await authAPI.getMe();
          // authAPI.getMe returns response.data which is { success, data: { user } }
          const meUser = response.data?.user || response.user;
          setUser(meUser);
          await setItem('user', JSON.stringify(meUser));
        } catch {
          // Token might be expired, refresh interceptor will handle it
          // If refresh also fails, user stays null
        }
      }
    } catch {
      // No stored auth
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    const response = await authAPI.login(email, password);
    // authAPI.login returns response.data which is { success, data: { token, refreshToken, user } }
    const { token, refreshToken, user: userData } = response.data || response;

    await setItem('token', token);
    await setItem('refreshToken', refreshToken);
    await setItem('user', JSON.stringify(userData));

    setUser(userData);
    return userData;
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch {
      // Ignore logout API errors
    }

    await deleteItem('token');
    await deleteItem('refreshToken');
    await deleteItem('user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
