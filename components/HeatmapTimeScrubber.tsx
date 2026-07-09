import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

const MAX_HOURS = 48;
const TICK_HOURS = [0, 6, 12, 24, 48];
const TICK_LABELS = ['Now', '6h', '12h', '24h', '48h'];

interface Props {
  onTimeChange: (hoursAgo: number) => void;
  value: number;
  isDark: boolean;
  alwaysVisible?: boolean;
}

export function HeatmapTimeScrubber({ onTimeChange, value, isDark, alwaysVisible }: Props) {
  const [expanded, setExpanded] = useState(alwaysVisible ?? false);
  const [trackWidth, setTrackWidth] = useState(0);
  const fadeAnim = useRef(new Animated.Value(alwaysVisible ? 1 : 0)).current;
  const slideAnim = useRef(new Animated.Value(alwaysVisible ? 0 : 10)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.5, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: expanded ? 1 : 0,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: expanded ? 0 : 10,
        duration: 280,
        useNativeDriver: true,
      }),
    ]).start();
  }, [expanded, fadeAnim, slideAnim]);

  function handleTrackLayout(e: LayoutChangeEvent) {
    setTrackWidth(e.nativeEvent.layout.width);
  }

  function handleTrackPress(locationX: number) {
    if (trackWidth === 0) return;
    const ratio = Math.max(0, Math.min(1, locationX / trackWidth));
    const hours = Math.round(ratio * MAX_HOURS);
    onTimeChange(hours);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        handleTrackPress(e.nativeEvent.locationX);
      },
      onPanResponderMove: (e) => {
        handleTrackPress(e.nativeEvent.locationX);
      },
    }),
  ).current;

  const thumbPosition = trackWidth > 0 ? (value / MAX_HOURS) * trackWidth : 0;

  const bg      = isDark ? colors.overlay.heatmapCardDark : colors.overlay.heatmapCardLight;
  const trackBg = isDark ? colors.slate[800] : colors.slate[200];
  const text    = isDark ? colors.slate[400] : colors.slate[500];
  const accent  = colors.brand[500];
  const border  = isDark ? colors.overlay.heatmapBorderDark : colors.overlay.heatmapBorderLight;

  const timeLabel = value === 0 ? 'Now' : value < 1 ? `${Math.round(value * 60)}m ago` : `${value}h ago`;

  if (!alwaysVisible && !expanded) {
    return (
      <Pressable
        style={[s.toggleBtn, { backgroundColor: bg, borderColor: border }]}
        onPress={() => setExpanded(true)}
        accessibilityLabel="Show time scrubber"
      >
        <View style={[s.toggleIconWrap, { backgroundColor: accent + '15' }]}>
          <Ionicons name="time-outline" size={14} color={accent} />
        </View>
        {value > 0 && <Text style={[s.toggleLabel, { color: accent }]}>{timeLabel}</Text>}
      </Pressable>
    );
  }

  return (
    <Animated.View
      style={[
        s.container,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: fadeAnim,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={s.header}>
        <View style={[s.headerIconWrap, { backgroundColor: accent + '15' }]}>
          <Ionicons name="time-outline" size={12} color={accent} />
        </View>
        <Text style={[s.headerTitle, { color: isDark ? colors.slate[200] : colors.slate[700] }]}>
          Timeline
        </Text>
        <View style={[s.timeBadge, { backgroundColor: accent + '12' }]}>
          <Text style={[s.currentLabel, { color: accent }]}>{timeLabel}</Text>
        </View>
        {!alwaysVisible && (
          <Pressable
            onPress={() => { setExpanded(false); onTimeChange(0); }}
            style={[s.closeBtn, { backgroundColor: isDark ? colors.slate[800] : colors.slate[100] }]}
            hitSlop={8}
          >
            <Ionicons name="close" size={11} color={isDark ? colors.slate[400] : colors.slate[600]} />
          </Pressable>
        )}
      </View>

      <View
        style={[s.track, { backgroundColor: trackBg }]}
        onLayout={handleTrackLayout}
        {...panResponder.panHandlers}
      >
        <View style={[s.trackFill, { width: thumbPosition, backgroundColor: accent + '30' }]} />

        {TICK_HOURS.map((h) => {
          const x = (h / MAX_HOURS) * 100;
          return (
            <View key={h} style={[s.tick, { left: `${x}%` }]}>
              <View style={[s.tickLine, { backgroundColor: isDark ? colors.slate[600] : colors.slate[300] }]} />
            </View>
          );
        })}

        <View style={[s.thumb, { left: thumbPosition - 9 }]}>
          <View style={[s.thumbOuter, { borderColor: accent + '30' }]}>
            <View style={[s.thumbInner, { backgroundColor: accent }]} />
          </View>
        </View>
      </View>

      <View style={s.labelRow}>
        {TICK_HOURS.map((h, i) => (
          <Text
            key={h}
            style={[
              s.tickLabel,
              { color: h === 0 ? accent : text },
              h === 0 && { fontWeight: '700' },
            ]}
          >
            {i === 0 ? (
              <View style={s.nowDotWrap}>
                <Animated.View style={[s.nowDot, { backgroundColor: accent, transform: [{ scale: pulseAnim }] }]} />
              </View>
            ) : null}
            {TICK_LABELS[i]}
          </Text>
        ))}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    borderRadius: 14,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  toggleIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    flex: 1,
  },
  timeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  currentLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 4,
  },
  track: {
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trackFill: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    borderRadius: 15,
  },
  tick: {
    position: 'absolute',
    top: 0, bottom: 0,
    width: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickLine: {
    width: 1,
    height: 10,
    borderRadius: 0.5,
  },
  thumb: {
    position: 'absolute',
    top: 3,
    width: 24, height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbOuter: {
    width: 20, height: 20,
    borderRadius: 10,
    borderWidth: 3,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.18,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  thumbInner: {
    width: 8, height: 8, borderRadius: 4,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  tickLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  nowDotWrap: {
    marginRight: 3,
  },
  nowDot: {
    width: 5, height: 5, borderRadius: 2.5,
  },
});
