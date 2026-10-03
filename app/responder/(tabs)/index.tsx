import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
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

import { useNetworkStatus } from '@/hooks/use-network-status';
import * as Location from 'expo-location';
import {
  getAssignedIncidents,
  getResponderStats,
  getAppConfig,
  getWeatherWithFallback,
  getActiveHazards,
  updateProfile,
  getMyTeam,
  getTeamStats,
  getUserNotifications,
  getSchedule,
  type WeatherData,
  type ScheduleInfo,
} from '@/services/api';
import {
  cacheIncidents,
  getCachedIncidents,
  getPendingCount,
} from '@/services/offline';
import { socketService } from '@/services/socket';
import { onNotificationReceived } from '@/services/notifications';
import type { Hazard, Incident, ResponderStats, ResponderStatus, Team } from '@/types';

/* ─── constants ─── */
const H_PAD = 20;

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

function getFloodRisk(rainH: number): { label: string; color: string; icon: keyof typeof Ionicons.glyphMap } {
  if (rainH >= 7.5) return { label: 'Critical', color: colors.severity.critical, icon: 'alert-circle' };
  if (rainH >= 2.5) return { label: 'High', color: colors.severity.high, icon: 'warning' };
  if (rainH >= 0.1) return { label: 'Moderate', color: colors.severity.moderate, icon: 'information-circle' };
  return { label: 'Low', color: colors.severity.low, icon: 'shield-checkmark' };
}


/* ─── Compact Status Tracker ─── */
function StatusTracker({ current }: { current: ResponderStatus }) {
  const currentIdx = STEPPER_STATUSES.indexOf(current);

  return (
    <View style={$.trackerWrap}>
      {STEPPER_STATUSES.map((status, idx) => {
        const done = idx <= currentIdx;
        const isActive = idx === currentIdx;
        const isLast = idx === STEPPER_STATUSES.length - 1;

        return (
          <View key={status} style={{ flexDirection: 'row', alignItems: 'center', flex: isLast ? 0 : 1 }}>
            <View style={{ alignItems: 'center' }}>
              <View
                style={[
                  $.trackerDot,
                  done && !isActive && $.trackerDotDone,
                  isActive && $.trackerDotActive,
                ]}
              >
                {done && !isActive && (
                  <Ionicons name="checkmark" size={9} color="#fff" />
                )}
                {isActive && (
                  <View style={$.trackerInnerDot} />
                )}
              </View>
              <Text
                style={[
                  $.trackerLabel,
                  isActive && { color: colors.brand[500], fontWeight: '700' },
                ]}
                numberOfLines={1}
              >
                {STEPPER_LABELS[status]}
              </Text>
            </View>
            {!isLast && (
              <View
                style={[
                  $.trackerLine,
                  idx < currentIdx && $.trackerLineDone,
                ]}
              />
            )}
          </View>
        );
      })}
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
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [teamStats, setTeamStats] = useState<ResponderStats | null>(null);
  const [schedule, setSchedule] = useState<ScheduleInfo | null>(null);
  const [showHomeSetup, setShowHomeSetup] = useState(false);
  const [homeSetupLoading, setHomeSetupLoading] = useState(false);
  const [homeSetupDone, setHomeSetupDone] = useState(false);
  const [snackbar, setSnackbar] = useState<{ text: string } | null>(null);
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

  /* theme tokens */
  const bg           = isDark ? colors.dark.bg       : '#F0F4F8';
  const cardBg       = isDark ? colors.dark.card     : colors.white;
  const cardBorder   = isDark ? colors.dark.border   : 'rgba(0,0,0,0.04)';
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
    try { setSchedule(await getSchedule(token)); } catch {}
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

  // Weather only on mount (expensive)
  useEffect(() => {
    loadWeather();
  }, [loadWeather]);

  const loadUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const notifs = await getUserNotifications(token);
      setUnreadCount(notifs.filter(n => !n.read && n.kind !== 'new_message').length);
    } catch {}
  }, [token]);

  useEffect(() => {
    const onNew = () => { loadIncidents(true); loadUnreadCount(); loadTeam(); };
    const onSchedule = () => { loadTeam(); };
    // Socket listeners
    const lid1 = socketService.on('new-notification', onNew);
    const lid2 = socketService.on('new-assignment', onNew);
    const lid3 = socketService.on('report-status', onNew);
    const lid4 = socketService.on('new-alert', onNew);
    const lid5 = socketService.on('schedule-updated', onSchedule);
    const lid6 = socketService.on('member-status-updated', onNew);
    // Push notification listener — most reliable real-time signal
    const pushSub = onNotificationReceived(() => onNew());
    return () => {
      socketService.off(lid1);
      socketService.off(lid2);
      socketService.off(lid3);
      socketService.off(lid4);
      socketService.off(lid5);
      socketService.off(lid6);
      pushSub?.remove();
    };
  }, [loadIncidents, loadUnreadCount, loadTeam]);

  useEffect(() => { loadUnreadCount(); }, [loadUnreadCount]);

  // Refresh all data every time the tab is focused + reconnect socket
  useFocusEffect(
    useCallback(() => {
      loadIncidents(true);
      loadStats();
      loadTeam();
      loadUnreadCount();
      socketService.reconnect();
    }, [loadIncidents, loadStats, loadTeam, loadUnreadCount]),
  );

  // Poll schedule every 30s so duty status stays current
  useEffect(() => {
    if (!token) return;
    const iv = setInterval(() => {
      getSchedule(token).then(setSchedule).catch(() => {});
    }, 30_000);
    return () => clearInterval(iv);
  }, [token]);

  useEffect(() => {
    if (user && !user.homeAddress) setShowHomeSetup(true);
  }, [user]);

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

  /* ── derived — filter to user's team assignments ── */
  const teamIncidents = user?.isLeader
    ? incidents
    : incidents.filter(i =>
        (user?.teamId && i.teamId === user.teamId) ||
        (i.memberStatuses ?? []).some(m => m.userId === user?.id) ||
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

  const sevColor = primaryAssignment ? (SEV_COLORS[primaryAssignment.severity] ?? colors.severity.moderate) : '';

  const risk = weather ? getFloodRisk(weather.current.rainH) : null;

  const slideUp = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
  });

  /* ── Skeleton shimmer ── */
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!loading) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [loading]);

  const skeletonOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.5] });
  const skeletonBg = isDark ? colors.dark.elevated : '#DDE3EA';

  const SkeletonBox = ({ width, height, style }: { width: number | string; height: number; style?: any }) => (
    <Animated.View style={[{ width: width as any, height, borderRadius: 8, backgroundColor: skeletonBg, opacity: skeletonOpacity }, style]} />
  );

  /* ── Loading ── */
  if (loading) {
    return (
      <View style={[$.root, { backgroundColor: bg }]}>
        {/* Skeleton header */}
        <LinearGradient
          colors={isDark ? ['#0D1B2A', '#122640', '#0D3B66'] as const : ['#0F4C8A', '#1A65B0', '#1F7FBF'] as const}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[$.header, { paddingTop: insets.top + 16, paddingBottom: 28 }]}
        >
          <View style={$.headerTopRow}>
            <View>
              <Animated.View style={{ width: 100, height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.15)', opacity: skeletonOpacity, marginBottom: 8 }} />
              <Animated.View style={{ width: 160, height: 26, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', opacity: skeletonOpacity }} />
            </View>
            <Animated.View style={{ width: 80, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.12)', opacity: skeletonOpacity }} />
          </View>
          <Animated.View style={{ width: 180, height: 26, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', opacity: skeletonOpacity, marginTop: 10 }} />
        </LinearGradient>
        <View style={[$.curveWrap, { backgroundColor: bg }]}>
          <LinearGradient colors={isDark ? ['#0D3B66', '#0D1B2A'] as const : ['#1F7FBF', '#0F4C8A'] as const} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
          <View style={[$.curveShape, { backgroundColor: bg }]} />
        </View>

        <View style={{ paddingHorizontal: H_PAD }}>
          {/* Skeleton flood risk bar */}
          <SkeletonBox width="100%" height={52} style={{ borderRadius: 14, marginBottom: 16 }} />

          {/* Skeleton mission card */}
          <View style={[$.missionCard, { backgroundColor: cardBg, borderColor: cardBorder, padding: 20 }]}>
            <SkeletonBox width={120} height={10} style={{ marginBottom: 14 }} />
            <SkeletonBox width="85%" height={20} style={{ marginBottom: 10 }} />
            <SkeletonBox width="60%" height={16} style={{ marginBottom: 10 }} />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              <SkeletonBox width={70} height={24} style={{ borderRadius: 10 }} />
              <SkeletonBox width={50} height={24} style={{ borderRadius: 10 }} />
            </View>
            <SkeletonBox width="70%" height={12} style={{ marginBottom: 20 }} />
            <View style={[{ height: 1, backgroundColor: isDark ? colors.dark.border : colors.slate[100], marginBottom: 16 }]} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
              {[1,2,3,4].map(k => <SkeletonBox key={k} width={22} height={22} style={{ borderRadius: 11 }} />)}
            </View>
            <SkeletonBox width="100%" height={48} style={{ borderRadius: 14 }} />
          </View>

          {/* Skeleton status grid */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            {[1,2].map(k => (
              <View key={k} style={[$.statusItem, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <SkeletonBox width={28} height={28} style={{ borderRadius: 9, marginBottom: 6 }} />
                <SkeletonBox width={24} height={20} style={{ marginBottom: 4 }} />
                <SkeletonBox width={36} height={9} />
              </View>
            ))}
          </View>

          {/* Skeleton quick actions */}
          <SkeletonBox width={100} height={15} style={{ marginTop: 18, marginBottom: 10 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[1,2,3,4].map(k => (
              <View key={k} style={[$.actionCard, { backgroundColor: cardBg, borderColor: cardBorder, width: '47%' as any }]}>
                <SkeletonBox width={36} height={36} style={{ borderRadius: 11 }} />
                <SkeletonBox width={50} height={13} />
              </View>
            ))}
          </View>

          {/* Skeleton team */}
          <SkeletonBox width={120} height={15} style={{ marginTop: 22, marginBottom: 10 }} />
          <View style={[$.card, { backgroundColor: cardBg, borderColor: cardBorder, padding: 0 }]}>
            {[1,2,3].map(k => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 }}>
                <SkeletonBox width={38} height={38} style={{ borderRadius: 12 }} />
                <View style={{ flex: 1, gap: 6 }}>
                  <SkeletonBox width={100} height={13} />
                  <SkeletonBox width={140} height={11} />
                </View>
                <SkeletonBox width={32} height={32} style={{ borderRadius: 10 }} />
              </View>
            ))}
          </View>
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
              colors={isDark ? ['#0D1B2A', '#122640', '#0D3B66'] as const : ['#0F4C8A', '#1A65B0', '#1F7FBF'] as const}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[$.header, { paddingTop: insets.top + 16, paddingBottom: 28 }]}
            >
              {/* Subtle decorative elements */}
              <View style={[$.headerOrb, { width: 220, height: 220, top: -90, right: -70 }]} />
              <View style={[$.headerOrb, { width: 160, height: 160, bottom: -40, left: -50, opacity: 0.4 }]} />

              {/* Greeting + Weather row */}
              <View style={$.headerTopRow}>
                <View>
                  <Text style={$.greetLabel}>{getGreeting()}</Text>
                  <Text style={$.greetName}>{user?.firstName ?? 'Responder'}</Text>
                </View>
                {weather && (
                  <View style={$.headerWeather}>
                    <Ionicons name={getWeatherIcon(weather.current.description)} size={32} color="rgba(255,255,255,0.9)" />
                    <Text style={$.headerWeatherText}>{Math.round(weather.current.temperature)}°C</Text>
                  </View>
                )}
              </View>

              {/* Duty status */}
              <View style={$.dutyPill}>
                <View style={[
                  $.dutyDot,
                  schedule?.level === 'red'
                    ? { backgroundColor: '#EF4444' }
                    : schedule?.on_duty
                      ? { backgroundColor: '#34D399' }
                      : { backgroundColor: '#6B7280' },
                ]} />
                <Text style={$.dutyText} numberOfLines={1}>
                  {schedule?.level === 'red'
                    ? `RED ALERT${team ? ` · ${team.name}` : ''}`
                    : schedule?.on_duty
                    ? `On duty${schedule.team_shift ? ` · Shift ${schedule.team_shift}` : ''}${team ? ` · ${team.name}` : ''}`
                    : `Off duty${schedule?.team_shift ? ` · Shift ${schedule.team_shift}` : ''}${team ? ` · ${team.name}` : ''}`}
                </Text>
              </View>
            </LinearGradient>

            {/* Smooth curved transition */}
            <View style={[$.curveWrap, { backgroundColor: bg }]}>
              <LinearGradient
                colors={isDark ? ['#0D3B66', '#0D1B2A'] as const : ['#1F7FBF', '#0F4C8A'] as const}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFillObject}
              />
              <View style={[$.curveShape, { backgroundColor: bg }]} />
            </View>
          </Animated.View>

          {/* ═══ FLOOD RISK BANNER ═══ */}
          {weather && risk && (
            <Animated.View style={[{ paddingHorizontal: H_PAD, marginTop: -6 }, slideUp(fadeHeader)]}>
              <View style={[$.riskBar, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <View style={[$.riskIconWrap, { backgroundColor: risk.color + '12' }]}>
                  <Ionicons name={risk.icon} size={16} color={risk.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[$.riskTitle, { color: textPrimary }]}>Flood Risk</Text>
                  <Text style={[$.riskDesc, { color: textSecondary }]} numberOfLines={1}>
                    {weather.current.description} · {weather.current.rainH.toFixed(1)}mm/h
                  </Text>
                </View>
                <View style={[$.riskBadge, { backgroundColor: risk.color + '14' }]}>
                  <Text style={[$.riskBadgeText, { color: risk.color }]}>{risk.label}</Text>
                </View>
              </View>
            </Animated.View>
          )}

          {/* ═══ OFFLINE BANNER ═══ */}
          {!isOnline && (
            <View style={[$.offlineBanner, { marginHorizontal: H_PAD, marginTop: 10 }]}>
              <Ionicons name="cloud-offline" size={16} color="#F59E0B" />
              <Text style={$.offlineText}>
                You're offline{pendingSyncCount > 0 ? ` · ${pendingSyncCount} update${pendingSyncCount > 1 ? 's' : ''} pending sync` : ''}
              </Text>
              {pendingSyncCount > 0 && (
                <View style={$.syncingPill}>
                  <Text style={$.syncingText}>Syncing</Text>
                </View>
              )}
            </View>
          )}

          {/* ═══ ACTIVE ASSIGNMENT ═══ */}
          <Animated.View style={[{ paddingHorizontal: H_PAD, marginTop: 16 }, slideUp(fadeCards)]}>
            {primaryAssignment ? (
              <View style={[$.missionCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                {/* Top accent bar */}
                <LinearGradient
                  colors={[sevColor, sevColor + 'AA'] as const}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={$.missionAccent}
                />

                {/* Header row */}
                <Pressable
                  onPress={() => router.push(`/responder/incident/${primaryAssignment.id}` as never)}
                  style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                >
                  <View style={$.missionHeaderRow}>
                    <View style={$.missionLabelRow}>
                      <View style={[$.missionPulse, { backgroundColor: sevColor }]} />
                      <Text style={[$.missionLabel, { color: sevColor }]}>ACTIVE MISSION</Text>
                    </View>
                    <Text style={[$.missionRef, { color: textSecondary }]}>#{primaryAssignment.reference}</Text>
                  </View>

                  {/* Title */}
                  <Text style={[$.missionTitle, { color: textPrimary }]} numberOfLines={2}>
                    {primaryAssignment.title}
                  </Text>

                  {/* Severity chip */}
                  <View style={$.missionChipsRow}>
                    <View style={[$.missionChip, { backgroundColor: sevColor + '10', borderColor: sevColor + '20' }]}>
                      <View style={[$.missionChipDot, { backgroundColor: sevColor }]} />
                      <Text style={[$.missionChipText, { color: sevColor }]}>
                        {primaryAssignment.severity.charAt(0).toUpperCase() + primaryAssignment.severity.slice(1)}
                      </Text>
                    </View>
                    {primaryAssignment.nearbyCount > 0 && (
                      <View style={[$.missionChip, { backgroundColor: elevatedBg, borderColor: cardBorder }]}>
                        <Ionicons name="people" size={11} color={textSecondary} />
                        <Text style={[$.missionChipText, { color: textSecondary }]}>
                          {primaryAssignment.nearbyCount}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Location */}
                  <View style={$.missionLocRow}>
                    <Ionicons name="location-sharp" size={13} color={textSecondary} style={{ opacity: 0.6 }} />
                    <Text style={[$.missionLocText, { color: textSecondary }]} numberOfLines={1}>
                      {primaryAssignment.address}
                    </Text>
                  </View>
                </Pressable>

                {/* Divider */}
                <View style={[$.missionDivider, { backgroundColor: dividerColor }]} />

                {/* Status tracker */}
                <StatusTracker current={primaryAssignment.responderStatus} />

                {/* Navigate — only for non-resolved */}
                <Pressable
                  onPress={() => router.push({
                    pathname: '/responder/(tabs)/map',
                    params: {
                      destLat: String(primaryAssignment.latitude),
                      destLng: String(primaryAssignment.longitude),
                      destTitle: primaryAssignment.title,
                      incidentId: primaryAssignment.id,
                      sessionLocked: '1',
                      reportedAt: primaryAssignment.reportedAt,
                      severity: primaryAssignment.severity,
                      incidentType: primaryAssignment.type || 'Flood',
                      address: primaryAssignment.address,
                    },
                  } as never)}
                  style={({ pressed }) => [
                    $.navBtnWrap,
                    pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <LinearGradient
                    colors={[colors.brand[500], colors.brand[700]] as const}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={$.navBtnGrad}
                  >
                    <Ionicons name="navigate" size={17} color="#fff" />
                    <Text style={$.navBtnText}>Navigate to Incident</Text>
                  </LinearGradient>
                </Pressable>

                {/* Footer timestamp */}
                <View style={$.missionFooter}>
                  <Ionicons name="time-outline" size={11} color={textSecondary} style={{ opacity: 0.5 }} />
                  <Text style={[$.missionFooterText, { color: textSecondary }]}>
                    {STEPPER_LABELS[primaryAssignment.responderStatus]} · {primaryAssignment.reportedAt}
                  </Text>
                </View>
              </View>
            ) : (
              /* ── Standing by ── */
              <View style={[$.missionCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <LinearGradient
                  colors={
                    schedule?.level === 'red'
                      ? [colors.severity.critical, colors.severity.critical + 'AA'] as const
                      : [colors.severity.low, colors.severity.low + 'AA'] as const
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={$.missionAccent}
                />
                <View style={$.standbyContent}>
                  <View style={[
                    $.standbyIconWrap,
                    schedule?.level === 'red' && { backgroundColor: colors.severity.critical + '0A' },
                  ]}>
                    <Ionicons
                      name={schedule?.level === 'red' ? 'warning' : 'shield-checkmark'}
                      size={28}
                      color={schedule?.level === 'red' ? colors.severity.critical : colors.brand[500]}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[$.missionLabel, { color: schedule?.level === 'red' ? colors.severity.critical : colors.brand[500], marginBottom: 4 }]}>
                      {schedule?.level === 'red' ? 'RED ALERT' : 'STANDING BY'}
                    </Text>
                    <Text style={[$.standbyTitle, { color: textPrimary }]}>No active mission</Text>
                    <Text style={[$.standbyDesc, { color: textSecondary }]}>
                      {schedule?.level === 'red'
                        ? 'All units on 24-hour duty. Awaiting dispatch assignment.'
                        : 'Your phone will ring when Dispatch assigns you an incident.'}
                    </Text>
                  </View>
                </View>
                <View style={[$.standbyFooterDivider, { backgroundColor: dividerColor }]} />
                <View style={$.standbyFooterRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <View style={[
                      $.dutyDot,
                      schedule?.level === 'red'
                        ? { backgroundColor: '#EF4444' }
                        : schedule?.on_duty
                          ? { backgroundColor: '#34D399' }
                          : { backgroundColor: '#6B7280' },
                    ]} />
                    <Text style={[$.standbyFooterText, { color: textPrimary }]} numberOfLines={1}>
                      {schedule?.level === 'red'
                        ? 'All units on duty'
                        : schedule?.on_duty
                          ? 'Available to Dispatch'
                          : 'Off duty'}
                    </Text>
                  </View>
                  {teamIncidents.find(i => i.responderStatus === 'resolved') && (
                    <Text style={[$.standbyFooterMeta, { color: textSecondary }]} numberOfLines={1}>
                      {teamIncidents.find(i => i.responderStatus === 'resolved')?.reportedAt ?? ''}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </Animated.View>

          {/* ═══ STATUS OVERVIEW ═══ */}
          <Animated.View style={[{ paddingHorizontal: H_PAD, marginTop: 14 }, slideUp(fadeLower)]}>
            <View style={$.statusGrid}>
              {([
                { count: pendingCount, label: 'Pending',  color: '#F59E0B', icon: 'time-outline' as keyof typeof Ionicons.glyphMap },
                { count: resolvedCount, label: 'Resolved', color: colors.accent[500], icon: 'checkmark-circle-outline' as keyof typeof Ionicons.glyphMap },
              ] as const).map((item, idx) => (
                <View key={item.label} style={[$.statusItem, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                  <View style={[$.statusItemIcon, { backgroundColor: item.color + '10' }]}>
                    <Ionicons name={item.icon} size={14} color={item.color} />
                  </View>
                  <Text style={[$.statusItemCount, { color: textPrimary }]}>{item.count}</Text>
                  <Text style={[$.statusItemLabel, { color: textSecondary }]}>{item.label}</Text>
                </View>
              ))}
            </View>
          </Animated.View>

          {/* ═══ QUICK ACTIONS ═══ */}
          <Animated.View style={[{ paddingHorizontal: H_PAD, marginTop: 14 }, slideUp(fadeLower)]}>
            <Text style={[$.sectionTitle, { color: textPrimary, marginBottom: 10 }]}>Quick Actions</Text>
            <View style={$.actionsGrid}>
              {([
                { label: 'Map',        icon: 'map-outline' as keyof typeof Ionicons.glyphMap,           iconColor: colors.brand[500], onPress: () => router.push('/responder/(tabs)/map' as never) },
                { label: 'Protocols',  icon: 'document-text-outline' as keyof typeof Ionicons.glyphMap, iconColor: '#F59E0B',         onPress: () => router.push('/responder/protocols' as never) },
                { label: 'Reports',    icon: 'clipboard-outline' as keyof typeof Ionicons.glyphMap,     iconColor: colors.accent[500], onPress: () => router.push('/responder/(tabs)/assignments' as never) },
                { label: 'Alerts',     icon: 'notifications-outline' as keyof typeof Ionicons.glyphMap, iconColor: '#8B5CF6',         onPress: () => router.push('/responder/(tabs)/alerts' as never) },
              ]).map(action => (
                <Pressable
                  key={action.label}
                  onPress={action.onPress}
                  style={({ pressed }) => [
                    $.actionCard,
                    { backgroundColor: cardBg, borderColor: cardBorder },
                    pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
                  ]}
                >
                  <View style={[$.actionCardIcon, { backgroundColor: action.iconColor + '0D' }]}>
                    <Ionicons name={action.icon} size={20} color={action.iconColor} />
                  </View>
                  <Text style={[$.actionCardLabel, { color: textPrimary }]}>{action.label}</Text>
                  <Ionicons name="chevron-forward" size={14} color={textSecondary} style={{ opacity: 0.35 }} />
                </Pressable>
              ))}
            </View>
          </Animated.View>

          {/* ═══ MY TEAM ═══ */}
          {team && (
            <Animated.View style={[{ paddingHorizontal: H_PAD, marginTop: 20 }, slideUp(fadeLower)]}>
              <View style={$.sectionHeaderRow}>
                <Text style={[$.sectionTitle, { color: textPrimary }]}>{team.name}</Text>
                <View style={$.teamPill}>
                  <Ionicons name="people-outline" size={12} color={textSecondary} />
                  <Text style={[$.teamPillText, { color: textSecondary }]}>{team.members.length}</Text>
                </View>
              </View>
              <View style={[$.card, { backgroundColor: cardBg, borderColor: cardBorder, padding: 0, overflow: 'hidden' }]}>
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
                      <View style={[$.teamRow, isMe && { backgroundColor: isDark ? 'rgba(31,111,191,0.06)' : 'rgba(31,111,191,0.03)' }]}>
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
                            {isMe && (
                              <View style={$.youTag}>
                                <Text style={$.youTagText}>YOU</Text>
                              </View>
                            )}
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
                          style={({ pressed }) => [$.teamCallBtn, { borderColor: dividerColor }, pressed && { opacity: 0.5 }]}
                        >
                          <Ionicons name="call-outline" size={15} color={textSecondary} />
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
          <Animated.View style={[{ paddingHorizontal: H_PAD, marginTop: 20 }, slideUp(fadeLower)]}>
            <View style={$.sectionHeaderRow}>
              <Text style={[$.sectionTitle, { color: textPrimary }]}>Recent</Text>
              {teamIncidents.length > 0 && (
                <Pressable
                  onPress={() => router.push('/responder/(tabs)/assignments' as never)}
                  style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                >
                  <Text style={$.sectionLink}>View all</Text>
                </Pressable>
              )}
            </View>
            <View style={[$.card, { backgroundColor: cardBg, borderColor: cardBorder, padding: 0, overflow: 'hidden' }]}>
              {teamIncidents.length === 0 ? (
                <View style={$.emptyState}>
                  <View style={$.emptyIconWrap}>
                    <Ionicons name="checkmark-circle-outline" size={28} color={colors.severity.low} />
                  </View>
                  <Text style={[$.emptyTitle, { color: textPrimary }]}>All clear</Text>
                  <Text style={[$.emptyText, { color: textSecondary }]}>
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
                        <View style={[$.recentSevBar, { backgroundColor: sc }]} />
                        <View style={{ flex: 1 }}>
                          <Text style={[$.recentTitle, { color: textPrimary }]} numberOfLines={1}>
                            {inc.title}
                          </Text>
                          <Text style={[$.recentMeta, { color: textSecondary }]} numberOfLines={1}>
                            {inc.address.split(',')[0]} · {inc.reportedAt}
                          </Text>
                          <View style={$.recentBadges}>
                            <View style={[$.recentBadge, { backgroundColor: sc + '10' }]}>
                              <Text style={[$.recentBadgeText, { color: sc }]}>
                                {inc.severity.charAt(0).toUpperCase() + inc.severity.slice(1)}
                              </Text>
                            </View>
                            <View style={[$.recentBadge, { backgroundColor: elevatedBg }]}>
                              {inc.responderStatus === 'resolved' && <Ionicons name="checkmark" size={10} color="#10B981" />}
                              {inc.responderStatus === 'pending' && <Ionicons name="time" size={10} color="#F59E0B" />}
                              {inc.responderStatus === 'en_route' && <Ionicons name="navigate" size={10} color={colors.brand[500]} />}
                              {inc.responderStatus === 'on_scene' && <Ionicons name="location" size={10} color="#10B981" />}
                              <Text style={[$.recentBadgeText, { color: textSecondary }]}>
                                {STEPPER_LABELS[inc.responderStatus]}
                              </Text>
                            </View>
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={textSecondary} style={{ opacity: 0.35 }} />
                      </Pressable>
                      {!isLast && <View style={[$.divider, { backgroundColor: dividerColor, marginLeft: 44 }]} />}
                    </View>
                  );
                })
              )}
            </View>
          </Animated.View>

          {/* Bottom spacer */}
          <View style={{ height: 8 }} />
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
                colors={[colors.severity.low, '#16a34a']}
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
                  colors={colors.gradients.hero}
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

  /* header */
  header: { paddingHorizontal: H_PAD, overflow: 'hidden' },
  headerOrb: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.04)' },
  curveWrap: { height: 20, position: 'relative', marginTop: -1 },
  curveShape: { position: 'absolute', bottom: 0, left: -12, right: -12, height: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24 },

  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  greetLabel: { fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: '500', letterSpacing: 0.3, marginBottom: 2 },
  greetName: { fontSize: 26, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },

  dutyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  dutyDot: { width: 6, height: 6, borderRadius: 3 },
  dutyText: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '600', maxWidth: 200 },
  headerWeather: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerWeatherText: { fontSize: 28, color: '#fff', fontWeight: '900', letterSpacing: -0.5 },

  /* flood risk bar */
  riskBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  riskIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  riskTitle: { fontSize: 12, fontWeight: '700', marginBottom: 1 },
  riskDesc: { fontSize: 11, fontWeight: '500' },
  riskBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  riskBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },

  /* offline banner */
  offlineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F59E0B0E', borderRadius: 14, borderWidth: 1, borderColor: '#F59E0B20',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  offlineText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#F59E0B' },
  syncingPill: { backgroundColor: '#F59E0B18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  syncingText: { fontSize: 10, fontWeight: '700', color: '#F59E0B' },

  /* card base */
  card: {
    borderRadius: 18, borderWidth: 1, padding: 18, overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },

  /* ── mission card (active assignment) ── */
  missionCard: {
    borderRadius: 20, borderWidth: 1, padding: 18, overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  missionAccent: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 3,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
  },
  missionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, marginBottom: 10 },
  missionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  missionPulse: { width: 6, height: 6, borderRadius: 3 },
  missionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  missionRef: { fontSize: 11, fontWeight: '600' },
  missionTitle: { fontSize: 19, fontWeight: '900', lineHeight: 25, marginBottom: 10, letterSpacing: -0.3 },

  missionChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  missionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 9, paddingVertical: 4.5, borderRadius: 8,
    borderWidth: 1,
  },
  missionChipDot: { width: 5, height: 5, borderRadius: 3 },
  missionChipText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.1 },

  missionLocRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  missionLocText: { fontSize: 12, fontWeight: '500', flex: 1 },

  missionDivider: { height: 1, marginVertical: 14, marginHorizontal: -18, opacity: 0.6 },

  missionFooter: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  missionFooterText: { fontSize: 11, fontWeight: '500', opacity: 0.6 },

  /* status tracker */
  trackerWrap: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, paddingHorizontal: 2 },
  trackerDot: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#4B5563',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  trackerDotDone: { borderColor: '#10B981', backgroundColor: '#10B981' },
  trackerDotActive: { borderColor: colors.brand[500], backgroundColor: 'transparent', borderWidth: 2.5 },
  trackerInnerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand[500] },
  trackerLine: { flex: 1, height: 2, backgroundColor: '#4B5563', marginTop: 10, marginHorizontal: 2, borderRadius: 1 },
  trackerLineDone: { backgroundColor: '#10B981' },
  trackerLabel: { fontSize: 9, fontWeight: '600', color: '#8B8FA3', textAlign: 'center', marginTop: 5, width: 52 },

  /* navigate button */
  navBtnWrap: { borderRadius: 14, overflow: 'hidden', marginBottom: 10 },
  navBtnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14,
  },
  navBtnText: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },


  /* standing by */
  standbyContent: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginTop: 4 },
  standbyIconWrap: {
    width: 50, height: 50, borderRadius: 16,
    backgroundColor: 'rgba(31,111,191,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  standbyTitle: { fontSize: 18, fontWeight: '900', marginBottom: 4, letterSpacing: -0.3 },
  standbyDesc: { fontSize: 12, fontWeight: '500', lineHeight: 18, opacity: 0.7 },
  standbyFooterDivider: { height: 1, marginTop: 16, marginBottom: 12, marginHorizontal: -18, opacity: 0.5 },
  standbyFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  standbyFooterText: { fontSize: 12, fontWeight: '700' },
  standbyFooterMeta: { fontSize: 11, fontWeight: '500' },

  /* status grid */
  statusGrid: { flexDirection: 'row', gap: 8 },
  statusItem: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: 14, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  statusItemIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statusItemCount: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5, marginBottom: 2 },
  statusItemLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.2 },

  /* section headers */
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  sectionLink: { fontSize: 12, fontWeight: '700', color: colors.brand[500] },

  /* quick actions grid */
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionCard: {
    width: '48%' as any,
    flexGrow: 1,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 13,
    borderRadius: 14, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  actionCardIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  actionCardLabel: { flex: 1, fontSize: 13, fontWeight: '700' },

  /* team */
  teamPill: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  teamPillText: { fontSize: 12, fontWeight: '600' },
  teamRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13 },
  teamAvatar: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  teamAvatarText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  teamStatusDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2.5,
  },
  teamName: { fontSize: 13, fontWeight: '700' },
  youTag: { backgroundColor: colors.brand[500] + '14', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  youTagText: { fontSize: 8, fontWeight: '800', color: colors.brand[500], letterSpacing: 0.5 },
  leaderTag: { backgroundColor: '#F59E0B14', paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6 },
  leaderTagText: { fontSize: 9, fontWeight: '800', color: '#F59E0B', letterSpacing: 0.5 },
  teamCallBtn: {
    width: 32, height: 32, borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },

  /* recent incidents */
  recentRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  recentSevBar: { width: 3, height: 34, borderRadius: 2, marginRight: 12 },
  recentTitle: { fontSize: 13, fontWeight: '800', marginBottom: 3, letterSpacing: -0.1 },
  recentMeta: { fontSize: 11, fontWeight: '500', opacity: 0.55, marginBottom: 6 },
  recentBadges: { flexDirection: 'row', gap: 6 },
  recentBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 },
  recentBadgeText: { fontSize: 10, fontWeight: '700' },

  /* empty state */
  emptyState: { padding: 28, alignItems: 'center' },
  emptyIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: colors.severity.low + '0D',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
  emptyText: { fontSize: 12, fontWeight: '500' },

  /* divider */
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },

  /* snackbar */
  snackbar: {
    position: 'absolute', left: H_PAD, right: H_PAD,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#1A1D27', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
  },
  snackbarText: { fontSize: 13, fontWeight: '600', color: '#E2E8F0', flex: 1 },
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
