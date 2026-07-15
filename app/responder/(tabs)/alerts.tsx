import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
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
import { useRouter } from 'expo-router';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { useAlertBadge } from '@/context/AlertBadgeContext';
import { getAlertsWithReadState, markAlertRead, markAllAlertsRead } from '@/services/api';
import type { AlertItem } from '@/types';

const { width: SCREEN_W } = Dimensions.get('window');

const GRAD = colors.gradients.hero as [string, string, string];

// ---------------------------------------------------------------------------
// PulseDot — animated unread indicator
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// HeaderOrb — decorative circle for gradient header
// ---------------------------------------------------------------------------
function HeaderOrb({ style }: { style: object }) {
  return (
    <View
      style={[
        { position: 'absolute', borderRadius: 999, backgroundColor: colors.overlay.whiteThin },
        style,
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// AlertCard — premium card design with left accent border for unread
// ---------------------------------------------------------------------------
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
    : colors.gradients.cta[0];

  const iconName: keyof typeof Ionicons.glyphMap = isCritical
    ? 'alert-circle'
    : isStatusUpdate
    ? 'checkmark-circle'
    : 'information-circle';

  const baseBg  = isDark ? colors.dark.elevated : colors.white;
  const cardBg  = !alert.read
    ? (isDark ? accentColor + '0A' : accentColor + '08')
    : baseBg;

  const titleColor = alert.read
    ? (isDark ? colors.slate[400] : colors.slate[500])
    : (isDark ? colors.white : colors.slate[900]);

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
          {
            backgroundColor: cardBg,
            borderWidth: alert.read ? 1 : 1.5,
            borderColor: alert.read ? (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)') : accentColor + '35',
          },
          pressed && { opacity: 0.86, transform: [{ scale: 0.984 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${alert.title}. ${alert.body}`}
      >
        <View style={styles.cardInner}>
          <View style={styles.cardTopRow}>
            <LinearGradient
              colors={[accentColor + '28', accentColor + '10']}
              style={styles.iconBadge}
            >
              <Ionicons name={iconName} size={22} color={accentColor} />
            </LinearGradient>

            <View style={styles.cardTitleWrap}>
              <Text
                style={[styles.cardTitle, { color: titleColor }]}
                numberOfLines={2}
              >
                {alert.title}
              </Text>
            </View>

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

          <Text
            style={[styles.cardBody, isDark && { color: colors.slate[400] }]}
            numberOfLines={2}
          >
            {alert.body}
          </Text>

          <View style={styles.cardFooter}>
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

// ---------------------------------------------------------------------------
// SectionLabel — clean pill + uppercase label + count
// ---------------------------------------------------------------------------
function SectionLabel({
  label,
  count,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  count: number;
  color: string;
  isDark: boolean;
}) {
  return (
    <View style={styles.sectionRow}>
      <View style={[styles.sectionPill, { backgroundColor: color }]} />
      <Text style={[styles.sectionLabel, { color }]}>
        {label.toUpperCase()}
      </Text>
      <View style={[styles.sectionCount, { backgroundColor: color + '1A' }]}>
        <Text style={[styles.sectionCountText, { color }]}>{count}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// AlertDetail — slide-in detail panel
// ---------------------------------------------------------------------------
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
      contentContainerStyle={{ padding: 20, paddingBottom: bottomInset + 40 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Back */}
      <Pressable onPress={onBack} style={d.backRow} accessibilityRole="button" accessibilityLabel="Back to alerts">
        <View style={[d.backBtn, { backgroundColor: accentColor + '14' }]}>
          <Ionicons name="chevron-back" size={18} color={accentColor} />
        </View>
        <Text style={[d.backLabel, { color: accentColor }]}>Alerts</Text>
      </Pressable>

      {/* Hero icon */}
      <View style={d.heroWrap}>
        <LinearGradient colors={[accentColor + '30', accentColor + '10']} style={d.heroCircle}>
          <Ionicons name={iconName} size={44} color={accentColor} />
        </LinearGradient>
        <View style={[d.kindChip, { backgroundColor: accentColor + '18' }]}>
          <Text style={[d.kindChipText, { color: accentColor }]}>{kindLabel}</Text>
        </View>
      </View>

      {/* Title */}
      <Text style={[d.title, isDark && { color: colors.white }]}>{alert.title}</Text>

      {/* Body */}
      <Text style={[d.body, isDark && { color: colors.slate[300] }]}>{alert.body}</Text>

      {/* Meta card */}
      <View style={[d.metaCard, { backgroundColor: cardBg, borderColor }]}>
        <View style={d.metaRow}>
          <View style={[d.metaIconWrap, { backgroundColor: accentColor + '14' }]}>
            <Ionicons name="location-outline" size={16} color={accentColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[d.metaLabel, isDark && { color: colors.slate[500] }]}>Location</Text>
            <Text style={[d.metaValue, isDark && { color: colors.dark.text }]}>{alert.area || 'Unknown area'}</Text>
          </View>
        </View>
        <View style={[d.metaDivider, { backgroundColor: borderColor }]} />
        <View style={d.metaRow}>
          <View style={[d.metaIconWrap, { backgroundColor: accentColor + '14' }]}>
            <Ionicons name="time-outline" size={16} color={accentColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[d.metaLabel, isDark && { color: colors.slate[500] }]}>Received</Text>
            <Text style={[d.metaValue, isDark && { color: colors.dark.text }]}>{alert.time}</Text>
          </View>
        </View>
      </View>

      {/* View incident CTA */}
      {onViewReport && (
        <Pressable onPress={onViewReport} style={({ pressed }) => [d.ctaWrap, pressed && { opacity: 0.88, transform: [{ scale: 0.98 }] }]}>
          <LinearGradient colors={colors.gradients.cta} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={d.ctaBtn}>
            <Text style={d.ctaText}>View Incident</Text>
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
  backRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 28 },
  backBtn:      { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  backLabel:    { fontSize: 15, fontWeight: '700' },
  heroWrap:     { alignItems: 'center', gap: 14, marginBottom: 24 },
  heroCircle:   { width: 96, height: 96, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  kindChip:     { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  kindChipText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 },
  title:        { fontSize: 22, fontWeight: '800', color: colors.slate[900], letterSpacing: -0.3, lineHeight: 30, marginBottom: 12, textAlign: 'center' },
  body:         { fontSize: 15, color: colors.slate[500], lineHeight: 24, textAlign: 'center', marginBottom: 24 },
  metaCard:     { borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 28 },
  metaRow:      { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  metaIconWrap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  metaLabel:    { fontSize: 11, color: colors.slate[400], fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  metaValue:    { fontSize: 14, color: colors.slate[800], fontWeight: '600' },
  metaDivider:  { height: 1, marginHorizontal: 16 },
  ctaWrap:      { borderRadius: 16, overflow: 'hidden' },
  ctaBtn:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, height: 56, paddingHorizontal: 24 },
  ctaText:      { fontSize: 16, fontWeight: '800', color: colors.white, letterSpacing: 0.3 },
  ctaArrow:     { width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
});

// ---------------------------------------------------------------------------
// AlertsScreen
// ---------------------------------------------------------------------------
export default function AlertsScreen() {
  const insets         = useSafeAreaInsets();
  const scheme         = useColorScheme();
  const isDark         = scheme === 'dark';
  const { token }      = useAuth();
  const { setUnreadCount } = useAlertBadge();
  const router         = useRouter();

  const [alerts, setAlerts]         = useState<AlertItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<AlertItem | null>(null);

  // Animated values
  const heroOpacity = useRef(new Animated.Value(0)).current;
  const heroTransY  = useRef(new Animated.Value(-16)).current;
  const listOpacity = useRef(new Animated.Value(0)).current;
  const cardAnims   = useRef(Array.from({ length: 30 }, () => new Animated.Value(0))).current;
  const slideAnim   = useRef(new Animated.Value(0)).current;

  const listTranslate   = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -SCREEN_W] });
  const detailTranslate = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_W, 0] });

  const runEntranceAnims = useCallback((count: number) => {
    cardAnims.forEach(a => a.setValue(0));

    const cardSequences = cardAnims.slice(0, Math.min(count, 30)).map((anim, i) =>
      Animated.sequence([
        Animated.delay(i * 55),
        Animated.spring(anim, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      ]),
    );

    Animated.parallel([
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.spring(heroTransY,  { toValue: 0, friction: 7, tension: 60, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(160),
        Animated.timing(listOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
      ]),
      Animated.stagger(0, cardSequences),
    ]).start();
  }, [heroOpacity, heroTransY, listOpacity, cardAnims]);

  const load = useCallback(async (isRefresh = false) => {
    if (!token) return;
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      const data = await getAlertsWithReadState(token);
      setAlerts(data);
      setUnreadCount(data.filter(a => !a.read).length);
      if (!isRefresh) {
        setTimeout(() => runEntranceAnims(data.length), 50);
      } else {
        cardAnims.forEach(a => a.setValue(1));
      }
    } catch {
      setError('Could not load alerts. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, runEntranceAnims]);

  useEffect(() => {
    load();

    const interval = setInterval(() => load(true), 30_000);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load(true);
    });

    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, [load]);

  function openDetail(alert: AlertItem) {
    setSelectedAlert(alert);
    Animated.spring(slideAnim, { toValue: 1, friction: 8, tension: 65, useNativeDriver: true }).start();
  }

  function closeDetail() {
    Animated.spring(slideAnim, { toValue: 0, friction: 8, tension: 65, useNativeDriver: true }).start(() => {
      setSelectedAlert(null);
    });
  }

  async function handleAlertPress(alert: AlertItem) {
    try {
      if (!alert.read) {
        await markAlertRead(alert.id, token!);
        setAlerts((prev) => {
          const next = prev.map((a) => (a.id === alert.id ? { ...a, read: true } : a));
          setUnreadCount(next.filter(a => !a.read).length);
          return next;
        });
      }
    } catch {}
    openDetail(alert);
  }

  async function handleMarkAllRead() {
    try {
      const allIds = alerts.map((a) => a.id);
      await markAllAlertsRead(allIds, token!);
      setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
      setUnreadCount(0);
    } catch {}
  }

  const criticals    = alerts.filter((a) => a.kind === 'critical');
  const nonCriticals = alerts.filter((a) => a.kind !== 'critical');
  const unreadCount  = alerts.filter((a) => !a.read).length;

  const headerSubtitle = loading
    ? 'Loading notifications…'
    : alerts.length === 0
    ? "You're all caught up"
    : (() => {
        const parts: string[] = [];
        if (criticals.length > 0)
          parts.push(`${criticals.length} critical`);
        if (nonCriticals.length > 0)
          parts.push(`${nonCriticals.length} advisor${nonCriticals.length !== 1 ? 'ies' : 'y'}`);
        return parts.join(' · ');
      })();

  let cardSlot = 0;

  const screenBg = isDark ? colors.dark.bg : colors.slate[50];

  return (
    <View style={[styles.root, { backgroundColor: screenBg }]}>

      {/* ------------------------------------------------------------------ */}
      {/* Gradient hero header                                                */}
      {/* ------------------------------------------------------------------ */}
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
          <HeaderOrb style={{ width: 180, height: 180, top: -60, right: -50 }} />
          <HeaderOrb style={{ width: 100, height: 100, top: 30, left: -30, backgroundColor: colors.overlay.whiteSubtle }} />
          <HeaderOrb style={{ width: 60,  height: 60,  bottom: 10, left: SCREEN_W * 0.5, backgroundColor: colors.overlay.whiteFaint }} />

          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
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

          <Text style={styles.headerSub}>{headerSubtitle}</Text>
        </LinearGradient>

        {/* Wave transition */}
        <View style={styles.waveWrap}>
          <LinearGradient
            colors={colors.gradients.wave}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[styles.waveShape, { backgroundColor: screenBg }]} />
        </View>
      </Animated.View>

      {/* ------------------------------------------------------------------ */}
      {/* Sliding content area                                                */}
      {/* ------------------------------------------------------------------ */}
      <View style={styles.slideContainer}>

        {/* ── List panel ── */}
        <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: listTranslate }] }]}>
          {loading && (
            <View style={styles.centered}>
              <LinearGradient
                colors={[colors.gradients.cta[0] + '20', colors.gradients.cta[1] + '20']}
                style={styles.loadingIconWrap}
              >
                <ActivityIndicator size="large" color={colors.gradients.cta[0]} />
              </LinearGradient>
              <Text style={[styles.loadingText, isDark && { color: colors.slate[400] }]}>
                Fetching alerts…
              </Text>
            </View>
          )}

          {!loading && error && (
            <View style={styles.centered}>
              <LinearGradient
                colors={[colors.gradients.cta[0] + '20', colors.gradients.cta[1] + '20']}
                style={styles.emptyIconWrap}
              >
                <Ionicons name="cloud-offline-outline" size={40} color={colors.gradients.cta[0]} />
              </LinearGradient>
              <Text style={[styles.emptyTitle, isDark && { color: colors.white }]}>
                Connection issue
              </Text>
              <Text style={[styles.emptySub, isDark && { color: colors.slate[400] }]}>
                {error}
              </Text>
              <Pressable
                onPress={() => load()}
                style={({ pressed }) => [
                  styles.retryBtn,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
                accessibilityRole="button"
              >
                <LinearGradient
                  colors={colors.gradients.cta}
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
                    tintColor={colors.gradients.cta[0]}
                    colors={[colors.gradients.cta[0]]}
                  />
                }
                showsVerticalScrollIndicator={false}
              >
                {criticals.length > 0 && (
                  <View style={styles.section}>
                    <SectionLabel
                      icon="alert-circle"
                      label="Critical Alerts"
                      count={criticals.length}
                      color={colors.severity.critical}
                      isDark={isDark}
                    />
                    {criticals.map((a) => {
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

                {nonCriticals.length > 0 && (
                  <View style={styles.section}>
                    <SectionLabel
                      icon="notifications-outline"
                      label="Advisories & Updates"
                      count={nonCriticals.length}
                      color={isDark ? colors.gradients.cta[0] : colors.slate[600]}
                      isDark={isDark}
                    />
                    {nonCriticals.map((a) => {
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

                {alerts.length === 0 && (
                  <View style={styles.emptyState}>
                    <LinearGradient
                      colors={[colors.gradients.cta[0] + '20', colors.gradients.cta[1] + '20']}
                      style={styles.emptyIconWrap}
                    >
                      <Ionicons
                        name="notifications-off-outline"
                        size={44}
                        color={colors.gradients.cta[0]}
                      />
                    </LinearGradient>
                    <Text style={[styles.emptyTitle, isDark && { color: colors.white }]}>
                      All quiet
                    </Text>
                    <Text style={[styles.emptySub, isDark && { color: colors.slate[400] }]}>
                      No active alerts right now.{'\n'}Critical incidents will appear here immediately.
                    </Text>
                    <Pressable
                      onPress={() => load()}
                      style={({ pressed }) => [
                        styles.retryBtn,
                        pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                      ]}
                      accessibilityRole="button"
                    >
                      <LinearGradient
                        colors={colors.gradients.cta}
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
        </Animated.View>

        {/* ── Detail panel ── */}
        <Animated.View style={[StyleSheet.absoluteFillObject, { transform: [{ translateX: detailTranslate }] }]}>
          {selectedAlert && (
            <AlertDetail
              alert={selectedAlert}
              isDark={isDark}
              screenBg={screenBg}
              bottomInset={insets.bottom}
              onBack={closeDetail}
              onViewReport={selectedAlert.reportId
                ? () => { closeDetail(); router.push(`/responder/incident/${selectedAlert.reportId}` as never); }
                : undefined
              }
            />
          )}
        </Animated.View>

      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root:    { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    padding: 32,
  },

  // Header
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
    borderColor: colors.gradients.cta[1],
  },
  headerBadgeText: { fontSize: 9, fontWeight: '900', color: colors.white },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.3,
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

  // Wave
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },

  // Slide container
  slideContainer: { flex: 1, overflow: 'hidden' },

  // List
  listWrapper: { flex: 1 },
  scroll:      { padding: 16, gap: 22, paddingTop: 8 },
  scrollEmpty: { flex: 1, justifyContent: 'center' },

  // Section header
  section: { gap: 10 },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 4,
    paddingLeft: 2,
  },
  sectionPill: {
    width: 3,
    height: 14,
    borderRadius: 1.5,
  },
  sectionLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionCount: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
  },
  sectionCountText: { fontSize: 11, fontWeight: '800' },

  // Card
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
  cardInner: { flex: 1, padding: 14, gap: 9 },
  cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },

  iconBadge: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },

  cardTitleWrap: { flex: 1 },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
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
    lineHeight: 20,
  },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  footerAreaText: { fontSize: 11, color: colors.slate[400], flex: 1 },
  kindBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
  },
  kindText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Empty / loading states
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
    shadowColor: colors.gradients.cta[0],
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 8,
  },
  retryText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});
