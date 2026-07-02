import { Tabs } from 'expo-router';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Platform, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { HapticTab } from '@/components/haptic-tab';
import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

type IoniconsName = keyof typeof Ionicons.glyphMap;

// ─── Tab icon with active indicator dot ──────────────────────────────────────

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
          // smooth width change via layout
        }}
      />
    </View>
  );
}

// ─── Center FAB ───────────────────────────────────────────────────────────────

function ReportFABButton({
  accessibilityLabel,
  accessibilityState,
  isDark,
  onLongPress,
  onPress,
  testID,
}: BottomTabBarButtonProps & {
  isDark: boolean;
}) {
  const ringColor = isDark ? '#0D1117' : colors.white;

  return (
    <Pressable
      onPress={(event) => onPress?.(event)}
      onLongPress={(event) => onLongPress?.(event)}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start' }}
      hitSlop={{ top: 36, left: 18, right: 18, bottom: 0 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? 'Submit new report'}
      accessibilityState={accessibilityState}
      testID={testID}
    >
      {({ pressed }) => (
        <View
          style={{
            position: 'absolute',
            top: -30,
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: pressed ? colors.brand[600] : colors.brand[500],
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 4,
            borderColor: ringColor,
            // Layered shadow for depth
            shadowColor: colors.brand[700],
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: pressed ? 0.18 : 0.38,
            shadowRadius: 14,
            elevation: pressed ? 6 : 12,
          }}
        >
          <Ionicons name="add" size={32} color={colors.white} />
        </View>
      )}
    </Pressable>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function ResidentTabLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const tabBarBg = isDark ? '#0D1117' : colors.white;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: colors.brand[500],
        tabBarInactiveTintColor: colors.slate[400],
        tabBarStyle: {
          backgroundColor: tabBarBg,
          // No top border — shadow replaces it
          borderTopWidth: 0,
          // Premium elevated shadow
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
          title: 'Map',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'map' : 'map-outline'} color={color} size={size} focused={focused} />
          ),
        }}
      />

      <Tabs.Screen
        name="my-reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name={focused ? 'document-text' : 'document-text-outline'}
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />

      {/* Center FAB — floating circle, no label */}
      <Tabs.Screen
        name="report"
        options={{
          title: '',
          tabBarLabel: () => null,
          tabBarButton: (props) => (
            <ReportFABButton {...props} isDark={isDark} />
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
