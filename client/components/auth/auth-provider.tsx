'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { authedFetch, jsonBody, lastRefreshFoundNoSession, refreshAccessToken, setAccessToken } from '@/lib/auth-client';

export interface Me {
  id: string;
  email: string;
  emailVerified: boolean;
  status: string;
  roles: string[];
  profile: {
    fullName: string; displayName: string; phone: string | null; campusArea: string | null;
    avatarUrl: string | null; studentVerificationStatus: string;
  };
  seller: { status: 'draft' | 'pending' | 'approved' | 'rejected' | 'suspended'; slug: string; shopName: string } | null;
}

type State = { status: 'loading' | 'anonymous' | 'authenticated'; user: Me | null };

interface AuthContextValue extends State {
  login(email: string, password: string): Promise<Me>;
  logout(): Promise<void>;
  reload(): Promise<void>;
  setUser(user: Me): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading', user: null });

  const reload = useCallback(async () => {
    // A parallel tab may have just rotated the cookie; one short retry avoids a false sign-out.
    let token = await refreshAccessToken();
    if (!token && !lastRefreshFoundNoSession()) { // (a visitor with no cookie at all can't be mid-rotation: no retry needed)
      await new Promise((r) => setTimeout(r, 400));
      token = await refreshAccessToken();
    }
    if (!token) return setState({ status: 'anonymous', user: null });
    try {
      setState({ status: 'authenticated', user: await authedFetch<Me>('/users/me') });
    } catch {
      setState({ status: 'anonymous', user: null });
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      async login(email, password) {
        const r = await apiFetch<{ accessToken: string; user: Me }>('/auth/login', jsonBody('POST', { email, password }));
        setAccessToken(r.accessToken);
        setState({ status: 'authenticated', user: r.user });
        return r.user;
      },
      async logout() {
        await apiFetch('/auth/logout', jsonBody('POST')).catch(() => undefined);
        setAccessToken(null);
        setState({ status: 'anonymous', user: null });
      },
      reload,
      setUser: (user) => setState({ status: 'authenticated', user }),
    }),
    [state, reload],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
