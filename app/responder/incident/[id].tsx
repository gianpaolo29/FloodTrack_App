import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video as ExpoVideo, ResizeMode } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useETA } from '@/hooks/use-eta';
import { PrimaryButton } from '@/components/PrimaryButton';
import * as Storage from '@/utils/storage';

export const SESSION_KEY = 'floodtrack_active_session';
import {
  getIncidentDetail,
  updateIncidentStatus,
  getMemberStatuses,
  submitMemberStatus,
  confirmTeamStatus,
  getMyTeam,
  getIncidentUnreadCount,
} from '@/services/api';
import { socketService } from '@/services/socket';
import type { IncidentDetail, MemberStatus, ResponderStatus, Severity, Team, TeamMember } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isVideoUrl(url: string): boolean {
  const ext = url.split('.').pop()?.toLowerCase();
  return ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext ?? '');
}

function extractWaterLevel(desc: string): string {
  const m = desc.match(/(?:chest|neck|waist|thigh|knee|ankle)[- ]?(?:deep|level|high)/i);
  if (m) return m[0];
  if (/deep\s*water|submerge/i.test(desc)) return 'Deep';
  if (/shallow|puddle/i.test(desc)) return 'Shallow';
  return 'Unknown';
}

function extractPeopleCount(desc: string): string {
  const m = desc.match(/(\d+)\s*(?:famil|household|people|person|resident|stranded|affected)/i);
  if (m) return `~${m[1]}`;
  if (/famil|household|people|resident/i.test(desc)) return 'Multiple';
  return 'N/A';
}

function extractNeeds(desc: string): string {
  if (/boat/i.test(desc)) return 'Boat';
  if (/rescue/i.test(desc)) return 'Rescue';
  if (/medical|medic|ambulance/i.test(desc)) return 'Medical';
  if (/evacuat/i.test(desc)) return 'Evacuation';
  if (/food|water|supply/i.test(desc)) return 'Supplies';
  return 'Assess';
}

// ─── Status constants ─────────────────────────────────────────────────────────
const STATUS_ORDER: ResponderStatus[] = ['pending', 'en_route', 'on_scene', 'resolved'];

const STATUS_LABELS: Record<ResponderStatus, string> = {
  pending:  'Assigned',
  en_route: 'En route',
  on_scene: 'On scene',
  resolved: 'Resolved',
};

const STATUS_COLORS: Record<ResponderStatus, string> = {
  pending:  colors.slate[400],
  en_route: colors.brand[500],
  on_scene: colors.brand[500],
  resolved: colors.severity.low,
};

const STATUS_ICONS: Record<ResponderStatus, keyof typeof Ionicons.glyphMap> = {
  pending:  'time-outline',
  en_route: 'car-outline',
  on_scene: 'location-outline',
  resolved: 'checkmark-circle-outline',
};

const STATUS_STEPS: {
  key: ResponderStatus;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}[] = [
  { key: 'en_route', label: 'En route',  icon: 'car',              description: 'Traveling to the incident location' },
  { key: 'resolved', label: 'Resolved',  icon: 'checkmark-circle', description: 'Incident has been cleared or contained' },
];

const MAX_MEDIA = 3;

const SEVERITY_BADGE: Record<Severity, { bg: string; text: string }> = {
  low:      { bg: colors.severity.low + '22', text: colors.severity.low },
  moderate: { bg: colors.severity.moderate + '22', text: colors.severity.moderate },
  high:     { bg: colors.severity.high + '22', text: colors.severity.high },
  critical: { bg: colors.severity.critical, text: '#fff' },
};

const RESPONDER_STATUS_BADGE: Record<ResponderStatus, { bg: string; text: string }> = {
  pending:  { bg: colors.slate[100], text: colors.slate[600] },
  en_route: { bg: colors.brand[100], text: colors.brand[700] },
  on_scene: { bg: colors.accent[100], text: colors.accent[700] },
  resolved: { bg: '#DCFCE7', text: '#166534' },
};

// ─── Sweet Alert ─────────────────────────────────────────────────────────────
type SweetAlertState = {
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  buttons?: { text: string; style?: 'primary' | 'cancel' | 'destructive'; onPress?: () => void }[];
} | null;

const SA_META = {
  success: { icon: 'checkmark-circle'  as const, color: '#10B981', bg: '#D1FAE5' },
  warning: { icon: 'warning'            as const, color: '#F59E0B', bg: '#FEF3C7' },
  error:   { icon: 'close-circle'       as const, color: '#EF4444', bg: '#FEE2E2' },
  info:    { icon: 'information-circle' as const, color: '#4A6CF7', bg: '#EEF2FF' },
};

function SweetAlert({
  cfg, onDismiss, isDark,
}: { cfg: NonNullable<SweetAlertState>; onDismiss: () => void; isDark: boolean }) {
  const meta   = SA_META[cfg.type];
  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const buttons = cfg.buttons ?? [{ text: 'OK', style: 'primary' as const }];
  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <View style={saStyles.backdrop}>
        <View style={[saStyles.card, { backgroundColor: cardBg }]}>
          <View style={[saStyles.iconCircle, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={44} color={meta.color} />
          </View>
          <Text style={[saStyles.title, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>{cfg.title}</Text>
          <Text style={[saStyles.message, { color: isDark ? '#94A3B8' : '#64748B' }]}>{cfg.message}</Text>
          <View style={saStyles.btnRow}>
            {buttons.map((btn, i) => {
              const isDestructive = btn.style === 'destructive';
              const isPrimary     = btn.style === 'primary' || (!btn.style && i === buttons.length - 1);
              const bg  = isDestructive ? '#EF4444' : isPrimary ? meta.color : (isDark ? '#334155' : '#F1F5F9');
              const clr = isDestructive || isPrimary ? '#fff' : (isDark ? '#CBD5E1' : '#475569');
              return (
                <Pressable
                  key={i}
                  style={({ pressed }) => [saStyles.btn, { backgroundColor: bg, flex: 1 }, pressed && { opacity: 0.82 }]}
                  onPress={() => { onDismiss(); btn.onPress?.(); }}
                >
                  <Text style={[saStyles.btnText, { color: clr }]}>{btn.text}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const saStyles = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card:       { width: '100%', borderRadius: 24, alignItems: 'center', paddingTop: 32, paddingBottom: 24, paddingHorizontal: 24, gap: 8,
                shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 16 },
  iconCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  title:      { fontSize: 20, fontWeight: '800', textAlign: 'center', letterSpacing: 0.1 },
  message:    { fontSize: 14, textAlign: 'center', lineHeight: 20, marginTop: 2, marginBottom: 8 },
  btnRow:     { flexDirection: 'row', gap: 10, marginTop: 8, width: '100%' },
  btn:        { paddingVertical: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  btnText:    { fontSize: 15, fontWeight: '700' },
});

// ─── UpdateModal ─────────────────────────────────────────────────────────────
function UpdateModal({
  visible, current, onClose, onUpdate, onAlert, isDark,
}: {
  visible: boolean;
  current: ResponderStatus;
  onClose: () => void;
  onUpdate: (status: ResponderStatus, notes: string, media: string[]) => Promise<void>;
  onAlert: (cfg: NonNullable<SweetAlertState>) => void;
  isDark: boolean;
}) {
  const [selected, setSelected] = useState<ResponderStatus>(current);
  const [notes, setNotes]       = useState('');
  const [media, setMedia]       = useState<string[]>([]);
  const [loading, setLoading]   = useState(false);

  const currentIdx = STATUS_ORDER.indexOf(current);

  async function pickMedia(source: 'camera' | 'library') {
    if (media.length >= MAX_MEDIA) {
      onAlert({ type: 'warning', title: 'Limit Reached', message: `You can attach up to ${MAX_MEDIA} photos per update.` });
      return;
    }

    const launcher = source === 'camera'
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    const result = await launcher({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      allowsMultipleSelection: source === 'library',
      selectionLimit: MAX_MEDIA - media.length,
    });

    if (!result.canceled) {
      const uris = result.assets.map(a => a.uri);
      setMedia(prev => [...prev, ...uris].slice(0, MAX_MEDIA));
    }
  }

  function removeMedia(idx: number) {
    setMedia(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      await onUpdate(selected, notes, media);
      setNotes('');
      setMedia([]);
    } finally {
      setLoading(false);
    }
  }

  const modalBg = isDark ? colors.dark.elevated : colors.white;
  const overlay = isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[modalStyles.overlay, { backgroundColor: overlay }]}>
        <ScrollView style={[modalStyles.sheet, { backgroundColor: modalBg }]} bounces={false} keyboardShouldPersistTaps="handled">
          <View style={modalStyles.sheetContent}>
            <View style={modalStyles.handle} />

            <View style={modalStyles.titleRow}>
              <View style={[modalStyles.titleIcon, { backgroundColor: colors.brand[500] + '18' }]}>
                <Ionicons name="swap-vertical" size={18} color={colors.brand[500]} />
              </View>
              <View>
                <Text style={[modalStyles.title, isDark && { color: colors.white }]}>Submit your status</Text>
                <Text style={[modalStyles.titleSub, isDark && { color: colors.slate[500] }]}>
                  Your individual status — team leader confirms advancement
                </Text>
              </View>
            </View>

            <View style={{ gap: 8 }}>
              {STATUS_STEPS.map((step) => {
                const stepIdx   = STATUS_ORDER.indexOf(step.key);
                const active    = selected === step.key;
                const disabled  = stepIdx < currentIdx;
                const completed = stepIdx < currentIdx;
                const stepColor = step.key === 'resolved' ? colors.severity.low : STATUS_COLORS[step.key];

                return (
                  <Pressable
                    key={step.key}
                    onPress={() => !disabled && setSelected(step.key)}
                    disabled={disabled}
                    style={[
                      modalStyles.stepCard,
                      isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border },
                      active && { borderColor: stepColor, backgroundColor: stepColor + '0C' },
                      disabled && { opacity: 0.4 },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active, disabled }}
                  >
                    <View style={[
                      modalStyles.stepNum,
                      { backgroundColor: active ? stepColor : isDark ? colors.dark.elevated : colors.slate[100] },
                      completed && { backgroundColor: colors.severity.low },
                    ]}>
                      {completed ? (
                        <Ionicons name="checkmark" size={14} color={colors.white} />
                      ) : (
                        <Ionicons
                          name={step.icon}
                          size={16}
                          color={active ? colors.white : isDark ? colors.slate[500] : colors.slate[400]}
                        />
                      )}
                    </View>

                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[
                        modalStyles.stepLabel,
                        isDark && { color: colors.white },
                        active && { color: stepColor },
                      ]}>
                        {step.label}
                      </Text>
                      <Text style={[modalStyles.stepDesc, isDark && { color: colors.slate[500] }]}>
                        {step.description}
                      </Text>
                    </View>

                    {active && (
                      <View style={[modalStyles.stepCheck, { backgroundColor: stepColor }]}>
                        <Ionicons name="checkmark" size={12} color={colors.white} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            <View>
              <Text style={[modalStyles.notesLabel, isDark && { color: colors.slate[400] }]}>Field notes</Text>
              <TextInput
                style={[
                  modalStyles.notes,
                  isDark && {
                    backgroundColor: colors.dark.card,
                    borderColor: colors.dark.border,
                    color: colors.white,
                  },
                ]}
                placeholder="Add observations or notes (optional)"
                placeholderTextColor={isDark ? colors.slate[600] : colors.slate[400]}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                value={notes}
                onChangeText={setNotes}
              />
            </View>

            <View>
              <Text style={[modalStyles.notesLabel, isDark && { color: colors.slate[400] }]}>
                Evidence photos ({media.length}/{MAX_MEDIA})
              </Text>

              <View style={modalStyles.mediaRow}>
                {media.map((uri, idx) => (
                  <View key={uri} style={modalStyles.mediaThumbnailWrap}>
                    <Image source={{ uri }} style={modalStyles.mediaThumbnail} />
                    <Pressable
                      onPress={() => removeMedia(idx)}
                      style={modalStyles.mediaRemoveBtn}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="Remove photo"
                    >
                      <Ionicons name="close" size={12} color={colors.white} />
                    </Pressable>
                  </View>
                ))}

                {media.length < MAX_MEDIA && (
                  <View style={modalStyles.mediaAddBtns}>
                    <Pressable
                      onPress={() => pickMedia('camera')}
                      style={[modalStyles.mediaAddBtn, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}
                      accessibilityRole="button"
                      accessibilityLabel="Take photo"
                    >
                      <Ionicons name="camera" size={20} color={colors.brand[500]} />
                      <Text style={[modalStyles.mediaAddText, isDark && { color: colors.slate[400] }]}>Camera</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => pickMedia('library')}
                      style={[modalStyles.mediaAddBtn, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}
                      accessibilityRole="button"
                      accessibilityLabel="Choose from gallery"
                    >
                      <Ionicons name="images" size={20} color={colors.brand[500]} />
                      <Text style={[modalStyles.mediaAddText, isDark && { color: colors.slate[400] }]}>Gallery</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>

            <View style={modalStyles.actions}>
              <Pressable onPress={onClose} style={[modalStyles.cancelBtn, isDark && { borderColor: colors.dark.border }]}>
                <Text style={[modalStyles.cancelText, isDark && { color: colors.slate[400] }]}>Cancel</Text>
              </Pressable>
              <View style={{ flex: 1 }}>
                <PrimaryButton
                  label="Confirm update"
                  onPress={handleSubmit}
                  loading={loading}
                  disabled={selected === current}
                  fullWidth
                />
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, maxHeight: '85%',
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15, shadowRadius: 24, elevation: 20,
  },
  sheetContent: { gap: 18 },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[200],
    alignSelf: 'center', marginBottom: 4,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  title:    { fontSize: 18, fontWeight: '800', color: colors.slate[900] },
  titleSub: { fontSize: 12, color: colors.slate[400], marginTop: 1 },
  stepCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  stepNum: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  stepLabel: { fontSize: 15, fontWeight: '600', color: colors.slate[900] },
  stepDesc:  { fontSize: 12, color: colors.slate[400] },
  stepCheck: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  notesLabel: {
    fontSize: 12, fontWeight: '600', color: colors.slate[500],
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 8,
  },
  notes: {
    borderWidth: 1.5, borderColor: colors.slate[200],
    borderRadius: 12, padding: 14, fontSize: 14,
    color: colors.slate[900], minHeight: 80,
    backgroundColor: colors.white,
  },
  mediaRow:           { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mediaThumbnailWrap: { width: 68, height: 68, borderRadius: 12, overflow: 'hidden' },
  mediaThumbnail:     { width: '100%', height: '100%', borderRadius: 12 },
  mediaRemoveBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  mediaAddBtns: { flexDirection: 'row', gap: 8 },
  mediaAddBtn: {
    width: 68, height: 68, borderRadius: 12,
    borderWidth: 1.5, borderColor: colors.slate[200], borderStyle: 'dashed',
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  mediaAddText: { fontSize: 10, fontWeight: '600', color: colors.slate[500] },
  actions:    { flexDirection: 'row', gap: 12, alignItems: 'center' },
  cancelBtn: {
    paddingHorizontal: 18, paddingVertical: 14,
    borderRadius: 12, borderWidth: 1, borderColor: colors.slate[200],
  },
  cancelText: { fontSize: 15, color: colors.slate[600], fontWeight: '600' },
});

// ─── LightboxModal ────────────────────────────────────────────────────────────
function LightboxModal({
  urls, initialIndex, onClose,
}: {
  urls: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(initialIndex);
  const currentUrl = urls[current];
  const isVideo = isVideoUrl(currentUrl);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={lbStyles.root}>
        <Pressable style={lbStyles.backdrop} onPress={onClose} />
        {isVideo ? (
          <ExpoVideo
            source={{ uri: currentUrl }}
            style={lbStyles.video}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            shouldPlay
            isLooping={false}
          />
        ) : (
          <Image
            source={{ uri: currentUrl }}
            style={lbStyles.image}
            resizeMode="contain"
          />
        )}
        <Pressable onPress={onClose} style={lbStyles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={colors.white} />
        </Pressable>
        {urls.length > 1 && (
          <View style={lbStyles.nav}>
            <Pressable
              onPress={() => setCurrent(c => Math.max(0, c - 1))}
              style={[lbStyles.navBtn, current === 0 && { opacity: 0.35 }]}
              disabled={current === 0}
            >
              <Ionicons name="chevron-back" size={24} color={colors.white} />
            </Pressable>
            <Text style={lbStyles.counter}>{current + 1} / {urls.length}</Text>
            <Pressable
              onPress={() => setCurrent(c => Math.min(urls.length - 1, c + 1))}
              style={[lbStyles.navBtn, current === urls.length - 1 && { opacity: 0.35 }]}
              disabled={current === urls.length - 1}
            >
              <Ionicons name="chevron-forward" size={24} color={colors.white} />
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const lbStyles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  backdrop: StyleSheet.absoluteFillObject,
  image:   { width: '100%', aspectRatio: 1, maxHeight: '70%' },
  video:   { width: '100%', aspectRatio: 16 / 9, maxHeight: '70%' },
  closeBtn: {
    position: 'absolute', top: 56, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  nav: {
    position: 'absolute', bottom: 60,
    flexDirection: 'row', alignItems: 'center', gap: 20,
  },
  navBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  counter: { color: colors.white, fontSize: 14, fontWeight: '600' },
});

// ─── StatusStepper (horizontal) ──────────────────────────────────────────────
function StatusStepper({ current, isDark }: { current: ResponderStatus; isDark: boolean }) {
  const currentIdx = STATUS_ORDER.indexOf(current);
  const steps = STATUS_ORDER;

  return (
    <View style={stepperStyles.root}>
      {steps.map((status, idx) => {
        const isDone    = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const isLast    = idx === steps.length - 1;
        const color     = isDone ? colors.severity.low : isCurrent ? STATUS_COLORS[status] : (isDark ? colors.dark.border : colors.slate[200]);

        return (
          <View key={status} style={stepperStyles.stepWrap}>
            <View style={stepperStyles.stepRow}>
              {/* Circle */}
              <View style={[
                stepperStyles.circle,
                { backgroundColor: isDone ? colors.severity.low : isCurrent ? STATUS_COLORS[status] : 'transparent' },
                { borderWidth: 2, borderColor: color },
              ]}>
                {isDone && <Ionicons name="checkmark" size={10} color={colors.white} />}
                {isCurrent && <View style={[stepperStyles.innerDot, { backgroundColor: colors.white }]} />}
              </View>
              {/* Connecting line */}
              {!isLast && (
                <View style={[
                  stepperStyles.line,
                  { backgroundColor: isDone ? colors.severity.low : (isDark ? colors.dark.border : colors.slate[200]) },
                ]} />
              )}
            </View>
            <Text style={[
              stepperStyles.label,
              isDone && { color: colors.severity.low },
              isCurrent && { color: STATUS_COLORS[status], fontWeight: '700' },
              !isDone && !isCurrent && { color: isDark ? colors.slate[600] : colors.slate[400] },
            ]} numberOfLines={1}>
              {STATUS_LABELS[status]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  root:     { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4 },
  stepWrap: { flex: 1, alignItems: 'center', gap: 6 },
  stepRow:  { flexDirection: 'row', alignItems: 'center', width: '100%', justifyContent: 'center' },
  circle:   { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  innerDot: { width: 6, height: 6, borderRadius: 3 },
  line:     { flex: 1, height: 2 },
  label:    { fontSize: 10, fontWeight: '500', textAlign: 'center' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function IncidentDetailScreen() {
  const { id }    = useLocalSearchParams<{ id: string }>();
  const router    = useRouter();
  const insets    = useSafeAreaInsets();
  const scheme    = useColorScheme();
  const isDark    = scheme === 'dark';
  const { token, user } = useAuth();
  const { width: screenW } = useWindowDimensions();
  const thumbSize = Math.floor((screenW - 32 - 36 - 28) / 4);

  const [incident, setIncident]           = useState<IncidentDetail | null>(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [lightboxIdx, setLightboxIdx]     = useState<number | null>(null);
  const [memberStatuses, setMemberStatuses] = useState<MemberStatus[]>([]);
  const [team, setTeam]                   = useState<Team | null>(null);
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const [startingResponse, setStartingResponse] = useState(false);
  const [sweetAlert, setSweetAlert]       = useState<SweetAlertState>(null);
  const [unreadCount, setUnreadCount]     = useState(0);

  // Theme tokens
  const bg            = isDark ? colors.dark.bg : '#F8FAFB';
  const cardBg        = isDark ? colors.dark.card : colors.white;
  const cardBorder    = isDark ? colors.dark.border : 'rgba(0,0,0,0.06)';
  const textPrimary   = isDark ? colors.dark.text : colors.slate[900];
  const textSecondary = isDark ? colors.dark.subtext : colors.slate[500];
  const dividerColor  = isDark ? colors.dark.border : colors.slate[100];
  const elevatedBg    = isDark ? colors.dark.elevated : colors.slate[50];

  // ETA hook
  const etaActive = incident?.responderStatus === 'en_route' || incident?.responderStatus === 'pending';
  const { eta, distanceKm } = useETA(
    incident?.latitude ?? 0,
    incident?.longitude ?? 0,
    !!incident && !!etaActive,
  );

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const [incidentRes, statusesRes, teamRes, unreadRes] = await Promise.allSettled([
        getIncidentDetail(id, token),
        getMemberStatuses(id, token),
        getMyTeam(token),
        getIncidentUnreadCount(id, token),
      ]);
      if (incidentRes.status === 'fulfilled') setIncident(incidentRes.value);
      else setError('Could not load incident details.');
      if (statusesRes.status === 'fulfilled') setMemberStatuses(statusesRes.value);
      if (teamRes.status === 'fulfilled') setTeam(teamRes.value);
      if (unreadRes.status === 'fulfilled') setUnreadCount(unreadRes.value);
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Real-time socket
  useEffect(() => {
    if (!token) return;
    socketService.connect(token);
    socketService.joinReport(id);

    const handleNewMessage = (raw: { report_id?: number; id?: number }) => {
      if (String(raw?.report_id) === String(id)) {
        setUnreadCount(prev => prev + 1);
      }
    };

    const handleStatusChange = (data: { reportId?: string }) => {
      if (String(data?.reportId) === String(id) && token) {
        getMemberStatuses(id, token)
          .then(setMemberStatuses)
          .catch(() => {});
        getIncidentDetail(id, token)
          .then(detail => setIncident(prev => prev ? { ...prev, responderStatus: detail.responderStatus } : prev))
          .catch(() => {});
      }
    };

    socketService.on('new-message', handleNewMessage);
    socketService.on('report-status', handleStatusChange);

    return () => {
      socketService.leaveReport(id);
      socketService.off('new-message', handleNewMessage);
      socketService.off('report-status', handleStatusChange);
    };
  }, [id, token]);

  function openNativeMaps() {
    if (!incident) return;
    const { latitude, longitude, address } = incident;
    const encoded = encodeURIComponent(address);
    const url = Platform.select({
      ios:     `maps:?daddr=${latitude},${longitude}&q=${encoded}`,
      android: `geo:${latitude},${longitude}?q=${encoded}`,
    });
    if (url) Linking.openURL(url);
  }

  function callReporter() {
    if (!incident) return;
    Linking.openURL(`tel:${incident.contactNumber}`);
  }

  async function handleConfirmTeamStatus(status: ResponderStatus) {
    if (!incident || !isLeader) return;
    setConfirmingStatus(true);
    try {
      await confirmTeamStatus(incident.id, status, token!);
      setIncident(prev => prev ? { ...prev, responderStatus: status } : prev);
      if (status === 'resolved') {
        setSweetAlert({
          type: 'success',
          title: 'Incident Resolved!',
          message: 'The team has successfully resolved this incident.',
          buttons: [{ text: 'OK', style: 'primary', onPress: () => router.back() }],
        });
      }
    } catch (e: any) {
      setSweetAlert({
        type: 'error',
        title: 'Update Failed',
        message: e?.message ?? 'Could not update the incident status. Please try again.',
      });
    } finally {
      setConfirmingStatus(false);
    }
  }

  async function handleStart() {
    if (!incident) return;
    setStartingResponse(true);
    try {
      if (incident.responderStatus === 'pending') {
        await confirmTeamStatus(incident.id, 'en_route', token!);
        setIncident(prev => prev ? { ...prev, responderStatus: 'en_route' } : prev);
        getMemberStatuses(incident.id, token!).then(setMemberStatuses).catch(() => {});
        await Storage.setItem(SESSION_KEY, JSON.stringify({
          incidentId:   incident.id,
          destLat:      String(incident.latitude),
          destLng:      String(incident.longitude),
          destTitle:    incident.title,
          isLeader:     isLeader,
          reporterName: incident.reportedBy,
          reportedAt:   incident.reportedAt,
          severity:     incident.severity,
          incidentType: incident.type || 'Flood',
        }));
      }
    } catch {}
    finally { setStartingResponse(false); }
    router.push({
      pathname: '/responder/(tabs)/map',
      params: {
        destLat:       String(incident.latitude),
        destLng:       String(incident.longitude),
        destTitle:     incident.title,
        incidentId:    incident.id,
        isLeaderParam: isLeader ? '1' : '0',
        sessionLocked: '1',
        reporterName:  incident.reportedBy,
        reportedAt:    incident.reportedAt,
        severity:      incident.severity,
        incidentType:  incident.type || 'Flood',
      },
    } as never);
  }

  // ── Derived state ────────────────────────────────────────────────────────
  const isResolved  = incident?.responderStatus === 'resolved';
  const isLeader = !!team && team.leaderId === user?.id;
  const myMemberStatus = memberStatuses.find(ms => ms.userId === user?.id);
  const teamStatusIdx  = STATUS_ORDER.indexOf(incident?.responderStatus ?? 'pending');
  const myStatusIdx    = myMemberStatus ? STATUS_ORDER.indexOf(myMemberStatus.status) : -1;
  const waitingForTeam = myStatusIdx > teamStatusIdx;

  const nextConfirmableStatus: ResponderStatus | null = (() => {
    if (!isLeader || !team || team.members.length === 0) return null;
    const candidates: ResponderStatus[] = ['en_route', 'on_scene', 'resolved'];
    for (const s of candidates) {
      const sIdx = STATUS_ORDER.indexOf(s);
      if (sIdx <= teamStatusIdx) continue;
      const allReady = team.members.every(m => {
        const ms = memberStatuses.find(x => x.userId === m.id);
        return ms && STATUS_ORDER.indexOf(ms.status) >= sIdx;
      });
      if (allReady) return s;
    }
    return null;
  })();

  // Description-derived info chips
  const desc = incident?.description ?? '';
  const waterLevel  = extractWaterLevel(desc);
  const peopleCount = extractPeopleCount(desc);
  const needs       = extractNeeds(desc);

  // Reporter initials
  const reporterInitials = incident
    ? incident.reportedBy.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '';

  // Responder count
  const responderCount = team?.members?.length ?? memberStatuses.length;

  // Primary action config
  const primaryAction = (() => {
    if (!incident || isResolved) return null;
    const status = incident.responderStatus;

    if (isLeader && nextConfirmableStatus) {
      return {
        label: nextConfirmableStatus === 'resolved'
          ? 'Mark resolved'
          : `Finish — ${STATUS_LABELS[nextConfirmableStatus]}`,
        color: nextConfirmableStatus === 'resolved' ? colors.severity.low : colors.brand[500],
        icon: 'checkmark-done' as const,
        onPress: () => handleConfirmTeamStatus(nextConfirmableStatus),
        loading: confirmingStatus,
      };
    }

    if (status === 'pending') {
      return {
        label: "Start — I'm en route",
        color: colors.brand[500],
        icon: 'play' as const,
        onPress: handleStart,
        loading: startingResponse,
      };
    }

    if (status === 'en_route') {
      return {
        label: 'Arrived — mark on scene',
        color: '#0D9488',
        icon: 'location' as const,
        onPress: () => {
          if (isLeader) {
            handleConfirmTeamStatus('on_scene');
          } else {
            submitMemberStatus({ incidentId: incident.id, status: 'on_scene' }, token!).catch(() => {});
          }
        },
        loading: confirmingStatus,
      };
    }

    if (status === 'on_scene') {
      return {
        label: 'Mark resolved',
        color: colors.severity.low,
        icon: 'checkmark-circle' as const,
        onPress: () => {
          if (isLeader) {
            handleConfirmTeamStatus('resolved');
          } else {
            submitMemberStatus({ incidentId: incident.id, status: 'resolved' }, token!).catch(() => {});
          }
        },
        loading: confirmingStatus,
      };
    }

    return null;
  })();

  // ── Render ──
  return (
    <View style={[s.root, { backgroundColor: bg }]}>

      {/* ── Header (flat dark) ── */}
      <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: isDark ? colors.dark.surface : colors.slate[900] }]}>
        <View style={s.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={s.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={20} color={colors.white} />
          </Pressable>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.headerTitle}>Incident</Text>
            {incident && (
              <Text style={s.headerRef}>{incident.reference}</Text>
            )}
          </View>

          {/* Online dot + chat */}
          <View style={s.headerRight}>
            <View style={s.onlineDot} />
            <Pressable
              onPress={() => {
                setUnreadCount(0);
                router.push(`/responder/incident/${id}/chat` as never);
              }}
              style={s.headerBtn}
              accessibilityRole="button"
              accessibilityLabel="Open chat"
            >
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.white} />
              {unreadCount > 0 && (
                <View style={s.chatBadge}>
                  <Text style={s.chatBadgeText}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      {/* Loading */}
      {loading && (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.brand[500]} />
        </View>
      )}

      {/* Error */}
      {!loading && error && (
        <View style={s.centered}>
          <View style={[s.errorIconWrap, { backgroundColor: elevatedBg }]}>
            <Ionicons name="cloud-offline-outline" size={36} color={colors.slate[400]} />
          </View>
          <Text style={[s.errorTitle, { color: textPrimary }]}>Connection issue</Text>
          <Text style={[s.errorBody, { color: textSecondary }]}>{error}</Text>
          <Pressable onPress={load} style={s.retryBtn} accessibilityRole="button">
            <Ionicons name="refresh" size={15} color={colors.white} />
            <Text style={s.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {/* Content */}
      {!loading && !error && incident && (
        <>
          <ScrollView
            contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 180 }]}
            showsVerticalScrollIndicator={false}
          >

            {/* ── Incident Summary Card ── */}
            <View style={[s.card, { backgroundColor: isDark ? colors.dark.surface : colors.slate[900] }]}>
              {/* Badges row */}
              <View style={s.badgeRow}>
                <View style={[s.badge, { backgroundColor: SEVERITY_BADGE[incident.severity].bg }]}>
                  <Text style={[s.badgeText, { color: SEVERITY_BADGE[incident.severity].text }]}>
                    {incident.severity.charAt(0).toUpperCase() + incident.severity.slice(1)}
                  </Text>
                </View>
                <View style={[s.badge, { backgroundColor: RESPONDER_STATUS_BADGE[incident.responderStatus].bg }]}>
                  <Text style={[s.badgeText, { color: RESPONDER_STATUS_BADGE[incident.responderStatus].text }]}>
                    {STATUS_LABELS[incident.responderStatus]}
                  </Text>
                </View>
              </View>

              {/* Reported time + count */}
              <Text style={s.summaryMeta}>
                Reported {incident.reportedAt}{incident.nearbyCount > 0 ? ` · ${incident.nearbyCount} reports` : ''}
              </Text>

              {/* Title */}
              <Text style={s.summaryTitle} numberOfLines={2}>
                {incident.title}
              </Text>

              {/* Location */}
              <View style={s.summaryLocationRow}>
                <Ionicons name="location" size={14} color="rgba(255,255,255,0.6)" />
                <Text style={s.summaryAddress} numberOfLines={2}>
                  {incident.address}
                </Text>
              </View>
            </View>

            {/* ── Mini Map Placeholder ── */}
            <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1, padding: 0, overflow: 'hidden' }]}>
              <View style={s.miniMap}>
                {/* Dark map placeholder with route visualization */}
                <View style={s.miniMapBg}>
                  {/* Route line visualization */}
                  <View style={s.routeLine}>
                    <View style={[s.routeDot, { backgroundColor: colors.brand[500] }]} />
                    <View style={s.routeDash} />
                    <View style={s.routeDash} />
                    <View style={s.routeDash} />
                    <Ionicons name="location" size={18} color={colors.severity.high} />
                  </View>
                </View>

                {/* Expand button */}
                <Pressable
                  onPress={() => router.push({
                    pathname: '/responder/(tabs)/map',
                    params: {
                      destLat:       String(incident.latitude),
                      destLng:       String(incident.longitude),
                      destTitle:     incident.title,
                      incidentId:    incident.id,
                      isLeaderParam: isLeader ? '1' : '0',
                      sessionLocked: '1',
                      reporterName:  incident.reportedBy,
                      reportedAt:    incident.reportedAt,
                      severity:      incident.severity,
                      incidentType:  incident.type || 'Flood',
                    },
                  } as never)}
                  style={s.miniMapExpand}
                  accessibilityRole="button"
                  accessibilityLabel="Expand map"
                >
                  <Ionicons name="expand-outline" size={16} color={colors.white} />
                </Pressable>
              </View>

              {/* ETA strip below map */}
              <Pressable onPress={openNativeMaps} style={[s.etaStrip, { borderTopColor: dividerColor }]}>
                <Ionicons name="navigate" size={16} color={colors.brand[500]} />
                <Text style={[s.etaText, { color: textPrimary }]}>
                  {distanceKm != null ? `${distanceKm} km` : incident.distance}
                  {eta ? ` · ${eta}` : ''}
                </Text>
                <Ionicons name="chevron-forward" size={14} color={textSecondary} style={{ marginLeft: 'auto' }} />
              </Pressable>
            </View>

            {/* ── Info Chips (3 columns) ── */}
            <View style={s.chipsRow}>
              <View style={[s.chip, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1 }]}>
                <Ionicons name="water" size={16} color={colors.brand[500]} />
                <Text style={[s.chipLabel, { color: textSecondary }]}>Water</Text>
                <Text style={[s.chipValue, { color: textPrimary }]}>{waterLevel}</Text>
              </View>
              <View style={[s.chip, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1 }]}>
                <Ionicons name="people" size={16} color={colors.severity.high} />
                <Text style={[s.chipLabel, { color: textSecondary }]}>People</Text>
                <Text style={[s.chipValue, { color: textPrimary }]}>{peopleCount}</Text>
              </View>
              <View style={[s.chip, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1 }]}>
                <Ionicons name="medkit" size={16} color={colors.severity.moderate} />
                <Text style={[s.chipLabel, { color: textSecondary }]}>Needs</Text>
                <Text style={[s.chipValue, { color: textPrimary }]}>{needs}</Text>
              </View>
            </View>

            {/* ── Reporter Description (quote block) ── */}
            {!!incident.description && (
              <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1 }]}>
                <View style={[s.quoteBar, { backgroundColor: colors.brand[500] }]} />
                <View style={s.quoteContent}>
                  <Text style={[s.quoteText, { color: textPrimary }]}>
                    "{incident.description}"
                  </Text>
                  <Text style={[s.quoteAttribution, { color: textSecondary }]}>
                    {incident.reportedBy} · first report · {incident.reportedAt}
                  </Text>
                </View>
              </View>
            )}

            {/* ── Reporter Card ── */}
            <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1 }]}>
              <View style={s.reporterRow}>
                <View style={[s.reporterAvatar, { backgroundColor: isDark ? colors.dark.elevated : colors.brand[100] }]}>
                  <Text style={[s.reporterInitials, { color: isDark ? colors.brand[300] : colors.brand[700] }]}>
                    {reporterInitials}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.reporterName, { color: textPrimary }]}>
                    {incident.reportedBy}
                  </Text>
                  <Text style={[s.reporterSub, { color: textSecondary }]}>
                    Reporter{incident.contactNumber ? ` · ${incident.contactNumber}` : ''}
                  </Text>
                </View>
                <Pressable
                  onPress={callReporter}
                  style={[s.phoneBtn, { backgroundColor: isDark ? colors.dark.elevated : colors.brand[100] }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${incident.reportedBy}`}
                >
                  <Ionicons name="call" size={18} color={colors.brand[500]} />
                </Pressable>
              </View>
            </View>

            {/* ── Photos Section ── */}
            {incident.mediaUrls.length > 0 ? (
              <Pressable
                onPress={() => setLightboxIdx(0)}
                style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }]}
              >
                <View style={[s.photoIcon, { backgroundColor: isDark ? colors.dark.elevated : colors.brand[100] }]}>
                  <Ionicons name="images" size={18} color={colors.brand[500]} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.photoTitle, { color: textPrimary }]}>
                    {incident.evidenceCount} photos from the scene
                  </Text>
                  <Text style={[s.photoSub, { color: textSecondary }]}>
                    Last added {incident.reportedAt} · AI-verified
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={textSecondary} />
              </Pressable>
            ) : (
              <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1 }]}>
                <View style={[s.emptyMedia, { backgroundColor: elevatedBg }]}>
                  <Ionicons name="images-outline" size={28} color={colors.slate[400]} />
                  <Text style={[s.emptyMediaText, { color: textSecondary }]}>
                    No evidence attached
                  </Text>
                </View>
              </View>
            )}

            {/* ── Team Section ── */}
            {(team || memberStatuses.length > 0) && (
              <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1 }]}>
                <View style={s.sectionHeader}>
                  <Text style={[s.sectionTitle, { color: textPrimary }]}>On this incident</Text>
                  <Text style={[s.sectionCount, { color: textSecondary }]}>
                    {responderCount} responder{responderCount !== 1 ? 's' : ''}
                  </Text>
                </View>

                {team?.members.map((member, idx) => {
                  const ms = memberStatuses.find(x => x.userId === member.id);
                  const status: ResponderStatus = ms?.status ?? 'pending';
                  const statusColor = STATUS_COLORS[status];
                  const isMe = member.id === user?.id;
                  const isLast = idx === (team?.members.length ?? 0) - 1;
                  const initials = `${member.firstName[0]}${member.lastName[0]}`.toUpperCase();

                  return (
                    <View key={member.id}>
                      <View style={s.teamRow}>
                        {/* Avatar with status dot */}
                        <View style={s.teamAvatarWrap}>
                          <View style={[
                            s.teamAvatar,
                            { backgroundColor: isMe ? colors.brand[100] : (isDark ? colors.dark.elevated : colors.slate[100]) },
                          ]}>
                            <Text style={[s.teamInitials, { color: isMe ? colors.brand[700] : (isDark ? colors.slate[400] : colors.slate[500]) }]}>
                              {initials}
                            </Text>
                          </View>
                          <View style={[s.statusDot, { backgroundColor: statusColor, borderColor: cardBg }]} />
                        </View>

                        {/* Name + role */}
                        <View style={{ flex: 1, gap: 2 }}>
                          <View style={s.teamNameRow}>
                            <Text style={[s.teamName, { color: textPrimary }]}>
                              {member.firstName} {member.lastName}
                            </Text>
                            {member.isLeader && (
                              <View style={[s.leaderBadge, { backgroundColor: colors.brand[500] }]}>
                                <Text style={s.leaderBadgeText}>LEADER</Text>
                              </View>
                            )}
                          </View>
                          <Text style={[s.teamRole, { color: textSecondary }]}>
                            {member.isLeader ? 'Team Leader' : 'Responder'} · {STATUS_LABELS[status]}
                          </Text>
                        </View>

                        {/* Phone icon */}
                        <Pressable
                          style={[s.teamPhoneBtn, { backgroundColor: elevatedBg }]}
                          accessibilityRole="button"
                          accessibilityLabel={`Call ${member.firstName}`}
                        >
                          <Ionicons name="call-outline" size={15} color={textSecondary} />
                        </Pressable>
                      </View>
                      {!isLast && <View style={[s.divider, { backgroundColor: dividerColor }]} />}
                    </View>
                  );
                })}

                {/* Member statuses without team (fallback) */}
                {!team && memberStatuses.map((ms, idx) => {
                  const statusColor = STATUS_COLORS[ms.status];
                  const initials = ms.userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                  const isMe = ms.userId === user?.id;
                  const isLast = idx === memberStatuses.length - 1;

                  return (
                    <View key={ms.userId}>
                      <View style={s.teamRow}>
                        <View style={s.teamAvatarWrap}>
                          <View style={[
                            s.teamAvatar,
                            { backgroundColor: isMe ? colors.brand[100] : (isDark ? colors.dark.elevated : colors.slate[100]) },
                          ]}>
                            <Text style={[s.teamInitials, { color: isMe ? colors.brand[700] : textSecondary }]}>
                              {initials}
                            </Text>
                          </View>
                          <View style={[s.statusDot, { backgroundColor: statusColor, borderColor: cardBg }]} />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[s.teamName, { color: textPrimary }]}>{ms.userName}</Text>
                          <Text style={[s.teamRole, { color: textSecondary }]}>
                            Responder · {STATUS_LABELS[ms.status]}
                          </Text>
                        </View>
                      </View>
                      {!isLast && <View style={[s.divider, { backgroundColor: dividerColor }]} />}
                    </View>
                  );
                })}
              </View>
            )}

            {/* ── Status Stepper ── */}
            <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder, borderWidth: 1 }]}>
              <StatusStepper current={incident.responderStatus} isDark={isDark} />
            </View>

          </ScrollView>

          {/* ── Bottom Fixed Area ── */}
          <View style={[
            s.bottomBar,
            {
              paddingBottom: insets.bottom + 12,
              backgroundColor: isDark ? colors.dark.surface : colors.white,
              borderTopColor: dividerColor,
            },
          ]}>
            {isResolved ? (
              <View style={s.resolvedBanner}>
                <View style={[s.resolvedIcon, { backgroundColor: colors.severity.low }]}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                </View>
                <Text style={[s.resolvedText, { color: colors.severity.low }]}>Incident resolved</Text>
              </View>
            ) : (
              <>
                {/* Primary action button */}
                {primaryAction && (
                  <Pressable
                    onPress={primaryAction.onPress}
                    disabled={primaryAction.loading}
                    style={({ pressed }) => [
                      s.primaryBtn,
                      { backgroundColor: primaryAction.color },
                      pressed && { opacity: 0.88 },
                      primaryAction.loading && { opacity: 0.6 },
                    ]}
                    accessibilityRole="button"
                  >
                    {primaryAction.loading ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <>
                        <Ionicons name={primaryAction.icon} size={18} color={colors.white} />
                        <Text style={s.primaryBtnText}>{primaryAction.label}</Text>
                      </>
                    )}
                  </Pressable>
                )}

                {/* Secondary row: Navigate + Call reporter */}
                <View style={s.secondaryRow}>
                  <Pressable
                    onPress={openNativeMaps}
                    style={[s.secondaryBtn, { borderColor: dividerColor }]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="navigate-outline" size={16} color={colors.brand[500]} />
                    <Text style={[s.secondaryBtnText, { color: colors.brand[500] }]}>Navigate</Text>
                  </Pressable>
                  <Pressable
                    onPress={callReporter}
                    style={[s.secondaryBtn, { borderColor: dividerColor }]}
                    accessibilityRole="button"
                  >
                    <Ionicons name="call-outline" size={16} color={colors.brand[500]} />
                    <Text style={[s.secondaryBtnText, { color: colors.brand[500] }]}>Call reporter</Text>
                  </Pressable>
                </View>

                {/* Dispatch notified footer */}
                <View style={s.dispatchRow}>
                  <Ionicons name="radio-outline" size={14} color={textSecondary} />
                  <Text style={[s.dispatchText, { color: textSecondary }]}>
                    {STATUS_LABELS[incident.responderStatus]} · Dispatch notified
                  </Text>
                </View>
              </>
            )}
          </View>

          {/* Lightbox */}
          {lightboxIdx !== null && (
            <LightboxModal
              urls={incident.mediaUrls}
              initialIndex={lightboxIdx}
              onClose={() => setLightboxIdx(null)}
            />
          )}
        </>
      )}

      {sweetAlert && (
        <SweetAlert cfg={sweetAlert} onDismiss={() => setSweetAlert(null)} isDark={isDark} />
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },

  // ── Header ──
  header: {
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17, fontWeight: '800', color: colors.white,
  },
  headerRef: {
    fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '600', letterSpacing: 0.3,
  },
  headerRight: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  onlineDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.iconAccents.online,
  },
  chatBadge: {
    position: 'absolute', top: -5, right: -5,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.15)',
  },
  chatBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  // ── Scroll ──
  scroll: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },

  // ── Cards ──
  card: {
    borderRadius: 16, padding: 16, gap: 10,
  },

  // ── Summary card ──
  badgeRow: { flexDirection: 'row', gap: 8 },
  badge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
  },
  badgeText: { fontSize: 12, fontWeight: '700' },
  summaryMeta: {
    fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 2,
  },
  summaryTitle: {
    fontSize: 18, fontWeight: '800', color: colors.white, lineHeight: 24,
  },
  summaryLocationRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
  },
  summaryAddress: {
    fontSize: 13, color: 'rgba(255,255,255,0.65)', flex: 1, lineHeight: 18,
  },

  // ── Mini map ──
  miniMap: {
    height: 140, position: 'relative',
  },
  miniMapBg: {
    flex: 1,
    backgroundColor: '#1A222B',
    alignItems: 'center', justifyContent: 'center',
  },
  routeLine: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  routeDot: {
    width: 12, height: 12, borderRadius: 6,
  },
  routeDash: {
    width: 20, height: 2, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 1,
  },
  miniMapExpand: {
    position: 'absolute', top: 10, right: 10,
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  etaStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1,
  },
  etaText: { fontSize: 14, fontWeight: '600' },

  // ── Info chips ──
  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flex: 1, borderRadius: 12, padding: 12,
    alignItems: 'center', gap: 4,
  },
  chipLabel: { fontSize: 11, fontWeight: '500' },
  chipValue: { fontSize: 13, fontWeight: '700' },

  // ── Quote block ──
  quoteBar: {
    position: 'absolute', left: 0, top: 12, bottom: 12,
    width: 3, borderRadius: 2,
  },
  quoteContent: { paddingLeft: 8, gap: 8 },
  quoteText: {
    fontSize: 14, fontStyle: 'italic', lineHeight: 21,
  },
  quoteAttribution: {
    fontSize: 12,
  },

  // ── Reporter card ──
  reporterRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reporterAvatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  reporterInitials: { fontSize: 16, fontWeight: '800' },
  reporterName: { fontSize: 15, fontWeight: '700' },
  reporterSub: { fontSize: 12 },
  phoneBtn: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Photos ──
  photoIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  photoTitle: { fontSize: 14, fontWeight: '600' },
  photoSub: { fontSize: 12 },
  emptyMedia: {
    height: 80, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  emptyMediaText: { fontSize: 13, fontWeight: '500' },

  // ── Team ──
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  sectionCount: { fontSize: 12 },
  teamRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
  },
  teamAvatarWrap: { position: 'relative' },
  teamAvatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  teamInitials: { fontSize: 13, fontWeight: '800' },
  statusDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2,
  },
  teamNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamName: { fontSize: 14, fontWeight: '600' },
  leaderBadge: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
  },
  leaderBadgeText: { fontSize: 9, fontWeight: '800', color: colors.white, letterSpacing: 0.3 },
  teamRole: { fontSize: 12 },
  teamPhoneBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  divider: { height: StyleSheet.hairlineWidth },

  // ── Bottom bar ──
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 14,
    borderTopWidth: 1,
    gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 12, elevation: 10,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 52, borderRadius: 14, gap: 8,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: colors.white },
  secondaryRow: { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    height: 44, borderRadius: 12, gap: 6,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '600' },
  dispatchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingTop: 2,
  },
  dispatchText: { fontSize: 11, fontWeight: '500' },

  // ── Resolved ──
  resolvedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 14,
  },
  resolvedIcon: {
    width: 30, height: 30, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  resolvedText: { fontSize: 16, fontWeight: '700' },

  // ── Error ──
  errorIconWrap: {
    width: 72, height: 72, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  errorTitle: { fontSize: 17, fontWeight: '700' },
  errorBody: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brand[500],
    paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, marginTop: 4,
  },
  retryText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});
