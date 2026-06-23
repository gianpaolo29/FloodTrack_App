/**
 * Report detail screen — loads from API service.
 * Shown when tapping a report card (My Reports) or map pin sheet.
 * Displays: map snippet, evidence carousel, severity, full status timeline,
 * and any responder updates.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { SeverityChip } from '@/components/SeverityChip';
import { StatusBadge } from '@/components/StatusBadge';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getReportDetail } from '@/services/api';
import type { ReportDetail } from '@/types';

// ─── Timeline item ────────────────────────────────────────────────────────────

function TimelineItem({
  event,
  isLast,
  isDark,
}: {
  event: ReportDetail['timeline'][number];
  isLast: boolean;
  isDark: boolean;
}) {
  const dotColor  = event.done ? colors.brand[500] : isDark ? colors.slate[600] : colors.slate[200];
  const lineColor = event.done ? colors.brand[100]  : isDark ? colors.slate[900] : colors.slate[100];

  return (
    <View style={tlStyles.row}>
      <View style={tlStyles.leftCol}>
        <View style={[tlStyles.dot, { backgroundColor: dotColor, borderColor: dotColor }]}>
          {event.done && <Ionicons name="checkmark" size={10} color={colors.white} />}
        </View>
        {!isLast && <View style={[tlStyles.line, { backgroundColor: lineColor }]} />}
      </View>
      <View style={[tlStyles.content, isLast && { paddingBottom: 0 }]}>
        <View style={tlStyles.topRow}>
          <Text style={[tlStyles.label, isDark && { color: colors.white }, !event.done && { color: colors.slate[400] }]}>
            {event.label}
          </Text>
          {event.time ? (
            <Text style={[tlStyles.time, isDark && { color: colors.slate[600] }]}>{event.time}</Text>
          ) : null}
        </View>
        <Text style={[tlStyles.detail, isDark && { color: colors.slate[400] }, !event.done && { color: colors.slate[400] }]}>
          {event.detail}
        </Text>
      </View>
    </View>
  );
}

const tlStyles = StyleSheet.create({
  row:     { flexDirection: 'row', gap: 12 },
  leftCol: { alignItems: 'center', width: 22 },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line:    { flex: 1, width: 2, marginVertical: 2 },
  content: { flex: 1, paddingBottom: 20, gap: 3 },
  topRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label:   { fontSize: 14, fontWeight: '600', color: colors.slate[900] },
  time:    { fontSize: 11, color: colors.slate[400] },
  detail:  { fontSize: 13, color: colors.slate[600], lineHeight: 18 },
});

// ─── Evidence carousel (placeholder) ─────────────────────────────────────────

function EvidenceCarousel({ isDark }: { isDark: boolean }) {
  const [active, setActive] = useState(0);
  const MOCK_COUNT = 3;

  return (
    <View style={evStyles.root}>
      <View style={[evStyles.slide, isDark && { backgroundColor: colors.slate[900] }]}>
        <Ionicons name="image-outline" size={40} color={colors.slate[400]} />
        <Text style={[evStyles.label, isDark && { color: colors.slate[400] }]}>
          Photo {active + 1} of {MOCK_COUNT}
        </Text>
      </View>
      <View style={evStyles.dots}>
        {Array.from({ length: MOCK_COUNT }).map((_, i) => (
          <Pressable
            key={i}
            onPress={() => setActive(i)}
            style={[evStyles.dot, i === active && { backgroundColor: colors.brand[500], width: 18 }]}
            accessibilityRole="button"
            accessibilityLabel={`Photo ${i + 1}`}
          />
        ))}
      </View>
    </View>
  );
}

const evStyles = StyleSheet.create({
  root:  { gap: 10 },
  slide: {
    height: 180,
    borderRadius: 12,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: { fontSize: 13, color: colors.slate[600] },
  dots:  { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot:   { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.slate[200] },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ReportDetailScreen() {
  const { id }      = useLocalSearchParams<{ id: string }>();
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const scheme      = useColorScheme();
  const isDark      = scheme === 'dark';
  const { token }   = useAuth();

  const [report, setReport]   = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const cardBg   = isDark ? '#0D1117' : colors.white;
  const screenBg = isDark ? '#0D1117' : colors.slate[50];

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getReportDetail(id, token!);
      setReport(data);
    } catch {
      setError('Could not load report details.');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10, backgroundColor: colors.brand[500] }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={22} color={colors.white} />
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          {report && (
            <>
              <Text style={styles.headerRef}>{report.reference}</Text>
              <Text style={styles.headerTitle} numberOfLines={1}>{report.title}</Text>
            </>
          )}
          {!report && !loading && (
            <Text style={styles.headerTitle}>Report detail</Text>
          )}
        </View>
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
          <Pressable onPress={load} style={styles.retryBtn} accessibilityRole="button">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      )}

      {/* Content */}
      {!loading && !error && report && (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Status + severity ── */}
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <View style={styles.chipsRow}>
              <SeverityChip level={report.severity} size="lg" />
              <StatusBadge status={report.status} />
            </View>
            <View style={styles.metaGrid}>
              <View style={styles.metaItem}>
                <Text style={[styles.metaLabel, isDark && { color: colors.slate[600] }]}>Type</Text>
                <Text style={[styles.metaValue, isDark && { color: colors.white }]}>{report.type}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={[styles.metaLabel, isDark && { color: colors.slate[600] }]}>Reported by</Text>
                <Text style={[styles.metaValue, isDark && { color: colors.white }]}>{report.reportedBy}</Text>
              </View>
              <View style={[styles.metaItem, { flex: 2 }]}>
                <Text style={[styles.metaLabel, isDark && { color: colors.slate[600] }]}>Location</Text>
                <Text style={[styles.metaValue, isDark && { color: colors.white }]}>{report.address}</Text>
              </View>
              <View style={[styles.metaItem, { flex: 2 }]}>
                <Text style={[styles.metaLabel, isDark && { color: colors.slate[600] }]}>Reported at</Text>
                <Text style={[styles.metaValue, isDark && { color: colors.white }]}>{report.reportedAt}</Text>
              </View>
            </View>
          </View>

          {/* ── Map snippet ── */}
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <Text style={[styles.sectionTitle, isDark && { color: colors.white }]}>Location</Text>
            <View style={[styles.mapSnippet, isDark && { backgroundColor: colors.slate[900] }]}>
              <Ionicons name="location" size={28} color={colors.brand[500]} />
              <Text style={[styles.mapSnippetText, isDark && { color: colors.slate[400] }]}>
                {report.address}
              </Text>
            </View>
          </View>

          {/* ── Evidence ── */}
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <Text style={[styles.sectionTitle, isDark && { color: colors.white }]}>Photo evidence</Text>
            <EvidenceCarousel isDark={isDark} />
          </View>

          {/* ── Description ── */}
          {report.description ? (
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <Text style={[styles.sectionTitle, isDark && { color: colors.white }]}>Description</Text>
              <Text style={[styles.description, isDark && { color: colors.slate[400] }]}>
                {report.description}
              </Text>
            </View>
          ) : null}

          {/* ── Status timeline ── */}
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <Text style={[styles.sectionTitle, isDark && { color: colors.white }]}>Status timeline</Text>
            <View style={{ paddingTop: 4 }}>
              {report.timeline.map((evt, i) => (
                <TimelineItem
                  key={evt.status}
                  event={evt}
                  isLast={i === report.timeline.length - 1}
                  isDark={isDark}
                />
              ))}
            </View>
          </View>

          {/* ── Responder updates ── */}
          {report.updates.length > 0 && (
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <Text style={[styles.sectionTitle, isDark && { color: colors.white }]}>Responder updates</Text>
              <View style={{ gap: 12 }}>
                {report.updates.map((u, i) => (
                  <View
                    key={i}
                    style={[styles.updateCard, isDark && { backgroundColor: colors.slate[900] }]}
                  >
                    <View style={styles.updateHeader}>
                      <View style={styles.updateDot} />
                      <Text style={[styles.updateAuthor, isDark && { color: colors.white }]}>{u.author}</Text>
                      <Text style={[styles.updateTime, isDark && { color: colors.slate[600] }]}>{u.time}</Text>
                    </View>
                    <Text style={[styles.updateNote, isDark && { color: colors.slate[400] }]}>{u.note}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRef:   { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: colors.white },

  scroll: { padding: 16, gap: 12 },

  card: {
    borderRadius: 12,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: colors.slate[900] },
  chipsRow: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },

  metaGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metaItem:  { flex: 1, minWidth: '40%', gap: 2 },
  metaLabel: { fontSize: 11, color: colors.slate[400], fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.3 },
  metaValue: { fontSize: 14, color: colors.slate[900], fontWeight: '500' },

  mapSnippet: {
    height: 120,
    borderRadius: 10,
    backgroundColor: '#D6E8F5',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mapSnippetText: { fontSize: 13, color: colors.slate[600], fontWeight: '500' },

  description: { fontSize: 14, color: colors.slate[600], lineHeight: 22 },

  updateCard: {
    backgroundColor: colors.slate[50],
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  updateHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  updateDot:    { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent[500] },
  updateAuthor: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.slate[900] },
  updateTime:   { fontSize: 11, color: colors.slate[400] },
  updateNote:   { fontSize: 13, color: colors.slate[600], lineHeight: 18 },

  errorText: { fontSize: 14, color: colors.slate[600], textAlign: 'center' },
  retryBtn:  { backgroundColor: colors.brand[500], paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: colors.white, fontWeight: '600', fontSize: 14 },
});
