import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { getAssignedIncidents } from '@/services/api';
import { cacheIncidents, getCachedIncidents } from '@/services/offline';
import type { Incident, ResponderStatus, Severity } from '@/types';

/* ─── Constants ─── */
const STATUS_ORDER: ResponderStatus[] = ['on_scene', 'en_route', 'pending', 'resolved'];
const SEVERITY_ORDER: Severity[]      = ['critical', 'high', 'moderate', 'low'];

const STATUS_LABELS: Record<ResponderStatus, string> = {
  pending:  'Pending',
  en_route: 'En Route',
  on_scene: 'On Scene',
  resolved: 'Resolved',
};

const STATUS_ICONS: Record<ResponderStatus, keyof typeof Ionicons.glyphMap> = {
  pending:  'time-outline',
  en_route: 'car-outline',
  on_scene: 'location-outline',
  resolved: 'checkmark-circle-outline',
};

const STATUS_COLORS: Record<ResponderStatus, string> = {
  pending:  colors.severity.moderate,
  en_route: colors.brand[500],
  on_scene: colors.brand[500],
  resolved: colors.severity.low,
};

const SEVERITY_COLORS: Record<Severity, string> = {
  critical: colors.severity.critical,
  high:     colors.severity.high,
  moderate: colors.severity.moderate,
  low:      colors.severity.low,
};

type FilterStatus = 'all' | 'active' | 'resolved';

function sortIncidents(list: Incident[]): Incident[] {
  return [...list].sort((a, b) => {
    const sDiff = STATUS_ORDER.indexOf(a.responderStatus) - STATUS_ORDER.indexOf(b.responderStatus);
    if (sDiff !== 0) return sDiff;
    return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
  });
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

/* ─── Incident Card ─── */
function IncidentCard({
  incident,
  isDark,
  cardBg,
  cardBorder,
  textPrimary,
  textSecondary,
  onPress,
}: {
  incident: Incident;
  isDark: boolean;
  cardBg: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  onPress: () => void;
}) {
  const sevColor    = SEVERITY_COLORS[incident.severity];
  const statusColor = STATUS_COLORS[incident.responderStatus];
  const isActive    = incident.responderStatus !== 'resolved';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.cardShadow,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.95 },
      ]}
    >
      <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        {/* Severity accent bar */}
        <View style={[s.accentBar, { backgroundColor: sevColor }]} />

        <View style={s.cardInner}>
          {/* Left: severity icon */}
          <View style={[s.sevIcon, { backgroundColor: sevColor + '18' }]}>
            <Ionicons name="water" size={18} color={sevColor} />
          </View>

          {/* Middle: title + meta */}
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[s.cardTitle, { color: textPrimary }]} numberOfLines={1}>
              {incident.title}
            </Text>
            <View style={s.metaRow}>
              <Ionicons name="location-outline" size={11} color={textSecondary} />
              <Text style={[s.metaText, { color: textSecondary }]} numberOfLines={1}>
                {incident.address}
              </Text>
            </View>
            <View style={s.pillRow}>
              {/* Status pill */}
              <View style={[s.pill, { backgroundColor: statusColor + '18' }]}>
                <Ionicons name={STATUS_ICONS[incident.responderStatus]} size={9} color={statusColor} />
                <Text style={[s.pillText, { color: statusColor }]}>
                  {STATUS_LABELS[incident.responderStatus]}
                </Text>
              </View>
              {/* Severity pill */}
              <View style={[s.pill, { backgroundColor: sevColor + '14' }]}>
                <Text style={[s.pillText, { color: sevColor }]}>
                  {incident.severity.charAt(0).toUpperCase() + incident.severity.slice(1)}
                </Text>
              </View>
              <Text style={[s.timeText, { color: textSecondary }]}>{incident.reportedAt}</Text>
            </View>
          </View>

          {/* Right: active dot + chevron */}
          <View style={s.rightCol}>
            {isActive && <View style={[s.activeDot, { backgroundColor: sevColor }]} />}
            <Ionicons name="chevron-forward" size={16} color={isDark ? colors.slate[600] : colors.slate[300]} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/* ─── Main Screen ─── */
export default function AssignmentsTab() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const scheme   = useColorScheme();
  const isDark   = scheme === 'dark';
  const { token } = useAuth();

  const [incidents,  setIncidents]  = useState<Incident[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter,     setFilter]     = useState<FilterStatus>('all');

  const bg           = isDark ? colors.dark.bg    : colors.responder.pageBg;
  const cardBg       = isDark ? colors.dark.card  : colors.white;
  const cardBorder   = isDark ? colors.dark.border : 'rgba(0,0,0,0.05)';
  const textPrimary  = isDark ? colors.white       : colors.slate[900];
  const textSecondary = isDark ? colors.slate[400] : colors.slate[500];

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
    }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  /* Filter + sort */
  const filtered = sortIncidents(
    filter === 'active'
      ? incidents.filter(i => i.responderStatus !== 'resolved')
      : filter === 'resolved'
      ? incidents.filter(i => i.responderStatus === 'resolved')
      : incidents,
  );

  const activeCount   = incidents.filter(i => i.responderStatus !== 'resolved').length;
  const resolvedCount = incidents.filter(i => i.responderStatus === 'resolved').length;
  const criticalCount = incidents.filter(i => i.severity === 'critical' && i.responderStatus !== 'resolved').length;

  const filters: { key: FilterStatus; label: string; count: number }[] = [
    { key: 'all',      label: 'All',      count: incidents.length },
    { key: 'active',   label: 'Active',   count: activeCount },
    { key: 'resolved', label: 'Resolved', count: resolvedCount },
  ];

  return (
    <View style={[s.root, { backgroundColor: bg }]}>

      {/* ── Header ── */}
      <LinearGradient
        colors={isDark
          ? ['#0D1A37', '#070E18', '#07090F']
          : ['#00D2FF', '#4A6CF7', '#7C3AED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.header, { paddingTop: insets.top + 14 }]}
      >
        <View style={[s.orb, { width: 140, height: 140, top: -40, right: -30, opacity: 0.06 }]} />
        <View style={[s.orb, { width: 70, height: 70, bottom: 10, left: -10, opacity: 0.05 }]} />

        <View style={s.headerContent}>
          <View style={s.headerLeft}>
            <View style={s.headerIconWrap}>
              <Ionicons name="list" size={22} color="rgba(255,255,255,0.92)" />
            </View>
            <View>
              <Text style={s.headerTitle}>Assignments</Text>
              <Text style={s.headerSub}>Your incident queue</Text>
            </View>
          </View>
          {criticalCount > 0 && (
            <View style={s.criticalBadge}>
              <Ionicons name="warning" size={11} color="#fff" />
              <Text style={s.criticalBadgeText}>{criticalCount} critical</Text>
            </View>
          )}
        </View>

        {/* Summary pills */}
        <View style={s.summaryRow}>
          <View style={s.summaryPill}>
            <Text style={s.summaryVal}>{activeCount}</Text>
            <Text style={s.summaryLabel}>Active</Text>
          </View>
          <View style={[s.summaryPill, s.summaryPillMid]}>
            <Text style={s.summaryVal}>{resolvedCount}</Text>
            <Text style={s.summaryLabel}>Resolved</Text>
          </View>
          <View style={s.summaryPill}>
            <Text style={s.summaryVal}>{incidents.length}</Text>
            <Text style={s.summaryLabel}>Total</Text>
          </View>
        </View>

        {/* Wave */}
        <View style={s.waveWrap} pointerEvents="none">
          <View style={[s.waveBack, { backgroundColor: bg, opacity: 0.3 }]} />
          <View style={[s.waveFront, { backgroundColor: bg }]} />
        </View>
      </LinearGradient>

      {/* ── Filter pills ── */}
      <View style={[s.filterRow, { backgroundColor: bg }]}>
        {filters.map(f => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={({ pressed }) => [
              s.filterPill,
              filter === f.key && { backgroundColor: colors.brand[500] },
              isDark && filter !== f.key && { backgroundColor: colors.dark.card, borderColor: colors.dark.border },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[
              s.filterPillText,
              { color: filter === f.key ? '#fff' : textSecondary },
            ]}>
              {f.label}
            </Text>
            {f.count > 0 && (
              <View style={[
                s.filterCount,
                { backgroundColor: filter === f.key ? 'rgba(255,255,255,0.25)' : (isDark ? colors.dark.elevated : colors.slate[100]) },
              ]}>
                <Text style={[
                  s.filterCountText,
                  { color: filter === f.key ? '#fff' : textSecondary },
                ]}>
                  {f.count}
                </Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {/* ── List ── */}
      {loading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.brand[500]} />
          <Text style={[s.loadText, { color: textSecondary }]}>Loading assignments…</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[s.list, { paddingBottom: insets.bottom + 24 }]}
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
            <View style={s.empty}>
              <LinearGradient
                colors={[colors.brand[400], colors.brand[700]]}
                style={s.emptyIcon}
              >
                <Ionicons name="shield-outline" size={28} color="#fff" />
              </LinearGradient>
              <Text style={[s.emptyTitle, { color: textPrimary }]}>No assignments</Text>
              <Text style={[s.emptySub, { color: textSecondary }]}>
                {filter === 'active' ? 'No active incidents right now.' :
                 filter === 'resolved' ? 'No resolved incidents yet.' :
                 'No incidents have been assigned to you.'}
              </Text>
            </View>
          ) : (
            filtered.map(inc => (
              <IncidentCard
                key={inc.id}
                incident={inc}
                isDark={isDark}
                cardBg={cardBg}
                cardBorder={cardBorder}
                textPrimary={textPrimary}
                textSecondary={textSecondary}
                onPress={() => router.push(`/responder/incident/${inc.id}` as never)}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  /* Header */
  header: {
    paddingHorizontal: 16,
    paddingBottom: 44,
    position: 'relative',
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,1)',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIconWrap: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#fff', letterSpacing: -0.4 },
  headerSub:   { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.60)', marginTop: 2 },
  criticalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.severity.critical,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  criticalBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summaryPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  summaryPillMid: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  summaryVal:   { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: -0.5 },
  summaryLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' },
  waveWrap:  { position: 'absolute', bottom: 0, left: 0, right: 0, height: 30 },
  waveBack:  { position: 'absolute', bottom: 0, left: -8, right: -8, height: 30, borderTopLeftRadius: 32, borderTopRightRadius: 32 },
  waveFront: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 22, borderTopLeftRadius: 22, borderTopRightRadius: 22 },

  /* Filter */
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    marginTop: -4,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  filterPillText:  { fontSize: 13, fontWeight: '700' },
  filterCount: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  filterCountText: { fontSize: 10, fontWeight: '800' },

  /* List */
  list: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },

  /* Card */
  cardShadow: {
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  accentBar: { width: 4 },
  cardInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  sevIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  metaRow:   { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText:  { fontSize: 12, fontWeight: '400', flex: 1 },
  pillRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  pillText: { fontSize: 10, fontWeight: '700' },
  timeText: { fontSize: 10, fontWeight: '500' },
  rightCol: { alignItems: 'center', gap: 6 },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  /* Empty */
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadText: { fontSize: 13, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '800' },
  emptySub:   { fontSize: 13, fontWeight: '500', textAlign: 'center', paddingHorizontal: 32 },
});
