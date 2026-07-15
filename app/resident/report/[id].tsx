/**
 * Report detail screen — loads from API service.
 * Shown when tapping a report card (My Reports) or map pin sheet.
 * Displays: map snippet, evidence carousel, severity, full status timeline,
 * and any responder updates.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/theme/colors';
import { SeverityChip } from '@/components/SeverityChip';
import { StatusBadge } from '@/components/StatusBadge';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useAlert } from '@/context/AlertContext';
import { getReportDetail, withdrawReport } from '@/services/api';
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
    borderWidth: 1.5,
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

// ─── Photo gallery ────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width;
// card has 16px horizontal padding on each side, so content width = screen - 32 - 2*16 card padding
const GALLERY_W = SCREEN_W - 32 - 32; // subtract screen margins + card padding

function PhotoGallery({ urls, isDark }: { urls: string[]; isDark: boolean }) {
  const [active, setActive]   = useState(0);
  const scrollRef             = useRef<ScrollView>(null);
  const thumbScrollRef        = useRef<ScrollView>(null);

  function goTo(i: number) {
    setActive(i);
    scrollRef.current?.scrollTo({ x: i * GALLERY_W, animated: true });
    thumbScrollRef.current?.scrollTo({ x: Math.max(0, i - 2) * 60, animated: true });
  }

  if (urls.length === 0) {
    return (
      <View style={[gal.empty, isDark && { backgroundColor: colors.slate[900] }]}>
        <Ionicons name="image-outline" size={32} color={colors.slate[400]} />
        <Text style={[gal.emptyText, isDark && { color: colors.slate[500] }]}>
          No photo evidence attached
        </Text>
      </View>
    );
  }

  return (
    <View style={gal.root}>
      {/* Main swipeable photo */}
      <View style={gal.slideWrap}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={e => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / GALLERY_W);
            if (idx !== active) {
              setActive(idx);
              thumbScrollRef.current?.scrollTo({ x: Math.max(0, idx - 2) * 60, animated: true });
            }
          }}
          style={{ width: GALLERY_W }}
        >
          {urls.map((url, i) => (
            <Image
              key={i}
              source={{ uri: url }}
              style={[gal.slide, { width: GALLERY_W }]}
              resizeMode="cover"
              accessibilityLabel={`Photo ${i + 1} of ${urls.length}`}
            />
          ))}
        </ScrollView>

        {/* Counter badge */}
        <View style={gal.badge}>
          <Ionicons name="camera" size={11} color={colors.white} />
          <Text style={gal.badgeText}>{active + 1} / {urls.length}</Text>
        </View>
      </View>

      {/* Thumbnail strip (only when > 1 photo) */}
      {urls.length > 1 && (
        <ScrollView
          ref={thumbScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={gal.thumbScroll}
        >
          {urls.map((url, i) => (
            <Pressable
              key={i}
              onPress={() => goTo(i)}
              style={({ pressed }) => [
                gal.thumb,
                i === active && gal.thumbActive,
                pressed && { opacity: 0.8 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`View photo ${i + 1}`}
            >
              <Image source={{ uri: url }} style={gal.thumbImg} resizeMode="cover" />
              {i === active && <View style={gal.thumbOverlay} />}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const gal = StyleSheet.create({
  root:  { gap: 10 },
  slideWrap: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
  slide: {
    height: 240,
    backgroundColor: colors.slate[100],
  },
  badge: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: { fontSize: 12, color: colors.white, fontWeight: '600' },
  thumbScroll: { gap: 8 },
  thumb: {
    width: 56, height: 56, borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2, borderColor: 'transparent',
  },
  thumbActive: { borderColor: colors.brand[500] },
  thumbImg: { width: '100%', height: '100%' },
  thumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.brand[500] + '30',
  },
  empty: {
    height: 120, borderRadius: 12,
    backgroundColor: colors.slate[100],
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  emptyText: { fontSize: 13, color: colors.slate[500] },
});

// ─── AI Status Card ───────────────────────────────────────────────────────────

type AiEntry = { icon: string; color: string; title: string; note: string };

function AiStatusCard({ report, isDark }: { report: ReportDetail; isDark: boolean }) {
  const { aiFlagged, aiImageVerified, aiImageNotes, aiFlagReason, aiHasDuplicate } = report;

  const entries: AiEntry[] = [];

  if (aiImageVerified === true) {
    entries.push({
      icon:  'shield-checkmark',
      color: colors.severity.low,
      title: 'AI Verified',
      note:  aiImageNotes ?? 'Photo evidence confirmed flooding.',
    });
  }

  if (aiImageVerified === false) {
    entries.push({
      icon:  'image-outline',
      color: colors.severity.moderate,
      title: 'Image Under Review',
      note:  aiImageNotes ?? 'Our AI could not confirm flooding in the submitted photo.',
    });
  }

  if (aiHasDuplicate) {
    entries.push({
      icon:  'copy-outline',
      color: colors.severity.moderate,
      title: 'Possible Duplicate',
      note:  'A similar report was already submitted nearby. An admin will review.',
    });
  }

  if (aiFlagged) {
    entries.push({
      icon:  'alert-circle-outline',
      color: colors.severity.high,
      title: 'Under Admin Review',
      note:  aiFlagReason ?? 'Your report has been flagged for manual review.',
    });
  }

  // Fall back to neutral if no AI findings
  if (entries.length === 0) {
    entries.push({
      icon:  'checkmark-circle-outline',
      color: colors.severity.low,
      title: 'Report Received',
      note:  'Your report looks good and is awaiting admin verification.',
    });
  }

  return (
    <View style={[aiStyles.outerCard, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}>
      <View style={aiStyles.headerRow}>
        <Ionicons name="sparkles" size={13} color={colors.brand[500]} />
        <Text style={[aiStyles.headerLabel, isDark && { color: colors.slate[300] }]}>AI Analysis</Text>
      </View>
      <View style={{ gap: 10 }}>
        {entries.map((entry, i) => (
          <View
            key={i}
            style={[
              aiStyles.card,
              { borderColor: entry.color + '30', backgroundColor: isDark ? entry.color + '10' : entry.color + '08' },
            ]}
          >
            <View style={[aiStyles.iconWrap, { backgroundColor: entry.color + '18' }]}>
              <Ionicons name={entry.icon as any} size={20} color={entry.color} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[aiStyles.title, { color: entry.color }]}>{entry.title}</Text>
              <Text style={[aiStyles.note, isDark && { color: colors.slate[400] }]}>{entry.note}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const aiStyles = StyleSheet.create({
  outerCard: {
    borderRadius: 14,
    padding: 14,
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate[100],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 },
  headerLabel: { fontSize: 12, fontWeight: '700', color: colors.slate[500], textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  iconWrap: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  title: { fontSize: 13, fontWeight: '700' },
  note: { fontSize: 12, color: colors.slate[600], lineHeight: 17 },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ReportDetailScreen() {
  const { id }      = useLocalSearchParams<{ id: string }>();
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const scheme      = useColorScheme();
  const isDark      = scheme === 'dark';
  const { token }   = useAuth();

  const { showAlert } = useAlert();
  const [report, setReport]   = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const cardBg   = isDark ? colors.dark.card    : colors.white;
  const screenBg = isDark ? colors.dark.bg      : colors.slate[50];

  function handleShare() {
    if (!report) return;
    Share.share({
      title: report.title,
      message: `FloodTrack Report\nRef: ${report.reference}\n${report.title}\nLocation: ${report.address}\nStatus: ${report.status}\nReported: ${report.reportedAt}`,
    });
  }

  async function handleWithdraw() {
    showAlert({
      type: 'confirm',
      title: 'Withdraw report?',
      message: 'This will cancel your pending report. This action cannot be undone.',
      confirmText: 'Withdraw',
      cancelText: 'Keep it',
      onConfirm: async () => {
        try {
          await withdrawReport(id, token!);
          router.back();
        } catch {
          showAlert({ type: 'error', title: 'Failed', message: 'Could not withdraw the report. Please try again.' });
        }
      },
    });
  }

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const data = await getReportDetail(id, token);
      setReport(data);
    } catch {
      setError('Could not load report details.');
      showAlert({ type: 'error', title: 'Load Failed', message: 'Could not load report details. Check your connection.' });
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      {/* ── Header ── */}
      <LinearGradient colors={[colors.brand[500], colors.brand[700]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + 10 }]}>
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
        {report && (
          <Pressable
            onPress={handleShare}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel="Share report"
            hitSlop={8}
          >
            <Ionicons name="share-outline" size={20} color={colors.white} />
          </Pressable>
        )}
      </LinearGradient>

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

          {/* ── AI Analysis badge ── */}
          <AiStatusCard report={report} isDark={isDark} />

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
            <PhotoGallery urls={report.mediaUrls} isDark={isDark} />
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

          {/* ── Message responder ── */}
          {(report.status === 'assigned' || report.status === 'resolved') && (
            <Pressable
              onPress={() => router.push(`/resident/report/${id}/chat` as never)}
              style={({ pressed }) => [
                styles.messageBtn,
                isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border },
                pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Message responder"
            >
              <View style={styles.messageBtnIcon}>
                <Ionicons name="chatbubbles" size={20} color={colors.brand[500]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.messageBtnTitle, isDark && { color: colors.white }]}>
                  Message Responder
                </Text>
                <Text style={[styles.messageBtnSub, isDark && { color: colors.slate[500] }]}>
                  Chat with the assigned responder
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={isDark ? colors.slate[600] : colors.slate[300]} />
            </Pressable>
          )}

          {/* ── Withdraw (pending only) ── */}
          {report.status === 'pending' && (
            <Pressable
              style={({ pressed }) => [
                styles.withdrawBtn,
                isDark && { borderColor: colors.severity.critical + '44', backgroundColor: colors.severity.critical + '12' },
                pressed && { opacity: 0.75 },
              ]}
              onPress={handleWithdraw}
              accessibilityRole="button"
              accessibilityLabel="Withdraw this report"
            >
              <Ionicons name="close-circle-outline" size={18} color={colors.severity.critical} />
              <Text style={styles.withdrawText}>Withdraw this report</Text>
            </Pressable>
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
    borderRadius: 16,
    padding: 16,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
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
    height: 110,
    borderRadius: 14,
    backgroundColor: colors.brand[50],
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

  headerBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  messageBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.white, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: colors.brand[500] + '30',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 3,
  },
  messageBtnIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: colors.brand[500] + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  messageBtnTitle: { fontSize: 15, fontWeight: '700', color: colors.slate[900] },
  messageBtnSub: { fontSize: 12, color: colors.slate[400], marginTop: 1 },

  withdrawBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: colors.severity.critical + '33',
    backgroundColor: colors.severity.critical + '0A',
  },
  withdrawText: { fontSize: 14, fontWeight: '600', color: colors.severity.critical },
});
