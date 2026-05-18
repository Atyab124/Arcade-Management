import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'staff';
  tenantId: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

const STORAGE_KEY = 'arcade.auth';

interface StoredAuth {
  user: User;
  accessToken: string;
  refreshToken: string;
}

function loadStored(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAuth;
  } catch {
    return null;
  }
}

function saveStored(a: StoredAuth) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
}

function clearStored() {
  localStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = useState<StoredAuth | null>(() => loadStored());

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`login failed: ${res.status} ${text}`);
    }
    const body = await res.json() as { accessToken: string; refreshToken: string; user: User };
    const next: StoredAuth = { user: body.user, accessToken: body.accessToken, refreshToken: body.refreshToken };
    saveStored(next);
    setStored(next);
  }, []);

  const logout = useCallback(async () => {
    if (stored) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: stored.refreshToken }),
      }).catch(() => {});
    }
    clearStored();
    setStored(null);
  }, [stored]);

  // Set fetch wrapper globally
  useEffect(() => {
    (window as unknown as { __apiToken: string | null }).__apiToken = stored?.accessToken ?? null;
  }, [stored]);

  const value: AuthState = useMemo(() => ({
    user: stored?.user ?? null,
    accessToken: stored?.accessToken ?? null,
    login,
    logout,
  }), [stored, login, logout]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Authenticated fetch wrapper for the API. Adds the bearer token automatically. */
export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = (window as unknown as { __apiToken: string | null }).__apiToken;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...opts, headers });
  if (!res.ok) {
    let detail: unknown = null;
    try { detail = await res.json(); } catch { /* ignore */ }
    throw Object.assign(new Error(`${res.status} ${res.statusText}`), { status: res.status, detail });
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
