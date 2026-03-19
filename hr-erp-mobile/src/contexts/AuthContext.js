import React, { createContext, useContext, useState, useEffect } from 'react';
import { getItem, setItem, deleteItem } from '../services/storage';
import { authAPI } from '../services/api';
import { setLanguageFromProfile } from '../i18n';

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
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
        // AUTOMATIC: Set language from stored user profile
        if (parsed.preferred_language) setLanguageFromProfile(parsed.preferred_language);
        // Verify token is still valid
        try {
          const response = await authAPI.getMe();
          const meUser = response.data?.user || response.user;
          setUser(meUser);
          await setItem('user', JSON.stringify(meUser));
          if (meUser.preferred_language) setLanguageFromProfile(meUser.preferred_language);
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
    // AUTOMATIC: Set language from user profile on login
    if (userData.preferred_language) setLanguageFromProfile(userData.preferred_language);
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
