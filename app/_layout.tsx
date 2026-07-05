import { useEffect, useRef } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AlertProvider } from '@/context/AlertContext';
import { initNotifications, onNotificationResponse } from '@/services/notifications';

function AuthGuard() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router   = useRouter();
  const listenerRef = useRef<ReturnType<typeof onNotificationResponse> | null>(null);

  useEffect(() => {
    if (isLoading) return;

    const inAuthScreen = segments[0] === 'login' || segments[0] === 'signup';

    if (!user && !inAuthScreen) {
      router.replace('/login');
    } else if (user && inAuthScreen) {
      if (user.role === 'Responder') {
        router.replace('/responder');
      } else {
        router.replace('/resident');
      }
    }
  }, [user, isLoading, segments]);

  useEffect(() => {
    if (listenerRef.current) return;
    listenerRef.current = onNotificationResponse((response) => {
      const data = response.notification.request.content.data;
      if (!user) return;

      if (data?.type === 'incident_assigned' && data.reportId) {
        router.push(`/responder/incident/${data.reportId}` as never);
      } else if (data?.type === 'incident_message' && data.reportId) {
        if (user.role === 'Responder') {
          router.push(`/responder/incident/${data.reportId}/chat` as never);
        } else {
          router.push(`/resident/report/${data.reportId}/chat` as never);
        }
      } else if (data?.type === 'status_update' && data.reportId) {
        if (user.role === 'Responder') {
          router.push(`/responder/incident/${data.reportId}` as never);
        } else {
          router.push(`/resident/report/${data.reportId}` as never);
        }
      } else if (data?.type === 'alert') {
        const route = user.role === 'Responder' ? '/responder/alerts' : '/resident/alerts';
        router.push(route as never);
      }
    });

    return () => {
      listenerRef.current?.remove();
      listenerRef.current = null;
    };
  }, [user]);

  return null;
}

function RootLayoutInner() {
  const colorScheme  = useColorScheme();
  const { isLoading } = useAuth();

  useEffect(() => { initNotifications(); }, []);

  if (isLoading) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthGuard />
      <Stack>
        <Stack.Screen name="index"     options={{ headerShown: false }} />
        <Stack.Screen name="login"     options={{ headerShown: false }} />
        <Stack.Screen name="signup"    options={{ headerShown: false }} />
        <Stack.Screen name="resident"  options={{ headerShown: false }} />
        <Stack.Screen name="responder" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export const unstable_settings = {
  anchor: 'login',
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <AlertProvider>
        <RootLayoutInner />
      </AlertProvider>
    </AuthProvider>
  );
}
