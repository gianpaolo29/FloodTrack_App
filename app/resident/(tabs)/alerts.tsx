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
import type { AlertItem } from '@/types';
import { useRouter } from 'expo-router';

const GRAD = colors.gradients.hero as [string, string, string];

// ─── HeaderOrb ───────────────────────────────────────────────────────────────
function HeaderOrb({ style }: { style: object }) {
  return <View style={[{ position: 'absolute', borderRadius: 999, backgroundColor: colors.overlay.whiteThin }, style]} />;
}

// ─── AlertCard ───────────────────────────────────────────────────────────────
function AlertCard({ alert, isDark, onPress }: {
  alert: AlertItem; isDark: boolean; onPress: () => void;
}) {
  const isCritical     = alert.kind === 'critical';
  const isStatusUpdate = alert.kind === 'status_update';
  const accentColor = isCritical ? colors.severity.critical : isStatusUpdate ? colors.severity.low : colors.gradients.cta[0];
  const iconName: keyof typeof Ionicons.glyphMap = isCritical ? 'alert-circle' : isStatusUpdate ? 'checkmark-circle' : 'information-circle';
  const cardBg  = isDark ? colors.dark.elevated : colors.white;
  const titleColor = alert.read ? (isDark ? colors.slate[400] : colors.slate[500]) : (isDark ? colors.white : colors.slate[900]);
  const kindLabel = isCritical ? 'Critical' : isStatusUpdate ? 'Update' : 'Advisory';
  const shortTime = alert.time.includes(',') ? alert.time.split(',').pop()?.trim() ?? alert.time : alert.time;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: cardBg, borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' },
        pressed && { opacity: 0.88, transform: [{ scale: 0.988 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={alert.title}
    >
      <View style={styles.cardInner}>
        <View style={styles.cardRow}>
          <View style={[styles.iconDot, { backgroundColor: accentColor + '18' }]}>
            <Ionicons name={iconName} size={18} color={accentColor} />
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, { color: titleColor, fontWeight: alert.read ? '500' : '700' }]} numberOfLines={1}>{alert.title}</Text>
            <View style={styles.cardMetaLine}>
              <Text style={[styles.kindTag, { color: accentColor }]}>{kindLabel}</Text>
              <View style={styles.metaDividerDot} />
              <Text style={[styles.cardTime, isDark && { color: colors.slate[500] }]}>{shortTime}</Text>
            </View>
          </View>
          {!alert.read && <View style={styles.unreadDot} />}
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
  const isCritical     = alert.kind === 'critical';
  const isStatusUpdate = alert.kind === 'status_update';
  const accentColor = isCritical ? colors.severity.critical : isStatusUpdate ? colors.severity.low : colors.gradients.cta[0];
  const iconName: keyof typeof Ionicons.glyphMap = isCritical ? 'alert-circle' : isStatusUpdate ? 'checkmark-circle' : 'information-circle';
  const kindLabel = isCritical ? 'Critical Alert' : isStatusUpdate ? 'Status Update' : 'Advisory';
  const cardBg = isDark ? colors.dark.card : colors.white;
  const borderColor = isDark ? colors.dark.border : colors.slate[100];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: screenBg }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: bottomInset + 30 }}
      showsVerticalScrollIndicator={false}
    >
      <Pressable onPress={onBack} style={d.backRow} accessibilityRole="button" accessibilityLabel="Back to alerts">
        <View style={[d.backBtn, { backgroundColor: accentColor + '14' }]}>
          <Ionicons name="chevron-back" size={18} color={accentColor} />
        </View>
        <Text style={[d.backLabel, { color: accentColor }]}>Alerts</Text>
      </Pressable>

      <View style={[d.emailCard, { backgroundColor: cardBg, borderColor }]}>
        <View style={[d.emailAccentBar, { backgroundColor: accentColor }]} />
        <View style={d.emailHeader}>
          <View style={d.emailFromRow}>
            <View style={[d.emailAvatar, { backgroundColor: accentColor + '14' }]}>
              <Ionicons name={iconName} size={20} color={accentColor} />
            </View>
            <View style={d.emailFromText}>
              <View style={d.emailFromNameRow}>
                <Text style={[d.emailFromName, isDark && { color: colors.white }]}>FloodTrack</Text>
                <View style={[d.kindChip, { backgroundColor: accentColor + '14' }]}>
                  <Text style={[d.kindChipText, { color: accentColor }]}>{kindLabel}</Text>
                </View>
              </View>
              <Text style={[d.emailDate, isDark && { color: colors.slate[500] }]}>{alert.time}</Text>
            </View>
          </View>
          <Text style={[d.emailSubject, isDark && { color: colors.white }]}>{alert.title}</Text>
        </View>
        <View style={[d.emailDivider, { backgroundColor: borderColor }]} />
        <View style={d.emailBody}>
          <Text style={[d.emailBodyText, isDark && { color: colors.slate[300] }]}>
            {alert.body || 'No additional details provided.'}
          </Text>
        </View>
        <View style={[d.emailFooter, { borderTopColor: borderColor }]}>
          <Ionicons name="time-outline" size={13} color={isDark ? colors.slate[500] : colors.slate[400]} />
          <Text style={[d.emailFooterText, isDark && { color: colors.slate[500] }]}>Issued at {alert.time}</Text>
        </View>
      </View>

      {onViewReport && (
        <Pressable onPress={onViewReport} style={({ pressed }) => [d.ctaWrap, pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] }]}>
          <LinearGradient colors={colors.gradients.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={d.ctaBtn}>
            <Text style={d.ctaText}>View Incident Report</Text>
            <View style={d.ctaArrow}>
              <Ionicons name="arrow-forward" size={16} color={colors.gradients.cta[0]} />
            </View>
          </LinearGradient>
        </Pressable>
      )}
    </ScrollView>
  );
}

const d = StyleSheet.create({
  backRow:        { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  backBtn:        { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  backLabel:      { fontSize: 15, fontWeight: '700' },
  emailCard:      { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  emailAccentBar: { height: 4 },
  emailHeader:    { padding: 16, gap: 14 },
  emailFromRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emailAvatar:    { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  emailFromText:  { flex: 1, gap: 2 },
  emailFromNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emailFromName:  { fontSize: 15, fontWeight: '700', color: colors.slate[900] },
  emailDate:      { fontSize: 12, color: colors.slate[400], fontWeight: '500', marginTop: 1 },
  emailSubject:   { fontSize: 18, fontWeight: '800', color: colors.slate[900], letterSpacing: -0.2, lineHeight: 24 },
  emailDivider:   { height: 1, marginHorizontal: 16 },
  emailBody:      { padding: 16 },
  emailBodyText:  { fontSize: 14, color: colors.slate[600], lineHeight: 23 },
  emailFooter:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  emailFooterText: { fontSize: 11, color: colors.slate[400], fontWeight: '500' },
  kindChip:       { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start' },
  kindChipText:   { fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  ctaWrap:        { borderRadius: 14, overflow: 'hidden' },
  ctaBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 50, paddingHorizontal: 20 },
  ctaText:        { fontSize: 15, fontWeight: '800', color: colors.white, letterSpacing: 0.3 },
  ctaArrow:       { width: 26, height: 26, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
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
      setUnreadCount(data.filter(a => !a.read).length);
    } catch {
      setError('Could not load alerts. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  // Fetch fresh data every time the tab is focused
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Real-time: instantly insert/update alerts from socket data
  useEffect(() => {
    const handleNew = (raw: any) => {
      if (!raw?.id) return;
      const item = adaptAlert(raw);
      setAlerts(prev => {
        if (prev.some(a => a.id === item.id)) return prev;
        const updated = [item, ...prev];
        setUnreadCount(updated.filter(a => !a.read).length);
        return updated;
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
        setAlerts(prev => {
          const next = prev.map(a => a.id === alert.id ? { ...a, read: true } : a);
          setUnreadCount(next.filter(a => !a.read).length);
          return next;
        });
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
              {unreadCount > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
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
        <Text style={styles.headerSub}>
          {loading ? 'Loading notifications…' : unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}` : "You're all caught up"}
        </Text>
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
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 108 },
            alerts.length === 0 && styles.scrollEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={colors.gradients.cta[0]}
              colors={[colors.gradients.cta[0]]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {alerts.map(a => (
            <AlertCard key={a.id} alert={a} isDark={isDark} onPress={() => handleAlertPress(a)} />
          ))}
          {alerts.length === 0 && (
            <View style={styles.emptyState}>
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
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 32 },

  headerGradient: { paddingHorizontal: 22, paddingBottom: 22, overflow: 'hidden' },
  headerTop:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerLeft:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIconWrap: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  headerBadge:    { position: 'absolute', top: -5, right: -5, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.severity.critical, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: colors.gradients.cta[1] },
  headerBadgeText: { fontSize: 9, fontWeight: '900', color: colors.white },
  headerTitle:    { fontSize: 26, fontWeight: '800', color: colors.white, letterSpacing: -0.3 },
  markAllPill:    { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 22, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  markAllText:    { fontSize: 12, color: colors.white, fontWeight: '700' },
  headerSub:      { fontSize: 13, color: 'rgba(255,255,255,0.65)', letterSpacing: 0.1, marginTop: 2 },

  waveWrap:  { height: 24, position: 'relative', marginTop: -1 },
  waveShape: { position: 'absolute', bottom: 0, left: -12, right: -12, height: 28, borderTopLeftRadius: 24, borderTopRightRadius: 24 },

  scroll:      { paddingHorizontal: 16, gap: 8, paddingTop: 4 },
  scrollEmpty: { flexGrow: 1, justifyContent: 'center' },


  card:           { borderRadius: 14, borderWidth: 1, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardInner:      { paddingHorizontal: 14, paddingVertical: 12 },
  cardRow:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconDot:        { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  cardContent:    { flex: 1, gap: 3 },
  cardTitle:      { fontSize: 14, lineHeight: 19 },
  unreadDot:      { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand[500], marginRight: 2 },
  cardMetaLine:   { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kindTag:        { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  metaDividerDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.slate[300] },
  cardTime:       { fontSize: 11, color: colors.slate[400], fontWeight: '500' },

  emptyState:     { alignItems: 'center', gap: 18 },
  emptyTitle:     { fontSize: 21, fontWeight: '800', color: colors.slate[900], letterSpacing: -0.2 },
  emptySub:       { fontSize: 14, color: colors.slate[400], textAlign: 'center', lineHeight: 22 },
  loadingText:    { fontSize: 14, color: colors.slate[500], fontWeight: '500' },
  retryBtn:       { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  retryBtnGrad:   { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 24, paddingVertical: 13 },
  retryText:      { color: colors.white, fontWeight: '800', fontSize: 14 },
});
