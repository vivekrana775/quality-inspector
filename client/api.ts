import { useEffect, useState } from 'react';
import type { ApiErrorBody } from '../shared/schema';

export class ApiError extends Error {
  constructor(
    message: string,
    public fields: Record<string, string> = {},
    public status = 0,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the server. Check your connection and try again.');
  }
  const body = (await response.json().catch(() => null)) as ({ data: T } & ApiErrorBody) | null;
  if (!response.ok)
    throw new ApiError(
      body?.error?.message || 'Something went wrong. Please try again.',
      body?.error?.fields,
      response.status,
    );
  if (!body || !('data' in body))
    throw new ApiError('The server returned an unexpected response. Please try again.');
  return body.data;
}

export function useApi<T>(path: string, revision = 0) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api<T>(path, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision, retry]);
  return { data, loading, error, reload: () => setRetry((value) => value + 1) };
}
