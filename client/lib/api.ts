/** Typed client for the NestJS REST API. All business rules live on the server. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public requestId?: string,
    public kind?: 'network' | 'timeout',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const PUBLIC_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Server-side page requests carry a shared secret so they aren't counted against one IP by the API's rate limiter
 * (otherwise every visitor's page view would count against the web server's address). Never sent from the browser.
 */
function serverOnlyHeaders(): Record<string, string> {
  return typeof window === 'undefined' && process.env.API_INTERNAL_KEY ? { 'x-internal-key': process.env.API_INTERNAL_KEY } : {};
}

export function apiBaseUrl(): string {
  // On the server prefer an internal URL when provided (private network, no public hop).
  if (typeof window === 'undefined' && process.env.API_INTERNAL_URL) return process.env.API_INTERNAL_URL;
  return PUBLIC_BASE;
}

/**
 * The API wraps every success as `{ data }`. Two cases matter:
 *  - a legitimate `data: null` (for example "no seller profile yet") must come back as null, not as the envelope;
 *  - paginated responses are `{ data: [...], meta: {...} }` and must keep their `meta`, so they are returned whole.
 */
export function unwrapEnvelope(body: unknown): unknown {
  if (body === null || typeof body !== 'object' || Array.isArray(body) || !('data' in (body as object))) return body;
  return 'meta' in (body as object) ? body : (body as { data: unknown }).data;
}

export interface PageMeta { page: number; pageSize: number; total: number; totalPages: number }

export async function apiFetchPage<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ data: T; meta: PageMeta }> {
  return request<{ data: T; meta: PageMeta }>(path, init, false);
}

export async function apiFetch<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  return request<T>(path, init, true);
}

async function request<T>(path: string, init: RequestInit & { timeoutMs?: number }, unwrap: boolean): Promise<T> {
  const { timeoutMs = 8000, ...rest } = init;
  const controller = new AbortController();
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let slowTimer: ReturnType<typeof setTimeout> | undefined;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sazu:request', { detail: { id: requestId, stage: 'start' } }));
    slowTimer = setTimeout(() => window.dispatchEvent(new CustomEvent('sazu:request', { detail: { id: requestId, stage: 'slow' } })), 1200);
  }
  try {
    const res = await fetch(`${apiBaseUrl()}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...serverOnlyHeaders(), ...(rest.headers ?? {}) },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = Array.isArray(body?.message) ? body.message.join(', ') : body?.message;
      throw new ApiError(res.status, msg ?? 'The request could not be completed.', body?.requestId);
    }
    return (unwrap ? unwrapEnvelope(body) : body) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(0, 'The request took too long to finish. Check your connection and try again.', undefined, 'timeout');
    }
    throw new ApiError(0, 'Could not reach the SAZU Marketplace server. Check your internet connection and try again.', undefined, 'network');
  } finally {
    clearTimeout(timer);
    if (slowTimer) clearTimeout(slowTimer);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sazu:request', { detail: { id: requestId, stage: 'end' } }));
    }
  }
}
