import { Tabs } from 'expo-router';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { HapticTab } from '@/components/haptic-tab';
import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAlertBadge } from '@/context/AlertBadgeContext';

type IoniconsName = keyof typeof Ionicons.glyphMap;

function TabIcon({
  name,
  label,
  color,
  size,
  focused,
  badge = false,
}: {
  name: IoniconsName;
  label: string;
  color: string;
  size: number;
  focused: boolean;
  badge?: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: focused ? color + '18' : 'transparent',
          borderRadius: 20,
          paddingHorizontal: focused ? 14 : 10,
          paddingVertical: 6,
          gap: 5,
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
        {focused && (
          <Text style={{
            fontSize: 11,
            fontWeight: '700',
            color,
            letterSpacing: 0.1,
          }}>
            {label}
          </Text>
        )}
      </View>
    </View>
  );
}

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
      accessibilityLabel={accessibilityLabel ?? 'Flood Report'}
      accessibilityState={accessibilityState}
      testID={testID}
    >
      {({ pressed }) => (
        <View
          style={{
            position: 'absolute',
            top: -28,
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: pressed ? colors.brand[600] : colors.brand[500],
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 3.5,
            borderColor: ringColor,
            shadowColor: colors.brand[700],
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: pressed ? 0.18 : 0.38,
            shadowRadius: 14,
            elevation: pressed ? 6 : 12,
          }}
        >
          <Ionicons name="add" size={30} color={colors.white} />
        </View>
      )}
    </Pressable>
  );
}

export default function ResidentTabLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { unreadCount } = useAlertBadge();

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
        tabBarShowLabel: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name={focused ? 'map' : 'map-outline'} label="Map" color={color} size={size} focused={focused} />
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
              label="Reports"
              color={color}
              size={size}
              focused={focused}
            />
          ),
        }}
      />

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
              label="Alerts"
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
              label="Profile"
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
