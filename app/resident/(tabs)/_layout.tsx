import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAlertBadge } from '@/context/AlertBadgeContext';

type IoniconsName = keyof typeof Ionicons.glyphMap;

const BAR_H = 68;
const FAB = 58;
const FAB_RING = FAB + 14;

const tabMeta: Record<string, { icon: IoniconsName; iconFocused: IoniconsName; label: string }> = {
  index:        { icon: 'map-outline',           iconFocused: 'map',           label: 'Map' },
  'my-reports': { icon: 'document-text-outline', iconFocused: 'document-text', label: 'Report' },
  report:       { icon: 'add',                   iconFocused: 'add',           label: '' },
  alerts:       { icon: 'notifications-outline', iconFocused: 'notifications', label: 'Alerts' },
  profile:      { icon: 'person-circle-outline', iconFocused: 'person-circle', label: 'Profile' },
};

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { unreadCount } = useAlertBadge();
  const bottom = Platform.OS === 'ios' ? 28 : Math.max(insets.bottom, 12);

  const barBg = isDark ? '#111827' : '#EAF2FB';
  const activeColor = isDark ? '#93C5FD' : colors.brand[500];
  const inactiveColor = isDark ? '#64748B' : colors.slate[400];
  const ringBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)';
  const fabColor = colors.brand[500];
  const fabPressed = colors.brand[600];

  return (
    <View style={[st.bar, { bottom, backgroundColor: barBg }]}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const meta = tabMeta[route.name];
        if (!meta) return null;

        const isFab = route.name === 'report';
        const color = focused ? activeColor : inactiveColor;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        if (isFab) {
          return (
            <Pressable key={route.key} onPress={onPress} style={st.fabWrap}>
              {({ pressed }) => (
                <View style={[st.fabRing, { backgroundColor: barBg, borderColor: ringBorder }]}>
                  <View style={[st.fab, { backgroundColor: pressed ? fabPressed : fabColor }]}>
                    <Ionicons name="add" size={30} color="#fff" />
                  </View>
                </View>
              )}
            </Pressable>
          );
        }

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
  );
}

export default function ResidentTabLayout() {
  return (
    <Tabs tabBar={(props) => <CustomTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="my-reports" />
      <Tabs.Screen name="report" />
      <Tabs.Screen name="alerts" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const st = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 14,
    right: 14,
    height: BAR_H,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
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
  fabWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -30,
  },
  fabRing: {
    width: FAB_RING,
    height: FAB_RING,
    borderRadius: FAB_RING / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: colors.brand[700],
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
});
