"use client";
// Kènè Pro — hook de fetch local (loading / error / refetch)
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/** Fetch declaratif simple: useApi( => apiGet<T>(url), [dep]) */
export function useApi<T>(fn: () => Promise<T>, deps: unknown[] = []): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await fnRef.current();
      if (alive.current) setData(d);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Une erreur est survenue");
    } finally {
      if (alive.current) setLoading(false);
    }
     
  }, deps);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, loading, error, refetch: load, setData };
}
