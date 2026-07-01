import { Stack } from 'expo-router';

export default function ResponderLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="incident/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="incident/[id]/chat" options={{ presentation: 'card' }} />
      <Stack.Screen name="incident/[id]/field-report" options={{ presentation: 'card' }} />
      <Stack.Screen name="quick-report" options={{ presentation: 'modal' }} />
      <Stack.Screen name="protocols" options={{ presentation: 'card' }} />
      <Stack.Screen name="contacts" options={{ presentation: 'card' }} />
    </Stack>
  );
}
