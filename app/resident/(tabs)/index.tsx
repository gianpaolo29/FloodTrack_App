/**
 * Map screen — Google Maps-style UI
 *
 * Features:
 *   • MapView with Standard / Satellite / Hybrid / Terrain type switcher
 *   • Hazard-type filter chips (Flood, Slippery, Landslide, Fallen Tree, Blocked Road)
 *   • Severity-colored custom markers with animated pulse ring on critical
 *   • Heatmap overlay (Google Maps only)
 *   • Right-side control panel: layers, locate, compass
 *   • Google Maps-style bottom sheet on marker tap
 *   • Active reports summary bar above tab
 */
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
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
} from 'react-native-maps';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/colors';
import { SeverityChip, type Severity } from '@/components/SeverityChip';
import { StatusBadge, type ReportStatus } from '@/components/StatusBadge';
import { useColorScheme } from '@/hooks/use-color-scheme';

// ─── Types ────────────────────────────────────────────────────────────────────

type HazardType = 'all' | 'flood' | 'slippery' | 'landslide' | 'fallen_tree' | 'blocked_road' | 'debris';

interface Report {
  id: string;
  title: string;
  hazardType: HazardType;
  severity: Severity;
  status: ReportStatus;
  address: string;
  reportedAt: string;
  latitude: number;
  longitude: number;
}

// ─── Hazard definitions ───────────────────────────────────────────────────────

const HAZARD_META: Record<Exclude<HazardType, 'all'>, {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}> = {
  flood:        { label: 'Flood',        icon: 'water',         color: '#1F6FBF' },
  slippery:     { label: 'Slippery',     icon: 'warning',       color: '#F59E0B' },
  landslide:    { label: 'Landslide',    icon: 'earth',         color: '#EA6A0C' },
  fallen_tree:  { label: 'Fallen Tree',  icon: 'leaf',          color: '#2E9E5B' },
  blocked_road: { label: 'Blocked Road', icon: 'stop-circle',   color: '#D32F2F' },
  debris:       { label: 'Debris',       icon: 'trash',         color: '#9AA6B2' },
};

const HAZARD_FILTERS: { key: HazardType; label: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { key: 'all',          label: 'All',          icon: 'grid',          color: colors.brand[500] },
  { key: 'flood',        label: 'Flood',        icon: 'water',         color: '#1F6FBF' },
  { key: 'slippery',     label: 'Slippery',     icon: 'warning',       color: '#F59E0B' },
  { key: 'landslide',    label: 'Landslide',    icon: 'earth',         color: '#EA6A0C' },
  { key: 'fallen_tree',  label: 'Fallen Tree',  icon: 'leaf',          color: '#2E9E5B' },
  { key: 'blocked_road', label: 'Blocked Road', icon: 'stop-circle',   color: '#D32F2F' },
  { key: 'debris',       label: 'Debris',       icon: 'trash',         color: '#9AA6B2' },
];

// ─── Map type definitions ─────────────────────────────────────────────────────

const MAP_TYPES: { key: MapType; label: string; icon: keyof typeof Ionicons.glyphMap; desc: string }[] = [
  { key: 'standard',  label: 'Default',   icon: 'map-outline',   desc: 'Road map'           },
  { key: 'satellite', label: 'Satellite', icon: 'planet-outline', desc: 'Aerial imagery'    },
  { key: 'hybrid',    label: 'Hybrid',    icon: 'globe-outline',  desc: 'Satellite + labels' },
  { key: 'terrain',   label: 'Terrain',   icon: 'layers-outline', desc: 'Topographic'       },
];

// ─── Severity weights ─────────────────────────────────────────────────────────

const SEVERITY_WEIGHT: Record<Severity, number> = {
  low: 1, moderate: 3, high: 6, critical: 10,
};

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_REPORTS: Report[] = [
  {
    id: '001',
    title: 'Flooded road near bridge',
    hazardType: 'flood',
    severity: 'critical',
    status: 'assigned',
    address: 'Brgy. Reparo, Nasugbu',
    reportedAt: '12 min ago',
    latitude: 13.6298, longitude: 120.6231,
  },
  {
    id: '002',
    title: 'Slippery highway section',
    hazardType: 'slippery',
    severity: 'high',
    status: 'verified',
    address: 'Maharlika Hi-way, Nasugbu',
    reportedAt: '38 min ago',
    latitude: 13.6340, longitude: 120.6260,
  },
  {
    id: '003',
    title: 'Fallen tree blocking road',
    hazardType: 'fallen_tree',
    severity: 'moderate',
    status: 'pending',
    address: 'Brgy. Bucana, Nasugbu',
    reportedAt: '1 hr ago',
    latitude: 13.6280, longitude: 120.6190,
  },
  {
    id: '004',
    title: 'Clogged drainage / debris',
    hazardType: 'debris',
    severity: 'low',
    status: 'resolved',
    address: 'P. Guanzon St., Nasugbu',
    reportedAt: '3 hrs ago',
    latitude: 13.6220, longitude: 120.6230,
  },
  {
    id: '005',
    title: 'Landslide on mountain road',
    hazardType: 'landslide',
    severity: 'critical',
    status: 'assigned',
    address: 'Brgy. Mataas na Lupa, Nasugbu',
    reportedAt: '5 hrs ago',
    latitude: 13.6380, longitude: 120.6170,
  },
  {
    id: '006',
    title: 'Road blocked by collapsed wall',
    hazardType: 'blocked_road',
    severity: 'high',
    status: 'verified',
    address: 'Brgy. Luyahan, Nasugbu',
    reportedAt: '6 hrs ago',
    latitude: 13.6260, longitude: 120.6310,
  },
];

const INITIAL_REGION: Region = {
  latitude: 13.6298, longitude: 120.6231,
  latitudeDelta: 0.06, longitudeDelta: 0.06,
};

// ─── Custom marker ────────────────────────────────────────────────────────────

function HazardMarker({ report }: { report: Report }) {
  const pinColor = colors.severity[report.severity];
  const hazardColor = report.hazardType !== 'all'
    ? HAZARD_META[report.hazardType].color
    : colors.brand[500];
  const isCritical = report.severity === 'critical';
  const iconName = report.hazardType !== 'all'
    ? HAZARD_META[report.hazardType].icon
    : 'alert-circle';

  return (
    <View style={mk.wrapper}>
      {isCritical && (
        <View style={[mk.pulseRing, { borderColor: pinColor }]} />
      )}
      <View style={[mk.pin, { backgroundColor: hazardColor, borderColor: colors.white }]}>
        <Ionicons name={iconName as keyof typeof Ionicons.glyphMap} size={13} color={colors.white} />
      </View>
      <View style={[mk.tail, { borderTopColor: hazardColor }]} />
    </View>
  );
}

const mk = StyleSheet.create({
  wrapper:    { alignItems: 'center', width: 44, height: 52 },
  pulseRing: {
    position: 'absolute',
    top: 0, width: 44, height: 44,
    borderRadius: 22, borderWidth: 2, opacity: 0.4,
  },
  pin: {
    width: 36, height: 36, borderRadius: 18,
    borderWidth: 2.5, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 5,
  },
  tail: {
    width: 0, height: 0,
    borderLeftWidth: 5, borderRightWidth: 5, borderTopWidth: 8,
    borderLeftColor: 'transparent', borderRightColor: 'transparent',
    marginTop: -1,
  },
});

// ─── Map Type Selector modal ──────────────────────────────────────────────────

function MapTypeModal({
  visible,
  current,
  onSelect,
  onClose,
  isDark,
}: {
  visible: boolean;
  current: MapType;
  onSelect: (t: MapType) => void;
  onClose: () => void;
  isDark: boolean;
}) {
  const bg    = isDark ? colors.slate[900] : colors.white;
  const bg2   = isDark ? '#0D1117'         : colors.slate[50];
  const text  = isDark ? colors.white      : colors.slate[900];
  const text2 = isDark ? colors.slate[400] : colors.slate[500];

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
                  { backgroundColor: active ? colors.brand[500] + '18' : bg2 },
                  active && { borderColor: colors.brand[500], borderWidth: 2 },
                  !active && { borderColor: isDark ? colors.slate[800] : colors.slate[200], borderWidth: 1 },
                ]}
              >
                <View style={[mtm.tileIcon, { backgroundColor: active ? colors.brand[500] : colors.slate[200] }]}>
                  <Ionicons
                    name={t.icon}
                    size={22}
                    color={active ? colors.white : colors.slate[600]}
                  />
                </View>
                <Text style={[mtm.tileLabel, { color: active ? colors.brand[500] : text }]}>{t.label}</Text>
                <Text style={[mtm.tileDesc, { color: text2 }]}>{t.desc}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

const mtm = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 16, elevation: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[300],
    alignSelf: 'center', marginBottom: 16,
  },
  heading: { fontSize: 17, fontWeight: '700', marginBottom: 16, letterSpacing: -0.2 },
  grid:    { flexDirection: 'row', gap: 10 },
  tile:    { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 8 },
  tileIcon: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  tileLabel: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  tileDesc:  { fontSize: 10, textAlign: 'center' },
});

// ─── Report bottom sheet ──────────────────────────────────────────────────────

function ReportSheet({
  report,
  onClose,
  onViewDetail,
  isDark,
  bottomInset,
}: {
  report: Report;
  onClose: () => void;
  onViewDetail: (id: string) => void;
  isDark: boolean;
  bottomInset: number;
}) {
  const bg         = isDark ? colors.slate[900] : colors.white;
  const textMain   = isDark ? colors.white      : colors.slate[900];
  const textSub    = isDark ? colors.slate[400] : colors.slate[500];
  const sepColor   = isDark ? colors.slate[800] : colors.slate[100];
  const pinColor   = colors.severity[report.severity];
  const hazardMeta = report.hazardType !== 'all' ? HAZARD_META[report.hazardType] : null;

  return (
    <View style={[bs.sheet, { backgroundColor: bg, paddingBottom: bottomInset + 16 }]}>
      {/* Accent bar */}
      <View style={[bs.accentBar, { backgroundColor: pinColor }]} />

      <View style={bs.handle} />

      {/* Header */}
      <View style={bs.header}>
        {/* Hazard icon */}
        <View style={[bs.hazardIcon, { backgroundColor: (hazardMeta?.color ?? colors.brand[500]) + '1A' }]}>
          <Ionicons
            name={hazardMeta?.icon ?? 'alert-circle'}
            size={22}
            color={hazardMeta?.color ?? colors.brand[500]}
          />
        </View>

        <View style={{ flex: 1, gap: 3 }}>
          {/* Hazard type label */}
          {hazardMeta && (
            <Text style={[bs.hazardLabel, { color: hazardMeta.color }]}>
              {hazardMeta.label.toUpperCase()}
            </Text>
          )}
          <Text style={[bs.title, { color: textMain }]} numberOfLines={2}>
            {report.title}
          </Text>
          <View style={bs.addressRow}>
            <Ionicons name="location-sharp" size={12} color={colors.brand[500]} />
            <Text style={[bs.address, { color: textSub }]} numberOfLines={1}>
              {report.address}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={onClose}
          style={[bs.closeBtn, { backgroundColor: isDark ? colors.slate[800] : colors.slate[100] }]}
          hitSlop={8}
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={16} color={isDark ? colors.slate[300] : colors.slate[600]} />
        </Pressable>
      </View>

      {/* Divider */}
      <View style={[bs.divider, { backgroundColor: sepColor }]} />

      {/* Status row */}
      <View style={bs.statusRow}>
        <SeverityChip level={report.severity} />
        <StatusBadge status={report.status} />
        <View style={bs.timePill}>
          <Ionicons name="time-outline" size={11} color={colors.slate[400]} />
          <Text style={[bs.timeText, { color: textSub }]}>{report.reportedAt}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={bs.actions}>
        <Pressable
          style={({ pressed }) => [bs.primaryBtn, { backgroundColor: colors.brand[500], opacity: pressed ? 0.88 : 1 }]}
          onPress={() => { onClose(); onViewDetail(report.id); }}
        >
          <Ionicons name="document-text-outline" size={15} color={colors.white} />
          <Text style={bs.primaryBtnText}>View full report</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [bs.secondaryBtn, {
            backgroundColor: isDark ? colors.slate[800] : colors.slate[100],
            opacity: pressed ? 0.7 : 1,
          }]}
          onPress={onClose}
        >
          <Ionicons name="map-outline" size={15} color={isDark ? colors.slate[300] : colors.slate[600]} />
        </Pressable>
      </View>
    </View>
  );
}

const bs = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 16,
  },
  accentBar: { height: 4 },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: colors.slate[200],
    alignSelf: 'center', marginTop: 12, marginBottom: 16,
  },
  header:      { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, marginBottom: 14 },
  hazardIcon:  { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  hazardLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  title:       { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  addressRow:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  address:     { fontSize: 12, flex: 1 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  divider:    { height: StyleSheet.hairlineWidth, marginBottom: 12 },
  statusRow:  { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 16, marginBottom: 16, flexWrap: 'wrap' },
  timePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.slate[100], paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20,
  },
  timeText:  { fontSize: 11, fontWeight: '500' },
  actions:   { flexDirection: 'row', gap: 10, paddingHorizontal: 16 },
  primaryBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 13, borderRadius: 14,
  },
  primaryBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },
  secondaryBtn: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
});

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const scheme  = useColorScheme();
  const isDark  = scheme === 'dark';
  const mapRef  = useRef<MapView>(null);

  const [filter,        setFilter]        = useState<HazardType>('all');
  const [mapType,       setMapType]       = useState<MapType>('standard');
  const [selected,      setSelected]      = useState<Report | null>(null);
  const [layersVisible, setLayersVisible] = useState(false);
  const [locating,      setLocating]      = useState(false);

  const filtered = filter === 'all'
    ? MOCK_REPORTS
    : MOCK_REPORTS.filter(r => r.hazardType === filter);

  const heatmapPoints = MOCK_REPORTS.map(r => ({
    latitude: r.latitude, longitude: r.longitude,
    weight: SEVERITY_WEIGHT[r.severity],
  }));

  function handleMarkerPress(report: Report) {
    setSelected(report);
    mapRef.current?.animateToRegion({
      latitude: report.latitude - 0.01,
      longitude: report.longitude,
      latitudeDelta: 0.03, longitudeDelta: 0.03,
    }, 450);
  }

  async function handleLocateMe() {
    if (locating) return;
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      mapRef.current?.animateToRegion({
        latitude:       loc.coords.latitude,
        longitude:      loc.coords.longitude,
        latitudeDelta:  0.008,
        longitudeDelta: 0.008,
      }, 600);
    } finally {
      setLocating(false);
    }
  }

  const cardBg   = isDark ? 'rgba(13,17,23,0.97)'    : '#FFFFFF';
  const ctrlBg   = isDark ? 'rgba(13,17,23,0.95)'    : '#FFFFFF';
  const textMain = isDark ? colors.white              : colors.slate[900];
  const textSub  = isDark ? colors.slate[400]         : colors.slate[500];
  const tabClear = insets.bottom + 80;

  return (
    <View style={s.root}>
      {/* ── Map ── */}
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
        onPress={() => selected && setSelected(null)}
      >
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

        {filtered.map(report => (
          <Marker
            key={report.id}
            coordinate={{ latitude: report.latitude, longitude: report.longitude }}
            onPress={() => handleMarkerPress(report)}
            tracksViewChanges={false}
          >
            <HazardMarker report={report} />
          </Marker>
        ))}
      </MapView>

      {/* ── Top header (solid card, chips fully contained) ── */}
      <View
        style={[s.topCard, { paddingTop: insets.top + 8, backgroundColor: cardBg }]}
      >
        {/* Search bar row */}
        <View style={s.searchRow}>
          <View style={[
            s.searchBar,
            isDark && { backgroundColor: colors.slate[800], borderColor: colors.slate[700] },
          ]}>
            <Ionicons name="search" size={16} color={colors.slate[400]} />
            <Text style={[s.searchPlaceholder, { color: textSub }]}>
              Search hazards in Nasugbu...
            </Text>
          </View>

          {/* Active count badge */}
          <View style={[s.countBadge, {
            backgroundColor: colors.severity.critical + '15',
            borderColor:     colors.severity.critical + '40',
          }]}>
            <View style={[s.countDot, { backgroundColor: colors.severity.critical }]} />
            <Text style={[s.countNum, { color: colors.severity.critical }]}>{filtered.length}</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={[s.chipDivider, { backgroundColor: isDark ? colors.slate[800] : colors.slate[100] }]} />

        {/* Hazard filter chips — contained inside card background */}
        <View style={[s.chipRow, { backgroundColor: cardBg }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chipScroll}
          >
            {HAZARD_FILTERS.map(f => {
              const active = filter === f.key;
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setFilter(f.key)}
                  style={[
                    s.chip,
                    active
                      ? { backgroundColor: f.color, borderColor: f.color }
                      : {
                          backgroundColor: isDark ? colors.slate[800] : colors.slate[100],
                          borderColor:     isDark ? colors.slate[700] : colors.slate[200],
                        },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter ${f.label}`}
                >
                  <Ionicons
                    name={f.icon}
                    size={13}
                    color={active ? colors.white : f.color}
                  />
                  <Text style={[
                    s.chipLabel,
                    { color: active ? colors.white : isDark ? colors.slate[300] : colors.slate[700] },
                    active && { fontWeight: '700' },
                  ]}>
                    {f.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Legend strip (inside the card, below chips) ── */}
        <View style={[s.legendDivider, { backgroundColor: isDark ? colors.slate[800] : colors.slate[100] }]} />
        <View style={[s.legendRow, { backgroundColor: cardBg }]}>
          <Text style={[s.legendTitle, { color: textSub }]}>LEGEND</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.legendScroll}
          >
            {Object.entries(HAZARD_META).map(([key, meta]) => (
              <View key={key} style={s.legendPill}>
                <Ionicons name={meta.icon} size={12} color={meta.color} />
                <Text style={[s.legendLabel, { color: isDark ? colors.slate[300] : colors.slate[600] }]}>
                  {meta.label}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* ── Right-side controls — stacked above each other (Google Maps style) ── */}
      {!selected && (
        <>
          {/* Layers button — top of stack */}
          <Pressable
            style={({ pressed }) => [
              s.ctrlBtn,
              { bottom: tabClear + 68, right: 12, backgroundColor: ctrlBg },
              isDark && { borderColor: colors.slate[800] },
              pressed && { opacity: 0.8 },
            ]}
            onPress={() => setLayersVisible(true)}
            accessibilityLabel="Map layers"
          >
            <Ionicons
              name="layers-outline"
              size={22}
              color={mapType !== 'standard' ? colors.brand[500] : (isDark ? colors.slate[300] : colors.slate[700])}
            />
          </Pressable>

          {/* Locate me — below layers */}
          <Pressable
            style={({ pressed }) => [
              s.ctrlBtn,
              { bottom: tabClear + 14, right: 12, backgroundColor: ctrlBg },
              isDark && { borderColor: colors.slate[800] },
              pressed && { opacity: 0.8 },
            ]}
            onPress={handleLocateMe}
            accessibilityLabel="Go to my location"
          >
            {locating
              ? <ActivityIndicator size="small" color={colors.brand[500]} />
              : <Ionicons name="locate" size={20} color={colors.brand[500]} />
            }
          </Pressable>
        </>
      )}

      {/* Legend is now inside the top card — no standalone bottom legend */}


      {/* ── Bottom sheet ── */}
      {selected && (
        <ReportSheet
          report={selected}
          onClose={() => setSelected(null)}
          onViewDetail={id => router.push(`/resident/report/${id}`)}
          isDark={isDark}
          bottomInset={insets.bottom}
        />
      )}

      {/* ── Map type modal ── */}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },

  // ── Top card ──
  topCard: {
    position: 'absolute', top: 0, left: 0, right: 0,
    // No paddingBottom here — chipRow handles its own padding
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 14, elevation: 10,
    // Clip children so nothing bleeds outside
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingBottom: 10,
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.slate[50],
    borderWidth: 1, borderColor: colors.slate[200],
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchPlaceholder: { fontSize: 14, flex: 1 },
  countBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
  },
  countDot: { width: 6, height: 6, borderRadius: 3 },
  countNum: { fontSize: 13, fontWeight: '800' },

  // Divider between search and chips
  chipDivider: { height: StyleSheet.hairlineWidth },

  // Chip row — explicit background so it's clearly part of the card
  chipRow: { paddingBottom: 12 },
  chipScroll: { paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  chipLabel: { fontSize: 12, fontWeight: '500' },

  // ── Individual control buttons (Google Maps style) ──
  ctrlBtn: {
    position: 'absolute',
    width: 46, height: 46,
    borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },

  // ── Legend strip (inside top card) ──
  legendDivider: { height: StyleSheet.hairlineWidth },
  legendRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
  },
  legendTitle: {
    fontSize: 9, fontWeight: '800', letterSpacing: 0.8,
    textTransform: 'uppercase', flexShrink: 0,
  },
  legendScroll: { gap: 12, paddingRight: 4 },
  legendPill:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendLabel: { fontSize: 11, fontWeight: '500' },

});
