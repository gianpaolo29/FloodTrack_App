import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import { getAssignedIncidents, submitMemberStatus, getMyTeam } from '@/services/api';
import { useETA } from '@/hooks/use-eta';
import { cacheIncidents, getCachedIncidents } from '@/services/offline';
import { socketService } from '@/services/socket';
import { onNotificationReceived } from '@/services/notifications';
import type { Incident, MemberStatus, ResponderStatus, Severity, Team } from '@/types';

/* ─── Constants ─── */
const H_PAD = 20;
const STATUS_ORDER: ResponderStatus[] = ['on_scene', 'en_route', 'pending', 'resolved'];
const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'moderate', 'low'];

const STATUS_LABELS: Record<ResponderStatus, string> = {
  pending: 'Pending',
  en_route: 'En route',
  on_scene: 'On scene',
  resolved: 'Resolved',
};

const STATUS_COLORS: Record<ResponderStatus, string> = {
  pending: '#F59E0B',
  en_route: colors.brand[500],
  on_scene: '#10B981',
  resolved: colors.slate[400],
};

const SEV_COLORS: Record<Severity, string> = {
  critical: colors.severity.critical,
  high: colors.severity.high,
  moderate: colors.severity.moderate,
  low: colors.severity.low,
};

const SEV_LABELS: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  moderate: 'Medium',
  low: 'Low',
};

type FilterTab = 'all' | 'pending' | 'en_route' | 'on_scene' | 'resolved';

function sortIncidents(list: Incident[]): Incident[] {
  return [...list].sort((a, b) => {
    const sDiff = STATUS_ORDER.indexOf(a.responderStatus) - STATUS_ORDER.indexOf(b.responderStatus);
    if (sDiff !== 0) return sDiff;
    return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
  });
}


/* ─── Incident Card with ETA ─── */
function IncidentCard({
  incident,
  isDark,
  cardBg,
  cardBorder,
  textPrimary,
  textSecondary,
  onPress,
  onAction,
  updatingId,
}: {
  incident: Incident;
  isDark: boolean;
  cardBg: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  onPress: () => void;
  onAction: (id: string, status: ResponderStatus) => void;
  updatingId: string | null;
}) {
  const sevColor = SEV_COLORS[incident.severity];
  const statusColor = STATUS_COLORS[incident.responderStatus];
  const isUpdating = updatingId === incident.id;

  const { eta, distanceKm } = useETA(
    incident.latitude,
    incident.longitude,
    incident.responderStatus !== 'resolved',
  );

  const next =
    incident.responderStatus === 'pending'
      ? { status: 'en_route' as ResponderStatus, label: 'Navigate', icon: 'navigate' as keyof typeof Ionicons.glyphMap, color: colors.brand[500] }
      : incident.responderStatus === 'en_route'
        ? { status: 'on_scene' as ResponderStatus, label: 'Arrived', icon: 'location' as keyof typeof Ionicons.glyphMap, color: '#10B981' }
        : incident.responderStatus === 'on_scene'
          ? { status: 'resolved' as ResponderStatus, label: 'Resolve', icon: 'shield-checkmark' as keyof typeof Ionicons.glyphMap, color: '#10B981' }
          : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        $.card,
        { backgroundColor: cardBg, borderColor: cardBorder },
        pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] },
      ]}
    >
      {/* Severity left bar */}
      <View style={[$.severityBar, { backgroundColor: sevColor }]} />

      <View style={$.cardInner}>
        {/* Top row: title + chevron */}
        <View style={$.cardTopRow}>
          <Text style={[$.cardTitle, { color: textPrimary }]} numberOfLines={1}>
            {incident.title}
          </Text>
          <View style={[$.chevronWrap, isDark && { backgroundColor: colors.dark.border }]}>
            <Ionicons name="chevron-forward" size={13} color={isDark ? colors.slate[400] : colors.slate[500]} />
          </View>
        </View>

        {/* Location */}
        <View style={$.metaItem}>
          <Ionicons name="location-outline" size={12} color={colors.slate[400]} />
          <Text style={[$.metaText, { color: isDark ? colors.slate[400] : colors.slate[500] }]} numberOfLines={1}>
            {incident.address}
          </Text>
        </View>

        {/* Chips: severity + status + ETA */}
        <View style={$.cardChips}>
          <View style={[$.sevChip, { backgroundColor: sevColor + '18' }]}>
            <View style={[$.sevDot, { backgroundColor: sevColor }]} />
            <Text style={[$.sevChipText, { color: sevColor }]}>{SEV_LABELS[incident.severity]}</Text>
          </View>
          <View style={[$.statusChip, { backgroundColor: statusColor + '18' }]}>
            <View style={[$.sevDot, { backgroundColor: statusColor }]} />
            <Text style={[$.sevChipText, { color: statusColor }]}>{STATUS_LABELS[incident.responderStatus]}</Text>
          </View>
          {eta && (
            <View style={[$.etaChip, { backgroundColor: isDark ? colors.dark.elevated : colors.slate[100] }]}>
              <Ionicons name="time-outline" size={10} color={textSecondary} />
              <Text style={[$.sevChipText, { color: textSecondary }]}>{eta}</Text>
            </View>
          )}
        </View>

        {/* Footer: ref + time + action */}
        <View style={[$.cardFooter, isDark && { borderTopColor: colors.dark.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[$.cardRef, { color: isDark ? colors.slate[500] : colors.slate[400] }]}>
              #{incident.reference} · {incident.reportedAt}
              {distanceKm !== null ? ` · ${distanceKm} km` : ''}
            </Text>
          </View>
          {next && incident.responderStatus !== 'resolved' && (
            <Pressable
              onPress={() => !isUpdating && onAction(incident.id, next.status)}
              disabled={isUpdating}
              style={({ pressed }) => [
                $.cardActionBtn,
                { backgroundColor: next.color },
                pressed && { opacity: 0.88 },
                isUpdating && { opacity: 0.6 },
              ]}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name={next.icon} size={12} color="#fff" />
                  <Text style={$.cardActionText}>{next.label}</Text>
                </>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/* ═══ Main ═══ */
export default function AssignmentsTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { token, user } = useAuth();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  /* Theme */
  const bg = isDark ? colors.dark.bg : '#F2F4F7';
  const cardBg = isDark ? colors.dark.card : colors.white;
  const cardBorder = isDark ? colors.dark.border : 'rgba(0,0,0,0.05)';
  const textPrimary = isDark ? colors.dark.text : colors.slate[900];
  const textSecondary = isDark ? colors.dark.subtext : colors.slate[500];

  /* Animation */
  const fadeIn = useRef(new Animated.Value(0)).current;
  const animated = useRef(false);
  useEffect(() => {
    if (loading || animated.current) return;
    animated.current = true;
    Animated.timing(fadeIn, {
      toValue: 1, duration: 480,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [loading]);

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    try {
      if (!isRefresh) setLoading(true);
      const data = await getAssignedIncidents(token);
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

  const loadTeam = useCallback(async () => {
    if (!token) return;
    try { setTeam(await getMyTeam(token)); } catch {}
  }, [token]);

  useEffect(() => { load(); loadTeam(); }, [load, loadTeam]);

  useEffect(() => {
    const onNew = () => load(true);
    const lid1 = socketService.on('new-notification', onNew);
    const lid2 = socketService.on('new-assignment', onNew);
    const lid3 = socketService.on('report-status', onNew);
    const lid4 = socketService.on('new-alert', onNew);
    const lid5 = socketService.on('member-status-updated', onNew);
    const pushSub = onNotificationReceived(() => onNew());
    return () => {
      socketService.off(lid1);
      socketService.off(lid2);
      socketService.off(lid3);
      socketService.off(lid4);
      socketService.off(lid5);
      pushSub?.remove();
    };
  }, [load]);

  const handleStatusUpdate = useCallback(async (incidentId: string, newStatus: ResponderStatus) => {
    if (!token) return;
    setUpdatingId(incidentId);
    try {
      await submitMemberStatus({ incidentId, status: newStatus }, token);
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
      // Refresh from server
      load(true);
    } catch {}
    finally { setUpdatingId(null); }
  }, [token, user, load]);

  /* Filter to user's team assignments */
  const teamIncidents = user?.isLeader
    ? incidents
    : incidents.filter(i =>
        (user?.teamId && i.teamId === user.teamId) ||
        (i.memberStatuses ?? []).some(m => m.userId === user?.id) ||
        !i.teamId,
      );

  /* Counts */
  const pendingCount  = teamIncidents.filter(i => i.responderStatus === 'pending').length;
  const enRouteCount  = teamIncidents.filter(i => i.responderStatus === 'en_route').length;
  const onSceneCount  = teamIncidents.filter(i => i.responderStatus === 'on_scene').length;
  const resolvedCount = teamIncidents.filter(i => i.responderStatus === 'resolved').length;

  const enRouteIncident = teamIncidents.find(i => i.responderStatus === 'en_route');

  const filtered = sortIncidents(
    filter === 'pending'   ? teamIncidents.filter(i => i.responderStatus === 'pending')
    : filter === 'en_route'  ? teamIncidents.filter(i => i.responderStatus === 'en_route')
    : filter === 'on_scene'  ? teamIncidents.filter(i => i.responderStatus === 'on_scene')
    : filter === 'resolved'  ? teamIncidents.filter(i => i.responderStatus === 'resolved')
    : teamIncidents,
  );

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all',      label: 'All',      count: teamIncidents.length },
    { key: 'pending',  label: 'Pending',  count: pendingCount },
    { key: 'en_route', label: 'En route', count: enRouteCount },
    { key: 'on_scene', label: 'On scene', count: onSceneCount },
    { key: 'resolved', label: 'Resolved', count: resolvedCount },
  ];

  return (
    <View style={[$.root, { backgroundColor: bg }]}>

      {/* ── Header ── */}
      <LinearGradient
        colors={colors.gradients.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[$.headerGradient, { paddingTop: insets.top + 16 }]}
      >
        <View style={[$.orb, { width: 180, height: 180, top: -70, right: -50 }]} />
        <View style={[$.orb, { width: 110, height: 110, bottom: 0, left: -30, backgroundColor: colors.overlay.whiteSubtle }]} />
        <Text style={$.headerTitle}>Assigned</Text>
      </LinearGradient>
      <View style={[$.waveWrap, { backgroundColor: bg }]}>
        <LinearGradient colors={colors.gradients.wave} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
        <View style={[$.waveShape, { backgroundColor: bg }]} />
      </View>

      {/* ── Filter tabs ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={$.tabRow}
        style={{ flexGrow: 0 }}
      >
        {tabs.map(t => {
          const isActive = filter === t.key;
          return (
            <Pressable
              key={t.key}
              onPress={() => setFilter(t.key)}
              style={({ pressed }) => [
                $.tab,
                isActive
                  ? { backgroundColor: colors.brand[500] }
                  : { backgroundColor: isDark ? colors.dark.card : colors.white, borderColor: isDark ? colors.dark.border : colors.slate[200] },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={[$.tabText, { color: isActive ? '#fff' : textSecondary }]}>
                {t.label}
              </Text>
              {t.count > 0 && (
                <View style={[$.tabCount, { backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : (isDark ? colors.dark.elevated : colors.slate[100]) }]}>
                  <Text style={[$.tabCountText, { color: isActive ? '#fff' : textSecondary }]}>{t.count}</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── En route banner ── */}
      {enRouteIncident && filter !== 'en_route' && (
        <Pressable
          onPress={() => router.push(`/responder/incident/${enRouteIncident.id}` as never)}
          style={[$.banner, { backgroundColor: isDark ? colors.brand[500] + '18' : colors.brand[50], borderColor: isDark ? colors.brand[500] + '30' : colors.brand[200] }]}
        >
          <Ionicons name="navigate" size={14} color={colors.brand[500]} />
          <Text style={[$.bannerText, { color: isDark ? colors.brand[300] : colors.brand[700] }]} numberOfLines={2}>
            You are en route to #{enRouteIncident.reference}. Starting another incident hands that one back to Dispatch.
          </Text>
        </Pressable>
      )}

      {/* ── List ── */}
      {loading ? (
        <View style={$.centered}>
          <ActivityIndicator size="large" color={colors.brand[500]} />
          <Text style={[$.loadText, { color: textSecondary }]}>Loading assignments…</Text>
        </View>
      ) : (
        <Animated.View style={{ flex: 1, opacity: fadeIn }}>
          <ScrollView
            contentContainerStyle={{ paddingHorizontal: H_PAD, paddingTop: 8, paddingBottom: insets.bottom + 24, gap: 12 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); load(true); }}
                tintColor={colors.brand[500]}
                colors={[colors.brand[500]]}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {filtered.length === 0 ? (
              <View style={$.empty}>
                <View style={[$.emptyIcon, { backgroundColor: colors.brand[500] + '15' }]}>
                  <Ionicons name="shield-outline" size={32} color={colors.brand[500]} />
                </View>
                <Text style={[$.emptyTitle, { color: textPrimary }]}>All clear</Text>
                <Text style={[$.emptySub, { color: textSecondary }]}>
                  Nothing else {filter === 'all' ? 'active' : filter.replace('_', ' ')} for {team?.name ?? 'your team'}.
                </Text>
              </View>
            ) : (
              <>
                {filtered.map(inc => (
                  <IncidentCard
                    key={inc.id}
                    incident={inc}
                    isDark={isDark}
                    cardBg={cardBg}
                    cardBorder={cardBorder}
                    textPrimary={textPrimary}
                    textSecondary={textSecondary}
                    onPress={() => router.push(`/responder/incident/${inc.id}` as never)}
                    onAction={handleStatusUpdate}
                    updatingId={updatingId}

                  />
                ))}
                {/* Footer message */}
                {filtered.length > 0 && filter === 'pending' && pendingCount === filtered.length && (
                  <Text style={[$.footerMsg, { color: textSecondary }]}>
                    Nothing else pending for {team?.name ?? 'your team'}.
                  </Text>
                )}
              </>
            )}
          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

const $ = StyleSheet.create({
  root: { flex: 1 },

  /* Header */
  headerGradient: { paddingHorizontal: 22, paddingBottom: 28, overflow: 'hidden' },
  orb: { position: 'absolute', borderRadius: 999, backgroundColor: colors.overlay.whiteThin },
  waveWrap: { height: 16, position: 'relative', marginTop: -1 },
  waveShape: { position: 'absolute', bottom: 0, left: -12, right: -12, height: 20, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: colors.white, letterSpacing: -0.3 },

  /* Tabs — matches resident */
  tabRow: { paddingHorizontal: H_PAD, gap: 6, paddingBottom: 10 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 22, borderWidth: 1, borderColor: 'transparent',
  },
  tabText: { fontSize: 12, fontWeight: '700' },
  tabCount: {
    minWidth: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  tabCountText: { fontSize: 9, fontWeight: '800' },

  /* Banner */
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginHorizontal: H_PAD, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 12, borderWidth: 1,
  },
  bannerText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 17 },

  /* Card */
  card: {
    borderRadius: 18, overflow: 'hidden', borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  severityBar: {
    position: 'absolute', left: 0, top: 14, bottom: 14, width: 4,
    borderTopRightRadius: 4, borderBottomRightRadius: 4,
  },
  cardInner: { paddingLeft: 18, paddingRight: 16, paddingVertical: 16 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  chevronWrap: {
    width: 26, height: 26, borderRadius: 9,
    backgroundColor: colors.slate[100],
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', flex: 1, letterSpacing: -0.2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 10 },
  metaText: { fontSize: 12, fontWeight: '500', flex: 1 },
  cardChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  sevChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8,
  },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8,
  },
  etaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  sevDot: { width: 5, height: 5, borderRadius: 3 },
  sevChipText: { fontSize: 10, fontWeight: '700' },
  cardFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.slate[100],
  },
  cardRef: { fontSize: 11, fontWeight: '500' },
  cardActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  cardActionText: { fontSize: 11, fontWeight: '800', color: '#fff' },

  /* Empty */
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadText: { fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '800' },
  emptySub: { fontSize: 13, fontWeight: '500', textAlign: 'center', paddingHorizontal: 32 },

  /* Footer */
  footerMsg: { fontSize: 13, fontWeight: '500', textAlign: 'center', paddingVertical: 16 },
});
