"use client";
// Kènè Pro — hook de fetch local (loading / error / refetch) avec persistance synchrone et résilience hors-ligne
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/** Fetch déclaratif avec support de persistance locale hors-ligne et fallback */
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
  const dataRef = useRef(data);
  const fallbackRef = useRef(fallbackData);
  const alive = useRef(true);

  // Synchronisation des refs APRÈS le rendu (jamais pendant). Déclaré avant
  // l'effet de chargement ci-dessous: à chaque commit, fnRef/fallbackRef sont
  // à jour avant que load() ne s'exécute.
  useEffect(() => {
    fnRef.current = fn;
    dataRef.current = data;
    fallbackRef.current = fallbackData;
  });

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!dataRef.current) setLoading(true);
    setError(null);
    try {
      const d = await fnRef.current();
      if (alive.current) {
        if (d !== null && d !== undefined) {
          setData(d);
          dataRef.current = d;
          if (typeof window !== "undefined" && cacheKey) {
            try {
              window.localStorage.setItem(cacheKey, JSON.stringify(d));
            } catch {
              // quota dépassé ignoré
            }
          }
        }
      }
    } catch (e) {
      if (alive.current) {
        const isNetworkErr =
          e instanceof Error &&
          (/network|failed to fetch|hors-ligne|load failed|offline/i.test(e.message) ||
            e.name === "TypeError" ||
            e.name === "NetworkError");

        // Si des données de secours existent et que les données actuelles sont vides, peupler le fallback
        if (!dataRef.current && fallbackRef.current) {
          setData(fallbackRef.current);
          dataRef.current = fallbackRef.current;
        }

        // Si nous avons des données (en cache ou fallback) ou qu'il s'agit d'une coupure réseau,
        // ne JAMAIS exposer d'erreur bloquante qui casserait l'interface de travail
        if (dataRef.current || fallbackRef.current || isNetworkErr) {
          // On garde l'écran propre et pleinement utilisable
          setError(null);
        } else {
          setError(e instanceof Error ? e.message : "Une erreur est survenue");
        }
      }
    } finally {
      if (alive.current) setLoading(false);
    }
    // `deps` dynamique = contrat public de useApi (les appelants fournissent leur propre liste).
    // eslint-disable-next-line react-hooks/use-memo
  }, deps);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, refetch: load, setData };
}
