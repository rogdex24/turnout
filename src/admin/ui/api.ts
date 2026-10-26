import { useEffect, useEffectEvent, useState } from "react";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, init?: { method: string; body?: unknown }): Promise<T> {
  const response = await fetch(path, {
    method: init?.method,
    headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(response.status, body.error ?? `request failed (${response.status})`);
  return body as T;
}

export interface QueryState<T> {
  data?: T;
  error?: ApiError;
  loading: boolean;
  reload: () => void;
}

/**
 * GET a path and keep it fresh. `again` returns the delay before the next fetch,
 * or null to stop; it sees the data (or the error) and how many failures in a row.
 */
export function useApi<T>(
  path: string | null,
  again?: (result: { data?: T; error?: ApiError; failures: number }) => number | null,
): QueryState<T> {
  const [state, setState] = useState<{ data?: T; error?: ApiError; loading: boolean }>({ loading: path !== null });
  const [tick, setTick] = useState(0);
  // `again` is read once per fetch; as an Effect Event its identity does not restart the effect.
  const nextDelay = useEffectEvent((result: { data?: T; error?: ApiError; failures: number }) => again?.(result) ?? null);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    setState((previous) => ({ data: previous.data, loading: true }));

    const load = async () => {
      let next: number | null = null;
      try {
        const data = await request<T>(path);
        if (cancelled) return;
        failures = 0;
        setState({ data, loading: false });
        next = nextDelay({ data, failures });
      } catch (caught) {
        if (cancelled) return;
        const error = caught instanceof ApiError ? caught : new ApiError(0, String(caught));
        failures += 1;
        setState((previous) => ({ data: previous.data, error, loading: false }));
        next = nextDelay({ error, failures });
      }
      if (next !== null) timer = setTimeout(load, next);
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [path, tick]);

  return { ...state, reload: () => setTick((value) => value + 1) };
}
