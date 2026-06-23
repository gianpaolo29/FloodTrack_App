/**
 * Alerts screen — premium redesign
 * Gradient header · accent-bar cards · animated unread pulse
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
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getAlerts, markAllAlertsRead } from '@/services/api';
import type { AlertItem } from '@/types';

// ─── Animated unread pulse dot ────────────────────────────────────────────────

function PulseDot({ color }: { color: string }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale,   { toValue: 1.8, duration: 900, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 1,   duration: 900, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0,   duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.7, duration: 900, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);

  return (
    <View style={{ width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}>
      {/* Ripple ring */}
      <Animated.View
        style={{
          position: 'absolute',
          width: 12,
          height: 12,
          borderRadius: 6,
          backgroundColor: color,
          opacity,
          transform: [{ scale }],
        }}
      />
      {/* Solid dot */}
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

// ─── Alert card ───────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  isDark,
  onPress,
}: {
  alert: AlertItem;
  isDark: boolean;
  onPress: () => void;
}) {
  const isCritical     = alert.kind === 'critical';
  const isStatusUpdate = alert.kind === 'status_update';

  const accentColor = isCritical
    ? colors.severity.critical
    : isStatusUpdate
    ? colors.severity.low
    : colors.brand[500];

  const iconName = isCritical
    ? 'alert-circle'
    : isStatusUpdate
    ? 'checkmark-circle'
    : 'information-circle';

  const cardBg = isCritical
    ? isDark ? '#1E0808' : '#FFF5F5'
    : isDark  ? colors.slate[900] : colors.white;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: cardBg },
        pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${alert.title}. ${alert.body}`}
    >
      {/* Left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

      <View style={styles.cardInner}>
        {/* Top row: icon + title + time */}
        <View style={styles.cardTopRow}>
          {/* Icon */}
          <View style={[styles.iconWrap, { backgroundColor: accentColor + '18' }]}>
            <Ionicons name={iconName} size={18} color={accentColor} />
          </View>

          {/* Title + unread */}
          <View style={styles.cardTitleWrap}>
            <Text
              style={[
                styles.cardTitle,
                isDark && { color: colors.white },
                isCritical && { color: colors.severity.critical },
                !alert.read && { fontWeight: '700' },
              ]}
              numberOfLines={2}
            >
              {alert.title}
            </Text>
          </View>

          {/* Unread pulse or time */}
          <View style={styles.cardRight}>
            {!alert.read && <PulseDot color={accentColor} />}
            <View style={[styles.timePill, isDark && { backgroundColor: colors.slate[800] }]}>
              <Text style={[styles.timeText, isDark && { color: colors.slate[400] }]}>
                {alert.time}
              </Text>
            </View>
          </View>
        </View>

        {/* Body */}
        <Text
          style={[styles.cardBody, isDark && { color: colors.slate[400] }]}
          numberOfLines={2}
        >
          {alert.body}
        </Text>

        {/* Footer: area + kind badge */}
        <View style={styles.cardFooter}>
          <View style={styles.footerLeft}>
            <Ionicons name="location-outline" size={11} color={colors.slate[400]} />
            <Text style={[styles.footerText, isDark && { color: colors.slate[500] }]} numberOfLines={1}>
              {alert.area}
            </Text>
          </View>
          <View style={[styles.kindBadge, { backgroundColor: accentColor + '18' }]}>
            <Text style={[styles.kindText, { color: accentColor }]}>
              {isCritical ? 'Critical' : isStatusUpdate ? 'Update' : 'Advisory'}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionLabel({
  icon,
  label,
  count,
  color,
  isDark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
  color: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.sectionRow}>
      <View style={[styles.sectionIconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon} size={13} color={color} />
      </View>
      <Text style={[styles.sectionLabel, { color }]}>{label}</Text>
      <View style={[styles.sectionCount, { backgroundColor: color + '18' }]}>
        <Text style={[styles.sectionCountText, { color }]}>{count}</Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AlertsScreen() {
  const insets    = useSafeAreaInsets();
  const scheme    = useColorScheme();
  const isDark    = scheme === 'dark';
  const { token } = useAuth();

  const [alerts, setAlerts]         = useState<AlertItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      const data = await getAlerts(token!);
      setAlerts(data);
    } catch {
      setError('Could not load alerts. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function handleMarkAllRead() {
    try {
      await markAllAlertsRead(token!);
      setAlerts(prev => prev.map(a => ({ ...a, read: true })));
    } catch {
      // silent — dots persist until next load
    }
  }

  const criticals    = alerts.filter(a => a.kind === 'critical');
  const nonCriticals = alerts.filter(a => a.kind !== 'critical');
  const unreadCount  = alerts.filter(a => !a.read).length;

  const screenBg = isDark ? '#080C10' : '#F4F6F9';
  const headerBg = isDark ? '#0D1117' : colors.brand[600];

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>

      {/* ── Premium header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 6, backgroundColor: headerBg }]}>
        {/* Top row */}
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="notifications" size={20} color="rgba(255,255,255,0.9)" />
              {unreadCount > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.headerTitle}>Alerts</Text>
          </View>

          {unreadCount > 0 && (
            <Pressable
              onPress={handleMarkAllRead}
              style={styles.markAllPill}
              accessibilityRole="button"
              accessibilityLabel="Mark all as read"
            >
              <Ionicons name="checkmark-done" size={13} color={colors.white} />
              <Text style={styles.markAllText}>Mark all read</Text>
            </Pressable>
          )}
        </View>

        {/* Subtitle */}
        <Text style={styles.headerSub}>
          {loading
            ? 'Loading…'
            : unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
            : "You're all caught up"}
        </Text>

        {/* Decorative bottom curve */}
        <View style={styles.headerCurve} />
      </View>

      {/* ── Loading ── */}
      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.brand[500]} />
        </View>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <View style={styles.centered}>
          <View style={[styles.errorIconWrap, isDark && { backgroundColor: colors.slate[900] }]}>
            <Ionicons name="cloud-offline-outline" size={36} color={colors.slate[400]} />
          </View>
          <Text style={[styles.errorTitle, isDark && { color: colors.white }]}>
            Connection issue
          </Text>
          <Text style={[styles.errorBody, isDark && { color: colors.slate[400] }]}>{error}</Text>
          <Pressable onPress={() => load()} style={styles.retryBtn} accessibilityRole="button">
            <Ionicons name="refresh" size={15} color={colors.white} />
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      )}

      {/* ── List ── */}
      {!loading && !error && (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 100 },
            alerts.length === 0 && styles.scrollEmpty,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(true); }}
              tintColor={colors.brand[400]}
              colors={[colors.brand[500]]}
            />
          }
          showsVerticalScrollIndicator={false}
        >

          {/* Critical section */}
          {criticals.length > 0 && (
            <View style={styles.section}>
              <SectionLabel
                icon="alert-circle"
                label="Critical Alerts"
                count={criticals.length}
                color={colors.severity.critical}
                isDark={isDark}
              />
              {criticals.map(a => (
                <AlertCard key={a.id} alert={a} isDark={isDark} onPress={() => {}} />
              ))}
            </View>
          )}

          {/* Advisories & updates section */}
          {nonCriticals.length > 0 && (
            <View style={styles.section}>
              <SectionLabel
                icon="notifications-outline"
                label="Advisories & Updates"
                count={nonCriticals.length}
                color={isDark ? colors.slate[400] : colors.slate[600]}
                isDark={isDark}
              />
              {nonCriticals.map(a => (
                <AlertCard key={a.id} alert={a} isDark={isDark} onPress={() => {}} />
              ))}
            </View>
          )}

          {/* Empty state */}
          {alerts.length === 0 && (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconWrap, isDark && { backgroundColor: colors.slate[900] }]}>
                <Ionicons name="notifications-off-outline" size={40} color={colors.slate[400]} />
              </View>
              <Text style={[styles.emptyTitle, isDark && { color: colors.white }]}>
                All quiet
              </Text>
              <Text style={[styles.emptySub, isDark && { color: colors.slate[400] }]}>
                No active alerts right now.{'\n'}Critical incidents will appear here immediately.
              </Text>
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },

  // ── Header ──
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 10,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.severity.critical,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: colors.brand[600],
  },
  headerBadgeText: { fontSize: 9, fontWeight: '800', color: colors.white },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.3,
  },
  markAllPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  markAllText: { fontSize: 12, color: colors.white, fontWeight: '600' },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.68)',
    marginTop: 2,
  },
  // Decorative bottom curve separator
  headerCurve: {
    position: 'absolute',
    bottom: -12,
    left: 0,
    right: 0,
    height: 24,
    backgroundColor: 'transparent',
  },

  // ── Scroll ──
  scroll:      { padding: 16, gap: 20, paddingTop: 20 },
  scrollEmpty: { flex: 1, justifyContent: 'center' },

  // ── Section ──
  section: { gap: 10 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
    paddingLeft: 2,
  },
  sectionIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionCount: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sectionCountText: { fontSize: 11, fontWeight: '700' },

  // ── Card ──
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  accentBar: { width: 4 },
  cardInner: { flex: 1, padding: 14, gap: 8 },

  cardTopRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardTitleWrap: { flex: 1 },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.slate[900],
    lineHeight: 20,
  },
  cardRight: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  timePill: {
    backgroundColor: colors.slate[100],
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  timeText: { fontSize: 10, fontWeight: '600', color: colors.slate[500] },

  cardBody: {
    fontSize: 13,
    color: colors.slate[500],
    lineHeight: 18,
  },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.slate[100] + 'CC',
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  footerText: { fontSize: 11, color: colors.slate[400], flex: 1 },
  kindBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  kindText:   { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

  // ── Error ──
  errorIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: { fontSize: 17, fontWeight: '700', color: colors.slate[900] },
  errorBody:  { fontSize: 13, color: colors.slate[500], textAlign: 'center', lineHeight: 20 },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brand[500],
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    marginTop: 4,
  },
  retryText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  // ── Empty state ──
  emptyState: { alignItems: 'center', gap: 16 },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.slate[900] },
  emptySub: {
    fontSize: 14,
    color: colors.slate[400],
    textAlign: 'center',
    lineHeight: 22,
  },
});
