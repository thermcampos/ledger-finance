import { createContext, useContext, useState, useCallback } from 'react';
import { AuthApi } from '../api/ledger';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('ledger_user');
    return stored ? JSON.parse(stored) : null;
  });

  const persist = (response) => {
    localStorage.setItem('ledger_token', response.token);
    localStorage.setItem(
      'ledger_user',
      JSON.stringify({ email: response.email, displayName: response.displayName })
    );
    setUser({ email: response.email, displayName: response.displayName });
  };

  const login = useCallback(async (email, password) => {
    const response = await AuthApi.login({ email, password });
    persist(response);
  }, []);

  const signup = useCallback(async (email, password, displayName) => {
    const response = await AuthApi.signup({ email, password, displayName });
    persist(response);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('ledger_token');
    localStorage.removeItem('ledger_user');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
