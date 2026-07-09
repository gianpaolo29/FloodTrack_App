import { Stack } from 'expo-router';

export default function ResponderLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="incident/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="incident/[id]/chat" options={{ presentation: 'card' }} />
      <Stack.Screen name="incident/[id]/field-report" options={{ presentation: 'card' }} />
      <Stack.Screen name="protocols" options={{ presentation: 'card' }} />
    </Stack>
  );
}
