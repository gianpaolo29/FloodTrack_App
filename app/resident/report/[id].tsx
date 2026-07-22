/**
 * Report detail screen — premium redesign.
 * Hero header with status, glass cards, icon-led metadata,
 * refined gallery, polished timeline, and sleek action buttons.
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
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/theme/colors';
import { SeverityChip, type Severity } from '@/components/SeverityChip';
import { StatusBadge } from '@/components/StatusBadge';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useAlert } from '@/context/AlertContext';
import { getReportDetail, updateReport, deleteReportMedia, withdrawReport } from '@/services/api';
import { socketService } from '@/services/socket';
import type { ReportDetail, MediaItem } from '@/types';

const { width: SCREEN_W } = Dimensions.get('window');
const GALLERY_W = SCREEN_W - 48; // 24px padding each side

// ─── Severity color helper ───────────────────────────────────────────────────

function sevColor(s: Severity) {
  return colors.severity[s] ?? colors.severity.low;
}

// ─── Meta Row (icon + label + value) ─────────────────────────────────────────

function MetaRow({
  icon,
  label,
  value,
  isDark,
}: {
  icon: string;
  label: string;
  value: string;
  isDark: boolean;
}) {
  return (
    <View style={metaStyles.row}>
      <View style={[metaStyles.iconWrap, isDark && { backgroundColor: colors.dark.elevated }]}>
        <Ionicons name={icon as any} size={16} color={colors.brand[500]} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[metaStyles.label, isDark && { color: colors.slate[500] }]}>{label}</Text>
        <Text style={[metaStyles.value, isDark && { color: colors.white }]} numberOfLines={2}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const metaStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.slate[400],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  value: { fontSize: 14, fontWeight: '600', color: colors.slate[800] },
});

// ─── Timeline item ───────────────────────────────────────────────────────────

function TimelineItem({
  event,
  isLast,
  isDark,
}: {
  event: ReportDetail['timeline'][number];
  isLast: boolean;
  isDark: boolean;
}) {
  const isRejected = event.status === 'rejected' && event.done;
  const dotColor = isRejected
    ? colors.severity.critical
    : event.done
      ? colors.brand[500]
      : isDark
        ? colors.slate[700]
        : colors.slate[200];
  const lineColor = isRejected
    ? colors.severity.critical + '20'
    : event.done
      ? colors.brand[100]
      : isDark
        ? colors.slate[800]
        : colors.slate[100];

  return (
    <View style={tlStyles.row}>
      <View style={tlStyles.leftCol}>
        <View
          style={[
            tlStyles.dot,
            { backgroundColor: event.done ? dotColor : 'transparent', borderColor: dotColor },
          ]}
        >
          {event.done && (
            <Ionicons
              name={isRejected ? 'close' : 'checkmark'}
              size={10}
              color={colors.white}
            />
          )}
        </View>
        {!isLast && <View style={[tlStyles.line, { backgroundColor: lineColor }]} />}
      </View>
      <View style={[tlStyles.content, isLast && { paddingBottom: 0 }]}>
        <View style={tlStyles.topRow}>
          <Text
            style={[
              tlStyles.label,
              isDark && { color: colors.white },
              !event.done && { color: colors.slate[400] },
            ]}
          >
            {event.label}
          </Text>
          {event.time ? (
            <Text style={[tlStyles.time, isDark && { color: colors.slate[600] }]}>
              {event.time}
            </Text>
          ) : null}
        </View>
        <Text
          style={[
            tlStyles.detail,
            isDark && { color: colors.slate[400] },
            !event.done && { color: colors.slate[400] },
          ]}
        >
          {event.detail}
        </Text>
      </View>
    </View>
  );
}

const tlStyles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14 },
  leftCol: { alignItems: 'center', width: 24 },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: { flex: 1, width: 2, marginVertical: 2, borderRadius: 1 },
  content: { flex: 1, paddingBottom: 22, gap: 3 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  label: { fontSize: 14, fontWeight: '600', color: colors.slate[900] },
  time: { fontSize: 11, color: colors.slate[400], fontWeight: '500' },
  detail: { fontSize: 13, color: colors.slate[500], lineHeight: 18 },
});

// ─── Gallery slide with error fallback ───────────────────────────────────────

function GallerySlide({
  url,
  index,
  total,
  isDark,
}: {
  url: string;
  index: number;
  total: number;
  isDark: boolean;
}) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return (
      <View
        style={[
          gal.slide,
          { width: GALLERY_W, alignItems: 'center', justifyContent: 'center' },
          isDark && { backgroundColor: colors.dark.elevated },
        ]}
      >
        <Ionicons name="image-outline" size={32} color={colors.slate[400]} />
        <Text style={[gal.emptyText, { marginTop: 8 }, isDark && { color: colors.slate[500] }]}>
          Image unavailable
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: url }}
      style={[gal.slide, { width: GALLERY_W }]}
      resizeMode="cover"
      onError={() => setErrored(true)}
      accessibilityLabel={`Photo ${index + 1} of ${total}`}
    />
  );
}

// ─── Photo gallery ───────────────────────────────────────────────────────────

function PhotoGallery({ urls, isDark }: { urls: string[]; isDark: boolean }) {
  const [active, setActive] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  function goTo(i: number) {
    setActive(i);
    scrollRef.current?.scrollTo({ x: i * GALLERY_W, animated: true });
  }

  if (urls.length === 0) {
    return (
      <View style={[gal.empty, isDark && { backgroundColor: colors.dark.elevated }]}>
        <View style={[gal.emptyIcon, isDark && { backgroundColor: colors.dark.border }]}>
          <Ionicons name="image-outline" size={28} color={colors.slate[400]} />
        </View>
        <Text style={[gal.emptyText, isDark && { color: colors.slate[500] }]}>
          No photo evidence attached
        </Text>
      </View>
    );
  }

  return (
    <View style={gal.root}>
      <View style={gal.slideWrap}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / GALLERY_W);
            if (idx !== active) setActive(idx);
          }}
          style={{ width: GALLERY_W }}
        >
          {urls.map((url, i) => (
            <GallerySlide
              key={i}
              url={url}
              index={i}
              total={urls.length}
              isDark={isDark}
            />
          ))}
        </ScrollView>

        {/* Gradient overlay at bottom for badge contrast */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.4)']}
          style={gal.slideGradient}
          pointerEvents="none"
        />

        {/* Counter badge */}
        <View style={gal.badge}>
          <Ionicons name="camera" size={12} color={colors.white} />
          <Text style={gal.badgeText}>
            {active + 1} / {urls.length}
          </Text>
        </View>
      </View>

      {/* Dot indicators */}
      {urls.length > 1 && (
        <View style={gal.dotsRow}>
          {urls.map((_, i) => (
            <Pressable key={i} onPress={() => goTo(i)} hitSlop={6}>
              <View
                style={[
                  gal.dot,
                  i === active && gal.dotActive,
                ]}
              />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const gal = StyleSheet.create({
  root: { gap: 12 },
  slideWrap: { position: 'relative', borderRadius: 16, overflow: 'hidden' },
  slide: { height: 260, backgroundColor: colors.slate[100] },
  slideGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
  },
  badge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeText: { fontSize: 12, color: colors.white, fontWeight: '600' },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.slate[200],
  },
  dotActive: {
    width: 22,
    backgroundColor: colors.brand[500],
    borderRadius: 4,
  },
  empty: {
    height: 140,
    borderRadius: 16,
    backgroundColor: colors.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { fontSize: 13, color: colors.slate[400], fontWeight: '500' },
});

// ─── AI Status Card ──────────────────────────────────────────────────────────

type AiEntry = { icon: string; color: string; title: string; note: string };

function AiStatusCard({
  report,
  isDark,
}: {
  report: ReportDetail;
  isDark: boolean;
}) {
  const { aiFlagged, aiImageVerified, aiImageNotes, aiFlagReason, aiHasDuplicate } = report;

  const entries: AiEntry[] = [];

  if (aiImageVerified === true) {
    entries.push({
      icon: 'shield-checkmark',
      color: colors.severity.low,
      title: 'AI Verified',
      note: aiImageNotes ?? 'Photo evidence confirmed flooding.',
    });
  }
  if (aiImageVerified === false) {
    entries.push({
      icon: 'image-outline',
      color: colors.severity.moderate,
      title: 'Image Under Review',
      note: aiImageNotes ?? 'Our AI could not confirm flooding in the submitted photo.',
    });
  }
  if (aiHasDuplicate) {
    entries.push({
      icon: 'copy-outline',
      color: colors.severity.moderate,
      title: 'Possible Duplicate',
      note: 'A similar report was already submitted nearby. An admin will review.',
    });
  }
  if (aiFlagged) {
    entries.push({
      icon: 'alert-circle-outline',
      color: colors.severity.high,
      title: 'Under Admin Review',
      note: aiFlagReason ?? 'Your report has been flagged for manual review.',
    });
  }
  if (entries.length === 0) {
    entries.push({
      icon: 'checkmark-circle-outline',
      color: colors.severity.low,
      title: 'Report Received',
      note: 'Your report looks good and is awaiting admin verification.',
    });
  }

  return (
    <View
      style={[
        aiS.outerCard,
        isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border },
      ]}
    >
      <View style={aiS.headerRow}>
        <LinearGradient
          colors={[colors.brand[500], colors.accent[500]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={aiS.sparkleWrap}
        >
          <Ionicons name="sparkles" size={11} color={colors.white} />
        </LinearGradient>
        <Text style={[aiS.headerLabel, isDark && { color: colors.slate[300] }]}>AI Analysis</Text>
      </View>
      <View style={{ gap: 10 }}>
        {entries.map((entry, i) => (
          <View
            key={i}
            style={[
              aiS.card,
              {
                borderColor: entry.color + '25',
                backgroundColor: isDark ? entry.color + '0C' : entry.color + '08',
              },
            ]}
          >
            <View style={[aiS.iconWrap, { backgroundColor: entry.color + '15' }]}>
              <Ionicons name={entry.icon as any} size={20} color={entry.color} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[aiS.title, { color: entry.color }]}>{entry.title}</Text>
              <Text style={[aiS.note, isDark && { color: colors.slate[400] }]}>{entry.note}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const aiS = StyleSheet.create({
  outerCard: {
    borderRadius: 20,
    padding: 16,
    gap: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate[100],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sparkleWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.slate[500],
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: { fontSize: 13, fontWeight: '700' },
  note: { fontSize: 12, color: colors.slate[500], lineHeight: 17 },
});

// ─── Section Card wrapper ────────────────────────────────────────────────────

function SectionCard({
  children,
  isDark,
  style,
}: {
  children: React.ReactNode;
  isDark: boolean;
  style?: any;
}) {
  return (
    <View
      style={[
        s.card,
        { backgroundColor: isDark ? colors.dark.card : colors.white },
        isDark && { borderColor: colors.dark.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function SectionLabel({ text, isDark }: { text: string; isDark: boolean }) {
  return (
    <Text style={[s.sectionTitle, isDark && { color: colors.white }]}>{text}</Text>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { token } = useAuth();

  const { showAlert } = useAlert();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editSeverity, setEditSeverity] = useState<Severity>('low');
  const [editDescription, setEditDescription] = useState('');
  const [editMedia, setEditMedia] = useState<MediaItem[]>([]);
  const [removingMedia, setRemovingMedia] = useState<string | null>(null);

  const isPending = report?.status === 'pending';
  const screenBg = isDark ? colors.dark.bg : colors.slate[50];

  function startEditing() {
    if (!report) return;
    setEditSeverity(report.severity);
    setEditDescription(report.description);
    setEditMedia(report.mediaItems);
    setEditing(true);
  }

  async function handleRemoveMedia(media: MediaItem) {
    if (!report || !token) return;
    setRemovingMedia(media.id);
    try {
      await deleteReportMedia(id, media.id, token);
      const updated = editMedia.filter((m) => m.id !== media.id);
      setEditMedia(updated);
      setReport({
        ...report,
        mediaItems: updated,
        mediaUrls: updated.map((m) => m.url),
        evidenceCount: updated.length,
      });
    } catch {
      showAlert({ type: 'error', title: 'Failed', message: 'Could not remove the photo.' });
    } finally {
      setRemovingMedia(null);
    }
  }

  async function handleSaveEdit() {
    if (!report || !token) return;
    setSaving(true);
    try {
      const updated = await updateReport(
        id,
        { severity: editSeverity, description: editDescription },
        token,
      );
      setReport(updated);
      setEditing(false);
      showAlert({ type: 'success', title: 'Updated', message: 'Your report has been updated.' });
    } catch {
      showAlert({
        type: 'error',
        title: 'Failed',
        message: 'Could not update the report. Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

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
          showAlert({
            type: 'error',
            title: 'Failed',
            message: 'Could not withdraw the report. Please try again.',
          });
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
      showAlert({
        type: 'error',
        title: 'Load Failed',
        message: 'Could not load report details. Check your connection.',
      });
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handleStatus = (data: { reportId: number | string }) => {
      if (String(data.reportId) === id) load();
    };
    socketService.on('report-status', handleStatus);
    return () => socketService.off('report-status', handleStatus);
  }, [id, load]);

  return (
    <View style={[s.root, { backgroundColor: screenBg }]}>
      {/* ── Hero Header ── */}
      <LinearGradient
        colors={[colors.brand[600], colors.brand[700], colors.brand[900]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.header, { paddingTop: insets.top + 8 }]}
      >
        {/* Top row: back + actions */}
        <View style={s.headerTopRow}>
          <Pressable
            onPress={() => router.back()}
            style={s.headerIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={20} color={colors.white} />
          </Pressable>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            {report && isPending && !editing && (
              <Pressable
                onPress={startEditing}
                style={s.headerIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Edit report"
                hitSlop={8}
              >
                <Ionicons name="create-outline" size={18} color={colors.white} />
              </Pressable>
            )}
            {report && isPending && editing && (
              <Pressable
                onPress={() => setEditing(false)}
                style={s.headerIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Cancel editing"
                hitSlop={8}
              >
                <Ionicons name="close" size={18} color={colors.white} />
              </Pressable>
            )}
            {report && !isPending && (
              <Pressable
                onPress={handleShare}
                style={s.headerIconBtn}
                accessibilityRole="button"
                accessibilityLabel="Share report"
                hitSlop={8}
              >
                <Ionicons name="share-outline" size={18} color={colors.white} />
              </Pressable>
            )}
          </View>
        </View>

        {/* Title area */}
        {report && (
          <View style={s.headerContent}>
            <View style={s.headerRefRow}>
              <View style={s.refPill}>
                <Text style={s.refPillText}>{report.reference}</Text>
              </View>
            </View>
            <Text style={s.headerTitle} numberOfLines={2}>
              {report.title}
            </Text>
            <View style={s.headerChips}>
              <SeverityChip level={report.severity} />
              <StatusBadge status={report.status} />
            </View>
          </View>
        )}
        {!report && !loading && (
          <View style={s.headerContent}>
            <Text style={s.headerTitle}>Report detail</Text>
          </View>
        )}
      </LinearGradient>

      {/* Loading */}
      {loading && (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.brand[500]} />
        </View>
      )}

      {/* Error */}
      {!loading && error && (
        <View style={s.centered}>
          <View style={s.errorIcon}>
            <Ionicons name="cloud-offline-outline" size={36} color={colors.slate[300]} />
          </View>
          <Text style={[s.errorText, isDark && { color: colors.slate[400] }]}>{error}</Text>
          <Pressable
            onPress={load}
            style={({ pressed }) => [s.retryBtn, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
          >
            <Text style={s.retryText}>Try Again</Text>
          </Pressable>
        </View>
      )}

      {/* Content */}
      {!loading && !error && report && (
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Edit form (pending only) ── */}
          {editing && (
            <>
              <SectionCard isDark={isDark}>
                <SectionLabel text="Edit Report" isDark={isDark} />

                <Text
                  style={[
                    metaStyles.label,
                    isDark && { color: colors.slate[500] },
                    { marginBottom: 6 },
                  ]}
                >
                  Severity
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {(['low', 'moderate', 'high', 'critical'] as Severity[]).map((sev) => (
                    <Pressable
                      key={sev}
                      onPress={() => setEditSeverity(sev)}
                      style={[
                        editS.sevBtn,
                        editSeverity === sev && {
                          backgroundColor: sevColor(sev),
                          borderColor: sevColor(sev),
                        },
                        isDark && editSeverity !== sev && { borderColor: colors.slate[600] },
                      ]}
                    >
                      <Text
                        style={[
                          editS.sevBtnText,
                          editSeverity === sev && { color: colors.white },
                          isDark && editSeverity !== sev && { color: colors.slate[300] },
                        ]}
                      >
                        {sev.charAt(0).toUpperCase() + sev.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text
                  style={[
                    metaStyles.label,
                    isDark && { color: colors.slate[500] },
                    { marginTop: 16, marginBottom: 6 },
                  ]}
                >
                  Description
                </Text>
                <TextInput
                  value={editDescription}
                  onChangeText={setEditDescription}
                  style={[
                    editS.input,
                    editS.textArea,
                    isDark && {
                      backgroundColor: colors.dark.elevated,
                      color: colors.white,
                      borderColor: colors.dark.border,
                    },
                  ]}
                  placeholder="Describe the situation..."
                  placeholderTextColor={colors.slate[400]}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />

                <Pressable
                  onPress={handleSaveEdit}
                  disabled={saving}
                  style={({ pressed }) => [
                    editS.saveBtn,
                    pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
                    saving && { opacity: 0.6 },
                  ]}
                >
                  <LinearGradient
                    colors={[colors.brand[500], colors.brand[600]]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={editS.saveBtnGradient}
                  >
                    {saving ? (
                      <ActivityIndicator size="small" color={colors.white} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                        <Text style={editS.saveBtnText}>Save Changes</Text>
                      </>
                    )}
                  </LinearGradient>
                </Pressable>
              </SectionCard>

              <SectionCard isDark={isDark}>
                <SectionLabel text="Photos" isDark={isDark} />
                {editMedia.length === 0 ? (
                  <View
                    style={[gal.empty, isDark && { backgroundColor: colors.dark.elevated }]}
                  >
                    <View
                      style={[gal.emptyIcon, isDark && { backgroundColor: colors.dark.border }]}
                    >
                      <Ionicons name="image-outline" size={28} color={colors.slate[400]} />
                    </View>
                    <Text style={[gal.emptyText, isDark && { color: colors.slate[500] }]}>
                      No photos remaining
                    </Text>
                  </View>
                ) : (
                  <View style={editS.photoGrid}>
                    {editMedia.map((m) => (
                      <View key={m.id} style={editS.photoItem}>
                        <Image
                          source={{ uri: m.url }}
                          style={editS.photoImage}
                          resizeMode="cover"
                        />
                        <LinearGradient
                          colors={['transparent', 'rgba(0,0,0,0.3)']}
                          style={StyleSheet.absoluteFill}
                          pointerEvents="none"
                        />
                        <Pressable
                          onPress={() => handleRemoveMedia(m)}
                          disabled={removingMedia === m.id}
                          style={({ pressed }) => [
                            editS.removeBtn,
                            pressed && { opacity: 0.7 },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel="Remove photo"
                        >
                          {removingMedia === m.id ? (
                            <ActivityIndicator size={12} color={colors.white} />
                          ) : (
                            <Ionicons name="close" size={14} color={colors.white} />
                          )}
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </SectionCard>
            </>
          )}

          {/* ── Details card (meta rows with icons) ── */}
          {!editing && (
            <SectionCard isDark={isDark}>
              <SectionLabel text="Details" isDark={isDark} />
              <View style={{ gap: 14 }}>
                <MetaRow icon="water-outline" label="Hazard Type" value={report.type} isDark={isDark} />
                <MetaRow icon="person-outline" label="Reported by" value={report.reportedBy} isDark={isDark} />
                <MetaRow icon="location-outline" label="Location" value={report.address} isDark={isDark} />
                <MetaRow icon="time-outline" label="Reported at" value={report.reportedAt} isDark={isDark} />
              </View>
            </SectionCard>
          )}

          {/* ── AI Analysis ── */}
          {!editing && <AiStatusCard report={report} isDark={isDark} />}

          {/* ── Map snippet ── */}
          {!editing && (
            <SectionCard isDark={isDark}>
              <SectionLabel text="Location" isDark={isDark} />
              <View
                style={[s.mapSnippet, isDark && { backgroundColor: colors.dark.elevated }]}
              >
                <View style={s.mapPinWrap}>
                  <Ionicons name="location" size={24} color={colors.brand[500]} />
                </View>
                <Text
                  style={[s.mapSnippetText, isDark && { color: colors.slate[400] }]}
                  numberOfLines={2}
                >
                  {report.address}
                </Text>
              </View>
            </SectionCard>
          )}

          {/* ── Photo evidence ── */}
          {!editing && (
            <SectionCard isDark={isDark}>
              <View style={s.sectionTitleRow}>
                <SectionLabel text="Evidence" isDark={isDark} />
                {(report.mediaUrls?.length ?? 0) > 0 && (
                  <View style={s.countPill}>
                    <Text style={s.countPillText}>{report.mediaUrls.length}</Text>
                  </View>
                )}
              </View>
              <PhotoGallery urls={report.mediaUrls ?? []} isDark={isDark} />
            </SectionCard>
          )}

          {/* ── Description ── */}
          {!editing && report.description ? (
            <SectionCard isDark={isDark}>
              <SectionLabel text="Description" isDark={isDark} />
              <Text style={[s.description, isDark && { color: colors.slate[400] }]}>
                {report.description}
              </Text>
            </SectionCard>
          ) : null}

          {/* ── Status timeline ── */}
          <SectionCard isDark={isDark}>
            <SectionLabel text="Status Timeline" isDark={isDark} />
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
          </SectionCard>

          {/* ── Responder updates ── */}
          {report.updates.length > 0 && (
            <SectionCard isDark={isDark}>
              <SectionLabel text="Responder Updates" isDark={isDark} />
              <View style={{ gap: 10 }}>
                {report.updates.map((u, i) => (
                  <View
                    key={i}
                    style={[
                      s.updateCard,
                      isDark && {
                        backgroundColor: colors.dark.elevated,
                        borderColor: colors.dark.border,
                      },
                    ]}
                  >
                    <View style={s.updateHeader}>
                      <View style={s.updateAvatar}>
                        <Ionicons name="person" size={12} color={colors.brand[500]} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.updateAuthor, isDark && { color: colors.white }]}>
                          {u.author}
                        </Text>
                        <Text style={[s.updateTime, isDark && { color: colors.slate[600] }]}>
                          {u.time}
                        </Text>
                      </View>
                    </View>
                    <Text style={[s.updateNote, isDark && { color: colors.slate[400] }]}>
                      {u.note}
                    </Text>
                  </View>
                ))}
              </View>
            </SectionCard>
          )}

          {/* ── Message responder ── */}
          {(report.status === 'assigned' || report.status === 'resolved') && (
            <Pressable
              onPress={() => router.push(`/resident/report/${id}/chat` as never)}
              style={({ pressed }) => [
                s.messageBtn,
                isDark && {
                  backgroundColor: colors.dark.card,
                  borderColor: colors.dark.border,
                },
                pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Message responder"
            >
              <LinearGradient
                colors={[colors.brand[500] + '18', colors.accent[500] + '10']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={s.messageBtnIcon}
              >
                <Ionicons name="chatbubbles" size={20} color={colors.brand[500]} />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={[s.messageBtnTitle, isDark && { color: colors.white }]}>
                  Message Responder
                </Text>
                <Text style={[s.messageBtnSub, isDark && { color: colors.slate[500] }]}>
                  Chat with the assigned responder
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={16}
                color={isDark ? colors.slate[600] : colors.slate[300]}
              />
            </Pressable>
          )}

          {/* ── Withdraw (pending only) ── */}
          {report.status === 'pending' && (
            <Pressable
              style={({ pressed }) => [
                s.withdrawBtn,
                isDark && {
                  borderColor: colors.severity.critical + '30',
                  backgroundColor: colors.severity.critical + '0C',
                },
                pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] },
              ]}
              onPress={handleWithdraw}
              accessibilityRole="button"
              accessibilityLabel="Withdraw this report"
            >
              <Ionicons name="close-circle-outline" size={18} color={colors.severity.critical} />
              <Text style={s.withdrawText}>Withdraw this report</Text>
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },

  /* Header */
  header: {
    paddingHorizontal: 20,
    paddingBottom: 22,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContent: { gap: 10 },
  headerRefRow: { flexDirection: 'row' },
  refPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  refPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.3,
  },
  headerChips: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 2,
  },

  /* Scroll */
  scroll: { padding: 12, paddingTop: 16, gap: 14 },

  /* Card */
  card: {
    borderRadius: 20,
    padding: 18,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.slate[100],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.slate[900],
    letterSpacing: -0.2,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  countPill: {
    backgroundColor: colors.brand[50],
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  countPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.brand[500],
  },

  /* Map */
  mapSnippet: {
    height: 110,
    borderRadius: 16,
    backgroundColor: colors.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapPinWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brand[500] + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapSnippetText: {
    fontSize: 13,
    color: colors.slate[500],
    fontWeight: '500',
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  /* Description */
  description: {
    fontSize: 14,
    color: colors.slate[600],
    lineHeight: 22,
  },

  /* Responder updates */
  updateCard: {
    backgroundColor: colors.slate[50],
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.slate[100],
  },
  updateHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  updateAvatar: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateAuthor: { fontSize: 13, fontWeight: '600', color: colors.slate[900] },
  updateTime: { fontSize: 11, color: colors.slate[400] },
  updateNote: { fontSize: 13, color: colors.slate[600], lineHeight: 19 },

  /* Error state */
  errorIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: { fontSize: 14, color: colors.slate[500], textAlign: 'center' },
  retryBtn: {
    backgroundColor: colors.brand[500],
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  /* Message responder CTA */
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.brand[500] + '20',
    shadowColor: colors.brand[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  messageBtnIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBtnTitle: { fontSize: 15, fontWeight: '700', color: colors.slate[900] },
  messageBtnSub: { fontSize: 12, color: colors.slate[400], marginTop: 1 },

  /* Withdraw */
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.severity.critical + '25',
    backgroundColor: colors.severity.critical + '08',
  },
  withdrawText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.severity.critical,
  },
});

const editS = StyleSheet.create({
  sevBtn: {
    flex: 1,
    minWidth: 70,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    alignItems: 'center',
  },
  sevBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.slate[600],
  },
  input: {
    fontSize: 14,
    color: colors.slate[900],
    backgroundColor: colors.slate[50],
    borderWidth: 1,
    borderColor: colors.slate[200],
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textArea: { minHeight: 100 },
  saveBtn: {
    marginTop: 16,
    borderRadius: 14,
    overflow: 'hidden',
  },
  saveBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoItem: {
    width: (GALLERY_W - 10) / 2,
    height: 130,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  photoImage: { width: '100%', height: '100%' },
  removeBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
