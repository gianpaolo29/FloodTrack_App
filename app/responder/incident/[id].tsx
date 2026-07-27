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
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';

import { colors } from '@/theme/colors';
import { SeverityChip } from '@/components/SeverityChip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
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

// Thumb size computed dynamically inside components via useWindowDimensions

// ─── Severity gradient ───────────────────────────────────────────────────────
const SEVERITY_GRADIENTS: Record<Severity, readonly [string, string, string]> = {
  low:      ['#2E9E5B', '#22784A', '#134733'],
  moderate: ['#E8A800', '#B87A00', '#7A5000'],
  high:     ['#EA6A0C', '#C05000', '#8A3200'],
  critical: ['#D32F2F', '#A01010', '#6B0000'],
};

// ─── Status constants ─────────────────────────────────────────────────────────
const STATUS_STEPS: {
  key: ResponderStatus;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
}[] = [
  { key: 'en_route', label: 'En route',  icon: 'car',              description: 'Traveling to the incident location' },
  { key: 'resolved', label: 'Resolved',  icon: 'checkmark-circle', description: 'Incident has been cleared or contained' },
];

const STATUS_ORDER: ResponderStatus[] = ['pending', 'en_route', 'on_scene', 'resolved'];

const STATUS_LABELS: Record<ResponderStatus, string> = {
  pending:  'Not started',
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

const MAX_MEDIA = 3;

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
      <View style={[ms.overlay, { backgroundColor: overlay }]}>
        <ScrollView style={[ms.sheet, { backgroundColor: modalBg }]} bounces={false} keyboardShouldPersistTaps="handled">
          <View style={ms.sheetContent}>
            <View style={ms.handle} />

            <View style={ms.titleRow}>
              <View style={[ms.titleIcon, { backgroundColor: colors.brand[500] + '18' }]}>
                <Ionicons name="swap-vertical" size={18} color={colors.brand[500]} />
              </View>
              <View>
                <Text style={[ms.title, isDark && { color: colors.white }]}>Submit your status</Text>
                <Text style={[ms.titleSub, isDark && { color: colors.slate[500] }]}>
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
                      ms.stepCard,
                      isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border },
                      active && { borderColor: stepColor, backgroundColor: stepColor + '0C' },
                      disabled && { opacity: 0.4 },
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active, disabled }}
                  >
                    <View style={[
                      ms.stepNum,
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
                        ms.stepLabel,
                        isDark && { color: colors.white },
                        active && { color: stepColor },
                      ]}>
                        {step.label}
                      </Text>
                      <Text style={[ms.stepDesc, isDark && { color: colors.slate[500] }]}>
                        {step.description}
                      </Text>
                    </View>

                    {active && (
                      <View style={[ms.stepCheck, { backgroundColor: stepColor }]}>
                        <Ionicons name="checkmark" size={12} color={colors.white} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            <View>
              <Text style={[ms.notesLabel, isDark && { color: colors.slate[400] }]}>Field notes</Text>
              <TextInput
                style={[
                  ms.notes,
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
              <Text style={[ms.notesLabel, isDark && { color: colors.slate[400] }]}>
                Evidence photos ({media.length}/{MAX_MEDIA})
              </Text>

              <View style={ms.mediaRow}>
                {media.map((uri, idx) => (
                  <View key={uri} style={ms.mediaThumbnailWrap}>
                    <Image source={{ uri }} style={ms.mediaThumbnail} />
                    <Pressable
                      onPress={() => removeMedia(idx)}
                      style={ms.mediaRemoveBtn}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="Remove photo"
                    >
                      <Ionicons name="close" size={12} color={colors.white} />
                    </Pressable>
                  </View>
                ))}

                {media.length < MAX_MEDIA && (
                  <View style={ms.mediaAddBtns}>
                    <Pressable
                      onPress={() => pickMedia('camera')}
                      style={[ms.mediaAddBtn, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}
                      accessibilityRole="button"
                      accessibilityLabel="Take photo"
                    >
                      <Ionicons name="camera" size={20} color={colors.brand[500]} />
                      <Text style={[ms.mediaAddText, isDark && { color: colors.slate[400] }]}>Camera</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => pickMedia('library')}
                      style={[ms.mediaAddBtn, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}
                      accessibilityRole="button"
                      accessibilityLabel="Choose from gallery"
                    >
                      <Ionicons name="images" size={20} color={colors.brand[500]} />
                      <Text style={[ms.mediaAddText, isDark && { color: colors.slate[400] }]}>Gallery</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>

            <View style={ms.actions}>
              <Pressable onPress={onClose} style={[ms.cancelBtn, isDark && { borderColor: colors.dark.border }]}>
                <Text style={[ms.cancelText, isDark && { color: colors.slate[400] }]}>Cancel</Text>
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

const ms = StyleSheet.create({
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

// ─── TeamStatusPanel ─────────────────────────────────────────────────────────
function TeamStatusPanel({
  members,
  memberStatuses,
  currentUserId,
  isDark,
}: {
  members: TeamMember[];
  memberStatuses: MemberStatus[];
  currentUserId: string;
  isDark: boolean;
}) {
  const textPrimary   = isDark ? colors.white        : colors.slate[900];
  const textSecondary = isDark ? colors.slate[400]   : colors.slate[500];
  const dividerColor  = isDark ? colors.dark.border  : colors.slate[100];

  return (
    <View style={[tp.root, isDark && { borderColor: colors.dark.border }]}>
      {members.map((member, idx) => {
        const ms: MemberStatus | undefined = memberStatuses.find(s => s.userId === member.id);
        const status: ResponderStatus = ms?.status ?? 'pending';
        const statusColor = STATUS_COLORS[status];
        const isMe   = member.id === currentUserId;
        const isLast = idx === members.length - 1;

        return (
          <View key={member.id}>
            <View style={tp.row}>
              {/* Avatar */}
              <View style={[
                tp.avatar,
                { backgroundColor: isMe ? colors.brand[100] : (isDark ? colors.dark.elevated : colors.slate[100]) },
                member.isLeader && { borderWidth: 2, borderColor: colors.brand[500] },
              ]}>
                <Text style={[tp.initials, { color: isMe ? colors.brand[700] : (isDark ? colors.slate[400] : colors.slate[500]) }]}>
                  {member.firstName[0]}{member.lastName[0]}
                </Text>
                {member.isLeader && (
                  <View style={tp.leaderBadge}>
                    <Ionicons name="star" size={7} color={colors.white} />
                  </View>
                )}
              </View>

              {/* Name + status */}
              <View style={{ flex: 1, gap: 3 }}>
                <View style={tp.nameRow}>
                  <Text style={[tp.name, { color: textPrimary }]}>
                    {member.firstName} {member.lastName}
                  </Text>
                  {isMe && (
                    <View style={tp.youBadge}>
                      <Text style={tp.youText}>You</Text>
                    </View>
                  )}
                  {member.isLeader && (
                    <View style={[tp.leaderLabel, { backgroundColor: colors.brand[500] + '18' }]}>
                      <Text style={[tp.leaderLabelText, { color: colors.brand[500] }]}>Leader</Text>
                    </View>
                  )}
                </View>
                <View style={tp.statusRow}>
                  <View style={[tp.statusPill, { backgroundColor: statusColor + '18' }]}>
                    <Ionicons name={STATUS_ICONS[status]} size={9} color={statusColor} />
                    <Text style={[tp.statusText, { color: statusColor }]}>
                      {STATUS_LABELS[status]}
                    </Text>
                  </View>
                  {ms?.updatedAt && (
                    <Text style={[tp.time, { color: textSecondary }]}>{ms.updatedAt}</Text>
                  )}
                </View>
              </View>

              {/* Step progress dots */}
              <View style={tp.steps}>
                {STATUS_ORDER.map(s => {
                  const filled = STATUS_ORDER.indexOf(s) <= STATUS_ORDER.indexOf(status);
                  return (
                    <View
                      key={s}
                      style={[
                        tp.stepDot,
                        { backgroundColor: filled ? STATUS_COLORS[s] : (isDark ? colors.dark.border : colors.slate[200]) },
                      ]}
                    />
                  );
                })}
              </View>
            </View>
            {!isLast && <View style={[tp.divider, { backgroundColor: dividerColor }]} />}
          </View>
        );
      })}
    </View>
  );
}

const tp = StyleSheet.create({
  root: {
    borderRadius: 14, borderWidth: 1, borderColor: colors.slate[100], overflow: 'hidden',
  },
  row:     { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  avatar: {
    width: 38, height: 38, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative' as const,
  },
  initials: { fontSize: 13, fontWeight: '800' },
  leaderBadge: {
    position: 'absolute' as const, bottom: -3, right: -3,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: colors.brand[500],
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.white,
  },
  nameRow:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name:     { fontSize: 13, fontWeight: '700' },
  youBadge: {
    backgroundColor: colors.brand[500] + '20',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
  },
  youText:  { fontSize: 9, fontWeight: '800', color: colors.brand[500] },
  leaderLabel: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6,
  },
  leaderLabelText: { fontSize: 9, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
  },
  statusText: { fontSize: 10, fontWeight: '700' },
  time:       { fontSize: 10 },
  steps:      { flexDirection: 'row', gap: 3 },
  stepDot:    { width: 7, height: 7, borderRadius: 3.5 },
  divider:    { height: StyleSheet.hairlineWidth, marginHorizontal: 12 },
});

// ─── StatusStepper ────────────────────────────────────────────────────────────
function StatusStepper({ current, isDark }: { current: ResponderStatus; isDark: boolean }) {
  const currentIdx = STATUS_ORDER.indexOf(current);

  return (
    <View style={st.root}>
      {STATUS_ORDER.filter(s => s !== 'on_scene').map((status, idx, arr) => {
        const isDone    = STATUS_ORDER.indexOf(status) < currentIdx;
        const isCurrent = STATUS_ORDER.indexOf(status) === currentIdx;
        const color     = STATUS_COLORS[status];
        const icon      = STATUS_ICONS[status];
        const isLast    = idx === arr.length - 1;

        return (
          <View key={status} style={st.stepRow}>
            <View style={st.stepVisual}>
              <View style={[
                st.stepDot,
                isDone && { backgroundColor: colors.severity.low },
                isCurrent && { backgroundColor: color, borderColor: color + '40', borderWidth: 3 },
                !isDone && !isCurrent && { backgroundColor: isDark ? colors.dark.border : colors.slate[200] },
              ]}>
                {isDone && <Ionicons name="checkmark" size={10} color={colors.white} />}
                {isCurrent && <View style={[st.stepDotInner, { backgroundColor: colors.white }]} />}
              </View>
              {!isLast && (
                <View style={[
                  st.stepLine,
                  isDone && { backgroundColor: colors.severity.low },
                  !isDone && { backgroundColor: isDark ? colors.dark.border : colors.slate[200] },
                ]} />
              )}
            </View>
            <View style={st.stepText}>
              <Text style={[
                st.stepLabel,
                isDone && { color: colors.severity.low },
                isCurrent && { color, fontWeight: '700' },
                !isDone && !isCurrent && { color: isDark ? colors.slate[600] : colors.slate[400] },
              ]}>
                {STATUS_LABELS[status]}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const st = StyleSheet.create({
  root:         { gap: 0 },
  stepRow:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepVisual:   { alignItems: 'center', width: 22 },
  stepDot:      {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotInner: { width: 6, height: 6, borderRadius: 3 },
  stepLine:     { width: 2, height: 20 },
  stepText:     { paddingBottom: 16, flex: 1 },
  stepLabel:    { fontSize: 13, fontWeight: '500' },
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

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={lb.root}>
        <Pressable style={lb.backdrop} onPress={onClose} />
        <Image
          source={{ uri: urls[current] }}
          style={lb.image}
          resizeMode="contain"
        />
        <Pressable onPress={onClose} style={lb.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="close" size={22} color={colors.white} />
        </Pressable>
        {urls.length > 1 && (
          <View style={lb.nav}>
            <Pressable
              onPress={() => setCurrent(c => Math.max(0, c - 1))}
              style={[lb.navBtn, current === 0 && { opacity: 0.35 }]}
              disabled={current === 0}
            >
              <Ionicons name="chevron-back" size={24} color={colors.white} />
            </Pressable>
            <Text style={lb.counter}>{current + 1} / {urls.length}</Text>
            <Pressable
              onPress={() => setCurrent(c => Math.min(urls.length - 1, c + 1))}
              style={[lb.navBtn, current === urls.length - 1 && { opacity: 0.35 }]}
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

const lb = StyleSheet.create({
  root:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  backdrop: StyleSheet.absoluteFillObject,
  image:   { width: '100%', aspectRatio: 1, maxHeight: '70%' },
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

  const screenBg = isDark ? colors.dark.bg : '#F4F6F9';
  const cardBg   = isDark ? colors.dark.card : colors.white;

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

  // Reload every time the screen comes into focus (e.g. returning from map/field-report/chat)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Real-time: join the report room, track new messages + member status changes
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
        // Refresh member statuses in real-time
        getMemberStatuses(id, token)
          .then(setMemberStatuses)
          .catch(() => {});
        // Also refresh incident responderStatus
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
        // Confirm team advancement to en_route — updates all members + team at once
        await confirmTeamStatus(incident.id, 'en_route', token!);
        setIncident(prev => prev ? { ...prev, responderStatus: 'en_route' } : prev);
        // Refetch real member statuses from backend
        getMemberStatuses(incident.id, token!).then(setMemberStatuses).catch(() => {});
        // Persist session so it survives app close/restart
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
    // Open locked map session with navigation to incident
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

  const statusColor = incident ? STATUS_COLORS[incident.responderStatus] : colors.slate[400];
  const statusLabel = incident ? STATUS_LABELS[incident.responderStatus] : '';
  const statusIcon  = incident ? STATUS_ICONS[incident.responderStatus] : 'time-outline' as const;
  const isResolved  = incident?.responderStatus === 'resolved';

  // ── Team derived state ────────────────────────────────────────────────────
  const isLeader = !!team && team.leaderId === user?.id;
  const myMemberStatus = memberStatuses.find(ms => ms.userId === user?.id);
  const teamStatusIdx  = STATUS_ORDER.indexOf(incident?.responderStatus ?? 'pending');
  const myStatusIdx    = myMemberStatus ? STATUS_ORDER.indexOf(myMemberStatus.status) : -1;
  const waitingForTeam = myStatusIdx > teamStatusIdx;

  // Next status all members have reached (or past), above current team status
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

  const gradientColors = incident
    ? SEVERITY_GRADIENTS[incident.severity]
    : (['#1F6FBF', '#124577', '#0B2F52'] as const);

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>

      {/* ── Gradient Header ── */}
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 14 }]}
      >
        {/* Decorative orbs */}
        <View style={[styles.orb, { width: 160, height: 160, top: -50, right: -40, opacity: 0.06 }]} />
        <View style={[styles.orb, { width: 90, height: 90, bottom: 20, left: -20, opacity: 0.05 }]} />

        <View style={styles.headerContent}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button" accessibilityLabel="Go back" hitSlop={8}
          >
            <Ionicons name="chevron-back" size={20} color={colors.white} />
          </Pressable>

          <View style={{ flex: 1, gap: 3 }}>
            {incident && (
              <>
                <Text style={styles.headerRef}>{incident.reference}</Text>
                <Text style={styles.headerTitle} numberOfLines={2}>{incident.title}</Text>
              </>
            )}
          </View>

          {incident && (
            <View style={[styles.headerStatus, { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.25)' }]}>
              <Ionicons name={statusIcon} size={12} color={colors.white} />
              <Text style={styles.headerStatusText}>{statusLabel}</Text>
            </View>
          )}
        </View>

        {/* Severity + distance strip */}
        {incident && (
          <View style={styles.headerMeta}>
            <View style={styles.headerMetaChip}>
              <Ionicons name="warning" size={11} color="rgba(255,255,255,0.9)" />
              <Text style={styles.headerMetaText}>
                {incident.severity.charAt(0).toUpperCase() + incident.severity.slice(1)}
              </Text>
            </View>
            <View style={styles.headerMetaDot} />
            <View style={styles.headerMetaChip}>
              <Ionicons name="location" size={11} color="rgba(255,255,255,0.9)" />
              <Text style={styles.headerMetaText}>{incident.distance}</Text>
            </View>
            {incident.nearbyCount > 0 && (
              <>
                <View style={styles.headerMetaDot} />
                <View style={styles.headerMetaChip}>
                  <Ionicons name="alert-circle" size={11} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.headerMetaText}>{incident.nearbyCount} nearby</Text>
                </View>
              </>
            )}
          </View>
        )}

        {/* Wave bottom */}
        <View style={styles.waveWrap} pointerEvents="none">
          <View style={[styles.waveBack, { backgroundColor: screenBg, opacity: 0.3 }]} />
          <View style={[styles.waveFront, { backgroundColor: screenBg }]} />
        </View>
      </LinearGradient>

      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand[500]} />
        </View>
      )}

      {!loading && error && (
        <View style={styles.centered}>
          <View style={[styles.errorIconWrap, isDark && { backgroundColor: colors.dark.card }]}>
            <Ionicons name="cloud-offline-outline" size={36} color={colors.slate[400]} />
          </View>
          <Text style={[styles.errorTitle, isDark && { color: colors.white }]}>Connection issue</Text>
          <Text style={[styles.errorBody, isDark && { color: colors.slate[400] }]}>{error}</Text>
          <Pressable onPress={load} style={styles.retryBtn} accessibilityRole="button">
            <Ionicons name="refresh" size={15} color={colors.white} />
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {!loading && !error && incident && (
        <>
          <ScrollView
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Info card ── */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: colors.brand[500] + '18' }]}>
                  <Ionicons name="information-circle-outline" size={16} color={colors.brand[500]} />
                </View>
                <Text style={[styles.cardHeaderTitle, isDark && { color: colors.white }]}>Incident Info</Text>
              </View>

              {/* Severity */}
              <View style={[styles.infoRow, isDark && { borderBottomColor: colors.dark.border }]}>
                <Text style={[styles.infoLabel, isDark && { color: colors.slate[500] }]}>Severity</Text>
                <SeverityChip level={incident.severity} size="sm" />
              </View>

              {/* Type */}
              <View style={[styles.infoRow, isDark && { borderBottomColor: colors.dark.border }]}>
                <Text style={[styles.infoLabel, isDark && { color: colors.slate[500] }]}>Type</Text>
                <Text style={[styles.infoValue, isDark && { color: colors.white }]}>{incident.type || 'Flood'}</Text>
              </View>

              {/* Reporter name */}
              <View style={[styles.infoRow, isDark && { borderBottomColor: colors.dark.border }]}>
                <Text style={[styles.infoLabel, isDark && { color: colors.slate[500] }]}>Reported By</Text>
                <View style={styles.infoValueRow}>
                  <Ionicons name="person-outline" size={13} color={colors.brand[500]} />
                  <Text style={[styles.infoValue, isDark && { color: colors.white }]}>{incident.reportedBy}</Text>
                </View>
              </View>

              {/* Date reported */}
              <View style={[styles.infoRow, isDark && { borderBottomColor: colors.dark.border }]}>
                <Text style={[styles.infoLabel, isDark && { color: colors.slate[500] }]}>Reported</Text>
                <View style={styles.infoValueRow}>
                  <Ionicons name="time-outline" size={13} color={colors.brand[500]} />
                  <Text style={[styles.infoValue, isDark && { color: colors.white }]}>{incident.reportedAt}</Text>
                </View>
              </View>

              {/* Location */}
              <View style={[styles.infoRow, isDark && { borderBottomColor: colors.dark.border }]}>
                <Text style={[styles.infoLabel, isDark && { color: colors.slate[500] }]}>Location</Text>
                <View style={[styles.infoValueRow, { flex: 1, justifyContent: 'flex-end' }]}>
                  <Ionicons name="location-outline" size={13} color={colors.brand[500]} />
                  <Text style={[styles.infoValue, { flex: 1, textAlign: 'right' }, isDark && { color: colors.white }]} numberOfLines={2}>
                    {incident.address}
                  </Text>
                </View>
              </View>

              {/* Description */}
              {!!incident.description && (
                <>
                  <View style={[styles.descDivider, isDark && { backgroundColor: colors.dark.border }]} />
                  <View style={{ gap: 6 }}>
                    <Text style={[styles.infoLabel, isDark && { color: colors.slate[500] }]}>Description</Text>
                    <Text style={[styles.description, isDark && { color: colors.slate[400] }]}>
                      {incident.description}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* ── Response progress ── */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: colors.brand[500] + '18' }]}>
                  <Ionicons name="git-branch-outline" size={16} color={colors.brand[500]} />
                </View>
                <Text style={[styles.cardHeaderTitle, isDark && { color: colors.white }]}>
                  Response progress
                </Text>
              </View>
              <StatusStepper current={incident.responderStatus} isDark={isDark} />
            </View>



            {/* ── Evidence ── */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: colors.brand[500] + '18' }]}>
                  <Ionicons name="images" size={16} color={colors.brand[500]} />
                </View>
                <Text style={[styles.cardHeaderTitle, isDark && { color: colors.white }]}>
                  Submitted evidence
                </Text>
                <View style={[styles.evidenceCountPill, isDark && { backgroundColor: colors.dark.elevated }]}>
                  <Text style={[styles.evidenceCountText, isDark && { color: colors.slate[400] }]}>
                    {incident.evidenceCount}
                  </Text>
                </View>
              </View>

              {incident.mediaUrls.length > 0 ? (
                <View style={styles.evidenceThumbs}>
                  {incident.mediaUrls.map((url, idx) => (
                    <Pressable
                      key={url}
                      onPress={() => setLightboxIdx(idx)}
                      style={({ pressed }) => [
                        styles.evidenceThumb,
                        { width: thumbSize, height: thumbSize },
                        pressed && { opacity: 0.8 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`View photo ${idx + 1}`}
                    >
                      <Image source={{ uri: url }} style={styles.evidenceThumbImg} />
                      <View style={styles.evidenceThumbOverlay}>
                        <Ionicons name="expand" size={12} color={colors.white} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={[styles.evidenceEmpty, isDark && { backgroundColor: colors.dark.elevated }]}>
                  <Ionicons name="images-outline" size={28} color={colors.slate[400]} />
                  <Text style={[styles.evidenceEmptyText, isDark && { color: colors.slate[500] }]}>
                    No evidence attached
                  </Text>
                </View>
              )}
            </View>

            {/* ── Reporter ── */}
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardHeaderIcon, { backgroundColor: colors.brand[500] + '18' }]}>
                  <Ionicons name="person" size={16} color={colors.brand[500]} />
                </View>
                <Text style={[styles.cardHeaderTitle, isDark && { color: colors.white }]}>
                  Reporter
                </Text>
              </View>

              <View style={styles.reporterRow}>
                <View style={[styles.reporterAvatar, isDark && { backgroundColor: colors.dark.elevated }]}>
                  <Text style={[styles.reporterInitials, isDark && { color: colors.brand[300] }]}>
                    {incident.reportedBy.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.reporterName, isDark && { color: colors.white }]}>
                    {incident.reportedBy}
                  </Text>
                  <View style={styles.reporterMeta}>
                    <Ionicons name="time-outline" size={11} color={isDark ? colors.slate[600] : colors.slate[400]} />
                    <Text style={[styles.reporterTime, isDark && { color: colors.slate[500] }]}>
                      {incident.reportedAt}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={callReporter}
                  style={[styles.callBtn, isDark && { backgroundColor: colors.dark.elevated }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${incident.reportedBy}`}
                >
                  <Ionicons name="call" size={16} color={colors.brand[500]} />
                </Pressable>
              </View>
            </View>

          </ScrollView>

          {/* ── Bottom action bar ── */}
          <View style={[
            styles.actionBar,
            {
              paddingBottom: insets.bottom + 14,
              backgroundColor: isDark ? colors.dark.surface : colors.white,
              borderTopColor: isDark ? colors.dark.border : colors.slate[100],
            },
          ]}>
            {isResolved ? (
              /* Resolved banner */
              <View style={styles.resolvedBanner}>
                <View style={styles.resolvedIcon}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                </View>
                <Text style={styles.resolvedText}>Incident resolved</Text>
              </View>
            ) : (
              <>
                {/* LEFT: Chat button */}
                <Pressable
                  onPress={() => {
                    setUnreadCount(0);
                    router.push(`/responder/incident/${id}/chat` as never);
                  }}
                  style={({ pressed }) => [
                    styles.chatActionBtn,
                    pressed && { transform: [{ scale: 0.92 }], opacity: 0.8 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Open chat"
                >
                  <View style={{ position: 'relative' }}>
                    <Ionicons name="chatbubbles" size={20} color={colors.brand[500]} />
                    {unreadCount > 0 && (
                      <View style={styles.chatBadge}>
                        <Text style={styles.chatBadgeText}>
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.actionBtnLabel, { color: colors.brand[500] }]}>Chat</Text>
                </Pressable>

                {/* RIGHT: dynamic main action */}
                <View style={{ flex: 1 }}>
                  {/* Leader: team ready to advance → Finish button */}
                  {isLeader && nextConfirmableStatus ? (
                    <Pressable
                      onPress={() => handleConfirmTeamStatus(nextConfirmableStatus)}
                      disabled={confirmingStatus}
                      style={({ pressed }) => [
                        styles.startBtn,
                        { backgroundColor: nextConfirmableStatus === 'resolved' ? colors.severity.low : colors.brand[500] },
                        pressed && { opacity: 0.88 },
                        confirmingStatus && { opacity: 0.6 },
                      ]}
                      accessibilityRole="button"
                    >
                      {confirmingStatus ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <>
                          <Ionicons name="checkmark-done" size={18} color={colors.white} />
                          <Text style={styles.startBtnText}>
                            Finish — {STATUS_LABELS[nextConfirmableStatus]}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  ) : isLeader && incident.responderStatus === 'pending' ? (
                    /* Leader: Start only when pending */
                    <Pressable
                      onPress={handleStart}
                      disabled={startingResponse}
                      style={({ pressed }) => [
                        styles.startBtn,
                        { backgroundColor: colors.brand[500] },
                        pressed && { opacity: 0.88 },
                        startingResponse && { opacity: 0.6 },
                      ]}
                      accessibilityRole="button"
                    >
                      {startingResponse ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <>
                          <Ionicons name="play" size={18} color={colors.white} />
                          <Text style={styles.startBtnText}>Start</Text>
                        </>
                      )}
                    </Pressable>
                  ) : isLeader ? (
                    /* Leader: session active — resume map */
                    <Pressable
                      onPress={() => router.push({
                        pathname: '/responder/(tabs)/map',
                        params: {
                          destLat:       String(incident.latitude),
                          destLng:       String(incident.longitude),
                          destTitle:     incident.title,
                          incidentId:    incident.id,
                          isLeaderParam: '1',
                          sessionLocked: '1',
                          reporterName:  incident.reportedBy,
                          reportedAt:    incident.reportedAt,
                          severity:      incident.severity,
                          incidentType:  incident.type || 'Flood',
                        },
                      } as never)}
                      style={({ pressed }) => [
                        styles.startBtn,
                        { backgroundColor: colors.brand[500] },
                        pressed && { opacity: 0.88 },
                      ]}
                      accessibilityRole="button"
                    >
                      <Ionicons name="navigate" size={18} color={colors.white} />
                      <Text style={styles.startBtnText}>Resume Session</Text>
                    </Pressable>
                  ) : (
                    /* Member: view-only map button */
                    <Pressable
                      onPress={() => router.push({
                        pathname: '/responder/(tabs)/map',
                        params: {
                          destLat:       String(incident.latitude),
                          destLng:       String(incident.longitude),
                          destTitle:     incident.title,
                          incidentId:    incident.id,
                          isLeaderParam: '0',
                          sessionLocked: '1',
                          viewOnly:      '1',
                          reporterName:  incident.reportedBy,
                          reportedAt:    incident.reportedAt,
                          severity:      incident.severity,
                          incidentType:  incident.type || 'Flood',
                        },
                      } as never)}
                      style={({ pressed }) => [
                        styles.startBtn,
                        { backgroundColor: colors.brand[500] },
                        pressed && { opacity: 0.88 },
                      ]}
                      accessibilityRole="button"
                    >
                      <Ionicons name="map" size={18} color={colors.white} />
                      <Text style={styles.startBtnText}>View</Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </View>

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

const styles = StyleSheet.create({
  root:    { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },

  memberStatusBadge: {
    flex: 1, height: 48, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.slate[100],
    borderWidth: 1.5, borderColor: colors.slate[200],
  },
  memberStatusText: {
    fontSize: 14, fontWeight: '700',
  },

  // ── Header ──
  header: {
    paddingBottom: 44,
    position: 'relative',
    overflow: 'hidden',
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,1)',
  },
  waveWrap:  { position: 'absolute', bottom: 0, left: 0, right: 0, height: 30 },
  waveBack:  { position: 'absolute', bottom: 0, left: -8, right: -8, height: 30, borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  waveFront: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 22, borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  headerContent: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingBottom: 8, gap: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    marginTop: 2,
  },
  headerRef:    { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600', letterSpacing: 0.4 },
  headerTitle:  { fontSize: 17, fontWeight: '800', color: colors.white, lineHeight: 24 },
  headerStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5,
    marginTop: 4,
  },
  headerStatusText: { fontSize: 11, fontWeight: '700', color: colors.white },
  chatBtn: {
    width: 38, height: 38, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    marginTop: 4,
  },
  chatBadge: {
    position: 'absolute', top: -4, right: -4,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.15)',
  },
  chatBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  headerMeta: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 8, paddingTop: 6,
    flexWrap: 'wrap', gap: 6,
  },
  headerMetaChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerMetaText: { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '500' },
  headerMetaDot: {
    width: 3, height: 3, borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },

  scroll: { padding: 16, gap: 14, paddingTop: 14 },

  card: {
    borderRadius: 18, padding: 18, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  cardHeader:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardHeaderPadded: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 18, paddingBottom: 12 },
  cardHeaderIcon: {
    width: 32, height: 32, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  cardHeaderTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.slate[900] },

  // ── Info ──
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.slate[100],
  },
  infoLabel:    { fontSize: 12, fontWeight: '600', color: colors.slate[500], textTransform: 'uppercase', letterSpacing: 0.4 },
  infoValue:    { fontSize: 13, fontWeight: '600', color: colors.slate[800] },
  infoValueRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  descDivider:  { height: StyleSheet.hairlineWidth, backgroundColor: colors.slate[100], marginVertical: 10 },
  description:  { fontSize: 13, color: colors.slate[600], lineHeight: 21 },


  // ── Navigate chip ──
  navChipBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.brand[500],
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  navChipText: { fontSize: 11, color: colors.white, fontWeight: '700' },

  // ── Status history ──
  historyRow:     { flexDirection: 'row', gap: 12 },
  historyVisual:  { alignItems: 'center', width: 26 },
  historyDot: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  historyLine: {
    width: 2, flex: 1, minHeight: 16,
    backgroundColor: colors.slate[100],
    marginVertical: 4,
  },
  historyBody:    { flex: 1, paddingBottom: 4 },
  historyTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  historyStatus:  { fontSize: 13, fontWeight: '700' },
  historyTime:    { fontSize: 11, color: colors.slate[400] },
  historyBy:      { fontSize: 12, color: colors.slate[400], marginBottom: 4 },
  historyNoteWrap: {
    backgroundColor: colors.slate[50], borderRadius: 10,
    borderWidth: 1, borderColor: colors.slate[100],
    padding: 10, marginTop: 4,
  },
  historyNote:    { fontSize: 12, color: colors.slate[600], lineHeight: 18 },

  // ── Evidence ──
  evidenceCountPill: {
    backgroundColor: colors.slate[100],
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
  },
  evidenceCountText: { fontSize: 12, fontWeight: '700', color: colors.slate[500] },
  evidenceThumbs:    { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  evidenceThumb:     { borderRadius: 12, overflow: 'hidden', position: 'relative' },
  evidenceThumbImg:  { width: '100%', height: '100%' },
  evidenceThumbOverlay: {
    position: 'absolute', bottom: 5, right: 5,
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
  evidenceEmpty: {
    height: 90, borderRadius: 14,
    backgroundColor: colors.slate[50],
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  evidenceEmptyText: { fontSize: 13, color: colors.slate[500], fontWeight: '500' },

  // ── Reporter ──
  reporterRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  reporterAvatar: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: colors.brand[100],
    alignItems: 'center', justifyContent: 'center',
  },
  reporterInitials: { fontSize: 16, fontWeight: '800', color: colors.brand[700] },
  reporterName:     { fontSize: 15, fontWeight: '700', color: colors.slate[900] },
  reporterMeta:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  reporterTime:     { fontSize: 12, color: colors.slate[400] },
  callBtn: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: colors.brand[100],
    alignItems: 'center', justifyContent: 'center',
  },

  // ── Bottom bar ──
  actionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingTop: 16,
    borderTopWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.1, shadowRadius: 16, elevation: 12,
  },
  chatActionBtn: {
    width: 64, height: 64, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.brand[500],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 3,
  },
  startBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    height: 54,
    borderRadius: 14,
  },
  startBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
  },
  leaderWaitingWrap: {
    marginTop: 8,
  },
  actionBtnLabel: {
    fontSize: 10, fontWeight: '600',
  },
  resolvedBanner: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 14,
  },
  resolvedIcon: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: colors.severity.low,
    alignItems: 'center', justifyContent: 'center',
  },
  resolvedText: { fontSize: 16, color: colors.severity.low, fontWeight: '700' },

  // ── Team status card ──
  teamReadyPill: {
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8,
  },
  teamReadyText: { fontSize: 11, fontWeight: '700' },

  // ── Waiting banner ──
  waitingBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.brand[500] + '12',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  waitingText: { fontSize: 12, fontWeight: '600', color: colors.slate[600], flex: 1 },

  // ── Quick actions ──
  quickActionsGrid: { flexDirection: 'row', gap: 10 },
  quickActionBtn: {
    flex: 1, backgroundColor: colors.slate[50],
    borderRadius: 16, padding: 16, alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.slate[100],
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    position: 'relative' as const, overflow: 'hidden' as const,
  },
  quickActionIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  quickActionLabel: { fontSize: 13, fontWeight: '800', color: colors.slate[900], letterSpacing: -0.2 },
  quickActionSub:   { fontSize: 10, color: colors.slate[400], fontWeight: '500' },

  // ── Error ──
  errorIconWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: colors.slate[100],
    alignItems: 'center', justifyContent: 'center',
  },
  errorTitle: { fontSize: 17, fontWeight: '700', color: colors.slate[900] },
  errorBody:  { fontSize: 13, color: colors.slate[500], textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brand[500],
    paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, marginTop: 4,
  },
  retryText: { color: colors.white, fontWeight: '700', fontSize: 14 },
});
