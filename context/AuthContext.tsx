import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import * as Storage from '@/utils/storage';

import { apiLogin, apiLogout, apiRegister, getCurrentUser, registerPushToken, removePushToken } from '@/services/api';
import { getExpoPushToken } from '@/services/notifications';
import { socketService } from '@/services/socket';
import type { LoginPayload, RegisterPayload, User } from '@/types';

const TOKEN_KEY        = 'floodtrack_token';
const USER_KEY         = 'floodtrack_user';
const PUSH_TOKEN_KEY   = 'floodtrack_push_token';
const HOME_ADDRESS_KEY = 'floodtrack_home_address';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => Promise<void>;
  setHomeAddress: (address: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [storedToken, storedUser, storedHomeAddress] = await Promise.all([
          Storage.getItem(TOKEN_KEY),
          Storage.getItem(USER_KEY),
          Storage.getItem(HOME_ADDRESS_KEY),
        ]);
        if (storedToken && storedUser) {
          // Validate token before connecting socket
          try {
            await getCurrentUser(storedToken);
          } catch {
            // Token is expired/invalid — clear stored credentials
            await Storage.deleteItem(TOKEN_KEY);
            await Storage.deleteItem(USER_KEY);
            return;
          }

          socketService.connect(storedToken);
          setToken(storedToken);
          const u = JSON.parse(storedUser) as User;
          if (storedHomeAddress) u.homeAddress = storedHomeAddress;
          setUser(u);

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
      Storage.deleteItem(HOME_ADDRESS_KEY),
    ]);
    setToken(null);
    setUser(null);
  }

  async function setHomeAddress(address: string | null) {
    if (address) {
      await Storage.setItem(HOME_ADDRESS_KEY, address);
    } else {
      await Storage.deleteItem(HOME_ADDRESS_KEY);
    }
    setUser(prev => prev ? { ...prev, homeAddress: address } : prev);
  }

  async function updateUser(u: User) {
    await Storage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  }

  async function persist(t: string, u: User) {
    const storedHomeAddress = await Storage.getItem(HOME_ADDRESS_KEY);
    if (storedHomeAddress) u.homeAddress = storedHomeAddress;
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
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, updateUser, setHomeAddress }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
