import { useEffect } from 'react';
import { Tabs } from 'expo-router';
import { Dimensions, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';

import { OfflineBanner } from '@/components/OfflineBanner';
import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useNetwork } from '@/hooks/use-network';

type IoniconsName = keyof typeof Ionicons.glyphMap;

// ─── Dimensions ─────────────────────────────────────────────────────────────
const SCREEN_W = Dimensions.get('window').width;
const H_MARGIN = 16;
const BAR_W = SCREEN_W - H_MARGIN * 2;
const TAB_COUNT = 4;
const TAB_W = BAR_W / TAB_COUNT;
const BAR_H = 58;
const BAR_R = BAR_H / 2;

const CIRCLE = 48;
const RING = 62;
const RING_BW = 3;
const DOME_W = 72;
const DOME_H = 30;

const TABS: { focused: IoniconsName; unfocused: IoniconsName; label: string }[] = [
  { focused: 'home', unfocused: 'home-outline', label: 'Home' },
  { focused: 'map', unfocused: 'map-outline', label: 'Map' },
  { focused: 'notifications', unfocused: 'notifications-outline', label: 'Alerts' },
  { focused: 'person-circle', unfocused: 'person-circle-outline', label: 'Profile' },
];

// ─── Custom Tab Bar ─────────────────────────────────────────────────────────

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'ios' ? Math.max(insets.bottom, 8) : 10;

  const idx = state.index;

  // ── Shared animated values ──
  const posX = useSharedValue(idx * TAB_W + TAB_W / 2);
  const circleScale = useSharedValue(1);

  useEffect(() => {
    posX.value = withSpring(idx * TAB_W + TAB_W / 2, {
      damping: 17,
      stiffness: 150,
      mass: 0.75,
    });
    circleScale.value = withTiming(0.82, { duration: 50, easing: Easing.out(Easing.quad) }, () => {
      circleScale.value = withSpring(1, { damping: 9, stiffness: 200 });
    });
  }, [idx, posX, circleScale]);

  // Dome style — slides along bar top
  const domeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: posX.value - DOME_W / 2 }],
  }));

  // Circle style — slides and bounces
  const circleStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: posX.value - RING / 2 },
      { scale: circleScale.value },
    ],
  }));

  const barBg = isDark ? '#111827' : '#FFFFFF';
  const screenBg = isDark ? colors.dark.bg : '#F4F6F9';
  const ringColor = isDark ? colors.dark.border : colors.accent[500] + '22';
  const inactive = isDark ? colors.slate[500] : colors.slate[400];
  const active = colors.accent[500];

  return (
    <View style={[$.container, { bottom: bottomPad }]} pointerEvents="box-none">
      {/* ── Floating circle ── */}
      <Animated.View style={[$.circleWrap, circleStyle]}>
        <View style={[$.ring, { borderColor: ringColor, backgroundColor: screenBg }]}>
          <View style={[$.circle, { backgroundColor: barBg, shadowColor: active }]}>
            <Ionicons name={TABS[idx].focused} size={24} color={active} />
          </View>
        </View>
      </Animated.View>

      {/* ── Dome (bump on top of bar) ── */}
      <Animated.View style={[$.dome, { backgroundColor: barBg }, domeStyle]} />

      {/* ── Bar ── */}
      <View style={[$.bar, { backgroundColor: barBg, shadowOpacity: isDark ? 0.4 : 0.08 }]}>
        {state.routes.map((route, i) => {
          const focused = idx === i;
          const tab = TABS[i];
          return (
            <Pressable
              key={route.key}
              onPress={() => {
                if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (!focused) navigation.navigate(route.name);
              }}
              style={$.tab}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={tab.label}
            >
              {focused ? (
                // Empty space where icon would be — it's in the floating circle
                <View style={{ height: 24 }} />
              ) : (
                <Ionicons name={tab.unfocused} size={22} color={inactive} />
              )}
              <Text
                style={[
                  $.label,
                  { color: focused ? active : inactive, fontWeight: focused ? '700' : '500' },
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Layout ─────────────────────────────────────────────────────────────────

export default function ResponderTabLayout() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { token } = useAuth();
  const { isOnline, syncing } = useNetwork(token);

  return (
    <View style={{ flex: 1, backgroundColor: isDark ? colors.dark.bg : '#F4F6F9' }}>
      <OfflineBanner isOnline={isOnline} syncing={syncing} />
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="map" />
        <Tabs.Screen name="alerts" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const $ = StyleSheet.create({
  container: {
    position: 'absolute',
    left: H_MARGIN,
    right: H_MARGIN,
    height: BAR_H + DOME_H + RING / 2,
  },

  // ── Bar ──
  bar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: BAR_H,
    borderRadius: BAR_R,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 20,
    elevation: 16,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    fontSize: 10,
    letterSpacing: 0.3,
  },

  // ── Dome — white bump connecting bar to circle ──
  dome: {
    position: 'absolute',
    bottom: BAR_H - 1, // overlap bar top by 1px to avoid seam
    left: 0,
    width: DOME_W,
    height: DOME_H,
    borderTopLeftRadius: DOME_W / 2,
    borderTopRightRadius: DOME_W / 2,
    zIndex: 5,
  },

  // ── Floating circle ──
  circleWrap: {
    position: 'absolute',
    bottom: BAR_H + DOME_H - RING / 2 - 2,
    left: 0,
    zIndex: 15,
  },
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: RING_BW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
});
