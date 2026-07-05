import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
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
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { submitReport } from '@/services/api';
import type { Severity } from '@/types';

const HAZARD_TYPES = [
  { key: 'flood',       label: 'Flood',       icon: 'water' as const },
  { key: 'road_damage', label: 'Road damage', icon: 'car' as const },
  { key: 'debris',      label: 'Debris',      icon: 'cube' as const },
  { key: 'drainage',    label: 'Drainage',    icon: 'git-merge' as const },
  { key: 'other',       label: 'Other',       icon: 'alert-circle' as const },
];

const SEVERITIES: { key: Severity; label: string; color: string }[] = [
  { key: 'low',      label: 'Low',      color: colors.severity.low },
  { key: 'moderate', label: 'Moderate', color: colors.severity.moderate },
  { key: 'high',     label: 'High',     color: colors.severity.high },
  { key: 'critical', label: 'Critical', color: colors.severity.critical },
];

function usePressAnimation() {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () =>
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true }).start();
  const onPressOut = () =>
    Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  return { scale, onPressIn, onPressOut };
}

function PulsingDot({ active, color }: { active: boolean; color: string }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (active) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active]);
  return (
    <Animated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}

function AnimatedChip({
  selected,
  onPress,
  children,
  style,
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
  style?: any;
}) {
  const anim = useRef(new Animated.Value(selected ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: selected ? 1 : 0, friction: 6, useNativeDriver: true }).start();
  }, [selected]);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const { scale: pressScale, onPressIn, onPressOut } = usePressAnimation();
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
      <Animated.View style={[style, { transform: [{ scale: Animated.multiply(scale, pressScale) }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

export default function QuickReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { token } = useAuth();

  const [hazardType, setHazardType] = useState('flood');
  const [severity, setSeverity] = useState<Severity>('moderate');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [address, setAddress] = useState('Detecting location...');
  const [latitude, setLatitude] = useState(0);
  const [longitude, setLongitude] = useState(0);
  const [locationReady, setLocationReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const screenBg = isDark ? colors.dark.bg : '#F4F6F9';
  const cardBg = isDark ? colors.dark.card : colors.white;

  const submitScale = useRef(new Animated.Value(1)).current;
  const onSubmitPressIn = () =>
    Animated.spring(submitScale, { toValue: 0.96, useNativeDriver: true }).start();
  const onSubmitPressOut = () =>
    Animated.spring(submitScale, { toValue: 1, friction: 4, useNativeDriver: true }).start();

  const cameraPress = usePressAnimation();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setAddress('Location permission denied');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLatitude(loc.coords.latitude);
      setLongitude(loc.coords.longitude);
      setLocationReady(true);

      const [geo] = await Location.reverseGeocodeAsync({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      if (geo) {
        const parts = [geo.street, geo.district, geo.city, geo.region].filter(Boolean);
        setAddress(parts.join(', ') || 'Location detected');
      }
    })();
  }, []);

  async function takePhoto() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  }

  async function handleSubmit() {
    if (!locationReady) {
      Alert.alert('Wait', 'Location is still being detected.');
      return;
    }
    setSubmitting(true);
    try {
      const { reference } = await submitReport({
        hazardType,
        severity,
        latitude,
        longitude,
        address,
        description: description.trim() || `${HAZARD_TYPES.find(h => h.key === hazardType)?.label} observed by responder in the field`,
        photos: photo ? [photo] : undefined,
      }, token!);
      Alert.alert('Report submitted', `Reference: ${reference}`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not submit report.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={[s.root, { backgroundColor: screenBg }]}>
      <View style={[s.headerBg, { paddingTop: insets.top + 8, backgroundColor: isDark ? colors.dark.surface : colors.accent[700] }]}>
        <View style={s.headerInner}>
          <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={colors.white} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Quick Report</Text>
            <Text style={s.headerSub}>Report a nearby hazard</Text>
          </View>
          <View style={[s.locationPill, { backgroundColor: locationReady ? colors.severity.low + '28' : colors.severity.moderate + '28' }]}>
            <Ionicons name={locationReady ? 'location' : 'locate'} size={12} color={locationReady ? colors.severity.low : colors.severity.moderate} />
            <Text style={{ fontSize: 10, fontWeight: '700', color: locationReady ? colors.severity.low : colors.severity.moderate }}>
              {locationReady ? 'GPS locked' : 'Locating...'}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        <View style={[s.card, { backgroundColor: cardBg }]}>
          <View style={s.locationRow}>
            <Ionicons name="location" size={16} color={colors.accent[500]} />
            <PulsingDot active={locationReady} color={locationReady ? colors.severity.low : colors.severity.moderate} />
            <Text style={[s.locationText, isDark && { color: colors.slate[300] }]} numberOfLines={2}>
              {address}
            </Text>
          </View>
        </View>

        <View style={[s.card, { backgroundColor: cardBg }]}>
          <Text style={[s.sectionTitle, isDark && { color: colors.white }]}>Hazard type</Text>
          <View style={s.chipGrid}>
            {HAZARD_TYPES.map(h => {
              const sel = hazardType === h.key;
              return (
                <AnimatedChip
                  key={h.key}
                  selected={sel}
                  onPress={() => setHazardType(h.key)}
                  style={[
                    s.typeChip,
                    isDark && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border },
                    sel && { borderColor: colors.accent[500], backgroundColor: colors.accent[500] + '0C' },
                  ]}
                >
                  <Ionicons name={h.icon} size={22} color={sel ? colors.accent[500] : isDark ? colors.slate[400] : colors.slate[500]} />
                  <Text style={[s.typeChipText, isDark && { color: colors.slate[300] }, sel && { color: colors.accent[500] }]}>
                    {h.label}
                  </Text>
                </AnimatedChip>
              );
            })}
          </View>
        </View>

        <View style={[s.card, { backgroundColor: cardBg }]}>
          <Text style={[s.sectionTitle, isDark && { color: colors.white }]}>Severity</Text>
          <View style={s.sevRow}>
            {SEVERITIES.map(sv => {
              const sel = severity === sv.key;
              return (
                <AnimatedChip
                  key={sv.key}
                  selected={sel}
                  onPress={() => setSeverity(sv.key)}
                  style={[
                    s.sevChip,
                    { borderColor: sel ? sv.color : isDark ? colors.dark.border : colors.slate[200] },
                    sel && { backgroundColor: sv.color + '14' },
                  ]}
                >
                  <View style={[s.sevAccent, { backgroundColor: sv.color }]} />
                  <View style={s.sevContent}>
                    <View style={[s.sevDot, { backgroundColor: sv.color }]} />
                    <Text style={[s.sevText, { color: sel ? sv.color : isDark ? colors.slate[300] : colors.slate[600] }]}>
                      {sv.label}
                    </Text>
                  </View>
                </AnimatedChip>
              );
            })}
          </View>
        </View>

        <View style={[s.card, { backgroundColor: cardBg }]}>
          <Text style={[s.sectionTitle, isDark && { color: colors.white }]}>Evidence & notes</Text>

          {photo ? (
            <View style={s.photoWrap}>
              <Image source={{ uri: photo }} style={s.photoPreview} />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.55)']}
                style={s.photoGradient}
              >
                <Pressable onPress={takePhoto} hitSlop={8}>
                  <Text style={s.photoRetakeText}>Tap to retake</Text>
                </Pressable>
              </LinearGradient>
              <Pressable onPress={() => setPhoto(null)} style={s.photoRemove} hitSlop={6}>
                <Ionicons name="close" size={14} color={colors.white} />
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={takePhoto} onPressIn={cameraPress.onPressIn} onPressOut={cameraPress.onPressOut}>
              <Animated.View
                style={[
                  s.cameraBtn,
                  isDark && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border },
                  { transform: [{ scale: cameraPress.scale }] },
                ]}
              >
                <Ionicons name="camera" size={32} color={colors.accent[500]} />
                <Text style={[s.cameraBtnLabel, isDark && { color: colors.slate[300] }]}>Take a photo</Text>
                <Text style={[s.cameraBtnSub, isDark && { color: colors.slate[600] }]}>Tap to capture</Text>
              </Animated.View>
            </Pressable>
          )}

          <TextInput
            style={[s.descInput, isDark && { backgroundColor: colors.dark.elevated, borderColor: colors.dark.border, color: colors.white }]}
            placeholder="Brief description (optional)"
            placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
            multiline numberOfLines={2} textAlignVertical="top"
            value={description} onChangeText={setDescription}
          />
        </View>
      </ScrollView>

      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 14, backgroundColor: isDark ? colors.dark.surface : colors.white }]}>
        <Pressable
          onPress={handleSubmit}
          onPressIn={onSubmitPressIn}
          onPressOut={onSubmitPressOut}
          disabled={submitting || !locationReady}
        >
          <Animated.View
            style={[
              s.submitBtn,
              (submitting || !locationReady) && { opacity: 0.5 },
              { transform: [{ scale: submitScale }] },
            ]}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Ionicons name="send" size={18} color={colors.white} />
                <Text style={s.submitBtnText}>Submit Report</Text>
              </>
            )}
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  headerBg: {
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.white },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  locationPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },

  scroll: { padding: 16, gap: 14 },

  card: {
    borderRadius: 18, padding: 18, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.slate[900] },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  locationText: { flex: 1, fontSize: 13, color: colors.slate[600] },

  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    width: '31%' as any,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  typeChipText: { fontSize: 11, fontWeight: '600', color: colors.slate[600], textAlign: 'center' },

  sevRow: { flexDirection: 'row', gap: 8 },
  sevChip: {
    flex: 1,
    height: 70,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    overflow: 'hidden',
  },
  sevAccent: {
    height: 3,
    width: '100%',
  },
  sevContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  sevDot: { width: 12, height: 12, borderRadius: 6 },
  sevText: { fontSize: 12, fontWeight: '800' },

  cameraBtn: {
    height: 100,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.slate[200],
    backgroundColor: colors.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  cameraBtnLabel: { fontSize: 14, fontWeight: '700', color: colors.slate[700] },
  cameraBtnSub: { fontSize: 11, fontWeight: '500', color: colors.slate[400] },

  photoWrap: { height: 160, borderRadius: 18, overflow: 'hidden' },
  photoPreview: { width: '100%', height: '100%' },
  photoGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 10,
  },
  photoRetakeText: { fontSize: 12, fontWeight: '700', color: colors.white, letterSpacing: 0.3 },
  photoRemove: {
    position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },

  descInput: {
    borderWidth: 1.5, borderColor: colors.slate[200], borderRadius: 18,
    padding: 14, fontSize: 14, color: colors.slate[900], minHeight: 60,
    backgroundColor: colors.slate[50],
  },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 14,
    borderTopWidth: 1, borderTopColor: colors.slate[100],
  },
  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.accent[500], borderRadius: 18, paddingVertical: 16,
    shadowColor: colors.accent[700], shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  submitBtnText: { fontSize: 16, fontWeight: '800', color: colors.white, letterSpacing: 0.3 },
});
