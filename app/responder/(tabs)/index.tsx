/**
 * Incidents tab — premium responder dashboard
 * Gradient header · summary stat tiles · glass-morphism cards · smooth transitions
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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

import { colors } from '@/theme/colors';
import { SeverityChip } from '@/components/SeverityChip';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getAssignedIncidents } from '@/services/api';
import type { Incident, ResponderStatus } from '@/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const RESPONDER_STATUS_LABELS: Record<ResponderStatus, string> = {
  pending:  'Not started',
  en_route: 'En route',
  on_scene: 'On scene',
  resolved: 'Resolved',
};

const RESPONDER_STATUS_COLORS: Record<ResponderStatus, string> = {
  pending:  colors.slate[400],
  en_route: colors.brand[500],
  on_scene: colors.accent[500],
  resolved: colors.severity.low,
};

const RESPONDER_STATUS_ICONS: Record<ResponderStatus, keyof typeof Ionicons.glyphMap> = {
  pending:  'time-outline',
  en_route: 'car-outline',
  on_scene: 'location-outline',
  resolved: 'checkmark-circle-outline',
};

type FilterKey = 'all' | 'pending' | 'en_route' | 'on_scene' | 'resolved';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'pending',  label: 'Pending' },
  { key: 'en_route', label: 'En route' },
  { key: 'on_scene', label: 'On scene' },
  { key: 'resolved', label: 'Resolved' },
];

// ─── Animated pulse dot for critical ─────────────────────────────────────────

function CriticalPulse() {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale,   { toValue: 1.6, duration: 800, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 1,   duration: 800, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0,   duration: 800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        width: 10, height: 10, borderRadius: 5,
        backgroundColor: colors.severity.critical,
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

function StatTile({
  value, label, icon, color, isDark,
}: {
  value: number;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  isDark: boolean;
}) {
  return (
    <View style={[s.statTile, isDark && { backgroundColor: colors.dark.card }]}>
      <View style={[s.statIconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[s.statValue, isDark && { color: colors.white }]}>{value}</Text>
      <Text style={[s.statLabel, isDark && { color: colors.slate[500] }]}>{label}</Text>
    </View>
  );
}

// ─── Incident card — premium redesign ─────────────────────────────────────────

function IncidentCard({
  incident, onPress, isDark,
}: {
  incident: Incident;
  onPress: () => void;
  isDark: boolean;
}) {
  const statusColor = RESPONDER_STATUS_COLORS[incident.responderStatus];
  const statusIcon  = RESPONDER_STATUS_ICONS[incident.responderStatus];
  const isCritical  = incident.severity === 'critical';
  const sevColor    = colors.severity[incident.severity];
  const cardBg      = isDark ? colors.dark.card : colors.white;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        { backgroundColor: cardBg },
        isCritical && { borderWidth: 1, borderColor: colors.severity.critical + '30' },
        pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${incident.title}, ${incident.severity} severity`}
    >
      {/* Severity accent bar */}
      <View style={[s.cardAccent, { backgroundColor: sevColor }]} />

      <View style={s.cardBody}>
        {/* Top: ref + severity chip + distance */}
        <View style={s.cardTopRow}>
          <View style={s.cardRefWrap}>
            <View style={[s.cardRefDot, { backgroundColor: sevColor }]} />
            <Text style={[s.cardRef, isDark && { color: colors.slate[500] }]}>
              {incident.reference}
            </Text>
          </View>
          {incident.distance ? (
            <View style={[s.distPill, isDark && { backgroundColor: colors.dark.elevated }]}>
              <Ionicons name="navigate" size={10} color={colors.accent[500]} />
              <Text style={[s.distText, { color: colors.accent[500] }]}>{incident.distance}</Text>
            </View>
          ) : null}
        </View>

        {/* Title */}
        <Text style={[s.cardTitle, isDark && { color: colors.white }]} numberOfLines={2}>
          {incident.title}
        </Text>

        {/* Address */}
        <View style={s.cardMeta}>
          <Ionicons name="location" size={12} color={isDark ? colors.slate[500] : colors.slate[400]} />
          <Text style={[s.cardMetaText, isDark && { color: colors.slate[500] }]} numberOfLines={1}>
            {incident.address}
          </Text>
        </View>

        {/* Chips row */}
        <View style={s.cardChips}>
          <SeverityChip level={incident.severity} size="sm" />
          {incident.nearbyCount > 1 && (
            <View style={[s.nearbyPill, isDark && { backgroundColor: colors.severity.moderate + '14' }]}>
              <Ionicons name="warning" size={10} color={colors.severity.moderate} />
              <Text style={s.nearbyText}>{incident.nearbyCount} nearby</Text>
            </View>
          )}
        </View>

        {/* Footer: status + time */}
        <View style={[s.cardFooter, isDark && { borderTopColor: colors.dark.border }]}>
          <View style={[s.statusPill, { backgroundColor: statusColor + '14' }]}>
            <Ionicons name={statusIcon} size={12} color={statusColor} />
            <Text style={[s.statusText, { color: statusColor }]}>
              {RESPONDER_STATUS_LABELS[incident.responderStatus]}
            </Text>
          </View>
          <View style={s.timeRow}>
            <Ionicons name="time-outline" size={11} color={isDark ? colors.slate[600] : colors.slate[400]} />
            <Text style={[s.timeText, isDark && { color: colors.slate[600] }]}>
              {incident.reportedAt}
            </Text>
          </View>
        </View>
      </View>

      {/* Critical pulse indicator */}
      {isCritical && (
        <View style={s.critIndicator}>
          <CriticalPulse />
          <View style={s.critDot} />
        </View>
      )}
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function IncidentsTab() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const scheme   = useColorScheme();
  const isDark   = scheme === 'dark';
  const { token, user } = useAuth();

  const [incidents, setIncidents]     = useState<Incident[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const screenBg = isDark ? colors.dark.bg : '#F4F6F9';
  const headerBg = isDark ? colors.dark.surface : colors.accent[700];

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      const data = await getAssignedIncidents(token!);
      setIncidents(data);
    } catch {
      setError('Could not load incidents. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const active   = incidents.filter(i => i.responderStatus !== 'resolved');
  const resolved = incidents.filter(i => i.responderStatus === 'resolved');

  const filtered = activeFilter === 'all'
    ? incidents
    : incidents.filter(i => i.responderStatus === activeFilter);

  const pendingCount  = incidents.filter(i => i.responderStatus === 'pending').length;
  const enRouteCount  = incidents.filter(i => i.responderStatus === 'en_route').length;
  const onSceneCount  = incidents.filter(i => i.responderStatus === 'on_scene').length;
  const criticalCount = active.filter(i => i.severity === 'critical').length;

  const firstName = user?.firstName ?? 'Responder';

  return (
    <View style={[s.root, { backgroundColor: screenBg }]}>

      {/* ── Premium header ── */}
      <View style={[s.header, { paddingTop: insets.top + 8, backgroundColor: headerBg }]}>
        <View style={s.headerTop}>
          <View style={s.headerLeft}>
            <View style={s.headerAvatarWrap}>
              <View style={s.headerAvatar}>
                <Text style={s.headerAvatarText}>
                  {user ? `${user.firstName[0]}${user.lastName[0]}` : 'R'}
                </Text>
              </View>
              <View style={s.onlineDot} />
            </View>
            <View>
              <Text style={s.headerGreeting}>Welcome back,</Text>
              <Text style={s.headerName}>{firstName}</Text>
            </View>
          </View>
          <View style={s.headerRight}>
            <View style={[s.rolePill, { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.3)' }]}>
              <Ionicons name="shield-checkmark" size={11} color="rgba(255,255,255,0.9)" />
              <Text style={s.rolePillText}>Responder</Text>
            </View>
          </View>
        </View>

        {/* Summary line */}
        <Text style={s.headerSummary}>
          {loading ? 'Loading...' : `${active.length} active incident${active.length !== 1 ? 's' : ''} assigned to you`}
        </Text>

        {/* Curved bottom */}
        <View style={[s.headerCurve, { backgroundColor: screenBg }]} />
      </View>

      {/* ── Stat tiles ── */}
      <View style={s.statsRow}>
        <StatTile value={pendingCount}  label="Pending"  icon="time-outline"     color={colors.slate[400]}  isDark={isDark} />
        <StatTile value={enRouteCount}  label="En route" icon="car-outline"      color={colors.brand[500]}  isDark={isDark} />
        <StatTile value={onSceneCount}  label="On scene" icon="location-outline" color={colors.accent[500]} isDark={isDark} />
        <StatTile value={criticalCount} label="Critical" icon="alert-circle"     color={colors.severity.critical} isDark={isDark} />
      </View>

      {/* ── Filter chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterScroll}
        style={s.filterRow}
      >
        {FILTERS.map(f => {
          const isActive = activeFilter === f.key;
          const count = f.key === 'all'
            ? incidents.length
            : incidents.filter(i => i.responderStatus === f.key).length;
          return (
            <Pressable
              key={f.key}
              onPress={() => setActiveFilter(f.key)}
              style={[
                s.filterChip,
                isActive
                  ? { backgroundColor: colors.accent[500] }
                  : { backgroundColor: isDark ? colors.dark.card : colors.white, borderWidth: 1, borderColor: isDark ? colors.dark.border : colors.slate[200] },
              ]}
            >
              <Text style={[
                s.filterLabel,
                { color: isActive ? colors.white : isDark ? colors.slate[300] : colors.slate[600] },
              ]}>
                {f.label}
              </Text>
              <View style={[
                s.filterCount,
                { backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : isDark ? colors.dark.elevated : colors.slate[100] },
              ]}>
                <Text style={[
                  s.filterCountText,
                  { color: isActive ? colors.white : isDark ? colors.slate[400] : colors.slate[500] },
                ]}>
                  {count}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Loading ── */}
      {loading && (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.accent[500]} />
        </View>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <View style={s.centered}>
          <View style={[s.errorIconWrap, isDark && { backgroundColor: colors.dark.card }]}>
            <Ionicons name="cloud-offline-outline" size={36} color={colors.slate[400]} />
          </View>
          <Text style={[s.errorTitle, isDark && { color: colors.white }]}>Connection issue</Text>
          <Text style={[s.errorBody, isDark && { color: colors.slate[400] }]}>{error}</Text>
          <Pressable onPress={() => load()} style={s.retryBtn} accessibilityRole="button">
            <Ionicons name="refresh" size={15} color={colors.white} />
            <Text style={s.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {/* ── Incident list ── */}
      {!loading && !error && (
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 100 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={colors.accent[500]}
              colors={[colors.accent[500]]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Critical priority banner */}
          {criticalCount > 0 && activeFilter !== 'resolved' && (
            <View style={[s.critBanner, isDark && { backgroundColor: colors.severity.critical + '18', borderColor: colors.severity.critical + '40' }]}>
              <View style={s.critBannerIcon}>
                <Ionicons name="alert-circle" size={16} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.critBannerTitle}>Immediate response required</Text>
                <Text style={s.critBannerSub}>
                  {criticalCount} critical incident{criticalCount !== 1 ? 's' : ''} need attention
                </Text>
              </View>
            </View>
          )}

          {filtered.length > 0 ? (
            <View style={s.section}>
              {filtered.map(i => (
                <IncidentCard
                  key={i.id}
                  incident={i}
                  isDark={isDark}
                  onPress={() => router.push(`/responder/incident/${i.id}`)}
                />
              ))}
            </View>
          ) : (
            <View style={s.emptyState}>
              <View style={[s.emptyIconWrap, isDark && { backgroundColor: colors.dark.card }]}>
                <Ionicons name="checkmark-circle-outline" size={40} color={colors.severity.low} />
              </View>
              <Text style={[s.emptyTitle, isDark && { color: colors.white }]}>
                {activeFilter === 'all' ? 'All clear' : 'No incidents'}
              </Text>
              <Text style={[s.emptySub, isDark && { color: colors.slate[400] }]}>
                {activeFilter === 'all'
                  ? 'No incidents are currently assigned to you.'
                  : `No ${activeFilter.replace('_', ' ')} incidents at the moment.`
                }
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },

  // ── Header ──
  header: { paddingHorizontal: 20, paddingBottom: 40, position: 'relative' },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerAvatarWrap: { position: 'relative' },
  headerAvatar: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
  },
  headerAvatarText: { fontSize: 16, fontWeight: '800', color: colors.white },
  onlineDot: {
    position: 'absolute', bottom: -1, right: -1,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.severity.low,
    borderWidth: 2.5, borderColor: colors.accent[700],
  },
  headerGreeting: { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  headerName: { fontSize: 20, fontWeight: '800', color: colors.white, letterSpacing: -0.3 },
  rolePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1,
  },
  rolePillText: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  headerSummary: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  headerCurve: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },

  // ── Stats ──
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: -8 },
  statTile: {
    flex: 1, backgroundColor: colors.white,
    borderRadius: 14, padding: 12, alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  statIconWrap: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.slate[900] },
  statLabel: { fontSize: 9, fontWeight: '600', color: colors.slate[400], textTransform: 'uppercase', letterSpacing: 0.3 },

  // ── Filter chips ──
  filterRow: { marginTop: 12 },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  filterLabel: { fontSize: 13, fontWeight: '600' },
  filterCount: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  filterCountText: { fontSize: 10, fontWeight: '700' },

  // ── Scroll ──
  scroll: { padding: 16, gap: 12, paddingTop: 12 },

  // ── Critical banner ──
  critBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.severity.critical + '0E',
    borderWidth: 1, borderColor: colors.severity.critical + '30',
    borderRadius: 16, padding: 14,
  },
  critBannerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.severity.critical,
    alignItems: 'center', justifyContent: 'center',
  },
  critBannerTitle: { fontSize: 14, fontWeight: '700', color: colors.severity.critical },
  critBannerSub: { fontSize: 12, color: colors.severity.critical, opacity: 0.75, marginTop: 1 },

  // ── Section ──
  section: { gap: 10 },

  // ── Card ──
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  cardAccent: { width: 4 },
  cardBody:   { flex: 1, padding: 16, gap: 10 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardRefWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardRefDot: { width: 6, height: 6, borderRadius: 3 },
  cardRef:    { fontSize: 11, color: colors.slate[400], fontWeight: '600', letterSpacing: 0.3 },
  distPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.accent[100],
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  distText:  { fontSize: 10, fontWeight: '700' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.slate[900], lineHeight: 21 },
  cardMeta:  { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardMetaText: { fontSize: 12, color: colors.slate[500], flex: 1 },
  cardChips: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  nearbyPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.severity.moderate + '18',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  nearbyText: { fontSize: 10, color: colors.severity.moderate, fontWeight: '700' },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: colors.slate[100], paddingTop: 10,
  },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  timeRow:    { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeText:   { fontSize: 11, color: colors.slate[400] },

  // Critical indicator
  critIndicator: {
    position: 'absolute', top: 14, right: 14,
    width: 10, height: 10, alignItems: 'center', justifyContent: 'center',
  },
  critDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.severity.critical,
  },

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
    backgroundColor: colors.accent[500],
    paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, marginTop: 4,
  },
  retryText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  // ── Empty ──
  emptyState: { alignItems: 'center', gap: 16, paddingTop: 40 },
  emptyIconWrap: {
    width: 88, height: 88, borderRadius: 28,
    backgroundColor: colors.slate[100],
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.slate[900] },
  emptySub: { fontSize: 14, color: colors.slate[400], textAlign: 'center', lineHeight: 22 },
});
