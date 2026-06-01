import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/api";

type State<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

/**
 * Run an async loader on mount and whenever a dep changes. Exposes a `refetch`
 * for pull-to-refresh. Ignores results from stale invocations.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): State<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  const run = useCallback(() => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    loader()
      .then((res) => {
        if (id === reqId.current) setData(res);
      })
      .catch((e) => {
        if (id === reqId.current) setError(e instanceof ApiError ? e.detail : "Falha ao carregar.");
      })
      .finally(() => {
        if (id === reqId.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(run, [run]);

  return { data, loading, error, refetch: run };
}
