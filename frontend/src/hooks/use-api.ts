'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, QueryParams } from '@/services/api';

interface UseApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
}

export function useApi<T>(path: string | null, params?: QueryParams): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);
  const key = useMemo(() => (params ? JSON.stringify(params) : ''), [params]);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<T>(path, params)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Unexpected error');
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key, tick]);

  const refresh = useCallback(() => setTick((value) => value + 1), []);
  return { data, error, loading, refresh };
}

export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debounced;
}
