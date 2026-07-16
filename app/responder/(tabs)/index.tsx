import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
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
import { socketService } from '@/services/socket';
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

/* ─── time ago helper ─── */
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ─── stat mini-card ─── */
function StatChip({
  icon,
  label,
  value,
  gradient,
  isDark,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: number;
  gradient: [string, string];
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
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={$.statChipIcon}
      >
        <Ionicons name={icon} size={14} color="#fff" />
      </LinearGradient>
      <Text style={[$.statChipValue, { color: isDark ? colors.white : colors.slate[900] }]}>
        {value}
      </Text>
      <Text style={[$.statChipLabel, { color: isDark ? colors.slate[500] : colors.slate[400] }]}>
        {label}
      </Text>
    </View>
  );
}

/* ─── quick action button ─── */
function QuickAction({
  icon,
  label,
  gradient,
  isDark,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  gradient: [string, string];
  isDark: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        $.quickAction,
        {
          backgroundColor: isDark ? colors.dark.card : colors.white,
          borderColor: isDark ? colors.dark.border : 'rgba(0,0,0,0.04)',
        },
        pressed && { transform: [{ scale: 0.95 }], opacity: 0.85 },
      ]}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={$.quickActionIcon}
      >
        <Ionicons name={icon} size={18} color="#fff" />
      </LinearGradient>
      <Text
        style={[$.quickActionLabel, { color: isDark ? colors.slate[300] : colors.slate[700] }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/* ── weather detail tile colors ── */
const WEATHER_TILES = {
  humidity:   { icon: 'water-outline'       as const, label: 'Humidity',   lightBg: '#E8F4FD', darkBg: '#0E2A4A', color: colors.brand[500] },
  wind:       { icon: 'leaf-outline'        as const, label: 'Wind',       lightBg: '#E6F7F1', darkBg: '#1A2E3A', color: '#0FA896' },
  tempLow:    { icon: 'thermometer-outline' as const, label: 'Low',        lightBg: '#EDE9FE', darkBg: '#1E1E3A', color: '#7C3AED' },
  tempHigh:   { icon: 'thermometer-outline' as const, label: 'High',       lightBg: '#FEF3E2', darkBg: '#2A1A0A', color: '#D97706' },
  rainTotal:  { icon: 'water'              as const, label: 'Rain/h',     lightBg: '#E0F2FE', darkBg: '#0A2540', color: '#0284C7' },
  rainChance: { icon: 'umbrella-outline'   as const, label: 'Rain %',     lightBg: '#FCE7F3', darkBg: '#1A1A2E', color: '#DB2777' },
};

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
  const [weatherExpanded, setWeatherExpanded] = useState(false);

  /* animations */
  const heroAnim = useRef(new Animated.Value(0)).current;
  const cardsAnim = useRef(new Animated.Value(0)).current;
  const listAnim = useRef(new Animated.Value(0)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    socketService.on('new-notification', loadIncidents);
    return () => socketService.off('new-notification', loadIncidents);
  }, [loadIncidents]);

  /* toggle weather panel */
  function toggleWeather() {
    setWeatherExpanded(!weatherExpanded);
    Animated.spring(expandAnim, {
      toValue: weatherExpanded ? 0 : 1,
      tension: 80,
      friction: 12,
      useNativeDriver: false,
    }).start();
  }

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

  // storm detection
  const descLower = weather?.current.description.toLowerCase() ?? '';
  const hasStorm = !!descLower.match(/thunder|storm|bagyo|typhoon|cyclone/);

  // weather detail tiles
  const weatherTiles = weather ? [
    { ...WEATHER_TILES.humidity,  value: `${weather.current.humidity}%` },
    { ...WEATHER_TILES.wind,      value: `${weather.current.windSpeed} km/h` },
    ...(weather.forecast?.[0] ? [
      { ...WEATHER_TILES.tempLow,   value: `${Math.round(weather.forecast[0].tempMin)}°` },
      { ...WEATHER_TILES.tempHigh,  value: `${Math.round(weather.forecast[0].tempMax)}°` },
    ] : []),
    ...(weather.current.rainH > 0 ? [
      { ...WEATHER_TILES.rainTotal, value: `${weather.current.rainH} mm` },
    ] : []),
  ] : [];

  return (
    <View style={[$.root, { backgroundColor: bg }]}>
      {loading ? (
        <View style={$.centered}>
          <View style={{ alignItems: 'center', gap: 16 }}>
            <View style={{
              width: 64, height: 64, borderRadius: 20,
              backgroundColor: isDark ? colors.dark.card : colors.accent[500] + '10',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <ActivityIndicator size="large" color={colors.accent[500]} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: '600', color: textSecondary }}>
              Loading dashboard...
            </Text>
          </View>
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
              <View style={[$.orb, { width: 180, height: 180, top: -50, left: -40, opacity: 0.07 }]} />
              <View style={[$.orb, { width: 120, height: 120, top: 10, right: -30, opacity: 0.05 }]} />
              <View style={[$.orb, { width: 80, height: 80, bottom: 60, left: 50, opacity: 0.06 }]} />

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
                  style={({ pressed }) => [$.heroAvatar, pressed && { opacity: 0.8 }]}
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

              {/* wave transition */}
              <View style={$.waveWrap} pointerEvents="none">
                <View style={[$.waveBack, { backgroundColor: bg, opacity: 0.3 }]} />
                <View style={[$.waveFront, { backgroundColor: bg }]} />
              </View>
            </LinearGradient>
          </Animated.View>

          {/* ═══ WEATHER CARD ═══ */}
          <View style={[$.weatherCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <Pressable onPress={toggleWeather} style={[$.wStrip, { borderBottomColor: weatherExpanded ? (isDark ? colors.dark.border : colors.slate[100]) : 'transparent' }]}>
              <Ionicons name={weatherIcon} size={16} color={colors.accent[500]} />
              <Text style={[$.wTemp, { color: textPrimary }]}>
                {weather ? `${Math.round(weather.current.temperature)}°C` : '--°'}
              </Text>
              <Text style={[$.wDesc, { color: textSecondary }]} numberOfLines={1}>
                {weather?.current.description ?? 'Loading...'}
              </Text>
              {weather && weather.current.rainH > 0 && (
                <>
                  <View style={[$.wSep, { backgroundColor: isDark ? colors.dark.border : colors.slate[200] }]} />
                  <Ionicons name="water" size={11} color={colors.accent[500]} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.accent[500] }}>{weather.current.rainH} mm/h</Text>
                </>
              )}
              {hasStorm && (
                <>
                  <View style={[$.wSep, { backgroundColor: isDark ? colors.dark.border : colors.slate[200] }]} />
                  <Ionicons name="warning" size={12} color={colors.severity.critical} />
                </>
              )}
              <View style={{ flex: 1 }} />
              <Animated.View style={{
                transform: [{ rotate: expandAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
              }}>
                <Ionicons name="chevron-down" size={16} color={textSecondary} />
              </Animated.View>
            </Pressable>

            {weatherExpanded && weather && (
              <Animated.View style={[$.wPanel, { backgroundColor: isDark ? colors.dark.card : '#F8FAFC', opacity: expandAnim }]}>
                <Text style={[$.wSectionTitle, { color: textSecondary }]}>Today's Weather</Text>
                <View style={$.wTileGrid}>
                  {weatherTiles.map(tile => (
                    <View key={tile.label} style={[$.wTile, { backgroundColor: isDark ? tile.darkBg : tile.lightBg, borderColor: isDark ? colors.dark.border : colors.slate[100] }]}>
                      <View style={[$.wTileIcon, { backgroundColor: tile.color + '20' }]}>
                        <Ionicons name={tile.icon} size={15} color={tile.color} />
                      </View>
                      <Text style={[$.wTileValue, { color: textPrimary }]}>{tile.value}</Text>
                      <Text style={[$.wTileLabel, { color: textSecondary }]}>{tile.label}</Text>
                    </View>
                  ))}
                </View>

                <Text style={[$.wSectionTitle, { color: textSecondary, marginTop: 6 }]}>Weather Advisory</Text>
                {hasStorm ? (
                  <View style={[$.wAdvisory, { backgroundColor: colors.severity.critical + '10', borderColor: colors.severity.critical + '30' }]}>
                    <View style={[$.wAdvisoryIcon, { backgroundColor: colors.severity.critical + '18' }]}>
                      <Ionicons name="thunderstorm" size={18} color={colors.severity.critical} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[$.wAdvisoryTitle, { color: colors.severity.critical }]}>Severe Weather Alert</Text>
                      <Text style={[$.wAdvisoryMsg, { color: textPrimary }]}>Stay alert for flooding and hazards</Text>
                    </View>
                  </View>
                ) : (
                  <View style={[$.wAdvisory, { backgroundColor: colors.severity.low + '10', borderColor: colors.severity.low + '30' }]}>
                    <View style={[$.wAdvisoryIcon, { backgroundColor: colors.severity.low + '18' }]}>
                      <Ionicons name="shield-checkmark" size={18} color={colors.severity.low} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[$.wAdvisoryTitle, { color: colors.severity.low }]}>No Severe Weather Advisory</Text>
                      <Text style={[$.wAdvisoryMsg, { color: textSecondary }]}>Conditions are normal</Text>
                    </View>
                  </View>
                )}
              </Animated.View>
            )}
          </View>

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
            <StatChip icon="warning" label="Active" value={active.length} gradient={['#EF4444', '#F97316']} isDark={isDark} />
            <StatChip icon="car" label="En Route" value={enRouteCount} gradient={[colors.brand[500], '#6366F1']} isDark={isDark} />
            <StatChip icon="location" label="On Scene" value={onSceneCount} gradient={[colors.accent[500], '#059669']} isDark={isDark} />
            <StatChip icon="checkmark-circle" label="Done" value={resolvedCount} gradient={['#10B981', '#34D399']} isDark={isDark} />
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
                {/* progress bar */}
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

            {/* Quick Actions Row */}
            <View style={$.quickActionsRow}>
              <QuickAction
                icon="time"
                label="Pending"
                gradient={['#F59E0B', '#EA580C']}
                isDark={isDark}
                onPress={() => setActiveTab('active')}
              />
              <QuickAction
                icon="map"
                label="Map"
                gradient={[colors.accent[500], '#059669']}
                isDark={isDark}
                onPress={() => router.push('/responder/(tabs)/map' as never)}
              />
              <QuickAction
                icon="book"
                label="SOP"
                gradient={['#A855F7', '#7C3AED']}
                isDark={isDark}
                onPress={() => router.push('/responder/protocols' as never)}
              />
              <QuickAction
                icon="notifications"
                label="Alerts"
                gradient={['#EF4444', '#DC2626']}
                isDark={isDark}
                onPress={() => router.push('/responder/(tabs)/alerts' as never)}
              />
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
                    style={({ pressed }) => [
                      $.tabPill,
                      {
                        backgroundColor: isActive
                          ? colors.accent[500]
                          : (isDark ? colors.dark.card : colors.white),
                        borderColor: isActive ? 'transparent' : cardBorder,
                      },
                      pressed && !isActive && { opacity: 0.7 },
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
                <View style={$.sectionHeader}>
                  <Text style={[$.sectionTitle, { color: textPrimary }]}>
                    {activeTab === 'critical' ? 'Critical Incidents' : activeTab === 'active' ? 'Active Incidents' : 'Recent Incidents'}
                  </Text>
                  {filteredIncidents.length > 6 && (
                    <Pressable
                      onPress={() => router.push('/responder/(tabs)/map' as never)}
                      style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                    >
                      <Text style={[$.seeAllText, { color: colors.accent[500] }]}>See all</Text>
                    </Pressable>
                  )}
                </View>
                {filteredIncidents.slice(0, 6).map((incident) => {
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
                          {/* time ago */}
                          <View style={[$.timePill, { backgroundColor: isDark ? colors.dark.border : colors.slate[50] }]}>
                            <Ionicons name="time-outline" size={9} color={textTertiary} />
                            <Text style={[$.timeText, { color: textTertiary }]}>
                              {timeAgo(incident.reportedAt)}
                            </Text>
                          </View>
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

                      <Ionicons name="chevron-forward" size={16} color={textTertiary} style={{ marginRight: 12 }} />
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={$.emptyState}>
                <LinearGradient
                  colors={isDark ? ['#1E293B', '#0F172A'] : [colors.slate[50], '#E2E8F0']}
                  style={$.emptyIcon}
                >
                  <Ionicons name="checkmark-circle" size={40} color={colors.severity.low} />
                </LinearGradient>
                <Text style={[$.emptyTitle, { color: textPrimary }]}>All clear</Text>
                <Text style={[$.emptySub, { color: textTertiary }]}>
                  No {activeTab === 'critical' ? 'critical' : activeTab === 'active' ? 'active' : ''} incidents right now
                </Text>
                <Pressable
                  onPress={() => router.push('/responder/(tabs)/map' as never)}
                  style={({ pressed }) => [
                    $.emptyMapBtn,
                    { borderColor: colors.accent[500] + '40' },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name="map-outline" size={14} color={colors.accent[500]} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.accent[500] }}>
                    Open Map
                  </Text>
                </Pressable>
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
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.50)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  heroGreeting: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  heroAvatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.25)',
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

  /* weather card */
  weatherCard: {
    marginHorizontal: H_PAD,
    marginTop: -12,
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 3,
  },
  wStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  wTemp: { fontSize: 13, fontWeight: '700' },
  wDesc: { fontSize: 12, flexShrink: 1 },
  wSep: { width: StyleSheet.hairlineWidth, height: 12, marginHorizontal: 2 },
  wPanel: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14 },
  wSectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  wTileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wTile: {
    width: '30%' as any,
    flexGrow: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  wTileIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  wTileValue: { fontSize: 14, fontWeight: '800' },
  wTileLabel: { fontSize: 10, fontWeight: '600' },
  wAdvisory: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
  },
  wAdvisoryIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  wAdvisoryTitle: { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  wAdvisoryMsg: { fontSize: 12, lineHeight: 17 },

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
    gap: 5,
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
    width: 30,
    height: 30,
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
    width: 42,
    height: 42,
    borderRadius: 14,
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

  /* ── quick actions ── */
  quickActionsRow: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    gap: 10,
    marginBottom: 20,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    fontSize: 11,
    fontWeight: '700',
  },

  /* ── tabs ── */
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    gap: 8,
    marginTop: 4,
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  seeAllText: {
    fontSize: 13,
    fontWeight: '600',
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
    fontWeight: '700',
    flex: 1,
  },
  timePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  timeText: {
    fontSize: 9,
    fontWeight: '600',
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
    width: 80,
    height: 80,
    borderRadius: 24,
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
    maxWidth: 220,
  },
  emptyMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    marginTop: 8,
  },
});
