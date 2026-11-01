import { ApiError, apiFetch } from './api';

/**
 * The short-lived access token lives only in memory (never localStorage), so XSS cannot read a
 * long-lived credential. The long-lived refresh token is an httpOnly cookie the browser sends
 * to /auth/* automatically.
 */
let accessToken: string | null = null;
let inFlight: Promise<string | null> | null = null;
let lastRefreshHadNoSession = false;

/** True when the last refresh found no session cookie at all (a visitor who isn't signed in), as opposed to an expired or invalid one. */
export const lastRefreshFoundNoSession = () => lastRefreshHadNoSession;

export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

/** Concurrent callers share one refresh request (the server rotates the cookie on each use). */
export function refreshAccessToken(): Promise<string | null> {
  if (!inFlight) {
    inFlight = apiFetch<{ accessToken: string | null }>('/auth/refresh', { method: 'POST', credentials: 'include' })
      .then((r) => { lastRefreshHadNoSession = r.accessToken === null; return (accessToken = r.accessToken); })
      .catch((e) => {
        lastRefreshHadNoSession = false;
        if (!(e instanceof ApiError) || e.status === 401) accessToken = null;
        return null;
      })
      .finally(() => { setTimeout(() => { inFlight = null; }, 0); });
  }
  return inFlight;
}

export const jsonBody = (method: string, body?: unknown): RequestInit => ({
  method,
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

/** Calls a protected endpoint, refreshing the access token once if it has expired. */
export async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!accessToken) await refreshAccessToken();
  const run = () =>
    apiFetch<T>(path, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${accessToken ?? ''}` } });
  try {
    return await run();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      if (await refreshAccessToken()) {
        try {
          return await run();
        } catch (retryError) {
          if (retryError instanceof ApiError && retryError.status === 401 && typeof window !== 'undefined') {
            window.dispatchEvent(new Event('sazu:session-expired'));
          }
          throw retryError;
        }
      }
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('sazu:session-expired'));
    }
    throw e;
  }
}
