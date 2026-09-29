'use client';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';

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
