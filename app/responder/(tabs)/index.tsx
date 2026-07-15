import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
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
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getAssignedIncidents, getWeather, type WeatherData } from '@/services/api';
import type { Incident, ResponderStatus } from '@/types';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = 12;
const H_PAD = 20;
const HALF_CARD = (SCREEN_W - H_PAD * 2 - CARD_GAP) / 2;

const STATUS_LABELS: Record<ResponderStatus, string> = {
  pending: 'Pending',
  en_route: 'En Route',
  on_scene: 'On Scene',
  resolved: 'Resolved',
};

const STATUS_COLORS: Record<ResponderStatus, string> = {
  pending: colors.severity.moderate,
  en_route: colors.brand[500],
  on_scene: colors.accent[500],
  resolved: colors.severity.low,
};

const STATUS_ICONS: Record<ResponderStatus, keyof typeof Ionicons.glyphMap> = {
  pending: 'time',
  en_route: 'car',
  on_scene: 'location',
  resolved: 'checkmark-circle',
};

const W_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  clear: 'sunny',
  clouds: 'cloudy',
  rain: 'rainy',
  drizzle: 'rainy',
  thunderstorm: 'thunderstorm',
  snow: 'snow',
  mist: 'water',
  fog: 'water',
  haze: 'water',
};

type TabKey = 'overview' | 'critical' | 'active';

/* ─── stat mini-card ─── */
function StatChip({
  icon,
  label,
  value,
  color,
  isDark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  color: string;
  isDark: boolean;
}) {
  return (
    <View
      style={[
        $.statChip,
        {
          backgroundColor: isDark ? colors.dark.card : colors.white,
          borderColor: isDark ? colors.dark.border : 'rgba(0,0,0,0.04)',
        },
      ]}
    >
      <View style={[$.statChipIcon, { backgroundColor: color + '14' }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <Text style={[$.statChipValue, { color: isDark ? colors.white : colors.slate[900] }]}>
        {value}
      </Text>
      <Text style={[$.statChipLabel, { color: isDark ? colors.slate[500] : colors.slate[400] }]}>
        {label}
      </Text>
    </View>
  );
}

export default function HomeTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { token, user } = useAuth();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  /* animations */
  const heroAnim = useRef(new Animated.Value(0)).current;
  const cardsAnim = useRef(new Animated.Value(0)).current;
  const listAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(100, [
      Animated.timing(heroAnim, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(cardsAnim, { toValue: 1, duration: 450, easing: Easing.out(Easing.back(1.05)), useNativeDriver: true }),
      Animated.timing(listAnim, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const bg = isDark ? colors.dark.bg : colors.responder.pageBg;
  const cardBg = isDark ? colors.dark.card : colors.white;
  const cardBorder = isDark ? colors.dark.border : 'rgba(0,0,0,0.04)';
  const textPrimary = isDark ? colors.white : colors.slate[900];
  const textSecondary = isDark ? colors.slate[400] : colors.slate[500];
  const textTertiary = isDark ? colors.slate[500] : colors.slate[400];

  const loadIncidents = useCallback(
    async (isRefresh = false) => {
      if (!token) return;
      try {
        if (!isRefresh) setLoading(true);
        const data = await getAssignedIncidents(token);
        setIncidents(data);
      } catch {
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  const loadWeather = useCallback(async () => {
    if (!token) return;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc =
        (await Location.getLastKnownPositionAsync()) ??
        (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
      const { latitude: lat, longitude: lon } = loc.coords;
      try {
        const w = await getWeather(lat, lon, token);
        if (w.current.description !== 'Unavailable') { setWeather(w); return; }
      } catch {}
      const KEY = '492a0ca6810997c64038621e373ae0de';
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${KEY}&units=metric`,
      );
      if (!res.ok) return;
      const d = await res.json();
      setWeather({
        current: {
          temperature: d.main?.temp ?? 0,
          humidity: d.main?.humidity ?? 0,
          windSpeed: Math.round((d.wind?.speed ?? 0) * 3.6 * 10) / 10,
          description: d.weather?.[0]?.description
            ? d.weather[0].description.charAt(0).toUpperCase() + d.weather[0].description.slice(1)
            : 'Unknown',
          icon: d.weather?.[0]?.icon ?? '01d',
          rainH: d.rain?.['1h'] ?? 0,
          city: d.name ?? '',
        },
        alerts: [],
        forecast: [],
      });
    } catch {}
  }, [token]);

  useEffect(() => {
    loadIncidents();
    loadWeather();
  }, [loadIncidents, loadWeather]);

  const active = incidents.filter((i) => i.responderStatus !== 'resolved');
  const pendingCount = incidents.filter((i) => i.responderStatus === 'pending').length;
  const enRouteCount = incidents.filter((i) => i.responderStatus === 'en_route').length;
  const onSceneCount = incidents.filter((i) => i.responderStatus === 'on_scene').length;
  const resolvedCount = incidents.filter((i) => i.responderStatus === 'resolved').length;

  const weatherIcon = (() => {
    if (!weather) return 'partly-sunny' as keyof typeof Ionicons.glyphMap;
    const k = Object.keys(W_ICONS).find((w) => weather.current.description.toLowerCase().includes(w));
    return k ? W_ICONS[k] : ('partly-sunny' as keyof typeof Ionicons.glyphMap);
  })();

  const resolveRate = incidents.length > 0 ? Math.round((resolvedCount / incidents.length) * 100) : 0;

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  const TABS: { key: TabKey; label: string; count: number }[] = [
    { key: 'overview', label: 'Overview', count: incidents.length },
    { key: 'critical', label: 'Critical', count: active.filter((i) => i.severity === 'critical').length },
    { key: 'active', label: 'Active', count: active.length },
  ];

  const filteredIncidents = incidents.filter((i) => {
    if (activeTab === 'critical') return i.severity === 'critical';
    if (activeTab === 'active') return i.responderStatus !== 'resolved';
    return true;
  });

  return (
    <View style={[$.root, { backgroundColor: bg }]}>
      {loading ? (
        <View style={$.centered}>
          <ActivityIndicator size="large" color={colors.accent[500]} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); loadIncidents(true); loadWeather(); }}
              tintColor={colors.accent[500]}
              colors={[colors.accent[500]]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* ═══ HERO HEADER ═══ */}
          <Animated.View
            style={{
              opacity: heroAnim,
              transform: [{ translateY: heroAnim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
            }}
          >
            <LinearGradient
              colors={isDark ? ['#0D2137', '#0A1628', '#070E18'] : ['#0B8F80', '#0FA896', '#12C4AE']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[$.hero, { paddingTop: insets.top + 16 }]}
            >
              {/* decorative orbs */}
              <View style={[$.orb, { width: 160, height: 160, top: -40, left: -30, opacity: 0.08 }]} />
              <View style={[$.orb, { width: 100, height: 100, top: 20, right: -20, opacity: 0.06 }]} />
              <View style={[$.orb, { width: 70, height: 70, bottom: 50, left: 40, opacity: 0.07 }]} />

              {/* greeting row */}
              <View style={$.heroRow}>
                <View style={{ flex: 1 }}>
                  <Text style={$.heroDate}>{dateStr}</Text>
                  <Text style={$.heroGreeting}>
                    Hi, {user?.firstName ?? 'Responder'}
                  </Text>
                  <Text style={$.heroSub}>Welcome back</Text>
                </View>
                <Pressable
                  onPress={() => router.push('/responder/(tabs)/profile' as never)}
                  style={$.heroAvatar}
                >
                  {user?.avatarUrl ? (
                    <Image source={{ uri: user.avatarUrl }} style={$.heroAvatarImg} />
                  ) : (
                    <LinearGradient
                      colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.12)']}
                      style={$.heroAvatarImg}
                    >
                      <Text style={$.heroAvatarText}>
                        {user ? `${user.firstName[0]}${user.lastName[0]}` : 'R'}
                      </Text>
                    </LinearGradient>
                  )}
                </Pressable>
              </View>

              {/* weather strip */}
              <View style={$.weatherStrip}>
                <View style={$.weatherStripLeft}>
                  <Ionicons name={weatherIcon} size={18} color="rgba(255,255,255,0.85)" />
                  <Text style={$.weatherStripTemp}>
                    {weather ? `${Math.round(weather.current.temperature)}°C` : '--°'}
                  </Text>
                  <View style={$.weatherDivider} />
                  <Text style={$.weatherStripDesc} numberOfLines={1}>
                    {weather?.current.description ?? 'Loading...'}
                  </Text>
                </View>
                <Text style={$.weatherStripCity} numberOfLines={1}>
                  {weather?.current.city || '...'}
                </Text>
              </View>

              {/* wave transition */}
              <View style={$.waveWrap} pointerEvents="none">
                <View style={[$.waveBack, { backgroundColor: bg, opacity: 0.3 }]} />
                <View style={[$.waveFront, { backgroundColor: bg }]} />
              </View>
            </LinearGradient>
          </Animated.View>

          {/* ═══ STAT CHIPS ═══ */}
          <Animated.View
            style={[
              $.statsRow,
              {
                opacity: cardsAnim,
                transform: [{ translateY: cardsAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
              },
            ]}
          >
            <StatChip icon="warning" label="Active" value={active.length} color={colors.severity.high} isDark={isDark} />
            <StatChip icon="car" label="En Route" value={enRouteCount} color={colors.brand[500]} isDark={isDark} />
            <StatChip icon="location" label="On Scene" value={onSceneCount} color={colors.accent[500]} isDark={isDark} />
            <StatChip icon="checkmark-circle" label="Resolved" value={resolvedCount} color={colors.severity.low} isDark={isDark} />
          </Animated.View>

          {/* ═══ OVERVIEW CARDS ═══ */}
          <Animated.View
            style={{
              opacity: cardsAnim,
              transform: [{ translateY: cardsAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            }}
          >
            <View style={$.cardRow}>
              {/* Active Incidents Card */}
              <Pressable
                onPress={() => setActiveTab('active')}
                style={({ pressed }) => [
                  $.glassCard,
                  {
                    backgroundColor: isDark ? colors.dark.card : colors.white,
                    borderColor: cardBorder,
                    flex: 1,
                  },
                  pressed && { transform: [{ scale: 0.97 }], opacity: 0.9 },
                ]}
              >
                <View style={$.glassCardHeader}>
                  <LinearGradient
                    colors={active.length > 0 ? ['#EF4444', '#F97316'] : [colors.severity.low, '#34D399']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={$.glassCardIconWrap}
                  >
                    <Ionicons name="shield-checkmark" size={20} color={colors.white} />
                  </LinearGradient>
                  <View style={[$.glassCardBadge, { backgroundColor: (active.length > 0 ? colors.severity.critical : colors.severity.low) + '18' }]}>
                    <View style={[$.liveIndicator, { backgroundColor: active.length > 0 ? colors.severity.critical : colors.severity.low }]} />
                    <Text style={[$.glassCardBadgeText, { color: active.length > 0 ? colors.severity.critical : colors.severity.low }]}>
                      {active.length > 0 ? 'Alert' : 'Clear'}
                    </Text>
                  </View>
                </View>
                <Text style={[$.glassCardBig, { color: textPrimary }]}>
                  {active.length}
                </Text>
                <Text style={[$.glassCardLabel, { color: textSecondary }]}>
                  Active Incidents
                </Text>
              </Pressable>

              {/* Resolve Rate Card */}
              <View
                style={[
                  $.glassCard,
                  {
                    backgroundColor: isDark ? colors.dark.card : colors.white,
                    borderColor: cardBorder,
                    flex: 1,
                  },
                ]}
              >
                <View style={$.glassCardHeader}>
                  <LinearGradient
                    colors={['#10B981', '#059669']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={$.glassCardIconWrap}
                  >
                    <Ionicons name="trending-up" size={20} color={colors.white} />
                  </LinearGradient>
                </View>
                <Text
                  style={[
                    $.glassCardBig,
                    {
                      color: resolveRate >= 50
                        ? colors.severity.low
                        : resolveRate >= 25
                        ? colors.severity.moderate
                        : colors.severity.high,
                    },
                  ]}
                >
                  {resolveRate}%
                </Text>
                <Text style={[$.glassCardLabel, { color: textSecondary }]}>
                  Resolve Rate
                </Text>
                {/* mini progress bar */}
                <View style={[$.progressTrack, { backgroundColor: isDark ? colors.dark.border : colors.slate[100] }]}>
                  <LinearGradient
                    colors={resolveRate >= 50 ? ['#10B981', '#34D399'] : resolveRate >= 25 ? ['#F59E0B', '#FBBF24'] : ['#EF4444', '#F87171']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[$.progressFill, { width: `${Math.max(resolveRate, 3)}%` as any }]}
                  />
                </View>
              </View>
            </View>

            {/* Pending + quick actions */}
            <View style={$.cardRow}>
              <Pressable
                onPress={() => setActiveTab('active')}
                style={({ pressed }) => [
                  $.miniCard,
                  {
                    backgroundColor: isDark ? colors.dark.card : colors.white,
                    borderColor: cardBorder,
                    flex: 1,
                  },
                  pressed && { transform: [{ scale: 0.97 }] },
                ]}
              >
                <View style={[$.miniCardIcon, { backgroundColor: colors.severity.moderate + '14' }]}>
                  <Ionicons name="time" size={18} color={colors.severity.moderate} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[$.miniCardValue, { color: textPrimary }]}>{pendingCount}</Text>
                  <Text style={[$.miniCardLabel, { color: textTertiary }]}>Pending</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => router.push('/responder/protocols' as never)}
                style={({ pressed }) => [
                  $.miniCard,
                  {
                    backgroundColor: isDark ? colors.dark.card : colors.white,
                    borderColor: cardBorder,
                    flex: 1,
                  },
                  pressed && { transform: [{ scale: 0.97 }] },
                ]}
              >
                <View style={[$.miniCardIcon, { backgroundColor: colors.iconAccents.purple + '14' }]}>
                  <Ionicons name="book" size={18} color={colors.iconAccents.purple} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[$.miniCardValue, { color: textPrimary }]}>SOP</Text>
                  <Text style={[$.miniCardLabel, { color: textTertiary }]}>Protocols</Text>
                </View>
              </Pressable>
            </View>
          </Animated.View>

          {/* ═══ TABS + INCIDENT LIST ═══ */}
          <Animated.View
            style={{
              opacity: listAnim,
              transform: [{ translateY: listAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
            }}
          >
            {/* tabs */}
            <View style={$.tabRow}>
              {TABS.map((t) => {
                const isActive = activeTab === t.key;
                return (
                  <Pressable
                    key={t.key}
                    onPress={() => setActiveTab(t.key)}
                    style={[
                      $.tabPill,
                      {
                        backgroundColor: isActive
                          ? (isDark ? colors.accent[500] : colors.accent[500])
                          : (isDark ? colors.dark.card : colors.white),
                        borderColor: isActive ? 'transparent' : cardBorder,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        $.tabPillText,
                        { color: isActive ? colors.white : textSecondary },
                      ]}
                    >
                      {t.label}
                    </Text>
                    {t.count > 0 && (
                      <View
                        style={[
                          $.tabPillBadge,
                          {
                            backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : (isDark ? colors.dark.border : colors.slate[100]),
                          },
                        ]}
                      >
                        <Text
                          style={[
                            $.tabPillBadgeText,
                            { color: isActive ? colors.white : textTertiary },
                          ]}
                        >
                          {t.count}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* incident list */}
            {filteredIncidents.length > 0 ? (
              <View style={$.incidentList}>
                <Text style={[$.sectionTitle, { color: textPrimary }]}>
                  {activeTab === 'critical' ? 'Critical Incidents' : activeTab === 'active' ? 'Active Incidents' : 'Recent Incidents'}
                </Text>
                {filteredIncidents.slice(0, 6).map((incident, idx) => {
                  const sevColor = colors.severity[incident.severity];
                  const statusColor = STATUS_COLORS[incident.responderStatus];
                  const statusIcon = STATUS_ICONS[incident.responderStatus];
                  return (
                    <Pressable
                      key={incident.id}
                      onPress={() => router.push(`/responder/incident/${incident.id}` as never)}
                      style={({ pressed }) => [
                        $.incidentCard,
                        {
                          backgroundColor: cardBg,
                          borderColor: cardBorder,
                        },
                        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
                      ]}
                    >
                      {/* severity accent line */}
                      <View style={[$.incidentAccent, { backgroundColor: sevColor }]} />

                      <View style={$.incidentBody}>
                        <View style={$.incidentTop}>
                          <View style={[$.incidentSevDot, { backgroundColor: sevColor }]} />
                          <Text style={[$.incidentTitle, { color: textPrimary }]} numberOfLines={1}>
                            {incident.title}
                          </Text>
                        </View>
                        <View style={$.incidentMeta}>
                          <View style={[$.incidentStatusPill, { backgroundColor: statusColor + '14' }]}>
                            <Ionicons name={statusIcon} size={10} color={statusColor} />
                            <Text style={[$.incidentStatusText, { color: statusColor }]}>
                              {STATUS_LABELS[incident.responderStatus]}
                            </Text>
                          </View>
                          <View style={$.incidentMetaRight}>
                            <Ionicons name="location-outline" size={11} color={textTertiary} />
                            <Text style={[$.incidentAddr, { color: textTertiary }]} numberOfLines={1}>
                              {incident.address}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <Ionicons name="chevron-forward" size={16} color={textTertiary} />
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={$.emptyState}>
                <View style={[$.emptyIcon, { backgroundColor: isDark ? colors.dark.card : colors.slate[50] }]}>
                  <Ionicons name="checkmark-circle" size={36} color={colors.severity.low} />
                </View>
                <Text style={[$.emptyTitle, { color: textPrimary }]}>All clear</Text>
                <Text style={[$.emptySub, { color: textTertiary }]}>
                  No {activeTab === 'critical' ? 'critical' : activeTab === 'active' ? 'active' : ''} incidents right now
                </Text>
              </View>
            )}
          </Animated.View>
        </ScrollView>
      )}
    </View>
  );
}

const $ = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  /* ── hero ── */
  hero: {
    paddingBottom: 48,
    paddingHorizontal: H_PAD,
    position: 'relative',
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,1)',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  heroDate: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  heroGreeting: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.60)',
    marginTop: 2,
  },
  heroAvatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.30)',
    overflow: 'hidden',
  },
  heroAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
  },

  /* weather strip */
  weatherStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  weatherStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  weatherStripTemp: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
  },
  weatherDivider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  weatherStripDesc: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.70)',
    flex: 1,
  },
  weatherStripCity: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.50)',
    maxWidth: 100,
    textAlign: 'right',
  },

  /* wave */
  waveWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 32,
  },
  waveBack: {
    position: 'absolute',
    bottom: 0,
    left: -8,
    right: -8,
    height: 32,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
  },
  waveFront: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },

  /* ── stat chips ── */
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    gap: 8,
    marginTop: -4,
    marginBottom: 16,
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  statChipIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statChipValue: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  statChipLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  /* ── glass cards ── */
  cardRow: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    gap: CARD_GAP,
    marginBottom: CARD_GAP,
  },
  glassCard: {
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  glassCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  glassCardIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glassCardBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  liveIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  glassCardBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  glassCardBig: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -1,
  },
  glassCardLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },

  /* mini cards */
  miniCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  miniCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniCardValue: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  miniCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },

  /* ── tabs ── */
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  tabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
  },
  tabPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tabPillBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  tabPillBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },

  /* ── incident list ── */
  incidentList: {
    paddingHorizontal: H_PAD,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  incidentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  incidentAccent: {
    width: 4,
    alignSelf: 'stretch',
  },
  incidentBody: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 8,
  },
  incidentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  incidentSevDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  incidentTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  incidentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  incidentStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  incidentStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  incidentMetaRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
  },
  incidentAddr: {
    fontSize: 10,
    fontWeight: '500',
    flex: 1,
  },

  /* ── empty state ── */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  emptySub: {
    fontSize: 13,
    textAlign: 'center',
  },
});
