/**
 * Home tab — premium responder dashboard
 *
 * Fully scrollable · weather card · priority queue · analytics
 * Gradient header · glassmorphism · responsive layout · dark mode
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/theme/colors';
import { SeverityChip } from '@/components/SeverityChip';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getAssignedIncidents, getWeather, type WeatherData } from '@/services/api';
import type { Incident, ResponderStatus } from '@/types';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── Priority sorting ──────────────────────────────────────────────────────

const SEV_W: Record<string, number> = { critical: 4, high: 3, moderate: 2, low: 1 };
const STA_W: Record<string, number> = { pending: 0, en_route: 1, on_scene: 2, resolved: 3 };
function sortByPriority(list: Incident[]): Incident[] {
  return [...list].sort((a, b) => {
    const d = (SEV_W[b.severity] ?? 0) - (SEV_W[a.severity] ?? 0);
    return d !== 0 ? d : (STA_W[a.responderStatus] ?? 0) - (STA_W[b.responderStatus] ?? 0);
  });
}

// ─── Constants ──────────────────────────────────────────────────────────────

const LABELS: Record<ResponderStatus, string> = { pending: 'Not started', en_route: 'En route', on_scene: 'On scene', resolved: 'Resolved' };
const SCOLORS: Record<ResponderStatus, string> = { pending: colors.slate[400], en_route: colors.brand[500], on_scene: colors.accent[500], resolved: colors.severity.low };
const SICONS: Record<ResponderStatus, keyof typeof Ionicons.glyphMap> = { pending: 'time-outline', en_route: 'car-outline', on_scene: 'location-outline', resolved: 'checkmark-circle-outline' };

type FilterKey = 'all' | 'pending' | 'en_route' | 'on_scene' | 'resolved';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'pending', label: 'Pending' },
  { key: 'en_route', label: 'En route' }, { key: 'on_scene', label: 'On scene' },
  { key: 'resolved', label: 'Resolved' },
];

const W_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  clear: 'sunny', clouds: 'cloudy', rain: 'rainy', drizzle: 'rainy',
  thunderstorm: 'thunderstorm', snow: 'snow', mist: 'water', fog: 'water', haze: 'water',
};

// ─── Animated pulse ─────────────────────────────────────────────────────────

function CriticalPulse() {
  const sc = useRef(new Animated.Value(1)).current;
  const op = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    Animated.loop(Animated.parallel([
      Animated.sequence([Animated.timing(sc, { toValue: 1.6, duration: 800, useNativeDriver: true }), Animated.timing(sc, { toValue: 1, duration: 800, useNativeDriver: true })]),
      Animated.sequence([Animated.timing(op, { toValue: 0, duration: 800, useNativeDriver: true }), Animated.timing(op, { toValue: 0.6, duration: 800, useNativeDriver: true })]),
    ])).start();
  }, [sc, op]);
  return <Animated.View style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: colors.severity.critical, opacity: op, transform: [{ scale: sc }] }} />;
}

// ─── Stat tile ──────────────────────────────────────────────────────────────

function StatTile({ value, label, icon, color, isDark }: { value: number; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; isDark: boolean }) {
  return (
    <View style={[$.stat, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}>
      <View style={[$.statIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <Text style={[$.statVal, isDark && { color: colors.white }]}>{value}</Text>
      <Text style={[$.statLbl, isDark && { color: colors.slate[500] }]}>{label}</Text>
    </View>
  );
}

// ─── Weather card ───────────────────────────────────────────────────────────

function WeatherCard({ weather, isDark }: { weather: WeatherData | null; isDark: boolean }) {
  if (!weather) return null;
  const { current, alerts, forecast } = weather;
  const k = Object.keys(W_ICONS).find(w => current.description.toLowerCase().includes(w));
  const wIcon: keyof typeof Ionicons.glyphMap = k ? W_ICONS[k] : 'partly-sunny';
  const hasAlerts = alerts.length > 0;
  const grad = hasAlerts
    ? (isDark ? ['#2D1010', '#1A0808'] : ['#FEF2F2', '#FECACA']) as [string, string]
    : (isDark ? [colors.dark.card, colors.dark.elevated] : ['#EFF6FF', '#DBEAFE']) as [string, string];

  return (
    <View style={[$.wCard, isDark && { borderColor: hasAlerts ? colors.severity.critical + '30' : colors.dark.border }]}>
      <LinearGradient colors={grad} style={$.wGrad} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={$.wMain}>
          <View style={$.wLeft}>
            <View style={[$.wIconWrap, { backgroundColor: (hasAlerts ? colors.severity.critical : colors.brand[500]) + '15' }]}>
              <Ionicons name={hasAlerts ? 'thunderstorm' : wIcon} size={24} color={hasAlerts ? colors.severity.critical : colors.brand[500]} />
            </View>
            <View>
              <Text style={[$.wTemp, isDark && { color: colors.white }]}>{Math.round(current.temperature)}°C</Text>
              <Text style={[$.wDesc, isDark && { color: colors.slate[400] }]}>{current.description}</Text>
              {current.city ? <Text style={[$.wCity, isDark && { color: colors.slate[500] }]}>{current.city}</Text> : null}
            </View>
          </View>
          <View style={$.wRight}>
            <View style={$.wMeta}><Ionicons name="water" size={11} color={isDark ? colors.slate[400] : colors.slate[500]} /><Text style={[$.wMetaTxt, isDark && { color: colors.slate[400] }]}>{current.humidity}%</Text></View>
            <View style={$.wMeta}><Ionicons name="speedometer-outline" size={11} color={isDark ? colors.slate[400] : colors.slate[500]} /><Text style={[$.wMetaTxt, isDark && { color: colors.slate[400] }]}>{current.windSpeed} km/h</Text></View>
            {current.rainH > 0 && <View style={$.wMeta}><Ionicons name="rainy" size={11} color={colors.brand[500]} /><Text style={[$.wMetaTxt, { color: colors.brand[500], fontWeight: '700' }]}>{current.rainH} mm/h</Text></View>}
          </View>
        </View>
        {hasAlerts && (
          <View style={$.wAlerts}>
            {alerts.slice(0, 2).map((a, i) => {
              const c = a.type === 'critical' ? colors.severity.critical : colors.severity.moderate;
              return (
                <View key={i} style={[$.wAlertPill, { backgroundColor: c + '15' }]}>
                  <Ionicons name="warning" size={10} color={c} />
                  <Text style={[$.wAlertTxt, { color: c }]} numberOfLines={1}>{a.title}</Text>
                </View>
              );
            })}
          </View>
        )}
        {forecast.length > 0 && (
          <View style={[$.wForecast, isDark && { borderTopColor: colors.dark.border }]}>
            {forecast.slice(0, 4).map((f, i) => (
              <View key={i} style={$.wFDay}>
                <Text style={[$.wFDayLbl, isDark && { color: colors.slate[500] }]}>{f.day}</Text>
                <Ionicons name={f.rainTotal > 5 ? 'rainy' : 'partly-sunny'} size={14} color={isDark ? colors.slate[400] : colors.slate[500]} />
                <Text style={[$.wFTemp, isDark && { color: colors.slate[300] }]}>{Math.round(f.tempMax)}°</Text>
                {f.pop > 40 && <Text style={$.wFRain}>{f.pop}%</Text>}
              </View>
            ))}
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

// ─── Incident card ──────────────────────────────────────────────────────────

function IncidentCard({ incident, onPress, isDark }: { incident: Incident; onPress: () => void; isDark: boolean }) {
  const sc = SCOLORS[incident.responderStatus];
  const si = SICONS[incident.responderStatus];
  const crit = incident.severity === 'critical';
  const sev = colors.severity[incident.severity];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [$.card, { backgroundColor: isDark ? colors.dark.card : colors.white }, crit && { borderWidth: 1, borderColor: colors.severity.critical + '30' }, pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] }]} accessibilityRole="button">
      <View style={[$.cardAccent, { backgroundColor: sev }]} />
      <View style={$.cardBody}>
        <View style={$.cardTop}>
          <View style={$.cardRefWrap}><View style={[$.cardRefDot, { backgroundColor: sev }]} /><Text style={[$.cardRef, isDark && { color: colors.slate[500] }]}>{incident.reference}</Text></View>
          {incident.distance ? <View style={[$.distPill, isDark && { backgroundColor: colors.dark.elevated }]}><Ionicons name="navigate" size={10} color={colors.accent[500]} /><Text style={{ fontSize: 10, fontWeight: '700', color: colors.accent[500] }}>{incident.distance}</Text></View> : null}
        </View>
        <Text style={[$.cardTitle, isDark && { color: colors.white }]} numberOfLines={2}>{incident.title}</Text>
        <View style={$.cardAddr}><Ionicons name="location" size={12} color={isDark ? colors.slate[500] : colors.slate[400]} /><Text style={[$.cardAddrTxt, isDark && { color: colors.slate[500] }]} numberOfLines={1}>{incident.address}</Text></View>
        <View style={$.cardChips}>
          <SeverityChip level={incident.severity} size="sm" />
          {incident.nearbyCount > 1 && <View style={[$.nearbyPill, isDark && { backgroundColor: colors.severity.moderate + '14' }]}><Ionicons name="warning" size={10} color={colors.severity.moderate} /><Text style={{ fontSize: 10, color: colors.severity.moderate, fontWeight: '700' }}>{incident.nearbyCount} nearby</Text></View>}
        </View>
        <View style={[$.cardFoot, isDark && { borderTopColor: colors.dark.border }]}>
          <View style={[$.statusPill, { backgroundColor: sc + '14' }]}><Ionicons name={si} size={12} color={sc} /><Text style={{ fontSize: 11, fontWeight: '700', color: sc }}>{LABELS[incident.responderStatus]}</Text></View>
          <View style={$.timeRow}><Ionicons name="time-outline" size={11} color={isDark ? colors.slate[600] : colors.slate[400]} /><Text style={[$.timeTxt, isDark && { color: colors.slate[600] }]}>{incident.reportedAt}</Text></View>
        </View>
      </View>
      {crit && <View style={$.critInd}><CriticalPulse /><View style={$.critDot} /></View>}
    </Pressable>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function HomeTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const { token, user } = useAuth();

  const [incidents, setIncidents]       = useState<Incident[]>([]);
  const [weather, setWeather]           = useState<WeatherData | null>(null);
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  const screenBg = isDark ? colors.dark.bg : '#F4F6F9';
  const headerBg = isDark ? colors.dark.surface : colors.accent[700];

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (!isRefresh) setLoading(true);
      setError(null);
      const data = await getAssignedIncidents(token!);
      setIncidents(data);
    } catch { setError('Could not load incidents. Pull down to retry.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude: lat, longitude: lon } = loc.coords;
        try {
          const w = await getWeather(lat, lon, token!);
          if (w.current.description !== 'Unavailable') { setWeather(w); return; }
        } catch { /* backend failed */ }
        const KEY = '492a0ca6810997c64038621e373ae0de';
        const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${KEY}&units=metric`);
        if (!res.ok) return;
        const d = await res.json();
        let fc: WeatherData['forecast'] = [];
        try {
          const fr = await fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${KEY}&units=metric`);
          if (fr.ok) {
            const fd = await fr.json();
            const g: Record<string, any[]> = {};
            for (const it of fd.list ?? []) { const dt = new Date(it.dt * 1000); const day = dt.toLocaleDateString('en-US', { weekday: 'short' }); const date = dt.toISOString().slice(0, 10); if (!g[date]) g[date] = []; g[date].push({ ...it, day }); }
            fc = Object.entries(g).slice(0, 4).map(([date, items]) => { const ts = items.map((i: any) => i.main.temp); const rain = items.reduce((s: number, i: any) => s + (i.rain?.['3h'] ?? 0), 0); const pop = Math.max(...items.map((i: any) => Math.round((i.pop ?? 0) * 100))); const mid = items[Math.floor(items.length / 2)]; return { date, day: items[0].day, tempMin: Math.round(Math.min(...ts)), tempMax: Math.round(Math.max(...ts)), rainTotal: Math.round(rain * 10) / 10, pop, description: mid.weather?.[0]?.description ?? '', icon: mid.weather?.[0]?.icon ?? '01d' }; });
          }
        } catch { /* forecast optional */ }
        setWeather({ current: { temperature: d.main?.temp ?? 0, humidity: d.main?.humidity ?? 0, windSpeed: Math.round((d.wind?.speed ?? 0) * 3.6 * 10) / 10, description: d.weather?.[0]?.description ? d.weather[0].description.charAt(0).toUpperCase() + d.weather[0].description.slice(1) : 'Unknown', icon: d.weather?.[0]?.icon ?? '01d', rainH: d.rain?.['1h'] ?? 0, city: d.name ?? '' }, alerts: [], forecast: fc });
      } catch { /* non-critical */ }
    })();
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const active = incidents.filter(i => i.responderStatus !== 'resolved');
  const resolved = incidents.filter(i => i.responderStatus === 'resolved');
  const filtered = sortByPriority(activeFilter === 'all' ? incidents : incidents.filter(i => i.responderStatus === activeFilter));
  const topPriority = sortByPriority(active)[0] ?? null;
  const pendingCount = incidents.filter(i => i.responderStatus === 'pending').length;
  const enRouteCount = incidents.filter(i => i.responderStatus === 'en_route').length;
  const onSceneCount = incidents.filter(i => i.responderStatus === 'on_scene').length;
  const criticalCount = active.filter(i => i.severity === 'critical').length;

  return (
    <View style={[$.root, { backgroundColor: screenBg }]}>
      {/* ── Fixed header ── */}
      <View style={[$.header, { paddingTop: insets.top + 10, backgroundColor: headerBg }]}>
        <View style={$.hTop}>
          <View style={$.hLeft}>
            <View style={$.hAvatarWrap}>
              <View style={$.hAvatar}><Text style={$.hAvatarTxt}>{user ? `${user.firstName[0]}${user.lastName[0]}` : 'R'}</Text></View>
              <View style={$.hDot} />
            </View>
            <View>
              <Text style={$.hGreet}>Welcome back,</Text>
              <Text style={$.hName}>{user?.firstName ?? 'Responder'}</Text>
            </View>
          </View>
          <View style={[$.hBadge, { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.25)' }]}>
            <Ionicons name="shield-checkmark" size={11} color="rgba(255,255,255,0.9)" />
            <Text style={$.hBadgeTxt}>Responder</Text>
          </View>
        </View>
        <Text style={$.hSummary}>{loading ? 'Loading...' : `${active.length} active · ${criticalCount} critical`}</Text>
        <View style={[$.hCurve, { backgroundColor: screenBg }]} />
      </View>

      {/* ── Everything in one scroll ── */}
      {loading ? (
        <View style={$.centered}><ActivityIndicator size="large" color={colors.accent[500]} /></View>
      ) : error ? (
        <View style={$.centered}>
          <View style={[$.errIcon, isDark && { backgroundColor: colors.dark.card }]}><Ionicons name="cloud-offline-outline" size={36} color={colors.slate[400]} /></View>
          <Text style={[$.errTitle, isDark && { color: colors.white }]}>Connection issue</Text>
          <Text style={[$.errBody, isDark && { color: colors.slate[400] }]}>{error}</Text>
          <Pressable onPress={() => load()} style={$.retryBtn}><Ionicons name="refresh" size={15} color={colors.white} /><Text style={$.retryTxt}>Try again</Text></Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={colors.accent[500]} colors={[colors.accent[500]]} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Stats */}
          <View style={$.statsRow}>
            <StatTile value={pendingCount} label="Pending" icon="time-outline" color={colors.slate[400]} isDark={isDark} />
            <StatTile value={enRouteCount} label="En route" icon="car-outline" color={colors.brand[500]} isDark={isDark} />
            <StatTile value={onSceneCount} label="On scene" icon="location-outline" color={colors.accent[500]} isDark={isDark} />
            <StatTile value={resolved.length} label="Resolved" icon="checkmark-circle" color={colors.severity.low} isDark={isDark} />
          </View>

          {/* Weather */}
          <WeatherCard weather={weather} isDark={isDark} />

          {/* Analytics */}
          <View style={[$.anaRow, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }]}>
            <View style={$.anaItem}>
              <View style={[$.anaIcon, { backgroundColor: colors.severity.low + '15' }]}><Ionicons name="checkmark-done" size={14} color={colors.severity.low} /></View>
              <View><Text style={[$.anaVal, isDark && { color: colors.white }]}>{resolved.length}</Text><Text style={[$.anaLbl, isDark && { color: colors.slate[500] }]}>Resolved</Text></View>
            </View>
            <View style={$.anaDiv} />
            <View style={$.anaItem}>
              <View style={[$.anaIcon, { backgroundColor: colors.severity.critical + '15' }]}><Ionicons name="alert-circle" size={14} color={colors.severity.critical} /></View>
              <View><Text style={[$.anaVal, isDark && { color: colors.white }]}>{criticalCount}</Text><Text style={[$.anaLbl, isDark && { color: colors.slate[500] }]}>Critical</Text></View>
            </View>
            <View style={$.anaDiv} />
            <View style={$.anaItem}>
              <View style={[$.anaIcon, { backgroundColor: colors.accent[500] + '15' }]}><Ionicons name="pulse" size={14} color={colors.accent[500]} /></View>
              <View><Text style={[$.anaVal, isDark && { color: colors.white }]}>{active.length}</Text><Text style={[$.anaLbl, isDark && { color: colors.slate[500] }]}>Active</Text></View>
            </View>
          </View>

          {/* Quick access */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={$.qaScroll} style={{ marginTop: 12 }}>
            {([
              { route: '/responder/quick-report', icon: 'add-circle' as const, label: 'Quick Report', color: colors.accent[500] },
              { route: '/responder/protocols', icon: 'book' as const, label: 'Protocols', color: '#8B5CF6' },
              { route: '/responder/contacts', icon: 'call' as const, label: 'Contacts', color: colors.severity.critical },
            ] as const).map(item => (
              <Pressable key={item.route} onPress={() => router.push(item.route as never)}
                style={({ pressed }) => [$.qaBtn, isDark && { backgroundColor: colors.dark.card, borderColor: colors.dark.border }, pressed && { transform: [{ scale: 0.95 }], opacity: 0.8 }]}>
                <View style={[$.qaIcon, { backgroundColor: item.color + '15' }]}><Ionicons name={item.icon} size={17} color={item.color} /></View>
                <Text style={[$.qaTxt, isDark && { color: colors.slate[300] }]}>{item.label}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {/* Filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={$.fScroll} style={{ marginTop: 14 }}>
            {FILTERS.map(f => {
              const act = activeFilter === f.key;
              const cnt = f.key === 'all' ? incidents.length : incidents.filter(i => i.responderStatus === f.key).length;
              return (
                <Pressable key={f.key} onPress={() => setActiveFilter(f.key)}
                  style={[$.fChip, act ? { backgroundColor: colors.accent[500] } : { backgroundColor: isDark ? colors.dark.card : colors.white, borderWidth: 1, borderColor: isDark ? colors.dark.border : colors.slate[200] }]}>
                  <Text style={[$.fLabel, { color: act ? colors.white : isDark ? colors.slate[300] : colors.slate[600] }]}>{f.label}</Text>
                  <View style={[$.fCount, { backgroundColor: act ? 'rgba(255,255,255,0.25)' : isDark ? colors.dark.elevated : colors.slate[100] }]}>
                    <Text style={[$.fCountTxt, { color: act ? colors.white : isDark ? colors.slate[400] : colors.slate[500] }]}>{cnt}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Incident list content */}
          <View style={$.listWrap}>
            {/* Critical banner */}
            {criticalCount > 0 && activeFilter !== 'resolved' && (
              <View style={[$.critBanner, isDark && { backgroundColor: colors.severity.critical + '15', borderColor: colors.severity.critical + '40' }]}>
                <View style={$.critBannerIcon}><Ionicons name="alert-circle" size={16} color={colors.white} /></View>
                <View style={{ flex: 1 }}><Text style={$.critBannerTitle}>Immediate response required</Text><Text style={$.critBannerSub}>{criticalCount} critical incident{criticalCount !== 1 ? 's' : ''}</Text></View>
              </View>
            )}

            {/* Next incident */}
            {topPriority && activeFilter !== 'resolved' && (
              <Pressable onPress={() => router.push(`/responder/incident/${topPriority.id}`)}
                style={({ pressed }) => [$.nextBtn, isDark && { backgroundColor: colors.accent[700] }, pressed && { opacity: 0.88, transform: [{ scale: 0.985 }] }]}>
                <View style={$.nextLeft}>
                  <View style={$.nextIconWrap}><Ionicons name="flash" size={18} color={colors.white} /></View>
                  <View style={{ flex: 1 }}><Text style={$.nextLbl}>NEXT INCIDENT</Text><Text style={$.nextTitle} numberOfLines={1}>{topPriority.title}</Text></View>
                </View>
                <Ionicons name="arrow-forward-circle" size={26} color="rgba(255,255,255,0.8)" />
              </Pressable>
            )}

            {/* Cards */}
            {filtered.length > 0 ? (
              <View style={{ gap: 10 }}>
                {filtered.map(i => <IncidentCard key={i.id} incident={i} isDark={isDark} onPress={() => router.push(`/responder/incident/${i.id}`)} />)}
              </View>
            ) : (
              <View style={$.empty}>
                <View style={[$.emptyIcon, isDark && { backgroundColor: colors.dark.card }]}><Ionicons name="checkmark-circle-outline" size={40} color={colors.severity.low} /></View>
                <Text style={[$.emptyTitle, isDark && { color: colors.white }]}>{activeFilter === 'all' ? 'All clear' : 'No incidents'}</Text>
                <Text style={[$.emptySub, isDark && { color: colors.slate[400] }]}>{activeFilter === 'all' ? 'No incidents assigned to you.' : `No ${activeFilter.replace('_', ' ')} incidents.`}</Text>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const $ = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },

  // Header (fixed)
  header: { paddingHorizontal: 20, paddingBottom: 36, position: 'relative', zIndex: 10 },
  hTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  hLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hAvatarWrap: { position: 'relative' },
  hAvatar: { width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)' },
  hAvatarTxt: { fontSize: 16, fontWeight: '800', color: colors.white },
  hDot: { position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.severity.low, borderWidth: 2.5, borderColor: colors.accent[700] },
  hGreet: { fontSize: 12, color: 'rgba(255,255,255,0.55)' },
  hName: { fontSize: 20, fontWeight: '800', color: colors.white, letterSpacing: -0.3 },
  hBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  hBadgeTxt: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },
  hSummary: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 },
  hCurve: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 22, borderTopLeftRadius: 22, borderTopRightRadius: 22 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginTop: -6 },
  stat: { flex: 1, backgroundColor: colors.white, borderRadius: 14, padding: 10, alignItems: 'center', gap: 3, borderWidth: 1, borderColor: colors.slate[100], shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  statIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statVal: { fontSize: 17, fontWeight: '800', color: colors.slate[900] },
  statLbl: { fontSize: 8, fontWeight: '700', color: colors.slate[400], textTransform: 'uppercase', letterSpacing: 0.4 },

  // Weather
  wCard: { marginHorizontal: 16, marginTop: 12, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: colors.slate[100], shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  wGrad: { padding: 16, gap: 12 },
  wMain: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  wIconWrap: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  wTemp: { fontSize: 26, fontWeight: '800', color: colors.slate[900], letterSpacing: -0.5 },
  wDesc: { fontSize: 12, color: colors.slate[500], fontWeight: '500', marginTop: 1 },
  wCity: { fontSize: 10, color: colors.slate[400], fontWeight: '600', marginTop: 1 },
  wRight: { gap: 4, alignItems: 'flex-end' },
  wMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wMetaTxt: { fontSize: 11, fontWeight: '600', color: colors.slate[500] },
  wAlerts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  wAlertPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  wAlertTxt: { fontSize: 10, fontWeight: '700' },
  wForecast: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1, borderTopColor: colors.slate[100], paddingTop: 10 },
  wFDay: { alignItems: 'center', gap: 3 },
  wFDayLbl: { fontSize: 10, fontWeight: '700', color: colors.slate[400], textTransform: 'uppercase' },
  wFTemp: { fontSize: 12, fontWeight: '700', color: colors.slate[700] },
  wFRain: { fontSize: 9, fontWeight: '700', color: colors.brand[500] },

  // Analytics
  anaRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 12, backgroundColor: colors.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.slate[100], shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
  anaItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  anaIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  anaVal: { fontSize: 16, fontWeight: '800', color: colors.slate[900] },
  anaLbl: { fontSize: 9, fontWeight: '700', color: colors.slate[400], textTransform: 'uppercase', marginTop: 1 },
  anaDiv: { width: 1, height: 24, backgroundColor: colors.slate[200], marginHorizontal: 4 },

  // Quick access
  qaScroll: { paddingHorizontal: 16, gap: 10 },
  qaBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: colors.slate[100], shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3 },
  qaIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  qaTxt: { fontSize: 12, fontWeight: '700', color: colors.slate[600] },

  // Filters
  fScroll: { paddingHorizontal: 16, gap: 8 },
  fChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  fLabel: { fontSize: 13, fontWeight: '600' },
  fCount: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  fCountTxt: { fontSize: 10, fontWeight: '700' },

  // List
  listWrap: { padding: 16, gap: 12 },

  // Critical banner
  critBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.severity.critical + '0E', borderWidth: 1, borderColor: colors.severity.critical + '30', borderRadius: 18, padding: 14 },
  critBannerIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.severity.critical, alignItems: 'center', justifyContent: 'center' },
  critBannerTitle: { fontSize: 14, fontWeight: '700', color: colors.severity.critical },
  critBannerSub: { fontSize: 12, color: colors.severity.critical, opacity: 0.75, marginTop: 1 },

  // Next
  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.accent[500], borderRadius: 16, padding: 16, shadowColor: colors.accent[700], shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 5 },
  nextLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  nextIconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  nextLbl: { fontSize: 9, fontWeight: '800', color: 'rgba(255,255,255,0.65)', letterSpacing: 1 },
  nextTitle: { fontSize: 14, fontWeight: '700', color: colors.white, marginTop: 2 },

  // Card
  card: { flexDirection: 'row', borderRadius: 18, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 3 },
  cardAccent: { width: 4 },
  cardBody: { flex: 1, padding: 16, gap: 10 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardRefWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardRefDot: { width: 6, height: 6, borderRadius: 3 },
  cardRef: { fontSize: 11, color: colors.slate[400], fontWeight: '600', letterSpacing: 0.3 },
  distPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent[100], paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.slate[900], lineHeight: 21 },
  cardAddr: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardAddrTxt: { fontSize: 12, color: colors.slate[500], flex: 1 },
  cardChips: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  nearbyPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.severity.moderate + '18', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  cardFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.slate[100], paddingTop: 10 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timeTxt: { fontSize: 11, color: colors.slate[400] },
  critInd: { position: 'absolute', top: 14, right: 14, width: 10, height: 10, alignItems: 'center', justifyContent: 'center' },
  critDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.severity.critical },

  // Error
  errIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: colors.slate[100], alignItems: 'center', justifyContent: 'center' },
  errTitle: { fontSize: 17, fontWeight: '700', color: colors.slate[900] },
  errBody: { fontSize: 13, color: colors.slate[500], textAlign: 'center', lineHeight: 20 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accent[500], paddingHorizontal: 20, paddingVertical: 11, borderRadius: 12, marginTop: 4 },
  retryTxt: { color: colors.white, fontWeight: '700', fontSize: 14 },

  // Empty
  empty: { alignItems: 'center', gap: 16, paddingTop: 40 },
  emptyIcon: { width: 88, height: 88, borderRadius: 28, backgroundColor: colors.slate[100], alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: colors.slate[900] },
  emptySub: { fontSize: 14, color: colors.slate[400], textAlign: 'center', lineHeight: 22 },
});
