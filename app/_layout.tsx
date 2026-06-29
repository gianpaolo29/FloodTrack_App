import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AlertProvider } from '@/context/AlertContext';

// ─── Auth guard ───────────────────────────────────────────────────────────────
// Runs on every navigation event. Redirects unauthenticated users to login and
// authenticated users away from auth screens.

function AuthGuard() {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router   = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthScreen = segments[0] === 'login' || segments[0] === 'signup';

    if (!user && !inAuthScreen) {
      // Not logged in and trying to access a protected screen
      router.replace('/login');
    } else if (user && inAuthScreen) {
      // Already logged in — redirect based on role
      if (user.role === 'Responder') {
        router.replace('/responder');
      } else {
        router.replace('/resident');
      }
    }
  }, [user, isLoading, segments]);

  return null;
}

// ─── Inner layout (needs access to useAuth) ───────────────────────────────────

function RootLayoutInner() {
  const colorScheme  = useColorScheme();
  const { isLoading } = useAuth();

  // Keep the app blank (Expo splash is still showing) while the session restores
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

// ─── Root layout ──────────────────────────────────────────────────────────────

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
