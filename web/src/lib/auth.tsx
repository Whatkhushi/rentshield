import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, setAccessToken } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    refreshSession()
      .then(setUser)
      .finally(() => setLoading(false));
  }, []);

  async function session(path: string, body: unknown) {
    const data = await api<{ accessToken: string; user: User }>(path, { method: 'POST', body });
    setAccessToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login: (email, password) => session('/auth/login', { email, password }),
        register: (name, email, password) => session('/auth/register', { name, email, password }),
        logout: async () => {
          await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
          setAccessToken(null);
          setUser(null);
          qc.clear();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
