import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE } from '@/components/MapView';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useAlert } from '@/context/AlertContext';
import { PrimaryButton } from '@/components/PrimaryButton';
import {
  getFamily,
  createFamily,
  joinFamily,
  inviteFamilyMember,
  familyCheckIn,
  leaveFamily,
  removeFamilyMember,
} from '@/services/api';
import type { CheckInStatus, FamilyGroup, FamilyMember } from '@/types';

const STATUS_CONFIG: Record<CheckInStatus, {
  label: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  gradient: [string, string];
}> = {
  safe: {
    label: 'Safe',
    color: colors.severity.low,
    icon: 'checkmark-circle',
    gradient: ['#34D399', '#059669'],
  },
  need_help: {
    label: 'Needs Help',
    color: colors.severity.critical,
    icon: 'alert-circle',
    gradient: ['#F87171', '#DC2626'],
  },
  unknown: {
    label: 'Unknown',
    color: colors.slate[400],
    icon: 'help-circle',
    gradient: [colors.slate[400], colors.slate[500]],
  },
};

function getInitials(first: string, last: string): string {
  return ((first?.[0] ?? '') + (last?.[0] ?? '')).toUpperCase() || '?';
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Not yet';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusSummaryBar({ members, isDark }: { members: FamilyMember[]; isDark: boolean }) {
  const safe   = members.filter(m => m.checkInStatus === 'safe').length;
  const help   = members.filter(m => m.checkInStatus === 'need_help').length;
  const unknown = members.filter(m => m.checkInStatus === 'unknown').length;
  const total  = members.length;

  const bg = isDark ? colors.dark.elevated : colors.slate[50];

  return (
    <View style={[sum.bar, { backgroundColor: bg }]}>
      {safe > 0 && (
        <View style={[sum.segment, { flex: safe, backgroundColor: colors.severity.low + '30' }]}>
          <View style={[sum.dot, { backgroundColor: colors.severity.low }]} />
          <Text style={[sum.segText, { color: colors.severity.low }]}>{safe} Safe</Text>
        </View>
      )}
      {help > 0 && (
        <View style={[sum.segment, { flex: help, backgroundColor: colors.severity.critical + '20' }]}>
          <View style={[sum.dot, { backgroundColor: colors.severity.critical }]} />
          <Text style={[sum.segText, { color: colors.severity.critical }]}>{help} Help</Text>
        </View>
      )}
      {unknown > 0 && (
        <View style={[sum.segment, { flex: unknown, backgroundColor: colors.slate[300] + '20' }]}>
          <View style={[sum.dot, { backgroundColor: colors.slate[400] }]} />
          <Text style={[sum.segText, { color: colors.slate[500] }]}>{unknown} Pending</Text>
        </View>
      )}
    </View>
  );
}

const sum = StyleSheet.create({
  bar: { flexDirection: 'row', borderRadius: 12, overflow: 'hidden', gap: 2, marginBottom: 4 },
  segment: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 10, paddingHorizontal: 8, overflow: 'hidden',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  segText: { fontSize: 11, fontWeight: '700' },
});

function CheckInButton({
  status,
  isActive,
  onPress,
  disabled,
}: {
  status: 'safe' | 'need_help';
  isActive: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const config = STATUS_CONFIG[status];

  function handlePress() {
    Haptics.impactAsync(
      status === 'need_help'
        ? Haptics.ImpactFeedbackStyle.Heavy
        : Haptics.ImpactFeedbackStyle.Medium,
    );
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.92, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, damping: 8, stiffness: 300, useNativeDriver: true }),
    ]).start();
    onPress();
  }

  const label = status === 'safe' ? "I'm Safe" : 'Need Help';
  const icon  = config.icon;

  return (
    <Animated.View style={{ flex: 1, transform: [{ scale: scaleAnim }] }}>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        style={({ pressed }) => [
          ci.btn,
          pressed && { opacity: 0.9 },
        ]}
      >
        {isActive ? (
          <LinearGradient
            colors={config.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={ci.gradient}
          >
            <Ionicons name={icon} size={28} color={colors.white} />
            <Text style={ci.labelActive}>{label}</Text>
            <View style={ci.activeBadge}>
              <Ionicons name="checkmark" size={10} color={colors.white} />
              <Text style={ci.activeBadgeText}>Active</Text>
            </View>
          </LinearGradient>
        ) : (
          <View style={[ci.inactive, { borderColor: config.color + '40' }]}>
            <Ionicons name={icon} size={28} color={config.color} />
            <Text style={[ci.labelInactive, { color: config.color }]}>{label}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const CI_HEIGHT = 120;

const ci = StyleSheet.create({
  btn: { borderRadius: 20, overflow: 'hidden', height: CI_HEIGHT },
  gradient: {
    alignItems: 'center', justifyContent: 'center', gap: 6,
    height: CI_HEIGHT, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 12, elevation: 8,
  },
  inactive: {
    alignItems: 'center', justifyContent: 'center', gap: 6,
    height: CI_HEIGHT, borderRadius: 20,
    borderWidth: 1.5, borderStyle: 'dashed',
  },
  labelActive: { fontSize: 16, fontWeight: '900', color: colors.white, letterSpacing: -0.2 },
  labelInactive: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12,
    marginTop: 2,
  },
  activeBadgeText: { fontSize: 10, fontWeight: '700', color: colors.white },
});

function MemberCard({
  member,
  currentUserId,
  isGroupCreator,
  onRemove,
  isDark,
  index,
}: {
  member: FamilyMember;
  currentUserId: string;
  isGroupCreator: boolean;
  onRemove: () => void;
  isDark: boolean;
  index: number;
}) {
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const config    = STATUS_CONFIG[member.checkInStatus];
  const isMe      = member.id === currentUserId;
  const isHelp    = member.checkInStatus === 'need_help';

  const cardBg     = isDark ? colors.dark.elevated : colors.white;
  const textColor  = isDark ? colors.white : colors.slate[900];
  const subColor   = isDark ? colors.slate[500] : colors.slate[400];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 350, delay: index * 60, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, delay: index * 60, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim, index]);

  return (
    <Animated.View style={[
      mc.card,
      {
        backgroundColor: cardBg,
        borderColor: isHelp ? colors.severity.critical + '40' : (isDark ? colors.dark.border : colors.slate[100]),
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
      },
      isHelp && mc.cardUrgent,
    ]}>
      {isHelp && <View style={mc.urgentStripe} />}
      <View style={mc.row}>
        <View style={[mc.avatar, { backgroundColor: config.color + '18' }]}>
          <Text style={[mc.avatarText, { color: config.color }]}>
            {getInitials(member.firstName, member.lastName)}
          </Text>
        </View>

        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={[mc.name, { color: textColor }]}>
              {member.firstName} {member.lastName}
            </Text>
            {isMe && (
              <View style={[mc.badge, { backgroundColor: colors.brand[500] + '18' }]}>
                <Text style={[mc.badgeText, { color: colors.brand[500] }]}>You</Text>
              </View>
            )}
            {member.isCreator && (
              <View style={[mc.badge, { backgroundColor: colors.severity.moderate + '14' }]}>
                <Ionicons name="star" size={8} color={colors.severity.moderate} />
                <Text style={[mc.badgeText, { color: colors.severity.moderate }]}>Admin</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="time-outline" size={11} color={subColor} />
            <Text style={[mc.time, { color: subColor }]}>{timeAgo(member.checkedInAt)}</Text>
          </View>
        </View>

        <View style={[mc.statusPill, { backgroundColor: config.color + '14' }]}>
          <Ionicons name={config.icon} size={14} color={config.color} />
          <Text style={[mc.statusText, { color: config.color }]}>{config.label}</Text>
        </View>

        {isGroupCreator && !isMe && (
          <Pressable
            onPress={onRemove}
            hitSlop={10}
            style={({ pressed }) => [mc.removeBtn, pressed && { opacity: 0.5 }]}
          >
            <Ionicons name="ellipsis-vertical" size={16} color={colors.slate[400]} />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

const mc = StyleSheet.create({
  card: {
    borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  cardUrgent: {
    shadowColor: colors.severity.critical,
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 4,
    overflow: 'hidden',
  },
  urgentStripe: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
    backgroundColor: colors.severity.critical,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '900' },
  name: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
  },
  badgeText: { fontSize: 9, fontWeight: '800' },
  time: { fontSize: 11 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  removeBtn: { padding: 4 },
});

function FormModal({
  visible,
  title,
  description,
  icon,
  placeholder,
  buttonLabel,
  loading,
  onSubmit,
  onClose,
  isDark,
  keyboardType,
  accentColor,
}: {
  visible: boolean;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  buttonLabel: string;
  loading: boolean;
  onSubmit: (value: string) => void;
  onClose: () => void;
  isDark: boolean;
  keyboardType?: 'default' | 'email-address';
  accentColor?: string;
}) {
  const [value, setValue] = useState('');
  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const accent    = accentColor ?? colors.brand[500];
  const bg        = isDark ? colors.dark.elevated : colors.white;
  const text      = isDark ? colors.white : colors.slate[900];
  const sub       = isDark ? colors.slate[400] : colors.slate[500];
  const inputBg   = isDark ? colors.dark.card : colors.slate[50];
  const bdr       = isDark ? colors.dark.border : colors.slate[200];

  useEffect(() => {
    if (visible) {
      setValue('');
      slideAnim.setValue(300);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, damping: 20, stiffness: 200, useNativeDriver: true }),
        Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Animated.View style={[fm.backdrop, { opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[fm.sheet, { backgroundColor: bg, transform: [{ translateY: slideAnim }] }]}>
        <View style={fm.handle} />
        <View style={[fm.accentLine, { backgroundColor: accent }]} />

        <View style={fm.header}>
          <View style={[fm.iconWrap, { backgroundColor: accent + '14' }]}>
            <Ionicons name={icon} size={24} color={accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[fm.title, { color: text }]}>{title}</Text>
            <Text style={[fm.desc, { color: sub }]}>{description}</Text>
          </View>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              fm.closeBtn,
              { backgroundColor: isDark ? colors.dark.card : colors.slate[100] },
              pressed && { opacity: 0.6 },
            ]}
            hitSlop={8}
          >
            <Ionicons name="close" size={16} color={sub} />
          </Pressable>
        </View>

        <View style={[fm.inputWrap, { backgroundColor: inputBg, borderColor: bdr }]}>
          <Ionicons
            name={keyboardType === 'email-address' ? 'mail-outline' : 'text-outline'}
            size={18}
            color={value ? accent : colors.slate[400]}
          />
          <TextInput
            style={[fm.input, { color: text }]}
            placeholder={placeholder}
            placeholderTextColor={colors.slate[400]}
            value={value}
            onChangeText={setValue}
            autoFocus
            keyboardType={keyboardType ?? 'default'}
            autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
          />
          {value.length > 0 && (
            <Pressable onPress={() => setValue('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.slate[400]} />
            </Pressable>
          )}
        </View>

        <View style={fm.actions}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              fm.cancelBtn,
              { backgroundColor: isDark ? colors.dark.card : colors.slate[100] },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={[fm.cancelText, { color: isDark ? colors.slate[300] : colors.slate[600] }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => { if (value.trim()) onSubmit(value.trim()); }}
            disabled={!value.trim() || loading}
            style={({ pressed }) => [
              fm.submitBtn,
              { backgroundColor: !value.trim() ? colors.slate[300] : accent },
              pressed && { opacity: 0.85 },
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Text style={fm.submitText}>{buttonLabel}</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.white} />
              </>
            )}
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

const fm = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 22, paddingBottom: 42,
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15, shadowRadius: 24, elevation: 20,
    overflow: 'hidden',
  },
  accentLine: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[300],
    alignSelf: 'center', marginBottom: 20,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 22 },
  iconWrap: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  desc: { fontSize: 12 },
  closeBtn: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 14,
    marginBottom: 20,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, borderRadius: 16,
  },
  cancelText: { fontSize: 15, fontWeight: '700' },
  submitBtn: {
    flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 15, borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 4,
  },
  submitText: { fontSize: 15, fontWeight: '800', color: colors.white },
});

export default function FamilyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { token, user } = useAuth();
  const { showAlert } = useAlert();

  const [family, setFamily]             = useState<FamilyGroup | null>(null);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [checkingIn, setCheckingIn]     = useState(false);
  const [showCreate, setShowCreate]     = useState(false);
  const [showJoin, setShowJoin]         = useState(false);
  const [showInvite, setShowInvite]     = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [createdCode, setCreatedCode]     = useState('');
  const [codeCopied, setCodeCopied]       = useState(false);
  const [showMap, setShowMap]             = useState(false);

  const headerFade  = useRef(new Animated.Value(0)).current;
  const contentFade = useRef(new Animated.Value(0)).current;
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(headerFade,  { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(contentFade, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [headerFade, contentFade]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getFamily(token);
      setFamily(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!token || !family) return;
    pollRef.current = setInterval(() => {
      getFamily(token).then(setFamily).catch(() => {});
    }, 30000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, family?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  async function handleCheckIn(status: CheckInStatus) {
    if (!token || checkingIn) return;
    setCheckingIn(true);

    // Get current location
    let loc: { latitude: number; longitude: number } | undefined;
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      }
    } catch {}

    if (family && user) {
      setFamily({
        ...family,
        members: family.members.map(m =>
          m.id === user.id
            ? { ...m, checkInStatus: status, checkedInAt: new Date().toISOString(), latitude: loc?.latitude ?? m.latitude, longitude: loc?.longitude ?? m.longitude }
            : m,
        ),
      });
    }
    try {
      await familyCheckIn(status, token, loc);
      await load();
    } catch {
      showAlert({ type: 'error', title: 'Check-in failed', message: 'Please try again.' });
      await load();
    } finally {
      setCheckingIn(false);
    }
  }

  async function handleCreate(name: string) {
    if (!token || !name) return;
    setModalLoading(true);
    try {
      const created = await createFamily(name, token);
      setFamily(created);
      setShowCreate(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreatedCode(created.inviteCode);
      setCodeCopied(false);
      setShowCodeModal(true);
    } catch (e: any) {
      showAlert({ type: 'error', title: 'Error', message: e?.message ?? 'Could not create family group.' });
    } finally {
      setModalLoading(false);
    }
  }

  async function handleCopyCode(code: string) {
    await Clipboard.setStringAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2500);
  }

  async function handleShareAndClose() {
    if (!family) return;
    setShowCodeModal(false);
    try {
      await Share.share({
        message: `Join my family safety group "${family.name}" on FloodTrack!\n\nInvite code: ${family.inviteCode}`,
      });
    } catch {}
  }

  async function handleJoin(code: string) {
    if (!token || !code) return;
    setModalLoading(true);
    try {
      const joined = await joinFamily(code, token);
      setFamily(joined);
      setShowJoin(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert({ type: 'success', title: 'Joined!', message: `You joined "${joined.name}".` });
    } catch (e: any) {
      showAlert({ type: 'error', title: 'Invalid code', message: e?.message ?? 'Could not join with that code.' });
    } finally {
      setModalLoading(false);
    }
  }

  async function handleInvite(email: string) {
    if (!token || !email) return;
    setModalLoading(true);
    try {
      await inviteFamilyMember(email, token);
      setShowInvite(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert({ type: 'success', title: 'Invite sent', message: `Invitation sent to ${email}.` });
    } catch (e: any) {
      showAlert({ type: 'error', title: 'Error', message: e?.message ?? 'Could not send invite.' });
    } finally {
      setModalLoading(false);
    }
  }

  function handleRemoveMember(member: FamilyMember) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Remove member',
      `Remove ${member.firstName} ${member.lastName} from the family group?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              await removeFamilyMember(member.id, token);
              await load();
            } catch (e: any) {
              showAlert({ type: 'error', title: 'Error', message: e?.message ?? 'Could not remove member.' });
            }
          },
        },
      ],
    );
  }

  function handleLeave() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Leave family',
      'Are you sure you want to leave this family group?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              await leaveFamily(token);
              setFamily(null);
              showAlert({ type: 'success', title: 'Left family', message: 'You have left the family group.' });
            } catch (e: any) {
              showAlert({ type: 'error', title: 'Error', message: e?.message ?? 'Could not leave family.' });
            }
          },
        },
      ],
    );
  }

  async function handleShareCode() {
    if (!family) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: `Join my family safety group on FloodTrack! Use invite code: ${family.inviteCode}`,
      });
    } catch {}
  }

  const bg       = isDark ? colors.dark.bg : '#F4F6F9';
  const cardBg   = isDark ? colors.dark.card : colors.white;
  const textMain = isDark ? colors.white : colors.slate[900];
  const textSub  = isDark ? colors.slate[400] : colors.slate[500];
  const border   = isDark ? colors.dark.border : colors.slate[200];

  const myStatus   = family?.members.find(m => m.id === user?.id)?.checkInStatus ?? 'unknown';
  const isCreator  = family?.members.find(m => m.id === user?.id)?.isCreator ?? false;
  const helpCount  = family?.members.filter(m => m.checkInStatus === 'need_help').length ?? 0;

  return (
    <View style={[s.root, { backgroundColor: bg }]}>
      <Animated.View style={[
        s.header,
        { paddingTop: insets.top, opacity: headerFade },
      ]}>
        <LinearGradient
          colors={isDark ? ['#0D1117', '#111827'] : [colors.white, '#F0F4F8']}
          style={s.headerGradient}
        >
          <View style={s.headerRow}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                s.backBtn,
                { backgroundColor: isDark ? colors.dark.elevated : 'rgba(0,0,0,0.05)' },
                pressed && { opacity: 0.6 },
              ]}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={20} color={isDark ? colors.slate[300] : colors.slate[700]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[s.headerTitle, { color: textMain }]}>Family Safety</Text>
              <Text style={[s.headerSub, { color: textSub }]}>
                {family ? `${family.members.length} members` : 'Check-in & monitor'}
              </Text>
            </View>
            {helpCount > 0 && (
              <View style={s.urgentBadge}>
                <Ionicons name="alert-circle" size={14} color={colors.white} />
                <Text style={s.urgentBadgeText}>{helpCount}</Text>
              </View>
            )}
            <View style={[s.headerIconWrap, { backgroundColor: colors.brand[500] + '14' }]}>
              <Ionicons name="shield-checkmark" size={20} color={colors.brand[500]} />
            </View>
          </View>
        </LinearGradient>
      </Animated.View>

      {loading ? (
        <View style={s.centered}>
          <View style={[s.loadingWrap, { backgroundColor: cardBg }]}>
            <ActivityIndicator size="large" color={colors.brand[500]} />
            <Text style={[s.loadingText, { color: textSub }]}>Loading family...</Text>
          </View>
        </View>
      ) : !family ? (
        <Animated.View style={[s.centered, { opacity: contentFade }]}>
          <View style={[s.emptyCard, { backgroundColor: cardBg, borderColor: border }]}>
            <LinearGradient
              colors={isDark ? [colors.brand[900] + '40', 'transparent'] : [colors.brand[50], 'transparent']}
              style={s.emptyGlow}
            />
            <View style={[s.emptyIcon, { backgroundColor: colors.brand[500] + '10' }]}>
              <Ionicons name="people" size={48} color={colors.brand[500]} />
            </View>
            <Text style={[s.emptyTitle, { color: textMain }]}>Stay connected{'\n'}during emergencies</Text>
            <Text style={[s.emptySub, { color: textSub }]}>
              Create a family group so everyone can check in and see each other's safety status in real time.
            </Text>

            <View style={s.emptyActions}>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setShowCreate(true); }}
                style={({ pressed }) => [s.emptyPrimaryBtn, pressed && { opacity: 0.85 }]}
              >
                <LinearGradient
                  colors={[colors.brand[500], colors.brand[700]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={s.emptyPrimaryGrad}
                >
                  <Ionicons name="add-circle" size={20} color={colors.white} />
                  <Text style={s.emptyPrimaryText}>Create Family Group</Text>
                </LinearGradient>
              </Pressable>
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowJoin(true); }}
                style={({ pressed }) => [
                  s.emptySecondaryBtn,
                  { borderColor: isDark ? colors.dark.border : colors.slate[200] },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="enter-outline" size={18} color={colors.brand[500]} />
                <Text style={[s.emptySecondaryText, { color: colors.brand[500] }]}>Join with Invite Code</Text>
              </Pressable>
            </View>

            <View style={s.emptyFeatures}>
              {[
                { icon: 'shield-checkmark' as const, text: 'One-tap check-in' },
                { icon: 'people' as const, text: 'See family status' },
                { icon: 'notifications' as const, text: 'Instant alerts' },
              ].map(f => (
                <View key={f.text} style={s.emptyFeatureRow}>
                  <View style={[s.emptyFeatureDot, { backgroundColor: colors.brand[500] + '18' }]}>
                    <Ionicons name={f.icon} size={12} color={colors.brand[500]} />
                  </View>
                  <Text style={[s.emptyFeatureText, { color: textSub }]}>{f.text}</Text>
                </View>
              ))}
            </View>
          </View>
        </Animated.View>
      ) : (
        <Animated.View style={{ flex: 1, opacity: contentFade }}>
          <ScrollView
            contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand[500]} />}
          >
            {/* ── Hero banner ── */}
            <View style={[s.heroBanner, { overflow: 'hidden' }]}>
              <LinearGradient
                colors={isDark ? ['#1E3A5F', '#0F2942'] : ['#4A6CF7', '#7C3AED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.heroBannerGrad}
              >
                <View style={s.heroOrb1} />
                <View style={s.heroOrb2} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <View style={s.heroIconWrap}>
                    <Ionicons name="people" size={22} color={colors.white} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.heroFamilyName}>{family.name}</Text>
                    <Text style={s.heroFamilySub}>
                      {family.members.length} member{family.members.length !== 1 ? 's' : ''} in group
                    </Text>
                  </View>
                  {helpCount > 0 && (
                    <View style={s.heroAlertPill}>
                      <Ionicons name="alert-circle" size={13} color={colors.white} />
                      <Text style={s.heroAlertText}>{helpCount}</Text>
                    </View>
                  )}
                </View>
                <StatusSummaryBar members={family.members} isDark />
              </LinearGradient>
            </View>

            {/* ── Check-in ── */}
            <View style={[s.card, { backgroundColor: cardBg, borderColor: border }]}>
              <View style={s.cardHeader}>
                <View style={[s.cardIcon, { backgroundColor: colors.brand[500] + '14' }]}>
                  <Ionicons name="hand-left" size={16} color={colors.brand[500]} />
                </View>
                <Text style={[s.cardTitle, { color: textMain }]}>Your Status</Text>
                {checkingIn && <ActivityIndicator size="small" color={colors.brand[500]} />}
              </View>
              <View style={s.checkInRow}>
                <CheckInButton status="safe" isActive={myStatus === 'safe'} onPress={() => handleCheckIn('safe')} disabled={checkingIn} />
                <CheckInButton status="need_help" isActive={myStatus === 'need_help'} onPress={() => handleCheckIn('need_help')} disabled={checkingIn} />
              </View>
            </View>

            {/* ── Invite code card ── */}
            <View style={[s.card, { backgroundColor: cardBg, borderColor: border }]}>
              <View style={s.cardHeader}>
                <View style={[s.cardIcon, { backgroundColor: '#A855F7' + '14' }]}>
                  <Ionicons name="key" size={16} color="#A855F7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.cardTitle, { color: textMain }]}>Invite Code</Text>
                  <Text style={[s.cardSub, { color: textSub }]}>Tap to copy, hold to share</Text>
                </View>
              </View>
              <Pressable
                onPress={() => handleCopyCode(family.inviteCode)}
                onLongPress={handleShareCode}
                style={({ pressed }) => [
                  s.inviteCodeBox,
                  {
                    backgroundColor: isDark ? colors.dark.elevated : '#F5F3FF',
                    borderColor: codeCopied ? colors.severity.low + '50' : '#A855F7' + '25',
                  },
                  pressed && { transform: [{ scale: 0.98 }] },
                ]}
              >
                <Text style={[s.inviteCodeValue, { color: codeCopied ? colors.severity.low : (isDark ? colors.white : colors.slate[900]) }]}>
                  {family.inviteCode}
                </Text>
                <View style={[s.inviteCodeCopyPill, { backgroundColor: codeCopied ? colors.severity.low : '#A855F7' }]}>
                  <Ionicons name={codeCopied ? 'checkmark' : 'copy-outline'} size={14} color={colors.white} />
                  <Text style={s.inviteCodeCopyText}>{codeCopied ? 'Copied!' : 'Copy'}</Text>
                </View>
              </Pressable>
              <View style={s.inviteCodeActions}>
                <Pressable
                  onPress={handleShareCode}
                  style={({ pressed }) => [
                    s.inviteCodeShareBtn,
                    { backgroundColor: isDark ? colors.dark.elevated : colors.slate[50], borderColor: border },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name="share-social-outline" size={16} color={colors.brand[500]} />
                  <Text style={[s.inviteCodeShareText, { color: colors.brand[500] }]}>Share</Text>
                </Pressable>
                <Pressable
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowInvite(true); }}
                  style={({ pressed }) => [
                    s.inviteCodeShareBtn,
                    { backgroundColor: isDark ? colors.dark.elevated : colors.slate[50], borderColor: border },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name="person-add-outline" size={16} color={colors.brand[500]} />
                  <Text style={[s.inviteCodeShareText, { color: colors.brand[500] }]}>Invite by Email</Text>
                </Pressable>
              </View>
            </View>

            {/* ── View Map ── */}
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowMap(true); }}
              style={({ pressed }) => [
                s.mapBtn,
                { backgroundColor: cardBg, borderColor: border },
                pressed && { transform: [{ scale: 0.98 }] },
              ]}
            >
              <LinearGradient
                colors={isDark ? ['#1E3A5F', '#0F2942'] : ['#4A6CF7', '#6366F1']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.mapBtnIcon}
              >
                <Ionicons name="map" size={18} color={colors.white} />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={[s.mapBtnTitle, { color: textMain }]}>View Family Map</Text>
                <Text style={[s.mapBtnSub, { color: textSub }]}>See where everyone checked in</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.slate[400]} />
            </Pressable>

            {/* ── Members ── */}
            <View style={s.sectionHeader}>
              <Text style={[s.sectionLabel, { color: textSub }]}>MEMBERS</Text>
              <View style={[s.sectionCount, { backgroundColor: colors.brand[500] + '14' }]}>
                <Text style={[s.sectionCountText, { color: colors.brand[500] }]}>{family.members.length}</Text>
              </View>
            </View>

            {family.members.map((member, i) => (
              <MemberCard
                key={member.id}
                member={member}
                currentUserId={user?.id ?? ''}
                isGroupCreator={isCreator}
                onRemove={() => handleRemoveMember(member)}
                isDark={isDark}
                index={i}
              />
            ))}

            {/* ── Leave ── */}
            <Pressable
              style={({ pressed }) => [
                s.leaveBtn,
                {
                  backgroundColor: isDark ? colors.severity.critical + '0C' : colors.severity.critical + '08',
                  borderColor: isDark ? colors.severity.critical + '25' : colors.severity.critical + '18',
                },
                pressed && { opacity: 0.7 },
              ]}
              onPress={handleLeave}
            >
              <View style={[s.actionIcon, { backgroundColor: colors.severity.critical + '14' }]}>
                <Ionicons name="exit-outline" size={17} color={colors.severity.critical} />
              </View>
              <Text style={[s.leaveText, { color: colors.severity.critical }]}>Leave Family Group</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.severity.critical + '80'} />
            </Pressable>
          </ScrollView>
        </Animated.View>
      )}

      <FormModal
        visible={showCreate}
        title="Create Family Group"
        description="Name your household group"
        icon="people"
        placeholder="e.g. Dela Cruz Family"
        buttonLabel="Create"
        loading={modalLoading}
        onSubmit={handleCreate}
        onClose={() => setShowCreate(false)}
        isDark={isDark}
        accentColor={colors.brand[500]}
      />
      <FormModal
        visible={showJoin}
        title="Join Family Group"
        description="Enter the code shared by a family member"
        icon="enter-outline"
        placeholder="Invite code"
        buttonLabel="Join"
        loading={modalLoading}
        onSubmit={handleJoin}
        onClose={() => setShowJoin(false)}
        isDark={isDark}
        accentColor={colors.accent[500]}
      />
      <FormModal
        visible={showInvite}
        title="Invite Member"
        description="They'll receive an email to join your group"
        icon="person-add"
        placeholder="Email address"
        buttonLabel="Send"
        loading={modalLoading}
        onSubmit={handleInvite}
        onClose={() => setShowInvite(false)}
        isDark={isDark}
        keyboardType="email-address"
        accentColor={colors.brand[500]}
      />

      {/* ── Invite Code Success Modal ── */}
      <Modal transparent visible={showCodeModal} animationType="fade" onRequestClose={() => setShowCodeModal(false)}>
        <View style={ic.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowCodeModal(false)} />
          <View style={[ic.card, { backgroundColor: isDark ? colors.dark.elevated : colors.white }]}>
            {/* Success header */}
            <LinearGradient
              colors={isDark ? ['#4A6CF7', '#5B21B6'] : [colors.brand[500], '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={ic.header}
            >
              <View style={ic.checkCircle}>
                <Ionicons name="checkmark" size={32} color={colors.white} />
              </View>
              <Text style={ic.headerTitle}>Family Group Created!</Text>
              <Text style={ic.headerSub}>Share this code with your family members so they can join</Text>
            </LinearGradient>

            <View style={[ic.body, { backgroundColor: cardBg }]}>
              {/* Code box */}
              <Text style={[ic.label, { color: textSub }]}>INVITE CODE</Text>
              <Pressable
                onPress={() => handleCopyCode(createdCode)}
                style={({ pressed }) => [
                  ic.codeBox,
                  {
                    backgroundColor: isDark ? colors.dark.elevated : '#F0F4FF',
                    borderColor: codeCopied ? colors.severity.low : colors.brand[500] + '30',
                  },
                  pressed && { transform: [{ scale: 0.98 }] },
                ]}
              >
                <Text style={[ic.codeValue, { color: isDark ? colors.white : colors.slate[900] }]}>{createdCode}</Text>
                <View style={[ic.copyBtn, { backgroundColor: codeCopied ? colors.severity.low : colors.brand[500] }]}>
                  <Ionicons name={codeCopied ? 'checkmark' : 'copy-outline'} size={16} color={colors.white} />
                  <Text style={ic.copyText}>{codeCopied ? 'Copied!' : 'Copy'}</Text>
                </View>
              </Pressable>

              {/* Actions */}
              <View style={ic.actions}>
                <Pressable
                  onPress={handleShareAndClose}
                  style={({ pressed }) => [ic.shareBtn, pressed && { opacity: 0.85 }]}
                >
                  <LinearGradient
                    colors={[colors.brand[500], '#7C3AED']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={ic.shareBtnGrad}
                  >
                    <Ionicons name="share-social" size={18} color={colors.white} />
                    <Text style={ic.shareBtnText}>Share with Family</Text>
                  </LinearGradient>
                </Pressable>
                <Pressable
                  onPress={() => setShowCodeModal(false)}
                  style={({ pressed }) => [
                    ic.doneBtn,
                    { borderColor: isDark ? colors.dark.border : colors.slate[200] },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[ic.doneBtnText, { color: isDark ? colors.slate[300] : colors.slate[600] }]}>Done</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Family Map Modal ── */}
      <Modal visible={showMap} animationType="slide" onRequestClose={() => setShowMap(false)}>
        <View style={[mp.root, { backgroundColor: bg }]}>
          <View style={[mp.header, { paddingTop: insets.top, backgroundColor: cardBg, borderBottomColor: border }]}>
            <Pressable
              onPress={() => setShowMap(false)}
              style={({ pressed }) => [mp.closeBtn, { backgroundColor: isDark ? colors.dark.elevated : colors.slate[100] }, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={20} color={isDark ? colors.slate[300] : colors.slate[700]} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={[mp.headerTitle, { color: textMain }]}>Family Map</Text>
              <Text style={[mp.headerSub, { color: textSub }]}>
                {family?.members.filter(m => m.latitude && m.longitude).length ?? 0} of {family?.members.length ?? 0} locations shared
              </Text>
            </View>
            <View style={[mp.headerIcon, { backgroundColor: colors.brand[500] + '14' }]}>
              <Ionicons name="map" size={18} color={colors.brand[500]} />
            </View>
          </View>

          <View style={{ flex: 1 }}>
            {family && (() => {
              const membersWithLoc = family.members.filter(m => m.latitude != null && m.longitude != null);
              if (membersWithLoc.length === 0) {
                return (
                  <View style={mp.emptyWrap}>
                    <View style={[mp.emptyIcon, { backgroundColor: isDark ? colors.dark.elevated : colors.slate[100] }]}>
                      <Ionicons name="location-outline" size={40} color={colors.slate[400]} />
                    </View>
                    <Text style={[mp.emptyTitle, { color: textMain }]}>No locations yet</Text>
                    <Text style={[mp.emptySub, { color: textSub }]}>
                      Locations are shared when members check in. Ask your family to tap "I'm Safe" or "Need Help".
                    </Text>
                  </View>
                );
              }
              const avgLat = membersWithLoc.reduce((s, m) => s + m.latitude!, 0) / membersWithLoc.length;
              const avgLng = membersWithLoc.reduce((s, m) => s + m.longitude!, 0) / membersWithLoc.length;
              return (
                <MapView
                  provider={PROVIDER_GOOGLE}
                  style={StyleSheet.absoluteFillObject}
                  initialRegion={{
                    latitude: avgLat,
                    longitude: avgLng,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05,
                  }}
                  showsUserLocation
                  showsMyLocationButton
                >
                  {membersWithLoc.map(member => {
                    const cfg = STATUS_CONFIG[member.checkInStatus];
                    return (
                      <Marker
                        key={member.id}
                        coordinate={{ latitude: member.latitude!, longitude: member.longitude! }}
                        title={`${member.firstName} ${member.lastName}`}
                        description={`${cfg.label} - ${timeAgo(member.checkedInAt)}`}
                      >
                        <View style={mp.markerWrap}>
                          <View style={[mp.markerDot, { backgroundColor: cfg.color }]}>
                            <Text style={mp.markerInitials}>
                              {getInitials(member.firstName, member.lastName)}
                            </Text>
                          </View>
                          <View style={[mp.markerArrow, { borderTopColor: cfg.color }]} />
                        </View>
                      </Marker>
                    );
                  })}
                </MapView>
              );
            })()}
          </View>

          {/* Legend bar */}
          {family && family.members.filter(m => m.latitude != null).length > 0 && (
            <View style={[mp.legend, { backgroundColor: cardBg, borderTopColor: border, paddingBottom: insets.bottom + 12 }]}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={mp.legendScroll}>
                {family.members.filter(m => m.latitude != null && m.longitude != null).map(member => {
                  const cfg = STATUS_CONFIG[member.checkInStatus];
                  return (
                    <View key={member.id} style={[mp.legendItem, { backgroundColor: cfg.color + '10', borderColor: cfg.color + '25' }]}>
                      <View style={[mp.legendDot, { backgroundColor: cfg.color }]} />
                      <Text style={[mp.legendName, { color: isDark ? colors.white : colors.slate[900] }]}>
                        {member.firstName}
                      </Text>
                      <Text style={[mp.legendStatus, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const mp = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingBottom: 14, paddingTop: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  headerSub: { fontSize: 11, marginTop: 1 },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 12,
  },
  emptyIcon: {
    width: 80, height: 80, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  markerWrap: { alignItems: 'center' },
  markerDot: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: colors.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
  },
  markerInitials: { fontSize: 12, fontWeight: '900', color: colors.white },
  markerArrow: {
    width: 0, height: 0, marginTop: -2,
    borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
  },
  legend: {
    borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12,
  },
  legendScroll: { paddingHorizontal: 16, gap: 8 },
  legendItem: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendName: { fontSize: 13, fontWeight: '700' },
  legendStatus: { fontSize: 11, fontWeight: '600' },
});

const s = StyleSheet.create({
  root: { flex: 1 },

  header: { zIndex: 10 },
  headerGradient: {
    paddingHorizontal: 16, paddingBottom: 18, paddingTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 8,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  headerSub: { fontSize: 12, marginTop: 1 },
  urgentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.severity.critical,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
    shadowColor: colors.severity.critical,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
    overflow: 'visible',
  },
  urgentBadgeText: { fontSize: 13, fontWeight: '900', color: colors.white },
  headerIconWrap: {
    width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },

  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 20,
  },
  loadingWrap: {
    alignItems: 'center', gap: 14,
    paddingHorizontal: 40, paddingVertical: 32, borderRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  loadingText: { fontSize: 14, fontWeight: '600' },

  emptyCard: {
    borderRadius: 28, borderWidth: 1, padding: 28,
    alignItems: 'center', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 16, elevation: 3,
    width: '100%',
  },
  emptyGlow: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 160,
  },
  emptyIcon: {
    width: 96, height: 96, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  emptyTitle: { fontSize: 24, fontWeight: '900', textAlign: 'center', lineHeight: 30, letterSpacing: -0.5, marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 24 },
  emptyActions: { width: '100%', gap: 10, marginBottom: 24 },
  emptyPrimaryBtn: { borderRadius: 18, overflow: 'hidden' },
  emptyPrimaryGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 18,
    shadowColor: colors.brand[500], shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
  },
  emptyPrimaryText: { fontSize: 16, fontWeight: '800', color: colors.white },
  emptySecondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, borderRadius: 18, borderWidth: 1.5,
  },
  emptySecondaryText: { fontSize: 15, fontWeight: '700' },
  emptyFeatures: { gap: 10, width: '100%' },
  emptyFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emptyFeatureDot: {
    width: 30, height: 30, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyFeatureText: { fontSize: 13, fontWeight: '600' },

  scroll: { padding: 16, gap: 14, paddingTop: 16 },

  heroBanner: { borderRadius: 22, overflow: 'hidden' },
  heroBannerGrad: {
    padding: 20, gap: 14, position: 'relative',
  },
  heroOrb1: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)', top: -30, right: -20,
  },
  heroOrb2: {
    position: 'absolute', width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.06)', bottom: -20, left: 20,
  },
  heroIconWrap: {
    width: 48, height: 48, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  heroFamilyName: {
    fontSize: 20, fontWeight: '900', color: colors.white, letterSpacing: -0.3,
  },
  heroFamilySub: {
    fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2,
  },
  heroAlertPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.severity.critical,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
    overflow: 'visible',
  },
  heroAlertText: { fontSize: 13, fontWeight: '900', color: colors.white },

  card: {
    borderRadius: 22, borderWidth: 1, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16,
  },
  cardIcon: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, flex: 1 },
  cardSub: { fontSize: 11, marginTop: 1 },

  checkInRow: { flexDirection: 'row', gap: 12 },

  inviteCodeBox: {
    borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed',
    paddingVertical: 18, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 14, marginBottom: 12,
  },
  inviteCodeValue: {
    fontSize: 24, fontWeight: '900', letterSpacing: 5, flex: 1, textAlign: 'center',
  },
  inviteCodeCopyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
  },
  inviteCodeCopyText: { fontSize: 12, fontWeight: '700', color: colors.white },
  inviteCodeActions: { flexDirection: 'row', gap: 8 },
  inviteCodeShareBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11, borderRadius: 14, borderWidth: 1,
  },
  inviteCodeShareText: { fontSize: 13, fontWeight: '700' },

  mapBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: 22, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  mapBtnIcon: {
    width: 42, height: 42, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  mapBtnTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  mapBtnSub: { fontSize: 11, marginTop: 2 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 4, marginTop: 4,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase',
  },
  sectionCount: {
    minWidth: 22, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  sectionCountText: { fontSize: 11, fontWeight: '800' },

  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16,
    borderRadius: 18, borderWidth: 1, marginTop: 4,
  },
  leaveText: { flex: 1, fontSize: 14, fontWeight: '700' },

  actionIcon: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
});

const ic = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 24,
  },
  header: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 24,
    gap: 10,
  },
  checkCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    lineHeight: 18,
  },
  body: {
    padding: 22,
    paddingBottom: 28,
    gap: 16,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  codeBox: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 18,
    gap: 14,
    alignItems: 'center',
  },
  codeValue: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 6,
    textAlign: 'center',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  copyText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
  shareBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  shareBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  shareBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
  },
  doneBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
