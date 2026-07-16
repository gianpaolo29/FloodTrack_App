import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as Storage from '@/utils/storage';

import { apiLogin, apiLogout, apiRegister, registerPushToken, removePushToken } from '@/services/api';
import { getExpoPushToken } from '@/services/notifications';
import { socketService } from '@/services/socket';
import type { LoginPayload, RegisterPayload, User } from '@/types';

const TOKEN_KEY      = 'floodtrack_token';
const USER_KEY       = 'floodtrack_user';
const PUSH_TOKEN_KEY = 'floodtrack_push_token';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser] = await Promise.all([
          Storage.getItem(TOKEN_KEY),
          Storage.getItem(USER_KEY),
        ]);
        if (storedToken && storedUser) {
          socketService.connect(storedToken);
          setToken(storedToken);
          setUser(JSON.parse(storedUser) as User);

          getExpoPushToken().then(async (pushToken) => {
            if (pushToken) {
              await registerPushToken(pushToken, storedToken).catch(() => {});
              await Storage.setItem(PUSH_TOKEN_KEY, pushToken);
            }
          });
        }
      } catch {
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
    if (token) {
      const pushToken = await Storage.getItem(PUSH_TOKEN_KEY);
      if (pushToken) {
        await removePushToken(pushToken, token).catch(() => {});
        await Storage.deleteItem(PUSH_TOKEN_KEY);
      }
      await apiLogout(token);
    }
    socketService.disconnect();
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
    socketService.connect(t);
    setToken(t);
    setUser(u);

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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
