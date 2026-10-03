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
  useWindowDimensions,
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
import { type Severity } from '@/components/SeverityChip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useAlert } from '@/context/AlertContext';
import type { AlertConfig } from '@/components/AppAlert';
import { getAllReports, submitReport, getAppConfig } from '@/services/api';


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


function ProgressBar({ current, total }: { current: number; total: number }) {
  const progress = (current + 1) / total;
  return (
    <View style={progressStyles.wrap}>
      <View style={progressStyles.track}>
        <View style={[progressStyles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={progressStyles.label}>{current + 1}/{total}</Text>
    </View>
  );
}

const progressStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  track: {
    flex: 1, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.20)', overflow: 'hidden',
  },
  fill: {
    height: '100%', borderRadius: 2,
    backgroundColor: colors.white,
  },
  label: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.80)', letterSpacing: 0.3 },
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



const DEPTH_LEVELS = [
  { key: 'ankle', label: 'Ankle-deep',    cm: 30,  severity: 'low'      as Severity, desc: '~ 1 ft — can still walk through' },
  { key: 'knee',  label: 'Knee-deep',     cm: 60,  severity: 'moderate' as Severity, desc: '~ 2 ft — cars may stall' },
  { key: 'waist', label: 'Waist-deep',    cm: 100, severity: 'high'     as Severity, desc: '~ 3 ft — too deep to walk safely' },
  { key: 'chest', label: 'Chest & above', cm: 150, severity: 'critical' as Severity, desc: '4+ ft — extremely dangerous' },
] as const;

type DepthKey = typeof DEPTH_LEVELS[number]['key'];

// Initial values for StyleSheet (static); components use useWindowDimensions for live values
const { height: INIT_SCREEN_H } = Dimensions.get('window');
const INIT_PICKER_H = Math.max(280, Math.min(480, INIT_SCREEN_H * 0.45));
const FIGURE_SCALE = INIT_PICKER_H / 400;

const SNAPS = [0.12, 0.30, 0.52, 0.74];

const TICK_LABELS = ['0.5 ft', '1.5 ft', '3 ft', '4+ ft'];

function FloodDepthPicker({
  selected,
  onSelect,
  isDark,
  pickerH,
  screenW,
}: {
  selected: DepthKey | null;
  onSelect: (key: DepthKey, severity: Severity, ft: number) => void;
  isDark: boolean;
  pickerH: number;
  screenW: number;
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

  function levelFromFrac(frac: number): number {
    // ankle < 0.21, knee < 0.41, waist < 0.63, chest >= 0.63
    if (frac < 0.21) return 0;
    if (frac < 0.41) return 1;
    if (frac < 0.63) return 2;
    return 3;
  }

  function fracToFt(frac: number): number {
    const cm = interpolate(frac, [0, 1], [0, 161]);
    return Math.round(cm / 30.48 * 10) / 10;
  }

  function onPickFromFrac(frac: number) {
    const idx = levelFromFrac(frac);
    const l = DEPTH_LEVELS[idx];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(l.key, l.severity, fracToFt(frac));
  }

  function onTapLevel(idx: number) {
    waterFrac.value = withSpring(SNAPS[idx], { damping: 20, stiffness: 200 });
    const l = DEPTH_LEVELS[idx];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelect(l.key, l.severity, fracToFt(SNAPS[idx]));
  }

  const pan = Gesture.Pan()
    .onStart(() => { dragStart.value = waterFrac.value; })
    .onUpdate(e => {
      const delta = -e.translationY / pickerH;
      waterFrac.value = Math.max(0.04, Math.min(0.92, dragStart.value + delta));
    })
    .onEnd(e => {
      // Apply velocity-based momentum then settle smoothly
      const velocity = -e.velocityY / pickerH;
      const projected = Math.max(0.04, Math.min(0.92, waterFrac.value + velocity * 0.08));
      waterFrac.value = withSpring(projected, { damping: 22, stiffness: 180, mass: 0.8 });
      runOnJS(onPickFromFrac)(projected);
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
            'rgba(0,210,255,0.22)',
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
  const bg         = isDark ? '#0C1522' : '#EAF2FB';
  const border     = isDark ? 'rgba(80,140,220,0.20)' : 'rgba(30,100,180,0.12)';
  const skinColor  = isDark ? '#A8C0D4' : '#D4A574';
  const skinDark   = isDark ? '#8AA4B8' : '#B8895C';
  const hairColor  = isDark ? '#2C3A4C' : '#2C1810';
  const shirtColor = isDark ? '#3D72A8' : '#4A90CC';
  const shirtDark  = isDark ? '#305C8A' : '#3C7EB8';
  const pantsColor = isDark ? '#2C3E55' : '#3D5A80';
  const groundDark = isDark ? '#0E1A28' : '#C8D6E6';
  const groundMid  = isDark ? '#142434' : '#B8CAD8';

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
      style={[fdp.stepBody, screenW < 360 && { padding: 16, paddingTop: 12 }]}
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
      <Text style={[fdp.title, { color: textColor }, screenW < 360 && { fontSize: 19 }]}>How deep is the water?</Text>
      <Text style={[fdp.subtitle, { color: subColor }, screenW < 360 && { fontSize: 13 }]}>
        Drag the water line or pick a level on the right.
      </Text>

      <GestureHandlerRootView style={{ flex: 0 }}>
        <GestureDetector gesture={pan}>
          <Animated.View style={[fdp.card, { backgroundColor: bg, borderColor: border, height: pickerH }]}>

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

            <View style={[fdp.labelCol, { width: screenW < 360 ? 86 : 102 }]}>
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
                        { color: active ? c : subColor, fontSize: screenW < 360 ? 10 : 11 },
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
  stepBody:  { padding: 24, paddingTop: 14, gap: 10 },
  title:     { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  subtitle:  { fontSize: 13, lineHeight: 19, letterSpacing: 0.1, marginBottom: 4, opacity: 0.7 },

  card: {
    flexDirection: 'row',
    borderRadius: 28,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 10,
  },

  skyTop: {
    position: 'absolute', top: 0, left: 0, right: 0, height: '40%',
  },

  ground: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: '10%', zIndex: 0,
  },
  groundTopStripe: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 2, opacity: 0.3,
  },
  groundGrass: {
    position: 'absolute', top: 0, left: 0, right: 0,
    height: 1.5, opacity: 0.3,
  },

  scaleCol: { width: s(56), position: 'relative', zIndex: 2 },
  tick: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingLeft: 8,
  },
  tickLine: { width: 16, height: 1.5, borderRadius: 1 },
  tickLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3, opacity: 0.7 },

  centerCol: { flex: 1, position: 'relative', overflow: 'hidden', zIndex: 1 },

  water: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    overflow: 'hidden', zIndex: 1,
  },
  waves: {
    flexDirection: 'row', position: 'absolute', top: -6, left: -8, right: -8,
  },
  wave: { width: 26, height: 12, borderRadius: 13, marginLeft: -4 },

  human: {
    position: 'absolute',
    bottom: s(8),
    alignSelf: 'center',
    left: 0, right: 0,
    alignItems: 'center',
    zIndex: 2,
  },
  hair: {
    width: s(38), height: s(22), borderTopLeftRadius: s(19), borderTopRightRadius: s(19),
    marginBottom: s(-8), zIndex: 3,
  },
  head: {
    width: s(44), height: s(44), borderRadius: s(22),
    zIndex: 2, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 4, elevation: 2,
  },
  faceRow: {
    flexDirection: 'row', gap: s(10), marginTop: s(1),
  },
  eye: { width: s(4), height: s(5), borderRadius: s(2) },
  mouth: { width: s(8), height: s(3), borderRadius: s(1.5), marginTop: s(4), opacity: 0.5 },
  neck: { width: s(16), height: s(10), zIndex: 1, marginTop: s(-4) },
  shoulderWrap: { zIndex: 1, marginTop: s(-6) },
  shoulder: {
    width: s(68), height: s(20), borderTopLeftRadius: s(16), borderTopRightRadius: s(16),
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
    marginTop: s(-4), zIndex: 1,
  },
  torso: {
    width: s(52), height: s(85), borderRadius: s(6),
    borderBottomLeftRadius: s(2), borderBottomRightRadius: s(2),
    overflow: 'hidden',
  },
  shirtLine: {
    position: 'absolute', top: '40%', left: 0, right: 0,
    height: 1, opacity: 0.1,
  },
  beltLine: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: s(4), opacity: 0.3,
  },
  armCol: { alignItems: 'center', marginTop: s(0) },
  upperArm: { width: s(15), height: s(46), borderRadius: s(7.5) },
  forearm: { width: s(14), height: s(42), borderRadius: s(7), marginTop: s(-4) },
  hand: { width: s(14), height: s(14), borderRadius: s(7), marginTop: s(-3) },
  hips: {
    width: s(56), height: s(10), borderBottomLeftRadius: s(4), borderBottomRightRadius: s(4),
    marginTop: s(-6), zIndex: 1,
  },
  legsWrap: { flexDirection: 'row', gap: s(4), marginTop: s(-2) },
  legCol: { alignItems: 'center' },
  thigh: { width: s(18), height: s(50), borderRadius: s(9) },
  shin: { width: s(16), height: s(65), borderRadius: s(8), marginTop: s(-4) },
  ankle: { width: s(14), height: s(10), borderRadius: s(5), marginTop: s(-3) },
  feetWrap: { flexDirection: 'row', gap: s(8), marginTop: s(-4) },
  foot: {
    width: s(28), height: s(12), borderRadius: s(6),
  },

  handleRow: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    marginBottom: -14, zIndex: 10,
  },
  handleLine: { flex: 1, height: 2, borderRadius: 1 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.brand[500],
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 14, elevation: 12,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.30)',
  },
  pillText: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 0.3 },

  dragHint: {
    position: 'absolute', alignSelf: 'center',
    top: '38%', alignItems: 'center', zIndex: 5,
  },
  dragHintBg: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 22,
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.15)',
  },
  dragHintText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },

  labelCol: {
    position: 'relative', zIndex: 3,
  },
  labelItem: {
    position: 'absolute', right: 4, left: 0,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginBottom: -11,
  },
  labelDot: {
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 1.5,
  },
  labelDotOuter: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  labelDotInner: {
    width: 8, height: 8, borderRadius: 4,
  },
  labelPill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1,
  },
  labelText: { fontSize: 12, fontWeight: '700' },
  labelTextActive: { fontWeight: '900', letterSpacing: 0.3 },

  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: 18, borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 14, elevation: 4,
  },
  bannerIcon: {
    width: 44, height: 44, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  bannerTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  bannerDesc:  { fontSize: 12, lineHeight: 18, letterSpacing: 0.1, opacity: 0.8 },
  bannerBadge: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  bannerBadgeText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.3 },
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

  async function openCamera(mode: 'photo' | 'video') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      onShowAlert({ type: 'warning', title: 'Camera Access Needed', message: 'Allow camera permission to take photos or videos for your report.' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: mode === 'video' ? ['videos'] : ['images'],
      quality: 0.8,
      videoMaxDuration: 15,
    });
    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      // Validate video duration (max 15 seconds)
      if ((asset.type === 'video' || isVideoUri(asset.uri)) && asset.duration && asset.duration > 16_000) {
        onShowAlert({
          type: 'warning',
          title: 'Video Too Long',
          message: 'Videos must be 15 seconds or less. Please record a shorter clip.',
        });
        return;
      }
      onPhotosChange([...photos, asset.uri].slice(0, 5));
    }
  }

  function removePhoto(uri: string) {
    onPhotosChange(photos.filter(p => p !== uri));
  }

  return (
    <View style={styles.stepBody}>
      <Text style={[styles.stepTitle, isDark && { color: colors.white }]}>
        Take a photo or video
      </Text>
      <Text style={[styles.stepSubtitle, isDark && { color: colors.slate[400] }]}>
        Show what the flood looks like right now. At least 1 is required.
      </Text>

      {photos.length > 0 && (
        <View style={styles.photoGrid}>
          {photos.map((uri, idx) => (
            <View key={uri} style={styles.photoCell}>
              {isVideoUri(uri) ? (
                <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#1E293B', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="videocam" size={28} color={colors.white} />
                </View>
              ) : (
                <Image source={{ uri }} style={styles.photoImg} resizeMode="cover" />
              )}
              <View style={styles.photoBadge}>
                <Text style={styles.photoBadgeText}>{idx + 1}</Text>
              </View>
              <Pressable
                style={styles.photoRemove}
                onPress={() => removePhoto(uri)}
                accessibilityLabel="Remove media"
                hitSlop={6}
              >
                <View style={styles.photoRemoveInner}>
                  <Ionicons name="close" size={12} color={colors.white} />
                </View>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {remaining > 0 && (
        <View style={styles.evidenceRowBtns}>
          <Pressable
            style={[styles.evidenceRowBtn, isDark && { backgroundColor: colors.slate[900], borderColor: colors.slate[700] }]}
            onPress={() => openCamera('photo')}
            accessibilityLabel="Take a photo"
          >
            <Ionicons name="camera-outline" size={18} color={colors.brand[500]} />
            <Text style={[styles.evidenceRowBtnText, isDark && { color: colors.slate[300] }]}>Photo</Text>
          </Pressable>
          <Pressable
            style={[styles.evidenceRowBtn, isDark && { backgroundColor: colors.slate[900], borderColor: colors.slate[700] }]}
            onPress={() => openCamera('video')}
            accessibilityLabel="Record a video"
          >
            <Ionicons name="videocam-outline" size={18} color={colors.brand[500]} />
            <Text style={[styles.evidenceRowBtnText, isDark && { color: colors.slate[300] }]}>Video</Text>
          </Pressable>
        </View>
      )}

      <View style={[styles.evidenceHint, isDark && { backgroundColor: colors.slate[900] }]}>
        <Ionicons name="information-circle-outline" size={14} color={colors.brand[500]} />
        <Text style={[styles.evidenceHintText, isDark && { color: colors.slate[400] }]}>
          {photos.length === 0
            ? 'Take up to 5 photos or videos (max 15s). At least 1 required.'
            : `${photos.length}/5 selected.${remaining > 0 ? ` ${remaining} remaining.` : ''}`}
        </Text>
      </View>
    </View>
  );
}

function DescriptionStep({
  value,
  onChange,
  isDark,
  quickChips,
}: {
  value: string;
  onChange: (v: string) => void;
  isDark: boolean;
  quickChips: string[];
}) {
  function addChip(chip: string) {
    const separator = value.length > 0 && !value.endsWith(' ') ? '. ' : '';
    onChange(value + separator + chip);
  }

  return (
    <View style={[styles.stepBody, { flex: 1 }]}>
      <Text style={[styles.stepTitle, isDark && { color: colors.white }, { fontSize: 20 }]}>
        Anything else to add?
      </Text>
      <Text style={[styles.stepSubtitle, isDark && { color: colors.slate[400] }, { fontSize: 12, marginBottom: 0 }]}>
        Optional — tell responders what's happening.
      </Text>

      <View style={[
        styles.textareaWrap,
        { flex: 1, minHeight: 80 },
        isDark && { backgroundColor: colors.slate[900], borderColor: colors.slate[600] + '88' },
      ]}>
        <TextInput
          style={[
            styles.textarea,
            { flex: 1, minHeight: 60 },
            isDark && { color: colors.white },
          ]}
          placeholder="E.g. Lubog na ang kalsada, hindi madaanan ng sasakyan..."
          placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
          multiline
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

      <View style={styles.chipsWrap}>
        <Text style={[styles.chipsLabel, isDark && { color: colors.slate[400] }]}>Quick add:</Text>
        <View style={styles.chipsRow}>
          {(quickChips.length > 0 ? quickChips : [
            'Lubog na ang kalsada',
            'Hindi madaanan ng sasakyan',
            'Mabilis ang agos ng tubig',
            'May mga taong nangangailangan ng tulong',
            'Tumaas ang tubig sa loob ng bahay',
            'Road is impassable',
            'Water is rising fast',
            'Needs immediate rescue',
          ]).map(chip => (
            <Pressable
              key={chip}
              onPress={() => addChip(chip)}
              style={[styles.chip, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}
            >
              <Text style={[styles.chipText, isDark && { color: colors.slate[300] }]}>{chip}</Text>
            </Pressable>
          ))}
        </View>
      </View>
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
  const { height: screenH, width: screenW } = useWindowDimensions();
  const pickerH = Math.max(280, Math.min(480, screenH * 0.42));

  const [step, setStep]                   = useState(0);
  const [location, setLocation]           = useState<LocationData | null>(null);
  const [locDetecting, setLocDetecting]   = useState(false);
  const [severity, setSeverity]           = useState<Severity | null>(null);
  const [depthFt, setDepthFt]             = useState<number>(0);
  const [floodDepth, setFloodDepth]       = useState<DepthKey | null>(null);
  const [photos, setPhotos]               = useState<string[]>([]);
  const [description, setDescription]     = useState('');
  const [loading, setLoading]             = useState(false);
  const [checkingDups, setCheckingDups]   = useState(false);
  const [quickChips, setQuickChips]       = useState<string[]>([]);

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

  const TOTAL_STEPS = 3;
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

      let pos = await Location.getLastKnownPositionAsync();
      if (!pos) {
        try {
          pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        } catch {}
      }

      if (!pos) {
        showAlert({
          type: 'error',
          title: 'Location Unavailable',
          message: 'Could not get your location. Make sure GPS is on, then tap the refresh icon.',
          confirmText: 'OK',
        });
        return;
      }

      let address = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      try {
        const [geo] = await Location.reverseGeocodeAsync({
          latitude:  pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        const isPlusCode = (s?: string | null) => s && /^[A-Z0-9]{4,}\+[A-Z0-9]+/.test(s);
        const parts = [geo?.name, geo?.street, geo?.subregion, geo?.district, geo?.city, geo?.region]
          .filter(Boolean)
          .filter(p => !isPlusCode(p));
        const unique = parts.filter((p, i) => i === 0 || p !== parts[i - 1]);
        if (unique.length) address = unique.join(', ');
      } catch {
        // Reverse geocode failed (no internet) — use raw coordinates
      }

      setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, address });
    } catch {
      showAlert({ type: 'error', title: 'Location Error', message: 'Could not detect your location. Tap the refresh icon to retry.' });
    } finally {
      setLocDetecting(false);
    }
  }

  useEffect(() => { if (!location) detectLocation(); }, []);

  useEffect(() => {
    if (!token) return;
    getAppConfig(token)
      .then(config => setQuickChips(config.quickChips))
      .catch(() => {});
  }, [token]);

  function resetForm() {
    setLocation(null);
    setSeverity(null);
    setDepthFt(0);
    setFloodDepth(null);
    setPhotos([]);
    setDescription('');
    setStep(0);
  }

  const screenBg = isDark ? colors.dark.bg      : colors.slate[50];
  const cardBg   = isDark ? colors.dark.surface  : colors.white;

  const STEP_TITLES = ['Water level', 'Photo/Video', 'Details'];

  function canAdvance() {
    if (step === 0 && !floodDepth)        return false;
    if (step === 0 && !location)          return false;
    if (step === 1 && photos.length === 0) return false;
    return true;
  }

  async function handleNext() {
    if (!canAdvance()) {
      triggerShake();
      if (step === 1 && photos.length === 0) {
        showAlert({ type: 'warning', title: 'Photo Required', message: 'Please take at least 1 photo or video so responders can see the situation.' });
      }
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
          depthFt,
          description,
          photos,
        },
        token!,
      );
      const ref = result.reference ?? '';
      resetForm();
      showAlert({
        type: 'success',
        title: 'Report Sent!',
        message: ref
          ? `Thanks for reporting! Your reference number is ${ref}.\n\nWe'll notify you once it's been reviewed.`
          : 'Thanks for reporting! We\'ll notify you once it\'s been reviewed.',
        confirmText: 'OK',
        onConfirm: () => router.replace('/resident'),
      });
    } catch {
      showAlert({
        type: 'error',
        title: 'Couldn\'t Send Report',
        message: 'Please check your internet connection and try again.',
        confirmText: 'Try Again',
        onConfirm: handleSubmit,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      <LinearGradient colors={colors.gradients.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {/* Orbs */}
        <View style={styles.orb1} pointerEvents="none" />
        <View style={styles.orb2} pointerEvents="none" />

        <View style={styles.headerRow}>
          {step > 0 && (
            <Pressable
              onPress={() => animateStepTransition('back', () => setStep(s => s - 1))}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={22} color={colors.white} />
            </Pressable>
          )}

          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.headerTitle}>Flood Report</Text>
            <Text style={styles.headerStep}>
              Step {step + 1} of {TOTAL_STEPS} — {STEP_TITLES[step]}
            </Text>
          </View>
        </View>

        <ProgressBar current={step} total={TOTAL_STEPS} />

        {/* Wave transition */}
        <View style={styles.waveWrap} pointerEvents="none">
          <View style={[styles.waveShape, { backgroundColor: cardBg }]} />
        </View>
      </LinearGradient>

      <ScrollView
        style={[styles.scroll, { backgroundColor: cardBg }]}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        scrollEnabled={false}
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
          <FloodDepthPicker
            selected={floodDepth}
            onSelect={(key, sev, ft) => {
              setFloodDepth(key);
              setSeverity(sev);
              setDepthFt(ft);
            }}
            isDark={isDark}
            pickerH={pickerH}
            screenW={screenW}
          />
        )}
        {step === 1 && (
          <EvidenceStep
            isDark={isDark}
            photos={photos}
            onPhotosChange={setPhotos}
            onShowAlert={showAlert}
          />
        )}
        {step === 2 && (
          <DescriptionStep
            value={description}
            onChange={setDescription}
            isDark={isDark}
            quickChips={quickChips}
          />
        )}
        </Animated.View>
      </ScrollView>

      {/* ── Bottom action bar ── */}
      <View
        style={[
          styles.actionBar,
          {
            paddingBottom: Math.max(insets.bottom, 16) + 8,
            backgroundColor: cardBg,
          },
        ]}
      >
        <Animated.View style={shakeStyle}>
          {step < TOTAL_STEPS - 1 ? (
            <PrimaryButton
              label="Continue"
              onPress={handleNext}
              loading={loading || checkingDups}
              fullWidth
              size="lg"
            />
          ) : (
            <Pressable onPress={handleNext} disabled={loading || checkingDups} accessibilityRole="button">
              {({ pressed }) => (
                <LinearGradient
                  colors={pressed ? [colors.brand[700], colors.brand[500], colors.accent[700]] : colors.gradients.hero}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.submitGradient}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="paper-plane" size={18} color="#fff" />
                      <Text style={styles.submitText}>Submit Report</Text>
                    </>
                  )}
                </LinearGradient>
              )}
            </Pressable>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 14,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  orb1: {
    position: 'absolute', top: -30, right: -30,
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  orb2: {
    position: 'absolute', bottom: 10, left: -20,
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  waveWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 16, overflow: 'hidden',
  },
  waveShape: {
    position: 'absolute', bottom: 0, left: -10, right: -10,
    height: 20, borderTopLeftRadius: 18, borderTopRightRadius: 18,
  },

  scroll: { flex: 1 },

  stepBody: { padding: 20, gap: 10 },
  stepTitle:    { fontSize: 20, fontWeight: '800', color: colors.slate[900], letterSpacing: -0.3 },
  stepSubtitle: { fontSize: 12, color: colors.slate[500], lineHeight: 18 },

  locBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 24,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  locBannerText: { fontSize: 13, fontWeight: '600', color: colors.slate[700] },
  locRefreshBtn: {
    width: 34, height: 34, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoCell: {
    width: '31%', aspectRatio: 0.85,
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
    position: 'absolute', bottom: 5, left: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  photoBadgeText: { color: colors.white, fontSize: 10, fontWeight: '700' },
  photoRemove: { position: 'absolute', top: 5, right: 5 },
  photoRemoveInner: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoAddCell: {
    width: '31%', aspectRatio: 0.85,
    borderRadius: 12, borderWidth: 1.5,
    borderStyle: 'dashed', borderColor: colors.brand[100],
    backgroundColor: colors.brand[50],
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  photoAddLabel: { fontSize: 11, color: colors.brand[500], fontWeight: '600' },
  evidenceGrid: { flexDirection: 'row', gap: 14 },
  evidenceAdd: {
    flex: 1,
    borderRadius: 20, borderWidth: 1.5,
    borderStyle: 'dashed', borderColor: colors.brand[200],
    backgroundColor: colors.brand[50],
    alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 32,
  },
  evidenceIconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: 'rgba(31,111,191,0.10)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  evidenceAddLabel: { fontSize: 15, color: colors.slate[800], fontWeight: '700' },
  evidenceAddSub: { fontSize: 12, color: colors.slate[400] },
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

  textareaWrap: {
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    borderRadius: 14,
    backgroundColor: colors.white,
    padding: 12,
    gap: 4,
  },
  textareaIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  textareaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.slate[400],
    letterSpacing: 0.3,
  },
  textarea: {
    fontSize: 14,
    color: colors.slate[900],
    minHeight: 60,
    lineHeight: 20,
    padding: 0,
  },
  charCount: { fontSize: 11, color: colors.slate[400], alignSelf: 'flex-end' },
  chipsWrap: { gap: 6 },
  chipsLabel: { fontSize: 11, fontWeight: '600', color: colors.slate[500] },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
  },
  chipText: { fontSize: 11, fontWeight: '500', color: colors.slate[600] },

  actionBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 10,
  },
  submitGradient: {
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: colors.brand[500],
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  submitText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
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

});
