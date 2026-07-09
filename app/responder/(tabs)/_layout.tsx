import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';

type IoniconsName = keyof typeof Ionicons.glyphMap;

const TABS: {
  name: string;
  title: string;
  icon: IoniconsName;
  iconOutline: IoniconsName;
}[] = [
  { name: 'index', title: 'HOME', icon: 'home', iconOutline: 'home-outline' },
  { name: 'map', title: 'MAP', icon: 'map', iconOutline: 'map-outline' },
  { name: 'alerts', title: 'ALERTS', icon: 'notifications', iconOutline: 'notifications-outline' },
  { name: 'profile', title: 'PROFILE', icon: 'person-circle', iconOutline: 'person-circle-outline' },
];

const TAB_COUNT = TABS.length;
const CIRCLE_SIZE = 58;
const BUMP_WIDTH = 100;
const BUMP_HEIGHT = 26;
const SPRING = { stiffness: 400, damping: 30 };

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();

  const [barWidth, setBarWidth] = useState(0);
  const circleX = useSharedValue(0);

  const activeIndex = state.index;

  useEffect(() => {
    if (barWidth > 0) {
      const tabWidth = barWidth / TAB_COUNT;
      const target = tabWidth * activeIndex + tabWidth / 2;
      circleX.value = withSpring(target, SPRING);
    }
  }, [activeIndex, barWidth]);

  // Animated styles for elements that follow the active tab
  const floatingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: circleX.value - CIRCLE_SIZE / 2 }],
  }));

  const bumpStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: circleX.value - BUMP_WIDTH / 2 }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: circleX.value - 22 }],
  }));

  const barBg = isDark ? 'rgba(13,17,23,0.90)' : 'rgba(255,255,255,0.95)';
  const barBorderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.80)';
  const bumpFill = isDark ? 'rgba(13,17,23,0.95)' : 'rgba(255,255,255,0.95)';
  const activeColor = colors.accent[500];
  const inactiveColor = isDark ? colors.slate[500] : colors.slate[400];

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(12, insets.bottom) },
      ]}
    >
      <View style={styles.innerWrapper}>
        {/* ===== Glow behind circle ===== */}
        <Animated.View style={[styles.glow, glowStyle]} pointerEvents="none">
          <View
            style={[
              styles.glowInner,
              {
                backgroundColor: isDark
                  ? 'rgba(15,168,150,0.15)'
                  : 'rgba(15,168,150,0.20)',
              },
            ]}
          />
        </Animated.View>

        {/* ===== Floating circle ===== */}
        <Animated.View
          style={[styles.circleOuter, floatingStyle]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={
              isDark
                ? ['rgba(15,168,150,0.70)', 'rgba(10,110,100,0.70)']
                : ['#6DD5C8', '#0FA896']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.circleGradient}
          >
            <View
              style={[
                styles.circleInner,
                { backgroundColor: isDark ? '#0D1117' : '#FFFFFF' },
              ]}
            >
              <Ionicons
                name={TABS[activeIndex].icon}
                size={23}
                color={activeColor}
              />
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ===== Bump connector (SVG) ===== */}
        <Animated.View
          style={[styles.bumpConnector, bumpStyle]}
          pointerEvents="none"
        >
          <Svg
            width={BUMP_WIDTH}
            height={BUMP_HEIGHT}
            viewBox="0 0 100 26"
          >
            <Path
              d="M 0 26 C 0 26 4 26 8 22 C 14 16 18 0 26 0 L 74 0 C 82 0 86 16 92 22 C 96 26 100 26 100 26 Z"
              fill={bumpFill}
            />
          </Svg>
        </Animated.View>

        {/* ===== Bar ===== */}
        <View
          style={[
            styles.bar,
            {
              backgroundColor: barBg,
              borderColor: barBorderColor,
            },
          ]}
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        >
          {state.routes.map((route, i) => {
            const tab = TABS[i];
            if (!tab) return null;
            const active = i === activeIndex;
            const iconName = active ? tab.icon : tab.iconOutline;

            return (
              <Pressable
                key={route.key}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
                style={styles.tabItem}
                accessibilityRole="button"
                accessibilityState={active ? { selected: true } : undefined}
                accessibilityLabel={tab.title}
              >
                {/* Icon — fades out when active (shown in floating circle instead) */}
                <View
                  style={{
                    opacity: active ? 0 : 0.55,
                    transform: [{ scale: active ? 0.3 : 1 }],
                  }}
                >
                  <Ionicons
                    name={iconName}
                    size={21}
                    color={inactiveColor}
                  />
                </View>

                {/* Label */}
                <Text
                  style={[
                    styles.label,
                    {
                      color: active ? activeColor : inactiveColor,
                      opacity: active ? 1 : 0.5,
                    },
                  ]}
                >
                  {tab.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function ResponderTabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="map" />
      <Tabs.Screen name="alerts" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
  },
  innerWrapper: {
    position: 'relative',
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%',
    paddingTop: 30, // space for the floating circle above the bar
  },
  glow: {
    position: 'absolute',
    top: -20,
    width: 44,
    height: 44,
    zIndex: 9,
  },
  glowInner: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
    // blur not supported natively — we approximate with a larger semi-transparent circle
  },
  circleOuter: {
    position: 'absolute',
    top: -28,
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    zIndex: 20,
  },
  circleGradient: {
    width: '100%',
    height: '100%',
    borderRadius: CIRCLE_SIZE / 2,
    padding: 3,
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(15,168,150,0.25)',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 10,
      },
      android: { elevation: 8 },
    }),
  },
  circleInner: {
    flex: 1,
    borderRadius: (CIRCLE_SIZE - 6) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bumpConnector: {
    position: 'absolute',
    top: -22,
    width: BUMP_WIDTH,
    height: BUMP_HEIGHT,
    zIndex: 10,
  },
  bar: {
    position: 'relative',
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 66,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingBottom: 10,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.08,
        shadowRadius: 15,
      },
      android: { elevation: 12 },
    }),
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
