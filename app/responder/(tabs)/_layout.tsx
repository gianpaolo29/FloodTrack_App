import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAlertBadge } from '@/context/AlertBadgeContext';
import { useAuth } from '@/context/AuthContext';
import { useNetwork } from '@/hooks/use-network';
import { OfflineBanner } from '@/components/OfflineBanner';

type IoniconsName = keyof typeof Ionicons.glyphMap;

const BAR_H = 68;

const tabMeta: Record<string, { icon: IoniconsName; iconFocused: IoniconsName; label: string }> = {
  index:       { icon: 'home-outline',          iconFocused: 'home',          label: 'Home' },
  assignments: { icon: 'list-outline',          iconFocused: 'list',          label: 'Assigned' },
  map:         { icon: 'map-outline',           iconFocused: 'map',           label: 'Maps' },
  alerts:      { icon: 'notifications-outline', iconFocused: 'notifications', label: 'Alerts' },
  profile:     { icon: 'person-circle-outline', iconFocused: 'person-circle', label: 'Profile' },
};

function CustomTabBar({ state, navigation, isOnline, syncing, pendingCount }: BottomTabBarProps & {
  isOnline: boolean;
  syncing: boolean;
  pendingCount: number;
}) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { unreadCount } = useAlertBadge();
  const bottom = Math.max(insets.bottom, 12);

  const barBg = isDark ? '#111827' : colors.slate[50];
  const activeColor = isDark ? '#93C5FD' : colors.brand[500];
  const inactiveColor = isDark ? '#64748B' : colors.slate[400];

  return (
    <View style={[st.barOuter, { paddingBottom: bottom, backgroundColor: barBg }]}>
      <OfflineBanner isOnline={isOnline} syncing={syncing} pendingCount={pendingCount} />
      <View style={st.bar}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const meta = tabMeta[route.name];
          if (!meta) return null;

          const color = focused ? activeColor : inactiveColor;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable key={route.key} onPress={onPress} style={st.tab} android_ripple={null}>
              <View>
                <Ionicons name={focused ? meta.iconFocused : meta.icon} size={23} color={color} />
                {route.name === 'alerts' && unreadCount > 0 && (
                  <View style={st.badge}>
                    <Text style={st.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                  </View>
                )}
              </View>
              <Text style={[st.label, { color }]}>{meta.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function ResponderTabLayout() {
  const { token } = useAuth();
  const { isOnline, syncing, pendingCount } = useNetwork(token);

  return (
    <Tabs
      tabBar={(props) => (
        <CustomTabBar {...props} isOnline={isOnline} syncing={syncing} pendingCount={pendingCount} />
      )}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="assignments" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="alerts" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const st = StyleSheet.create({
  barOuter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  bar: {
    height: BAR_H,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.severity.critical,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },
});
