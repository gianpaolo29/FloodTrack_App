/**
 * AuthContext
 *
 * Provides auth state + actions to the whole app.
 * Token is persisted in SecureStore so sessions survive app restarts.
 * User object is stored alongside the token to avoid a round-trip on launch.
 *
 * Usage:
 *   const { user, token, login, register, logout, isLoading } = useAuth();
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as Storage from '@/utils/storage';

import { apiLogin, apiLogout, apiRegister, registerPushToken, removePushToken } from '@/services/api';
import { getExpoPushToken } from '@/services/notifications';
import type { LoginPayload, RegisterPayload, User } from '@/types';

// ─── Keys ─────────────────────────────────────────────────────────────────────

const TOKEN_KEY      = 'floodtrack_token';
const USER_KEY       = 'floodtrack_user';
const PUSH_TOKEN_KEY = 'floodtrack_push_token';

// ─── Context type ─────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: User | null;
  token: string | null;
  /** True while the stored session is being restored on app launch */
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  /** Update the cached user object (e.g. after profile edit) */
  updateUser: (user: User) => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore session on app launch
  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          Storage.getItem(TOKEN_KEY),
          Storage.getItem(USER_KEY),
        ]);
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser) as User);

          // Re-register push token on app launch (token may have changed)
          getExpoPushToken().then(async (pushToken) => {
            if (pushToken) {
              await registerPushToken(pushToken, storedToken).catch(() => {});
              await Storage.setItem(PUSH_TOKEN_KEY, pushToken);
            }
          });
        }
      } catch {
        // Corrupted store — start fresh
        await Storage.deleteItem(TOKEN_KEY);
        await Storage.deleteItem(USER_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  async function login(payload: LoginPayload) {
    const { token: t, user: u } = await apiLogin(payload);
    await persist(t, u);
  }

  async function register(payload: RegisterPayload) {
    const { token: t, user: u } = await apiRegister(payload);
    await persist(t, u);
  }

  async function logout() {
    // Remove push token from server before logging out
    if (token) {
      const pushToken = await Storage.getItem(PUSH_TOKEN_KEY);
      if (pushToken) {
        await removePushToken(pushToken, token).catch(() => {});
        await Storage.deleteItem(PUSH_TOKEN_KEY);
      }
      await apiLogout(token);
    }
    await Promise.all([
      Storage.deleteItem(TOKEN_KEY),
      Storage.deleteItem(USER_KEY),
    ]);
    setToken(null);
    setUser(null);
  }

  async function updateUser(u: User) {
    await Storage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  }

  async function persist(t: string, u: User) {
    await Promise.all([
      Storage.setItem(TOKEN_KEY, t),
      Storage.setItem(USER_KEY, JSON.stringify(u)),
    ]);
    setToken(t);
    setUser(u);

    // Register push token with server (non-blocking)
    getExpoPushToken().then(async (pushToken) => {
      if (pushToken) {
        await registerPushToken(pushToken, t).catch(() => {});
        await Storage.setItem(PUSH_TOKEN_KEY, pushToken);
      }
    });
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
