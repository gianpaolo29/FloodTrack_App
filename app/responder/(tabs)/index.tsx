import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useETA } from '@/hooks/use-eta';
import { useProximityAlert } from '@/hooks/use-proximity';
import { useNetworkStatus } from '@/hooks/use-network-status';
import * as Location from 'expo-location';
import {
  getAssignedIncidents,
  getResponderStats,
  submitMemberStatus,
  getAppConfig,
  getWeatherWithFallback,
  getActiveHazards,
  updateProfile,
  getMyTeam,
  getTeamStats,
  getIncidentDetail,
  getUserNotifications,
  type WeatherData,
} from '@/services/api';
import {
  cacheIncidents,
  getCachedIncidents,
  queueStatusUpdate,
  getPendingCount,
} from '@/services/offline';
import { socketService } from '@/services/socket';
import type { Hazard, Incident, MemberStatus, ResponderStats, ResponderStatus, Team } from '@/types';

/* ─── constants ─── */
const H_PAD = 20;
const CARD_R = 18;

const STEPPER_STATUSES: ResponderStatus[] = ['pending', 'en_route', 'on_scene', 'resolved'];
const STEPPER_LABELS: Record<ResponderStatus, string> = {
  pending: 'Assigned',
  en_route: 'En route',
  on_scene: 'On scene',
  resolved: 'Resolved',
};

const SEV_COLORS: Record<string, string> = {
  low: colors.severity.low,
  moderate: colors.severity.moderate,
  high: colors.severity.high,
  critical: colors.severity.critical,
};

/* ─── helpers ─── */
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getWeatherIcon(desc: string): keyof typeof Ionicons.glyphMap {
  const d = desc.toLowerCase();
  if (d.includes('thunder') || d.includes('storm')) return 'thunderstorm';
  if (d.includes('rain') || d.includes('drizzle') || d.includes('shower')) return 'rainy';
  if (d.includes('snow') || d.includes('sleet')) return 'snow';
  if (d.includes('cloud') || d.includes('overcast')) return 'cloud';
  if (d.includes('clear') || d.includes('sunny')) return 'sunny';
  if (d.includes('fog') || d.includes('mist') || d.includes('haze')) return 'cloudy-night';
  return 'partly-sunny';
}

function getFloodRisk(rainH: number): { label: string; color: string } {
  if (rainH >= 7.5) return { label: 'Critical flood risk', color: colors.severity.critical };
  if (rainH >= 2.5) return { label: 'High flood risk', color: colors.severity.high };
  if (rainH >= 0.1) return { label: 'Moderate risk', color: colors.severity.moderate };
  return { label: 'Low risk', color: colors.severity.low };
}

function openDirections(lat: number, lng: number, name: string) {
  const label = encodeURIComponent(name);
  const url = Platform.select({
    ios: `maps:0,0?q=${label}@${lat},${lng}`,
    default: `geo:${lat},${lng}?q=${lat},${lng}(${label})`,
  })!;
  Linking.openURL(url).catch(() => {
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
  });
}

function callPhone(number: string) {
  Linking.openURL(`tel:${number}`);
}


/* ─── Status Stepper ─── */
function StatusStepper({
  current,
}: {
  current: ResponderStatus;
}) {
  const currentIdx = STEPPER_STATUSES.indexOf(current);

  return (
    <View style={$.stepperWrap}>
      {/* Circles + connecting lines row */}
      <View style={$.stepperDotsRow}>
        {STEPPER_STATUSES.map((status, idx) => {
          const done = idx <= currentIdx;
          const isActive = idx === currentIdx;
          const isLast = idx === STEPPER_STATUSES.length - 1;

          return (
            <View key={status} style={{ flexDirection: 'row', alignItems: 'center', flex: isLast ? 0 : 1 }}>
              {/* Circle */}
              <View
                style={[
                  $.stepperCircle,
                  done && !isActive && $.stepperCircleDone,
                  isActive && $.stepperCircleActive,
                ]}
              >
                {done && !isActive && (
                  <Ionicons name="checkmark" size={10} color="#fff" />
                )}
                {isActive && (
                  <View style={$.stepperInnerDot} />
                )}
              </View>
              {/* Line to next circle */}
              {!isLast && (
                <View
                  style={[
                    $.stepperLine,
                    idx < currentIdx && $.stepperLineDone,
                  ]}
                />
              )}
            </View>
          );
        })}
      </View>
      {/* Labels row */}
      <View style={$.stepperLabelsRow}>
        {STEPPER_STATUSES.map((status, idx) => {
          const isActive = idx === currentIdx;
          return (
            <Text
              key={status}
              style={[
                $.stepperLabel,
                isActive && { color: colors.brand[300], fontWeight: '700' },
              ]}
            >
              {STEPPER_LABELS[status]}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

/* ─── Risk Badge ─── */
function RiskBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[$.riskBadge, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <Ionicons name="bar-chart" size={11} color={color} />
      <Text style={[$.riskBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

/* ═══════════════════════════════════════════
   MAIN SCREEN
   ═══════════════════════════════════════════ */
export default function HomeTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { token, user, setHomeAddress, updateUser } = useAuth();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stats, setStats] = useState<ResponderStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [teamStats, setTeamStats] = useState<ResponderStats | null>(null);
  const [showHomeSetup, setShowHomeSetup] = useState(false);
  const [homeSetupLoading, setHomeSetupLoading] = useState(false);
  const [homeSetupDone, setHomeSetupDone] = useState(false);
  const [snackbar, setSnackbar] = useState<{ text: string; undoId?: string; undoStatus?: ResponderStatus } | null>(null);
  const [primaryContact, setPrimaryContact] = useState<string | null>(null);
  const isOnline = useNetworkStatus();
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);

  /* entrance animations */
  const fadeHeader = useRef(new Animated.Value(0)).current;
  const fadeCards  = useRef(new Animated.Value(0)).current;
  const fadeLower  = useRef(new Animated.Value(0)).current;
  const animated = useRef(false);

  useEffect(() => {
    if (loading || animated.current) return;
    animated.current = true;
    Animated.stagger(140, [
      Animated.timing(fadeHeader, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fadeCards,  { toValue: 1, duration: 480, easing: Easing.out(Easing.back(1.02)), useNativeDriver: true }),
      Animated.timing(fadeLower,  { toValue: 1, duration: 440, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [loading]);

  /* theme tokens — aligned with resident theme */
  const bg           = isDark ? colors.dark.bg       : '#F8FAFB';
  const cardBg       = isDark ? colors.dark.card     : colors.white;
  const cardBorder   = isDark ? colors.dark.border   : 'rgba(0,0,0,0.06)';
  const textPrimary  = isDark ? colors.dark.text     : colors.slate[900];
  const textSecondary = isDark ? colors.dark.subtext : colors.slate[500];
  const dividerColor = isDark ? colors.dark.border   : colors.slate[100];
  const elevatedBg   = isDark ? colors.dark.elevated : colors.slate[50];

  /* ── data loaders ── */
  const loadIncidents = useCallback(async (isRefresh = false) => {
    if (!token) return;
    try {
      if (!isRefresh) setLoading(true);
      const data = await getAssignedIncidents(token);
      console.log('[Home] loaded incidents:', data.length, data.map(d => ({ id: d.id, team: d.teamId, status: d.responderStatus })));
      setIncidents(data);
      cacheIncidents(data).catch(() => {});
    } catch {
      const cached = await getCachedIncidents();
      if (cached.length > 0) setIncidents(cached);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  const loadStats = useCallback(async () => {
    if (!token) return;
    try { setStats(await getResponderStats(token)); } catch {}
  }, [token]);

  const loadTeam = useCallback(async () => {
    if (!token) return;
    try {
      const t = await getMyTeam(token);
      setTeam(t);
      if (t) {
        const ts = await getTeamStats(token);
        if (ts) setTeamStats(ts);
      }
    } catch {}
  }, [token]);

  const loadWeather = useCallback(async () => {
    if (!token) return;
    try {
      let lat: number | null = null;
      let lon: number | null = null;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        let loc = await Location.getLastKnownPositionAsync();
        if (!loc) {
          try { loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); } catch {}
        }
        if (loc) { lat = loc.coords.latitude; lon = loc.coords.longitude; }
      }
      if (!lat || !lon) {
        const cfg = await getAppConfig(token);
        lat = cfg.defaultLatitude;
        lon = cfg.defaultLongitude;
      }
      const w = await getWeatherWithFallback(lat, lon, token);
      if (w) setWeather(w);
    } catch {}
  }, [token]);

  useEffect(() => {
    loadIncidents();
    loadStats();
    loadWeather();
    loadTeam();
  }, [loadIncidents, loadStats, loadWeather, loadTeam]);

  const loadUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const notifs = await getUserNotifications(token);
      setUnreadCount(notifs.filter(n => !n.read).length);
    } catch {}
  }, [token]);

  useEffect(() => {
    const onNew = () => { loadIncidents(true); loadUnreadCount(); };
    socketService.on('new-notification', onNew);
    socketService.on('new-assignment', onNew);
    return () => {
      socketService.off('new-notification', onNew);
      socketService.off('new-assignment', onNew);
    };
  }, [loadIncidents, loadUnreadCount]);

  useEffect(() => { loadUnreadCount(); }, [loadUnreadCount]);

  useEffect(() => {
    if (user && !user.homeAddress) setShowHomeSetup(true);
  }, []);

  // Pending sync count
  useEffect(() => {
    getPendingCount().then(setPendingSyncCount).catch(() => {});
    const iv = setInterval(() => {
      getPendingCount().then(setPendingSyncCount).catch(() => {});
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  async function handleHomeSetupUseLocation() {
    setHomeSetupLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setShowHomeSetup(false); return; }
      let pos = await Location.getLastKnownPositionAsync();
      if (!pos) {
        try { pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); } catch {}
      }
      if (!pos) { setShowHomeSetup(false); return; }
      const [geo] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const parts = [geo.street, geo.district, geo.city, geo.region]
        .filter(Boolean)
        .filter((v, i, a) => a.indexOf(v) === i);
      const address = parts.join(', ') || `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      await setHomeAddress(address);
      if (token) {
        const updated = await updateProfile({ home_address: address }, token).catch(() => null);
        if (updated) await updateUser({ ...updated, homeAddress: address });
      }
      setHomeSetupDone(true);
      setTimeout(() => { setShowHomeSetup(false); setHomeSetupDone(false); }, 1800);
    } catch {
      setShowHomeSetup(false);
    } finally {
      setHomeSetupLoading(false);
    }
  }

  const handleStatusUpdate = useCallback(async (incidentId: string, newStatus: ResponderStatus) => {
    if (!token) return;
    setUpdatingStatus(incidentId);
    const prevIncidents = [...incidents];
    try {
      if (!isOnline) {
        await queueStatusUpdate({ incidentId, status: newStatus });
      } else {
        await submitMemberStatus({ incidentId, status: newStatus }, token);
      }
      setIncidents(prev =>
        prev.map(i => {
          if (i.id !== incidentId) return i;
          const myEntry: MemberStatus = {
            userId: user?.id ?? '',
            userName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
            avatarUrl: user?.avatarUrl,
            status: newStatus,
            updatedAt: 'Just now',
          };
          const existing = i.memberStatuses ?? [];
          const idx = existing.findIndex(ms => ms.userId === (user?.id ?? ''));
          const updated = idx >= 0
            ? existing.map((ms, j) => (j === idx ? myEntry : ms))
            : [...existing, myEntry];
          return { ...i, responderStatus: newStatus, memberStatuses: updated };
        }),
      );
      const label = STEPPER_LABELS[newStatus];
      setSnackbar({ text: `${label} · Dispatch notified` });
      setTimeout(() => setSnackbar(null), 4000);
      // Delay refresh so server has time to process
      setTimeout(() => loadIncidents(true), 2000);

      // Navigate to map when starting en route
      if (newStatus === 'en_route') {
        const inc = incidents.find(i => i.id === incidentId);
        if (inc) {
          router.push({
            pathname: '/responder/(tabs)/map',
            params: {
              destLat: String(inc.latitude),
              destLng: String(inc.longitude),
              destTitle: inc.title,
              incidentId: inc.id,
            },
          } as never);
        }
      }
    } catch (err) {
      console.error('[StatusUpdate] Failed:', err);
      setSnackbar({ text: 'Failed to update status. Try again.' });
      setTimeout(() => setSnackbar(null), 4000);
      setIncidents(prevIncidents);
    }
    finally { setUpdatingStatus(null); }
  }, [token, user, isOnline, incidents]);

  /* ── derived — filter to user's team assignments ── */
  const teamIncidents = user?.isLeader
    ? incidents
    : incidents.filter(i =>
        // Show if incident belongs to user's team
        (user?.teamId && i.teamId === user.teamId) ||
        // Show if user appears in memberStatuses
        (i.memberStatuses ?? []).some(m => m.userId === user?.id) ||
        // Show if incident has no team (directly assigned)
        !i.teamId,
      );

  const active = teamIncidents.filter(i => i.responderStatus !== 'resolved');
  const pendingCount = teamIncidents.filter(i => i.responderStatus === 'pending').length;
  const enRouteCount = teamIncidents.filter(i => i.responderStatus === 'en_route').length;
  const onSceneCount = teamIncidents.filter(i => i.responderStatus === 'on_scene').length;
  const resolvedCount = teamIncidents.filter(i => i.responderStatus === 'resolved').length;

  const PRIORITY_STATUSES = ['on_scene', 'en_route', 'pending'] as ResponderStatus[];
  const primaryAssignment: Incident | null = (() => {
    if (user?.isLeader) {
      return PRIORITY_STATUSES.flatMap(s => active.filter(i => i.responderStatus === s)).find(Boolean) ?? null;
    }
    const mine = PRIORITY_STATUSES
      .flatMap(s =>
        active.filter(
          i => i.responderStatus === s && (i.memberStatuses ?? []).some(m => m.userId === user?.id),
        ),
      )
      .find(Boolean);
    return mine ?? PRIORITY_STATUSES.flatMap(s => active.filter(i => i.responderStatus === s)).find(Boolean) ?? null;
  })();

  // Load contact number for the primary assignment
  useEffect(() => {
    if (!primaryAssignment || !token) { setPrimaryContact(null); return; }
    let cancelled = false;
    getIncidentDetail(primaryAssignment.id, token)
      .then(d => { if (!cancelled) setPrimaryContact(d.contactNumber || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [primaryAssignment?.id, token]);

  // ETA
  const { eta, distanceKm } = useETA(
    primaryAssignment?.latitude ?? 0,
    primaryAssignment?.longitude ?? 0,
    !!primaryAssignment && primaryAssignment.responderStatus !== 'resolved',
  );

  // Proximity alerts
  useProximityAlert(
    active,
    useCallback(
      (incident: Incident) => { handleStatusUpdate(incident.id, 'on_scene'); },
      [handleStatusUpdate],
    ),
  );

  // Next status action
  const nextAction: { status: ResponderStatus; label: string; icon: keyof typeof Ionicons.glyphMap; color: string } | null =
    primaryAssignment
      ? primaryAssignment.responderStatus === 'pending'
        ? { status: 'en_route', label: "Start — I'm en route", icon: 'navigate', color: colors.brand[500] }
        : primaryAssignment.responderStatus === 'en_route'
          ? { status: 'on_scene', label: 'Arrived — mark on scene', icon: 'location', color: '#10B981' }
          : primaryAssignment.responderStatus === 'on_scene'
            ? { status: 'resolved', label: 'Mark resolved', icon: 'shield-checkmark', color: '#10B981' }
            : null
      : null;

  const isUpdatingPrimary = updatingStatus === primaryAssignment?.id;
  const sevColor = primaryAssignment ? (SEV_COLORS[primaryAssignment.severity] ?? colors.severity.moderate) : '';

  const risk = weather ? getFloodRisk(weather.current.rainH) : null;

  const perfData = teamStats ?? stats;

  const slideUp = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
  });

  /* ── Loading ── */
  if (loading) {
    return (
      <View style={[$.root, { backgroundColor: bg }]}>
        <View style={$.loadWrap}>
          <ActivityIndicator size="large" color={colors.brand[500]} />
          <Text style={[$.loadText, { color: textSecondary }]}>Loading dashboard…</Text>
        </View>
      </View>
    );
  }

  /* ═══ RENDER ═══ */
  return (
    <View style={[$.root, { backgroundColor: bg }]}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadIncidents(true); loadStats(); loadTeam(); }}
              tintColor={colors.brand[500]}
              colors={[colors.brand[500]]}
            />
          }
          showsVerticalScrollIndicator={false}
        >

          {/* ═══ HEADER ═══ */}
          <Animated.View style={slideUp(fadeHeader)}>
            <LinearGradient
              colors={isDark ? [colors.dark.bg, colors.dark.surface, colors.dark.bg] : ['#F8FAFB', '#F0F3F6', '#F8FAFB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[$.header, { paddingTop: insets.top + 10 }]}
            >
              <View style={$.headerRow}>
                {/* Avatar */}
                <Pressable
                  onPress={() => router.push('/responder/(tabs)/profile' as never)}
                  style={({ pressed }) => [$.avatarCircle, pressed && { opacity: 0.8 }]}
                >
                  {user?.avatarUrl ? (
                    <Image source={{ uri: user.avatarUrl }} style={$.avatarImg} />
                  ) : (
                    <LinearGradient colors={[colors.brand[500], colors.brand[700]]} style={$.avatarImg}>
                      <Text style={$.avatarText}>
                        {user ? `${user.firstName[0]}${user.lastName[0]}` : 'R'}
                      </Text>
                    </LinearGradient>
                  )}
                </Pressable>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[$.greetSub, !isDark && { color: colors.slate[500] }]}>{getGreeting()}</Text>
                  <Text style={[$.greetName, !isDark && { color: colors.slate[900] }]}>{user?.firstName ?? 'Responder'}</Text>
                  <View style={$.dutyRow}>
                    <View style={$.dutyDot} />
                    <Text style={[$.dutyText, !isDark && { color: colors.slate[500] }]}>
                      On duty{team ? ` · ${team.name}` : ''} · until 6 PM
                    </Text>
                  </View>
                </View>

                {/* Bell */}
                <Pressable
                  onPress={() => router.push('/responder/(tabs)/alerts' as never)}
                  style={({ pressed }) => [
                    $.bellBtn,
                    !isDark && { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.slate[200] },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name="notifications" size={20} color={isDark ? '#fff' : colors.slate[700]} />
                  {unreadCount > 0 && (
                    <View style={$.bellBadge}>
                      <Text style={$.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            </LinearGradient>
          </Animated.View>

          {/* ═══ OFFLINE BANNER ═══ */}
          {!isOnline && (
            <View style={[$.offlineBanner, { marginHorizontal: H_PAD }]}>
              <Ionicons name="cloud-offline" size={16} color="#F59E0B" />
              <Text style={$.offlineText}>
                You're offline{pendingSyncCount > 0 ? ` · ${pendingSyncCount} update${pendingSyncCount > 1 ? 's' : ''} pending sync` : ''}
              </Text>
              {pendingSyncCount > 0 && (
                <View style={$.syncingPill}>
                  <Text style={$.syncingText}>Syncing…</Text>
                </View>
              )}
            </View>
          )}

          {/* ═══ ACTIVE ASSIGNMENT ═══ */}
          <Animated.View style={[{ paddingHorizontal: H_PAD, marginTop: 8 }, slideUp(fadeCards)]}>
            {primaryAssignment ? (
              <View
                style={[
                  $.card,
                  { backgroundColor: cardBg, borderColor: cardBorder },
                ]}
              >
                {/* Card header — tappable to view detail */}
                <Pressable
                  onPress={() => router.push(`/responder/incident/${primaryAssignment.id}` as never)}
                  style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                >
                  <View style={$.assignHeader}>
                    <Text style={$.assignLabel}>ACTIVE ASSIGNMENT</Text>
                    <Text style={[$.assignRef, { color: textSecondary }]}>#{primaryAssignment.reference}</Text>
                  </View>

                {/* Severity + meta */}
                <View style={$.assignMetaRow}>
                  <View style={[$.sevBadge, { backgroundColor: sevColor + '22' }]}>
                    <Ionicons name="bar-chart" size={10} color={sevColor} />
                    <Text style={[$.sevBadgeText, { color: sevColor }]}>
                      {primaryAssignment.severity.charAt(0).toUpperCase() + primaryAssignment.severity.slice(1)}
                    </Text>
                  </View>
                  <Text style={[$.assignMetaText, { color: textSecondary }]}>
                    Reported {primaryAssignment.reportedAt}
                    {primaryAssignment.nearbyCount > 0 ? ` · ${primaryAssignment.nearbyCount} reports` : ''}
                  </Text>
                </View>

                {/* Title */}
                <Text style={[$.assignTitle, { color: textPrimary }]} numberOfLines={2}>
                  {primaryAssignment.title}
                </Text>

                {/* Location */}
                <View style={$.assignLocRow}>
                  <Ionicons name="location" size={14} color={textSecondary} />
                  <Text style={[$.assignLocText, { color: textSecondary }]} numberOfLines={1}>
                    {primaryAssignment.address}
                  </Text>
                </View>
                </Pressable>

                {/* ETA + distance */}
                {(eta || distanceKm !== null) && (
                  <View style={$.etaRow}>
                    <Ionicons name="navigate" size={13} color={textSecondary} />
                    <Text style={[$.etaText, { color: textSecondary }]}>
                      {distanceKm !== null ? `${distanceKm} km` : ''}
                      {distanceKm !== null && eta ? ' · ' : ''}
                      {eta ?? ''}
                    </Text>
                  </View>
                )}

                {/* Status stepper */}
                <StatusStepper current={primaryAssignment.responderStatus} />

                {/* Action buttons: Start/Arrived + Call reporter side by side */}
                <View style={$.actionRow}>
                  {nextAction && (
                    <Pressable
                      onPress={() => !isUpdatingPrimary && handleStatusUpdate(primaryAssignment.id, nextAction.status)}
                      disabled={isUpdatingPrimary}
                      style={({ pressed }) => [
                        $.actionBtn,
                        { backgroundColor: nextAction.color, flex: 1 },
                        pressed && { opacity: 0.88 },
                        isUpdatingPrimary && { opacity: 0.6 },
                      ]}
                    >
                      {isUpdatingPrimary ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name={nextAction.icon} size={14} color="#fff" />
                          <Text style={$.actionBtnText}>{nextAction.label}</Text>
                        </>
                      )}
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => {
                      if (primaryContact) callPhone(primaryContact);
                    }}
                    style={({ pressed }) => [
                      $.callBtn,
                      { borderColor: cardBorder },
                      pressed && { opacity: 0.7 },
                      !primaryContact && { opacity: 0.4 },
                    ]}
                    disabled={!primaryContact}
                  >
                    <Ionicons name="call" size={16} color={textPrimary} />
                  </Pressable>
                </View>

                {/* Footer */}
                <View style={$.assignFooter}>
                  <Ionicons name="radio" size={12} color={textSecondary} />
                  <Text style={[$.assignFooterText, { color: textSecondary }]}>
                    {STEPPER_LABELS[primaryAssignment.responderStatus]} since {primaryAssignment.reportedAt} · Dispatch notified
                  </Text>
                </View>
              </View>
            ) : (
              /* ── Standing by ── */
              <View style={[$.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                {/* Horizontal layout: icon left, text right */}
                <View style={$.standbyRow}>
                  <View style={$.standbyIcon}>
                    <Ionicons name="shield-outline" size={28} color={colors.brand[500]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={$.assignLabel}>ACTIVE ASSIGNMENT</Text>
                    <Text style={[$.standbyTitle, { color: textPrimary }]}>Standing by</Text>
                    <Text style={[$.standbyText, { color: textSecondary }]}>
                      No incident assigned. Your phone will ring loudly when Dispatch assigns you.
                    </Text>
                  </View>
                </View>
                <View style={[$.standbyDivider, { backgroundColor: dividerColor }]} />
                <View style={$.standbyFooter}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={$.dutyDot} />
                    <Text style={[$.standbyFooterText, { color: textPrimary, fontWeight: '700' }]}>Available to Dispatch</Text>
                  </View>
                  <Text style={[$.standbyFooterText, { color: textSecondary }]}>
                    Last resolved {teamIncidents.find(i => i.responderStatus === 'resolved')?.reportedAt ?? ''}
                  </Text>
                </View>
              </View>
            )}
          </Animated.View>

          {/* ═══ CONDITIONS ═══ */}
          {weather && (
            <Animated.View style={[{ paddingHorizontal: H_PAD, marginTop: 14 }, slideUp(fadeCards)]}>
              <View style={[$.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                {/* Header */}
                <View style={$.condHeader}>
                  <Text style={$.condLabel}>CONDITIONS</Text>
                  {risk && <RiskBadge label={risk.label} color={risk.color} />}
                </View>

                {/* Location + time */}
                <View style={$.condLocRow}>
                  <Ionicons name="location" size={12} color={textSecondary} />
                  <Text style={[$.condLocText, { color: textSecondary }]}>
                    {weather.current.city || 'Local'} · {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </Text>
                </View>

                {/* Main weather */}
                <View style={$.wxMain}>
                  <View style={$.wxIconWrap}>
                    <Ionicons name={getWeatherIcon(weather.current.description)} size={28} color={textSecondary} />
                  </View>
                  <Text style={[$.wxTemp, { color: textPrimary }]}>
                    {Math.round(weather.current.temperature)}<Text style={$.wxDeg}>°</Text>
                  </Text>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[$.wxDesc, { color: textPrimary }]}>{weather.current.description}</Text>
                    <Text style={[$.wxFeels, { color: textSecondary }]}>
                      Feels like {Math.round(weather.current.temperature + (weather.current.humidity > 70 ? 2 : 0))}°
                    </Text>
                  </View>
                </View>

                {/* 3 stats */}
                <View style={[$.wxStatsRow, { borderTopColor: dividerColor }]}>
                  <View style={$.wxStatItem}>
                    <Ionicons name="rainy" size={14} color={textSecondary} />
                    <Text style={$.wxStatLabel}>Rain</Text>
                    <Text style={[$.wxStatVal, { color: textPrimary }]}>
                      {weather.current.rainH.toFixed(0)} mm/h
                    </Text>
                  </View>
                  <View style={[$.wxStatDivider, { backgroundColor: dividerColor }]} />
                  <View style={$.wxStatItem}>
                    <Ionicons name="water" size={14} color={textSecondary} />
                    <Text style={$.wxStatLabel}>Humidity</Text>
                    <Text style={[$.wxStatVal, { color: textPrimary }]}>{weather.current.humidity}%</Text>
                  </View>
                  <View style={[$.wxStatDivider, { backgroundColor: dividerColor }]} />
                  <View style={$.wxStatItem}>
                    <Ionicons name="speedometer" size={14} color={textSecondary} />
                    <Text style={$.wxStatLabel}>Wind</Text>
                    <Text style={[$.wxStatVal, { color: textPrimary }]}>
                      {Math.round(weather.current.windSpeed)} km/h
                    </Text>
                  </View>
                </View>

                {/* Rain forecast bars — based on current rain rate */}
                <View style={$.forecastSection}>
                  <View style={$.forecastHeader}>
                    <Text style={[$.forecastTitle, { color: textSecondary }]}>Rain, next 6 hours</Text>
                    <Text style={[$.forecastScale, { color: textSecondary }]}>mm/h · scale 0–20</Text>
                  </View>
                  <View style={$.forecastBars}>
                    {[...Array(6)].map((_, i) => {
                      // Estimate: rain tapers or holds based on current rate
                      const rainVal = Math.max(0, weather.current.rainH * (1 - i * 0.1));
                      const barH = Math.max(4, Math.min(50, (rainVal / 20) * 50));
                      const hour = new Date();
                      hour.setHours(hour.getHours() + i);
                      const label = hour.toLocaleTimeString('en-US', { hour: 'numeric' }).replace(' ', '');
                      return (
                        <View key={i} style={$.forecastBarCol}>
                          {rainVal > 3 && (
                            <Text style={[$.forecastBarValue, { color: textPrimary }]}>{Math.round(rainVal)}</Text>
                          )}
                          <View
                            style={[
                              $.forecastBar,
                              {
                                height: barH,
                                backgroundColor: rainVal >= 7.5 ? colors.severity.high : colors.brand[500],
                              },
                            ]}
                          />
                          <Text style={[$.forecastBarLabel, { color: textSecondary }]}>{label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>

                {/* Weather alerts */}
                {weather.alerts.length > 0 && (
                  <View style={[$.wxAlertRow, { backgroundColor: elevatedBg }]}>
                    <Ionicons name="warning" size={14} color="#F59E0B" />
                    <Text style={[$.wxAlertText, { color: textSecondary }]} numberOfLines={2}>
                      {weather.alerts[0].message}
                    </Text>
                  </View>
                )}
                {weather.alerts.length === 0 && risk && risk.color === colors.severity.low && (
                  <View style={[$.wxAlertRow, { backgroundColor: elevatedBg }]}>
                    <Ionicons name="checkmark-circle" size={14} color={colors.severity.low} />
                    <Text style={[$.wxAlertText, { color: textSecondary }]}>
                      No flood watch for {weather.current.city || 'your area'}. Rivers within normal level.
                    </Text>
                  </View>
                )}
              </View>
            </Animated.View>
          )}

          {/* ═══ TODAY ═══ */}
          <Animated.View style={[{ paddingHorizontal: H_PAD, marginTop: 20 }, slideUp(fadeLower)]}>
            <Text style={[$.sectionTitleStandalone, { color: textPrimary }]}>Today</Text>
            <View style={[$.todayStrip, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              {[
                { count: pendingCount, label: 'Pending', dotColor: '#F59E0B' },
                { count: enRouteCount, label: 'En route', dotColor: colors.brand[500] },
                { count: onSceneCount, label: 'On scene', dotColor: '#10B981' },
                { count: resolvedCount, label: 'Resolved', dotColor: textSecondary },
              ].map((item, idx) => (
                <View key={item.label} style={[$.todayItem, idx < 3 && { borderRightWidth: 1, borderRightColor: dividerColor }]}>
                  <Text style={[$.todayCount, { color: textPrimary }]}>{item.count}</Text>
                  <View style={$.todayLabelRow}>
                    <View style={[$.todayDot, { backgroundColor: item.dotColor }]} />
                    <Text style={[$.todayLabel, { color: textSecondary }]}>{item.label}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* ═══ QUICK ACTIONS ═══ */}
          <Animated.View style={[{ paddingHorizontal: H_PAD, marginTop: 18 }, slideUp(fadeLower)]}>
            <Text style={[$.sectionTitleStandalone, { color: textPrimary }]}>Quick actions</Text>
            <View style={$.quickActionsRow}>
              {[
                { label: 'Open map', icon: 'map' as keyof typeof Ionicons.glyphMap, onPress: () => router.push('/responder/(tabs)/map' as never) },
                { label: 'Protocols', icon: 'document-text' as keyof typeof Ionicons.glyphMap, onPress: () => router.push('/responder/protocols' as never) },
                { label: 'Call dispatch', icon: 'radio' as keyof typeof Ionicons.glyphMap, onPress: () => {} },
              ].map((action) => (
                <Pressable
                  key={action.label}
                  onPress={action.onPress}
                  style={({ pressed }) => [
                    $.quickActionCard,
                    { backgroundColor: cardBg, borderColor: cardBorder },
                    pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                  ]}
                >
                  <View style={$.quickActionIconWrap}>
                    <Ionicons name={action.icon} size={22} color={colors.brand[500]} />
                  </View>
                  <Text style={[$.quickActionLabel, { color: textSecondary }]}>{action.label}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>

          {/* ═══ MY TEAM ═══ */}
          {team && (
            <Animated.View style={[{ paddingHorizontal: H_PAD, marginTop: 18 }, slideUp(fadeLower)]}>
              <View style={$.sectionHeaderRow}>
                <Text style={[$.sectionTitle, { color: textSecondary }]}>
                  My team <Text style={{ color: textPrimary, fontWeight: '700' }}>{team.name}</Text>
                  <Text style={{ color: textSecondary }}> {'·'} {team.members.length}</Text>
                </Text>
                <Pressable onPress={() => {}}>
                  <Text style={$.sectionLink}>View all &gt;</Text>
                </Pressable>
              </View>
              <View style={[$.card, { backgroundColor: cardBg, borderColor: cardBorder, padding: 0 }]}>
                {team.members.map((member, idx) => {
                  const initials = `${member.firstName[0] ?? ''}${member.lastName[0] ?? ''}`.toUpperCase();
                  const isMe = member.id === user?.id;
                  const isLast = idx === team.members.length - 1;
                  const memberStatus = incidents
                    .flatMap(i => i.memberStatuses ?? [])
                    .find(ms => ms.userId === member.id);
                  const statusLabel = memberStatus
                    ? STEPPER_LABELS[memberStatus.status]
                    : 'Available';
                  const statusColor = memberStatus?.status === 'en_route'
                    ? colors.brand[300]
                    : memberStatus?.status === 'on_scene'
                      ? '#10B981'
                      : textSecondary;
                  const dotColor = memberStatus?.status === 'en_route'
                    ? colors.brand[500]
                    : memberStatus?.status === 'on_scene'
                      ? '#10B981'
                      : '#22C55E';

                  return (
                    <View key={member.id}>
                      <View style={$.teamRow}>
                        {/* Avatar with status dot */}
                        <View>
                          {member.avatarUrl ? (
                            <Image source={{ uri: member.avatarUrl }} style={$.teamAvatar} />
                          ) : (
                            <LinearGradient
                              colors={isMe ? [colors.brand[300], colors.brand[600]] : ['#4B5563', '#374151']}
                              style={$.teamAvatar}
                            >
                              <Text style={$.teamAvatarText}>{initials}</Text>
                            </LinearGradient>
                          )}
                          <View style={[$.teamStatusDot, { backgroundColor: dotColor, borderColor: cardBg }]} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[$.teamName, { color: textPrimary }]}>
                              {member.firstName} {member.lastName}
                            </Text>
                            {member.isLeader && (
                              <View style={$.leaderTag}>
                                <Text style={$.leaderTagText}>LEADER</Text>
                              </View>
                            )}
                          </View>
                          <Text style={{ fontSize: 12, color: textSecondary, marginTop: 2 }}>
                            {member.isLeader ? 'Boat operator' : 'Member'} {'·'} <Text style={{ fontWeight: '600', color: statusColor }}>{statusLabel}</Text>
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => {}}
                          style={({ pressed }) => [{ opacity: pressed ? 0.5 : 0.6 }]}
                        >
                          <Ionicons name="call" size={18} color={textSecondary} />
                        </Pressable>
                      </View>
                      {!isLast && <View style={[$.divider, { backgroundColor: dividerColor }]} />}
                    </View>
                  );
                })}
              </View>
            </Animated.View>
          )}

          {/* ═══ RECENT INCIDENTS ═══ */}
          <Animated.View style={[{ paddingHorizontal: H_PAD, marginTop: 18 }, slideUp(fadeLower)]}>
            <View style={$.sectionHeaderRow}>
              <Text style={[$.sectionTitle, { color: textSecondary }]}>Recent incidents</Text>
              {teamIncidents.length > 0 && (
                <Pressable onPress={() => router.push('/responder/(tabs)/assignments' as never)}>
                  <Text style={$.sectionLink}>All &gt;</Text>
                </Pressable>
              )}
            </View>
            <View style={[$.card, { backgroundColor: cardBg, borderColor: cardBorder, padding: 0 }]}>
              {teamIncidents.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Ionicons name="checkmark-circle-outline" size={28} color={colors.severity.low} />
                  <Text style={[$.standbyText, { color: textSecondary, marginTop: 8 }]}>
                    No incidents assigned yet
                  </Text>
                </View>
              ) : (
                teamIncidents.slice(0, 3).map((inc, idx) => {
                  const sc = SEV_COLORS[inc.severity] ?? colors.severity.moderate;
                  const isLast = idx === Math.min(teamIncidents.length, 3) - 1;
                  return (
                    <View key={inc.id}>
                      <Pressable
                        onPress={() => router.push(`/responder/incident/${inc.id}` as never)}
                        style={({ pressed }) => [$.recentRow, pressed && { backgroundColor: isDark ? colors.dark.elevated : colors.slate[50] }]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[$.recentTitle, { color: textPrimary }]} numberOfLines={1}>
                            {inc.title}
                          </Text>
                          <View style={$.recentMeta}>
                            <Text style={[$.recentMetaText, { color: textSecondary }]}>
                              {inc.address.split(',')[0]} · {inc.reportedAt}
                            </Text>
                          </View>
                          <View style={$.recentBadges}>
                            <View style={[$.sevBadge, { backgroundColor: sc + '22' }]}>
                              <Ionicons name="bar-chart" size={9} color={sc} />
                              <Text style={[$.sevBadgeText, { color: sc, fontSize: 10 }]}>
                                {inc.severity.charAt(0).toUpperCase() + inc.severity.slice(1)}
                              </Text>
                            </View>
                            <View style={[$.statusMini, { backgroundColor: dividerColor }]}>
                              {inc.responderStatus === 'resolved' && <Ionicons name="checkmark" size={10} color={textSecondary} />}
                              {inc.responderStatus === 'pending' && <Ionicons name="time" size={10} color="#F59E0B" />}
                              <Text style={[$.statusMiniText, { color: textSecondary }]}>
                                {STEPPER_LABELS[inc.responderStatus]}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={textSecondary} />
                      </Pressable>
                      {!isLast && <View style={[$.divider, { backgroundColor: dividerColor }]} />}
                    </View>
                  );
                })
              )}
            </View>
          </Animated.View>

          {/* ═══ PERFORMANCE ═══ */}
          {perfData && (
            <Animated.View style={[{ paddingHorizontal: H_PAD, marginTop: 18 }, slideUp(fadeLower)]}>
              <Text style={[$.sectionTitleStandalone, { color: textPrimary }]}>Performance</Text>
              <View style={[$.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                {/* 3 stats row */}
                <View style={$.perfRow}>
                  <View style={$.perfItem}>
                    <Text style={[$.perfVal, { color: textPrimary }]}>{perfData.resolvedThisWeek}</Text>
                    <Text style={[$.perfLabel, { color: textSecondary }]}>This week</Text>
                  </View>
                  <View style={$.perfItem}>
                    <Text style={[$.perfVal, { color: colors.brand[300] }]}>{perfData.resolvedThisMonth}</Text>
                    <Text style={[$.perfLabel, { color: textSecondary }]}>This month</Text>
                  </View>
                  <View style={$.perfItem}>
                    <Text style={[$.perfVal, { color: '#10B981' }]}>
                      {(perfData.avgResponseMinutes ?? 0) > 0
                        ? (perfData.avgResponseMinutes as number) < 60
                          ? `${Math.round(perfData.avgResponseMinutes as number)}m`
                          : `${((perfData.avgResponseMinutes as number) / 60).toFixed(1)}h`
                        : 'N/A'}
                    </Text>
                    <Text style={[$.perfLabel, { color: textSecondary }]}>Avg response</Text>
                  </View>
                </View>

                {/* Mini chart */}
                <View style={[$.perfChartSection, { borderTopColor: dividerColor }]}>
                  <View style={$.perfChartHeader}>
                    <Text style={[$.perfChartLabel, { color: textSecondary }]}>Resolved, last 7 days</Text>
                    <Text style={[$.perfChartTotal, { color: textSecondary }]}>{perfData.resolvedTotal} all-time</Text>
                  </View>
                  <View style={$.perfChartBars}>
                    {['F', 'S', 'S', 'M', 'T', 'W', 'Th'].map((day, i) => {
                      const val = i === 3 ? 2 : i === 2 ? 1 : 0;
                      return (
                        <View key={i} style={$.perfChartCol}>
                          {val > 0 && (
                            <Text style={[$.perfChartBarVal, { color: textPrimary }]}>{val}</Text>
                          )}
                          <View
                            style={[
                              $.perfChartBar,
                              {
                                height: Math.max(4, val * 16),
                                backgroundColor: val > 0 ? colors.brand[500] : dividerColor,
                              },
                            ]}
                          />
                          <Text style={[$.perfChartDay, { color: textSecondary }]}>{day}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </View>
            </Animated.View>
          )}

        </ScrollView>

      {/* ═══ SNACKBAR ═══ */}
      {snackbar && (
        <View style={[$.snackbar, { bottom: insets.bottom + 16 }]}>
          <Ionicons name="checkmark-circle" size={16} color="#10B981" />
          <Text style={$.snackbarText}>{snackbar.text}</Text>
        </View>
      )}

      {/* ═══ HOME SETUP MODAL ═══ */}
      <Modal
        visible={showHomeSetup}
        transparent
        animationType="fade"
        onRequestClose={() => !homeSetupLoading && setShowHomeSetup(false)}
      >
        <View style={hs.overlay}>
          <View style={[hs.sheet, isDark && { backgroundColor: '#1A1D27' }]}>
            {homeSetupDone ? (
              <LinearGradient
                colors={['#22c55e', '#16a34a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={hs.successWrap}
              >
                <Ionicons name="checkmark-circle" size={56} color="#fff" />
                <Text style={hs.successTitle}>Home location saved!</Text>
                <Text style={hs.successSub}>
                  You'll now get faster weather and incident data for your area.
                </Text>
              </LinearGradient>
            ) : (
              <>
                <LinearGradient
                  colors={['#00D2FF', '#4A6CF7', '#7C3AED']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={hs.header}
                >
                  <View style={hs.iconWrap}>
                    <Ionicons name="home" size={28} color="#fff" />
                  </View>
                  <Text style={hs.headerTitle}>Set Home Location</Text>
                  <Text style={hs.headerSub}>
                    Your home location helps us show accurate local weather and nearby incidents.
                  </Text>
                </LinearGradient>
                <View style={hs.body}>
                  <Pressable
                    style={({ pressed }) => [hs.primaryBtn, pressed && { opacity: 0.85 }, homeSetupLoading && { opacity: 0.7 }]}
                    onPress={handleHomeSetupUseLocation}
                    disabled={homeSetupLoading}
                  >
                    <LinearGradient
                      colors={[colors.brand[500], colors.brand[700]]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={hs.primaryBtnGrad}
                    >
                      {homeSetupLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="locate" size={18} color="#fff" />
                          <Text style={hs.primaryBtnText}>Use My Current Location</Text>
                        </>
                      )}
                    </LinearGradient>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [hs.skipBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => setShowHomeSetup(false)}
                    disabled={homeSetupLoading}
                  >
                    <Text style={[hs.skipText, isDark && { color: '#8B8FA3' }]}>Skip for now</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}


/* ─── Styles ─── */
const $ = StyleSheet.create({
  root: { flex: 1 },

  /* loading */
  loadWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadText: { fontSize: 13, fontWeight: '600', marginTop: 12 },

  /* header */
  header: { paddingHorizontal: H_PAD, paddingBottom: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: { width: 44, height: 44, borderRadius: 14, overflow: 'hidden' },
  avatarImg: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800', color: '#fff' },
  greetSub: { fontSize: 12, color: '#8B8FA3', fontWeight: '500' },
  greetName: { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  dutyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  dutyDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#22C55E', marginRight: 6 },
  dutyText: { fontSize: 12, color: '#8B8FA3', fontWeight: '500' },
  bellBtn: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: colors.dark.elevated,
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: 4, right: 4,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },

  /* offline banner */
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F59E0B18', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 8,
  },
  offlineText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#F59E0B' },
  syncingPill: {
    backgroundColor: '#F59E0B22', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  syncingText: { fontSize: 10, fontWeight: '700', color: '#F59E0B' },

  /* card base */
  card: {
    borderRadius: CARD_R, borderWidth: 1, padding: 18, overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },

  /* assignment card */
  assignHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  assignLabel: { fontSize: 11, fontWeight: '800', color: '#8B8FA3', letterSpacing: 1 },
  assignRef: { fontSize: 12, fontWeight: '600' },
  assignMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  assignMetaText: { fontSize: 12, fontWeight: '500' },
  assignTitle: { fontSize: 18, fontWeight: '800', lineHeight: 24, marginBottom: 6, letterSpacing: -0.3 },
  assignLocRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
  assignLocText: { fontSize: 13, fontWeight: '500', flex: 1 },

  /* ETA row */
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 14 },
  etaText: { fontSize: 13, fontWeight: '600' },

  /* severity badge */
  sevBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  sevBadgeText: { fontSize: 11, fontWeight: '700' },

  /* stepper */
  stepperWrap: { marginBottom: 16, marginTop: 4 },
  stepperDotsRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  stepperCircle: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#4B5563',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  stepperCircleDone: { borderColor: '#10B981', backgroundColor: '#10B981' },
  stepperCircleActive: { borderColor: colors.brand[300], backgroundColor: 'transparent', borderWidth: 2.5 },
  stepperInnerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand[300] },
  stepperLine: { flex: 1, height: 2, backgroundColor: '#4B5563', marginHorizontal: -1 },
  stepperLineDone: { backgroundColor: '#10B981' },
  stepperLabelsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 0 },
  stepperLabel: { fontSize: 10, fontWeight: '500', color: '#8B8FA3', textAlign: 'center', width: 60 },

  /* action row: start + call side by side */
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12,
  },
  actionBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  callBtn: {
    width: 48, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, borderWidth: 1,
  },

  /* assignment footer */
  assignFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  assignFooterText: { fontSize: 12, fontWeight: '500' },

  /* standing by */
  standbyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  standbyIcon: {
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: colors.brand[500] + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  standbyTitle: { fontSize: 20, fontWeight: '800', marginBottom: 4 },
  standbyText: { fontSize: 13, fontWeight: '500', lineHeight: 19 },
  standbyDivider: { height: StyleSheet.hairlineWidth, marginTop: 16, marginBottom: 12 },
  standbyFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  standbyFooterText: { fontSize: 12, fontWeight: '600' },

  /* conditions */
  condHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  condLabel: { fontSize: 11, fontWeight: '800', color: '#8B8FA3', letterSpacing: 1 },
  condLocRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  condLocText: { fontSize: 12, fontWeight: '500' },
  riskBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1,
  },
  riskBadgeText: { fontSize: 11, fontWeight: '700' },
  wxMain: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  wxIconWrap: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: colors.brand[500] + '12',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10,
  },
  wxTemp: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  wxDeg: { fontSize: 20, fontWeight: '400' },
  wxDesc: { fontSize: 14, fontWeight: '600' },
  wxFeels: { fontSize: 12, fontWeight: '500', marginTop: 1 },

  /* weather stats */
  wxStatsRow: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 12, marginBottom: 12 },
  wxStatItem: { flex: 1, alignItems: 'center', gap: 3 },
  wxStatLabel: { fontSize: 10, fontWeight: '500', color: '#8B8FA3' },
  wxStatVal: { fontSize: 13, fontWeight: '700' },
  wxStatDivider: { width: 1, alignSelf: 'stretch' },

  /* forecast bars */
  forecastSection: { marginBottom: 6 },
  forecastHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  forecastTitle: { fontSize: 11, fontWeight: '600' },
  forecastScale: { fontSize: 10, fontWeight: '500' },
  forecastBars: { flexDirection: 'row', alignItems: 'flex-end', height: 60, gap: 6 },
  forecastBarCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  forecastBar: { width: '80%', borderRadius: 4, minHeight: 4 },
  forecastBarLabel: { fontSize: 10, fontWeight: '500', marginTop: 4 },
  forecastBarValue: { fontSize: 10, fontWeight: '700', marginBottom: 2 },

  /* weather alert */
  wxAlertRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    borderRadius: 10,
    padding: 12, marginTop: 8,
  },
  wxAlertText: { fontSize: 12, fontWeight: '500', flex: 1, lineHeight: 17 },

  /* today strip */
  todayStrip: { flexDirection: 'row', borderRadius: CARD_R, borderWidth: 1, overflow: 'hidden' },
  todayItem: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  todayCount: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  todayLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  todayDot: { width: 6, height: 6, borderRadius: 3 },
  todayLabel: { fontSize: 10, fontWeight: '600' },

  /* section headers */
  sectionTitleStandalone: { fontSize: 17, fontWeight: '800', marginBottom: 12, letterSpacing: -0.3 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '600' },
  sectionLink: { fontSize: 13, fontWeight: '600', color: colors.brand[300] },

  /* quick actions */
  quickActionsRow: { flexDirection: 'row', gap: 10 },
  quickActionCard: {
    flex: 1, alignItems: 'center', paddingVertical: 18,
    borderRadius: CARD_R, borderWidth: 1,
  },
  quickActionIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: colors.brand[500] + '12',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  quickActionLabel: { fontSize: 12, fontWeight: '600' },

  /* recent incidents */
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  recentTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  recentMeta: { marginBottom: 6 },
  recentMetaText: { fontSize: 12, fontWeight: '500' },
  recentBadges: { flexDirection: 'row', gap: 6 },
  statusMini: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  statusMiniText: { fontSize: 10, fontWeight: '600' },

  /* divider */
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  /* team */
  teamRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  teamAvatar: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  teamAvatarText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  teamStatusDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2,
  },
  teamName: { fontSize: 14, fontWeight: '700' },
  leaderTag: { backgroundColor: '#F59E0B22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  leaderTagText: { fontSize: 9, fontWeight: '800', color: '#F59E0B', letterSpacing: 0.5 },

  /* performance */
  perfRow: { flexDirection: 'row', marginBottom: 4 },
  perfItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  perfVal: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  perfLabel: { fontSize: 11, fontWeight: '500', marginTop: 2 },
  perfChartSection: { borderTopWidth: 1, paddingTop: 12, marginTop: 6 },
  perfChartHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  perfChartLabel: { fontSize: 11, fontWeight: '500' },
  perfChartTotal: { fontSize: 11, fontWeight: '500' },
  perfChartBars: { flexDirection: 'row', alignItems: 'flex-end', height: 44, gap: 4 },
  perfChartCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  perfChartBar: { width: '70%', borderRadius: 3, minHeight: 4 },
  perfChartBarVal: { fontSize: 10, fontWeight: '700', marginBottom: 2 },
  perfChartDay: { fontSize: 10, fontWeight: '500', marginTop: 4 },

  /* snackbar */
  snackbar: {
    position: 'absolute', left: H_PAD, right: H_PAD,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.dark.card, borderRadius: 14, borderWidth: 1, borderColor: colors.dark.border,
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  snackbarText: { fontSize: 13, fontWeight: '600', color: colors.dark.text, flex: 1 },
});

const hs = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  sheet: {
    width: '100%', backgroundColor: '#fff', borderRadius: 28, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 20,
  },
  header: { alignItems: 'center', paddingTop: 32, paddingBottom: 28, paddingHorizontal: 24, gap: 10 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3, textAlign: 'center' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 18 },
  body: { padding: 20, gap: 10 },
  primaryBtn: { borderRadius: 16, overflow: 'hidden' },
  primaryBtnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  skipBtn: { alignItems: 'center', paddingVertical: 12 },
  skipText: { fontSize: 14, fontWeight: '600', color: colors.slate[500] },
  successWrap: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 12 },
  successTitle: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.3, textAlign: 'center' },
  successSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 18 },
});
