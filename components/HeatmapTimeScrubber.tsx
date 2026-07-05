import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
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
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: expanded ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [expanded, fadeAnim]);

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

  const bg      = isDark ? 'rgba(13,17,23,0.94)' : 'rgba(255,255,255,0.96)';
  const trackBg = isDark ? colors.slate[800] : colors.slate[200];
  const text    = isDark ? colors.slate[400] : colors.slate[500];
  const accent  = colors.brand[500];

  const timeLabel = value === 0 ? 'Now' : value < 1 ? `${Math.round(value * 60)}m ago` : `${value}h ago`;

  if (!alwaysVisible && !expanded) {
    return (
      <Pressable
        style={[s.toggleBtn, { backgroundColor: bg }]}
        onPress={() => setExpanded(true)}
        accessibilityLabel="Show time scrubber"
      >
        <Ionicons name="time-outline" size={16} color={accent} />
        {value > 0 && <Text style={[s.toggleLabel, { color: accent }]}>{timeLabel}</Text>}
      </Pressable>
    );
  }

  return (
    <Animated.View style={[s.container, { backgroundColor: bg, opacity: fadeAnim }]}>
      <View style={s.header}>
        <Ionicons name="time-outline" size={13} color={accent} />
        <Text style={[s.headerTitle, { color: isDark ? colors.white : colors.slate[800] }]}>
          Timeline
        </Text>
        <Text style={[s.currentLabel, { color: accent }]}>{timeLabel}</Text>
        {!alwaysVisible && (
          <Pressable
            onPress={() => { setExpanded(false); onTimeChange(0); }}
            style={[s.closeBtn, { backgroundColor: isDark ? colors.slate[800] : colors.slate[100] }]}
            hitSlop={8}
          >
            <Ionicons name="close" size={12} color={isDark ? colors.slate[400] : colors.slate[600]} />
          </Pressable>
        )}
      </View>

      <View
        style={[s.track, { backgroundColor: trackBg }]}
        onLayout={handleTrackLayout}
        {...panResponder.panHandlers}
      >
        <View style={[s.trackFill, { width: thumbPosition, backgroundColor: accent + '40' }]} />

        {TICK_HOURS.map((h, i) => {
          const x = (h / MAX_HOURS) * 100;
          return (
            <View key={h} style={[s.tick, { left: `${x}%` }]}>
              <View style={[s.tickLine, { backgroundColor: isDark ? colors.slate[600] : colors.slate[300] }]} />
            </View>
          );
        })}

        <View style={[s.thumb, { left: thumbPosition - 8 }]}>
          <View style={[s.thumbInner, { backgroundColor: accent }]} />
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
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
  headerTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    flex: 1,
  },
  currentLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  closeBtn: {
    width: 22, height: 22, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 6,
  },
  track: {
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  trackFill: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    borderRadius: 14,
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
    top: 6,
    width: 16, height: 16,
    borderRadius: 8,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  thumbInner: {
    width: 10, height: 10, borderRadius: 5,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  tickLabel: {
    fontSize: 9,
    fontWeight: '500',
  },
  nowDotWrap: {
    marginRight: 3,
  },
  nowDot: {
    width: 5, height: 5, borderRadius: 2.5,
  },
});
