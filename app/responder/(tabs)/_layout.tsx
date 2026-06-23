import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { HapticTab } from '@/components/haptic-tab';
import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

type IoniconsName = keyof typeof Ionicons.glyphMap;

// ─── Tab icon with active indicator ──────────────────────────────────────────

function TabIcon({
  name,
  color,
  size,
  focused,
}: {
  name: IoniconsName;
  color: string;
  size: number;
  focused: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 4 }}>
      <Ionicons name={name} size={size} color={color} />
      <View
        style={{
          width: focused ? 16 : 4,
          height: 3,
          borderRadius: 2,
          backgroundColor: focused ? color : 'transparent',
        }}
      />
    </View>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function ResponderTabLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const tabBarBg = isDark ? '#0D1117' : colors.white;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: colors.accent[500],
        tabBarInactiveTintColor: colors.slate[400],
        tabBarStyle: {
          backgroundColor: tabBarBg,
          borderTopWidth: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: isDark ? 0.35 : 0.08,
          shadowRadius: 20,
          elevation: 16,
          height: Platform.OS === 'ios' ? 90 : 72,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.2,
          marginTop: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Incidents',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name={focused ? 'shield-checkmark' : 'shield-checkmark-outline'}
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name={focused ? 'notifications' : 'notifications-outline'}
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />

      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name={focused ? 'person-circle' : 'person-circle-outline'}
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}
