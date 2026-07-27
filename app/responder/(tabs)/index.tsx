import { useCallback, useEffect, useRef, useState } from 'react';
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
import * as Location from 'expo-location';
import {
  getAssignedIncidents,
  getResponderStats,
  updateIncidentStatus,
  submitMemberStatus,
  getAppConfig,
  getWeatherWithFallback,
  updateProfile,
  getMyTeam,
  getTeamStats,
  type WeatherData,
} from '@/services/api';
import {
  cacheIncidents,
  getCachedIncidents,
  queueStatusUpdate,
  getPendingCount,
} from '@/services/offline';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { socketService } from '@/services/socket';
import type { Incident, MemberStatus, ResponderStats, ResponderStatus, Team } from '@/types';

const H_PAD = 20;
const CARD_GAP = 14;

const STATUS_LABELS: Record<ResponderStatus, string> = {
  pending:  'Pending',
  en_route: 'En Route',
  on_scene: 'On Scene',
  resolved: 'Resolved',
};

const STATUS_COLORS: Record<ResponderStatus, string> = {
  pending:  colors.severity.moderate,
  en_route: colors.brand[500],
  on_scene: colors.brand[500],
  resolved: colors.severity.low,
};

const STATUS_ICONS: Record<ResponderStatus, keyof typeof Ionicons.glyphMap> = {
  pending:  'time',
  en_route: 'car',
  on_scene: 'location',
  resolved: 'checkmark-circle',
};

/* ─── helpers ─── */
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function getFloodRisk(rainH: number): { label: string; color: string } {
  if (rainH >= 7.5) return { label: 'CRITICAL', color: colors.severity.critical };
  if (rainH >= 2.5) return { label: 'HIGH',     color: colors.severity.high };
  if (rainH >= 0.1) return { label: 'MODERATE', color: colors.severity.moderate };
  return { label: 'LOW', color: colors.severity.low };
}


/* ─── Assignment detail card ─── */
function AssignmentCard({
  incident,
  isDark,
  cardBg,
  cardBorder,
  textPrimary,
  textSecondary,
  onUpdateStatus,
  onView,
  updatingStatus,
  isLeader,
}: {
  incident: Incident;
  isDark: boolean;
  cardBg: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  onUpdateStatus: (id: string, s: ResponderStatus) => void;
  onView: (id: string) => void;
  updatingStatus: string | null;
  isLeader: boolean;
}) {
  const sevColor    = colors.severity[incident.severity];
  const statusColor = STATUS_COLORS[incident.responderStatus];
  const isUpdating  = updatingStatus === incident.id;

  const nextStatus: ResponderStatus | null =
    incident.responderStatus === 'pending'  ? 'en_route' :
    incident.responderStatus === 'en_route' ? 'on_scene' : null;

  const nextLabel =
    incident.responderStatus === 'pending'  ? 'En Route' :
    incident.responderStatus === 'en_route' ? 'On Scene' : '';

  const dividerColor = isDark ? colors.dark.border : colors.slate[100];

  return (
    <Pressable
      onPress={() => onView(incident.id)}
      style={({ pressed }) => [
        $.assignShadow,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.95 },
      ]}
    >
      <View style={[$.assignCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        {/* Card header */}
        <View style={$.assignCardHeader}>
          <View style={$.assignCardIconWrap}>
            <Ionicons name="shield" size={20} color={colors.brand[500]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[$.assignCardTitle, { color: textPrimary }]}>Active Assignment</Text>
            <Text style={[$.assignCardSub, { color: textSecondary }]}>Your current incident</Text>
          </View>
          <View style={[$.liveDot, { backgroundColor: sevColor }]} />
        </View>

        <View style={[$.assignDivider, { backgroundColor: dividerColor }]} />

        {/* Rows */}
        <View style={$.assignRow}>
          <Text style={[$.assignKey, { color: textSecondary }]}>Incident</Text>
          <Text style={[$.assignVal, { color: textPrimary }]} numberOfLines={1}>{incident.title}</Text>
        </View>
        <View style={[$.assignDivider, { backgroundColor: dividerColor }]} />

        <View style={$.assignRow}>
          <Text style={[$.assignKey, { color: textSecondary }]}>Location</Text>
          <View style={$.assignValRow}>
            <Ionicons name="location-outline" size={12} color={textSecondary} />
            <Text style={[$.assignVal, { color: textPrimary, flex: 1 }]} numberOfLines={1}>
              {incident.address}
            </Text>
          </View>
        </View>
        <View style={[$.assignDivider, { backgroundColor: dividerColor }]} />

        <View style={$.assignRow}>
          <Text style={[$.assignKey, { color: textSecondary }]}>Severity</Text>
          <View style={[$.sevPill, { backgroundColor: sevColor + '18' }]}>
            <Text style={[$.sevPillText, { color: sevColor }]}>
              {incident.severity.charAt(0).toUpperCase() + incident.severity.slice(1)}
            </Text>
          </View>
        </View>
        <View style={[$.assignDivider, { backgroundColor: dividerColor }]} />

        <View style={$.assignRow}>
          <Text style={[$.assignKey, { color: textSecondary }]}>Status</Text>
          <View style={$.assignRowRight}>
            <View style={[$.statusPill, { backgroundColor: statusColor + '18' }]}>
              <Ionicons name={STATUS_ICONS[incident.responderStatus]} size={10} color={statusColor} />
              <Text style={[$.statusPillText, { color: statusColor }]}>
                {STATUS_LABELS[incident.responderStatus]}
              </Text>
            </View>
            <View style={$.assignBtns}>
              <Pressable
                onPress={(e) => { e.stopPropagation?.(); onView(incident.id); }}
                style={({ pressed }) => [
                  $.viewBtn,
                  { borderColor: isDark ? colors.dark.border : colors.slate[200] },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[$.viewBtnText, { color: isDark ? colors.slate[300] : colors.slate[600] }]}>View</Text>
                <Ionicons name="chevron-forward" size={11} color={isDark ? colors.slate[400] : colors.slate[500]} />
              </Pressable>
              {nextStatus && isLeader && (
                <Pressable
                  onPress={(e) => { e.stopPropagation?.(); !isUpdating && onUpdateStatus(incident.id, nextStatus); }}
                  style={({ pressed }) => [
                    $.actionBtn,
                    { backgroundColor: statusColor },
                    pressed && { opacity: 0.85 },
                    isUpdating && { opacity: 0.6 },
                  ]}
                >
                  {isUpdating
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={$.actionBtnText}>{nextLabel}</Text>}
                </Pressable>
              )}
            </View>
          </View>
        </View>

      </View>
    </Pressable>
  );
}

/* ─── Main screen ─── */
export default function HomeTab() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const scheme  = useColorScheme();
  const isDark  = scheme === 'dark';
  const { token, user, setHomeAddress, updateUser } = useAuth();

  const [incidents,        setIncidents]        = useState<Incident[]>([]);
  const [stats,            setStats]            = useState<ResponderStats | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [refreshing,       setRefreshing]       = useState(false);
  const [updatingStatus,   setUpdatingStatus]   = useState<string | null>(null);
  const [weather,          setWeather]          = useState<WeatherData | null>(null);
  const [team,             setTeam]             = useState<Team | null>(null);
  const [teamStats,        setTeamStats]        = useState<ResponderStats | null>(null);
  const [showAll,       setShowAll]       = useState(false);
  const [showHomeSetup, setShowHomeSetup] = useState(false);
  const isOnline = useNetworkStatus();
  const [homeSetupLoading, setHomeSetupLoading] = useState(false);
  const [homeSetupDone,    setHomeSetupDone]    = useState(false);

  /* entrance animations */
  const fadeTop    = useRef(new Animated.Value(0)).current;
  const fadeMiddle = useRef(new Animated.Value(0)).current;
  const fadeBottom = useRef(new Animated.Value(0)).current;
  const animated   = useRef(false);

  useEffect(() => {
    if (loading || animated.current) return;
    animated.current = true;
    Animated.stagger(120, [
      Animated.timing(fadeTop,    { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fadeMiddle, { toValue: 1, duration: 440, easing: Easing.out(Easing.back(1.04)), useNativeDriver: true }),
      Animated.timing(fadeBottom, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [loading]);

  /* theme tokens */
  const bg            = isDark ? colors.dark.bg      : colors.responder.pageBg;
  const cardBg        = isDark ? colors.dark.card    : colors.white;
  const cardBorder    = isDark ? colors.dark.border  : 'rgba(0,0,0,0.05)';
  const textPrimary   = isDark ? colors.white        : colors.slate[900];
  const textSecondary = isDark ? colors.slate[400]   : colors.slate[500];
  const dividerColor  = isDark ? colors.dark.border  : colors.slate[100];

  /* data loaders */
  const loadIncidents = useCallback(async (isRefresh = false) => {
    if (!token) return;
    try {
      if (!isRefresh) setLoading(true);
      const data = await getAssignedIncidents(token);
      setIncidents(data);
      cacheIncidents(data).catch(() => {});
    } catch {
      // Offline fallback — show cached data
      const cached = await getCachedIncidents();
      if (cached.length > 0) setIncidents(cached);
    }
    finally { setLoading(false); setRefreshing(false); }
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
        const last = await Location.getLastKnownPositionAsync();
        if (last) { lat = last.coords.latitude; lon = last.coords.longitude; }
        if (!lat) {
          const cur = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          lat = cur.coords.latitude;
          lon = cur.coords.longitude;
        }
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
    loadIncidents(); loadStats(); loadWeather(); loadTeam();
  }, [loadIncidents, loadStats, loadWeather, loadTeam]);

  useEffect(() => {
    const onNew = () => loadIncidents(true);
    socketService.on('new-notification', onNew);
    socketService.on('new-assignment',   onNew);
    return () => {
      socketService.off('new-notification', onNew);
      socketService.off('new-assignment',   onNew);
    };
  }, [loadIncidents]);

  useEffect(() => {
    if (user && !user.homeAddress) {
      setShowHomeSetup(true);
    }
  }, []);

  async function handleHomeSetupUseLocation() {
    setHomeSetupLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setShowHomeSetup(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
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
      setTimeout(() => {
        setShowHomeSetup(false);
        setHomeSetupDone(false);
      }, 1800);
    } catch {
      setShowHomeSetup(false);
    } finally {
      setHomeSetupLoading(false);
    }
  }

  const handleStatusUpdate = useCallback(async (incidentId: string, status: ResponderStatus) => {
    if (!token) return;
    setUpdatingStatus(incidentId);
    try {
      if (!isOnline) {
        await queueStatusUpdate({ incidentId, status });
      } else {
        await submitMemberStatus({ incidentId, status }, token);
      }
      setIncidents(prev => prev.map(i => {
        if (i.id !== incidentId) return i;
        const myEntry: MemberStatus = {
          userId:    user?.id ?? '',
          userName:  `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
          avatarUrl: user?.avatarUrl,
          status,
          updatedAt: 'Just now',
        };
        const existing = i.memberStatuses ?? [];
        const idx = existing.findIndex(ms => ms.userId === (user?.id ?? ''));
        const updated = idx >= 0
          ? existing.map((ms, j) => j === idx ? myEntry : ms)
          : [...existing, myEntry];
        return { ...i, memberStatuses: updated };
      }));
    } catch {}
    finally { setUpdatingStatus(null); }
  }, [token, user]);




  /* derived values — filter to own team for non-leaders */
  const teamIncidents = user?.isLeader
    ? incidents
    : incidents.filter(i => !i.teamId || i.teamId === user?.teamId);

  const active        = teamIncidents.filter(i => i.responderStatus !== 'resolved');
  const pendingCount  = teamIncidents.filter(i => i.responderStatus === 'pending').length;
  const enRouteCount  = teamIncidents.filter(i => i.responderStatus === 'en_route').length;
  const onSceneCount  = teamIncidents.filter(i => i.responderStatus === 'on_scene').length;
  const resolvedCount = teamIncidents.filter(i => i.responderStatus === 'resolved').length;
  const resolveRate   = teamIncidents.length > 0 ? Math.round((resolvedCount / teamIncidents.length) * 100) : 0;

  /* For members: prefer the incident where they appear in memberStatuses (their own assignment).
     Fall back to the first active incident for newly assigned members with no status yet. */
  const PRIORITY_STATUSES = ['on_scene', 'en_route', 'pending'] as ResponderStatus[];
  const primaryAssignment: Incident | null = (() => {
    if (user?.isLeader) {
      return PRIORITY_STATUSES.flatMap(s => active.filter(i => i.responderStatus === s)).find(Boolean) ?? null;
    }
    const mine = PRIORITY_STATUSES
      .flatMap(s => active.filter(i =>
        i.responderStatus === s &&
        (i.memberStatuses ?? []).some(m => m.userId === user?.id),
      ))
      .find(Boolean);
    return mine ??
      PRIORITY_STATUSES.flatMap(s => active.filter(i => i.responderStatus === s)).find(Boolean) ?? null;
  })();

  const heroGrad = ['#00D2FF', '#4A6CF7', '#7C3AED'] as [string, string, string];

  const resolveBarColor = resolveRate >= 50
    ? colors.severity.low
    : resolveRate >= 25 ? colors.severity.moderate : colors.severity.high;

  const slideUp = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  });

  /* ── Loading screen ── */
  if (loading) {
    return (
      <View style={[$.root, { backgroundColor: bg }]}>
        <LinearGradient
          colors={heroGrad}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[$.header, { paddingTop: insets.top + 14 }]}
        >
          <View style={[$.orb, { width: 200, height: 200, top: -70, right: -60, opacity: 0.07 }]} />
          <View style={[$.orb, { width: 110, height: 110, bottom: 30, left: -35, opacity: 0.05 }]} />
          <View style={$.headerTop}>
            <View style={{ flex: 1 }}>
              <Text style={$.greetSub}>{getGreeting()},</Text>
              <Text style={$.greetName}>{user?.firstName ?? 'Responder'}</Text>
            </View>
          </View>
          <View style={$.waveWrap} pointerEvents="none">
            <View style={[$.waveBack, { backgroundColor: bg, opacity: 0.25 }]} />
            <View style={[$.waveFront, { backgroundColor: bg }]} />
          </View>
        </LinearGradient>
        <View style={$.loadSpinnerWrap}>
          <ActivityIndicator size="large" color={colors.brand[500]} />
          <Text style={[$.loadText, { color: textSecondary }]}>Loading dashboard…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[$.root, { backgroundColor: bg }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
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
        <Animated.View style={slideUp(fadeTop)}>
          <LinearGradient
            colors={heroGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[$.header, { paddingTop: insets.top + 14 }]}
          >
            {/* Decorative orbs */}
            <View style={[$.orb, { width: 200, height: 200, top: -70, right: -60, opacity: 0.07 }]} />
            <View style={[$.orb, { width: 110, height: 110, bottom: 30, left: -35, opacity: 0.05 }]} />

            {/* Row 1: greeting + controls */}
            <View style={$.headerTop}>
              <View style={{ flex: 1 }}>
                <Text style={$.greetSub}>{getGreeting()},</Text>
                <Text style={$.greetName}>{user?.firstName ?? 'Responder'}</Text>
              </View>


              {/* Avatar */}
              <Pressable
                onPress={() => router.push('/responder/(tabs)/profile' as never)}
                style={({ pressed }) => [$.avatar, pressed && { opacity: 0.8 }]}
              >
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={$.avatarImg} />
                ) : (
                  <LinearGradient
                    colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.12)']}
                    style={$.avatarImg}
                  >
                    <Text style={$.avatarText}>
                      {user ? `${user.firstName[0]}${user.lastName[0]}` : 'R'}
                    </Text>
                  </LinearGradient>
                )}
              </Pressable>
            </View>

            {/* Row 2: frosted stats pill */}
            <View style={$.statPill}>
              <View style={$.statItem}>
                <Text style={$.statVal}>{active.length}</Text>
                <Text style={$.statLabel}>Active</Text>
              </View>
              <View style={$.statSep} />
              <View style={$.statItem}>
                <Text style={$.statVal}>{resolvedCount}</Text>
                <Text style={$.statLabel}>Resolved</Text>
              </View>
              <View style={$.statSep} />
              <View style={$.statItem}>
                <Text style={$.statVal}>
                  {stats && (stats.avgResponseMinutes ?? 0) > 0
                    ? (stats.avgResponseMinutes as number) < 60
                      ? `${Math.round(stats.avgResponseMinutes as number)}m`
                      : `${((stats.avgResponseMinutes as number) / 60).toFixed(1)}h`
                    : 'N/A'}
                </Text>
                <Text style={$.statLabel}>Avg Resp</Text>
              </View>
            </View>

            {/* Wave transition */}
            <View style={$.waveWrap} pointerEvents="none">
              <View style={[$.waveBack, { backgroundColor: bg, opacity: 0.25 }]} />
              <View style={[$.waveFront, { backgroundColor: bg }]} />
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ═══ STATUS STRIP (Pending | En Route | On Scene) ═══ */}
        <Animated.View style={[$.strip, slideUp(fadeMiddle)]}>
          {[
            { label: 'Pending',  count: pendingCount,  color: colors.severity.moderate, icon: 'time-outline' as keyof typeof Ionicons.glyphMap },
            { label: 'En Route', count: enRouteCount,  color: colors.brand[500],        icon: 'car-outline' as keyof typeof Ionicons.glyphMap },
            { label: 'On Scene', count: onSceneCount,  color: colors.severity.low,      icon: 'location-outline' as keyof typeof Ionicons.glyphMap },
          ].map((item, idx) => (
            <View
              key={item.label}
              style={[
                $.stripCard,
                { backgroundColor: cardBg, borderColor: cardBorder },
                idx < 2 && { marginRight: CARD_GAP },
              ]}
            >
              <View style={[$.stripDot, { backgroundColor: item.color + '18' }]}>
                <Ionicons name={item.icon} size={15} color={item.color} />
              </View>
              <Text style={[$.stripCount, { color: textPrimary }]}>{item.count}</Text>
              <Text style={[$.stripLabel, { color: textSecondary }]}>{item.label}</Text>
            </View>
          ))}
        </Animated.View>

        {/* ═══ ACTIVE ASSIGNMENT CARD ═══ */}
        <Animated.View style={[{ paddingHorizontal: H_PAD, marginBottom: CARD_GAP }, slideUp(fadeMiddle)]}>
          {primaryAssignment ? (
            <AssignmentCard
              incident={primaryAssignment}
              isDark={isDark}
              cardBg={cardBg}
              cardBorder={cardBorder}
              textPrimary={textPrimary}
              textSecondary={textSecondary}
              onUpdateStatus={handleStatusUpdate}
              onView={id => router.push(`/responder/incident/${id}` as never)}
              updatingStatus={updatingStatus}
              isLeader={user?.isLeader ?? false}
            />
          ) : (
            /* No-assignment empty state */
            <View style={$.assignShadow}>
              <View style={[$.assignCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                <View style={$.assignCardHeader}>
                  <View style={$.assignCardIconWrap}>
                    <Ionicons name="shield" size={20} color={colors.brand[500]} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[$.assignCardTitle, { color: textPrimary }]}>Active Assignment</Text>
                    <Text style={[$.assignCardSub, { color: textSecondary }]}>Your current incident</Text>
                  </View>
                </View>
                <View style={$.noAssignBody}>
                  <LinearGradient
                    colors={[colors.brand[300], colors.brand[700]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={$.noAssignIconWrap}
                  >
                    <Ionicons name="shield-outline" size={32} color="#fff" />
                  </LinearGradient>
                  <Text style={[$.noAssignTitle, { color: textPrimary }]}>Standing by</Text>
                  <Text style={[$.noAssignText, { color: textSecondary }]}>No incidents assigned</Text>
                </View>
              </View>
            </View>
          )}
        </Animated.View>

        {/* ═══ TODAY'S WEATHER CARD ═══ */}
        <Animated.View style={[{ paddingHorizontal: H_PAD, marginBottom: CARD_GAP }, slideUp(fadeMiddle)]}>
          <View style={$.wxShadow}>
            <LinearGradient
              colors={isDark ? ['#0D1A37', '#0D2340', '#111827'] : ['#00D2FF', '#4A6CF7', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={$.wxCard}
            >
              {/* Header row */}
              <View style={$.wxHeader}>
                <View style={$.wxLeft}>
                  <View style={$.wxIconWrap}>
                    <Ionicons name="partly-sunny" size={20} color="rgba(255,255,255,0.92)" />
                  </View>
                  <View>
                    <Text style={$.wxTitle}>Today's Weather</Text>
                    {weather?.current.city ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                        <Ionicons name="location-outline" size={11} color="rgba(255,255,255,0.55)" />
                        <Text style={$.wxCity} numberOfLines={1}>{weather.current.city}</Text>
                      </View>
                    ) : (
                      <Text style={$.wxCity}>Fetching location…</Text>
                    )}
                  </View>
                </View>
                {weather
                  ? <View style={[$.wxBadge, { backgroundColor: getFloodRisk(weather.current.rainH).color }]}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff', marginRight: 5 }} />
                      <Text style={$.wxBadgeText}>{getFloodRisk(weather.current.rainH).label} RISK</Text>
                    </View>
                  : <ActivityIndicator size="small" color="rgba(255,255,255,0.7)" />
                }
              </View>

              {/* Temp + desc */}
              <View style={$.wxMain}>
                <Text style={$.wxTemp}>{weather ? `${Math.round(weather.current.temperature)}°C` : '--°C'}</Text>
                <Text style={$.wxDesc} numberOfLines={1}>{weather ? weather.current.description : 'Loading weather data…'}</Text>
              </View>

              {/* 3 stats */}
              <View style={[$.wxStats, { borderTopColor: 'rgba(255,255,255,0.14)' }]}>
                <View style={$.wxStat}>
                  <Ionicons name="rainy-outline" size={15} color="rgba(255,255,255,0.75)" />
                  <Text style={$.wxStatVal}>{weather ? weather.current.rainH.toFixed(1) : '--'}</Text>
                  <Text style={$.wxStatLbl}>mm/h</Text>
                </View>
                <View style={[$.wxStatDiv, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
                <View style={$.wxStat}>
                  <Ionicons name="water-outline" size={15} color="rgba(255,255,255,0.75)" />
                  <Text style={$.wxStatVal}>{weather ? `${weather.current.humidity}%` : '--'}</Text>
                  <Text style={$.wxStatLbl}>Humidity</Text>
                </View>
                <View style={[$.wxStatDiv, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
                <View style={$.wxStat}>
                  <Ionicons name="speedometer-outline" size={15} color="rgba(255,255,255,0.75)" />
                  <Text style={$.wxStatVal}>{weather ? weather.current.windSpeed.toFixed(1) : '--'}</Text>
                  <Text style={$.wxStatLbl}>km/h</Text>
                </View>
              </View>
            </LinearGradient>
          </View>
        </Animated.View>


        {/* ═══ QUICK ACTIONS (Map | Protocols) ═══ */}
        <Animated.View style={[{ paddingHorizontal: H_PAD, marginBottom: CARD_GAP }, slideUp(fadeMiddle)]}>
          <View style={{ flexDirection: 'row' }}>
            <View style={[$.actionShadow, { shadowColor: colors.brand[500] }]}>
              <Pressable
                onPress={() => router.push('/responder/(tabs)/map' as never)}
                style={({ pressed }) => [$.actionCard, pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] }]}
              >
                <LinearGradient
                  colors={[colors.brand[500], colors.brand[700]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={$.actionGrad}
                >
                  <View style={$.actionIcon}>
                    <Ionicons name="map" size={26} color="#fff" />
                  </View>
                  <Text style={$.actionTitle}>View Map</Text>
                  <Text style={$.actionSub}>Incident locations</Text>
                </LinearGradient>
              </Pressable>
            </View>
            <View style={[$.actionShadow, { shadowColor: colors.accent[500], marginRight: 0 }]}>
              <Pressable
                onPress={() => router.push('/responder/protocols' as never)}
                style={({ pressed }) => [$.actionCard, pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] }]}
              >
                <LinearGradient
                  colors={[colors.accent[500], colors.accent[700]]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={$.actionGrad}
                >
                  <View style={$.actionIcon}>
                    <Ionicons name="book" size={26} color="#fff" />
                  </View>
                  <Text style={$.actionTitle}>Protocols</Text>
                  <Text style={$.actionSub}>SOP guidelines</Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        </Animated.View>

        {/* ═══ MY TEAM ═══ */}
        {team && (
          <Animated.View style={[{ paddingHorizontal: H_PAD, marginBottom: CARD_GAP }, slideUp(fadeBottom)]}>
            <View style={$.cardShadow}>
              <View style={[$.sectionCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
                {/* Header */}
                <View style={$.sectionHeader}>
                  <View style={$.sectionLeft}>
                    <View style={[$.sectionIcon, { backgroundColor: colors.brand[500] + '18' }]}>
                      <Ionicons name="people" size={16} color={colors.brand[500]} />
                    </View>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[$.sectionTitle, { color: textPrimary }]}>{team.name}</Text>
                        {user?.isLeader && (
                          <View style={$.leaderBadge}>
                            <Ionicons name="star" size={9} color="#F59E0B" />
                            <Text style={$.leaderBadgeText}>Leader</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[$.sectionSub, { color: textSecondary }]}>
                        {team.members.length} member{team.members.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Member list */}
                <View style={$.teamList}>
                  {team.members.map((member, idx) => {
                    const isLast = idx === team.members.length - 1;
                    const initials = `${member.firstName[0] ?? ''}${member.lastName[0] ?? ''}`.toUpperCase();
                    const isCurrentUser = member.id === user?.id;
                    return (
                      <View key={member.id}>
                        <View style={$.teamRow}>
                          {/* Avatar */}
                          {member.avatarUrl ? (
                            <Image source={{ uri: member.avatarUrl }} style={$.teamAvatar} />
                          ) : (
                            <LinearGradient
                              colors={isCurrentUser
                                ? [colors.brand[300], colors.brand[500]]
                                : ['#64748B', '#475569']}
                              style={$.teamAvatar}
                            >
                              <Text style={$.teamAvatarText}>{initials}</Text>
                            </LinearGradient>
                          )}

                          {/* Name */}
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={[$.teamMemberName, { color: textPrimary }]}>
                                {member.firstName} {member.lastName}
                                {isCurrentUser ? ' (You)' : ''}
                              </Text>
                            </View>
                            {member.isLeader && (
                              <View style={$.teamLeaderPill}>
                                <Ionicons name="star" size={9} color="#F59E0B" />
                                <Text style={$.teamLeaderPillText}>Team Leader</Text>
                              </View>
                            )}
                          </View>

                          {member.isLeader && (
                            <Ionicons name="shield-checkmark" size={16} color={colors.brand[500]} />
                          )}
                        </View>
                        {!isLast && <View style={[$.rowDivider, { backgroundColor: dividerColor }]} />}
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          </Animated.View>
        )}

        {/* ═══ RECENT INCIDENTS ═══ */}
        <Animated.View style={[{ paddingHorizontal: H_PAD, marginBottom: CARD_GAP }, slideUp(fadeBottom)]}>
          <View style={$.cardShadow}>
            <View style={[$.sectionCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              {/* Section header */}
              <View style={$.sectionHeader}>
                <View style={$.sectionLeft}>
                  <View style={[$.sectionIcon, { backgroundColor: '#F59E0B18' }]}>
                    <Ionicons name="document-text" size={16} color="#F59E0B" />
                  </View>
                  <View>
                    <Text style={[$.sectionTitle, { color: textPrimary }]}>Recent Incidents</Text>
                    <Text style={[$.sectionSub, { color: textSecondary }]}>Your latest assignments</Text>
                  </View>
                </View>
                {teamIncidents.length > 5 && (
                  <Pressable
                    onPress={() => setShowAll(v => !v)}
                    style={({ pressed }) => [$.viewAllBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={[$.viewAllText, { color: colors.brand[500] }]}>
                      {showAll ? 'Show less' : 'View all'}
                    </Text>
                    <Ionicons name={showAll ? 'chevron-up' : 'chevron-forward'} size={14} color={colors.brand[500]} />
                  </Pressable>
                )}
              </View>

              {/* List */}
              {teamIncidents.length === 0 ? (
                <View style={$.emptyRow}>
                  <Ionicons name="checkmark-circle-outline" size={28} color={colors.severity.low} />
                  <Text style={[$.emptyText, { color: textSecondary }]}>No incidents assigned yet</Text>
                </View>
              ) : (
                (showAll ? teamIncidents : teamIncidents.slice(0, 5)).map((inc, idx) => {
                  const sevColor    = colors.severity[inc.severity];
                  const statusColor = STATUS_COLORS[inc.responderStatus];
                  const isLast      = idx === (showAll ? teamIncidents.length - 1 : Math.min(teamIncidents.length, 5) - 1);
                  const rowDivColor = isDark ? colors.dark.border : colors.slate[100];
                  return (
                    <View key={inc.id}>
                      <Pressable
                        onPress={() => router.push(`/responder/incident/${inc.id}` as never)}
                        style={({ pressed }) => [$.recentRow, pressed && { backgroundColor: isDark ? colors.dark.elevated : colors.slate[50] }]}
                      >
                        {/* Flat tinted icon */}
                        <View style={[$.recentRowIcon, { backgroundColor: sevColor + '15' }]}>
                          <Ionicons name="water" size={16} color={sevColor} />
                        </View>
                        <View style={$.recentRowBody}>
                          <Text style={[$.recentRowTitle, { color: textPrimary }]} numberOfLines={1}>{inc.title}</Text>
                          <View style={$.recentRowMeta}>
                            <View style={[$.recentStatusPill, { backgroundColor: statusColor + '18' }]}>
                              <Ionicons name={STATUS_ICONS[inc.responderStatus]} size={9} color={statusColor} />
                              <Text style={[$.recentStatusPillText, { color: statusColor }]}>
                                {STATUS_LABELS[inc.responderStatus]}
                              </Text>
                            </View>
                            <Text style={[$.recentRowDate, { color: textSecondary }]}>{inc.reportedAt}</Text>
                          </View>
                        </View>
                        <View style={[$.recentRowBadge, { backgroundColor: sevColor + '18' }]}>
                          <Text style={[$.recentRowBadgeText, { color: sevColor }]}>
                            {inc.severity.charAt(0).toUpperCase() + inc.severity.slice(1)}
                          </Text>
                        </View>
                      </Pressable>
                      {!isLast && <View style={[$.rowDivider, { backgroundColor: rowDivColor }]} />}
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </Animated.View>

        {/* ═══ PERFORMANCE ═══ */}
        <Animated.View style={[{ paddingHorizontal: H_PAD, marginBottom: CARD_GAP }, slideUp(fadeBottom)]}>
          <View style={$.cardShadow}>
            <View style={[$.sectionCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              {/* Section header */}
              <View style={$.sectionHeader}>
                <View style={$.sectionLeft}>
                  <View style={[$.sectionIcon, { backgroundColor: '#A855F718' }]}>
                    <Ionicons name="stats-chart" size={16} color="#A855F7" />
                  </View>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[$.sectionTitle, { color: textPrimary }]}>Performance</Text>
                      <View style={$.leaderBadge}>
                        <Ionicons name="people" size={9} color={colors.brand[500]} />
                        <Text style={[$.leaderBadgeText, { color: colors.brand[500] }]}>Team</Text>
                      </View>
                    </View>
                    <Text style={[$.sectionSub, { color: textSecondary }]}>
                      Team response overview
                    </Text>
                  </View>
                </View>
              </View>

              {/* 2×2 grid */}
              {(() => {
                // Always use team stats; fall back to counts computed from team incidents
                // (never use individual responder stats here)
                const perfData = teamStats ?? {
                  resolvedTotal:       resolvedCount,
                  resolvedThisWeek:    0,
                  resolvedThisMonth:   0,
                  activeCount:         active.length,
                  avgResponseMinutes:  null,
                };
                return (
                  <View style={$.perfGrid}>
                    <View style={$.perfRow}>
                      {perfData ? (
                        <>
                          <View style={[$.perfBox, { backgroundColor: isDark ? colors.dark.elevated : colors.slate[50], marginRight: 10 }]}>
                            <LinearGradient colors={['#10B981', '#059669']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={$.perfBoxIcon}>
                              <Ionicons name="checkmark-done" size={16} color="#fff" />
                            </LinearGradient>
                            <Text style={[$.perfBoxVal, { color: textPrimary }]}>{perfData.resolvedTotal}</Text>
                            <Text style={[$.perfBoxLabel, { color: textSecondary }]}>Total Resolved</Text>
                          </View>
                          <View style={[$.perfBox, { backgroundColor: isDark ? colors.dark.elevated : colors.slate[50] }]}>
                            <LinearGradient colors={[colors.brand[500], '#6366F1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={$.perfBoxIcon}>
                              <Ionicons name="calendar" size={16} color="#fff" />
                            </LinearGradient>
                            <Text style={[$.perfBoxVal, { color: textPrimary }]}>{perfData.resolvedThisWeek}</Text>
                            <Text style={[$.perfBoxLabel, { color: textSecondary }]}>This Week</Text>
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={[$.perfBox, $.perfBoxSkeleton, { marginRight: 10 }]}>
                            <View style={$.skeletonIcon} />
                            <View style={$.skeletonValLine} />
                            <View style={$.skeletonLabelLine} />
                          </View>
                          <View style={[$.perfBox, $.perfBoxSkeleton]}>
                            <View style={$.skeletonIcon} />
                            <View style={$.skeletonValLine} />
                            <View style={$.skeletonLabelLine} />
                          </View>
                        </>
                      )}
                    </View>
                    <View style={[$.perfRow, { marginBottom: 0 }]}>
                      {perfData ? (
                        <>
                          <View style={[$.perfBox, { backgroundColor: isDark ? colors.dark.elevated : colors.slate[50], marginRight: 10 }]}>
                            <LinearGradient colors={['#A855F7', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={$.perfBoxIcon}>
                              <Ionicons name="stats-chart" size={16} color="#fff" />
                            </LinearGradient>
                            <Text style={[$.perfBoxVal, { color: textPrimary }]}>{perfData.resolvedThisMonth}</Text>
                            <Text style={[$.perfBoxLabel, { color: textSecondary }]}>This Month</Text>
                          </View>
                          <View style={[$.perfBox, { backgroundColor: isDark ? colors.dark.elevated : colors.slate[50] }]}>
                            <LinearGradient colors={['#F59E0B', '#EA580C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={$.perfBoxIcon}>
                              <Ionicons name="timer" size={16} color="#fff" />
                            </LinearGradient>
                            <Text style={[$.perfBoxVal, { color: textPrimary }]}>
                              {(perfData.avgResponseMinutes ?? 0) > 0
                                ? (perfData.avgResponseMinutes as number) < 60
                                  ? `${Math.round(perfData.avgResponseMinutes as number)}m`
                                  : `${((perfData.avgResponseMinutes as number) / 60).toFixed(1)}h`
                                : 'N/A'}
                            </Text>
                            <Text style={[$.perfBoxLabel, { color: textSecondary }]}>Avg Response</Text>
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={[$.perfBox, $.perfBoxSkeleton, { marginRight: 10 }]}>
                            <View style={$.skeletonIcon} />
                            <View style={$.skeletonValLine} />
                            <View style={$.skeletonLabelLine} />
                          </View>
                          <View style={[$.perfBox, $.perfBoxSkeleton]}>
                            <View style={$.skeletonIcon} />
                            <View style={$.skeletonValLine} />
                            <View style={$.skeletonLabelLine} />
                          </View>
                        </>
                      )}
                    </View>
                  </View>
                );
              })()}
            </View>
          </View>
        </Animated.View>

      </ScrollView>

      {/* ═══ HOME LOCATION SETUP MODAL ═══ */}
      <Modal
        visible={showHomeSetup}
        transparent
        animationType="fade"
        onRequestClose={() => !homeSetupLoading && setShowHomeSetup(false)}
      >
        <View style={hs.overlay}>
          <View style={[hs.sheet, isDark && { backgroundColor: colors.dark.elevated }]}>
            {homeSetupDone ? (
              <LinearGradient
                colors={['#22c55e', '#16a34a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={hs.successWrap}
              >
                <View style={hs.successIconWrap}>
                  <Ionicons name="checkmark-circle" size={56} color={colors.white} />
                </View>
                <Text style={hs.successTitle}>Home location saved!</Text>
                <Text style={hs.successSub}>You'll now get faster weather and incident data for your area.</Text>
              </LinearGradient>
            ) : (
              <>
                <LinearGradient
                  colors={heroGrad}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={hs.header}
                >
                  <View style={hs.iconWrap}>
                    <Ionicons name="home" size={28} color={colors.white} />
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
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <>
                          <Ionicons name="locate" size={18} color={colors.white} />
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
                    <Text style={[hs.skipText, isDark && { color: colors.slate[400] }]}>Skip for now</Text>
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

  /* ── loading ── */
  loadSpinnerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadText: { fontSize: 13, fontWeight: '600', marginTop: 12 },

  /* ── header ── */
  header: {
    paddingHorizontal: 22,
    paddingBottom: 48,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
  },
  greetSub: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.60)',
    marginBottom: 2,
  },
  greetName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  /* frosted stats pill */
  statPill: {
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    marginTop: 18,
  },
  statItem: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  statSep: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
  },
  statVal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 3,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  /* wave transition */
  waveWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 32,
  },
  waveBack: {
    position: 'absolute',
    bottom: 0,
    left: -8,
    right: -8,
    height: 32,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  },
  waveFront: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 22,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },

  /* ── status strip ── */
  strip: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    marginTop: -4,
    marginBottom: CARD_GAP,
  },
  stripCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  stripDot: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stripCount: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  stripLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  /* ── assignment card ── */
  assignShadow: {
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  assignCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  assignCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 16,
  },
  assignCardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.brand[500] + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  assignCardTitle: { fontSize: 15, fontWeight: '800' },
  assignCardSub:   { fontSize: 11, fontWeight: '500', marginTop: 1 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  assignDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 20 },
  assignRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  assignKey: { fontSize: 13, fontWeight: '500', minWidth: 72, marginRight: 8 },
  assignVal: { fontSize: 13, fontWeight: '600', textAlign: 'right', flex: 1 },
  assignValRow: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  assignRowRight: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' },
  sevPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sevPillText: { fontSize: 11, fontWeight: '700' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 8,
  },
  statusPillText: { fontSize: 10, fontWeight: '700', marginLeft: 4 },
  assignBtns: { flexDirection: 'row', alignItems: 'center' },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 6,
  },
  viewBtnText: { fontSize: 11, fontWeight: '600', marginRight: 3 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  /* no-assignment empty state */
  noAssignBody: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingBottom: 32,
  },
  noAssignIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  noAssignTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  noAssignText:  { fontSize: 13, fontWeight: '500' },

  /* ── weather card ── */
  wxShadow: {
    borderRadius: 20,
    shadowColor: '#4A6CF7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  wxCard: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  wxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingBottom: 10,
  },
  wxLeft: { flexDirection: 'row', alignItems: 'center' },
  wxIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  wxTitle: { fontSize: 15, fontWeight: '800', color: '#fff' },
  wxCity:  { fontSize: 11, fontWeight: '500', color: 'rgba(255,255,255,0.60)', marginLeft: 3 },
  wxBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  wxBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.4 },
  wxMain: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  wxTemp: { fontSize: 48, fontWeight: '800', letterSpacing: -1, color: '#fff', marginRight: 10 },
  wxDesc: { fontSize: 14, fontWeight: '500', flex: 1, color: 'rgba(255,255,255,0.70)' },
  wxStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 14,
  },
  wxStat: { flex: 1, alignItems: 'center' },
  wxStatDiv: { width: 1, alignSelf: 'stretch' },
  wxStatVal: { fontSize: 14, fontWeight: '700', color: '#fff', marginTop: 3, marginBottom: 2 },
  wxStatLbl: { fontSize: 10, fontWeight: '500', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.3 },

  /* ── quick action cards ── */
  actionShadow: {
    flex: 1,
    borderRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
    marginRight: CARD_GAP,
  },
  actionCard: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  actionGrad: {
    padding: 20,
  },
  actionIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionTitle: { fontSize: 15, fontWeight: '800', color: '#fff', marginBottom: 4 },
  actionSub:   { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.70)' },

  /* ── section cards (Recent / Performance) ── */
  cardShadow: {
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 3,
  },
  sectionCard: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 14,
  },
  sectionLeft: { flexDirection: 'row', alignItems: 'center' },
  sectionIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  sectionSub:   { fontSize: 11, fontWeight: '500', marginTop: 2 },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.brand[500] + '30',
  },
  viewAllText: { fontSize: 12, fontWeight: '700', marginRight: 3 },

  /* recent incident rows */
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  recentRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  recentRowBody: { flex: 1, marginRight: 8 },
  recentRowTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  recentRowMeta: { flexDirection: 'row', alignItems: 'center' },
  recentStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 6,
  },
  recentStatusPillText: { fontSize: 9, fontWeight: '700', marginLeft: 3 },
  recentRowDate: { fontSize: 11, fontWeight: '500' },
  recentRowBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  recentRowBadgeText: { fontSize: 11, fontWeight: '700' },
  rowDivider: { height: StyleSheet.hairlineWidth, marginHorizontal: 20 },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  emptyText: { fontSize: 13, fontWeight: '500', marginLeft: 10 },

  /* ── team card ── */
  leaderBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 8, backgroundColor: '#F59E0B18',
  },
  leaderBadgeText: { fontSize: 10, fontWeight: '700', color: '#F59E0B' },
  teamList: { paddingBottom: 8 },
  teamRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12, gap: 12,
  },
  teamAvatar: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  teamAvatarText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  teamMemberName: { fontSize: 13, fontWeight: '700' },
  teamLeaderPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    marginTop: 3,
  },
  teamLeaderPillText: { fontSize: 10, fontWeight: '600', color: '#F59E0B' },

  /* performance grid */
  perfGrid: {
    padding: 14,
    paddingTop: 0,
  },
  perfRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  perfBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
    borderRadius: 14,
  },
  perfBoxSkeleton: {
    backgroundColor: 'rgba(150,150,150,0.10)',
  },
  skeletonIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(150,150,150,0.18)',
    marginBottom: 8,
  },
  skeletonValLine: {
    width: 44,
    height: 16,
    borderRadius: 6,
    backgroundColor: 'rgba(150,150,150,0.18)',
    marginBottom: 6,
    marginTop: 6,
  },
  skeletonLabelLine: {
    width: 64,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(150,150,150,0.12)',
  },
  perfBoxIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  perfBoxVal:   { fontSize: 26, fontWeight: '800', letterSpacing: -0.8, marginTop: 8 },
  perfBoxLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4, textAlign: 'center' },
});

const hs = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 20,
  },
  header: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 28,
    paddingHorizontal: 24,
    gap: 10,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 18,
  },
  body: {
    padding: 20,
    gap: 10,
  },
  primaryBtn: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  primaryBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate[500],
  },
  successWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 12,
  },
  successIconWrap: {
    marginBottom: 4,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  successSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 18,
  },
});
