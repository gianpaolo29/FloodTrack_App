import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useAlertBadge } from '@/context/AlertBadgeContext';
import { getAlertsWithReadState, markAlertRead, markAllAlertsRead, markUserNotificationRead, markAllUserNotificationsRead, adaptAlert } from '@/services/api';
import { socketService } from '@/services/socket';
import { getNotificationPrefs } from '@/services/notifications';
import type { AlertItem } from '@/types';
import { useRouter } from 'expo-router';

const GRAD = colors.gradients.hero as [string, string, string];

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  if (isNaN(then)) return dateStr;
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dateGroup(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Other';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const alertDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (alertDay.getTime() === today.getTime()) return 'Today';
  if (alertDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

type IoniconsName = keyof typeof Ionicons.glyphMap;

const KIND_CONFIG: Record<string, { icon: IoniconsName; color: string; label: string; pillBg: string }> = {
  critical:      { icon: 'warning',            color: colors.severity.critical, label: 'Critical',  pillBg: colors.severity.critical + '14' },
  rejected:      { icon: 'close-circle',       color: colors.severity.critical, label: 'Rejected',  pillBg: colors.severity.critical + '14' },
  status_update: { icon: 'arrow-up-circle',    color: colors.severity.low,      label: 'Update',    pillBg: colors.severity.low + '14' },
  advisory:      { icon: 'information-circle', color: colors.brand[500],        label: 'Advisory',  pillBg: colors.brand[500] + '14' },
};

// ─── HeaderOrb ───────────────────────────────────────────────────────────────
function HeaderOrb({ style }: { style: object }) {
  return <View style={[{ position: 'absolute', borderRadius: 999, backgroundColor: colors.overlay.whiteThin }, style]} />;
}

// ─── AlertCard ───────────────────────────────────────────────────────────────
function AlertCard({ alert, isDark, onPress }: {
  alert: AlertItem; isDark: boolean; onPress: () => void;
}) {
  const cfg = KIND_CONFIG[alert.kind] ?? KIND_CONFIG.advisory;
  const titleColor = alert.read ? (isDark ? colors.slate[400] : colors.slate[500]) : (isDark ? colors.white : colors.slate[900]);
  const timeStr = relativeTime(alert.createdAt);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isDark && { backgroundColor: colors.dark.elevated },
        !alert.read && !isDark && { backgroundColor: '#F8FAFF' },
        !alert.read && isDark && { backgroundColor: colors.dark.card },
        pressed && { opacity: 0.88, transform: [{ scale: 0.988 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={alert.title}
    >
      {!alert.read && <View style={[styles.unreadBar, { backgroundColor: cfg.color }]} />}
      <View style={styles.cardInner}>
        <View style={styles.cardRow}>
          <View style={[styles.iconDot, { backgroundColor: cfg.pillBg }]}>
            <Ionicons name={cfg.icon} size={18} color={cfg.color} />
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: titleColor, fontWeight: alert.read ? '500' : '700' }]} numberOfLines={1}>{alert.title}</Text>
            <View style={styles.cardMetaLine}>
              <View style={[styles.kindPill, { backgroundColor: cfg.pillBg }]}>
                <Text style={[styles.kindPillText, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
              <Text style={[styles.cardTime, isDark && { color: colors.slate[500] }]}>{timeStr}</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={isDark ? colors.slate[600] : colors.slate[300]} />
        </View>
      </View>
    </Pressable>
  );
}


// ─── AlertDetail ──────────────────────────────────────────────────────────────
function AlertDetail({ alert, isDark, screenBg, bottomInset, onBack, onViewReport }: {
  alert: AlertItem; isDark: boolean; screenBg: string; bottomInset: number;
  onBack: () => void; onViewReport?: () => void;
}) {
  const cfg = KIND_CONFIG[alert.kind] ?? KIND_CONFIG.advisory;
  const accentColor = cfg.color;
  const iconName = cfg.icon;
  const kindLabel = alert.kind === 'rejected' ? 'Report Rejected'
    : alert.kind === 'critical' ? 'Critical Alert'
    : alert.kind === 'status_update' ? 'Status Update'
    : 'Advisory';
  const cardBg = isDark ? colors.dark.card : colors.white;
  const borderColor = isDark ? colors.dark.border : colors.slate[100];

  const timeStr = relativeTime(alert.createdAt);

  return (
    <View style={{ flex: 1, backgroundColor: screenBg }}>
      <View style={[d.backRowFixed, { backgroundColor: screenBg }]}>
        <Pressable onPress={onBack} style={d.backRow} accessibilityRole="button" accessibilityLabel="Back to alerts">
          <View style={[d.backBtn, { backgroundColor: isDark ? colors.dark.elevated : colors.slate[100] }]}>
            <Ionicons name="chevron-back" size={18} color={isDark ? colors.white : colors.slate[700]} />
          </View>
          <Text style={[d.backLabel, { color: isDark ? colors.white : colors.slate[700] }]}>Alerts</Text>
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottomInset + 30 }}
        showsVerticalScrollIndicator={false}
      >
      <View style={[d.detailCard, { backgroundColor: cardBg, borderColor }]}>
        <View style={[d.detailAccent, { backgroundColor: accentColor }]} />

        {/* Header: icon + kind + time */}
        <View style={d.detailHeader}>
          <View style={[d.detailIconWrap, { backgroundColor: accentColor + '14' }]}>
            <Ionicons name={iconName} size={22} color={accentColor} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={[d.kindChip, { backgroundColor: accentColor + '14', alignSelf: 'flex-start' }]}>
              <Text style={[d.kindChipText, { color: accentColor }]}>{kindLabel}</Text>
            </View>
          </View>
          <View style={d.detailTimeRow}>
            <Ionicons name="time-outline" size={12} color={isDark ? colors.slate[500] : colors.slate[400]} />
            <Text style={[d.detailTime, isDark && { color: colors.slate[500] }]}>{timeStr}</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={[d.detailTitle, isDark && { color: colors.white }]}>{alert.title}</Text>

        {/* Divider */}
        <View style={[d.detailDivider, { backgroundColor: borderColor }]} />

        {/* Body */}
        <Text style={[d.detailBody, isDark && { color: colors.slate[300] }]}>
          {alert.body || 'No additional details provided.'}
        </Text>
      </View>

      {onViewReport && (
        <Pressable onPress={onViewReport} style={({ pressed }) => [d.ctaWrap, pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] }]}>
          <LinearGradient colors={['#00D2FF', '#4A6CF7', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={d.ctaBtn}>
            <Text style={d.ctaText}>View Report</Text>
            <View style={d.ctaArrow}>
              <Ionicons name="arrow-forward" size={16} color="#4A6CF7" />
            </View>
          </LinearGradient>
        </Pressable>
      )}
    </ScrollView>
    </View>
  );
}

const d = StyleSheet.create({
  backRowFixed:    { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 6 },
  backRow:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn:         { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  backLabel:       { fontSize: 15, fontWeight: '700' },

  detailCard:      { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 16 },
  detailAccent:    { height: 3 },
  detailHeader:    { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, paddingBottom: 10 },
  detailIconWrap:  { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  detailTimeRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailTime:      { fontSize: 11, color: colors.slate[400], fontWeight: '500' },
  detailTitle:     { fontSize: 18, fontWeight: '800', color: colors.slate[900], letterSpacing: -0.2, lineHeight: 24, paddingHorizontal: 16, paddingBottom: 12 },
  detailDivider:   { height: 1, marginHorizontal: 16 },
  detailBody:      { fontSize: 14, color: colors.slate[600], lineHeight: 23, padding: 16 },

  kindChip:        { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  kindChipText:    { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

  ctaWrap:         { borderRadius: 14, overflow: 'hidden' },
  ctaBtn:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 50, paddingHorizontal: 20 },
  ctaText:         { fontSize: 15, fontWeight: '800', color: colors.white, letterSpacing: 0.3 },
  ctaArrow:        { width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
});

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function AlertsScreen() {
  const insets    = useSafeAreaInsets();
  const scheme    = useColorScheme();
  const isDark    = scheme === 'dark';
  const { token } = useAuth();
  const { setUnreadCount } = useAlertBadge();
  const router = useRouter();

  const [alerts, setAlerts]               = useState<AlertItem[]>([]);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);

  const screenBg = isDark ? colors.dark.bg : colors.slate[50];

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      const data = await getAlertsWithReadState(token);
      setAlerts(data);
      queueMicrotask(() => setUnreadCount(data.filter(a => !a.read).length));
    } catch {
      setError('Could not load alerts. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  // Fetch fresh data and reset detail view every time the tab is focused
  useFocusEffect(
    useCallback(() => {
      setSelectedAlert(null);
      load();
    }, [load])
  );

  // Real-time: instantly insert/update alerts from socket data
  useEffect(() => {
    const handleNew = async (raw: any) => {
      if (!raw?.id) return;
      const prefs = await getNotificationPrefs();
      const kind = raw.type; // 'critical' | 'advisory' | 'update'
      if (kind === 'critical' && !prefs.critical) return;
      if (kind === 'advisory' && !prefs.advisory) return;
      if (kind === 'update'   && !prefs.myReports) return;
      const item = adaptAlert(raw);
      setAlerts(prev => {
        if (prev.some(a => a.id === item.id)) return prev;
        return [item, ...prev];
      });
    };

    const handleUpdated = (raw: any) => {
      if (!raw?.id) return;
      const item = adaptAlert(raw);
      setAlerts(prev => {
        const idx = prev.findIndex(a => a.id === item.id);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...item, read: prev[idx].read };
        return updated;
      });
    };

    const refresh = () => load(true);

    socketService.on('new-alert', handleNew);
    socketService.on('alert-updated', handleUpdated);
    socketService.on('new-notification', refresh);
    return () => {
      socketService.off('new-alert', handleNew);
      socketService.off('alert-updated', handleUpdated);
      socketService.off('new-notification', refresh);
    };
  }, [load]);

  async function handleAlertPress(alert: AlertItem) {
    try {
      if (!alert.read) {
        if (alert.id.startsWith('notif_')) {
          await markUserNotificationRead(alert.id, token!);
        } else {
          await markAlertRead(alert.id, token!);
        }
        setAlerts(prev =>
          prev.map(a => a.id === alert.id ? { ...a, read: true } : a)
        );
        queueMicrotask(() => setUnreadCount(c => Math.max(0, c - 1)));
      }
    } catch {}
    setSelectedAlert(alert);
  }

  async function handleMarkAllRead() {
    try {
      await Promise.all([
        markAllAlertsRead([], token!),
        markAllUserNotificationsRead(token!),
      ]);
      setAlerts(prev => prev.map(a => ({ ...a, read: true })));
      setUnreadCount(0);
    } catch {}
  }

  const unreadCount  = alerts.filter(a => !a.read).length;

  // Group alerts by date
  const sections = useMemo(() => {
    const groups: { title: string; data: AlertItem[] }[] = [];
    for (const a of alerts) {
      const g = dateGroup(a.createdAt);
      const existing = groups.find(s => s.title === g);
      if (existing) existing.data.push(a);
      else groups.push({ title: g, data: [a] });
    }
    return groups;
  }, [alerts]);

  const renderAlert = useCallback(({ item, index }: { item: AlertItem; index: number }) => {
    const group = dateGroup(item.createdAt);
    const prevGroup = index > 0 ? dateGroup(alerts[index - 1].createdAt) : null;
    const showHeader = group !== prevGroup;
    return (
      <>
        {showHeader && (
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, isDark && { color: colors.slate[400] }]}>{group}</Text>
          </View>
        )}
        <AlertCard alert={item} isDark={isDark} onPress={() => handleAlertPress(item)} />
      </>
    );
  }, [isDark, alerts]);

  // ── Render ──
  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>
      {/* Header — always visible */}
      <LinearGradient colors={GRAD} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.headerGradient, { paddingTop: insets.top + 10 }]}>
        <HeaderOrb style={{ width: 180, height: 180, top: -60, right: -50 }} />
        <HeaderOrb style={{ width: 100, height: 100, top: 30, left: -30, backgroundColor: colors.overlay.whiteSubtle }} />
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="notifications" size={22} color="rgba(255,255,255,0.92)" />
            </View>
            <Text style={styles.headerTitle}>Alerts</Text>
          </View>
          {unreadCount > 0 && (
            <Pressable onPress={handleMarkAllRead} style={({ pressed }) => [styles.markAllPill, pressed && { opacity: 0.8 }]}>
              <Ionicons name="checkmark-done" size={14} color={colors.white} />
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>
          )}
        </View>
      </LinearGradient>
      <View style={[styles.waveWrap, { backgroundColor: screenBg }]}>
        <LinearGradient colors={colors.gradients.wave as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
        <View style={[styles.waveShape, { backgroundColor: screenBg }]} />
      </View>

      {/* Detail view */}
      {selectedAlert ? (
        <AlertDetail
          alert={selectedAlert}
          isDark={isDark}
          screenBg={screenBg}
          bottomInset={insets.bottom}
          onBack={() => setSelectedAlert(null)}
          onViewReport={selectedAlert.reportId ? () => {
            const id = selectedAlert.reportId;
            setSelectedAlert(null);
            router.push(`/resident/report/${id}`);
          } : undefined}
        />
      ) : loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.gradients.cta[0]} />
          <Text style={[styles.loadingText, isDark && { color: colors.slate[400] }]}>Fetching alerts…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={40} color={colors.gradients.cta[0]} />
          <Text style={[styles.emptyTitle, isDark && { color: colors.white }]}>Connection issue</Text>
          <Text style={[styles.emptySub, isDark && { color: colors.slate[400] }]}>{error}</Text>
          <Pressable onPress={() => load()} style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={colors.gradients.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.retryBtnGrad}>
              <Ionicons name="refresh" size={16} color={colors.white} />
              <Text style={styles.retryText}>Try again</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : alerts.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="notifications-off-outline" size={44} color={colors.gradients.cta[0]} />
          <Text style={[styles.emptyTitle, isDark && { color: colors.white }]}>All quiet</Text>
          <Text style={[styles.emptySub, isDark && { color: colors.slate[400] }]}>
            No active alerts right now.{'\n'}Critical incidents will appear here immediately.
          </Text>
          <Pressable onPress={() => load()} style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={colors.gradients.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.retryBtnGrad}>
              <Ionicons name="refresh-outline" size={16} color={colors.white} />
              <Text style={styles.retryText}>Refresh</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={alerts}
          renderItem={renderAlert}
          keyExtractor={a => a.id}
          contentContainerStyle={[styles.scroll, { paddingBottom: 40 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={colors.gradients.cta[0]}
              colors={[colors.gradients.cta[0]]}
            />
          }
          stickyHeaderHiddenOnScroll
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 32 },

  headerGradient: { paddingHorizontal: 22, paddingBottom: 14, overflow: 'hidden' },
  headerTop:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerLeft:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIconWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  headerBadge:    { position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.severity.critical, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: colors.gradients.cta[1] },
  headerBadgeText: { fontSize: 9, fontWeight: '900', color: colors.white },
  headerTitle:    { fontSize: 26, fontWeight: '800', color: colors.white, letterSpacing: -0.3 },
  markAllPill:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  markAllText:    { fontSize: 12, color: colors.white, fontWeight: '700' },
  headerSub:      { fontSize: 13, color: 'rgba(255,255,255,0.65)', letterSpacing: 0.1, marginTop: 2 },

  waveWrap:  { height: 16, position: 'relative', marginTop: -1 },
  waveShape: { position: 'absolute', bottom: 0, left: -12, right: -12, height: 20, borderTopLeftRadius: 18, borderTopRightRadius: 18 },

  scroll:      { paddingHorizontal: 16, paddingTop: 0 },
  scrollEmpty: { flexGrow: 1, justifyContent: 'center' },


  sectionHeader:  { paddingTop: 6, paddingBottom: 3, paddingHorizontal: 4 },
  sectionTitle:   { fontSize: 11, fontWeight: '700', color: colors.slate[400], textTransform: 'uppercase', letterSpacing: 0.8 },

  card:           { borderRadius: 14, overflow: 'hidden', backgroundColor: colors.white },
  unreadBar:      { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  cardInner:      { paddingHorizontal: 14, paddingVertical: 13 },
  cardRow:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconDot:        { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardContent:    { flex: 1, gap: 4 },
  cardTitle:      { fontSize: 14, lineHeight: 19 },
  cardMetaLine:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kindPill:       { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  kindPillText:   { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  cardTime:       { fontSize: 11, color: colors.slate[400], fontWeight: '500' },

  emptyState:     { alignItems: 'center', gap: 18 },
  emptyTitle:     { fontSize: 21, fontWeight: '800', color: colors.slate[900], letterSpacing: -0.2 },
  emptySub:       { fontSize: 14, color: colors.slate[400], textAlign: 'center', lineHeight: 22 },
  loadingText:    { fontSize: 14, color: colors.slate[500], fontWeight: '500' },
  retryBtn:       { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  retryBtnGrad:   { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 24, paddingVertical: 13 },
  retryText:      { color: colors.white, fontWeight: '800', fontSize: 14 },
});
