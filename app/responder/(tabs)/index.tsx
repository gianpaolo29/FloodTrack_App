import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
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
import * as Location from 'expo-location';

import { colors } from '@/theme/colors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getAssignedIncidents, getWeather, type WeatherData } from '@/services/api';
import type { Incident, ResponderStatus } from '@/types';

const { width: SCREEN_W } = Dimensions.get('window');
const CARD_GAP = 12;
const H_PAD = 20;
const SMALL_CARD = (SCREEN_W - H_PAD * 2 - CARD_GAP) / 2;
const BIG_CARD = SMALL_CARD;

const STATUS_LABELS: Record<ResponderStatus, string> = {
  pending: 'Pending',
  en_route: 'En Route',
  on_scene: 'On Scene',
  resolved: 'Resolved',
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

  const bg = isDark ? colors.dark.bg : colors.responder.pageBg;
  const cardBg = isDark ? colors.dark.card : colors.white;
  const cardBorder = isDark ? colors.dark.border : colors.responder.cardBorder;
  const textPrimary = isDark ? colors.white : colors.slate[900];
  const textSecondary = isDark ? colors.slate[400] : colors.slate[500];
  const textTertiary = isDark ? colors.slate[500] : colors.slate[400];

  const load = useCallback(
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

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const { latitude: lat, longitude: lon } = loc.coords;
        try {
          const w = await getWeather(lat, lon, token);
          if (w.current.description !== 'Unavailable') {
            setWeather(w);
            return;
          }
        } catch {
        }
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
              ? d.weather[0].description.charAt(0).toUpperCase() +
                d.weather[0].description.slice(1)
              : 'Unknown',
            icon: d.weather?.[0]?.icon ?? '01d',
            rainH: d.rain?.['1h'] ?? 0,
            city: d.name ?? '',
          },
          alerts: [],
          forecast: [],
        });
      } catch {
      }
    })();
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const active = incidents.filter((i) => i.responderStatus !== 'resolved');
  const pendingCount = incidents.filter((i) => i.responderStatus === 'pending').length;
  const enRouteCount = incidents.filter((i) => i.responderStatus === 'en_route').length;
  const onSceneCount = incidents.filter((i) => i.responderStatus === 'on_scene').length;
  const resolvedCount = incidents.filter((i) => i.responderStatus === 'resolved').length;
  const criticalCount = active.filter((i) => i.severity === 'critical').length;

  const weatherIcon = (() => {
    if (!weather) return 'partly-sunny' as keyof typeof Ionicons.glyphMap;
    const k = Object.keys(W_ICONS).find((w) =>
      weather.current.description.toLowerCase().includes(w),
    );
    return k ? W_ICONS[k] : ('partly-sunny' as keyof typeof Ionicons.glyphMap);
  })();

  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  const TABS: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'critical', label: 'Critical' },
    { key: 'active', label: 'Active' },
  ];

  const resolveRate =
    incidents.length > 0
      ? Math.round((resolvedCount / incidents.length) * 100)
      : 0;

  return (
    <View style={[$.root, { backgroundColor: bg, paddingTop: insets.top }]}>
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
              onRefresh={() => {
                setRefreshing(true);
                load(true);
              }}
              tintColor={colors.accent[500]}
              colors={[colors.accent[500]]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={$.greeting}>
            <View>
              <Text style={[$.greetHi, { color: textPrimary }]}>
                Hi {user?.firstName ?? 'Responder'}
              </Text>
              <Text style={[$.greetSub, { color: textSecondary }]}>
                Welcome Back
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/responder/(tabs)/profile' as never)}
              style={[$.avatarWrap, { backgroundColor: colors.accent[500] }]}
            >
              <Text style={$.avatarTxt}>
                {user
                  ? `${user.firstName[0]}${user.lastName[0]}`
                  : 'R'}
              </Text>
            </Pressable>
          </View>

          <View style={$.topRow}>
            <View
              style={[
                $.topCard,
                {
                  backgroundColor: isDark ? colors.dark.card : colors.responder.locationCardBg,
                  borderColor: cardBorder,
                  flex: 1.2,
                },
              ]}
            >
              <Text style={[$.topCardLabel, { color: isDark ? colors.slate[400] : colors.brand[700] }]}>
                My Location
              </Text>
              <Text
                style={[$.topCardCity, { color: isDark ? colors.white : colors.brand[900] }]}
                numberOfLines={1}
              >
                {weather?.current.city || 'Locating...'}
              </Text>
              <View style={$.weatherRow}>
                <Text style={[$.weatherTemp, { color: isDark ? colors.white : colors.brand[900] }]}>
                  {weather ? `${Math.round(weather.current.temperature)}°` : '--°'}
                </Text>
                <Ionicons
                  name={weatherIcon}
                  size={22}
                  color={isDark ? colors.slate[300] : colors.brand[600]}
                />
              </View>
              <View style={$.weatherDescRow}>
                <Ionicons
                  name="cloud-outline"
                  size={12}
                  color={isDark ? colors.slate[500] : colors.brand[600]}
                />
                <Text
                  style={[
                    $.weatherDesc,
                    { color: isDark ? colors.slate[400] : colors.brand[600] },
                  ]}
                >
                  {weather?.current.description ?? 'Unknown'}
                </Text>
              </View>
            </View>

            <View
              style={[
                $.topCard,
                {
                  backgroundColor: isDark ? colors.dark.card : colors.responder.resolveCardBg,
                  borderColor: cardBorder,
                  flex: 1,
                },
              ]}
            >
              <Text style={[$.topCardLabel, { color: isDark ? colors.slate[400] : colors.accent[700] }]}>
                Resolve Rate
              </Text>
              <Text
                style={[
                  $.resolveRate,
                  {
                    color:
                      resolveRate >= 50
                        ? colors.severity.low
                        : resolveRate >= 25
                        ? colors.severity.moderate
                        : colors.severity.high,
                  },
                ]}
              >
                {resolveRate > 0 ? '+' : ''}
                {resolveRate}%
              </Text>
              <Text style={[$.resolveRateSub, { color: textTertiary }]}>
                {resolvedCount} of {incidents.length} resolved
              </Text>
            </View>
          </View>

          <View style={$.tabs}>
            {TABS.map((t) => {
              const isActive = activeTab === t.key;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setActiveTab(t.key)}
                  style={$.tabItem}
                >
                  <Text
                    style={[
                      $.tabLabel,
                      {
                        color: isActive ? textPrimary : textTertiary,
                        fontWeight: isActive ? '700' : '500',
                      },
                    ]}
                  >
                    {t.label}
                  </Text>
                  {isActive && (
                    <View
                      style={[
                        $.tabIndicator,
                        { backgroundColor: colors.accent[500] },
                      ]}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>

          <View style={$.grid}>
            <View style={$.gridRow}>
              <Pressable
                onPress={() => setActiveTab('active')}
                style={({ pressed }) => [
                  $.gridCardLarge,
                  {
                    backgroundColor: isDark ? colors.dark.elevated : colors.responder.activeCardBg,
                    borderColor: cardBorder,
                  },
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
              >
                <View
                  style={[
                    $.gridIconLarge,
                    { backgroundColor: colors.brand[500] + '20' },
                  ]}
                >
                  <Ionicons
                    name="warning"
                    size={32}
                    color={colors.brand[500]}
                  />
                </View>
                <Text style={[$.gridCardTitle, { color: textPrimary }]}>
                  Active{'\n'}Incidents
                </Text>
                <Text style={[$.gridCardCount, { color: textSecondary }]}>
                  {active.length} incident{active.length !== 1 ? 's' : ''}
                </Text>
                <View style={$.gridToggleRow}>
                  <View
                    style={[
                      $.gridToggle,
                      {
                        backgroundColor:
                          active.length > 0
                            ? colors.severity.critical
                            : colors.severity.low,
                      },
                    ]}
                  >
                    <View style={$.gridToggleKnob} />
                  </View>
                  <Text
                    style={[
                      $.gridToggleLabel,
                      {
                        color:
                          active.length > 0
                            ? colors.severity.critical
                            : colors.severity.low,
                      },
                    ]}
                  >
                    {active.length > 0 ? 'Alert' : 'Clear'}
                  </Text>
                </View>
              </Pressable>

              <View style={$.gridStack}>
                <Pressable
                  onPress={() => setActiveTab('active')}
                  style={({ pressed }) => [
                    $.gridCardSmall,
                    {
                      backgroundColor: cardBg,
                      borderColor: cardBorder,
                    },
                    pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                  ]}
                >
                  <Text
                    style={[$.gridSmallTitle, { color: textPrimary }]}
                    numberOfLines={2}
                  >
                    En Route
                  </Text>
                  <Text style={[$.gridSmallSub, { color: textTertiary }]}>
                    {enRouteCount} dispatch{enRouteCount !== 1 ? 'es' : ''}
                  </Text>
                  <View style={$.gridSmallBottom}>
                    <View
                      style={[
                        $.gridIconSmall,
                        { backgroundColor: colors.brand[500] + '15' },
                      ]}
                    >
                      <Ionicons
                        name="car"
                        size={18}
                        color={colors.brand[500]}
                      />
                    </View>
                    <Text
                      style={[
                        $.gridToggleLabel,
                        {
                          color:
                            enRouteCount > 0
                              ? colors.brand[500]
                              : textTertiary,
                        },
                      ]}
                    >
                      {enRouteCount > 0 ? 'Active' : 'None'}
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={() => setActiveTab('active')}
                  style={({ pressed }) => [
                    $.gridCardSmall,
                    {
                      backgroundColor: cardBg,
                      borderColor: cardBorder,
                    },
                    pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                  ]}
                >
                  <Text
                    style={[$.gridSmallTitle, { color: textPrimary }]}
                    numberOfLines={2}
                  >
                    On Scene
                  </Text>
                  <Text style={[$.gridSmallSub, { color: textTertiary }]}>
                    {onSceneCount} responder{onSceneCount !== 1 ? 's' : ''}
                  </Text>
                  <View style={$.gridSmallBottom}>
                    <View
                      style={[
                        $.gridIconSmall,
                        { backgroundColor: colors.accent[500] + '15' },
                      ]}
                    >
                      <Ionicons
                        name="location"
                        size={18}
                        color={colors.accent[500]}
                      />
                    </View>
                    <Text
                      style={[
                        $.gridToggleLabel,
                        {
                          color:
                            onSceneCount > 0
                              ? colors.accent[500]
                              : textTertiary,
                        },
                      ]}
                    >
                      {onSceneCount > 0 ? 'Active' : 'None'}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>

            <View style={$.gridRow}>
              <Pressable
                onPress={() => setActiveTab('critical')}
                style={({ pressed }) => [
                  $.gridCardSmall,
                  {
                    backgroundColor: cardBg,
                    borderColor: cardBorder,
                    flex: 1,
                  },
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
              >
                <Text
                  style={[$.gridSmallTitle, { color: textPrimary }]}
                  numberOfLines={2}
                >
                  Pending
                </Text>
                <Text style={[$.gridSmallSub, { color: textTertiary }]}>
                  {pendingCount} awaiting
                </Text>
                <View style={$.gridSmallBottom}>
                  <View
                    style={[
                      $.gridIconSmall,
                      { backgroundColor: colors.severity.moderate + '15' },
                    ]}
                  >
                    <Ionicons
                      name="time"
                      size={18}
                      color={colors.severity.moderate}
                    />
                  </View>
                  <Text
                    style={[
                      $.gridToggleLabel,
                      {
                        color:
                          pendingCount > 0
                            ? colors.severity.moderate
                            : textTertiary,
                      },
                    ]}
                  >
                    {pendingCount > 0 ? 'Waiting' : 'None'}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setActiveTab('overview')}
                style={({ pressed }) => [
                  $.gridCardSmall,
                  {
                    backgroundColor: cardBg,
                    borderColor: cardBorder,
                    flex: 1,
                  },
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
              >
                <Text
                  style={[$.gridSmallTitle, { color: textPrimary }]}
                  numberOfLines={2}
                >
                  Resolved
                </Text>
                <Text style={[$.gridSmallSub, { color: textTertiary }]}>
                  {resolvedCount} cleared
                </Text>
                <View style={$.gridSmallBottom}>
                  <View
                    style={[
                      $.gridIconSmall,
                      { backgroundColor: colors.severity.low + '15' },
                    ]}
                  >
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={colors.severity.low}
                    />
                  </View>
                  <Text
                    style={[
                      $.gridToggleLabel,
                      {
                        color:
                          resolvedCount > 0
                            ? colors.severity.low
                            : textTertiary,
                      },
                    ]}
                  >
                    {resolvedCount > 0 ? 'Done' : 'None'}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>

          <View style={$.bottomBar}>
            <Text style={[$.dateText, { color: textSecondary }]}>
              {dateStr}
            </Text>
            <View style={$.quickActions}>
              <Pressable
                onPress={() =>
                  router.push('/responder/protocols' as never)
                }
                style={[$.quickBtn, { backgroundColor: cardBg, borderColor: cardBorder }]}
              >
                <Ionicons
                  name="book"
                  size={18}
                  color={colors.iconAccents.admin}
                />
              </Pressable>
            </View>
          </View>

          {incidents.length > 0 && (
            <View style={$.recentSection}>
              <Text style={[$.sectionTitle, { color: textPrimary }]}>
                Recent Incidents
              </Text>
              {incidents
                .filter((i) => {
                  if (activeTab === 'critical') return i.severity === 'critical';
                  if (activeTab === 'active')
                    return i.responderStatus !== 'resolved';
                  return true;
                })
                .slice(0, 5)
                .map((incident) => (
                  <Pressable
                    key={incident.id}
                    onPress={() =>
                      router.push(
                        `/responder/incident/${incident.id}` as never,
                      )
                    }
                    style={({ pressed }) => [
                      $.recentCard,
                      {
                        backgroundColor: cardBg,
                        borderColor: cardBorder,
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <View
                      style={[
                        $.recentDot,
                        {
                          backgroundColor:
                            colors.severity[incident.severity],
                        },
                      ]}
                    />
                    <View style={$.recentContent}>
                      <Text
                        style={[$.recentTitle, { color: textPrimary }]}
                        numberOfLines={1}
                      >
                        {incident.title}
                      </Text>
                      <Text
                        style={[$.recentMeta, { color: textTertiary }]}
                        numberOfLines={1}
                      >
                        {STATUS_LABELS[incident.responderStatus]} ·{' '}
                        {incident.reportedAt}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={16}
                      color={textTertiary}
                    />
                  </Pressable>
                ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const $ = StyleSheet.create({
  root: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  greeting: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    paddingTop: 16,
    paddingBottom: 8,
  },
  greetHi: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  greetSub: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white,
  },

  topRow: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    gap: CARD_GAP,
    marginTop: 16,
  },
  topCard: {
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  topCardLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  topCardCity: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  weatherTemp: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
  },
  weatherDescRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  weatherDesc: {
    fontSize: 11,
    fontWeight: '600',
  },
  resolveRate: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -1,
    marginTop: 8,
  },
  resolveRateSub: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },

  tabs: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    gap: 24,
    marginTop: 24,
    marginBottom: 4,
  },
  tabItem: {
    paddingBottom: 8,
    alignItems: 'center',
  },
  tabLabel: {
    fontSize: 15,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    height: 3,
    width: 20,
    borderRadius: 2,
  },

  grid: {
    paddingHorizontal: H_PAD,
    gap: CARD_GAP,
    marginTop: 16,
  },
  gridRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
  },
  gridCardLarge: {
    width: BIG_CARD,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    justifyContent: 'space-between',
    minHeight: BIG_CARD * 1.2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  gridIconLarge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  gridCardTitle: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  gridCardCount: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  gridToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  gridToggle: {
    width: 40,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  gridToggleKnob: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.white,
    alignSelf: 'flex-end',
  },
  gridToggleLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  gridStack: {
    flex: 1,
    gap: CARD_GAP,
  },
  gridCardSmall: {
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    justifyContent: 'space-between',
    minHeight: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  gridSmallTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  gridSmallSub: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  gridSmallBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  gridIconSmall: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
    marginTop: 24,
  },
  dateText: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'lowercase',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
  },
  quickBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },

  recentSection: {
    paddingHorizontal: H_PAD,
    marginTop: 20,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  recentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  recentContent: {
    flex: 1,
    gap: 3,
  },
  recentTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  recentMeta: {
    fontSize: 11,
    fontWeight: '500',
  },
});
