/**
 * Incidents tab — Responder role only
 * Shown in the tab bar only when user.role === 'Responder' (href: null otherwise).
 * Loads assigned incidents from the API service.
 */
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

// ─── Incident card ────────────────────────────────────────────────────────────

function IncidentCard({
  incident,
  onPress,
  isDark,
}: {
  incident: Incident;
  onPress: () => void;
  isDark: boolean;
}) {
  const statusColor = RESPONDER_STATUS_COLORS[incident.responderStatus];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isDark && { backgroundColor: colors.slate[900] },
        pressed && { opacity: 0.88 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${incident.title}, ${incident.severity} severity, ${incident.distance} away`}
    >
      <View style={[styles.cardBar, { backgroundColor: colors.severity[incident.severity] }]} />

      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={[styles.cardRef, isDark && { color: colors.slate[600] }]}>
            {incident.reference}
          </Text>
          <View style={[styles.distancePill, { backgroundColor: colors.accent[100] }]}>
            <Ionicons name="navigate" size={11} color={colors.accent[700]} />
            <Text style={[styles.distanceText, { color: colors.accent[700] }]}>
              {incident.distance}
            </Text>
          </View>
        </View>

        <Text style={[styles.cardTitle, isDark && { color: colors.white }]} numberOfLines={2}>
          {incident.title}
        </Text>

        <View style={styles.cardMeta}>
          <Ionicons name="location-outline" size={12} color={colors.slate[400]} />
          <Text style={[styles.cardMetaText, isDark && { color: colors.slate[400] }]}>
            {incident.address}
          </Text>
        </View>

        <View style={styles.cardChips}>
          <SeverityChip level={incident.severity} size="sm" />
          {incident.nearbyCount > 1 && (
            <View style={styles.nearbyPill}>
              <Ionicons name="warning-outline" size={11} color={colors.severity.moderate} />
              <Text style={styles.nearbyText}>{incident.nearbyCount} nearby</Text>
            </View>
          )}
        </View>

        <View style={styles.cardFooter}>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {RESPONDER_STATUS_LABELS[incident.responderStatus]}
            </Text>
          </View>
          <View style={styles.cardMeta}>
            <Ionicons name="time-outline" size={11} color={colors.slate[400]} />
            <Text style={[styles.cardMetaText, isDark && { color: colors.slate[600] }]}>
              {incident.reportedAt}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function IncidentsTab() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const scheme   = useColorScheme();
  const isDark   = scheme === 'dark';
  const { token } = useAuth();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const screenBg = isDark ? '#0D1117' : colors.slate[50];

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

  function handleRefresh() {
    setRefreshing(true);
    load(true);
  }

  const active   = incidents.filter(i => i.responderStatus !== 'resolved');
  const resolved = incidents.filter(i => i.responderStatus === 'resolved');

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      {/* Header */}
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: isDark ? '#0D1117' : colors.white,
        borderBottomColor: isDark ? colors.slate[900] : colors.slate[100],
      }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, isDark && { color: colors.white }]}>
            Assigned incidents
          </Text>
          {!loading && (
            <Text style={[styles.headerSub, isDark && { color: colors.slate[400] }]}>
              {active.length} active · sorted by priority
            </Text>
          )}
        </View>
        <View style={[styles.roleBadge, { backgroundColor: colors.accent[100] }]}>
          <Ionicons name="shield-checkmark" size={12} color={colors.accent[700]} />
          <Text style={[styles.roleBadgeText, { color: colors.accent[700] }]}>Responder</Text>
        </View>
      </View>

      {/* Loading */}
      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent[500]} />
        </View>
      )}

      {/* Error */}
      {!loading && error && (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.slate[200]} />
          <Text style={[styles.errorText, isDark && { color: colors.slate[400] }]}>{error}</Text>
          <Pressable onPress={() => load()} style={styles.retryBtn} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* List */}
      {!loading && !error && (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 16 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent[500]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {active.some(i => i.severity === 'critical') && (
            <View style={styles.priorityBanner}>
              <Ionicons name="alert-circle" size={16} color={colors.severity.critical} />
              <Text style={styles.priorityText}>
                Critical incident requires immediate response
              </Text>
            </View>
          )}

          {active.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, isDark && { color: colors.slate[400] }]}>
                Active ({active.length})
              </Text>
              {active.map(i => (
                <IncidentCard
                  key={i.id}
                  incident={i}
                  isDark={isDark}
                  onPress={() => router.push(`/responder/incident/${i.id}`)}
                />
              ))}
            </View>
          )}

          {resolved.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, isDark && { color: colors.slate[400] }]}>
                Resolved today ({resolved.length})
              </Text>
              {resolved.map(i => (
                <IncidentCard
                  key={i.id}
                  incident={i}
                  isDark={isDark}
                  onPress={() => router.push(`/responder/incident/${i.id}`)}
                />
              ))}
            </View>
          )}

          {incidents.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={48} color={colors.slate[200]} />
              <Text style={[styles.emptyTitle, isDark && { color: colors.white }]}>All clear</Text>
              <Text style={[styles.emptySub, isDark && { color: colors.slate[400] }]}>
                No incidents are currently assigned to you.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.slate[900] },
  headerSub:   { fontSize: 12, color: colors.slate[400], marginTop: 1 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },

  scroll: { padding: 16, gap: 16 },

  priorityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.severity.critical + '12',
    borderWidth: 1,
    borderColor: colors.severity.critical + '44',
    borderRadius: 10,
    padding: 12,
  },
  priorityText: { flex: 1, fontSize: 13, color: colors.severity.critical, fontWeight: '600' },

  section: { gap: 10 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.slate[400],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingLeft: 2,
  },

  card: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  cardBar:  { width: 4 },
  cardBody: { flex: 1, padding: 14, gap: 8 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardRef:    { fontSize: 11, color: colors.slate[400], fontWeight: '500' },
  distancePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  distanceText: { fontSize: 11, fontWeight: '600' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.slate[900], lineHeight: 20 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardMetaText: { fontSize: 12, color: colors.slate[600] },
  cardChips: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  nearbyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.severity.moderate + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  nearbyText: { fontSize: 11, color: colors.severity.moderate, fontWeight: '600' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
    paddingTop: 8,
  },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusDot:  { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },

  errorText: { fontSize: 14, color: colors.slate[600], textAlign: 'center' },
  retryBtn:  { backgroundColor: colors.accent[500], paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: colors.white, fontWeight: '600', fontSize: 14 },
  emptyState: { alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.slate[900] },
  emptySub:   { fontSize: 14, color: colors.slate[400], textAlign: 'center', lineHeight: 20 },
});
