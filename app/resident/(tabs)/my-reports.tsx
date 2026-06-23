/**
 * My Reports screen — loads from API service, not inline mock data.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { useAlert } from '@/context/AlertContext';
import { SeverityChip } from '@/components/SeverityChip';
import { StatusBadge } from '@/components/StatusBadge';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getMyReports } from '@/services/api';
import type { Report, ReportStatus } from '@/types';

type FilterTab = 'all' | 'active' | 'resolved';

const ACTIVE_STATUSES: ReportStatus[] = ['pending', 'verified', 'assigned'];

// ─── Report card ──────────────────────────────────────────────────────────────

function ReportCard({
  report,
  onPress,
  isDark,
}: {
  report: Report;
  onPress: () => void;
  isDark: boolean;
}) {
  const hasPhoto = !!report.thumbnailUrl;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isDark && { backgroundColor: colors.dark.card },
        pressed && { opacity: 0.88 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${report.title}, ${report.severity} severity, status ${report.status}`}
    >
      {/* ── Photo header ── */}
      {hasPhoto && (
        <View style={styles.photoHeader}>
          <Image
            source={{ uri: report.thumbnailUrl }}
            style={styles.photoHeaderImg}
            resizeMode="cover"
          />
          {/* Gradient-style overlay for readability */}
          <View style={styles.photoHeaderOverlay} />
          {/* Photo count badge */}
          {(report.mediaCount ?? 0) > 1 && (
            <View style={styles.photoBadge}>
              <Ionicons name="camera" size={10} color={colors.white} />
              <Text style={styles.photoBadgeText}>{report.mediaCount}</Text>
            </View>
          )}
          {/* Severity bar overlaid at top of photo */}
          <View style={[styles.photoSeverityBar, { backgroundColor: colors.severity[report.severity] }]} />
        </View>
      )}

      <View style={styles.cardRow}>
        {/* Severity bar (only shown when no photo) */}
        {!hasPhoto && (
          <View style={[styles.cardBar, { backgroundColor: colors.severity[report.severity] }]} />
        )}

        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Text style={[styles.cardTitle, isDark && { color: colors.white }]} numberOfLines={1}>
              {report.title}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.slate[400]} />
          </View>
          <View style={styles.cardMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="layers-outline" size={12} color={colors.slate[400]} />
              <Text style={[styles.metaText, isDark && { color: colors.slate[400] }]}>{report.type}</Text>
            </View>
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={12} color={colors.slate[400]} />
              <Text style={[styles.metaText, isDark && { color: colors.slate[400] }]} numberOfLines={1}>
                {report.address}
              </Text>
            </View>
          </View>
          <View style={styles.cardChips}>
            <SeverityChip level={report.severity} size="sm" />
            <StatusBadge status={report.status} size="sm" />
          </View>
          <View style={styles.cardFooter}>
            <Text style={[styles.cardRef, isDark && { color: colors.slate[600] }]}>{report.reference}</Text>
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={11} color={colors.slate[400]} />
              <Text style={[styles.cardTime, isDark && { color: colors.slate[600] }]}>{report.reportedAt}</Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MyReportsScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const scheme  = useColorScheme();
  const isDark  = scheme === 'dark';
  const { token } = useAuth();
  const { showAlert } = useAlert();

  const [reports, setReports]     = useState<Report[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [tab, setTab]             = useState<FilterTab>('all');

  const screenBg = isDark ? colors.dark.bg : colors.slate[50];

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      const data = await getMyReports(token!);
      setReports(data);
    } catch {
      setError('Could not load reports. Pull down to retry.');
      if (!isRefresh) showAlert({ type: 'error', title: 'Load Failed', message: 'Could not load your reports. Check your connection.' });
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

  const filtered = reports.filter(r => {
    if (tab === 'active')   return ACTIVE_STATUSES.includes(r.status);
    if (tab === 'resolved') return r.status === 'resolved' || r.status === 'rejected';
    return true;
  });

  const TABS: { key: FilterTab; label: string }[] = [
    { key: 'all',      label: `All (${reports.length})`                                                         },
    { key: 'active',   label: `Active (${reports.filter(r => ACTIVE_STATUSES.includes(r.status)).length})`      },
    { key: 'resolved', label: `Closed (${reports.filter(r => ['resolved','rejected'].includes(r.status)).length})` },
  ];

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      {/* Header */}
      <View style={[styles.header, {
        paddingTop: insets.top + 12,
        backgroundColor: isDark ? colors.dark.surface : colors.white,
        borderBottomColor: isDark ? colors.dark.border : colors.slate[100],
      }]}>
        <Text style={[styles.headerTitle, isDark && { color: colors.white }]}>My reports</Text>
        <Pressable
          style={styles.newBtn}
          onPress={() => router.push('/resident/report')}
          accessibilityRole="button"
          accessibilityLabel="Submit new report"
        >
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.newBtnText}>New</Text>
        </Pressable>
      </View>

      {/* Filter tabs */}
      <View style={[styles.tabRow, {
        backgroundColor: isDark ? colors.dark.surface : colors.white,
        borderBottomColor: isDark ? colors.dark.border : colors.slate[100],
      }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tabItem, tab === t.key && styles.tabItemActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.key }}
          >
            <Text style={[styles.tabLabel, isDark && { color: colors.slate[400] }, tab === t.key && styles.tabLabelActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Loading */}
      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand[500]} />
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
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 16 },
            filtered.length === 0 && styles.listEmpty,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.brand[500]} />
          }
          showsVerticalScrollIndicator={false}
        >
          {filtered.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-text-outline" size={48} color={colors.slate[200]} />
              <Text style={[styles.emptyTitle, isDark && { color: colors.white }]}>No reports here</Text>
              <Text style={[styles.emptySub, isDark && { color: colors.slate[400] }]}>
                {tab === 'active' ? 'No active reports at the moment.' :
                 tab === 'resolved' ? 'No closed reports yet.' :
                 "You haven't submitted any reports yet."}
              </Text>
            </View>
          ) : (
            filtered.map(r => (
              <ReportCard
                key={r.id}
                report={r}
                isDark={isDark}
                onPress={() => router.push(`/resident/report/${r.id}`)}
              />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:    { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: colors.slate[900] },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand[500],
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  newBtnText: { color: colors.white, fontSize: 13, fontWeight: '600' },

  tabRow: { flexDirection: 'row', borderBottomWidth: 1 },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive:  { borderBottomColor: colors.brand[500] },
  tabLabel:       { fontSize: 13, color: colors.slate[400], fontWeight: '500' },
  tabLabelActive: { color: colors.brand[500], fontWeight: '700' },

  list:      { padding: 16, gap: 12 },
  listEmpty: { flex: 1 },

  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  // Photo header (shown when thumbnailUrl is set)
  photoHeader: { position: 'relative', height: 150 },
  photoHeaderImg: { width: '100%', height: '100%' },
  photoHeaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  photoSeverityBar: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 4,
  },
  photoBadge: {
    position: 'absolute', bottom: 8, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  photoBadgeText: { color: colors.white, fontSize: 11, fontWeight: '700' },
  // Row that holds the bar + body (used when no photo, or always for body)
  cardRow:  { flexDirection: 'row' },
  cardBar:  { width: 4 },
  cardBody: { flex: 1, padding: 14, gap: 8 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle:  { flex: 1, fontSize: 15, fontWeight: '700', color: colors.slate[900] },
  cardMeta:   { gap: 4 },
  metaItem:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText:   { fontSize: 12, color: colors.slate[600] },
  cardChips:  { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
    paddingTop: 8,
  },
  cardRef:  { fontSize: 11, color: colors.slate[400], fontWeight: '500' },
  cardTime: { fontSize: 11, color: colors.slate[400] },

  errorText:  { fontSize: 14, color: colors.slate[600], textAlign: 'center' },
  retryBtn:   { backgroundColor: colors.brand[500], paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText:  { color: colors.white, fontWeight: '600', fontSize: 14 },
  emptyState: { alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.slate[900] },
  emptySub:   { fontSize: 14, color: colors.slate[400], textAlign: 'center', lineHeight: 20 },
});
