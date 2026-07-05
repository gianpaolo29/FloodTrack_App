import { Stack } from 'expo-router';

export default function ResidentLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="family" options={{ presentation: 'card' }} />
      <Stack.Screen name="report/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="report/[id]/chat" options={{ presentation: 'card' }} />
    </Stack>
  );
}
