import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Initialize from localStorage
  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (token && userData) {
      try {
        const parsed = JSON.parse(userData);
        setUser(parsed);
        setPermissions(parsed.permissions || []);
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback((userData, token, refreshToken) => {
    localStorage.setItem('token', token);
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    setPermissions(userData.permissions || []);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch {
      // Ignore logout API errors
    }
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
    setPermissions([]);
  }, []);

  const updateUser = useCallback((userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
    setPermissions(userData.permissions || []);
  }, []);

  // Check if user has a specific permission
  const hasPermission = useCallback((permission) => {
    if (!user) return false;
    // Superadmin has all permissions
    if (permissions.includes('*')) return true;
    if (user.roleSlugs?.includes('superadmin')) return true;
    return permissions.includes(permission);
  }, [user, permissions]);

  // Check if user has any of the given permissions
  const hasAnyPermission = useCallback((perms) => {
    if (!user) return false;
    if (permissions.includes('*')) return true;
    if (user.roleSlugs?.includes('superadmin')) return true;
    return perms.some(p => permissions.includes(p));
  }, [user, permissions]);

  // Check if user has a specific role
  const hasRole = useCallback((role) => {
    if (!user) return false;
    return user.roleSlugs?.includes(role) || false;
  }, [user]);

  const isSuperAdmin = useCallback(() => {
    return hasRole('superadmin');
  }, [hasRole]);

  const value = {
    user,
    permissions,
    loading,
    login,
    logout,
    updateUser,
    hasPermission,
    hasAnyPermission,
    hasRole,
    isSuperAdmin,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
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

export default AuthContext;
