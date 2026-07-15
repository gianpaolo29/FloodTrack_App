import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { HapticTab } from '@/components/haptic-tab';
import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAlertBadge } from '@/context/AlertBadgeContext';

type IoniconsName = keyof typeof Ionicons.glyphMap;

function TabIcon({
  name,
  color,
  size,
  focused,
  badge = false,
}: {
  name: IoniconsName;
  color: string;
  size: number;
  focused: boolean;
  badge?: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: focused ? color + '14' : 'transparent',
          borderRadius: 16,
          paddingHorizontal: focused ? 20 : 12,
          paddingVertical: 6,
        }}
      >
        <View>
          <Ionicons name={name} size={size} color={color} />
          {badge && (
            <View style={{
              position: 'absolute', top: -2, right: -4,
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: colors.severity.critical,
              borderWidth: 1.5, borderColor: colors.white,
            }} />
          )}
        </View>
      </View>
    </View>
  );
}

export default function ResponderTabLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { unreadCount } = useAlertBadge();

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
          shadowOpacity: isDark ? 0.3 : 0.06,
          shadowRadius: 16,
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
          title: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'home' : 'home-outline'} color={color} size={size} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'map' : 'map-outline'} color={color} size={size} focused={focused} />
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
              badge={unreadCount > 0}
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
