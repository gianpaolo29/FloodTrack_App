import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import MapView, {
  Heatmap,
  Marker,
  PROVIDER_GOOGLE,
  type MapType,
  type Region,
} from '@/components/MapView';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { SeverityChip } from '@/components/SeverityChip';
import { PrimaryButton } from '@/components/PrimaryButton';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/AuthContext';
import { getAssignedIncidents } from '@/services/api';
import type { Incident, ResponderStatus, Severity } from '@/types';
import { HeatmapLegend } from '@/components/HeatmapLegend';
import { HeatmapZoneSummary } from '@/components/HeatmapZoneSummary';
import { HeatmapTimeScrubber } from '@/components/HeatmapTimeScrubber';

const INITIAL_REGION: Region = {
  latitude: 14.0771, longitude: 120.6361,
  latitudeDelta: 0.06, longitudeDelta: 0.06,
};

const SEVERITY_WEIGHT: Record<Severity, number> = {
  low: 1, moderate: 3, high: 6, critical: 10,
};

const STATUS_LABELS: Record<ResponderStatus, string> = {
  pending:  'Pending',
  en_route: 'En route',
  on_scene: 'On scene',
  resolved: 'Resolved',
};

const STATUS_COLORS: Record<ResponderStatus, string> = {
  pending:  colors.slate[400],
  en_route: colors.brand[500],
  on_scene: colors.accent[500],
  resolved: colors.severity.low,
};

const STATUS_ICONS: Record<ResponderStatus, keyof typeof Ionicons.glyphMap> = {
  pending:  'time-outline',
  en_route: 'car-outline',
  on_scene: 'location-outline',
  resolved: 'checkmark-circle-outline',
};

type StatusFilter = 'all' | 'pending' | 'en_route' | 'on_scene';

const STATUS_FILTERS: { key: StatusFilter; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'all',      label: 'All',      icon: 'grid',             color: colors.accent[500] },
  { key: 'pending',  label: 'Pending',  icon: 'time-outline',     color: colors.slate[400] },
  { key: 'en_route', label: 'En route', icon: 'car-outline',      color: colors.brand[500] },
  { key: 'on_scene', label: 'On scene', icon: 'location-outline', color: colors.accent[500] },
];

const MAP_TYPES: { key: MapType; label: string; icon: keyof typeof Ionicons.glyphMap; desc: string }[] = [
  { key: 'standard',  label: 'Default',   icon: 'map-outline',    desc: 'Road map'           },
  { key: 'satellite', label: 'Satellite', icon: 'planet-outline', desc: 'Aerial imagery'     },
  { key: 'hybrid',    label: 'Hybrid',    icon: 'globe-outline',  desc: 'Satellite + labels' },
  { key: 'terrain',   label: 'Terrain',   icon: 'layers-outline', desc: 'Topographic'        },
];

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function fmtDist(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

function PulseRing({ color }: { color: string }) {
  const scale   = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale,   { toValue: 1.8, duration: 900, useNativeDriver: true }),
          Animated.timing(scale,   { toValue: 1,   duration: 900, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0,   duration: 900, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5, duration: 900, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);

  return (
    <Animated.View style={{
      position: 'absolute',
      width: 38, height: 38, borderRadius: 19,
      borderWidth: 2, borderColor: color,
      opacity, transform: [{ scale }],
    }} />
  );
}

function IncidentMarker({ incident }: { incident: Incident }) {
  const sevColor    = colors.severity[incident.severity];
  const isCrit      = incident.severity === 'critical';
  const statusColor = STATUS_COLORS[incident.responderStatus];

  return (
    <View style={mk.wrapper}>
      {isCrit && <PulseRing color={sevColor} />}
      <View style={[mk.circle, { backgroundColor: sevColor }]}>
        <Ionicons name="shield-checkmark" size={13} color={colors.white} />
      </View>
      <View style={[mk.statusRing, { backgroundColor: statusColor, borderColor: colors.white }]} />
    </View>
  );
}

const mk = StyleSheet.create({
  wrapper: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: colors.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 6,
  },
  statusRing: {
    position: 'absolute', bottom: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2.5,
  },
});

function MapTypeModal({
  visible, current, onSelect, onClose, isDark,
}: {
  visible: boolean;
  current: MapType;
  onSelect: (t: MapType) => void;
  onClose: () => void;
  isDark: boolean;
}) {
  const bg   = isDark ? colors.dark.elevated : colors.white;
  const bg2  = isDark ? colors.dark.card     : colors.slate[50];
  const text = isDark ? colors.white         : colors.slate[900];

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={mtm.backdrop} onPress={onClose} />
      <View style={[mtm.sheet, { backgroundColor: bg }]}>
        <View style={mtm.handle} />
        <Text style={[mtm.heading, { color: text }]}>Map type</Text>
        <View style={mtm.grid}>
          {MAP_TYPES.map(t => {
            const active = current === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => { onSelect(t.key); onClose(); }}
                style={[
                  mtm.tile,
                  { backgroundColor: active ? colors.accent[500] + '18' : bg2 },
                  active && { borderColor: colors.accent[500], borderWidth: 2 },
                  !active && { borderColor: isDark ? colors.dark.border : colors.slate[200], borderWidth: 1 },
                ]}
              >
                <View style={[mtm.tileIcon, { backgroundColor: active ? colors.accent[500] : colors.slate[200] }]}>
                  <Ionicons name={t.icon} size={22} color={active ? colors.white : colors.slate[600]} />
                </View>
                <Text style={[mtm.tileLabel, { color: active ? colors.accent[500] : text }]}>{t.label}</Text>
                <Text style={[mtm.tileDesc, { color: isDark ? colors.slate[500] : colors.slate[400] }]}>{t.desc}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const mtm = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 22, paddingBottom: 42,
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 20,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[300],
    alignSelf: 'center', marginBottom: 18,
  },
  heading:   { fontSize: 18, fontWeight: '800', marginBottom: 16, letterSpacing: -0.2 },
  grid:      { flexDirection: 'row', gap: 10 },
  tile:      { flex: 1, borderRadius: 16, padding: 12, alignItems: 'center', gap: 8 },
  tileIcon:  { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  tileDesc:  { fontSize: 10, textAlign: 'center' },
});

function IncidentSheet({
  incident, onClose, onNavigate, onViewDetail, isDark, bottomInset, distanceKm,
}: {
  incident: Incident;
  onClose: () => void;
  onNavigate: () => void;
  onViewDetail: () => void;
  isDark: boolean;
  bottomInset: number;
  distanceKm: number | null;
}) {
  const bg       = isDark ? colors.dark.elevated : colors.white;
  const textMain = isDark ? colors.white         : colors.slate[900];
  const textSub  = isDark ? colors.slate[400]    : colors.slate[500];
  const sepColor = isDark ? colors.dark.border   : colors.slate[100];
  const sevColor = colors.severity[incident.severity];
  const statusColor = STATUS_COLORS[incident.responderStatus];
  const statusIcon  = STATUS_ICONS[incident.responderStatus];

  return (
    <View style={[bs.root, { backgroundColor: bg, paddingBottom: bottomInset + 16 }]}>
      <View style={[bs.accentBar, { backgroundColor: sevColor }]} />
      <View style={bs.handle} />

      <View style={bs.header}>
        <View style={[bs.iconWrap, { backgroundColor: sevColor + '14' }]}>
          <Ionicons name="shield-checkmark" size={22} color={sevColor} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={bs.refRow}>
            <View style={[bs.refDot, { backgroundColor: sevColor }]} />
            <Text style={[bs.ref, { color: textSub }]}>{incident.reference}</Text>
          </View>
          <Text style={[bs.title, { color: textMain }]} numberOfLines={2}>
            {incident.title}
          </Text>
          <View style={bs.addressRow}>
            <Ionicons name="location" size={12} color={colors.accent[500]} />
            <Text style={[bs.address, { color: textSub }]} numberOfLines={1}>
              {incident.address}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onClose}
          style={[bs.closeBtn, { backgroundColor: isDark ? colors.dark.card : colors.slate[100] }]}
          hitSlop={8} accessibilityLabel="Close"
        >
          <Ionicons name="close" size={16} color={isDark ? colors.slate[300] : colors.slate[600]} />
        </Pressable>
      </View>

      <View style={[bs.divider, { backgroundColor: sepColor }]} />

      <View style={bs.pillRow}>
        <SeverityChip level={incident.severity} size="sm" />
        <View style={[bs.statusPill, { backgroundColor: statusColor + '14' }]}>
          <Ionicons name={statusIcon} size={11} color={statusColor} />
          <Text style={[bs.statusText, { color: statusColor }]}>
            {STATUS_LABELS[incident.responderStatus]}
          </Text>
        </View>
        {distanceKm !== null && (
          <View style={[bs.distPill, isDark && { backgroundColor: colors.dark.card }]}>
            <Ionicons name="navigate" size={10} color={colors.accent[500]} />
            <Text style={[bs.distText, { color: colors.accent[500] }]}>{fmtDist(distanceKm)}</Text>
          </View>
        )}
        {incident.nearbyCount > 1 && (
          <View style={[bs.nearbyPill, isDark && { backgroundColor: colors.severity.moderate + '14' }]}>
            <Ionicons name="warning" size={10} color={colors.severity.moderate} />
            <Text style={{ fontSize: 10, color: colors.severity.moderate, fontWeight: '700' }}>
              {incident.nearbyCount} nearby
            </Text>
          </View>
        )}
      </View>

      <View style={bs.actions}>
        <Pressable
          style={({ pressed }) => [bs.navBtn, { opacity: pressed ? 0.85 : 1 }]}
          onPress={onNavigate}
          accessibilityLabel="Navigate to incident"
        >
          <Ionicons name="navigate" size={16} color={colors.white} />
          <Text style={bs.navBtnText}>Navigate</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            label="View details"
            onPress={onViewDetail}
            variant="secondary"
            fullWidth
            size="lg"
          />
        </View>
      </View>
    </View>
  );
}

const bs = StyleSheet.create({
  root: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 18,
  },
  accentBar: { height: 4 },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[200],
    alignSelf: 'center', marginTop: 14, marginBottom: 18,
  },
  header:     { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 18, marginBottom: 16 },
  iconWrap:   { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  refRow:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  refDot:     { width: 5, height: 5, borderRadius: 2.5 },
  ref:        { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  title:      { fontSize: 16, fontWeight: '800', lineHeight: 22, letterSpacing: -0.2 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  address:    { fontSize: 12, flex: 1 },
  closeBtn:   { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  divider:    { height: StyleSheet.hairlineWidth, marginBottom: 14 },
  pillRow:    { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 18, marginBottom: 18, flexWrap: 'wrap' },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  distPill:   { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent[100], paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  distText:   { fontSize: 10, fontWeight: '700' },
  nearbyPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.severity.moderate + '18', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  actions:    { flexDirection: 'row', gap: 10, paddingHorizontal: 18 },
  navBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, backgroundColor: colors.accent[500],
    paddingHorizontal: 22, paddingVertical: 14, borderRadius: 16,
    shadowColor: colors.accent[500], shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  navBtnText: { color: colors.white, fontWeight: '800', fontSize: 14 },
});

export default function ResponderMapScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const scheme  = useColorScheme();
  const isDark  = scheme === 'dark';
  const mapRef  = useRef<MapView>(null);
  const { token } = useAuth();

  const [incidents,     setIncidents]     = useState<Incident[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [filter,        setFilter]        = useState<StatusFilter>('all');
  const [mapType,       setMapType]       = useState<MapType>('standard');
  const [selected,      setSelected]      = useState<Incident | null>(null);
  const [layersVisible, setLayersVisible] = useState(false);
  const [locating,      setLocating]      = useState(false);
  const [userLocation,  setUserLocation]  = useState<{ latitude: number; longitude: number } | null>(null);
  const [timeScrubHours, setTimeScrubHours] = useState(0);
  const [zoneSummary, setZoneSummary] = useState<{ latitude: number; longitude: number } | null>(null);
  const [heatmapVisible, setHeatmapVisible] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAssignedIncidents(token!);
      setIncidents(data);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {}
    })();
  }, []);

  const active = incidents.filter(i => i.responderStatus !== 'resolved');
  const filtered = filter === 'all'
    ? active
    : active.filter(i => i.responderStatus === filter);

  const now = Date.now();
  const timeFiltered = timeScrubHours === 0
    ? filtered
    : filtered.filter(i => {
        const reportTime = new Date(i.reportedAt).getTime();
        return (now - reportTime) <= timeScrubHours * 3600000;
      });

  const timeFilteredActive = timeScrubHours === 0
    ? active
    : active.filter(i => {
        const reportTime = new Date(i.reportedAt).getTime();
        return (now - reportTime) <= timeScrubHours * 3600000;
      });

  const heatmapPoints = timeFilteredActive.map(i => ({
    latitude: i.latitude, longitude: i.longitude,
    weight: SEVERITY_WEIGHT[i.severity],
  }));

  const severityCounts = {
    low: timeFilteredActive.filter(i => i.severity === 'low').length,
    moderate: timeFilteredActive.filter(i => i.severity === 'moderate').length,
    high: timeFilteredActive.filter(i => i.severity === 'high').length,
    critical: timeFilteredActive.filter(i => i.severity === 'critical').length,
  };

  const criticalCount = active.filter(i => i.severity === 'critical').length;

  function handleMarkerPress(incident: Incident) {
    setSelected(incident);
    mapRef.current?.animateToRegion({
      latitude:       incident.latitude - 0.008,
      longitude:      incident.longitude,
      latitudeDelta:  0.025,
      longitudeDelta: 0.025,
    }, 450);
  }

  function openNativeMaps(incident: Incident) {
    const { latitude, longitude, address } = incident;
    const encoded = encodeURIComponent(address);
    const url = Platform.select({
      ios:     `maps:?daddr=${latitude},${longitude}&q=${encoded}`,
      android: `geo:${latitude},${longitude}?q=${encoded}`,
    });
    if (url) Linking.openURL(url);
  }

  async function handleLocateMe() {
    if (locating) return;
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      mapRef.current?.animateToRegion({
        latitude: loc.coords.latitude, longitude: loc.coords.longitude,
        latitudeDelta: 0.008, longitudeDelta: 0.008,
      }, 600);
    } finally {
      setLocating(false);
    }
  }

  const cardBg = isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)';
  const ctrlBg = isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)';
  const tabClear = insets.bottom + 80;

  return (
    <View style={s.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={INITIAL_REGION}
        mapType={mapType}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={false}
        onPress={(e: any) => {
          setSelected(null);
          if (heatmapVisible && e?.nativeEvent?.coordinate) {
            const { latitude, longitude } = e.nativeEvent.coordinate;
            const nearbyCount = active.filter(i =>
              Math.abs(i.latitude - latitude) < 0.003 && Math.abs(i.longitude - longitude) < 0.003
            ).length;
            if (nearbyCount > 0) {
              setZoneSummary({ latitude, longitude });
            } else {
              setZoneSummary(null);
            }
          } else {
            setZoneSummary(null);
          }
        }}
      >
        {heatmapVisible && heatmapPoints.length > 0 && (
          <Heatmap
            points={heatmapPoints}
            radius={40}
            opacity={mapType === 'satellite' || mapType === 'hybrid' ? 0.5 : 0.65}
            gradient={{
              colors: colors.heatmap,
              startPoints: [0, 0.25, 0.5, 0.75, 1],
              colorMapSize: 256,
            }}
          />
        )}
        {timeFiltered.map(incident => (
          <Marker
            key={incident.id}
            coordinate={{ latitude: incident.latitude, longitude: incident.longitude }}
            onPress={() => handleMarkerPress(incident)}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <IncidentMarker incident={incident} />
          </Marker>
        ))}
      </MapView>

      <View style={[s.topCard, { paddingTop: insets.top + 8, backgroundColor: cardBg }]}>
        <View style={s.titleRow}>
          <View style={[s.titleBadge, { backgroundColor: colors.accent[500] + '18' }]}>
            <Ionicons name="map" size={16} color={colors.accent[500]} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTitle, isDark && { color: colors.white }]}>Tactical Map</Text>
            {!loading && (
              <Text style={[s.headerSub, isDark && { color: colors.slate[500] }]}>
                {active.length} active incident{active.length !== 1 ? 's' : ''}
              </Text>
            )}
          </View>
          {criticalCount > 0 && (
            <View style={s.critBadge}>
              <View style={s.critBadgeDot} />
              <Text style={s.critBadgeText}>{criticalCount}</Text>
            </View>
          )}
          <Pressable
            onPress={load}
            style={[s.refreshBtn, isDark && { backgroundColor: colors.dark.card }]}
            accessibilityLabel="Refresh" hitSlop={6}
          >
            {loading
              ? <ActivityIndicator size="small" color={colors.accent[500]} />
              : <Ionicons name="refresh" size={16} color={colors.accent[500]} />
            }
          </Pressable>
        </View>

        <View style={[s.chipDivider, { backgroundColor: isDark ? colors.dark.border : colors.slate[100] }]} />

        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipScroll}
        >
          {STATUS_FILTERS.map(f => {
            const isActive = filter === f.key;
            const count = f.key === 'all'
              ? active.length
              : active.filter(i => i.responderStatus === f.key).length;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[
                  s.chip,
                  isActive
                    ? { backgroundColor: f.color }
                    : {
                        backgroundColor: isDark ? colors.dark.card : colors.white,
                        borderWidth: 1,
                        borderColor: isDark ? colors.dark.border : colors.slate[200],
                      },
                ]}
              >
                <Ionicons name={f.icon} size={12} color={isActive ? colors.white : f.color} />
                <Text style={[
                  s.chipLabel,
                  { color: isActive ? colors.white : isDark ? colors.slate[300] : colors.slate[600] },
                ]}>
                  {f.label}
                </Text>
                <View style={[
                  s.chipCount,
                  { backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : f.color + '1A' },
                ]}>
                  <Text style={[
                    s.chipCountText,
                    { color: isActive ? colors.white : f.color },
                  ]}>
                    {count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {!selected && (
        <>
          <Pressable
            style={({ pressed }) => [
              s.ctrlBtn,
              { bottom: tabClear + 68, right: 12, backgroundColor: ctrlBg },
              isDark && { borderColor: colors.dark.border },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => setLayersVisible(true)}
            accessibilityLabel="Map layers"
          >
            <Ionicons
              name="layers-outline" size={22}
              color={mapType !== 'standard' ? colors.accent[500] : (isDark ? colors.slate[300] : colors.slate[700])}
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              s.ctrlBtn,
              { bottom: tabClear + 122, right: 12, backgroundColor: ctrlBg },
              isDark && { borderColor: colors.dark.border },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => setHeatmapVisible(!heatmapVisible)}
            accessibilityLabel="Toggle heatmap"
          >
            <Ionicons
              name="flame" size={20}
              color={heatmapVisible ? colors.severity.high : (isDark ? colors.slate[300] : colors.slate[700])}
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              s.ctrlBtn,
              { bottom: tabClear + 14, right: 12, backgroundColor: ctrlBg },
              isDark && { borderColor: colors.dark.border },
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleLocateMe}
            accessibilityLabel="Go to my location"
          >
            {locating
              ? <ActivityIndicator size="small" color={colors.accent[500]} />
              : <Ionicons name="locate" size={20} color={colors.accent[500]} />
            }
          </Pressable>
        </>
      )}

      {!loading && active.length === 0 && !selected && (
        <View style={[s.emptyOverlay, { bottom: tabClear + 14 }]}>
          <View style={[s.emptyCard, { backgroundColor: isDark ? colors.dark.card : colors.white }]}>
            <View style={[s.emptyIconWrap, { backgroundColor: colors.severity.low + '18' }]}>
              <Ionicons name="checkmark-circle" size={22} color={colors.severity.low} />
            </View>
            <View>
              <Text style={[s.emptyTitle, isDark && { color: colors.white }]}>All clear</Text>
              <Text style={[s.emptySub, isDark && { color: colors.slate[500] }]}>No active incidents</Text>
            </View>
          </View>
        </View>
      )}

      {criticalCount > 0 && !selected && (
        <View style={[s.critBanner, { bottom: tabClear + 14, left: 12, right: 68 }]}>
          <View style={s.critBannerIcon}>
            <Ionicons name="alert-circle" size={14} color="#fff" />
          </View>
          <Text style={s.critBannerText} numberOfLines={1}>
            {criticalCount} critical — immediate response needed
          </Text>
        </View>
      )}

      {selected && (
        <IncidentSheet
          incident={selected}
          onClose={() => setSelected(null)}
          onNavigate={() => openNativeMaps(selected)}
          onViewDetail={() => {
            setSelected(null);
            router.push(`/responder/incident/${selected.id}`);
          }}
          isDark={isDark}
          bottomInset={insets.bottom}
          distanceKm={
            userLocation
              ? haversineKm(userLocation.latitude, userLocation.longitude, selected.latitude, selected.longitude)
              : null
          }
        />
      )}

      {heatmapVisible && !selected && !zoneSummary && (
        <View style={s.legendFloat}>
          <HeatmapLegend
            mode="density"
            isDark={isDark}
            detailed
            counts={severityCounts}
          />
        </View>
      )}

      {!selected && !zoneSummary && (
        <View style={s.timeScrubber}>
          <HeatmapTimeScrubber
            value={timeScrubHours}
            onTimeChange={setTimeScrubHours}
            isDark={isDark}
            alwaysVisible
          />
        </View>
      )}

      {zoneSummary && (
        <HeatmapZoneSummary
          latitude={zoneSummary.latitude}
          longitude={zoneSummary.longitude}
          reports={active.map(i => ({
            id: i.id,
            severity: i.severity,
            hazardType: i.type,
            latitude: i.latitude,
            longitude: i.longitude,
          }))}
          radiusKm={0.2}
          onClose={() => setZoneSummary(null)}
          isDark={isDark}
          isResponder
        />
      )}

      <MapTypeModal
        visible={layersVisible}
        current={mapType}
        onSelect={setMapType}
        onClose={() => setLayersVisible(false)}
        isDark={isDark}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  topCard: {
    position: 'absolute', top: 0, left: 0, right: 0,
    borderBottomLeftRadius: 22, borderBottomRightRadius: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10, shadowRadius: 14, elevation: 10,
    overflow: 'hidden',
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  titleBadge: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.slate[900], letterSpacing: -0.3 },
  headerSub:   { fontSize: 11, color: colors.slate[400], marginTop: 1 },
  critBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.severity.critical + '12',
    borderWidth: 1, borderColor: colors.severity.critical + '35',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  critBadgeDot: {
    width: 7, height: 7, borderRadius: 3.5,
    backgroundColor: colors.severity.critical,
  },
  critBadgeText: { fontSize: 13, fontWeight: '800', color: colors.severity.critical },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 11,
    backgroundColor: colors.slate[100],
    alignItems: 'center', justifyContent: 'center',
  },

  chipDivider: { height: StyleSheet.hairlineWidth },
  chipScroll:  { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
  },
  chipLabel:     { fontSize: 12, fontWeight: '600' },
  chipCount:     { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  chipCountText: { fontSize: 10, fontWeight: '800' },

  ctrlBtn: {
    position: 'absolute',
    width: 46, height: 46, borderRadius: 16, borderWidth: 1,
    borderColor: '#E8ECF0',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },

  emptyOverlay: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  emptyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 16, borderRadius: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 10, elevation: 4,
  },
  emptyIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.slate[900] },
  emptySub:   { fontSize: 12, color: colors.slate[400] },

  critBanner: {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.severity.critical,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20,
    shadowColor: colors.severity.critical, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },
  critBannerIcon: {
    width: 26, height: 26, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  critBannerText: { flex: 1, fontSize: 12, fontWeight: '700', color: '#fff' },

  legendFloat: {
    position: 'absolute',
    bottom: 290,
    left: 12,
    zIndex: 20,
  },

  timeScrubber: {
    position: 'absolute',
    bottom: 170,
    left: 12,
    right: 68,
    zIndex: 20,
  },
});
