'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from './api';
import type { Session, StudentRef, User } from './types';

interface AuthValue {
  user: User | null;
  students: StudentRef[];
  activeStudent: StudentRef | null;
  setActiveStudentId: (id: string) => void;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);
const CHILD_KEY = 'campusone_child';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenStore.get()) { setLoading(false); return; }
    api<Session>('/auth/me')
      .then((s) => { setSession(s); setActiveId(window.localStorage.getItem(CHILD_KEY)); })
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<Session & { token: string }>('/auth/login', { method: 'POST', body: { email, password } });
    tokenStore.set(res.token);
    setSession({ user: res.user, students: res.students });
    setActiveId(null);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    window.localStorage.removeItem(CHILD_KEY);
    setSession(null);
    window.location.href = '/login';
  }, []);

  const value = useMemo<AuthValue>(() => {
    const students = session?.students ?? [];
    const activeStudent = students.find((s) => s.id === activeId) ?? students[0] ?? null;
    return {
      user: session?.user ?? null,
      students,
      activeStudent,
      setActiveStudentId: (id) => { setActiveId(id); window.localStorage.setItem(CHILD_KEY, id); },
      loading,
      login,
      logout,
    };
  }, [session, activeId, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
