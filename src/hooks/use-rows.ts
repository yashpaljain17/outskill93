"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/** Tiny data loader: runs `load` on mount / when deps change, exposes `reload`. */
export function useRows<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });

  // Back to loading as soon as deps change (adjusting state during render, not in the effect).
  const [prevDeps, setPrevDeps] = useState(deps);
  if (deps.length !== prevDeps.length || deps.some((d, i) => !Object.is(d, prevDeps[i]))) {
    setPrevDeps(deps);
    setLoading(true);
  }

  const reload = useCallback(async () => {
    try {
      const result = await loadRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, reload, setData };
}

/** Throws on a Supabase error so useRows can surface it. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}
