export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

function buildQuery(params?: QueryParams) {
  if (!params) return '';
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    const error = (payload as { error?: { message?: string; code?: string; details?: unknown } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.message ?? `Request failed with status ${response.status}`,
      error?.code,
      error?.details,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, params?: QueryParams) => request<T>(`${path}${buildQuery(params)}`),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
};

export interface ApiEnvelope<T> {
  data: T;
}

export interface PagedEnvelope<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean };
}
