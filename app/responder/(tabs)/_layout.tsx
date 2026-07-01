import { useRef, useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Animated, Platform, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { OfflineBanner } from '@/components/OfflineBanner';
import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useNetwork } from '@/hooks/use-network';

type IoniconsName = keyof typeof Ionicons.glyphMap;

// ─── Animated tab icon ──────────────────────────────────────────────────────

function TabIcon({ name, color, size, focused }: {
  name: IoniconsName; color: string; size: number; focused: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const indicatorWidth = useRef(new Animated.Value(focused ? 18 : 0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: focused ? 1.1 : 1, friction: 5, useNativeDriver: true }),
      Animated.spring(indicatorWidth, { toValue: focused ? 18 : 0, friction: 6, useNativeDriver: false }),
    ]).start();
  }, [focused, scale, indicatorWidth]);

  return (
    <View style={t.iconWrap}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Ionicons name={name} size={size - 1} color={color} />
      </Animated.View>
      <Animated.View style={[t.indicator, { width: indicatorWidth, backgroundColor: color }]} />
    </View>
  );
}

const t = StyleSheet.create({
  iconWrap: { alignItems: 'center', gap: 5 },
  indicator: { height: 3, borderRadius: 1.5 },
});

// ─── Layout ─────────────────────────────────────────────────────────────────

export default function ResponderTabLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { isOnline, syncing } = useNetwork(token);

  const tabBarBg    = isDark ? '#0A0E14' : '#FFFFFF';
  const tabBarBorder = isDark ? colors.dark.border : 'transparent';
  const bottomPad   = Platform.OS === 'ios' ? Math.max(insets.bottom, 16) : 12;

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.dark.bg : '#F4F6F9' }}>
      <OfflineBanner isOnline={isOnline} syncing={syncing} />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarActiveTintColor: colors.accent[500],
          tabBarInactiveTintColor: isDark ? colors.slate[500] : colors.slate[400],
          tabBarStyle: {
            backgroundColor: tabBarBg,
            borderTopWidth: isDark ? 1 : 0,
            borderTopColor: tabBarBorder,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -6 },
            shadowOpacity: isDark ? 0.4 : 0.08,
            shadowRadius: 20,
            elevation: 20,
            height: 56 + bottomPad,
            paddingBottom: bottomPad,
            paddingTop: 8,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 0.2,
            marginTop: -2,
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
              <TabIcon name={focused ? 'notifications' : 'notifications-outline'} color={color} size={size} focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size, focused }) => (
              <TabIcon name={focused ? 'person-circle' : 'person-circle-outline'} color={color} size={size} focused={focused} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
