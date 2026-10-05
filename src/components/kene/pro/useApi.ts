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

/** Fetch declaratif avec support de persistance locale hors-ligne et fallback */
export function useApi<T>(
  fn: () => Promise<T>,
  deps: unknown[] = [],
  options?: { cacheKey?: string; fallbackData?: T }
): UseApiResult<T> {
  const cacheKey = options?.cacheKey;
  const fallbackData = options?.fallbackData;

  const [data, setData] = useState<T | null>(() => {
    if (typeof window !== "undefined" && cacheKey) {
      try {
        const stored = window.localStorage.getItem(cacheKey);
        if (stored) return JSON.parse(stored) as T;
      } catch {
        // ignorer l'erreur de parsing
      }
    }
    return fallbackData ?? null;
  });

  const [loading, setLoading] = useState(() => !data);
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
    if (!data) setLoading(true);
    setError(null);
    try {
      const d = await fnRef.current();
      if (alive.current) {
        setData(d);
        if (typeof window !== "undefined" && cacheKey && d) {
          try {
            window.localStorage.setItem(cacheKey, JSON.stringify(d));
          } catch {
            // quota dépassé ignoré
          }
        }
      }
    } catch (e) {
      if (alive.current) {
        // Si des données sont déjà en mémoire ou en cache local, ne pas casser l'affichage
        if (!data) {
          setError(e instanceof Error ? e.message : "Une erreur est survenue");
        }
      }
    } finally {
      if (alive.current) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: load, setData };
}
