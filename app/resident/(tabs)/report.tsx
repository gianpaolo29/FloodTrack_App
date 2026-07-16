import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  type SharedValue,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
  interpolate,
  interpolateColor,
  useDerivedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { colors } from '@/theme/colors';
import { SeverityChip, type Severity } from '@/components/SeverityChip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useAlert } from '@/context/AlertContext';
import type { AlertConfig } from '@/components/AppAlert';
import { getAllReports, submitReport } from '@/services/api';


function isVideoUri(uri: string): boolean {
  const ext = uri.split('.').pop()?.toLowerCase();
  return ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext ?? '');
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371, toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

const HAZARD_TYPE = 'flood';

interface SeverityOption {
  level: Severity;
  label: string;
  description: string;
}

const SEVERITY_OPTIONS: SeverityOption[] = [
  { level: 'low',      label: 'Low',      description: 'Passable, monitor only'            },
  { level: 'moderate', label: 'Moderate', description: 'Caution, may worsen'               },
  { level: 'high',     label: 'High',     description: 'Unsafe, prompt action needed'      },
  { level: 'critical', label: 'Critical', description: 'Life-threatening, immediate dispatch' },
];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <View style={stepStyles.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            stepStyles.dot,
            i < current
              ? { backgroundColor: colors.white }
              : i === current
              ? { backgroundColor: colors.white, width: 22, borderRadius: 4 }
              : { backgroundColor: 'rgba(255,255,255,0.3)' },
          ]}
        />
      ))}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { height: 6, width: 6, borderRadius: 3 },
});

interface LocationData {
  latitude: number;
  longitude: number;
  address: string;
}

function LocationBanner({
  isDark,
  location,
  detecting,
  onRefresh,
}: {
  isDark: boolean;
  location: LocationData | null;
  detecting: boolean;
  onRefresh: () => void;
}) {
  const hasLoc = !!location;
  const bgColor = detecting
    ? (isDark ? colors.dark.card : colors.brand[50])
    : hasLoc
    ? (isDark ? colors.dark.card : colors.brand[50])
    : (isDark ? '#2A1A1A' : '#FEF2F2');
  const borderColor = detecting
    ? (isDark ? colors.dark.border : colors.brand[100])
    : hasLoc
    ? (isDark ? colors.dark.border : colors.brand[100])
    : (isDark ? '#4A2020' : '#FECACA');

  return (
    <View style={[styles.locBanner, { backgroundColor: bgColor, borderColor }]}>
      {detecting ? (
        <ActivityIndicator size="small" color={colors.brand[500]} />
      ) : (
        <Ionicons
          name={hasLoc ? 'location' : 'location-outline'}
          size={16}
          color={hasLoc ? colors.brand[500] : colors.severity.critical}
        />
      )}
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.locBannerText, { color: isDark ? colors.white : colors.slate[700] }]}
          numberOfLines={1}
        >
          {detecting ? 'Detecting your location…' : hasLoc ? location.address : 'Location required to continue'}
        </Text>
        {!hasLoc && !detecting && (
          <Text style={{ fontSize: 11, color: isDark ? colors.slate[500] : colors.slate[400], marginTop: 2 }}>
            Tap refresh to detect your location
          </Text>
        )}
      </View>
      <Pressable
        onPress={onRefresh}
        accessibilityRole="button"
        accessibilityLabel="Re-detect location"
        hitSlop={8}
        disabled={detecting}
        style={[styles.locRefreshBtn, { backgroundColor: isDark ? colors.dark.elevated : (hasLoc ? colors.brand[50] : '#FEE2E2') }]}
      >
        <Ionicons
          name={detecting ? 'hourglass-outline' : 'refresh'}
          size={14}
          color={detecting ? colors.slate[400] : hasLoc ? colors.brand[500] : colors.severity.critical}
        />
      </Pressable>
    </View>
  );
}


function SeverityStep({
  selected,
  onSelect,
  isDark,
}: {
  selected: Severity | null;
  onSelect: (s: Severity) => void;
  isDark: boolean;
}) {
  return (
    <View style={styles.stepBody}>
      <Text style={[styles.stepTitle, isDark && { color: colors.white }]}>
        How severe is it?
      </Text>
      <Text style={[styles.stepSubtitle, isDark && { color: colors.slate[400] }]}>
        Choose the level that best describes the danger.
      </Text>

      <View style={{ gap: 12 }}>
        {SEVERITY_OPTIONS.map(opt => {
          const active    = selected === opt.level;
          const levelColor = colors.severity[opt.level];
          return (
            <Pressable
              key={opt.level}
              onPress={() => onSelect(opt.level)}
              style={({ pressed }) => [
                styles.severityCard,
                isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border },
                active && {
                  borderColor: levelColor,
                  borderWidth: 1.5,
                  backgroundColor: isDark ? levelColor + '15' : levelColor + '08',
                },
                pressed && !active && { backgroundColor: isDark ? colors.dark.elevated : colors.slate[50] },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={`${opt.label}: ${opt.description}`}
            >
              <View style={[styles.severityLeft, { borderColor: levelColor + '40', backgroundColor: levelColor + '14' }]}>
                <Ionicons
                  name={
                    opt.level === 'low'      ? 'information-circle' :
                    opt.level === 'moderate' ? 'warning'            :
                    opt.level === 'high'     ? 'alert-circle'       : 'alert'
                  }
                  size={22}
                  color={levelColor}
                />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.severityLabel, isDark && { color: colors.white }]}>
                  {opt.label}
                </Text>
                <Text style={[styles.severityDesc, isDark && { color: colors.slate[400] }]}>
                  {opt.description}
                </Text>
              </View>
              {active && (
                <Ionicons name="checkmark-circle" size={20} color={levelColor} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const DEPTH_LEVELS = [
  { key: 'ankle', label: 'Ankle-deep',    cm: 30,  severity: 'low'      as Severity, desc: '~ 1 ft — passable with caution' },
  { key: 'knee',  label: 'Knee-deep',     cm: 60,  severity: 'moderate' as Severity, desc: '~ 1.5–2 ft — difficult for vehicles' },
  { key: 'waist', label: 'Waist-deep',    cm: 100, severity: 'high'     as Severity, desc: '~ 3 ft — unsafe for pedestrians' },
  { key: 'chest', label: 'Chest & above', cm: 150, severity: 'critical' as Severity, desc: '> 4 ft — life-threatening' },
] as const;

type DepthKey = typeof DEPTH_LEVELS[number]['key'];

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const PICKER_H = Math.max(320, Math.min(480, SCREEN_H * 0.48));
const FIGURE_SCALE = PICKER_H / 400;

const SNAPS = [0.12, 0.30, 0.52, 0.74];

const TICK_LABELS = ['0.5 ft', '1.5 ft', '3 ft', '4+ ft'];

function FloodDepthPicker({
  selected,
  onSelect,
  isDark,
}: {
  selected: DepthKey | null;
  onSelect: (key: DepthKey, severity: Severity) => void;
  isDark: boolean;
}) {
  const initIdx  = selected ? DEPTH_LEVELS.findIndex(d => d.key === selected) : -1;
  const initFrac = initIdx >= 0 ? SNAPS[initIdx] : 0;

  const waterFrac = useSharedValue(initFrac);
  const dragStart = useSharedValue(initFrac);

  const waveOffset = useSharedValue(0);
  useEffect(() => {
    waveOffset.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.linear }),
      -1,
      false,
    );
  }, []);
  const waveStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(waveOffset.value, [0, 1], [0, -24]) }],
  }));

  function snapNearest(frac: number): number {
    'worklet';
    let best = 0, min = Math.abs(frac - SNAPS[0]);
    for (let i = 1; i < SNAPS.length; i++) {
      const d = Math.abs(frac - SNAPS[i]);
      if (d < min) { min = d; best = i; }
    }
    return best;
  }

  function onPick(idx: number) {
    const l = DEPTH_LEVELS[idx];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect(l.key, l.severity);
  }

  function onTapLevel(idx: number) {
    waterFrac.value = withSpring(SNAPS[idx], { damping: 20, stiffness: 200 });
    onPick(idx);
  }

  const pan = Gesture.Pan()
    .onStart(() => { dragStart.value = waterFrac.value; })
    .onUpdate(e => {
      const delta = -e.translationY / PICKER_H;
      waterFrac.value = Math.max(0.04, Math.min(0.92, dragStart.value + delta));
    })
    .onEnd(() => {
      const idx = snapNearest(waterFrac.value);
      waterFrac.value = withSpring(SNAPS[idx], { damping: 20, stiffness: 200 });
      runOnJS(onPick)(idx);
    });

  const waterStyle = useAnimatedStyle(() => ({
    height: `${waterFrac.value * 100}%`,
  }));

  const waterColorStyle = useAnimatedStyle(() => {
    const c = isDark
      ? interpolateColor(
          waterFrac.value,
          [0, 0.15, 0.35, 0.55, 0.78],
          [
            'rgba(59,150,255,0.30)',
            'rgba(34,197,94,0.35)',
            'rgba(250,190,21,0.40)',
            'rgba(249,115,22,0.45)',
            'rgba(239,68,68,0.50)',
          ],
        )
      : interpolateColor(
          waterFrac.value,
          [0, 0.15, 0.35, 0.55, 0.78],
          [
            'rgba(59,150,255,0.22)',
            'rgba(34,197,94,0.28)',
            'rgba(250,190,21,0.32)',
            'rgba(249,115,22,0.35)',
            'rgba(239,68,68,0.40)',
          ],
        );
    return { backgroundColor: c };
  });

  const handlePos = useAnimatedStyle(() => ({
    bottom: `${waterFrac.value * 100}%`,
  }));

  const depthFt = useDerivedValue(() => {
    const cm = interpolate(waterFrac.value, [0, 1], [0, 161]);
    return Math.round(cm / 30.48 * 10) / 10;
  });

  const textColor  = isDark ? colors.white : colors.slate[900];
  const subColor   = isDark ? colors.slate[400] : colors.slate[500];
  const bg         = isDark ? '#080F1A' : '#E8F0FB';
  const border     = isDark ? 'rgba(80,140,220,0.18)' : 'rgba(30,100,180,0.15)';
  const skinColor  = isDark ? '#A0B8CC' : '#D4A574';
  const skinDark   = isDark ? '#7A96AB' : '#B8895C';
  const hairColor  = isDark ? '#2C3A4C' : '#2C1810';
  const shirtColor = isDark ? '#3B6B9E' : '#4A8EC9';
  const shirtDark  = isDark ? '#2E5580' : '#3A7AB5';
  const pantsColor = isDark ? '#2A3A50' : '#3D5A80';
  const groundDark = isDark ? '#0E1A28' : '#C4D4E4';
  const groundMid  = isDark ? '#12202F' : '#B8CAD8';

  const glowPulse = useSharedValue(0);
  useEffect(() => {
    glowPulse.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
  }, []);
  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowPulse.value, [0, 1], [0.5, 1]),
    transform: [{ scale: interpolate(glowPulse.value, [0, 1], [1, 1.25]) }],
  }));

  const selectedLabel = selected
    ? DEPTH_LEVELS.find(d => d.key === selected)?.label ?? ''
    : '';

  return (
    <View
      style={fdp.stepBody}
      accessibilityRole="adjustable"
      accessibilityLabel={selected ? `Flood depth: ${selectedLabel}` : 'Flood depth picker'}
      accessibilityHint="Swipe up or down to change flood depth, or tap a level on the right"
      accessibilityActions={[
        { name: 'increment', label: 'Increase depth' },
        { name: 'decrement', label: 'Decrease depth' },
      ]}
      onAccessibilityAction={e => {
        const curIdx = selected ? DEPTH_LEVELS.findIndex(d => d.key === selected) : -1;
        if (e.nativeEvent.actionName === 'increment' && curIdx < DEPTH_LEVELS.length - 1) {
          onTapLevel(curIdx + 1);
        } else if (e.nativeEvent.actionName === 'decrement' && curIdx > 0) {
          onTapLevel(curIdx - 1);
        }
      }}
    >
      <Text style={[fdp.title, { color: textColor }]}>How deep is the flood?</Text>
      <Text style={[fdp.subtitle, { color: subColor }]}>
        Drag the water level or tap a depth level.
      </Text>

      <GestureHandlerRootView style={{ flex: 0 }}>
        <GestureDetector gesture={pan}>
          <Animated.View style={[fdp.card, { backgroundColor: bg, borderColor: border }]}>

            {/* Sky gradient overlay */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <View style={[fdp.skyTop, { backgroundColor: isDark ? 'rgba(15,25,40,0.6)' : 'rgba(180,210,245,0.25)' }]} />
            </View>

            <View style={[fdp.ground, { backgroundColor: groundDark }]} pointerEvents="none">
              <View style={[fdp.groundTopStripe, { backgroundColor: groundMid }]} />
              <View style={[fdp.groundGrass, { backgroundColor: isDark ? '#152218' : '#8CAA7C' }]} />
            </View>

            <View style={fdp.scaleCol} pointerEvents="none">
              {SNAPS.map((snap, i) => (
                <View key={i} style={[fdp.tick, { bottom: `${snap * 100}%` }]}>
                  <View style={[fdp.tickLine, { backgroundColor: isDark ? 'rgba(100,160,230,0.35)' : 'rgba(30,100,180,0.25)' }]} />
                  <Text style={[fdp.tickLabel, { color: isDark ? colors.slate[500] : colors.slate[400] }]}>{TICK_LABELS[i]}</Text>
                </View>
              ))}
            </View>

            <View style={fdp.centerCol}>
              <Animated.View style={[fdp.water, waterStyle, waterColorStyle]}>
                <Animated.View style={[fdp.waves, waveStyle]}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                    <View key={i} style={[fdp.wave, {
                      backgroundColor: isDark ? 'rgba(100,180,255,0.25)' : 'rgba(59,130,246,0.18)',
                    }]} />
                  ))}
                </Animated.View>
                <Animated.View style={[fdp.waves, { top: 3 }, waveStyle]}>
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
                    <View key={i} style={[fdp.wave, { width: 20, height: 7, marginLeft: -2,
                      backgroundColor: isDark ? 'rgba(100,180,255,0.15)' : 'rgba(59,130,246,0.10)',
                    }]} />
                  ))}
                </Animated.View>
              </Animated.View>

              <View style={fdp.human} pointerEvents="none">
                {/* Hair */}
                <View style={[fdp.hair, { backgroundColor: hairColor }]} />
                {/* Head */}
                <View style={[fdp.head, { backgroundColor: skinColor }]}>
                  <View style={fdp.faceRow}>
                    <View style={[fdp.eye, { backgroundColor: hairColor }]} />
                    <View style={[fdp.eye, { backgroundColor: hairColor }]} />
                  </View>
                  <View style={[fdp.mouth, { backgroundColor: skinDark }]} />
                </View>
                <View style={[fdp.neck, { backgroundColor: skinColor }]} />
                {/* Shirt with collar */}
                <View style={fdp.shoulderWrap}>
                  <View style={[fdp.shoulder, { backgroundColor: shirtColor }]}>
                    <View style={[fdp.collar, { borderBottomColor: shirtDark }]} />
                  </View>
                </View>
                <View style={fdp.torsoWrap}>
                  {/* Left sleeve + arm */}
                  <View style={fdp.armCol}>
                    <View style={[fdp.upperArm, { backgroundColor: shirtColor }]} />
                    <View style={[fdp.forearm, { backgroundColor: skinColor }]} />
                    <View style={[fdp.hand, { backgroundColor: skinColor }]} />
                  </View>
                  {/* Torso (shirt) */}
                  <View style={[fdp.torso, { backgroundColor: shirtColor }]}>
                    <View style={[fdp.shirtLine, { backgroundColor: shirtDark }]} />
                    <View style={[fdp.beltLine, { backgroundColor: pantsColor }]} />
                  </View>
                  {/* Right sleeve + arm */}
                  <View style={fdp.armCol}>
                    <View style={[fdp.upperArm, { backgroundColor: shirtColor }]} />
                    <View style={[fdp.forearm, { backgroundColor: skinColor }]} />
                    <View style={[fdp.hand, { backgroundColor: skinColor }]} />
                  </View>
                </View>
                {/* Pants */}
                <View style={[fdp.hips, { backgroundColor: pantsColor }]} />
                <View style={fdp.legsWrap}>
                  <View style={fdp.legCol}>
                    <View style={[fdp.thigh, { backgroundColor: pantsColor }]} />
                    <View style={[fdp.shin, { backgroundColor: pantsColor }]} />
                    <View style={[fdp.ankle, { backgroundColor: pantsColor }]} />
                  </View>
                  <View style={fdp.legCol}>
                    <View style={[fdp.thigh, { backgroundColor: pantsColor }]} />
                    <View style={[fdp.shin, { backgroundColor: pantsColor }]} />
                    <View style={[fdp.ankle, { backgroundColor: pantsColor }]} />
                  </View>
                </View>
                {/* Shoes */}
                <View style={fdp.feetWrap}>
                  <View style={[fdp.foot, { backgroundColor: isDark ? '#1A2535' : '#2C2C2C' }]} />
                  <View style={[fdp.foot, { backgroundColor: isDark ? '#1A2535' : '#2C2C2C' }]} />
                </View>
              </View>

              <Animated.View style={[fdp.handleRow, handlePos]} pointerEvents="none">
                <View style={[fdp.handleLine, { backgroundColor: isDark ? 'rgba(59,165,246,0.55)' : 'rgba(59,130,246,0.40)' }]} />
                <View style={[fdp.pill, {
                  shadowColor: isDark ? '#3B9BFF' : colors.brand[500],
                }]}>
                  <Ionicons name="water" size={13} color="#fff" />
                  <DepthFtText depthFt={depthFt} />
                </View>
                <View style={[fdp.handleLine, { backgroundColor: isDark ? 'rgba(59,165,246,0.55)' : 'rgba(59,130,246,0.40)' }]} />
              </Animated.View>

              {!selected && (
                <View style={fdp.dragHint} pointerEvents="none">
                  <View style={[fdp.dragHintBg, { backgroundColor: isDark ? 'rgba(59,130,246,0.15)' : 'rgba(59,130,246,0.10)' }]}>
                    <Ionicons name="swap-vertical" size={18} color={colors.brand[500]} />
                    <Text style={[fdp.dragHintText, { color: colors.brand[500] }]}>Drag to set level</Text>
                  </View>
                </View>
              )}
            </View>

            <View style={fdp.labelCol}>
              {DEPTH_LEVELS.map((level, i) => {
                const c = colors.severity[level.severity];
                const active = selected === level.key;
                return (
                  <Pressable
                    key={level.key}
                    style={[fdp.labelItem, { bottom: `${SNAPS[i] * 100}%` }]}
                    onPress={() => onTapLevel(i)}
                    hitSlop={10}
                    accessibilityRole="radio"
                    accessibilityLabel={`${level.label}, ${level.desc}`}
                    accessibilityState={{ checked: active }}
                  >
                    {active ? (
                      <Animated.View style={[fdp.labelDotOuter, { borderColor: c + '50', backgroundColor: c + '15' }, glowStyle]}>
                        <View style={[fdp.labelDotInner, { backgroundColor: c }]} />
                      </Animated.View>
                    ) : (
                      <View style={[fdp.labelDot, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderColor: c + '40' }]} />
                    )}
                    <View style={active ? [fdp.labelPill, { backgroundColor: c + '18', borderColor: c + '30' }] : undefined}>
                      <Text style={[
                        fdp.labelText,
                        { color: active ? c : subColor },
                        active && fdp.labelTextActive,
                      ]}>
                        {level.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>

      {selected && (() => {
        const l = DEPTH_LEVELS.find(d => d.key === selected)!;
        const c = colors.severity[l.severity];
        return (
          <View style={[fdp.banner, {
            backgroundColor: isDark ? c + '15' : c + '0C',
            borderColor: isDark ? c + '30' : c + '22',
          }]}>
            <View style={[fdp.bannerIcon, {
              backgroundColor: c + '18',
              borderWidth: 1,
              borderColor: c + '25',
            }]}>
              <Ionicons name="water" size={18} color={c} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[fdp.bannerTitle, { color: c }]}>{l.label}</Text>
              <Text style={[fdp.bannerDesc, { color: isDark ? colors.slate[400] : colors.slate[500] }]}>{l.desc}</Text>
            </View>
            <View style={[fdp.bannerBadge, { backgroundColor: c + '18' }]}>
              <Text style={[fdp.bannerBadgeText, { color: c }]}>
                {TICK_LABELS[DEPTH_LEVELS.indexOf(l)]}
              </Text>
            </View>
          </View>
        );
      })()}
    </View>
  );
}

function DepthFtText({ depthFt }: { depthFt: SharedValue<number> }) {
  const [val, setVal] = useState(0);
  useDerivedValue(() => { runOnJS(setVal)(depthFt.value); });
  return <Text style={fdp.pillText}>{(Math.round(val * 10) / 10).toFixed(1)} ft</Text>;
}

const s = (v: number) => Math.round(v * FIGURE_SCALE);

const fdp = StyleSheet.create({
  stepBody:  { padding: SCREEN_W < 360 ? 16 : 24, gap: 18 },
  title:     { fontSize: SCREEN_W < 360 ? 19 : 22, fontWeight: '800', letterSpacing: -0.3 },
  subtitle:  { fontSize: SCREEN_W < 360 ? 13 : 14, lineHeight: 20, letterSpacing: 0.1 },

  card: {
    flexDirection: 'row',
    borderRadius: 28,
    borderWidth: 1.5,
    height: PICKER_H,
    overflow: 'hidden',
    shadowColor: '#1A3A5C',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
    elevation: 14,
  },

  skyTop: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '40%',
  },

  ground: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: '12%', zIndex: 0,
  },
  groundTopStripe: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 3, opacity: 0.5,
  },
  groundGrass: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 2, opacity: 0.4,
  },

  scaleCol: { width: s(52), position: 'relative', zIndex: 2 },
  tick: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingLeft: 6,
  },
  tickLine: { width: 10, height: 1, borderRadius: 0.5 },
  tickLabel: { fontSize: SCREEN_W < 360 ? 8 : 9, fontWeight: '700', letterSpacing: 0.3 },

  centerCol: { flex: 1, position: 'relative', overflow: 'hidden', zIndex: 1 },

  water: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    overflow: 'hidden', zIndex: 1,
  },
  waves: {
    flexDirection: 'row', position: 'absolute', top: -5, left: -6, right: -6,
  },
  wave: { width: 24, height: 10, borderRadius: 12, marginLeft: -3 },

  human: {
    position: 'absolute',
    bottom: s(10),
    alignSelf: 'center',
    left: 0, right: 0,
    alignItems: 'center',
    zIndex: 2,
  },
  hair: {
    width: s(34), height: s(18), borderTopLeftRadius: s(17), borderTopRightRadius: s(17),
    marginBottom: s(-4), zIndex: 3,
  },
  head: {
    width: s(40), height: s(40), borderRadius: s(20),
    zIndex: 2, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 2, elevation: 1,
  },
  faceRow: {
    flexDirection: 'row', gap: s(12), marginTop: s(2),
  },
  eye: { width: s(4), height: s(4), borderRadius: s(2) },
  mouth: { width: s(8), height: s(3), borderRadius: s(1.5), marginTop: s(4) },
  neck: { width: s(10), height: s(8), zIndex: 1, marginTop: s(-1) },
  shoulderWrap: { zIndex: 1, marginTop: s(-2) },
  shoulder: {
    width: s(62), height: s(16), borderTopLeftRadius: s(12), borderTopRightRadius: s(12),
    alignItems: 'center', overflow: 'hidden',
  },
  collar: {
    width: s(14), height: 0,
    borderBottomWidth: s(6),
    borderLeftWidth: s(8), borderRightWidth: s(8),
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    marginTop: s(-1),
  },
  torsoWrap: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginTop: s(-2), zIndex: 1,
  },
  torso: {
    width: s(48), height: s(96), borderRadius: s(8),
    overflow: 'hidden',
  },
  shirtLine: {
    position: 'absolute', top: '38%', left: 0, right: 0,
    height: 1, opacity: 0.2,
  },
  beltLine: {
    position: 'absolute', bottom: '8%', left: '10%', right: '10%',
    height: 2, borderRadius: 1, opacity: 0.25,
  },
  armCol: { alignItems: 'center', marginTop: s(2) },
  upperArm: { width: s(13), height: s(50), borderRadius: s(6.5) },
  forearm: { width: s(12), height: s(46), borderRadius: s(6), marginTop: s(-2) },
  hand: { width: s(12), height: s(16), borderRadius: s(6), marginTop: s(-1) },
  hips: {
    width: s(52), height: s(14), borderBottomLeftRadius: s(8), borderBottomRightRadius: s(8),
    marginTop: s(-3), zIndex: 1,
  },
  legsWrap: { flexDirection: 'row', gap: s(8), marginTop: s(-1) },
  legCol: { alignItems: 'center' },
  thigh: { width: s(16), height: s(56), borderRadius: s(8) },
  shin: { width: s(14), height: s(74), borderRadius: s(7), marginTop: s(-2) },
  ankle: { width: s(12), height: s(14), borderRadius: s(4), marginTop: s(-1) },
  feetWrap: { flexDirection: 'row', gap: s(12), marginTop: s(-2) },
  foot: {
    width: s(28), height: s(16), borderRadius: s(5),
    borderTopLeftRadius: s(3), borderTopRightRadius: s(3),
  },

  handleRow: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    marginBottom: -12, zIndex: 10,
  },
  handleLine: { flex: 1, height: 2, borderRadius: 1 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brand[500],
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 12, elevation: 10,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)',
  },
  pillText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },

  dragHint: {
    position: 'absolute', alignSelf: 'center',
    top: '30%', alignItems: 'center', zIndex: 5,
  },
  dragHintBg: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  dragHintText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },

  labelCol: {
    width: SCREEN_W < 360 ? 80 : 96,
    position: 'relative', zIndex: 3,
  },
  labelItem: {
    position: 'absolute', right: 6, left: 0,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: -9,
  },
  labelDot: {
    width: 9, height: 9, borderRadius: 4.5,
    borderWidth: 1.5,
  },
  labelDotOuter: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  labelDotInner: {
    width: 7, height: 7, borderRadius: 3.5,
  },
  labelPill: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1,
  },
  labelText: { fontSize: SCREEN_W < 360 ? 9 : 10, fontWeight: '500' },
  labelTextActive: { fontWeight: '800', letterSpacing: 0.2 },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderRadius: 16, borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  bannerIcon: {
    width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  bannerTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.1 },
  bannerDesc:  { fontSize: 12, lineHeight: 17, letterSpacing: 0.1 },
  bannerBadge: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  bannerBadgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
});


function EvidenceStep({
  isDark,
  photos,
  onPhotosChange,
  onShowAlert,
}: {
  isDark: boolean;
  photos: string[];
  onPhotosChange: (p: string[]) => void;
  onShowAlert: (config: AlertConfig) => void;
}) {
  const remaining = 5 - photos.length;

  async function openCamera() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      onShowAlert({ type: 'warning', title: 'Camera Access Needed', message: 'Allow camera permission to take photos or videos for your report.' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      videoMaxDuration: 30,
    });
    if (!result.canceled && result.assets.length > 0) {
      onPhotosChange([...photos, result.assets[0].uri].slice(0, 5));
    }
  }

  async function openGallery() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      onShowAlert({ type: 'warning', title: 'Gallery Access Needed', message: 'Allow gallery permission to attach photos or videos to your report.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: remaining,
    });
    if (!result.canceled) {
      onPhotosChange([...photos, ...result.assets.map(a => a.uri)].slice(0, 5));
    }
  }

  function removePhoto(uri: string) {
    onPhotosChange(photos.filter(p => p !== uri));
  }

  return (
    <View style={styles.stepBody}>
      <Text style={[styles.stepTitle, isDark && { color: colors.white }]}>
        Add photo/video evidence
      </Text>
      <Text style={[styles.stepSubtitle, isDark && { color: colors.slate[400] }]}>
        Optional but strongly recommended. Helps admins verify faster.
      </Text>

      {photos.length > 0 && (
        <View style={styles.photoGrid}>
          {photos.map((uri, idx) => (
            <View key={uri} style={styles.photoCell}>
              <Image source={{ uri }} style={styles.photoImg} resizeMode="cover" />
              {isVideoUri(uri) && (
                <View style={styles.videoOverlay}>
                  <Ionicons name="play-circle" size={30} color={colors.white} />
                </View>
              )}
              <View style={styles.photoBadge}>
                <Text style={styles.photoBadgeText}>{idx + 1}</Text>
              </View>
              <Pressable
                style={styles.photoRemove}
                onPress={() => removePhoto(uri)}
                accessibilityLabel="Remove photo"
                hitSlop={6}
              >
                <View style={styles.photoRemoveInner}>
                  <Ionicons name="close" size={12} color={colors.white} />
                </View>
              </Pressable>
            </View>
          ))}

          {remaining > 0 && (
            <Pressable
              style={[styles.photoAddCell, isDark && { backgroundColor: colors.slate[900], borderColor: colors.slate[700] }]}
              onPress={openGallery}
              accessibilityLabel="Add more photos"
            >
              <Ionicons name="add" size={28} color={colors.brand[500]} />
              <Text style={[styles.photoAddLabel, isDark && { color: colors.slate[400] }]}>
                {remaining} left
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {photos.length === 0 && (
        <View style={styles.evidenceGrid}>
          <Pressable
            style={[styles.evidenceAdd, isDark && { backgroundColor: colors.slate[900], borderColor: colors.slate[600] }]}
            onPress={openCamera}
            accessibilityRole="button"
            accessibilityLabel="Take a photo"
          >
            <Ionicons name="camera" size={30} color={colors.brand[500]} />
            <Text style={[styles.evidenceAddLabel, isDark && { color: colors.slate[400] }]}>
              Camera
            </Text>
          </Pressable>
          <Pressable
            style={[styles.evidenceAdd, isDark && { backgroundColor: colors.slate[900], borderColor: colors.slate[600] }]}
            onPress={openGallery}
            accessibilityRole="button"
            accessibilityLabel="Choose from gallery"
          >
            <Ionicons name="images" size={30} color={colors.brand[500]} />
            <Text style={[styles.evidenceAddLabel, isDark && { color: colors.slate[400] }]}>
              Gallery
            </Text>
          </Pressable>
        </View>
      )}

      {photos.length > 0 && remaining > 0 && (
        <View style={styles.evidenceRowBtns}>
          <Pressable
            style={[styles.evidenceRowBtn, isDark && { backgroundColor: colors.slate[900], borderColor: colors.slate[700] }]}
            onPress={openCamera}
            accessibilityLabel="Take a photo"
          >
            <Ionicons name="camera-outline" size={18} color={colors.brand[500]} />
            <Text style={[styles.evidenceRowBtnText, isDark && { color: colors.slate[300] }]}>Camera</Text>
          </Pressable>
          <Pressable
            style={[styles.evidenceRowBtn, isDark && { backgroundColor: colors.slate[900], borderColor: colors.slate[700] }]}
            onPress={openGallery}
            accessibilityLabel="Choose from gallery"
          >
            <Ionicons name="images-outline" size={18} color={colors.brand[500]} />
            <Text style={[styles.evidenceRowBtnText, isDark && { color: colors.slate[300] }]}>Gallery</Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.evidenceHint, isDark && { backgroundColor: colors.slate[900] }]}>
        <Ionicons name="information-circle-outline" size={14} color={colors.brand[500]} />
        <Text style={[styles.evidenceHintText, isDark && { color: colors.slate[400] }]}>
          {photos.length === 0
            ? 'Add up to 5 photos or videos. Strong evidence helps verify faster.'
            : `${photos.length}/5 file${photos.length > 1 ? 's' : ''} selected.${remaining > 0 ? ` ${remaining} slot${remaining > 1 ? 's' : ''} remaining.` : ' Maximum reached.'}`}
        </Text>
      </View>
    </View>
  );
}

function DescriptionStep({
  value,
  onChange,
  isDark,
}: {
  value: string;
  onChange: (v: string) => void;
  isDark: boolean;
}) {
  return (
    <View style={styles.stepBody}>
      <Text style={[styles.stepTitle, isDark && { color: colors.white }]}>
        Additional details
      </Text>
      <Text style={[styles.stepSubtitle, isDark && { color: colors.slate[400] }]}>
        Optional. Describe what you see, any vehicles involved, etc.
      </Text>

      <TextInput
        style={[
          styles.textarea,
          isDark && {
            backgroundColor: colors.slate[900],
            borderColor: colors.slate[600] + '88',
            color: colors.white,
          },
        ]}
        placeholder="E.g. Water is about knee-deep, road is impassable for small vehicles..."
        placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        value={value}
        onChangeText={onChange}
        accessibilityLabel="Additional description"
        maxLength={500}
      />
      <Text style={[styles.charCount, isDark && { color: colors.slate[600] }]}>
        {value.length}/500
      </Text>
    </View>
  );
}

function ConfirmationScreen({ reference, onDone }: { reference: string; onDone: () => void }) {
  return (
    <View style={styles.confirmRoot}>
      <View style={styles.confirmIcon}>
        <Ionicons name="checkmark-circle" size={64} color={colors.severity.low} />
      </View>
      <Text style={styles.confirmTitle}>Report submitted</Text>
      <Text style={styles.confirmSub}>
        Your report has been received.{reference ? (
          <> Reference:{' '}
            <Text style={{ fontWeight: '700', color: colors.brand[500] }}>{reference}</Text>
          </>
        ) : null}
      </Text>
      <Text style={styles.confirmNote}>
        You'll be notified when an admin verifies your report. Track it under "My Reports".
      </Text>
      <PrimaryButton label="Back to map" onPress={onDone} fullWidth size="lg" />
    </View>
  );
}

export default function ReportScreen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const scheme   = useColorScheme();
  const isDark   = scheme === 'dark';
  const { token } = useAuth();
  const { showAlert } = useAlert();

  const [step, setStep]                   = useState(0);
  const [location, setLocation]           = useState<LocationData | null>(null);
  const [locDetecting, setLocDetecting]   = useState(false);
  const [severity, setSeverity]           = useState<Severity | null>(null);
  const [floodDepth, setFloodDepth]       = useState<DepthKey | null>(null);
  const [photos, setPhotos]               = useState<string[]>([]);
  const [description, setDescription]     = useState('');
  const [submitted, setSubmitted]         = useState(false);
  const [submittedRef, setSubmittedRef]   = useState('');
  const [loading, setLoading]             = useState(false);
  const [checkingDups, setCheckingDups]   = useState(false);

  const stepOpacity = useSharedValue(1);
  const stepTranslateX = useSharedValue(0);
  const stepAnimStyle = useAnimatedStyle(() => ({
    opacity: stepOpacity.value,
    transform: [{ translateX: stepTranslateX.value }],
  }));

  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  function animateStepTransition(direction: 'forward' | 'back', callback: () => void) {
    const sign = direction === 'forward' ? 1 : -1;
    stepOpacity.value = withTiming(0, { duration: 100 });
    stepTranslateX.value = withTiming(-30 * sign, { duration: 100 }, () => {
      runOnJS(callback)();
      stepTranslateX.value = 30 * sign;
      stepOpacity.value = withTiming(1, { duration: 150 });
      stepTranslateX.value = withTiming(0, { duration: 150 });
    });
  }

  function triggerShake() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    shakeX.value = withSequence(
      withTiming(-10, { duration: 50 }),
      withTiming(10, { duration: 50 }),
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  }

  const TOTAL_STEPS = 4;
  async function detectLocation() {
    setLocDetecting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showAlert({
          type: 'warning',
          title: 'Location Access Needed',
          message: 'Allow location permission to auto-detect where the hazard is.',
          confirmText: 'OK',
        });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const [geo] = await Location.reverseGeocodeAsync({
        latitude:  pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const parts = [geo?.name, geo?.street, geo?.subregion, geo?.district, geo?.city, geo?.region].filter(Boolean);
      const unique = parts.filter((p, i) => i === 0 || p !== parts[i - 1]);
      const address = unique.length
        ? unique.join(', ')
        : `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, address });
    } catch {
      showAlert({ type: 'error', title: 'Location Error', message: 'Could not detect your location. Tap the refresh icon to retry.' });
    } finally {
      setLocDetecting(false);
    }
  }

  useEffect(() => { if (!location) detectLocation(); }, []);

  function resetForm() {
    setLocation(null);
    setSeverity(null);
    setFloodDepth(null);
    setDescription('');
    setStep(0);
  }

  const screenBg = isDark ? colors.dark.bg      : colors.slate[50];
  const cardBg   = isDark ? colors.dark.surface  : colors.white;

  const STEP_TITLES = ['Severity', 'Flood depth', 'Evidence', 'Description'];

  function canAdvance() {
    if (step === 0 && !severity)    return false;
    if (step === 0 && !location)    return false;
    if (step === 1 && !floodDepth)  return false;
    return true;
  }

  async function handleNext() {
    if (!canAdvance()) {
      triggerShake();
      return;
    }
    if (step < TOTAL_STEPS - 1) {
      if (step === 0 && location && token) {
        setCheckingDups(true);
        try {
          const all = await getAllReports(token);
          const nearby = all.filter(r => haversineKm(location.latitude, location.longitude, r.latitude, r.longitude) < 0.3);
          if (nearby.length > 0) {
            setCheckingDups(false);
            showAlert({
              type: 'warning',
              title: 'Similar report nearby',
              message: `${nearby.length} existing report${nearby.length > 1 ? 's' : ''} found within 300m. Is this a new hazard?`,
              confirmText: 'Continue',
              cancelText: 'Cancel',
              onConfirm: () => animateStepTransition('forward', () => setStep(s => s + 1)),
            });
            return;
          }
        } catch {}
        finally { setCheckingDups(false); }
      }
      animateStepTransition('forward', () => setStep(s => s + 1));
    } else {
      handleSubmit();
    }
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      const result = await submitReport(
        {
          latitude:   location!.latitude,
          longitude:  location!.longitude,
          address:    location!.address,
          hazardType: HAZARD_TYPE,
          severity:   severity!,
          description,
          photos,
        },
        token!,
      );
      setSubmittedRef(result.reference ?? '');
      setSubmitted(true);
    } catch {
      showAlert({
        type: 'error',
        title: 'Submission Failed',
        message: 'Could not submit your report. Check your connection and try again.',
        confirmText: 'Try Again',
        onConfirm: handleSubmit,
      });
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <ConfirmationScreen
        reference={submittedRef}
        onDone={() => {
          setSubmitted(false);
          setStep(0);
          setLocation(null);
          setSeverity(null);
          setFloodDepth(null);
          setPhotos([]);
          setDescription('');
          detectLocation();
          router.replace('/resident');
        }}
      />
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <LinearGradient colors={[colors.brand[500], colors.brand[700]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={step === 0 ? () => router.back() : () => animateStepTransition('back', () => setStep(s => s - 1))}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.white} />
        </Pressable>

        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.headerTitle}>Flood Report</Text>
          <Text style={styles.headerStep}>
            Step {step + 1} of {TOTAL_STEPS} — {STEP_TITLES[step]}
          </Text>
        </View>

        <StepIndicator current={step} total={TOTAL_STEPS} />
      </LinearGradient>

      <ScrollView
        style={[styles.scroll, { backgroundColor: cardBg }]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 200 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={step !== 1}
      >
        {step === 0 && (
          <LocationBanner
            isDark={isDark}
            location={location}
            detecting={locDetecting}
            onRefresh={detectLocation}
          />
        )}

        <Animated.View style={stepAnimStyle}>
        {step === 0 && (
          <SeverityStep
            selected={severity}
            onSelect={setSeverity}
            isDark={isDark}
          />
        )}
        {step === 1 && (
          <FloodDepthPicker
            selected={floodDepth}
            onSelect={(key, sev) => {
              setFloodDepth(key);
              setSeverity(sev);
            }}
            isDark={isDark}
          />
        )}
        {step === 2 && (
          <EvidenceStep
            isDark={isDark}
            photos={photos}
            onPhotosChange={setPhotos}
            onShowAlert={showAlert}
          />
        )}
        {step === 3 && (
          <DescriptionStep
            value={description}
            onChange={setDescription}
            isDark={isDark}
          />
        )}
        </Animated.View>
      </ScrollView>

      {/* ── Bottom action bar ── */}
      <View
        style={[
          styles.actionBar,
          {
            paddingBottom: insets.bottom + 100,
            backgroundColor: cardBg,
            borderTopColor: isDark ? colors.slate[900] : colors.slate[100],
          },
        ]}
      >
        {(severity || floodDepth) && (
          <View style={styles.summaryRow}>
            <View style={[styles.summaryChip, isDark && { backgroundColor: colors.slate[900] }]}>
              <Ionicons name="water" size={11} color={colors.brand[500]} />
              <Text style={[styles.summaryChipText, isDark && { color: colors.slate[400] }]}>Flood</Text>
            </View>
            {severity && <SeverityChip level={severity} size="sm" />}
            {floodDepth && (
              <View style={[styles.summaryChip, isDark && { backgroundColor: colors.slate[900] }]}>
                <Ionicons name="water" size={11} color={colors.brand[500]} />
                <Text style={[styles.summaryChipText, isDark && { color: colors.slate[400] }]}>
                  {DEPTH_LEVELS.find(d => d.key === floodDepth)?.label}
                </Text>
              </View>
            )}
          </View>
        )}

        <Animated.View style={shakeStyle}>
          <PrimaryButton
            label={step < TOTAL_STEPS - 1 ? 'Continue' : 'Submit report'}
            onPress={handleNext}
            loading={loading || checkingDups}
            fullWidth
            size="lg"
          />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.white },
  headerStep:  { fontSize: 12, color: 'rgba(255,255,255,0.72)' },

  scroll: { flex: 1 },

  stepBody: { padding: 24, gap: 16 },
  stepTitle:    { fontSize: 22, fontWeight: '800', color: colors.slate[900], letterSpacing: -0.3 },
  stepSubtitle: { fontSize: 14, color: colors.slate[500], lineHeight: 21 },

  locBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  locBannerText: { fontSize: 13, fontWeight: '600', color: colors.slate[700] },
  locRefreshBtn: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },

  severityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  severityLeft: {
    width: 46,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  severityLabel: { fontSize: 15, fontWeight: '700', color: colors.slate[900] },
  severityDesc:  { fontSize: 12, color: colors.slate[500], lineHeight: 17 },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoCell: {
    width: '47%', aspectRatio: 1,
    borderRadius: 12, overflow: 'hidden',
    position: 'relative',
  },
  photoImg: { width: '100%', height: '100%' },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  photoBadge: {
    position: 'absolute', bottom: 7, left: 7,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  photoBadgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  photoRemove: { position: 'absolute', top: 7, right: 7 },
  photoRemoveInner: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoAddCell: {
    width: '47%', aspectRatio: 1,
    borderRadius: 12, borderWidth: 2,
    borderStyle: 'dashed', borderColor: colors.brand[100],
    backgroundColor: colors.brand[50],
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  photoAddLabel: { fontSize: 12, color: colors.brand[500], fontWeight: '600' },
  evidenceGrid: { flexDirection: 'row', gap: 14 },
  evidenceAdd: {
    flex: 1, aspectRatio: 1,
    borderRadius: 16, borderWidth: 2,
    borderStyle: 'dashed', borderColor: colors.brand[200],
    backgroundColor: colors.brand[50],
    alignItems: 'center', justifyContent: 'center',
    gap: 10, maxHeight: 150,
  },
  evidenceAddLabel: { fontSize: 14, color: colors.brand[500], fontWeight: '700' },
  evidenceRowBtns: { flexDirection: 'row', gap: 10 },
  evidenceRowBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  evidenceRowBtnText: { fontSize: 13, fontWeight: '500', color: colors.slate[700] },
  evidenceHint: {
    flexDirection: 'row', gap: 8,
    backgroundColor: colors.brand[50], borderRadius: 8, padding: 12,
  },
  evidenceHintText: { flex: 1, fontSize: 12, color: colors.slate[600], lineHeight: 18 },

  textarea: {
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    borderRadius: 14,
    padding: 16,
    fontSize: 15,
    color: colors.slate[900],
    minHeight: 140,
    backgroundColor: colors.white,
    lineHeight: 22,
  },
  charCount: { fontSize: 12, color: colors.slate[400], alignSelf: 'flex-end' },

  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 8,
  },
  summaryRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.slate[100],
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  summaryChipText: { fontSize: 12, color: colors.slate[600], fontWeight: '600' },

  confirmRoot: {
    flex: 1,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 20,
  },
  confirmIcon:  { marginBottom: 8 },
  confirmTitle: { fontSize: 26, fontWeight: '800', color: colors.slate[900], textAlign: 'center' },
  confirmSub:   { fontSize: 15, color: colors.slate[600], textAlign: 'center', lineHeight: 22 },
  confirmNote:  { fontSize: 13, color: colors.slate[400], textAlign: 'center', lineHeight: 20 },
});
