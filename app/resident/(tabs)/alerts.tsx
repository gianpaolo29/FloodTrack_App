/**
 * Alerts screen — premium redesign
 * LinearGradient header · wave transition · glassmorphic cards
 * Staggered slide-in animations · severity accent bars · pulsing unread dots
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
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

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useAlert } from '@/context/AlertContext';
import { getAlertsWithReadState, markAlertRead, markAllAlertsRead } from '@/services/api';
import type { AlertItem } from '@/types';
import { useRouter } from 'expo-router';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Gradient colours (matches login hero) ────────────────────────────────────

const GRAD: [string, string, string] = ['#00D2FF', '#4A6CF7', '#7C3AED'];

// ─── Animated unread pulse dot ────────────────────────────────────────────────

function PulseDot({ color }: { color: string }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale,   { toValue: 1.9, duration: 850, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 1,   duration: 850, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0,   duration: 850, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.7, duration: 850, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);

  return (
    <View style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 14, height: 14, borderRadius: 7,
          backgroundColor: color,
          opacity,
          transform: [{ scale }],
        }}
      />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

// ─── Decorative orb (header atmosphere) ──────────────────────────────────────

function HeaderOrb({ style }: { style: object }) {
  return <View style={[{ position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' }, style]} />;
}

// ─── Alert card (animated entrance) ──────────────────────────────────────────

function AlertCard({
  alert,
  isDark,
  onPress,
  animValue,
}: {
  alert: AlertItem;
  isDark: boolean;
  onPress: () => void;
  animValue: Animated.Value;
}) {
  const isCritical     = alert.kind === 'critical';
  const isStatusUpdate = alert.kind === 'status_update';

  const accentColor = isCritical
    ? colors.severity.critical
    : isStatusUpdate
    ? colors.severity.low
    : '#4A6CF7';

  const iconName: keyof typeof Ionicons.glyphMap = isCritical
    ? 'alert-circle'
    : isStatusUpdate
    ? 'checkmark-circle'
    : 'information-circle';

  const cardBg = isDark
    ? isCritical ? '#1A0808' : colors.dark.elevated
    : isCritical ? '#FFF5F5' : colors.white;

  const translateX = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-32, 0],
  });

  return (
    <Animated.View style={{ opacity: animValue, transform: [{ translateX }] }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          { backgroundColor: cardBg },
          isDark && styles.cardDark,
          pressed && { opacity: 0.86, transform: [{ scale: 0.984 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${alert.title}. ${alert.body}`}
      >
        {/* Severity accent bar */}
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

        <View style={styles.cardInner}>
          {/* Top row: icon badge · title · unread dot + time */}
          <View style={styles.cardTopRow}>
            {/* Icon badge */}
            <LinearGradient
              colors={[accentColor + '30', accentColor + '14']}
              style={styles.iconBadge}
            >
              <Ionicons name={iconName} size={20} color={accentColor} />
            </LinearGradient>

            {/* Title */}
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

            {/* Right: pulse dot + time pill */}
            <View style={styles.cardRight}>
              {!alert.read && <PulseDot color={accentColor} />}
              <View style={[
                styles.timePill,
                isDark && { backgroundColor: colors.dark.surface },
              ]}>
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

          {/* Footer: area · kind badge */}
          <View style={[
            styles.cardFooter,
            isDark && { borderTopColor: colors.dark.border },
          ]}>
            <View style={styles.footerLeft}>
              <Ionicons name="location-outline" size={12} color={colors.slate[400]} />
              <Text
                style={[styles.footerAreaText, isDark && { color: colors.slate[500] }]}
                numberOfLines={1}
              >
                {alert.area || 'Unknown area'}
              </Text>
            </View>
            <LinearGradient
              colors={[accentColor + '28', accentColor + '14']}
              style={styles.kindBadge}
            >
              <Text style={[styles.kindText, { color: accentColor }]}>
                {isCritical ? 'Critical' : isStatusUpdate ? 'Update' : 'Advisory'}
              </Text>
            </LinearGradient>
          </View>
        </View>
      </Pressable>
    </Animated.View>
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
      <LinearGradient
        colors={[color + '30', color + '16']}
        style={styles.sectionIconWrap}
      >
        <Ionicons name={icon} size={13} color={color} />
      </LinearGradient>
      <Text style={[
        styles.sectionLabel,
        { color: isDark ? color : color },
      ]}>
        {label}
      </Text>
      <View style={[styles.sectionCount, { backgroundColor: color + '1A' }]}>
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
  const { showAlert } = useAlert();
  const router = useRouter();

  const [alerts, setAlerts]         = useState<AlertItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // ── Entrance animations ──
  const heroOpacity  = useRef(new Animated.Value(0)).current;
  const heroTransY   = useRef(new Animated.Value(-16)).current;
  const listOpacity  = useRef(new Animated.Value(0)).current;
  // Per-card stagger — we keep up to 30 slots
  const cardAnims    = useRef(Array.from({ length: 30 }, () => new Animated.Value(0))).current;

  const runEntranceAnims = useCallback((count: number) => {
    // Reset cards
    cardAnims.forEach(a => a.setValue(0));

    const cardSequences = cardAnims.slice(0, Math.min(count, 30)).map((anim, i) =>
      Animated.sequence([
        Animated.delay(i * 55),
        Animated.spring(anim, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      ]),
    );

    Animated.parallel([
      // Hero slides in from top
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.spring(heroTransY,  { toValue: 0, friction: 7, tension: 60, useNativeDriver: true }),
      ]),
      // List fades in slightly after
      Animated.sequence([
        Animated.delay(160),
        Animated.timing(listOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]),
      // Cards stagger
      Animated.stagger(0, cardSequences),
    ]).start();
  }, [heroOpacity, heroTransY, listOpacity, cardAnims]);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      const data = await getAlertsWithReadState(token!);
      setAlerts(data);
      // Run entrance on first load; on refresh just let list update
      if (!isRefresh) {
        setTimeout(() => runEntranceAnims(data.length), 50);
      }
    } catch {
      setError('Could not load alerts. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, runEntranceAnims]);

  useEffect(() => { load(); }, [load]);

  async function handleAlertPress(alert: AlertItem) {
    if (!alert.read) {
      await markAlertRead(alert.id, token!);
      setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, read: true } : a));
    }
    if (alert.reportId) {
      router.push(`/resident/report/${alert.reportId}`);
    } else {
      showAlert({
        type: alert.kind === 'critical' ? 'error' : 'info',
        title: alert.title,
        message: alert.body + (alert.area ? `\n\nArea: ${alert.area}` : ''),
      });
    }
  }

  async function handleMarkAllRead() {
    try {
      const allIds = alerts.map(a => a.id);
      await markAllAlertsRead(allIds, token!);
      setAlerts(prev => prev.map(a => ({ ...a, read: true })));
    } catch {}
  }

  const criticals    = alerts.filter(a => a.kind === 'critical');
  const nonCriticals = alerts.filter(a => a.kind !== 'critical');
  const unreadCount  = alerts.filter(a => !a.read).length;

  // Card slot index — assigned across both sections in render order
  let cardSlot = 0;

  const screenBg = isDark ? colors.dark.bg : colors.slate[50];

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>

      {/* ══════════════════════════════════════════════
          GRADIENT HEADER
      ══════════════════════════════════════════════ */}
      <Animated.View style={[
        styles.headerWrap,
        { opacity: heroOpacity, transform: [{ translateY: heroTransY }] },
      ]}>
        <LinearGradient
          colors={GRAD}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerGradient, { paddingTop: insets.top + 10 }]}
        >
          {/* Decorative orbs for atmosphere */}
          <HeaderOrb style={{ width: 180, height: 180, top: -60, right: -50 }} />
          <HeaderOrb style={{ width: 100, height: 100, top: 30, left: -30, backgroundColor: 'rgba(255,255,255,0.04)' }} />
          <HeaderOrb style={{ width: 60,  height: 60,  bottom: 10, left: SCREEN_W * 0.5, backgroundColor: 'rgba(255,255,255,0.05)' }} />

          {/* Top row: icon + title + mark-all pill */}
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              {/* Bell icon with badge */}
              <View style={styles.headerIconWrap}>
                <Ionicons name="notifications" size={22} color="rgba(255,255,255,0.92)" />
                {unreadCount > 0 && (
                  <View style={styles.headerBadge}>
                    <Text style={styles.headerBadgeText}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>

              <View>
                <Text style={styles.headerTitle}>Alerts</Text>
              </View>
            </View>

            {unreadCount > 0 && (
              <Pressable
                onPress={handleMarkAllRead}
                style={({ pressed }) => [
                  styles.markAllPill,
                  pressed && { opacity: 0.8 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Mark all as read"
              >
                <Ionicons name="checkmark-done" size={14} color={colors.white} />
                <Text style={styles.markAllText}>Mark all read</Text>
              </Pressable>
            )}
          </View>

          {/* Unread count subtitle */}
          <Text style={styles.headerSub}>
            {loading
              ? 'Loading notifications…'
              : unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
              : "You're all caught up"}
          </Text>
        </LinearGradient>

        {/* Wave curved transition to content */}
        <View style={styles.waveWrap}>
          <LinearGradient
            colors={['#6B52F5', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[styles.waveShape, { backgroundColor: screenBg }]} />
        </View>
      </Animated.View>

      {/* ══════════════════════════════════════════════
          LOADING
      ══════════════════════════════════════════════ */}
      {loading && (
        <View style={styles.centered}>
          <LinearGradient
            colors={['#4A6CF720', '#7C3AED20']}
            style={styles.loadingIconWrap}
          >
            <ActivityIndicator size="large" color="#4A6CF7" />
          </LinearGradient>
          <Text style={[styles.loadingText, isDark && { color: colors.slate[400] }]}>
            Fetching alerts…
          </Text>
        </View>
      )}

      {/* ══════════════════════════════════════════════
          ERROR STATE
      ══════════════════════════════════════════════ */}
      {!loading && error && (
        <View style={styles.centered}>
          <LinearGradient
            colors={['#4A6CF720', '#7C3AED20']}
            style={styles.emptyIconWrap}
          >
            <Ionicons name="cloud-offline-outline" size={40} color="#4A6CF7" />
          </LinearGradient>
          <Text style={[styles.emptyTitle, isDark && { color: colors.white }]}>
            Connection issue
          </Text>
          <Text style={[styles.emptySub, isDark && { color: colors.slate[400] }]}>
            {error}
          </Text>
          <Pressable
            onPress={() => load()}
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
            accessibilityRole="button"
          >
            <LinearGradient
              colors={['#4A6CF7', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.retryBtnGrad}
            >
              <Ionicons name="refresh" size={16} color={colors.white} />
              <Text style={styles.retryText}>Try again</Text>
            </LinearGradient>
          </Pressable>
        </View>
      )}

      {/* ══════════════════════════════════════════════
          ALERT LIST
      ══════════════════════════════════════════════ */}
      {!loading && !error && (
        <Animated.View style={[styles.listWrapper, { opacity: listOpacity }]}>
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
                tintColor="#4A6CF7"
                colors={['#4A6CF7']}
              />
            }
            showsVerticalScrollIndicator={false}
          >

            {/* ── Critical section ── */}
            {criticals.length > 0 && (
              <View style={styles.section}>
                <SectionLabel
                  icon="alert-circle"
                  label="Critical Alerts"
                  count={criticals.length}
                  color={colors.severity.critical}
                  isDark={isDark}
                />
                {criticals.map(a => {
                  const slot = cardSlot++;
                  return (
                    <AlertCard
                      key={a.id}
                      alert={a}
                      isDark={isDark}
                      onPress={() => handleAlertPress(a)}
                      animValue={cardAnims[Math.min(slot, 29)]}
                    />
                  );
                })}
              </View>
            )}

            {/* ── Advisories & updates section ── */}
            {nonCriticals.length > 0 && (
              <View style={styles.section}>
                <SectionLabel
                  icon="notifications-outline"
                  label="Advisories & Updates"
                  count={nonCriticals.length}
                  color={isDark ? '#4A6CF7' : colors.slate[600]}
                  isDark={isDark}
                />
                {nonCriticals.map(a => {
                  const slot = cardSlot++;
                  return (
                    <AlertCard
                      key={a.id}
                      alert={a}
                      isDark={isDark}
                      onPress={() => handleAlertPress(a)}
                      animValue={cardAnims[Math.min(slot, 29)]}
                    />
                  );
                })}
              </View>
            )}

            {/* ── Empty state ── */}
            {alerts.length === 0 && (
              <View style={styles.emptyState}>
                <LinearGradient
                  colors={['#4A6CF720', '#7C3AED20']}
                  style={styles.emptyIconWrap}
                >
                  <Ionicons name="notifications-off-outline" size={44} color="#4A6CF7" />
                </LinearGradient>
                <Text style={[styles.emptyTitle, isDark && { color: colors.white }]}>
                  All quiet
                </Text>
                <Text style={[styles.emptySub, isDark && { color: colors.slate[400] }]}>
                  No active alerts right now.{'\n'}Critical incidents will appear here immediately.
                </Text>
                <Pressable
                  onPress={() => load()}
                  style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
                  accessibilityRole="button"
                >
                  <LinearGradient
                    colors={['#4A6CF7', '#7C3AED']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.retryBtnGrad}
                  >
                    <Ionicons name="refresh-outline" size={16} color={colors.white} />
                    <Text style={styles.retryText}>Refresh</Text>
                  </LinearGradient>
                </Pressable>
              </View>
            )}

          </ScrollView>
        </Animated.View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    padding: 32,
  },

  // ── Header ───────────────────────────────────────────────────────────────────
  headerWrap: { zIndex: 10 },
  headerGradient: {
    paddingHorizontal: 22,
    paddingBottom: 22,
    overflow: 'hidden',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: colors.severity.critical,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#7C3AED',
  },
  headerBadgeText: { fontSize: 9, fontWeight: '900', color: colors.white },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.4,
  },
  markAllPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  markAllText: { fontSize: 12, color: colors.white, fontWeight: '700' },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.1,
    marginTop: 2,
  },

  // Wave separator
  waveWrap: {
    height: 52,
    position: 'relative',
    marginTop: -1,
  },
  waveShape: {
    position: 'absolute',
    bottom: 0,
    left: -12,
    right: -12,
    height: 56,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
  },

  // ── List ─────────────────────────────────────────────────────────────────────
  listWrapper: { flex: 1 },
  scroll:      { padding: 16, gap: 22, paddingTop: 8 },
  scrollEmpty: { flex: 1, justifyContent: 'center' },

  // ── Section ──────────────────────────────────────────────────────────────────
  section: { gap: 10 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 4,
    paddingLeft: 2,
  },
  sectionIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    color: colors.slate[500],
  },
  sectionCount: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
  },
  sectionCountText: { fontSize: 11, fontWeight: '800' },

  // ── Card ─────────────────────────────────────────────────────────────────────
  card: {
    flexDirection: 'row',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 1,
    borderColor: colors.slate[100],
  },
  cardDark: {
    borderColor: colors.dark.border,
    shadowOpacity: 0.22,
  },
  accentBar: { width: 4 },
  cardInner: { flex: 1, padding: 14, gap: 9 },

  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },

  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
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

  cardRight: { alignItems: 'flex-end', gap: 7, flexShrink: 0 },
  timePill: {
    backgroundColor: colors.slate[100],
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  timeText: { fontSize: 10, fontWeight: '600', color: colors.slate[500] },

  cardBody: {
    fontSize: 13,
    color: colors.slate[500],
    lineHeight: 19,
  },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.slate[200],
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  footerAreaText: { fontSize: 11, color: colors.slate[400], flex: 1 },
  kindBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
  },
  kindText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },

  // ── Empty / Error shared ──────────────────────────────────────────────────────
  emptyState:    { alignItems: 'center', gap: 18 },
  emptyIconWrap: {
    width: 92,
    height: 92,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  loadingIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: colors.slate[500],
    fontWeight: '500',
  },
  emptyTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.slate[900],
    letterSpacing: -0.2,
  },
  emptySub: {
    fontSize: 14,
    color: colors.slate[400],
    textAlign: 'center',
    lineHeight: 22,
  },
  retryBtn: { borderRadius: 14, overflow: 'hidden', marginTop: 4 },
  retryBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 24,
    paddingVertical: 13,
    shadowColor: '#4A6CF7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  retryText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
