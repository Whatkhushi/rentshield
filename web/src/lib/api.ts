import type { User } from './types';

/**
 * Fetch wrapper:
 * - access token lives in memory only (not localStorage)
 * - on 401 it refreshes once via the httpOnly cookie and retries
 * - supports JSON bodies, multipart uploads and binary downloads
 */
let accessToken: string | null = null;
let refreshing: Promise<User | null> | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export const setAccessToken = (t: string | null) => {
  accessToken = t;
};

type Body = unknown | FormData;

async function raw(path: string, method: string, body?: Body) {
  const isForm = body instanceof FormData;
  return fetch(`/api/v1${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
}

async function fail(res: Response): Promise<never> {
  const data = await res.json().catch(() => ({}));
  const e = data?.error ?? {};
  throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? `Request failed (${res.status})`, e.details);
}

export function refreshSession(): Promise<User | null> {
  refreshing ??= (async () => {
    try {
      const res = await raw('/auth/refresh', 'POST');
      if (!res.ok) {
        accessToken = null;
        return null;
      }
      const data = (await res.json()) as { accessToken: string; user: User };
      accessToken = data.accessToken;
      return data.user;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function send(path: string, method: string, body?: Body) {
  let res = await raw(path, method, body);
  if (res.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) {
    res = await raw(path, method, body);
  }
  return res;
}

export async function api<T>(path: string, opts: { method?: string; body?: Body } = {}): Promise<T> {
  const res = await send(path, opts.method ?? 'GET', opts.body);
  if (!res.ok) return fail(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Download a protected file (photo, PDF) as a Blob. */
export async function apiBlob(path: string): Promise<Blob> {
  const res = await send(path, 'GET');
  if (!res.ok) return fail(res);
  return res.blob();
}
