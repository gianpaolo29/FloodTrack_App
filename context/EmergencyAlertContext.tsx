import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { encode as btoa } from 'base-64';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { socketService } from '@/services/socket';

// ── WAV tone generator ──
// Generates a WAV file and saves to cache so expo-av can play it.

interface ToneSegment {
  hz: number;
  durationMs: number;
  pause?: number;
}

function generateWavBase64(segments: ToneSegment[], volume = 0.5, waveType: 'sine' | 'square' | 'triangle' = 'sine'): string {
  const sampleRate = 22050;
  let totalSamples = 0;
  for (const seg of segments) {
    totalSamples += Math.floor(sampleRate * seg.durationMs / 1000);
    if (seg.pause) totalSamples += Math.floor(sampleRate * seg.pause / 1000);
  }

  const dataSize = totalSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // WAV header
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  w(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (const seg of segments) {
    const numSamples = Math.floor(sampleRate * seg.durationMs / 1000);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const phase = (seg.hz * t) % 1;
      let val: number;
      if (waveType === 'square') {
        val = phase < 0.5 ? volume * 32767 : -volume * 32767;
      } else if (waveType === 'triangle') {
        val = (phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase) * volume * 32767;
      } else {
        val = Math.sin(2 * Math.PI * seg.hz * t) * volume * 32767;
      }
      view.setInt16(offset, val, true);
      offset += 2;
    }
    if (seg.pause) {
      const pauseSamples = Math.floor(sampleRate * seg.pause / 1000);
      for (let i = 0; i < pauseSamples; i++) {
        view.setInt16(offset, 0, true);
        offset += 2;
      }
    }
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Tone definitions per alert type
const TONES: Record<string, { segments: ToneSegment[]; volume: number; wave: 'sine' | 'square' | 'triangle' }> = {
  critical: {
    segments: [
      { hz: 880, durationMs: 150, pause: 50 },
      { hz: 660, durationMs: 150, pause: 100 },
      { hz: 880, durationMs: 150, pause: 50 },
      { hz: 660, durationMs: 150, pause: 100 },
      { hz: 880, durationMs: 150, pause: 50 },
      { hz: 660, durationMs: 200 },
    ],
    volume: 0.8,
    wave: 'square',
  },
  advisory: {
    segments: [
      { hz: 587, durationMs: 200, pause: 80 },
      { hz: 784, durationMs: 300 },
    ],
    volume: 0.5,
    wave: 'sine',
  },
  update: {
    segments: [
      { hz: 523, durationMs: 120, pause: 40 },
      { hz: 659, durationMs: 120, pause: 40 },
      { hz: 784, durationMs: 180 },
    ],
    volume: 0.5,
    wave: 'triangle',
  },
};

// Cache WAV file paths so we only generate once
const wavCache: Record<string, string> = {};

async function getWavUri(type: string): Promise<string> {
  if (wavCache[type]) return wavCache[type];

  const tone = TONES[type];
  if (!tone) return '';

  const base64 = generateWavBase64(tone.segments, tone.volume, tone.wave);
  const path = `${FileSystem.cacheDirectory}alert_${type}.wav`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  wavCache[type] = path;
  return path;
}

interface EmergencyAlert {
  id: number;
  title: string;
  body: string;
  type: 'advisory' | 'update' | 'critical';
}

interface EmergencyAlertContextValue {
  isShowing: boolean;
}

const EmergencyAlertContext = createContext<EmergencyAlertContextValue>({ isShowing: false });

const ALERT_META: Record<string, {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  lightBg: string;
  darkBg: string;
  vibration: number[];
}> = {
  critical: {
    label:     'Emergency Alert',
    icon:      'warning',
    color:     colors.severity.critical,
    lightBg:   '#FDECEA',
    darkBg:    '#2A0E0E',
    vibration: [0, 500, 200, 500, 200, 500],
  },
  advisory: {
    label:     'Advisory Alert',
    icon:      'alert-circle',
    color:     colors.severity.high,
    lightBg:   '#FFF3E0',
    darkBg:    '#2A1608',
    vibration: [0, 300, 150, 300],
  },
  update: {
    label:     'Update Alert',
    icon:      'information-circle',
    color:     colors.brand[500],
    lightBg:   colors.brand[50],
    darkBg:    '#081A30',
    vibration: [0, 200, 100, 200],
  },
};

export function EmergencyAlertProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const [queue, setQueue] = useState<EmergencyAlert[]>([]);
  const current = queue[0] ?? null;
  const soundRef = useRef<Audio.Sound | null>(null);

  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const scaleAnim   = useRef(new Animated.Value(0.78)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const backdropOp  = useRef(new Animated.Value(0)).current;

  const stopSound = useCallback(async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {}
      soundRef.current = null;
    }
  }, []);

  const playSound = useCallback(async (type: string) => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
      });

      const uri = await getWavUri(type);
      if (!uri) return;

      // Unload previous
      if (soundRef.current) {
        try { await soundRef.current.unloadAsync(); } catch {}
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: 1.0 }
      );
      soundRef.current = sound;
    } catch {}
  }, []);

  const stopFeedback = useCallback(() => {
    Vibration.cancel();
    stopSound();
  }, [stopSound]);

  const startAlertFeedback = useCallback((alert: EmergencyAlert) => {
    const meta = ALERT_META[alert.type];
    if (!meta) return;

    // Vibration + haptic (once)
    Vibration.vibrate(meta.vibration);
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(
        alert.type === 'critical'
          ? Haptics.NotificationFeedbackType.Error
          : Haptics.NotificationFeedbackType.Warning
      );
    }

    // Play sound once
    playSound(alert.type);
  }, [playSound]);

  // Socket listener
  useEffect(() => {
    if (!token) return;

    const handleNewAlert = (raw: any) => {
      const type = raw?.type as string;
      if (!ALERT_META[type]) return;

      // Filter by target barangays — skip if alert targets specific barangays
      // and the user's address isn't one of them
      const targets: string[] | null = raw?.target_barangays ?? null;
      if (targets && targets.length > 0) {
        const addr = user?.homeAddress?.toLowerCase() ?? '';
        const matches = targets.some((b: string) => addr.includes(b.toLowerCase()));
        if (!matches) return;
      }

      setQueue((prev) => [...prev, {
        id:    raw.id,
        title: raw.title,
        body:  raw.body,
        type:  type as EmergencyAlert['type'],
      }]);
    };

    socketService.on('new-alert', handleNewAlert);
    return () => {
      socketService.off('new-alert', handleNewAlert);
    };
  }, [token]);

  // Animate in when a new alert is shown
  useEffect(() => {
    if (!current) return;

    scaleAnim.setValue(0.78);
    opacityAnim.setValue(0);
    backdropOp.setValue(0);

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 18,
        stiffness: 220,
        mass: 0.8,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOp, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();

    startAlertFeedback(current);

    return () => stopFeedback();
  }, [current?.id]);

  function dismiss() {
    stopFeedback();

    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 0.85,
        useNativeDriver: true,
        damping: 20,
        stiffness: 300,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOp, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setQueue((prev) => prev.slice(1));
    });
  }

  const meta = current ? ALERT_META[current.type] : null;

  const cardBg      = isDark ? colors.dark.elevated : colors.white;
  const titleColor  = isDark ? colors.dark.text      : '#0A0D14';
  const msgColor    = isDark ? colors.dark.subtext    : colors.slate[500];
  const borderColor = isDark ? colors.dark.border     : 'transparent';

  return (
    <EmergencyAlertContext.Provider value={{ isShowing: current !== null }}>
      {children}

      {current && meta && (
        <Modal
          transparent
          animationType="none"
          visible
          onRequestClose={dismiss}
          statusBarTranslucent
        >
          <Animated.View style={[s.backdrop, { opacity: backdropOp }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
          </Animated.View>

          <View style={s.centerer} pointerEvents="box-none">
            <Animated.View
              style={[
                s.card,
                {
                  backgroundColor: cardBg,
                  borderColor,
                  opacity: opacityAnim,
                  transform: [{ scale: scaleAnim }],
                },
              ]}
            >
              {/* Colored stripe */}
              <View style={[s.stripe, { backgroundColor: meta.color }]} />

              {/* Header */}
              <View style={[s.header, { backgroundColor: isDark ? meta.darkBg : meta.lightBg }]}>
                <Ionicons name={meta.icon} size={18} color={meta.color} />
                <Text style={[s.headerLabel, { color: meta.color }]}>
                  {meta.label}
                </Text>
              </View>

              {/* Body */}
              <View style={s.body}>
                <Text style={[s.title, { color: titleColor }]}>{current.title}</Text>
                <Text style={[s.message, { color: msgColor }]}>{current.body}</Text>
              </View>

              {/* Divider */}
              <View style={[s.divider, { backgroundColor: isDark ? colors.dark.border : colors.slate[100] }]} />

              {/* OK button */}
              <View style={s.footer}>
                <Pressable
                  onPress={dismiss}
                  style={({ pressed }) => [
                    s.btn,
                    { backgroundColor: meta.color },
                    pressed && { opacity: 0.88 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss alert"
                >
                  <Text style={s.btnText}>OK</Text>
                </Pressable>
              </View>
            </Animated.View>
          </View>
        </Modal>
      )}
    </EmergencyAlertContext.Provider>
  );
}

export function useEmergencyAlert() {
  return useContext(EmergencyAlertContext);
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay.backdrop,
  },
  centerer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.35,
    shadowRadius: 48,
    elevation: 24,
  },
  stripe: {
    height: 5,
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 26,
  },
  message: {
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
  },
  divider: {
    height: 1,
    width: '100%',
  },
  footer: {
    padding: 20,
  },
  btn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
  btnText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
