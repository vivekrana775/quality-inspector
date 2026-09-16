import { useCallback, useEffect, useState } from 'react';
import type { ApiErrorBody } from '../shared/schema';

export class ApiError extends Error {
  constructor(
    message: string,
    public code = '',
    public fields: Record<string, string> = {},
    public status = 0,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// App registers a listener so a 401 from anywhere drops the UI back to the sign-in screen.
let unauthorized = () => {};
export function onUnauthorized(listener: () => void) {
  unauthorized = listener;
  return () => {
    unauthorized = () => {};
  };
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the server. Check your connection and try again.');
  }
  const body = (await response.json().catch(() => null)) as ({ data: T } & ApiErrorBody) | null;
  if (!response.ok) {
    const failure = body?.error;
    if (response.status === 401 && failure?.code === 'UNAUTHORIZED') unauthorized();
    throw new ApiError(
      failure?.message || 'Something went wrong. Please try again.',
      failure?.code,
      failure?.fields,
      response.status,
    );
  }
  if (!body || !('data' in body)) throw new ApiError('The server returned an unexpected response.');
  return body.data;
}

interface Loaded<T> {
  key: string;
  data?: T;
  error: string;
}

// GET hook. Pass null as the path when there's nothing to load yet. Previous data stays
// available while the next request runs so lists don't blank out on every filter change.
export function useApi<T>(path: string | null, revision = 0) {
  const [attempt, setAttempt] = useState(0);
  const key = `${path}|${revision}|${attempt}`;
  const [loaded, setLoaded] = useState<Loaded<T>>({ key: '', error: '' });
  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((data) => setLoaded({ key, data, error: '' }))
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        setLoaded((previous) => ({ key, data: previous.data, error: error.message }));
      });
    return () => controller.abort();
  }, [path, key]);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const settled = loaded.key === key;
  return {
    data: loaded.data,
    loading: path !== null && !settled,
    error: settled ? loaded.error : '',
    reload,
  };
}
