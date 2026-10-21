'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { useAuth } from './auth';

/** Fetch on mount and whenever `path` changes. Pass null to skip. */
export function useFetch<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);

  const load = useCallback(async (silent = false) => {
    if (!path) { setData(null); setLoading(false); return; }
    if (!silent) setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: () => load(true), setData };
}

/** Re-render every `ms` milliseconds, for countdowns and "live now" labels. */
export function useTick(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

/**
 * Query string naming the student a page is about. Parents pass the selected child;
 * students and staff need nothing because the server resolves the caller.
 */
export function useStudentQuery() {
  const { user, activeStudent } = useAuth();
  if (user?.role !== 'PARENT') return { q: '', sep: (p: string) => p, ready: true };
  const q = activeStudent ? `studentId=${activeStudent.id}` : '';
  return { q, sep: (p: string) => (q ? `${p}${p.includes('?') ? '&' : '?'}${q}` : p), ready: !!activeStudent };
}
